# GFCEIP — Global Financial Crisis Early Intelligence Platform

A real-time dashboard for global financial stability, country risk scoring (GFSS),
alerts, AI macro copilot, and crisis-probability forecasting. Built on TanStack
Start (React 19 + Vite 7) with a Supabase backend and an optional Python ML
service for forecasts and pipeline refreshes.

---

## 1. Tech stack

| Layer | Stack |
|---|---|
| Frontend | React 19, TanStack Start v1, TanStack Router, TanStack Query, Tailwind v4, shadcn/ui, Recharts |
| Backend (in-app) | TanStack `createServerFn` + server routes under `src/routes/api/` |
| Database / Auth / Realtime | Supabase (managed via Lovable Cloud) |
| AI | Lovable AI Gateway (Gemini / GPT family) — keyed by `LOVABLE_API_KEY` |
| ML service (optional) | FastAPI app under `python-service/` |
| Package manager | Bun |

---

## 2. Prerequisites

- **Node.js** ≥ 20 (only needed if you don't have Bun)
- **Bun** ≥ 1.1 — install from https://bun.sh
- **Python** ≥ 3.11 (only if you want to run the ML service)
- A Supabase project (or use Lovable Cloud, which provisions one for you)

---

## 3. Environment variables

Create a `.env` file in the project root (Lovable Cloud auto-generates this
in the hosted environment — for local you fill it in manually):

```env
# --- Public (shipped to the browser) ---
VITE_SUPABASE_URL=https://<your-project-ref>.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=<publishable / anon key>
VITE_SUPABASE_PROJECT_ID=<your-project-ref>

# --- Server-only (used by createServerFn / server routes) ---
SUPABASE_URL=https://<your-project-ref>.supabase.co
SUPABASE_PUBLISHABLE_KEY=<publishable / anon key>
SUPABASE_SERVICE_ROLE_KEY=<service role key>     # NEVER expose to client
LOVABLE_API_KEY=<lovable ai gateway key>          # for AI Copilot
REFRESH_SHARED_SECRET=<long random string>        # for /api/public/hooks/refresh-pipeline

# Optional — only if you run the Python ML service
ML_API_KEY=<≥32 random chars>                     # auth for /predict, /metrics
ALLOWED_ORIGINS=http://localhost:3000,https://gfceip.lovable.app
```

> Build secrets (e.g. private npm tokens) go in Workspace Settings → Build Secrets,
> not `.env`.

---

## 4. Install & run (frontend)

```bash
bun install
bun run dev            # http://localhost:3000
```

Other commands:

```bash
bun run build          # production build
bun run preview        # serve the production build
bun run lint           # eslint
```

---

## 5. Database setup

All schema and seed data live under `supabase/migrations/`. Apply them in order
to a fresh Supabase project:

```bash
# Option A: using the Supabase CLI
supabase db push

# Option B: paste each .sql file into the Supabase SQL editor in numeric order
```

The migrations create the public read tables (`countries`, `gfss_scores`,
`alerts`, `economic_indicators`, `crisis_probabilities`, …), the `profiles`
table, and the row-level security policies.

---

## 6. Optional — Python ML service

```bash
cd python-service
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt

export ML_API_KEY=<same value as in .env>
export REFRESH_SHARED_SECRET=<same value as in .env>
export SUPABASE_URL=...
export SUPABASE_SERVICE_ROLE_KEY=...

uvicorn app.main:app --reload --port 8000
```

Endpoints (all require `x-api-key: $ML_API_KEY` except `/health`):

| Method | Path | Purpose |
|---|---|---|
| GET | `/health` | Liveness probe (public) |
| POST | `/predict` | Single crisis-probability prediction |
| POST | `/predict/batch` | Batch predictions |
| GET | `/metrics` | Model metrics |
| POST | `/refresh` | Triggers the data refresh pipeline. Requires `x-refresh-secret: $REFRESH_SHARED_SECRET` header (NOT a query param). |

---

## 7. Security model (summary)

- **Public-by-design tables**: `countries`, `gfss_scores`, `alerts`,
  `economic_indicators`, `crisis_probabilities` — anonymous SELECT only,
  no PII.
- **Auth-only**: `askCopilot` server function. Rate-limited to 20 calls / 60s
  per user.
- **Service-role only**: `triggerRefresh` server function — wraps
  `/api/public/hooks/refresh-pipeline` with the secret header so the secret
  never reaches the browser.
- **Webhook auth**: `/api/public/hooks/refresh-pipeline` requires
  `x-refresh-secret` and uses constant-time byte comparison.
- See `@security-memory` in the Lovable Cloud security panel for the full doc.

---

## 8. Project layout (high level)

```
src/
├── routes/                  # File-based routes (pages + /api/* server routes)
│   ├── __root.tsx           # Root layout + auth listener
│   ├── index.tsx            # Landing page
│   ├── dashboard.tsx        # Global dashboard
│   ├── copilot.tsx          # AI Copilot chat
│   ├── pakistan.tsx         # Country deep-dive
│   ├── model.tsx            # ML model page (white chart bg)
│   └── api/public/hooks/    # Webhook server routes
├── lib/
│   ├── copilot.functions.ts # AI Copilot serverFn (auth + rate-limit)
│   ├── refresh.functions.ts # Authenticated wrapper around refresh webhook
│   └── ...
├── components/              # Reusable UI (shadcn-derived)
├── integrations/supabase/   # AUTO-GENERATED — do not edit
└── styles.css               # Design tokens (oklch palette, glass utilities)

supabase/migrations/         # SQL schema + seeds
python-service/              # Optional FastAPI ML service
public/                      # Static assets + llms.txt + robots.txt
```

---

## 9. Deploying

The app is deployed on Lovable. The hosted URLs are:

- Preview: `https://id-preview--58f21921-eaf7-44ce-b75f-132f06e1a1a8.lovable.app`
- Production: `https://gfceip.lovable.app`

To publish from local, push to your Lovable project — every commit triggers
a fresh build & deploy.

---

## 10. Troubleshooting

| Symptom | Fix |
|---|---|
| Copilot returns "AI service unavailable" | Check `LOVABLE_API_KEY` is set; tail server logs for the upstream error. |
| Dashboard refresh shows "REFRESH_SHARED_SECRET is not configured" | Add it to `.env` and restart `bun run dev`. |
| Build fails with "Failed to resolve import" | Run `bun install` again; ensure the imported file exists. |
| Sign-in loops | Confirm `_authenticated/route.tsx` is intact and `attachSupabaseAuth` is in `src/start.ts`. |
| ML service 401 | Send `x-api-key: $ML_API_KEY` on every call except `/health`. |

---

Built with ❤️ on [Lovable](https://lovable.dev).
