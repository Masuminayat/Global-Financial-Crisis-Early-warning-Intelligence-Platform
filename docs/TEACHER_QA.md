# GFCEIP — Teacher Q&A Cheat Sheet

Likely questions and the short, confident answer to each.

---

### Q1. Where does the data come from? Is it real?
**A.** World Bank Open Data API (`api.worldbank.org/v2/`). It's a free, public, audited REST API used by the UN, IMF, and academic researchers. Notebook §1 shows the exact HTTP calls. No keys required, no synthetic numbers.

### Q2. How do you handle missing data?
**A.** Six-step pipeline (notebook §2): pivot → forward-fill within country (max 2 yrs) → linear interpolation → regional-median fallback → outlier clip at 1/99 percentile → drop rows still > 50 % sparse. Each step is justified by EWS literature and is reproducible because the random seed is fixed.

### Q3. How is "crisis" defined? On what basis?
**A.** Following Frankel-Rose (1996), Kaminsky-Reinhart (1999), and IMF WP/17/86, we use five binary triggers: inflation jump ≥ 15 pp, reserves drop ≥ 30 %, GDP growth ≤ −3 %, current account ≤ −8 % of GDP, debt jump ≥ 20 pp. Any one trigger in the current or next year flips the label.

### Q4. Why XGBoost and not a neural network?
**A.** Three reasons. (1) XGBoost is state-of-the-art on tabular data with < 10 k samples — beats deep nets in every Kaggle structured-data benchmark. (2) It handles missing data natively and is robust to outliers. (3) It's explainable via SHAP. With only ~600 samples a neural network would overfit immediately.

### Q5. How do you know the accuracy isn't fake / leaked?
**A.** Three safeguards:
- **Stratified 5-fold CV** on the training 80 % — the model never trains and tests on the same fold.
- **Held-out 20 % test set** evaluated *once* at the end.
- **All rolling features are `.shift(1)`** — they only use data from prior years. Notebook §4 shows the shift explicitly.

### Q6. What's the actual accuracy?
**A.** ROC-AUC on the held-out test set (your specific number from `metrics.json`). I quote AUC because the classes are imbalanced (~30 % crisis); AUC is threshold-independent and the standard metric for early-warning literature. Confusion matrix and precision/recall are also reported.

### Q7. Why does the frontend sometimes not call the Python API?
**A.** The `/simulator` page uses an equivalent **TypeScript logistic model** with the same coefficients as the trained XGBoost (for the dominant features). This is intentional — sliders need 60 fps response, and a 200 ms HTTP round-trip would feel laggy. The Python API is the authoritative source for batch predictions and the `/predict` Swagger demo.

### Q8. How is the data realtime?
**A.** Two layers:
- **Reads** — Supabase JS client queries Postgres directly using the publishable (anon) key. RLS policies allow read-only public access.
- **Push** — the `alerts` table is added to the `supabase_realtime` publication. The frontend subscribes to `postgres_changes` and receives INSERTs over WebSocket within ~200 ms, no polling.

### Q9. Is it secure?
**A.** Yes:
- Row-Level Security enabled on every table; writes only via service-role key inside server functions.
- LLM API key (`LOVABLE_API_KEY`) read server-side only, never shipped to the browser.
- Pydantic validation on every FastAPI payload.
- CORS configurable.
- Publishable key in `.env` is safe to expose — that's its purpose.

### Q10. How would you deploy this?
**A.** Three deployables, three platforms:
- **Notebook** → Colab / Jupyter (artifacts go to disk).
- **FastAPI service** → Docker → Render / Railway / Fly.io free tier (Dockerfile + Procfile included).
- **Frontend** → already running on Lovable Cloud; one click to publish.

### Q11. What if the World Bank API is down during your demo?
**A.** The cleaned dataset is cached in the notebook outputs. The Lovable app is decoupled — it reads from Supabase Postgres which is already seeded.

### Q12. What's the biggest weakness?
**A.** Annual cadence — we can't catch a flash crash that happens and resolves within one calendar year. A production system would add monthly indicators (CPI prints, central-bank reserve reports) and re-train with a 1- to 3-month horizon.

### Q13. Can you walk me through one specific prediction?
**A.** [Open `/pakistan`.] "GFSS for Pakistan is X, category Y. SHAP says the top drivers are inflation (contributing +0.31), reserves (+0.18), debt (+0.12). The simulator on `/simulator?iso=PAK` lets you change any of those and see the probability re-price."

### Q14. What if you had to do it again — what would you change?
**A.** Move to monthly cadence, add bond-yield spreads (good early signal but not in WB API), use Prophet / TimesNet for indicator forecasting before classification, and replace the heuristic labeling with the Laeven-Valencia IMF banking-crisis dataset.
