"""
Shared helpers for the QAQC analysis modules (blanks/duplicates/crm).
"""
from __future__ import annotations

import polars as pl

_SAMPLE_ID_NAME_CANDIDATES = ["sample_id", "sampleid", "id", "sample", "muestra", "codigo"]


def infer_sample_id_column(df: pl.DataFrame, column_roles: dict[str, str] | None = None) -> str:
    """
    Precedence: metadata role 'sample_identifier' (set by the import wizard —
    the most reliable signal) -> name heuristic (for datasets imported before
    this existed, or without full metadata) -> 'internal_feature_id' (always
    present, unique per row) -> first column (last resort).
    """
    if column_roles:
        for name, role in column_roles.items():
            if role == "sample_identifier" and name in df.columns:
                return name

    lower_cols = {c.lower(): c for c in df.columns}
    for candidate in _SAMPLE_ID_NAME_CANDIDATES:
        if candidate in lower_cols:
            return lower_cols[candidate]

    if "internal_feature_id" in df.columns:
        return "internal_feature_id"

    return df.columns[0]


def get_sample_type_column(df: pl.DataFrame) -> str | None:
    """Returns '__sample_type__' if present, else None — callers must treat
    None as 'no QAQC sample-type data available', not raise/KeyError."""
    return "__sample_type__" if "__sample_type__" in df.columns else None
