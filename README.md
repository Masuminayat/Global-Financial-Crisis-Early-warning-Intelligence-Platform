# GFCEIP — Global Financial Crisis Early-Warning & Economic Intelligence Platform

> Course-grade deliverable. Real public-API data → reproducible ML pipeline → deployable Python service → live web app with realtime updates and AI copilot.

---

## 📦 What's in this repo

```
.
├── notebooks/
│   ├── build_notebook.py        ← run once to regenerate the .ipynb
│   └── gfceip_ml.ipynb          ← ⭐ MAIN ML DELIVERABLE — open in Jupyter / VSCode
├── python-service/              ← FastAPI + XGBoost inference service
│   ├── app/main.py
│   ├── app/artifacts/           ← model.pkl + metrics.json + plots (created by notebook)
│   ├── tests/test_api.py
│   ├── Dockerfile · Procfile · requirements.txt
│   └── README.md
├── docs/                        ← 📖 ALL EXPLANATION FOR THE TEACHER
│   ├── ARCHITECTURE.md          ← system diagram + stack rationale
│   ├── ML_REPORT.md             ← data, cleaning, labeling, model, validation
│   ├── API_REFERENCE.md         ← every endpoint, request/response shape
│   ├── DEMO_SCRIPT.md           ← 10-minute live demo script (read out loud)
│   └── TEACHER_QA.md            ← 14 anticipated Q&A — practice these
├── src/                         ← TanStack Start frontend (already running in Lovable)
└── supabase/migrations/         ← Postgres schema + RLS
```

---

## 🚀 Quick start (VSCode workflow)

### 1) Frontend (already deployed in Lovable)
Open the **Preview URL** at the top of this chat. All pages work out of the box.

### 2) Train the model
```bash
cd notebooks
python build_notebook.py            # regenerates gfceip_ml.ipynb
pip install jupyter pandas scikit-learn xgboost shap requests matplotlib seaborn
jupyter notebook gfceip_ml.ipynb    # → Cell → Run All
```
Artifacts (`model.pkl`, `metrics.json`, `roc_curve.png`, `shap_summary.png`, `confusion_matrix.png`) appear under `python-service/app/artifacts/`.

### 3) Run the Python API
```bash
cd python-service
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
```
Open <http://localhost:8000/docs> for live Swagger UI. Try `POST /predict`.

### 4) Run the tests
```bash
cd python-service && pytest tests/ -v
```

### 5) (Optional) Deploy the API
```bash
docker build -t gfceip-ml python-service
docker run -p 8000:8000 gfceip-ml
```
Or push to **Render / Railway / Fly.io** — Dockerfile + Procfile included.

---

## 🧠 The Machine Learning, in one page

| Question | Answer |
|---|---|
| Data source | World Bank Open Data REST API (`api.worldbank.org/v2/`) |
| Coverage | 33 countries × 8 indicators × 20 years (2004–2023) |
| Cleaning | 6-step pipeline (ffill → interp → regional median → outlier clip) |
| Label rule | Frankel-Rose / Kaminsky-Reinhart 5-trigger crisis definition |
| Features | 8 raw + rolling mean/std + YoY deltas + region one-hots ≈ 40 features |
| Model | XGBoost (`max_depth=4`, `lr=0.05`, `n_estimators=300`) |
| Baseline compared | Logistic Regression (`class_weight="balanced"`) |
| Validation | Stratified 5-Fold CV + held-out 20 % test set |
| Metrics | Accuracy, Precision, Recall, F1, **ROC-AUC** |
| Explainability | SHAP TreeExplainer (with permutation-importance fallback) |
| Leakage prevention | All rolling features `.shift(1)`, stratified split, seeded |

**Full report:** [`docs/ML_REPORT.md`](docs/ML_REPORT.md).

---

## 🌐 Live web app pages

| Route | Purpose |
|---|---|
| `/` | Landing, live ticker, vulnerability board |
| `/dashboard` | 33-country stability board + **realtime** alerts (WebSocket) |
| `/pakistan` | Country deep-dive — KPIs, 24-month trends, crisis matrix |
| `/country/$slug` | Generic country page |
| `/compare?a=…&b=…` | Side-by-side comparison |
| `/simulator` | 8 sliders → live crisis probabilities (calls Python API or TS fallback) |
| `/crisis-explorer` | Historical crisis catalogue |
| `/copilot` | AI chat grounded in live DB (Gemini 2.5 Flash via Lovable AI Gateway) |

---

## 📚 Read these before presenting

1. **[`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md)** — the system diagram you'll show first.
2. **[`docs/ML_REPORT.md`](docs/ML_REPORT.md)** — every methodological choice, justified.
3. **[`docs/DEMO_SCRIPT.md`](docs/DEMO_SCRIPT.md)** — 10-minute step-by-step demo with what-to-say lines.
4. **[`docs/TEACHER_QA.md`](docs/TEACHER_QA.md)** — 14 likely questions, with answers. Rehearse these.
5. **[`docs/API_REFERENCE.md`](docs/API_REFERENCE.md)** — every endpoint, every payload shape.

---

## 🔐 Security & reproducibility

- All Supabase tables have **Row-Level Security**; writes only via service-role inside server functions.
- LLM key (`LOVABLE_API_KEY`) read server-side only — never shipped to the browser.
- Notebook seed is fixed (`np.random.seed(42)`) — your run reproduces exactly.
- Pydantic validation on every FastAPI payload.

---

**GFCEIP © 2026** — built for transparency in global macro risk.
