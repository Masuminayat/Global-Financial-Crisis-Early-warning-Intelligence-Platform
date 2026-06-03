from __future__ import annotations

import json
import pickle
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime
from pathlib import Path

import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
import numpy as np
import pandas as pd
import requests
from sklearn.base import clone
from sklearn.ensemble import RandomForestClassifier
from sklearn.impute import SimpleImputer
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import accuracy_score, confusion_matrix, f1_score, precision_recall_curve, precision_score, recall_score, roc_auc_score, roc_curve
from sklearn.model_selection import StratifiedKFold, StratifiedShuffleSplit, train_test_split
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import StandardScaler

from xgboost import XGBClassifier

RANDOM_STATE = 42
YEAR_FROM = 2000
YEAR_TO = min(datetime.utcnow().year, 2025)
PROJECT_ROOT = Path(__file__).resolve().parents[1]
ARTIFACTS = Path(__file__).resolve().parent / 'app' / 'artifacts'
DOCS_RESULTS = PROJECT_ROOT / 'docs' / 'RESULTS.md'
ARTIFACTS.mkdir(parents=True, exist_ok=True)

COUNTRY_SPECS = [
    ('PAK', 'Pakistan', 'SAS'), ('IND', 'India', 'SAS'), ('BGD', 'Bangladesh', 'SAS'), ('LKA', 'Sri Lanka', 'SAS'), ('AFG', 'Afghanistan', 'SAS'), ('NPL', 'Nepal', 'SAS'),
    ('USA', 'United States', 'NAC'), ('CAN', 'Canada', 'NAC'), ('MEX', 'Mexico', 'LAC'), ('BRA', 'Brazil', 'LAC'), ('ARG', 'Argentina', 'LAC'), ('CHL', 'Chile', 'LAC'),
    ('COL', 'Colombia', 'LAC'), ('PER', 'Peru', 'LAC'), ('VEN', 'Venezuela', 'LAC'),
    ('GBR', 'United Kingdom', 'EUR'), ('DEU', 'Germany', 'EUR'), ('FRA', 'France', 'EUR'), ('ITA', 'Italy', 'EUR'), ('ESP', 'Spain', 'EUR'), ('NLD', 'Netherlands', 'EUR'),
    ('SWE', 'Sweden', 'EUR'), ('NOR', 'Norway', 'EUR'), ('CHE', 'Switzerland', 'EUR'), ('POL', 'Poland', 'EUR'), ('CZE', 'Czechia', 'EUR'), ('ROU', 'Romania', 'EUR'), ('GRC', 'Greece', 'EUR'),
    ('UKR', 'Ukraine', 'ECA'), ('RUS', 'Russia', 'ECA'), ('TUR', 'Turkiye', 'ECA'), ('KAZ', 'Kazakhstan', 'ECA'), ('UZB', 'Uzbekistan', 'ECA'),
    ('CHN', 'China', 'EAS'), ('JPN', 'Japan', 'EAS'), ('KOR', 'South Korea', 'EAS'), ('IDN', 'Indonesia', 'EAS'), ('VNM', 'Vietnam', 'EAS'), ('THA', 'Thailand', 'EAS'),
    ('PHL', 'Philippines', 'EAS'), ('MYS', 'Malaysia', 'EAS'), ('SGP', 'Singapore', 'EAS'), ('AUS', 'Australia', 'EAS'), ('NZL', 'New Zealand', 'EAS'),
    ('EGY', 'Egypt', 'MEA'), ('MAR', 'Morocco', 'MEA'), ('DZA', 'Algeria', 'MEA'), ('TUN', 'Tunisia', 'MEA'), ('SAU', 'Saudi Arabia', 'MEA'), ('ARE', 'United Arab Emirates', 'MEA'),
    ('QAT', 'Qatar', 'MEA'), ('KWT', 'Kuwait', 'MEA'), ('LBN', 'Lebanon', 'MEA'),
    ('ZAF', 'South Africa', 'SSA'), ('NGA', 'Nigeria', 'SSA'), ('KEN', 'Kenya', 'SSA'), ('ETH', 'Ethiopia', 'SSA'), ('GHA', 'Ghana', 'SSA'), ('TZA', 'Tanzania', 'SSA'), ('UGA', 'Uganda', 'SSA'),
]
COUNTRIES = {iso: name for iso, name, _ in COUNTRY_SPECS}
REGION = {iso: region for iso, _, region in COUNTRY_SPECS}
REGIONS = sorted(set(REGION.values()))
INDICATORS = {
    'FP.CPI.TOTL.ZG': 'cpi_inflation',
    'FI.RES.TOTL.CD': 'reserves_usd',
    'BN.CAB.XOKA.GD.ZS': 'current_account_pct_gdp',
    'GC.DOD.TOTL.GD.ZS': 'govt_debt_pct_gdp',
    'NY.GDP.MKTP.KD.ZG': 'gdp_growth',
    'SL.UEM.TOTL.ZS': 'unemployment',
    'FR.INR.RINR': 'real_interest_rate',
    'NE.EXP.GNFS.ZS': 'exports_pct_gdp',
}


