"""
QAQC - Blank Analysis
Detects contamination in field blanks (FB) and lab blanks (LB).
"""
from __future__ import annotations
import polars as pl
from dataclasses import dataclass, field


@dataclass
class BlankFlag:
    sample_id: str
    sample_type: str  # "FB" or "LB"
    variable: str
    measured_value: float
    threshold: float
    severity: str  # "critical" | "warning"


def calculate_blank_thresholds(
    df: pl.DataFrame,
    variables: list[str],
    blank_factor: float = 0.20,
    lod_values: dict[str, float] | None = None,
) -> dict[str, float]:
    """
    Compute per-variable blank threshold as max(LOD, p10_regular * blank_factor).
    """
    thresholds: dict[str, float] = {}
    lod = lod_values or {}

    for var in variables:
        col = df[var].drop_nulls()
        p10 = float(col.quantile(0.10)) if len(col) > 0 else 0.0
        threshold = max(lod.get(var, 0.0), p10 * blank_factor)
        thresholds[var] = threshold

    return thresholds


def analyze_blanks(
    df: pl.DataFrame,
    sample_type_col: str,
    variables: list[str],
    blank_factor: float = 0.20,
    lod_values: dict[str, float] | None = None,
) -> list[BlankFlag]:
    """
    Analyze all blank samples (FB, LB) and return contamination flags.

    Algorithm (RF-10.2):
    - Threshold per variable = max(LOD, p10_regular * blank_factor)
    - If blank value > threshold → BLANK_CONTAMINATION flag
    - Severity: critical if >3 variables contaminated, warning otherwise
    """
    flags: list[BlankFlag] = []

    regular_mask = df[sample_type_col] == "S"
    regular_df = df.filter(regular_mask)

    thresholds = calculate_blank_thresholds(
        regular_df, variables, blank_factor, lod_values
    )

    blank_mask = df[sample_type_col].is_in(["FB", "LB"])
    blank_df = df.filter(blank_mask)

    sample_id_col = _infer_sample_id_column(df)

    for row in blank_df.iter_rows(named=True):
        contaminated_vars = []
        for var in variables:
            value = row.get(var)
            if value is None or pl.Series([value]).is_null()[0]:
                continue
            if value > thresholds.get(var, 0.0):
                contaminated_vars.append((var, float(value)))

        n_contaminated = len(contaminated_vars)
        severity = "critical" if n_contaminated >= 3 else "warning"

        for var, val in contaminated_vars:
            flags.append(
                BlankFlag(
                    sample_id=str(row.get(sample_id_col, "")),
                    sample_type=str(row[sample_type_col]),
                    variable=var,
                    measured_value=val,
                    threshold=thresholds[var],
                    severity=severity,
                )
            )

    return flags


def _infer_sample_id_column(df: pl.DataFrame) -> str:
    """Heuristic to find the sample ID column."""
    candidates = ["sample_id", "sampleid", "id", "sample", "muestra", "codigo"]
    lower_cols = {c.lower(): c for c in df.columns}
    for c in candidates:
        if c in lower_cols:
            return lower_cols[c]
    return df.columns[0]
