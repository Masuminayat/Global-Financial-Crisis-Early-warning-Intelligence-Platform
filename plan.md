# Real Data Pipeline — End-to-End

Right now the dashboard reads from hand-seeded rows in `gfss_scores`, `alerts`, `crisis_events`, and `risk_scores`. The trained XGBoost model (test F1 = 0.844) sits unused at `python-service/app/artifacts/model.pkl`. This plan rips out the seeded numbers and wires every dashboard value to **real World Bank data scored by the real model**, refreshed on a schedule.

## What changes

### 1. New pipeline script: `python-service/refresh_pipeline.py`
A single command that runs the full loop for all 206 countries:

1. **Fetch** — World Bank API for 8 indicators × 206 countries × 2000–current (same call used in `train_model.py`).
2. **Preprocess** — pivot, forward-fill, interpolate, winsorize (reuses `prepare_dataset`).
3. **Feature engineer** — lag1, ma3, std3, d1, region one-hots (52 features).
4. **EDA snapshot** — write summary stats (rows per country, missingness, class balance, last-year coverage) to `python-service/app/artifacts/eda.json`.
5. **Score** — load `model.pkl`, run `predict_proba` on the **latest year** row for each country.
6. **Write to Supabase** — for each country, upsert:
   - `economic_indicators` — raw fetched rows (full history)
   - `gfss_scores` — `score = round((1 − crisis_prob) × 100)`, `category` derived from probability bands, `trend_30d` = score delta vs previous-year prediction
   - `risk_scores` — probability, risk level, top-5 SHAP-style drivers, model version, CI bounds
   - `alerts` — auto-generated when any indicator crosses a hard threshold (inflation > 25%, reserves YoY < −30%, debt/GDP > 90%, current-account < −8%, GDP growth < −3%) **using the freshly fetched values**, deduped by `(country_iso, indicator_code, triggered_at::date)`
7. **Optional retrain** — if `--retrain` flag is passed, run `train_model.run_training()` first so the model reflects the newest year.

### 2. Wipe seeded rows, replace with real ones
One-time migration step inside the refresh script:
- `DELETE FROM gfss_scores`
- `DELETE FROM risk_scores`
- `DELETE FROM alerts WHERE indicator_code IS NOT NULL` (keep any hand-authored editorial alerts if present — there aren't any)
- Then insert the freshly-computed rows.

`crisis_events` is **historical** (Argentina 2001, Sri Lanka 2022, etc.) — those stay as-is, they are real events, not predictions.

### 3. Continuous refresh
Two trigger paths so "new data in API → re-run all steps" actually happens:

- **Scheduled (default):** `pg_cron` job calls a new public TanStack server route `/api/public/hooks/refresh-pipeline` once per day at 03:00 UTC. The route shells out to the Python service's `/refresh` endpoint.
- **On-demand:** A new FastAPI endpoint `POST /refresh` in `python-service/app/main.py` that runs `refresh_pipeline.run()` and returns a summary (rows fetched, countries scored, alerts triggered, model version, elapsed seconds). Protected by a shared secret header so cron and the user can hit it but the public cannot.

### 4. Frontend — surface real-ness, no UI rebuild
Small additions only (you asked to keep UI work to UI):
- Dashboard header: add a "Last refreshed: {timestamp} · Model: {version} · Test F1: 0.844" strip, pulled from `risk_scores.generated_at` + `metrics.json`.
- Each GFSS card: tooltip showing the top-3 driver features and their contribution (from `risk_scores.top_drivers`).
- "Refresh now" button (admin-style, no auth gate for now) that hits `/api/public/hooks/refresh-pipeline` and toasts the result.

## Technical details

**Files created**
- `python-service/refresh_pipeline.py` — orchestrator
- `python-service/supabase_writer.py` — thin wrapper around `supabase-py` for upserts
- `src/routes/api/public/hooks/refresh-pipeline.ts` — TanStack server route, verifies shared secret, calls Python service
- `python-service/app/artifacts/eda.json` — generated EDA snapshot

**Files edited**
- `python-service/app/main.py` — add `/refresh` POST endpoint
- `python-service/requirements.txt` — add `supabase` python client
- `src/routes/dashboard.tsx` — add freshness strip + driver tooltip + refresh button
- `src/routes/index.tsx` — same freshness strip on landing

**Secrets needed**
- `REFRESH_SHARED_SECRET` (new) — used by cron header + Python endpoint guard
- Python service needs `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` env vars (already available in Lovable Cloud, will be passed to the Python service deployment)

**Cron** — installed via `supabase--insert` after route ships:
```sql
SELECT cron.schedule('refresh-gfceip-daily', '0 3 * * *', $$
  SELECT net.http_post(
    url := 'https://project--58f21921-eaf7-44ce-b75f-132f06e1a1a8.lovable.app/api/public/hooks/refresh-pipeline',
    headers := '{"Content-Type":"application/json","x-refresh-secret":"<secret>"}'::jsonb,
    body := '{}'::jsonb
  );
$$);
```

**Important caveat about "real-time"**
World Bank macro indicators publish **annually** (some quarterly). There is no minute-by-minute stream — calling the API every second returns the same value. Daily refresh is the practical maximum and matches how every real EWS (IMF, World Bank's own GEP) operates. If you want intra-day movement, that needs a different data source (Trading Economics, market FX feeds) — say the word and I'll add it as a second adapter.

## Order of operations

1. Add `REFRESH_SHARED_SECRET` via secrets tool.
2. Write `refresh_pipeline.py` + `supabase_writer.py` + extend `main.py`.
3. Add `supabase` to `requirements.txt`.
4. Run pipeline once locally → confirm Supabase tables now have real predictions for all 206 countries.
5. Add TanStack hook route + small UI additions (freshness strip, driver tooltip, refresh button).
6. Install pg_cron job.
7. Verify dashboard shows real scores and the refresh button works.

Approve and I'll execute steps 1–7 in order.
