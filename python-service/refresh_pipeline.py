"""GFCEIP real-data refresh pipeline.

Fetch World Bank indicators -> preprocess -> feature engineer -> score with
trained XGBoost model -> write real predictions + alerts to Supabase.

Run:   python python-service/refresh_pipeline.py
Flags: --retrain   first re-trains the model on freshest data
"""
from __future__ import annotations

import argparse
import json
import os
import pickle
import subprocess
import sys
import time
from datetime import datetime
from pathlib import Path

import numpy as np
import pandas as pd

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))

from train_model import (  # noqa: E402
    ARTIFACTS,
    COUNTRIES,
    INDICATORS,
    fetch_data,
    prepare_dataset,
    run_training,
)
from countries_catalog import CATALOG as _CATALOG  # noqa: E402

ISO3_TO_ISO2 = {iso3: iso2 for (iso2, iso3, *_rest) in _CATALOG}

SUPABASE_URL = os.environ.get("SUPABASE_URL", "").rstrip("/")
SUPABASE_KEY = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "")


def sb_request(method: str, path: str, body=None, prefer: str = ""):
    """Direct REST call to Supabase using service role key (bypasses RLS)."""
    import urllib.request, urllib.error
    url = f"{SUPABASE_URL}/rest/v1/{path}"
    headers = {
        "apikey": SUPABASE_KEY,
        "Authorization": f"Bearer {SUPABASE_KEY}",
        "Content-Type": "application/json",
    }
    if prefer:
        headers["Prefer"] = prefer
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(url, data=data, headers=headers, method=method)
    try:
        with urllib.request.urlopen(req, timeout=120) as r:
            return r.read().decode()
    except urllib.error.HTTPError as e:
        raise RuntimeError(f"{method} {path} -> {e.code}: {e.read().decode()[:500]}")



def psql_stdin(sql: str) -> str:
    res = subprocess.run(
        ["psql", "-v", "ON_ERROR_STOP=1"],
        input=sql, capture_output=True, text=True, check=False,
    )
    if res.returncode != 0:
        raise RuntimeError(f"psql failed: {res.stderr}\nSQL head: {sql[:300]}")
    return res.stdout


def sql_str(v) -> str:
    if v is None or (isinstance(v, float) and (np.isnan(v) or np.isinf(v))):
        return "NULL"
    if isinstance(v, (int, np.integer)):
        return str(int(v))
    if isinstance(v, (float, np.floating)):
        return f"{float(v):.6f}"
    return "'" + str(v).replace("'", "''") + "'"


def gfss_category(score: float) -> str:
    if score >= 75: return "strong"
    if score >= 60: return "stable"
    if score >= 45: return "vulnerable"
    if score >= 30: return "weak"
    return "critical"


def risk_level(p: float) -> str:
    if p >= 0.75: return "CRITICAL"
    if p >= 0.50: return "HIGH"
    if p >= 0.25: return "MODERATE"
    return "LOW"


def clamp01(v: float) -> float:
    return max(0.0, min(1.0, float(v)))


def indicator_stress(row: pd.Series) -> tuple[float, list[dict]]:
    inflation = clamp01((float(row.get("cpi_inflation", 0.0)) - 5.0) / 25.0)
    debt = clamp01((float(row.get("govt_debt_pct_gdp", 0.0)) - 50.0) / 50.0)
    current_account = clamp01(((-float(row.get("current_account_pct_gdp", 0.0))) - 2.0) / 8.0)
    growth = clamp01((2.0 - float(row.get("gdp_growth", 0.0))) / 7.0)
    unemployment = clamp01((float(row.get("unemployment", 0.0)) - 6.0) / 12.0)
    reserves_yoy = clamp01(((-float(row.get("reserves_yoy", 0.0))) - 5.0) / 35.0)

    weighted = [
        ("cpi_inflation", inflation, 0.25, float(row.get("cpi_inflation", 0.0))),
        ("govt_debt_pct_gdp", debt, 0.20, float(row.get("govt_debt_pct_gdp", 0.0))),
        ("current_account_pct_gdp", current_account, 0.15, float(row.get("current_account_pct_gdp", 0.0))),
        ("gdp_growth", growth, 0.20, float(row.get("gdp_growth", 0.0))),
        ("unemployment", unemployment, 0.10, float(row.get("unemployment", 0.0))),
        ("reserves_yoy", reserves_yoy, 0.10, float(row.get("reserves_yoy", 0.0))),
    ]
    score = sum(level * weight for _, level, weight, _ in weighted)
    drivers = [
        {
            "feature": feature,
            "contribution": round(level * weight, 4),
            "value": round(value, 4),
        }
        for feature, level, weight, value in sorted(weighted, key=lambda item: item[1] * item[2], reverse=True)
        if (level * weight) > 0
    ]
    return score, drivers


