"""Generates a lightweight notebook wrapper for the production trainer.

Run: `python notebooks/build_notebook.py`
Then open `notebooks/gfceip_ml.ipynb` in VS Code / Jupyter and Run All.
"""

from __future__ import annotations

import json
from pathlib import Path

NB = {
    "nbformat": 4,
    "nbformat_minor": 5,
    "metadata": {
        "kernelspec": {"display_name": "Python 3", "language": "python", "name": "python3"},
        "language_info": {"name": "python", "version": "3.11"},
    },
    "cells": [],
}


def md(src: str) -> None:
    NB["cells"].append({"cell_type": "markdown", "metadata": {}, "source": src.strip().splitlines(keepends=True)})


def code(src: str) -> None:
    NB["cells"].append(
        {"cell_type": "code", "metadata": {}, "execution_count": None, "outputs": [], "source": src.strip().splitlines(keepends=True)}
    )


md(
    """
    # GFCEIP — Global Financial Crisis Early-Warning ML Pipeline

    This notebook now runs the same production training script used by the Python API, so the notebook, artifacts, docs, and API stay aligned.

    **Improvements in this version:**

    - Expanded the training window to **2000 → latest available year (up to 2025)**
    - Increased coverage to the full **World Bank universe (~206 economies)** for a much larger training set (~5k+ country-year samples after cleaning)
    - Optimizes **F1** with nested threshold tuning instead of using a fixed 0.5 cutoff
    - Uses stronger regularization and explicit overfitting checks to keep the model stable
    """
)

md("## 0. Load and run the production trainer")
code(
    """
    import importlib.util
    import json
    from pathlib import Path

    trainer_path = Path("../python-service/train_model.py").resolve()
    spec = importlib.util.spec_from_file_location("gfceip_train_model", trainer_path)
    module = importlib.util.module_from_spec(spec)
    assert spec.loader is not None
    spec.loader.exec_module(module)
    run_training = module.run_training
    """
)
code(
    """
    results = run_training()
    summary = {
        "selected_model": results["selected_model"],
        "cv_f1": round(results["cv"]["f1"]["mean"], 3),
        "test_f1": round(results["test"]["f1"], 3),
        "test_auc": round(results["test"]["roc_auc"], 3),
        "threshold": round(results["threshold"], 3),
        "n_samples": results["n_samples"],
        "year_range_actual": results["year_range_actual"],
    }
    print(json.dumps(summary, indent=2))
    """
)

md("## 1. Inspect the saved metrics")
code(
    """
    metrics_path = Path("../python-service/app/artifacts/metrics.json")
    metrics = json.loads(metrics_path.read_text())
    {
        "selected_model": metrics["selected_model"],
        "cv_f1": metrics["cv"]["f1"],
        "test": metrics["test"],
        "year_range_actual": metrics["year_range_actual"],
    }
    """
)

md("## 2. Confirm generated artifacts")
code(
    """
    artifacts = sorted(Path("../python-service/app/artifacts").glob("*"))
    [(p.name, p.stat().st_size) for p in artifacts]
    """
)

out = Path(__file__).parent / "gfceip_ml.ipynb"
out.write_text(json.dumps(NB, indent=1))
print(f"wrote {out} — {len(NB['cells'])} cells")