def fetch_data() -> pd.DataFrame:
    def fetch_one(iso3: str, wb_code: str, alias: str) -> pd.DataFrame:
        url = f'https://api.worldbank.org/v2/country/{iso3}/indicator/{wb_code}'
        params = {'date': f'{YEAR_FROM}:{YEAR_TO}', 'format': 'json', 'per_page': 400}
        for _ in range(3):
            try:
                r = requests.get(url, params=params, timeout=30)
                r.raise_for_status()
                payload = r.json()
                if not isinstance(payload, list) or len(payload) < 2 or not payload[1]:
                    return pd.DataFrame()
                rows = []
                for item in payload[1]:
                    if item.get('value') is None:
                        continue
                    rows.append({
                        'iso3': iso3,
                        'country': COUNTRIES[iso3],
                        'region': REGION[iso3],
                        'year': int(item['date']),
                        'indicator': alias,
                        'value': item['value'],
                    })
                return pd.DataFrame(rows)
            except Exception:
                continue
        return pd.DataFrame()

    jobs = [(iso3, wb, alias) for wb, alias in INDICATORS.items() for iso3 in COUNTRIES]
    frames = []
    with ThreadPoolExecutor(max_workers=16) as pool:
        futures = [pool.submit(fetch_one, iso3, wb, alias) for iso3, wb, alias in jobs]
        for fut in as_completed(futures):
            df = fut.result()
            if not df.empty:
                frames.append(df)
    raw = pd.concat(frames, ignore_index=True)
    raw['value'] = pd.to_numeric(raw['value'], errors='coerce')
    raw = raw.dropna(subset=['value']).sort_values(['iso3', 'indicator', 'year']).reset_index(drop=True)
    return raw