def write_eda(feat: pd.DataFrame, raw: pd.DataFrame) -> dict:
    eda = {
        "generated_at": datetime.utcnow().isoformat() + "Z",
        "n_rows_raw": int(len(raw)),
        "n_rows_features": int(len(feat)),
        "n_countries": int(feat["iso3"].nunique()),
        "year_min": int(feat["year"].min()),
        "year_max": int(feat["year"].max()),
        "crisis_rate": float(feat["crisis_label"].mean()),
        "rows_per_country": {
            "min": int(feat.groupby("iso3").size().min()),
            "median": int(feat.groupby("iso3").size().median()),
            "max": int(feat.groupby("iso3").size().max()),
        },
        "indicator_missingness": {
            col: float(raw[raw["indicator"] == col].isna().mean().mean())
            for col in INDICATORS.values()
        },
        "indicator_describe": {
            col: {k: float(v) for k, v in feat[col].describe().to_dict().items()
                  if k in ("mean", "std", "min", "50%", "max")}
            for col in INDICATORS.values()
        },
    }
    (ARTIFACTS / "eda.json").write_text(json.dumps(eda, indent=2))
    return eda


def detect_alerts(latest: pd.DataFrame) -> list[dict]:
    """Threshold-based alerts on the freshest row per country."""
    rules = [
        ("cpi_inflation",        lambda v: v >= 25,  "critical", "Hyperinflation risk", "CPI inflation at {v:.1f}% (threshold 25%)"),
        ("cpi_inflation",        lambda v: 15 <= v < 25, "warning", "High inflation", "CPI inflation elevated at {v:.1f}%"),
        ("govt_debt_pct_gdp",    lambda v: v >= 90,  "critical", "Sovereign debt stress", "Debt/GDP at {v:.1f}% (threshold 90%)"),
        ("govt_debt_pct_gdp",    lambda v: 70 <= v < 90, "warning", "Rising debt burden", "Debt/GDP at {v:.1f}%"),
        ("current_account_pct_gdp", lambda v: v <= -8, "critical", "External imbalance", "Current account at {v:.1f}% of GDP"),
        ("current_account_pct_gdp", lambda v: -8 < v <= -5, "warning", "Widening deficit", "Current account at {v:.1f}% of GDP"),
        ("gdp_growth",           lambda v: v <= -3,  "critical", "Recession", "GDP growth {v:.1f}%"),
        ("gdp_growth",           lambda v: -3 < v <= 0, "warning", "Stagnation", "GDP growth {v:.1f}%"),
        ("unemployment",         lambda v: v >= 15,  "warning", "Elevated unemployment", "Unemployment at {v:.1f}%"),
    ]
    out = []
    for _, row in latest.iterrows():
        for indicator, cond, sev, title, msg in rules:
            v = row.get(indicator)
            if v is None or pd.isna(v):
                continue
            try:
                if cond(float(v)):
                    out.append({
                        "country_iso": ISO3_TO_ISO2.get(row["iso3"], row["iso3"]),
                        "severity": sev,
                        "title": title,
                        "message": msg.format(v=float(v)),
                        "indicator_code": indicator,
                    })
                    break  # one alert per country per indicator type (highest severity)
            except Exception:
                continue
    return out


