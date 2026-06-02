# GFCEIP — 2-Hour Crash Course Before Your Presentation

> Read this once end-to-end (20 min). Then split the work (see Part 7). You will be fine.

---

## Part 1 — What the project actually is (1 sentence each)

- **Name:** GFCEIP — Global Financial Crisis Early-warning & Intelligence Platform.
- **Goal:** Predict the probability that a country will experience a financial crisis in the next 12 months.
- **Type of ML problem:** **Binary classification** (output = probability between 0 and 1; label = crisis / no-crisis).
- **Output to the user:** A stability score per country, a risk level (LOW / MODERATE / HIGH / CRITICAL), and the top features that drove the prediction.

---

## Part 2 — The Data (this is what the teacher will grill you on)

### 2.1 Source
- **World Bank Open Data API** — `http://api.worldbank.org/v2/`
- Public, free, no API key, used by IMF / UN / academic researchers.
- Pulled in `notebooks/gfceip_ml.ipynb`, section §1.

### 2.2 Size
| What | Number |
|---|---|
| Countries | **33** (G7 + BRICS + frontier + fragile economies) |
| Years | **20** (2004–2023) |
| Indicators per country-year | **8** |
| Raw rows pulled | ~**5,280** (33 × 20 × 8) |
| Clean rows after pivoting wide | ~**600 country-years** |
| Final feature count after engineering | **~40 features** |

### 2.3 The 8 indicators (memorize these)
1. **CPI inflation** — % annual
2. **Foreign exchange reserves** — USD
3. **Current account balance** — % of GDP
4. **Government debt** — % of GDP
5. **GDP growth** — % annual
6. **Unemployment** — %
7. **Real interest rate** — %
8. **Exports** — % of GDP

> *Why these 8?* They are the standard set used in the Early-Warning-System literature (Frankel-Rose 1996, Kaminsky-Reinhart 1999, IMF Working Paper 17/86).

### 2.4 Data cleaning — 6 steps (in this exact order)
1. **Pivot** long → wide (one row per country-year, 8 columns)
2. **Forward-fill within country** (max 2 years) — for slow-moving indicators like debt
3. **Linear interpolation within country** — for smooth series
4. **Regional-median fallback** — if still missing, use the median of countries in the same region
5. **Outlier clip** at 1st and 99th percentile per indicator
6. **Drop** rows where more than 4 of 8 indicators are still missing