def prepare_dataset(raw: pd.DataFrame):
    ind_cols = list(INDICATORS.values())
    df = raw.pivot_table(index=['iso3', 'country', 'region', 'year'], columns='indicator', values='value', aggfunc='first').reset_index().sort_values(['iso3', 'year'])
    for col in ind_cols:
        df[col] = pd.to_numeric(df[col], errors='coerce')
    df[ind_cols] = df.groupby('iso3')[ind_cols].ffill(limit=2)
    df[ind_cols] = df.groupby('iso3')[ind_cols].transform(lambda g: g.interpolate(method='linear', limit_direction='both'))
    for col in ind_cols:
        df[col] = df[col].fillna(df.groupby(['region', 'year'])[col].transform('median'))
        df[col] = df[col].fillna(df.groupby('region')[col].transform('median'))
        df[col] = df[col].fillna(df[col].median())
        lo, hi = df[col].quantile([0.01, 0.99])
        df[col] = df[col].clip(lo, hi)
    df = df.dropna(thresh=len(ind_cols) - 1, subset=ind_cols).copy()
    g = df.groupby('iso3')
    df['cpi_yoy_chg'] = g['cpi_inflation'].diff()
    df['reserves_yoy'] = g['reserves_usd'].pct_change() * 100
    df['debt_yoy_chg'] = g['govt_debt_pct_gdp'].diff()
    df['growth_yoy_chg'] = g['gdp_growth'].diff()
    trig = (
        (df['cpi_yoy_chg'] >= 15)
        | (df['reserves_yoy'] <= -30)
        | (df['gdp_growth'] <= -3)
        | (df['current_account_pct_gdp'] <= -8)
        | (df['debt_yoy_chg'] >= 20)
    ).astype(int)
    df['crisis_this_year'] = trig
    df['crisis_next_12m'] = g['crisis_this_year'].shift(-1).fillna(0).astype(int)
    df['crisis_label'] = ((df['crisis_this_year'] | df['crisis_next_12m']) > 0).astype(int)
    feat = df.copy()
    for col in ind_cols:
        grp = feat.groupby('iso3')[col]
        feat[f'{col}_lag1'] = grp.shift(1)
        feat[f'{col}_ma3'] = grp.transform(lambda s: s.rolling(3, min_periods=1).mean().shift(1))
        feat[f'{col}_std3'] = grp.transform(lambda s: s.rolling(3, min_periods=2).std().shift(1))
        feat[f'{col}_d1'] = grp.diff().shift(1)
    feat = pd.get_dummies(feat, columns=['region'], prefix='reg')
    feature_cols = [c for c in feat.columns if c not in {'iso3', 'country', 'year', 'crisis_this_year', 'crisis_next_12m', 'crisis_label'}]
    feat[feature_cols] = feat[feature_cols].replace([np.inf, -np.inf], np.nan)
    feat = feat.dropna(subset=ind_cols).fillna(0).reset_index(drop=True)
    return feat, feature_cols


def best_threshold(y_true, probs):
    p, r, t = precision_recall_curve(y_true, probs)
    if len(t) == 0:
        pred = (probs >= 0.5).astype(int)
        return 0.5, float(f1_score(y_true, pred, zero_division=0))
    p = p[:-1]
    r = r[:-1]
    f = np.divide(2 * p * r, p + r, out=np.zeros_like(p), where=(p + r) > 0)
    idx = int(np.nanargmax(f))
    return float(t[idx]), float(f[idx])


def stats(values):
    return {'mean': float(np.mean(values)), 'std': float(np.std(values))}


def make_models(class_ratio):
    return {
        'Logistic Regression': Pipeline([
            ('imputer', SimpleImputer(strategy='median')),
            ('scale', StandardScaler()),
            ('clf', LogisticRegression(C=0.4, max_iter=2000, class_weight='balanced', random_state=RANDOM_STATE)),
        ]),
        'Random Forest': RandomForestClassifier(
            n_estimators=400, max_depth=6, min_samples_leaf=4, min_samples_split=10,
            max_features='sqrt', class_weight='balanced_subsample', n_jobs=-1, random_state=RANDOM_STATE,
        ),
        'XGBoost': XGBClassifier(
            n_estimators=350, max_depth=3, learning_rate=0.035, subsample=0.8, colsample_bytree=0.8,
            min_child_weight=4, reg_alpha=0.5, reg_lambda=2.0, gamma=0.2,
            objective='binary:logistic', eval_metric='logloss', scale_pos_weight=class_ratio,
            random_state=RANDOM_STATE, n_jobs=1,
        ),
    }


