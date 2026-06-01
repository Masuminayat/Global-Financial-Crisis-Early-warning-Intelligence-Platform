"""GFCEIP ML inference API.

Loads the XGBoost model trained in `notebooks/gfceip_ml.ipynb` and serves
crisis-probability predictions to the Lovable frontend.
"""
from __future__ import annotations
import json
import pickle
from pathlib import Path
from typing import Optional

import numpy as np
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

ARTIFACTS = Path(__file__).parent / "artifacts"

app = FastAPI(
    title="GFCEIP ML Service",
    version="1.0.0",
    description="Crisis early-warning predictions powered by XGBoost.",
)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# ---- model loader ----------------------------------------------------------
_MODEL = None
_FEATURES: list[str] = []
_METRICS: dict = {}

def _load():
    global _MODEL, _FEATURES, _METRICS
    mpath = ARTIFACTS / "model.pkl"
    if not mpath.exists():
        return
    with mpath.open("rb") as f:
        bundle = pickle.load(f)
    _MODEL = bundle["model"]
    _FEATURES = bundle["feature_cols"]
    if (ARTIFACTS / "metrics.json").exists():
        _METRICS = json.loads((ARTIFACTS / "metrics.json").read_text())

_load()

# ---- schemas ---------------------------------------------------------------
class Indicators(BaseModel):
    cpi_inflation: float = Field(..., description="Annual CPI inflation %")
    reserves_usd: float = Field(..., description="Total reserves USD")
    current_account_pct_gdp: float
    govt_debt_pct_gdp: float
    gdp_growth: float
    unemployment: float
    real_interest_rate: float
    exports_pct_gdp: float
    iso3: Optional[str] = None
    region: Optional[str] = Field(None, description="EAS, EUR, SAS, LAC, MEA, SSA, ECA, NAC")

class PredictResponse(BaseModel):
    crisis_probability: float
    risk_level: str
    model_version: str
    top_drivers: list[dict]

class BatchRequest(BaseModel):
    items: list[Indicators]

# ---- helpers ---------------------------------------------------------------
REGIONS = ["EAS", "ECA", "EUR", "LAC", "MEA", "NAC", "SAS", "SSA"]

def _vectorize(ind: Indicators) -> np.ndarray:
    """Map an Indicators payload to the feature vector the model expects.
    Missing engineered/rolling features (notebook-only) are filled with 0 — the
    API is intended for what-if simulation, not strict re-scoring."""
    base = {
        "cpi_inflation": ind.cpi_inflation,
        "reserves_usd": ind.reserves_usd,
        "current_account_pct_gdp": ind.current_account_pct_gdp,
        "govt_debt_pct_gdp": ind.govt_debt_pct_gdp,
        "gdp_growth": ind.gdp_growth,
        "unemployment": ind.unemployment,
        "real_interest_rate": ind.real_interest_rate,
        "exports_pct_gdp": ind.exports_pct_gdp,
    }
    for c in list(base):
        base[f"{c}_ma3"] = base[c]
        base[f"{c}_std3"] = 0.0
        base[f"{c}_d1"] = 0.0
    for r in REGIONS:
        base[f"reg_{r}"] = 1.0 if ind.region == r else 0.0
    return np.array([[base.get(f, 0.0) for f in _FEATURES]], dtype=float)

def _risk_level(p: float) -> str:
    if p >= 0.75: return "CRITICAL"
    if p >= 0.5:  return "HIGH"
    if p >= 0.25: return "MODERATE"
    return "LOW"

def _top_drivers(vec: np.ndarray, k: int = 5) -> list[dict]:
    if _MODEL is None or not hasattr(_MODEL, "feature_importances_"):
        return []
    imp = np.asarray(_MODEL.feature_importances_)
    contrib = (vec.flatten() * imp)
    idx = np.argsort(-np.abs(contrib))[:k]
    return [{"feature": _FEATURES[i], "contribution": float(contrib[i])} for i in idx]

# ---- routes ----------------------------------------------------------------
@app.get("/health")
def health():
    return {
        "status": "ok" if _MODEL is not None else "model-not-loaded",
        "model_loaded": _MODEL is not None,
        "n_features": len(_FEATURES),
        "metrics": _METRICS.get("test", {}),
    }

@app.get("/metrics")
def metrics():
    if not _METRICS:
        raise HTTPException(404, "metrics.json not found — train the model first")
    return _METRICS

@app.get("/indicators")
def indicators():
    return {
        "raw": [
            "cpi_inflation", "reserves_usd", "current_account_pct_gdp",
            "govt_debt_pct_gdp", "gdp_growth", "unemployment",
            "real_interest_rate", "exports_pct_gdp",
        ],
        "regions": REGIONS,
        "engineered": ["<indicator>_ma3", "<indicator>_std3", "<indicator>_d1"],
    }

@app.get("/countries")
def countries():
    return {
        "PAK": "Pakistan", "IND": "India", "TUR": "Turkiye", "LKA": "Sri Lanka",
        "ARG": "Argentina", "EGY": "Egypt", "VEN": "Venezuela", "LBN": "Lebanon",
        "USA": "United States", "CHN": "China", "DEU": "Germany",
    }

@app.post("/predict", response_model=PredictResponse)
def predict(payload: Indicators):
    if _MODEL is None:
        raise HTTPException(503, "Model not loaded. Run notebooks/gfceip_ml.ipynb first.")
    vec = _vectorize(payload)
    proba = float(_MODEL.predict_proba(vec)[0, 1])
    return PredictResponse(
        crisis_probability=round(proba, 4),
        risk_level=_risk_level(proba),
        model_version=_METRICS.get("model_version", "xgb-1.0"),
        top_drivers=_top_drivers(vec),
    )

@app.post("/predict/batch")
def predict_batch(payload: BatchRequest):
    if _MODEL is None:
        raise HTTPException(503, "Model not loaded.")
    return {"results": [predict(item).model_dump() for item in payload.items]}
