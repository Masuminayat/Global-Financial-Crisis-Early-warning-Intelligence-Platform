# GFCEIP — ML Results (expanded data, anti-overfitting pipeline)

**Pipeline:** World Bank Open Data API → 8 indicators × 206 countries × 26 years (2000–2025)
**Requested coverage:** 2000–2025 · **Samples after cleaning:** 5301 country-years · **Features:** 52 · **Class balance:** 38.2%
**Validation:** stratified 80/20 train/test split + 5-fold CV on train + per-fold threshold tuning on a nested calibration slice

## Cross-validated results (5-fold on training set)

| Model | AUC-ROC (CV) | F1 (CV) | Precision (CV) | Recall (CV) | Accuracy (CV) | Threshold | Verdict |
|---|---|---|---|---|---|---|---|
| **Logistic Regression** | 0.856 ± 0.001 | 0.742 ± 0.014 | 0.775 ± 0.028 | 0.713 ± 0.038 | 0.810 ± 0.008 | 0.564 | Healthy generalization |
| **Random Forest** | 0.921 ± 0.009 | 0.835 ± 0.011 | 0.919 ± 0.016 | 0.766 ± 0.029 | 0.884 ± 0.005 | 0.552 | Healthy generalization |
| **XGBoost** ⭐ | 0.930 ± 0.008 | 0.848 ± 0.011 | 0.951 ± 0.015 | 0.766 ± 0.020 | 0.895 ± 0.006 | 0.612 | Healthy generalization |

## Held-out test set (20% never seen during CV)

| Model | AUC-ROC | F1 | Precision | Recall | Accuracy | Threshold |
|---|---|---|---|---|---|---|
| **Logistic Regression** | 0.842 | 0.742 | 0.778 | 0.709 | 0.811 | 0.564 |
| **Random Forest** | 0.911 | 0.832 | 0.944 | 0.744 | 0.885 | 0.552 |
| **XGBoost** ⭐ | 0.928 | 0.844 | 0.959 | 0.754 | 0.893 | 0.612 |

## Why XGBoost won

1. **Best cross-validated F1** on the training folds (0.848) while keeping a strong ROC-AUC (0.930).
2. **Low overfit gap**: train-vs-validation AUC gap is only 0.056, which stays in the healthy range.
3. **Threshold tuned correctly** using a nested calibration split inside each fold instead of blindly using 0.5.
4. **Regularization stayed conservative** (shallow trees / stronger penalties), so the model generalizes despite the small dataset.

## Underfitting / overfitting check

| Model | Train AUC (CV) | Validation AUC (CV) | Held-out test AUC | Verdict |
|---|---|---|---|---|
| Logistic Regression | 0.867 | 0.856 | 0.842 | Healthy generalization |
| Random Forest | 0.953 | 0.921 | 0.911 | Healthy generalization |
| XGBoost | 0.986 | 0.930 | 0.928 | Healthy generalization |

## Reproducibility

- Run `python python-service/train_model.py` to regenerate `model.pkl`, `metrics.json`, and the plots.
- Run `python notebooks/build_notebook.py` to regenerate the notebook wrapper, then open `notebooks/gfceip_ml.ipynb` in VS Code or Jupyter and Run All.
- All seeds are fixed (`random_state=42`) and every rolling feature is shifted by one year to avoid future leakage.
- Final production threshold: **0.612** (derived from nested CV threshold tuning).
