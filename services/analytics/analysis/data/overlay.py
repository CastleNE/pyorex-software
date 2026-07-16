"""
Non-destructive edit overlay for datasets (DATA screen toolbar operations).

The original Parquet written by `storage.save_dataset()` is NEVER mutated.
Column-shape-changing operations (rename/hide/drop/change dtype/add calculated
column) are appended to a small JSON "ops log" stored alongside the dataset
(`{dataset_id}.ops.json`) and replayed on read via `get_effective_dataframe()`.
Filters/sort are NOT part of this overlay — they are transient, per-request
view parameters handled by `query.py` — only operations that change the
column shape of the dataset go through Undo/Redo/Save.

`history` is append-only and never truncated: it is the audit trail required
by the product's non-destructive-editing acceptance criteria.
"""
from __future__ import annotations

import json
import uuid
from datetime import datetime, timezone

import polars as pl

from analysis.data.formula import apply_formula_to_dataframe
from analysis.data.storage import DATASETS_DIR, load_dataset, validate_dataset_id

OVERLAY_SUFFIX = ".ops.json"

_DTYPE_MAP: dict[str, pl.DataType] = {
    "numeric": pl.Float64(),
    "text": pl.Utf8(),
    "datetime": pl.Datetime(),
}


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _overlay_path(dataset_id: str):
    validate_dataset_id(dataset_id)
    return DATASETS_DIR / f"{dataset_id}{OVERLAY_SUFFIX}"


def load_overlay(dataset_id: str) -> dict:
    path = _overlay_path(dataset_id)
    if not path.exists():
        return {"dataset_id": dataset_id, "ops": [], "redo_stack": [], "history": []}
    return json.loads(path.read_text(encoding="utf-8"))


def save_overlay(dataset_id: str, overlay: dict) -> None:
    _overlay_path(dataset_id).write_text(json.dumps(overlay, ensure_ascii=False, indent=2), encoding="utf-8")


def delete_overlay(dataset_id: str) -> None:
    _overlay_path(dataset_id).unlink(missing_ok=True)


def _apply_op(df: pl.DataFrame, hidden: set[str], op: dict) -> tuple[pl.DataFrame, set[str]]:
    op_type = op["type"]
    params = op["params"]

    if op_type == "rename_column":
        column, new_name = params["column"], params["new_name"]
        if column not in df.columns:
            raise ValueError(f"Cannot rename unknown column: {column}")
        df = df.rename({column: new_name})
        if column in hidden:
            hidden = (hidden - {column}) | {new_name}
        return df, hidden

    if op_type == "hide_column":
        column = params["column"]
        if column not in df.columns:
            raise ValueError(f"Cannot hide unknown column: {column}")
        return df, hidden | {column}

    if op_type == "unhide_column":
        return df, hidden - {params["column"]}

    if op_type == "drop_column":
        column = params["column"]
        if column not in df.columns:
            raise ValueError(f"Cannot drop unknown column: {column}")
        return df.drop(column), hidden - {column}

    if op_type == "change_dtype":
        column, new_dtype = params["column"], params["new_dtype"]
        target = _DTYPE_MAP.get(new_dtype)
        if target is None:
            raise ValueError(f"Unsupported target dtype: {new_dtype}")
        if column not in df.columns:
            raise ValueError(f"Cannot change dtype of unknown column: {column}")
        return df.with_columns(pl.col(column).cast(target, strict=False)), hidden

    if op_type == "add_calculated_column":
        name, formula = params["name"], params["formula"]
        if name in df.columns:
            raise ValueError(f"Column already exists: {name}")
        series = apply_formula_to_dataframe(formula, df)
        return df.with_columns(series.alias(name)), hidden

    raise ValueError(f"Unknown operation type: {op_type}")


def get_effective_dataframe(dataset_id: str) -> tuple[pl.DataFrame, set[str]]:
    """Raw Parquet + all ops in the overlay replayed in order. This is the
    ONE read path every dataset-scoped RPC handler should use — never call
    `storage.load_dataset()` directly once an overlay may exist."""
    df = load_dataset(dataset_id)
    overlay = load_overlay(dataset_id)
    hidden: set[str] = set()
    for op in overlay["ops"]:
        df, hidden = _apply_op(df, hidden, op)
    return df, hidden


def append_op(dataset_id: str, op_type: str, params: dict) -> dict:
    """Validate the operation against the CURRENT effective dataframe (fails
    fast, never persists an invalid op), then append it and clear redo_stack."""
    df, hidden = get_effective_dataframe(dataset_id)
    now = _now()
    op_id = f"op_{uuid.uuid4().hex[:12]}"
    op = {"id": op_id, "type": op_type, "params": params, "applied_at": now}
    _apply_op(df, hidden, op)  # raises ValueError/FormulaError if invalid — nothing persisted on failure

    overlay = load_overlay(dataset_id)
    overlay["ops"].append(op)
    overlay["redo_stack"] = []
    overlay["history"].append({"op_id": op_id, "action": "applied", "at": now})
    save_overlay(dataset_id, overlay)
    return overlay


def undo(dataset_id: str) -> dict:
    overlay = load_overlay(dataset_id)
    if not overlay["ops"]:
        raise ValueError("Nothing to undo")
    op = overlay["ops"].pop()
    overlay["redo_stack"].append(op)
    overlay["history"].append({"op_id": op["id"], "action": "undone", "at": _now()})
    save_overlay(dataset_id, overlay)
    return overlay


def redo(dataset_id: str) -> dict:
    overlay = load_overlay(dataset_id)
    if not overlay["redo_stack"]:
        raise ValueError("Nothing to redo")
    op = overlay["redo_stack"].pop()
    overlay["ops"].append(op)
    overlay["history"].append({"op_id": op["id"], "action": "redone", "at": _now()})
    save_overlay(dataset_id, overlay)
    return overlay
