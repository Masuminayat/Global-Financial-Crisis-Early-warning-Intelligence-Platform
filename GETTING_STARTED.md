# GFCEIP — Beginner's Click-by-Click Guide

> Zero assumed knowledge. Follow top to bottom. ~30 minutes from zip → running app → deployed.

---

## Part 0 — What you're getting

Two things run together:

1. **Frontend** (the website) — React / TanStack Start, in `src/`.
2. **ML backend** (the Python API) — FastAPI + XGBoost, in `python-service/`.

You'll run BOTH locally in VSCode, then deploy.

---

## Part 1 — Install the tools (one time, ~10 min)

Download and install in this order. Click "Next" through every installer.

| Tool | Link | Why |
|---|---|---|
| **VSCode** | https://code.visualstudio.com/ | The editor |
| **Node.js LTS** | https://nodejs.org/ | Runs the frontend |
| **Bun** | https://bun.sh/ | Installs frontend packages (fast) |
| **Python 3.11** | https://www.python.org/downloads/ | Runs the ML API. **Check "Add Python to PATH"** in the installer |
| **Git** | https://git-scm.com/downloads | Version control (optional but recommended) |

After installing, open VSCode → install these extensions (View → Extensions, search and click Install):

- **Python** (by Microsoft)
- **Jupyter** (by Microsoft)
- **ESLint**
- **Tailwind CSS IntelliSense**

---

## Part 2 — Get the project

1. **Download the zip** from the artifact link at the bottom of this chat (`gfceip-project.zip`).
2. Right-click the zip → **Extract All** → choose a folder like `Documents/gfceip`.
3. Open VSCode → **File → Open Folder** → select the extracted `gfceip` folder.
4. Open the terminal inside VSCode: **Terminal → New Terminal** (or `Ctrl+\``).

---

## Part 3 — Run the frontend (the website)

In the VSCode terminal:

```bash
bun install
bun run dev
```

You'll see something like `Local: http://localhost:5173`. Open that URL in your browser. The app is live.

To stop it: click the terminal and press `Ctrl+C`.

---

## Part 4 — Train the ML model (one time)

Open a **second** terminal in VSCode (click the `+` icon in the terminal panel).

```bash
cd python-service
python -m venv .venv
```

Activate the virtual environment:

- **Windows**: `.venv\Scripts\activate`
- **Mac / Linux**: `source .venv/bin/activate`

You should see `(.venv)` at the start of the prompt. Now install Python packages:

```bash
pip install -r requirements.txt
pip install jupyter
```

Open the notebook:

```bash
cd ../notebooks
jupyter notebook gfceip_ml.ipynb
```

A browser tab opens. Click **Cell → Run All** (or `Kernel → Restart & Run All`). Wait ~2 min. It will:

1. Download real economic data from the World Bank API.
2. Clean and label it.
3. Train XGBoost.
4. Save `model.pkl` and `metrics.json` into `python-service/app/artifacts/`.

When all cells show green checkmarks, close the browser tab and stop Jupyter with `Ctrl+C` in the terminal.

---

## Part 5 — Run the ML API

Same terminal (still inside `python-service` with `.venv` active — if not, re-activate):

```bash
cd ../python-service
uvicorn app.main:app --reload --port 8000
```

Open http://localhost:8000/docs in your browser. You see **Swagger UI** with every endpoint. Try `POST /predict` → Try it out → Execute. You'll see a JSON response with `crisis_probability`.

**You now have the full project running locally.** Frontend on :5173, ML API on :8000.

---

## Part 6 — Run the tests (to show the teacher)

In a third terminal:

```bash
cd python-service
source .venv/bin/activate    # Windows: .venv\Scripts\activate
pytest tests/ -v
```

You'll see green PASSED lines.

---

## Part 7 — Deploy

You have two services, so you deploy them separately.

### 7A — Deploy the ML API to Railway (free tier, easiest)

1. Sign up at https://railway.app/ (use GitHub login).
2. Push your project to a **GitHub** repo:
   - Create a new repo at https://github.com/new (name: `gfceip`, **Public**).
   - In VSCode terminal at project root:
     ```bash
     git init
     git add .
     git commit -m "initial"
     git branch -M main
     git remote add origin https://github.com/YOUR_USERNAME/gfceip.git
     git push -u origin main
     ```
3. In Railway → **New Project → Deploy from GitHub repo** → pick `gfceip`.
4. Railway asks for the **Root Directory** → enter `python-service`.
5. It auto-detects the Dockerfile and deploys. Wait ~3 min.
6. Click **Settings → Networking → Generate Domain**. You get a URL like `https://gfceip-production.up.railway.app`.
7. Test it: open `https://YOUR-URL/docs`.

### 7B — Deploy the frontend (Lovable — one click)

The frontend is already deployed via Lovable.

1. Open this Lovable project in your browser.
2. Click **Publish** in the top-right corner.
3. You get a URL like `https://gfceip.lovable.app`. Done.

To make the frontend call your Railway ML API, add an environment variable in Lovable (Project Settings → Environment Variables):

```
VITE_ML_API_URL = https://YOUR-RAILWAY-URL
```

Then click **Publish** again.

---

## Part 8 — Demo to the teacher

Open in this order, in separate browser tabs:

1. **The website** — http://localhost:5173 (or the published URL).
2. **The ML API docs** — http://localhost:8000/docs.
3. **The notebook** — `notebooks/gfceip_ml.ipynb` in VSCode (so the plots are visible).
4. **The report** — `docs/ML_REPORT.md`.

Read `docs/DEMO_SCRIPT.md` out loud — it's a 10-min walkthrough with exact lines.

Practice answers from `docs/TEACHER_QA.md` — 14 likely questions with answers.

---

## Troubleshooting

| Problem | Fix |
|---|---|
| `bun: command not found` | Reinstall Bun, restart VSCode |
| `python: command not found` (Windows) | Reinstall Python, check "Add to PATH" |
| `pip install` fails on `xgboost` | Upgrade pip: `pip install --upgrade pip` then retry |
| API says "model not loaded" | You skipped Part 4. Run the notebook first |
| Port 8000 already in use | Use `--port 8001` instead, update frontend env var |
| Frontend shows blank screen | Check VSCode terminal for red errors, usually a missing `bun install` |

---

## What's in each folder

```
gfceip/
├── src/                     ← Frontend React code
├── python-service/          ← FastAPI ML server
│   └── app/artifacts/       ← model.pkl appears here after notebook runs
├── notebooks/               ← Jupyter notebook (the ML work)
├── docs/                    ← ML_REPORT, DEMO_SCRIPT, TEACHER_QA, ARCHITECTURE, API_REFERENCE
├── supabase/migrations/     ← Database schema
├── package.json             ← Frontend dependencies
└── README.md                ← Project overview
```

Read `docs/` before presenting. That's where the academic content lives.
