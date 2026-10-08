"""
Dataset storage: save/load Parquet files with metadata JSON.
PYOREX_DATA_DIR env var overrides the default ./data path.
"""
from __future__ import annotations

import json
import os
import re
import tempfile
import threading
import uuid
from datetime import datetime
from pathlib import Path

import polars as pl

from analysis.licensing.plans import check_rows

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
    """Persist a DataFrame as Parquet + JSON metadata. Returns dataset_id.

    Every way of creating a dataset passes through here, so the sample limit of the active plan is checked here.
    """
    check_rows(df.height)
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
    # The edit overlay belongs to the dataset: a leftover one would re-apply to a dataset restored with this id.
    (DATASETS_DIR / f"{dataset_id}.ops.json").unlink(missing_ok=True)
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


_META_LOCK = threading.Lock()


def mutate_metadata(dataset_id: str, change) -> dict:
    """Read-modify-write a dataset's metadata under one lock: ``change(meta)`` returns the keys to merge.
    The new JSON is written to a unique temp file, flushed and atomically moved into place. Never touches data."""
    with _META_LOCK:
        meta = load_metadata(dataset_id)
        meta.update(change(meta))
        meta_path = DATASETS_DIR / f"{dataset_id}.meta.json"
        fd, tmp = tempfile.mkstemp(prefix=f".{dataset_id}.", suffix=".meta.tmp", dir=str(DATASETS_DIR))
        try:
            with os.fdopen(fd, "w", encoding="utf-8") as fh:
                fh.write(json.dumps(meta, ensure_ascii=False, indent=2))
                fh.flush()
                os.fsync(fh.fileno())
            os.replace(tmp, meta_path)
        except BaseException:
            Path(tmp).unlink(missing_ok=True)
            raise
        return meta


def update_metadata(dataset_id: str, patch: dict) -> dict:
    """Merge ``patch`` into a dataset's metadata JSON (serialised, atomic). Never touches the Parquet data."""
    return mutate_metadata(dataset_id, lambda _meta: patch)
