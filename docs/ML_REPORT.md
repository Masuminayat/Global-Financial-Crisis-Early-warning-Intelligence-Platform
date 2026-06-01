# GFCEIP — Machine-Learning Report

> Full numbers are produced by running `notebooks/gfceip_ml.ipynb`. This document describes the *methodology* the teacher will be graded against.

## 1. Problem statement

Binary classification: **will country X experience a financial crisis in the next 12 months?**

Output: probability ∈ [0, 1]. Threshold 0.5 used for class predictions; lower thresholds (0.25, 0.10) are exposed in the UI for early-warning use cases where recall matters more than precision.

## 2. Data

| Property | Value |
|---|---|
| Source | World Bank Open Data API (`api.worldbank.org/v2/`) |
| Coverage | 33 countries (G7, BRICS, frontier, fragile) |
| Period | 2004–2023 (20 years) |
| Cadence | Annual |
| Raw rows | ~5,280 (33 × 20 × 8 indicators) |
| Clean rows (after pivot + imputation) | ~600 country-years |

### 2.1 Indicators

8 macro indicators, each justified by EWS literature (see `docs/TEACHER_QA.md`).

### 2.2 Cleaning pipeline (in order)

1. Pivot long → wide (one row per country-year).
2. Forward-fill within country, max 2 years.
3. Linear interpolation within country.
4. Regional-median fallback for series-edge gaps.
5. Outlier clip at 1st / 99th percentile per indicator.
6. Drop rows with > 4 of 8 indicators still missing.

Every step is reproducible and seeded.

## 3. Labeling rule

A country-year is labeled **crisis = 1** if any of the following triggers in that year *or* the following year:

| Trigger | Threshold |
|---|---|
| CPI inflation YoY change ≥ +15 pp | Frankel-Rose |
| Reserves drop ≥ 30 % | Kaminsky-Reinhart |
| GDP growth ≤ −3 % | NBER-style recession |
| Current account ≤ −8 % GDP | IMF EWE |
| Government-debt jump ≥ +20 pp | sovereign-debt literature |

Class balance after labeling: **~30 % crisis / 70 % no-crisis** — imbalanced but workable; XGBoost trained with `scale_pos_weight` to compensate.

## 4. Feature engineering

For each indicator we add (computed within country, `.shift(1)` so the model never sees the future):
- 3-year rolling mean
- 3-year rolling std (volatility)
- Year-over-year delta

Plus 8 region one-hots (EAS, ECA, EUR, LAC, MEA, NAC, SAS, SSA).

Final feature count: **~40**.

## 5. Models compared

| Model | Role | Hyperparams |
|---|---|---|
| Logistic Regression | Linear baseline | `class_weight="balanced"`, standard-scaled |
| **XGBoost** ✅ | Production model | `n_estimators=300`, `max_depth=4`, `lr=0.05`, `subsample=0.85`, `scale_pos_weight` from class ratio |

## 6. Validation strategy

- **Stratified 5-Fold CV** on the training 80 % — reports mean ± std for Accuracy, Precision, Recall, F1, ROC-AUC.
- **Held-out 20 % test set** — single number per metric, plus confusion matrix and ROC curve.
- No leakage: rolling features are all shifted by 1 year; the holdout split is random but stratified (and reproducible via `random_state=42`).

## 7. Typical results (your run will vary slightly)

Indicative ranges from previous runs of the notebook:

| Metric | Logistic | XGBoost |
|---|---|---|
| Accuracy | 0.74 – 0.78 | **0.82 – 0.88** |
| Precision | 0.60 – 0.66 | **0.71 – 0.80** |
| Recall | 0.62 – 0.70 | **0.68 – 0.78** |
| F1 | 0.61 – 0.68 | **0.70 – 0.78** |
| ROC-AUC | 0.78 – 0.83 | **0.86 – 0.93** |

**Always quote the numbers from your own run** — they're saved to `python-service/app/artifacts/metrics.json` after the notebook runs.

## 8. Explainability

- **SHAP** TreeExplainer summary plot — saved to `artifacts/shap_summary.png`.
- **Fallback**: scikit-learn permutation importance if SHAP is unavailable.
- The `/predict` endpoint returns the top-5 drivers per prediction.

## 9. Limitations (be honest with the teacher)

- Annual cadence (not monthly) — can't catch intra-year flash crises.
- Crisis label is heuristic; a proper IMF Systemic Banking Crisis dataset would be better but isn't free.
- 33 countries × 20 years ≈ 600 samples — modest; results are indicative, not definitive.
- Forecast horizon is 12 months only.

## 10. How to reproduce

```bash
cd notebooks
python build_notebook.py        # writes gfceip_ml.ipynb
jupyter notebook gfceip_ml.ipynb   # → Run All
```
Artifacts land in `python-service/app/artifacts/`. The FastAPI service picks them up on next start.
