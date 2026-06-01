"""
QAQC - Duplicate Analysis
Measures analytical precision via %RPD (Relative Percent Difference).
"""
from __future__ import annotations
import polars as pl
import numpy as np
from dataclasses import dataclass


@dataclass
class DuplicatePair:
    original_id: str
    duplicate_id: str
    dup_type: str  # "FD" | "LD"
    rpd_by_variable: dict[str, float]
    failed_variables: list[str]
    status: str  # "pass" | "warning" | "fail"


def calculate_rpd(a: float, b: float) -> float | None:
    """
    %RPD = |A - B| / ((A + B) / 2) * 100

    Returns None if both values are near zero (both below LOD context).
    """
    avg = (a + b) / 2.0
    if avg == 0:
        return None
    return abs(a - b) / avg * 100.0


def analyze_duplicates(
    df: pl.DataFrame,
    sample_type_col: str,
    variables: list[str],
    original_id_col: str | None = None,
    fd_threshold: float = 20.0,
    ld_threshold: float = 15.0,
) -> list[DuplicatePair]:
    """
    Analyze field and lab duplicates (RF-10.3).

    Pairing strategy:
    1. If original_id_col is provided: match duplicate to original by ID
    2. Otherwise: positional pairing (duplicate follows its original in the dataset)
    """
    pairs: list[DuplicatePair] = []
    sample_id_col = _infer_sample_id_column(df)

    for dup_type, threshold in [("FD", fd_threshold), ("LD", ld_threshold)]:
        dup_mask = df[sample_type_col] == dup_type
        dup_df = df.filter(dup_mask)

        if len(dup_df) == 0:
            continue

        for dup_row in dup_df.iter_rows(named=True):
            dup_id = str(dup_row.get(sample_id_col, ""))

            # Find original
            if original_id_col and original_id_col in df.columns:
                orig_id_value = dup_row.get(original_id_col)
                orig_rows = df.filter(
                    (df[sample_id_col] == orig_id_value)
                    & (df[sample_type_col] == "S")
                )
            else:
                # Positional: find the nearest S sample before this duplicate
                dup_row_idx = df.with_row_index().filter(
                    df[sample_id_col] == dup_id
                )["index"].to_list()
                if not dup_row_idx:
                    continue
                idx = dup_row_idx[0]
                orig_rows = df.with_row_index().filter(
                    (pl.col("index") < idx) & (pl.col(sample_type_col) == "S")
                ).tail(1).drop("index")

            if len(orig_rows) == 0:
                continue

            orig_row = orig_rows.row(0, named=True)
            orig_id = str(orig_row.get(sample_id_col, ""))

            rpd_by_var: dict[str, float] = {}
            failed: list[str] = []

            for var in variables:
                a = orig_row.get(var)
                b = dup_row.get(var)
                if a is None or b is None:
                    continue
                rpd = calculate_rpd(float(a), float(b))
                if rpd is not None:
                    rpd_by_var[var] = round(rpd, 2)
                    if rpd > threshold:
                        failed.append(var)

            status = "pass" if not failed else ("warning" if len(failed) <= 2 else "fail")
            pairs.append(
                DuplicatePair(
                    original_id=orig_id,
                    duplicate_id=dup_id,
                    dup_type=dup_type,
                    rpd_by_variable=rpd_by_var,
                    failed_variables=failed,
                    status=status,
                )
            )

    return pairs


def _infer_sample_id_column(df: pl.DataFrame) -> str:
    candidates = ["sample_id", "sampleid", "id", "sample", "muestra", "codigo"]
    lower_cols = {c.lower(): c for c in df.columns}
    for c in candidates:
        if c in lower_cols:
            return lower_cols[c]
    return df.columns[0]
