from fastapi.testclient import TestClient
from app.main import app

client = TestClient(app)

def test_health():
    r = client.get("/health")
    assert r.status_code == 200
    assert "status" in r.json()

def test_indicators_schema():
    r = client.get("/indicators")
    assert r.status_code == 200
    body = r.json()
    assert "raw" in body and len(body["raw"]) == 8

def test_predict_returns_probability_when_model_loaded():
    r = client.post("/predict", json={
        "cpi_inflation": 25.0, "reserves_usd": 8e9,
        "current_account_pct_gdp": -4.5, "govt_debt_pct_gdp": 78.0,
        "gdp_growth": -1.2, "unemployment": 8.5,
        "real_interest_rate": 7.5, "exports_pct_gdp": 12.0,
        "iso3": "PAK", "region": "SAS",
    })
    # 503 if model isn't trained yet — that's fine in CI without artifacts
    assert r.status_code in (200, 503)
    if r.status_code == 200:
        body = r.json()
        assert 0.0 <= body["crisis_probability"] <= 1.0
        assert body["risk_level"] in {"LOW", "MODERATE", "HIGH", "CRITICAL"}
