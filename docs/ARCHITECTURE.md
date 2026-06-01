# GFCEIP — System Architecture

## High-level diagram

```
┌──────────────────────────────────────────────────────────────────────┐
│                      JUPYTER NOTEBOOK (offline)                      │
│  notebooks/gfceip_ml.ipynb                                           │
│  · pulls World Bank Open Data API                                    │
│  · cleans, engineers features, labels crises                         │
│  · trains XGBoost + validates (5-fold CV + held-out)                 │
│  · exports model.pkl + metrics.json + ROC/SHAP plots                 │
└────────────┬─────────────────────────────────────────────────────────┘
             │ artifacts/
             ▼
┌──────────────────────────────────────────────────────────────────────┐
│                  PYTHON FASTAPI SERVICE (deployable)                 │
│  python-service/                                                     │
│  GET  /health        liveness + loaded model version + metrics       │
│  GET  /metrics       full validation report                          │
│  POST /predict       single-vector crisis probability                │
│  POST /predict/batch many vectors at once                            │
│  Docker + Render/Railway/Fly.io ready                                │
└────────────┬─────────────────────────────────────────────────────────┘
             │ HTTPS  (optional — frontend also has TS fallback)
             ▼
┌──────────────────────────────────────────────────────────────────────┐
│              LOVABLE FRONTEND (TanStack Start, React 19)             │
│  /              landing + live ticker                                │
│  /dashboard     33-country stability board, realtime alerts          │
│  /pakistan      country deep-dive (KPIs, trends, crisis matrix)      │
│  /country/$slug generic country page                                 │
│  /compare       two-country side-by-side                             │
│  /simulator     8-slider what-if (calls /predict or TS fallback)     │
│  /crisis-explorer  historical crisis catalogue                       │
│  /copilot       AI chat grounded in live DB (Gemini via Lovable AI)  │
└────────────┬─────────────────────────────────────────────────────────┘
             │ supabase-js                Realtime (WebSocket)
             ▼                            ▼
┌──────────────────────────────────────────────────────────────────────┐
│           LOVABLE CLOUD (Supabase Postgres + Realtime + Auth)        │
│  10 tables (countries, indicators, gfss_scores, risk_scores,         │
│  forecasts, crisis_events, news_articles, sentiment_index,           │
│  model_versions, alerts) — all RLS-enabled, public-read              │
│  alerts → Realtime publication for live notifications                │
└──────────────────────────────────────────────────────────────────────┘
```

## Stack rationale

| Layer | Choice | Why |
|---|---|---|
| Notebook | Jupyter + scikit-learn + XGBoost + SHAP | Industry standard for reproducible ML reporting |
| API service | FastAPI + Uvicorn | Async, auto Swagger, Pydantic validation, fastest Python web stack |
| Container | Docker (python:3.11-slim) | Portable to any cloud or grader's laptop |
| Frontend | TanStack Start (React 19) | SSR + file-based routing + type-safe RPC via `createServerFn` |
| Database | Postgres (Supabase) | Relational fit for time-series indicators + Row-Level Security |
| Realtime | Supabase Realtime (Postgres → WebSocket) | Push alerts to all open dashboards within ~200 ms |
| AI Copilot | Lovable AI Gateway → Gemini 2.5 Flash | No API key management, grounded in live DB snapshot |

## Data flow — end to end

1. **Notebook** pulls 33 countries × 8 indicators × 20 years from World Bank.
2. **Cleaning pipeline** (ffill → interp → regional median → outlier-clip) imputes missing values.
3. **Labeling rule** (Frankel-Rose / Kaminsky-Reinhart inspired) flags crisis years.
4. **Feature engineering** adds rolling means, rolling std, year-over-year deltas, region one-hots — all `.shift(1)` so no future leakage.
5. **XGBoost** trained with stratified 5-fold CV → ROC-AUC reported.
6. **Artifacts** (`model.pkl`, `metrics.json`, `roc_curve.png`, `shap_summary.png`) saved under `python-service/app/artifacts/`.
7. **FastAPI** loads artifacts at startup and serves `/predict`.
8. **Frontend simulator** either calls FastAPI or runs an equivalent TS logistic model offline.
9. **Realtime alerts** are written to the `alerts` table; every connected dashboard receives them through Supabase's Realtime channel without polling.

## Security

- All Supabase tables enforce **Row-Level Security** with public-read policies (anon → read-only). Writes only via service-role inside server functions.
- FastAPI uses Pydantic validation on every payload (rejects malformed numbers, out-of-range values).
- CORS is open on the read API; tighten with `allow_origins=[FRONTEND_URL]` before production.
- LLM key (`LOVABLE_API_KEY`) is read inside the TanStack server function — never exposed to the browser.
