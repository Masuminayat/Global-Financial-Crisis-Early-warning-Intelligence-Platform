# GFCEIP — API Reference

Two API surfaces:

1. **Python ML service** (FastAPI) — `http://localhost:8000` in dev.
2. **Lovable Cloud / Supabase** — read-only REST + Realtime for the database.

---

## 1. Python ML Service

Auto-generated Swagger UI: <http://localhost:8000/docs>.

### `GET /health`

```json
{
  "status": "ok",
  "model_loaded": true,
  "n_features": 40,
  "metrics": {"accuracy": 0.86, "roc_auc": 0.91, "precision": 0.78, "recall": 0.74, "f1": 0.76}
}
```

### `GET /metrics`
Returns the full `metrics.json` exported by the notebook (CV folds + test set).

### `GET /indicators`
```json
{
  "raw": ["cpi_inflation", "reserves_usd", "current_account_pct_gdp",
          "govt_debt_pct_gdp", "gdp_growth", "unemployment",
          "real_interest_rate", "exports_pct_gdp"],
  "regions": ["EAS","ECA","EUR","LAC","MEA","NAC","SAS","SSA"],
  "engineered": ["<indicator>_ma3","<indicator>_std3","<indicator>_d1"]
}
```

### `POST /predict`

Request:
```json
{
  "cpi_inflation": 25.0,
  "reserves_usd": 8000000000,
  "current_account_pct_gdp": -4.5,
  "govt_debt_pct_gdp": 78.0,
  "gdp_growth": -1.2,
  "unemployment": 8.5,
  "real_interest_rate": 7.5,
  "exports_pct_gdp": 12.0,
  "iso3": "PAK",
  "region": "SAS"
}
```
Response:
```json
{
  "crisis_probability": 0.82,
  "risk_level": "CRITICAL",
  "model_version": "xgb-1.0",
  "top_drivers": [
    {"feature": "cpi_inflation", "contribution": 0.31},
    {"feature": "reserves_usd", "contribution": 0.18},
    {"feature": "govt_debt_pct_gdp", "contribution": 0.12}
  ]
}
```

### `POST /predict/batch`
Same payload wrapped as `{"items":[...]}`. Returns `{"results":[...]}`.

### Errors
- **400** — Pydantic validation error (bad number / missing field).
- **503** — Model artifacts not loaded; run the notebook first.

---

## 2. Lovable Cloud (Supabase) — frontend reads directly

The browser uses the Supabase JS client with the **publishable (anon) key** — safe to ship.

```ts
import { supabase } from "@/integrations/supabase/client";

// 1. Read 33 countries
const { data } = await supabase.from("countries").select("*").order("name");

// 2. Stability scores joined with country names
const { data: gfss } = await supabase
  .from("gfss_scores")
  .select("country_iso, score, category, trend_30d, countries(name, region, flag_emoji)")
  .order("score", { ascending: true });

// 3. 24-month time series for one country
const { data: series } = await supabase
  .from("economic_indicators")
  .select("indicator_code, period_date, value")
  .eq("country_iso", "PAK")
  .order("period_date", { ascending: true });

// 4. Realtime alerts — pushed over WebSocket
supabase
  .channel("alerts")
  .on("postgres_changes",
      { event: "INSERT", schema: "public", table: "alerts" },
      (payload) => console.log("new alert", payload.new))
  .subscribe();
```

### Tables (read-only via RLS)

| Table | Use |
|---|---|
| `countries` | Master list of 33 economies |
| `economic_indicators` | Raw time series (8 indicators × 33 countries × 24 months) |
| `gfss_scores` | Composite stability score per country |
| `risk_scores` | Crisis-type × horizon probabilities |
| `forecasts` | Indicator forecasts with confidence bands |
| `crisis_events` | Historical crisis catalogue |
| `alerts` | **Realtime-enabled** — live notification stream |
| `news_articles` + `sentiment_index` | News feed + LLM sentiment |
| `model_versions` | Model registry (algorithm, ROC-AUC, trained_at) |

---

## 3. AI Copilot (TanStack server function)

`POST /api/copilot` (via `useServerFn(askCopilot)` in `src/routes/copilot.tsx`).

Server reads `LOVABLE_API_KEY` from env, attaches a live DB snapshot (top 20 vulnerable countries + 10 most-recent alerts), forwards to **Gemini 2.5 Flash** via the Lovable AI Gateway. No keys leave the server.
