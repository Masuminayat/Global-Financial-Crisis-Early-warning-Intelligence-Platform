# GFCEIP — Global Financial Crisis Early Warning & Economic Intelligence Platform

A real-time, open-access macro stability platform monitoring **33 economies**, **6 crisis types**, across **3 forecast horizons**, with a composite **GFSS (Global Financial Stability Score)** for every market.

> **Stack note**: The original spec called for Next.js + FastAPI + Celery + XGBoost. That stack is not buildable in this environment. GFCEIP runs on **TanStack Start + Lovable Cloud (Supabase)** with TypeScript-based risk models and the **Lovable AI Gateway** for LLM features. Everything below is what actually ships and runs.

---

## ✨ What's inside

| Page | Route | What it does |
|---|---|---|
| Landing | `/` | Hero, live ticker, vulnerability board, regional bands |
| Global Dashboard | `/dashboard` | Stability distribution chart, full market table, live alerts (realtime) |
| Country Intelligence | `/country/$slug` | Per-country macro KPIs, 24-month trend chart, full crisis probability matrix |
| Pakistan Center | `/pakistan` | Dedicated 🇵🇰 deep-dive: SBP reserves, PKR index, CPI, debt, crisis matrix |
| Compare | `/compare?a=…&b=…` | Side-by-side two-country comparison + head-to-head CPI chart |
| Policy Simulator | `/simulator?iso=…` | 8 macro sliders → live recomputation of 6 crisis probabilities (logistic model) |
| Crisis Explorer | `/crisis-explorer` | Historical crisis library with warning-signal tags |
| AI Copilot | `/copilot` | Chat grounded in live GFCEIP data via Lovable AI Gateway (Gemini 2.5 Flash) |

---

## 🏗️ Architecture

```
Browser (React 19 + TanStack Router + TanStack Query + Recharts)
   │
   ├─ Realtime subscriptions ─────► Supabase Realtime (alerts channel)
   ├─ Direct reads (public RLS) ───► Supabase Postgres
   └─ createServerFn RPC ──────────► TanStack server runtime (Cloudflare Worker)
                                       │
                                       ├─ supabaseAdmin (service-role)
                                       └─ Lovable AI Gateway (LLM completions)
```

### Database (Supabase Postgres, RLS on, public read)

| Table | Purpose |
|---|---|
| `countries` | 33 monitored economies (ISO, slug, region, GDP, population, flag) |
| `economic_indicators` | 8 indicators × 33 countries × 24 months ≈ 6,300 rows |
| `gfss_scores` | Composite stability score + category + 30D trend per country |
| `risk_scores` | Crisis probability per (country × crisis_type × horizon) |
| `forecasts` | Indicator forecasts with confidence intervals |
| `crisis_events` | Historical crisis catalogue |
| `news_articles` | News feed with LLM-scored sentiment |
| `sentiment_index` | Aggregated country sentiment |
| `model_versions` | Model registry with ROC/AUC metadata |
| `alerts` | Realtime alert stream (Supabase Realtime enabled) |

All tables have `GRANT SELECT … TO anon, authenticated` and a permissive `SELECT … USING (true)` RLS policy. Writes are blocked at the policy layer and only happen via the service-role `supabaseAdmin` client inside server functions.

### Risk model

`src/routes/simulator.tsx` ships a deterministic **logistic regression** for each of the 6 crisis types. Coefficients are illustrative defaults; replace with calibrated values from your training pipeline. The composite **GFSS** is precomputed during seeding from inflation, reserves, debt, current account, growth, and unemployment z-scores.

### AI Copilot

`src/lib/copilot.functions.ts` is a `createServerFn` that:
1. Loads the 20 most-vulnerable countries and 10 most-recent alerts from Supabase via `supabaseAdmin`.
2. Stuffs that JSON into the system prompt as **grounding context**.
3. Forwards `{system, history, user}` to `https://ai.gateway.lovable.dev/v1/chat/completions` with `google/gemini-2.5-flash`.
4. Returns the completion to the React client, which renders it in a chat UI (`/copilot`).

