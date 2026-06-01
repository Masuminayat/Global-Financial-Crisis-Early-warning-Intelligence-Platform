# GFCEIP Python ML Service

FastAPI + XGBoost inference service. Loads the model trained by `notebooks/gfceip_ml.ipynb` and serves predictions to the Lovable frontend.

## Quick start (VSCode)

```bash
cd python-service
python -m venv .venv
source .venv/bin/activate          # Windows: .venv\Scripts\activate
pip install -r requirements.txt
# Train the model first (or copy artifacts from someone who did):
jupyter notebook ../notebooks/gfceip_ml.ipynb   # run all cells
# Then start the API:
uvicorn app.main:app --reload --port 8000
```

Open <http://localhost:8000/docs> for the auto-generated Swagger UI.

## Endpoints

| Method | Path | Purpose |
|---|---|---|
| GET | `/health` | Liveness + model version + metrics |
| GET | `/countries` | List monitored countries |
| GET | `/indicators` | List feature schema |
| POST | `/predict` | Crisis probability for a custom indicator vector |
| POST | `/predict/batch` | Batch predictions for many countries |
| GET | `/metrics` | ROC-AUC, accuracy, precision, recall, F1 from training |

## Deploy

Free tier on Render, Railway, or Fly.io — `Dockerfile` and `Procfile` included.

```bash
docker build -t gfceip-ml .
docker run -p 8000:8000 gfceip-ml
```

Set the Lovable frontend env var `VITE_ML_API_URL=https://your-service.onrender.com` to point at the deployed service.

## Tests

```bash
pytest tests/ -v
```
