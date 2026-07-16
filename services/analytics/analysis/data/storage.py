"""
Dataset storage: save/load Parquet files with metadata JSON.
PYOREX_DATA_DIR env var overrides the default ./data path.
"""
from __future__ import annotations

import json
import os
import re
import uuid
from datetime import datetime
from pathlib import Path

import polars as pl

DATA_DIR = Path(os.getenv("PYOREX_DATA_DIR", "./data"))
DATASETS_DIR = DATA_DIR / "datasets"

_DATASET_ID_RE = re.compile(r"^[a-zA-Z0-9\-_]{1,64}$")


def validate_dataset_id(dataset_id: str) -> str:
    """Raise ValueError if dataset_id could cause path traversal."""
    if not _DATASET_ID_RE.match(dataset_id):
        raise ValueError(f"Invalid dataset_id: {dataset_id!r}")
    resolved = (DATASETS_DIR / dataset_id).resolve()
    if not str(resolved).startswith(str(DATASETS_DIR.resolve())):
        raise ValueError("Path traversal attempt blocked")
    return dataset_id


def _ensure_dirs() -> None:
    DATASETS_DIR.mkdir(parents=True, exist_ok=True)


def save_dataset(df: pl.DataFrame, name: str, meta_extra: dict) -> str:
    """Persist a DataFrame as Parquet + JSON metadata. Returns dataset_id."""
    _ensure_dirs()
    dataset_id = str(uuid.uuid4())
    parquet_path = DATASETS_DIR / f"{dataset_id}.parquet"
    meta_path = DATASETS_DIR / f"{dataset_id}.meta.json"

    df.write_parquet(parquet_path)

    column_roles = meta_extra.pop("column_roles", {})
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
                "role": column_roles.get(col, "unknown"),
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
    validate_dataset_id(dataset_id)
    _ensure_dirs()
    parquet_path = DATASETS_DIR / f"{dataset_id}.parquet"
    if not parquet_path.exists():
        raise FileNotFoundError(f"Dataset not found: {dataset_id}")
    return pl.read_parquet(parquet_path)


def load_metadata(dataset_id: str) -> dict:
    """Load dataset metadata JSON."""
    validate_dataset_id(dataset_id)
    _ensure_dirs()
    meta_path = DATASETS_DIR / f"{dataset_id}.meta.json"
    if not meta_path.exists():
        raise FileNotFoundError(f"Dataset metadata not found: {dataset_id}")
    return json.loads(meta_path.read_text(encoding="utf-8"))


def delete_dataset(dataset_id: str) -> bool:
    """Remove Parquet + metadata files for a dataset. Returns True if found."""
    validate_dataset_id(dataset_id)
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