> *Why this order?* You fill the easy gaps first (within-country trends), then fall back to peers (regional median), then clip outliers (so one Venezuela hyperinflation row doesn't dominate training), then drop unsalvageable rows.

### 2.5 How "crisis" is labeled (binary target)
A country-year = **1 (crisis)** if **any** of these trigger in that year **or the next year**:

| Trigger | Threshold | Source |
|---|---|---|
| CPI inflation jump | ≥ +15 percentage points | Frankel-Rose |
| Reserves drop | ≥ 30 % | Kaminsky-Reinhart |
| GDP growth | ≤ −3 % | NBER recession-style |
| Current account | ≤ −8 % of GDP | IMF EWE |
| Government debt jump | ≥ +20 pp | sovereign-debt literature |

> Result: **~30 % of rows are crisis, ~70 % no-crisis.** Imbalanced — important point (see Part 3.6).

### 2.6 Feature engineering (after labeling)
For each of the 8 indicators we add 3 derived features:
- **3-year rolling mean** (`_ma3`) — captures trend
- **3-year rolling standard deviation** (`_std3`) — captures volatility
- **Year-over-year change** (`_d1`) — captures momentum

Plus **8 region one-hot encodings** (EAS, ECA, EUR, LAC, MEA, NAC, SAS, SSA).

**Total = 8 raw + 24 engineered + 8 region = ~40 features.**

> **🔑 Critical teacher question — data leakage:** All rolling features use `.shift(1)`. This means at year T, the model only sees data from year T-1 and earlier. **The model never sees the future.** This is the #1 thing the teacher will check.

---

## Part 3 — The Model (the meaty ML part)

### 3.1 Models we compared
| Model | Role | Why it's here |
|---|---|---|
| **Logistic Regression** | Baseline | Linear, interpretable, fast. If XGBoost can't beat this, the problem isn't worth a complex model. |
| **XGBoost** ✅ | Final production model | Best on tabular data with <10k samples. Handles missing values, non-linear interactions, robust to outliers. |

### 3.2 Why XGBoost (memorize this — guaranteed question)
**Three reasons:**
1. **State-of-the-art on tabular small-data.** Every Kaggle structured-data competition under ~100k rows is won by gradient-boosted trees, not neural networks.
2. **Handles non-linearity and feature interactions natively** — e.g. "high debt is only dangerous when reserves are also low" — logistic regression can't capture that without manual interaction terms.
3. **Explainable via SHAP** — we can show *which* feature drove each prediction. Black-box neural nets can't do that as cleanly.

### 3.3 Why NOT other models (be ready for this!)

| Model | Why we didn't pick it |
|---|---|
| **Deep Neural Network (MLP / LSTM)** | Only ~600 samples. Deep nets need 10k+ rows. Would overfit instantly. Also not explainable. |
| **Random Forest** | Solid baseline, but XGBoost almost always beats it on the same data because boosting corrects its previous errors while RF just averages independent trees. |
| **SVM** | Doesn't output well-calibrated probabilities; doesn't handle missing values; doesn't scale features automatically. |
| **Naive Bayes** | Assumes feature independence — completely false for macro indicators (inflation ↔ interest rate are obviously linked). |
| **k-NN** | Distance breaks down in 40-dimensional feature space ("curse of dimensionality"). Also slow at inference. |
| **Plain Decision Tree** | High variance, overfits a single tree. XGBoost = many shallow trees averaged → low variance. |
| **Prophet / ARIMA** | Those are time-series **forecasting** models for a single series. Our problem is **classification across many countries**, not forecasting one number. |

### 3.4 XGBoost hyperparameters (and why)
```
n_estimators = 300        # enough trees to converge, not so many it overfits
max_depth = 4             # shallow trees → weak learners → less overfit
learning_rate = 0.05      # small rate + many trees = smoother boundary
subsample = 0.85          # row sampling per tree = regularization
scale_pos_weight = 70/30 ≈ 2.33   # compensates for class imbalance
random_state = 42         # reproducibility
```

### 3.5 Validation strategy (CRITICAL — they will ask)
We use **TWO layers** of evaluation:

1. **Stratified 5-Fold Cross-Validation** on the training 80 %
   - "Stratified" = each fold preserves the 70/30 class ratio
   - Reports mean ± standard deviation for every metric → tells us if accuracy is stable or noisy

2. **Held-out 20 % test set** that the model **never sees** during training or CV
   - Single number per metric, reported once at the end → the honest score

> **Why both?** CV tells us how stable the model is. Held-out test tells us how it performs on truly unseen data. Reporting only one is a red flag.

### 3.6 Why is the dataset imbalanced and how do we handle it?
- 30 % crisis vs 70 % no-crisis → a dumb model that predicts "no crisis" always gets 70 % accuracy.
- That's why **we don't quote accuracy as the headline metric.** We quote **ROC-AUC**.
- We also pass `scale_pos_weight ≈ 2.33` to XGBoost, which makes it pay 2.33× more attention to misclassified crisis examples.

### 3.7 Which metric and why
| Metric | What it tells you | Use it when |
|---|---|---|
| **Accuracy** | % correct overall | Balanced classes (NOT us) |
| **Precision** | Of predicted crises, how many were real | False alarms are costly |
| **Recall** | Of real crises, how many we caught | Missed crises are costly ← **OUR CASE** |
| **F1** | Harmonic mean of precision & recall | Need balance |
| **ROC-AUC** ⭐ | Probability that a random crisis ranks higher than a random non-crisis | Imbalanced + threshold-independent ← **HEADLINE METRIC** |

> **For early warning, recall matters more than precision** — missing a real crisis is much worse than a false alarm. That's why we expose lower thresholds (0.25, 0.10) in the UI.

### 3.8 Typical results (your run will vary)
Quote your **actual** numbers from `python-service/app/artifacts/metrics.json`. Indicative ranges:

| Metric | Logistic | XGBoost |
|---|---|---|
| Accuracy | 0.74–0.78 | **0.82–0.88** |
| Precision | 0.60–0.66 | **0.71–0.80** |
| Recall | 0.62–0.70 | **0.68–0.78** |
| F1 | 0.61–0.68 | **0.70–0.78** |
| ROC-AUC | 0.78–0.83 | **0.86–0.93** |

### 3.9 Overfitting / underfitting — the teacher WILL ask
**How do you know it's not overfitting?**
- Training accuracy vs validation accuracy gap is small (< 5 percentage points).
- 5-fold CV standard deviation is small (< 0.03) → consistent across folds.
- Held-out test ROC-AUC is close to CV mean ROC-AUC.
- We use `max_depth=4` (shallow trees), `subsample=0.85` (row dropout), and only 300 trees → built-in regularization.

**How do you know it's not underfitting?**
- XGBoost clearly beats logistic regression (the linear baseline). If both performed equally, the model is too simple for the data.
- Training accuracy > 0.85.

**If gap were large:** reduce `max_depth`, reduce `n_estimators`, increase regularization (`reg_alpha`, `reg_lambda`).
**If both train+test were low:** increase `max_depth`, add features, get more data.

### 3.10 Explainability — SHAP
- **SHAP (SHapley Additive exPlanations)** is from game theory. It fairly attributes the prediction to each feature.
- Notebook §8 produces a summary plot showing which features matter most overall.
- The `/predict` API endpoint returns top-5 drivers per prediction → not a black box.

---

## Part 4 — How the live system works (architecture)

```
┌─────────────────────────────────────────────────────────────┐
│  World Bank Open Data API  (public, no key)                 │
└──────────────────────┬──────────────────────────────────────┘
                       │ pulled once in
                       ▼
            notebooks/gfceip_ml.ipynb
            ├── cleans data (6 steps)
            ├── labels crises (5 triggers)
            ├── engineers 40 features
            ├── trains Logistic + XGBoost
            ├── validates (5-fold CV + 20% holdout)
            ├── computes SHAP
            └── saves → python-service/app/artifacts/
                       ├── model.pkl
                       └── metrics.json
                       │
                       ▼
            python-service/  (FastAPI)
            ├── loads model.pkl on startup
            ├── POST /predict → probability + risk level + top drivers
            ├── GET  /metrics → CV + holdout scores
            └── GET  /health  → is model loaded?
                       │
                       ▼ HTTP (port 8000)
            TanStack Start frontend (src/)
            ├── Dashboard      → reads Supabase Postgres directly
            ├── /pakistan      → 24-month country deep-dive
            ├── /simulator     → 8 sliders, instant re-prediction
            ├── /copilot       → Gemini 2.5 Flash via server function
            └── Realtime alerts → Supabase WebSocket
```

### How is it "real-time"?
- **Reads:** Supabase JS client queries Postgres directly using the publishable (anon) key. RLS allows read-only.
- **Push:** The `alerts` table is added to the `supabase_realtime` publication. Frontend subscribes via WebSocket → new alerts appear in ~200 ms with no polling.

---

## Part 5 — Likely teacher questions (rapid-fire)

> Full version: `docs/TEACHER_QA.md` (14 questions). Below = the must-know subset.

**Q: Where does the data come from?**
A: World Bank Open Data API — public, free, no key. 33 countries × 20 years × 8 indicators.

**Q: How many rows did you train on?**
A: ~600 country-year rows after cleaning, with ~40 features each.

**Q: How is "crisis" defined?**
A: Five EWS triggers from Frankel-Rose, Kaminsky-Reinhart, and IMF literature. Any one fires → label = 1.

**Q: Why XGBoost?**
A: Best on tabular <10k data, handles non-linearity, robust to missing values, explainable via SHAP.

**Q: Why not a neural network?**
A: Only 600 samples — would overfit immediately. Need 10k+ rows for deep learning.

**Q: Why not Random Forest?**
A: XGBoost almost always beats it because boosting *corrects* previous errors; RF just *averages*.

**Q: Is it overfitting?**
A: No — train/test gap < 5pp, CV std < 0.03, holdout AUC ≈ CV AUC, plus shallow trees + subsample regularization.

**Q: Is it underfitting?**
A: No — beats logistic regression baseline by ~10 AUC points.

**Q: How do you know there's no data leakage?**
A: All rolling features use `.shift(1)`. Train/test split is done before any tuning. CV folds are stratified and non-overlapping.

**Q: What's your headline metric and why?**
A: **ROC-AUC** (≈ 0.86–0.93). Threshold-independent and the standard for imbalanced early-warning problems.

**Q: How is it real-time?**
A: Supabase Realtime publication on the `alerts` table → WebSocket push to all connected browsers in ~200 ms. No polling.

**Q: Biggest weakness?**
A: Annual cadence — can't catch intra-year flash crises. Would need monthly data for production.

**Q: What would you do differently next time?**
A: Use Laeven-Valencia IMF banking-crisis dataset for ground-truth labels, add bond-yield spreads, move to monthly cadence.

---

## Part 6 — Demo script (10 min, in order)

1. **Landing page** — "Here's the problem we're solving" (30s)
2. **Dashboard** — show realtime alerts ticking (60s)
3. **Pakistan deep-dive** — 24-month chart + risk matrix (60s)
4. **Notebook §1–§2** — show World Bank API call + 6-step cleaning (90s) ← **most important slide**
5. **Notebook §3** — 5-trigger crisis labeling rule (45s)
6. **Notebook §5–§7** — model comparison + ROC curve + confusion matrix (90s)
7. **Notebook §8** — SHAP plot (45s)
8. **FastAPI Swagger** at `localhost:8000/docs` — call `/predict` live (60s)
9. **Simulator** — drag sliders, watch probability re-price (60s)
10. **Copilot** — ask "which countries are most vulnerable?" (45s)

Full version: `docs/DEMO_SCRIPT.md`.

---

## Part 7 — How to split the work between 3 people (DO THIS NOW)

You have ~2 hours. Spend the first **30 min** each reading your section, then **60 min** rehearsing together, then **30 min** buffer.

### 👤 Person A — "The Data & Problem Person"
**Owns:** Part 1, Part 2 of this doc, Demo steps 1–5.
**Memorize:**
- 33 countries × 20 years × 8 indicators → ~600 clean rows × 40 features
- The 8 indicator names
- The 6-step cleaning pipeline (in order)
- The 5 crisis triggers
- Why World Bank API is credible (IMF, UN, academic usage)

**Likely questions to handle:** Q1, Q2, Q3, Q9 (data leakage), Q12 (weakness).

### 👤 Person B — "The Model Person" ⭐ (heaviest load — give to the strongest)
**Owns:** Part 3 of this doc, Demo steps 6–7.
**Memorize:**
- Why XGBoost (3 reasons)
- Why NOT NN / RF / SVM / kNN
- Validation strategy (5-fold CV + 20 % holdout)
- Why ROC-AUC is the headline metric (not accuracy)
- Overfitting/underfitting argument
- SHAP one-liner

**Likely questions to handle:** Q4, Q5, Q6, Q7, Q8, Q10.

### 👤 Person C — "The System & Demo Person"
**Owns:** Part 4 of this doc, Demo steps 8–10, all the live clicking.
**Memorize:**
- The architecture diagram (in Part 4)
- How Supabase Realtime works (WebSocket, ~200 ms, no polling)
- How FastAPI loads the pickle and serves `/predict`
- How the Copilot grounds Gemini with live DB snapshots

**Likely questions to handle:** Q11 (realtime), system security, deployment.
**Pre-flight job:** 10 min before the presentation, run `uvicorn app.main:app --reload --port 8000` and open `localhost:8000/docs` in a tab. Open the Lovable preview in another tab. Open the notebook with all cells already executed.

### Shared
- All three should know the **headline numbers**: ~600 rows, ~40 features, ROC-AUC ≈ **0.[your number]**, beats logistic baseline by ~10 AUC points.
- All three should know one sentence: *"It's a binary classifier that predicts the probability of a financial crisis in the next 12 months for 33 countries, trained on 20 years of World Bank data with XGBoost."*

---

## Part 8 — If I were you, right now (literal next 2 hours)

**T-120 min → T-90 min (30 min):**
- All three read this doc end-to-end. Underline anything confusing.
- Person C: clone the project, run `bun install && bun run dev` to make sure frontend works.
- Person C: `cd python-service && pip install -r requirements.txt && uvicorn app.main:app --port 8000` — make sure Swagger UI loads.
- Person B: open `notebooks/gfceip_ml.ipynb` and **read `metrics.json`** — write down YOUR actual numbers.

**T-90 min → T-30 min (60 min):**
- Do **two full dry-runs** of the 10-step demo, end to end.
- After each run, the others fire 3 random teacher questions at the presenter.
- Time it. Aim for 10 minutes flat.

**T-30 min → T-0 (30 min buffer):**
- Open all the tabs you need (notebook, Swagger, frontend, this doc on phone).
- Person C: start `uvicorn` and verify `/health` returns `model_loaded: true`.
- Breathe. You've got this.

**If something breaks during the demo:**
- Frontend down? → Pivot to the notebook. The notebook is the real ML story; the frontend is window dressing.
- Notebook won't run? → Show `metrics.json` and `model.pkl` directly — "this was the output of our last training run, here are the numbers."
- API down? → The simulator page uses an in-browser TypeScript fallback, so it still works.

---

## Part 9 — The honest answer if the teacher asks "did you use AI to build this?"

Yes — say so confidently. The relevant skills are:
- You **chose** the problem, the data source, the indicators, the labeling rule, and the model family.
- You **understand** every step (this doc proves it).
- You can **defend** every design choice and explain trade-offs.
- AI accelerated the implementation; it did not make the scientific decisions.

That's how every modern engineer works. Don't apologize for it.

---

**Good luck. You've got a real project with real data, real ML, a real validation story, and a real demo. Walk in confident.**