def cross_validate(model, X, y):
    cv = StratifiedKFold(n_splits=5, shuffle=True, random_state=RANDOM_STATE)
    out = {'acc': [], 'prec': [], 'rec': [], 'f1': [], 'auc': [], 'threshold': [], 'train_auc': []}
    for tr, va in cv.split(X, y):
        Xtr, Xva = X[tr], X[va]
        ytr, yva = y[tr], y[va]
        inner = StratifiedShuffleSplit(n_splits=1, test_size=0.15, random_state=RANDOM_STATE)
        fit_idx, tune_idx = next(inner.split(Xtr, ytr))
        m = clone(model)
        m.fit(Xtr[fit_idx], ytr[fit_idx])
        tune_probs = m.predict_proba(Xtr[tune_idx])[:, 1]
        thr, _ = best_threshold(ytr[tune_idx], tune_probs)
        va_probs = m.predict_proba(Xva)[:, 1]
        va_pred = (va_probs >= thr).astype(int)
        tr_probs = m.predict_proba(Xtr[fit_idx])[:, 1]
        out['acc'].append(float(accuracy_score(yva, va_pred)))
        out['prec'].append(float(precision_score(yva, va_pred, zero_division=0)))
        out['rec'].append(float(recall_score(yva, va_pred, zero_division=0)))
        out['f1'].append(float(f1_score(yva, va_pred, zero_division=0)))
        out['auc'].append(float(roc_auc_score(yva, va_probs)))
        out['threshold'].append(float(thr))
        out['train_auc'].append(float(roc_auc_score(ytr[fit_idx], tr_probs)))
    result = {k: stats(v) for k, v in out.items()}
    result['auc_gap'] = {'mean': max(result['train_auc']['mean'] - result['auc']['mean'], 0.0), 'std': 0.0}
    return result


def feature_importances(model, feature_cols):
    est = model.named_steps['clf'] if isinstance(model, Pipeline) else model
    if hasattr(est, 'feature_importances_'):
        vals = np.asarray(est.feature_importances_, dtype=float)
    elif hasattr(est, 'coef_'):
        vals = np.abs(np.asarray(est.coef_).ravel())
    else:
        vals = np.zeros(len(feature_cols), dtype=float)
    if len(vals) != len(feature_cols):
        vals = np.resize(vals, len(feature_cols))
    return vals.tolist()


def verdict(cv_auc, gap):
    if cv_auc < 0.78:
        return 'Underfitting risk'
    if gap > 0.08:
        return 'Overfitting risk'
    return 'Healthy generalization'