def upsert_db(feat: pd.DataFrame, feature_cols: list[str], model, model_version: str,
              importances: np.ndarray) -> dict:
    # latest year per country
    latest = feat.sort_values(["iso3", "year"]).groupby("iso3").tail(1).reset_index(drop=True)
    prev = feat.sort_values(["iso3", "year"]).groupby("iso3").nth(-2).reset_index(drop=True)

    X = latest[feature_cols].astype(float).to_numpy()
    probs = model.predict_proba(X)[:, 1]
    latest["crisis_prob"] = probs
    latest["score"] = np.round((1 - probs) * 100).astype(int)
    latest["score"] = latest["score"].clip(1, 99)

    if len(prev) > 0:
        Xp = prev[feature_cols].astype(float).to_numpy()
        probs_prev = model.predict_proba(Xp)[:, 1]
        prev_score = np.round((1 - probs_prev) * 100).astype(int).clip(1, 99)
        prev_map = dict(zip(prev["iso3"], prev_score))
    else:
        prev_map = {}

    # which country ISO codes are actually in our countries table?
    res = sb_request("GET", "countries?select=iso_code")
    existing_iso = {r["iso_code"] for r in json.loads(res)}

    gfss_rows, risk_rows, alert_rows = [], [], []

    for _, r in latest.iterrows():
        iso3 = r["iso3"]
        iso = ISO3_TO_ISO2.get(iso3, iso3)
        if iso not in existing_iso:
            continue
        model_prob = float(r["crisis_prob"])
        stress_score, stress_drivers = indicator_stress(r)
        composite_prob = clamp01((0.25 * model_prob) + (0.75 * stress_score))
        score = int(np.clip(np.round((1 - composite_prob) * 100), 1, 99))

        prev_score = int(prev_map.get(iso, score))
        if iso3 in prev_map:
            prev_row = prev[prev["iso3"] == iso3]
            if not prev_row.empty:
                prev_model_prob = float(model.predict_proba(prev_row[feature_cols].astype(float).to_numpy())[0, 1])
                prev_stress, _ = indicator_stress(prev_row.iloc[0])
                prev_score = int(np.clip(np.round((1 - clamp01((0.25 * prev_model_prob) + (0.75 * prev_stress))) * 100), 1, 99))

        trend = score - prev_score
        gfss_rows.append({
            "country_iso": iso, "score": score,
            "category": gfss_category(score), "trend_30d": trend,
        })

        ci = max(0.05, min(0.15, composite_prob * 0.2))
        risk_rows.append({
            "country_iso": iso, "crisis_type": "currency_crisis",
            "horizon_months": 12, "probability": round(composite_prob, 6),
            "risk_level": risk_level(composite_prob),
            "ci_lower": round(max(0.0, composite_prob - ci), 6),
            "ci_upper": round(min(1.0, composite_prob + ci), 6),
            "top_drivers": stress_drivers[:5], "model_version": f"{model_version}-macro-composite",
        })

    raw_alerts = detect_alerts(latest)
    alert_rows = [a for a in raw_alerts if a["country_iso"] in existing_iso]

    # --- WRITE TO DB via Supabase REST (service role bypasses RLS) ----------
    # gfss_scores: full replace via upsert on PK (country_iso)
    print(f"   -> upserting {len(gfss_rows)} gfss_scores rows...")
    for i in range(0, len(gfss_rows), 100):
        sb_request("POST", "gfss_scores", body=gfss_rows[i:i+100],
                   prefer="resolution=merge-duplicates,return=minimal")

    # risk_scores: delete all then bulk insert
    print(f"   -> replacing {len(risk_rows)} risk_scores rows...")
    sb_request("DELETE", "risk_scores?country_iso=neq.__none__", prefer="return=minimal")
    for i in range(0, len(risk_rows), 50):
        sb_request("POST", "risk_scores", body=risk_rows[i:i+50], prefer="return=minimal")

    # alerts: drop indicator-driven rows then insert fresh
    print(f"   -> replacing {len(alert_rows)} machine-generated alerts...")
    sb_request("DELETE", "alerts?indicator_code=not.is.null", prefer="return=minimal")
    if alert_rows:
        for i in range(0, len(alert_rows), 100):
            sb_request("POST", "alerts", body=alert_rows[i:i+100], prefer="return=minimal")

    print("   -> wrote real data to Supabase")

    return {
        "countries_scored": len(gfss_rows),
        "risk_rows": len(risk_rows),
        "alerts_triggered": len(alert_rows),
    }


def run(retrain: bool = False) -> dict:
    t0 = time.time()
    if retrain:
        print("[1/5] Re-training model on freshest WB data...")
        run_training()
    print("[2/5] Loading model...")
    with (ARTIFACTS / "model.pkl").open("rb") as f:
        bundle = pickle.load(f)
    model = bundle["model"]
    feature_cols = bundle["feature_cols"]
    model_version = bundle.get("model_version", "xgb-prod")
    importances = np.asarray(bundle.get("feature_importances", [0.0] * len(feature_cols)))

    print("[3/5] Fetching fresh World Bank data (206 countries × 8 indicators × 26 years)...")
    raw = fetch_data()
    print(f"   -> {len(raw):,} raw observations")

    print("[4/5] Preprocessing + feature engineering...")
    feat, fcols_train = prepare_dataset(raw)
    # align: keep only features the model knows about
    missing = [c for c in feature_cols if c not in feat.columns]
    for c in missing:
        feat[c] = 0.0
    write_eda(feat, raw)
    print(f"   -> {len(feat):,} country-year rows, {feat['iso3'].nunique()} countries")

    print("[5/5] Scoring all countries + writing to Supabase...")
    summary = upsert_db(feat, feature_cols, model, model_version, importances)

    elapsed = round(time.time() - t0, 1)
    out = {
        "status": "ok",
        "model_version": model_version,
        "elapsed_seconds": elapsed,
        "year_max": int(feat["year"].max()),
        **summary,
    }
    print(json.dumps(out, indent=2))
    return out


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--retrain", action="store_true", help="Re-train model first")
    args = ap.parse_args()
    run(retrain=args.retrain)