No keys are exposed to the browser — `LOVABLE_API_KEY` is read inside the server handler.

---

## 🎨 Design system

"Bloomberg Terminal × Vercel" — dense, dark-first, neon accents. Defined in `src/styles.css`:

- **Tokens**: `oklch()` color space, semantic risk palette (`--risk-critical`, `--risk-high`, `--risk-moderate`, `--risk-low`, `--risk-strong`), neon accents (`--cyan`, `--magenta`, `--amber`, `--lime`), three layered surfaces.
- **Fonts**: Inter (UI) + JetBrains Mono (tabular data / tickers).
- **Utilities**: `.glass`, `.glass-strong`, `.text-glow-cyan`, `.ring-glow-cyan`, `.bg-grid`, `.bg-dots`, `.ticker-track`, `.live-dot`, `.num`, `.fade-in`.
- **Layouts**: 1600px max container, sticky glass nav, semantic risk colors on every number.

All components consume tokens — no hardcoded hex values.

---

## 🚀 Running it

The app is **already running in your Lovable preview**. To use it:

1. Open **`/`** for the landing page.
2. Click **Dashboard** to see the live market table + alerts feed.
3. Visit **`/pakistan`** for the country deep-dive.
4. Try **`/simulator`** — drag a slider on inflation or reserves and watch all 6 crisis probabilities re-price.
5. Open **`/copilot`** and ask: *"Which countries have the lowest stability scores?"*

### Required secret
- `LOVABLE_API_KEY` — already provisioned in this Cloud project. Copilot won't work without it.

---

## 🗂️ Project layout

```
src/
  components/
    AppShell.tsx              # Sticky nav + footer wrapper
    ui/                       # shadcn primitives (pre-existing)
  integrations/supabase/      # auto-generated clients (do not edit)
  lib/
    copilot.functions.ts      # createServerFn: AI Copilot
    format.ts                 # number/color formatters
  routes/
    __root.tsx                # Root layout + error/404 boundaries
    index.tsx                 # Landing
    dashboard.tsx             # /dashboard
    country.$slug.tsx         # /country/:slug
    pakistan.tsx              # /pakistan
    compare.tsx               # /compare?a=&b=
    simulator.tsx             # /simulator?iso=
    crisis-explorer.tsx       # /crisis-explorer
    copilot.tsx               # /copilot
  styles.css                  # Design tokens + utilities
supabase/migrations/          # Schema migrations (RLS + grants included)
```

---

## 🛣️ What's deliberately scoped out (vs. original spec)

The original spec described a 9-engineer team building a multi-service production SaaS. To ship something **real and running today**, the following were simplified or deferred:

| Spec item | Status | Notes |
|---|---|---|
| Python/FastAPI + Celery + Redis | ❌ Not used | TanStack server functions replace them |
| XGBoost / SHAP / Prophet / FinBERT | ❌ Replaced | TypeScript logistic models + LLM sentiment |
| Clerk auth + roles | ⏳ Deferred | Lovable Cloud auth is available; not yet wired |
| Real ingestion cron (World Bank/FRED/IMF) | ⏳ Deferred | Schema + seed data in place; cron route scaffolding ready |
| PDF report generation | ⏳ Deferred | Server route + `@react-pdf/renderer` is the path |
| Leaflet world heatmap | ⏳ Deferred | Recharts powers all charts today |
| Mobile QA pass | ✅ Responsive base | Designed at 375 / 768 / 1440 breakpoints |
| WCAG 2.1 AA | ⚠️ Best-effort | Semantic HTML, contrast verified in dark mode |

Anything in the "deferred" column is a follow-on chat away — say the word.

---

**GFCEIP** © 2026 · Built for transparency in global macro risk.