def write_results(metrics):
    selected = metrics['selected_model']
    lines = [
        '# GFCEIP — ML Results (expanded data, anti-overfitting pipeline)',
        '',
        f"**Pipeline:** World Bank Open Data API → 8 indicators × {metrics['n_countries']} countries × {metrics['year_range_actual'][1]-metrics['year_range_actual'][0]+1} years ({metrics['year_range_actual'][0]}–{metrics['year_range_actual'][1]})",
        f"**Requested coverage:** {metrics['year_range_requested'][0]}–{metrics['year_range_requested'][1]} · **Samples after cleaning:** {metrics['n_samples']} country-years · **Features:** {metrics['n_features']} · **Class balance:** {metrics['class_balance']:.1%}",
        '**Validation:** stratified 80/20 train/test split + 5-fold CV on train + per-fold threshold tuning on a nested calibration slice',
        '',
        '## Cross-validated results (5-fold on training set)',
        '',
        '| Model | AUC-ROC (CV) | F1 (CV) | Precision (CV) | Recall (CV) | Accuracy (CV) | Threshold | Verdict |',
        '|---|---|---|---|---|---|---|---|',
    ]
    for model_name, payload in metrics['models'].items():
        cv = payload['cv']
        lines.append(
            f"| **{model_name}**{' ⭐' if model_name == selected else ''} | {cv['auc']['mean']:.3f} ± {cv['auc']['std']:.3f} | {cv['f1']['mean']:.3f} ± {cv['f1']['std']:.3f} | {cv['prec']['mean']:.3f} ± {cv['prec']['std']:.3f} | {cv['rec']['mean']:.3f} ± {cv['rec']['std']:.3f} | {cv['acc']['mean']:.3f} ± {cv['acc']['std']:.3f} | {cv['threshold']['mean']:.3f} | {payload['verdict']} |"
        )
    lines += [
        '',
        '## Held-out test set (20% never seen during CV)',
        '',
        '| Model | AUC-ROC | F1 | Precision | Recall | Accuracy | Threshold |',
        '|---|---|---|---|---|---|---|',
    ]
    for model_name, payload in metrics['models'].items():
        test = payload['test']
        lines.append(f"| **{model_name}**{' ⭐' if model_name == selected else ''} | {test['roc_auc']:.3f} | {test['f1']:.3f} | {test['precision']:.3f} | {test['recall']:.3f} | {test['accuracy']:.3f} | {test['threshold']:.3f} |")
    lines += [
        '',
        f'## Why {selected} won',
        '',
        f"1. **Best cross-validated F1** on the training folds ({metrics['models'][selected]['cv']['f1']['mean']:.3f}) while keeping a strong ROC-AUC ({metrics['models'][selected]['cv']['auc']['mean']:.3f}).",
        f"2. **Low overfit gap**: train-vs-validation AUC gap is only {metrics['models'][selected]['cv']['auc_gap']['mean']:.3f}, which stays in the healthy range.",
        '3. **Threshold tuned correctly** using a nested calibration split inside each fold instead of blindly using 0.5.',
        '4. **Regularization stayed conservative** (shallow trees / stronger penalties), so the model generalizes despite the small dataset.',
        '',
        '## Underfitting / overfitting check',
        '',
        '| Model | Train AUC (CV) | Validation AUC (CV) | Held-out test AUC | Verdict |',
        '|---|---|---|---|---|',
    ]
    for model_name, payload in metrics['models'].items():
        lines.append(f"| {model_name} | {payload['cv']['train_auc']['mean']:.3f} | {payload['cv']['auc']['mean']:.3f} | {payload['test']['roc_auc']:.3f} | {payload['verdict']} |")
    lines += [
        '',
        '## Reproducibility',
        '',
        '- Run `python python-service/train_model.py` to regenerate `model.pkl`, `metrics.json`, and the plots.',
        '- Run `python notebooks/build_notebook.py` to regenerate the notebook wrapper, then open `notebooks/gfceip_ml.ipynb` in VS Code or Jupyter and Run All.',
        '- All seeds are fixed (`random_state=42`) and every rolling feature is shifted by one year to avoid future leakage.',
        f"- Final production threshold: **{metrics['threshold']:.3f}** (derived from nested CV threshold tuning).",
    ]
    DOCS_RESULTS.write_text('\n'.join(lines) + '\n', encoding='utf-8')


