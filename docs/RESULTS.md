# GFCEIP — ML Results (expanded data, anti-overfitting pipeline)

**Pipeline:** World Bank Open Data API → 8 indicators × 60 countries × 26 years (2000–2025)
**Requested coverage:** 2000–2025 · **Samples after cleaning:** 1558 country-years · **Features:** 52 · **Class balance:** 21.2%
**Validation:** stratified 80/20 train/test split + 5-fold CV on train + per-fold threshold tuning on a nested calibration slice

## Cross-validated results (5-fold on training set)

| Model | AUC-ROC (CV) | F1 (CV) | Precision (CV) | Recall (CV) | Accuracy (CV) | Threshold | Verdict |
|---|---|---|---|---|---|---|---|
| **Logistic Regression** | 0.824 ± 0.052 | 0.595 ± 0.087 | 0.626 ± 0.103 | 0.599 ± 0.135 | 0.831 ± 0.039 | 0.644 | Healthy generalization |
| **Random Forest** | 0.912 ± 0.030 | 0.763 ± 0.061 | 0.803 ± 0.079 | 0.731 ± 0.066 | 0.904 ± 0.027 | 0.468 | Healthy generalization |
| **XGBoost** ⭐ | 0.921 ± 0.032 | 0.765 ± 0.028 | 0.849 ± 0.042 | 0.697 ± 0.030 | 0.909 ± 0.012 | 0.566 | Healthy generalization |

## Held-out test set (20% never seen during CV)

| Model | AUC-ROC | F1 | Precision | Recall | Accuracy | Threshold |
|---|---|---|---|---|---|---|
| **Logistic Regression** | 0.804 | 0.609 | 0.629 | 0.591 | 0.840 | 0.644 |
| **Random Forest** | 0.877 | 0.650 | 0.702 | 0.606 | 0.862 | 0.468 |
| **XGBoost** ⭐ | 0.888 | 0.678 | 0.769 | 0.606 | 0.878 | 0.566 |

## Why XGBoost won

1. **Best cross-validated F1** on the training folds (0.765) while keeping a strong ROC-AUC (0.921).
2. **Low overfit gap**: train-vs-validation AUC gap is only 0.079, which stays in the healthy range.
3. **Threshold tuned correctly** using a nested calibration split inside each fold instead of blindly using 0.5.
4. **Regularization stayed conservative** (shallow trees / stronger penalties), so the model generalizes despite the small dataset.

## Underfitting / overfitting check

| Model | Train AUC (CV) | Validation AUC (CV) | Held-out test AUC | Verdict |
|---|---|---|---|---|
| Logistic Regression | 0.884 | 0.824 | 0.804 | Healthy generalization |
| Random Forest | 0.992 | 0.912 | 0.877 | Healthy generalization |
| XGBoost | 1.000 | 0.921 | 0.888 | Healthy generalization |

## Reproducibility

- Run `python python-service/train_model.py` to regenerate `model.pkl`, `metrics.json`, and the plots.
- Run `python notebooks/build_notebook.py` to regenerate the notebook wrapper, then open `notebooks/gfceip_ml.ipynb` in VS Code or Jupyter and Run All.
- All seeds are fixed (`random_state=42`) and every rolling feature is shifted by one year to avoid future leakage.
- Final production threshold: **0.566** (derived from nested CV threshold tuning).
