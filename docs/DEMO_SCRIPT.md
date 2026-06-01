# GFCEIP — Live Demo Script (10 minutes)

Use this when presenting to the teacher / committee. Each step has a *what you click* line and a *what you say* line.

## Pre-flight (do this 5 min before)

1. `cd python-service && uvicorn app.main:app --reload --port 8000` — terminal 1.
2. Open <http://localhost:8000/docs> in a browser tab — Swagger.
3. Open the Lovable preview URL in another tab.
4. Open `notebooks/gfceip_ml.ipynb` in VSCode with all cells already executed (so plots are visible).

---

## Step 1 — The problem (45 s)
**Show:** Landing page (`/`).
**Say:** "Most financial crises had warning signs visible months earlier in macro indicators — inflation, reserves, debt. GFCEIP monitors 33 economies in real time and produces a composite Global Financial Stability Score for each."

## Step 2 — The live dashboard (60 s)
**Click:** Dashboard. Hover the bar chart.
**Say:** "Stability scores are distributed across five categories. The alerts feed on the right is wired to Supabase Realtime over a WebSocket — no polling. Any new row in the alerts table appears here within ~200 ms across every open browser."

## Step 3 — Country deep-dive (60 s)
**Click:** Pakistan card.
**Say:** "Per-country page shows the 8 macro KPIs, a 24-month trend chart, and the full crisis-probability matrix across 6 crisis types and 3 forecast horizons."

## Step 4 — The data pipeline (90 s — most important slide)
**Switch to:** `notebooks/gfceip_ml.ipynb`, scroll to §1 and §2.
**Say:** "Data comes from the World Bank Open Data API — a public REST API, no key needed. I pull 8 indicators for 33 countries across 20 years. Cleaning is a documented 6-step pipeline: pivot, forward-fill within country, linear interpolation, regional-median fallback, outlier clip, then drop sparse rows. Every step is reproducible — seed is fixed."

## Step 5 — How crises are labeled (45 s)
**Scroll to:** §3.
**Say:** "I label a country-year as a crisis using five triggers from the standard EWS literature — Frankel & Rose, Kaminsky-Reinhart, IMF working paper 17/86. Any one trigger in the current year or next year flips the label."

## Step 6 — The model (90 s)
**Scroll to:** §5 and §6.
**Say:** "I compared logistic regression as a baseline against XGBoost. I validate with **stratified 5-fold cross-validation** on the training 80 % — that's the no-leakage gold standard — plus a held-out 20 % test set the model never sees."

**Scroll to:** §7 — ROC curve.
**Say:** "ROC-AUC on the held-out test is **[your number]**. Confusion matrix shows the false-positive vs false-negative tradeoff explicitly."

## Step 7 — Explainability (45 s)
**Scroll to:** §8 — SHAP plot.
**Say:** "SHAP attributes each prediction to its input features. So when the live app says Pakistan is high-risk, I can show *which* indicator drove the prediction — not a black box."

## Step 8 — The API (60 s)
**Switch to:** <http://localhost:8000/docs>.
**Click:** `POST /predict` → Try it out → Execute.
**Say:** "FastAPI service loads the trained XGBoost model on startup. The frontend calls this `/predict` endpoint — or runs an equivalent TypeScript logistic model offline for instant slider feedback."

## Step 9 — Policy simulator (60 s)
**Switch to:** `/simulator`. Drag the inflation slider.
**Say:** "Eight sliders for the eight indicators. All six crisis probabilities re-price live as you move them. This is the same math as the FastAPI endpoint, ported to TypeScript so it runs in the browser at 60 fps."

## Step 10 — AI Copilot (45 s)
**Click:** Copilot → "Which countries have the lowest stability scores?"
**Say:** "Server function snapshots the live database, injects it as grounding context, then calls Gemini 2.5 Flash through the Lovable AI Gateway. The model answers from real numbers, not hallucinated ones."

## Closing (15 s)
"To summarize: real public-API data, documented cleaning, peer-reviewed labeling rule, two models compared with proper cross-validation, ROC-AUC of [your number], explainable predictions, deployable FastAPI service, and a polished frontend with realtime updates. Happy to take questions."