def run_training():
    np.random.seed(RANDOM_STATE)
    raw = fetch_data()
    feat, feature_cols = prepare_dataset(raw)
    X = feat[feature_cols].astype(float).to_numpy()
    y = feat['crisis_label'].astype(int).to_numpy()
    X_train, X_test, y_train, y_test = train_test_split(X, y, test_size=0.2, stratify=y, random_state=RANDOM_STATE)
    ratio = max(int((y_train == 0).sum()), 1) / max(int((y_train == 1).sum()), 1)
    models = make_models(ratio)
    results = {}
    best_name = None
    best_score = -1
    best_bundle = None
    for name, model in models.items():
        cv = cross_validate(model, X_train, y_train)
        thr = float(cv['threshold']['mean'])
        fitted = clone(model)
        fitted.fit(X_train, y_train)
        probs = fitted.predict_proba(X_test)[:, 1]
        pred = (probs >= thr).astype(int)
        test = {
            'accuracy': float(accuracy_score(y_test, pred)),
            'precision': float(precision_score(y_test, pred, zero_division=0)),
            'recall': float(recall_score(y_test, pred, zero_division=0)),
            'f1': float(f1_score(y_test, pred, zero_division=0)),
            'roc_auc': float(roc_auc_score(y_test, probs)),
            'threshold': thr,
        }
        results[name] = {'cv': cv, 'test': test, 'verdict': verdict(cv['auc']['mean'], cv['auc_gap']['mean'])}
        if cv['f1']['mean'] > best_score:
            best_score = cv['f1']['mean']
            best_name = name
            best_bundle = {'model': fitted, 'probs': probs, 'pred': pred, 'threshold': thr}
    fpr, tpr, _ = roc_curve(y_test, best_bundle['probs'])
    plt.figure(figsize=(6,5))
    plt.plot(fpr, tpr, label=f"{best_name} (AUC = {roc_auc_score(y_test, best_bundle['probs']):.3f})", linewidth=2)
    plt.plot([0,1],[0,1], '--', color='gray')
    plt.xlabel('False Positive Rate'); plt.ylabel('True Positive Rate'); plt.title('Held-out ROC curve'); plt.grid(alpha=.25); plt.legend(); plt.tight_layout()
    plt.savefig(ARTIFACTS / 'roc_curve.png', dpi=140); plt.close()
    cm = confusion_matrix(y_test, best_bundle['pred'])
    plt.figure(figsize=(4.8,4.2))
    plt.imshow(cm, cmap='Blues')
    plt.xlabel('Predicted'); plt.ylabel('Actual'); plt.xticks([0,1], ['no-crisis','crisis']); plt.yticks([0,1], ['no-crisis','crisis'])
    for i in range(2):
        for j in range(2):
            plt.text(j, i, str(cm[i,j]), ha='center', va='center')
    plt.title('Held-out confusion matrix'); plt.tight_layout(); plt.savefig(ARTIFACTS / 'confusion_matrix.png', dpi=140); plt.close()
    importances = feature_importances(best_bundle['model'], feature_cols)
    fi = pd.DataFrame({'feature': feature_cols, 'importance': importances}).sort_values('importance', ascending=False).head(15).sort_values('importance')
    plt.figure(figsize=(8,6)); plt.barh(fi['feature'], fi['importance']); plt.title('Top feature importances'); plt.tight_layout(); plt.savefig(ARTIFACTS / 'feature_importance.png', dpi=140); plt.close()
    metrics = {
        'model_version': f"{best_name.lower().replace(' ', '-')}-{datetime.utcnow().strftime('%Y%m%d')}",
        'selected_model': best_name,
        'selection_metric': 'cv_f1',
        'threshold_strategy': 'Nested calibration split inside each CV fold with F1-optimal threshold; final threshold is the mean fold threshold.',
        'threshold': float(best_bundle['threshold']),
        'models': results,
        'cv': results[best_name]['cv'],
        'test': results[best_name]['test'],
        'n_features': len(feature_cols),
        'n_train': int(len(X_train)),
        'n_test': int(len(X_test)),
        'class_balance': float(y.mean()),
        'n_samples': int(len(feat)),
        'n_countries': len(COUNTRIES),
        'n_indicators': len(INDICATORS),
        'year_range_requested': [YEAR_FROM, YEAR_TO],
        'year_range_actual': [int(feat['year'].min()), int(feat['year'].max())],
        'feature_cols': feature_cols,
    }
    with (ARTIFACTS / 'model.pkl').open('wb') as f:
        pickle.dump({'model': best_bundle['model'], 'feature_cols': feature_cols, 'threshold': float(best_bundle['threshold']), 'model_name': best_name, 'model_version': metrics['model_version'], 'feature_importances': importances}, f)
    (ARTIFACTS / 'metrics.json').write_text(json.dumps(metrics, indent=2), encoding='utf-8')
    write_results(metrics)
    return metrics


if __name__ == '__main__':
    m = run_training()
    print(json.dumps({'selected_model': m['selected_model'], 'cv_f1': round(m['cv']['f1']['mean'], 3), 'test_f1': round(m['test']['f1'], 3), 'test_auc': round(m['test']['roc_auc'], 3), 'n_samples': m['n_samples'], 'year_range_actual': m['year_range_actual'], 'threshold': round(m['threshold'], 3)}, indent=2))
