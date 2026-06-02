"""
Dataset storage: save/load Parquet files with metadata JSON.
PYOREX_DATA_DIR env var overrides the default ./data path.
"""
from __future__ import annotations

import json
import os
import uuid
from datetime import datetime
from pathlib import Path

import polars as pl

DATA_DIR = Path(os.getenv("PYOREX_DATA_DIR", "./data"))
DATASETS_DIR = DATA_DIR / "datasets"


def _ensure_dirs() -> None:
    DATASETS_DIR.mkdir(parents=True, exist_ok=True)


def save_dataset(df: pl.DataFrame, name: str, meta_extra: dict) -> str:
    """Persist a DataFrame as Parquet + JSON metadata. Returns dataset_id."""
    _ensure_dirs()
    dataset_id = str(uuid.uuid4())
    parquet_path = DATASETS_DIR / f"{dataset_id}.parquet"
    meta_path = DATASETS_DIR / f"{dataset_id}.meta.json"

    df.write_parquet(parquet_path)

    meta = {
        "id": dataset_id,
        "name": name,
        "row_count": df.height,
        "column_count": df.width,
        "columns": [
            {
                "name": col,
                "dtype": str(df[col].dtype),
                "null_count": df[col].null_count(),
            }
            for col in df.columns
        ],
        "imported_at": datetime.utcnow().isoformat(),
        **meta_extra,
    }
    meta_path.write_text(json.dumps(meta, ensure_ascii=False, indent=2), encoding="utf-8")
    return dataset_id


def load_dataset(dataset_id: str) -> pl.DataFrame:
    """Load a dataset by ID from Parquet storage."""
    _ensure_dirs()
    parquet_path = DATASETS_DIR / f"{dataset_id}.parquet"
    if not parquet_path.exists():
        raise FileNotFoundError(f"Dataset not found: {dataset_id}")
    return pl.read_parquet(parquet_path)


def load_metadata(dataset_id: str) -> dict:
    """Load dataset metadata JSON."""
    _ensure_dirs()
    meta_path = DATASETS_DIR / f"{dataset_id}.meta.json"
    if not meta_path.exists():
        raise FileNotFoundError(f"Dataset metadata not found: {dataset_id}")
    return json.loads(meta_path.read_text(encoding="utf-8"))


def get_rows(dataset_id: str, offset: int = 0, limit: int = 200) -> dict:
    """Return a page of rows + column names for display."""
    df = load_dataset(dataset_id)
    page = df.slice(offset, limit)
    return {
        "columns": df.columns,
        "rows": page.to_dicts(),
        "total_rows": df.height,
        "offset": offset,
    }


def delete_dataset(dataset_id: str) -> bool:
    """Remove Parquet + metadata files for a dataset. Returns True if found."""
    _ensure_dirs()
    parquet_path = DATASETS_DIR / f"{dataset_id}.parquet"
    meta_path = DATASETS_DIR / f"{dataset_id}.meta.json"
    found = parquet_path.exists() or meta_path.exists()
    parquet_path.unlink(missing_ok=True)
    meta_path.unlink(missing_ok=True)
    return found


def list_datasets() -> list[dict]:
    """List all available datasets (metadata only, no data loading)."""
    _ensure_dirs()
    result = []
    for meta_path in sorted(DATASETS_DIR.glob("*.meta.json")):
        try:
            result.append(json.loads(meta_path.read_text(encoding="utf-8")))
        except Exception:
            pass
    return result
