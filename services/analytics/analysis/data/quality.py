"""
Generic dataset Data Quality report (DATA screen "Data Quality" tool).
Distinct from analysis/qaqc/* which does geochemical lab-QC (%RPD, CRM
recovery) on specially-flagged QAQC sample rows — this module checks the
dataset itself, independent of any geochemistry semantics.

Every check is a pure function over a Polars DataFrame so it can be unit
tested in isolation. Outliers are only ever REPORTED, never auto-removed
(project rule: "los outliers en datos geoquímicos NO se eliminan
automáticamente").
"""
from __future__ import annotations

import polars as pl

from analysis.data.overlay import get_effective_dataframe
from analysis.data.storage import load_metadata

NULLTYPE_PREFIX = "_nulltype_"
# Synthetic columns the importer adds that are never real user data — must be
# excluded from quality checks (esp. duplicate-row detection: internal_feature_id
# is unique per row by construction and would otherwise make every row "unique").
SYNTHETIC_COLUMNS = {"internal_feature_id", "__sample_type__"}


def _is_synthetic(col: str) -> bool:
    return col.startswith(NULLTYPE_PREFIX) or col in SYNTHETIC_COLUMNS


def check_nulls(df: pl.DataFrame) -> list[dict]:
    total = df.height
    out = []
    for col in df.columns:
        if _is_synthetic(col):
            continue
        n = df[col].null_count()
        if n > 0:
            out.append({"column": col, "null_count": n, "null_pct": round(100 * n / total, 2) if total else 0.0})
    return out


def check_duplicate_rows(df: pl.DataFrame, max_samples: int = 100) -> dict:
    cols = [c for c in df.columns if not _is_synthetic(c)]
    dup_mask = df.select(cols).is_duplicated()
    indices = [i for i, is_dup in enumerate(dup_mask.to_list()) if is_dup]
    return {"count": len(indices), "sample_row_indices": indices[:max_samples]}


def check_duplicate_column_names(raw_columns: list[str]) -> list[str]:
    seen: dict[str, int] = {}
    for c in raw_columns:
        seen[c] = seen.get(c, 0) + 1
    return [name for name, count in seen.items() if count > 1]


def check_constant_columns(df: pl.DataFrame) -> list[dict]:
    out = []
    for col in df.columns:
        if _is_synthetic(col):
            continue
        n_unique = df[col].n_unique()
        if n_unique <= 1 and df.height > 0:
            value = df[col][0] if df.height > 0 else None
            out.append({"column": col, "value": value})
    return out


def check_mixed_type_columns(df: pl.DataFrame, sample_size: int = 200) -> list[dict]:
    out = []
    for col in df.columns:
        if _is_synthetic(col):
            continue
        if df.schema[col] != pl.Utf8:
            continue
        sample = df[col].drop_nulls().head(sample_size).to_list()
        has_numeric = any(_looks_numeric(v) for v in sample)
        has_text = any(not _looks_numeric(v) for v in sample)
        if has_numeric and has_text:
            examples = [v for v in sample if _looks_numeric(v)][:3] + [v for v in sample if not _looks_numeric(v)][:3]
            out.append({"column": col, "examples": examples})
    return out


def _looks_numeric(v) -> bool:
    try:
        float(v)
        return True
    except (TypeError, ValueError):
        return False


def check_non_numeric_in_numeric(df: pl.DataFrame, numeric_columns: list[str]) -> list[dict]:
    out = []
    for col in numeric_columns:
        if col not in df.columns or df.schema[col] != pl.Utf8:
            continue
        values = df[col].drop_nulls().to_list()
        invalid = [v for v in values if not _looks_numeric(v)]
        if invalid:
            out.append({"column": col, "invalid_values": invalid[:10], "count": len(invalid)})
    return out


def check_below_lod(df: pl.DataFrame) -> list[dict]:
    out = []
    for col in df.columns:
        if not col.startswith(NULLTYPE_PREFIX):
            continue
        base_column = col[len(NULLTYPE_PREFIX):]
        n = (df[col] == "BELOW_LOD").sum()
        if n and n > 0:
            out.append({"column": base_column, "count": int(n)})
    return out


def check_outliers_iqr(df: pl.DataFrame, numeric_columns: list[str]) -> list[dict]:
    out = []
    for col in numeric_columns:
        if col not in df.columns or not df.schema[col].is_numeric():
            continue
        series = df[col].drop_nulls()
        if series.len() < 4:
            continue
        q1, q3 = series.quantile(0.25), series.quantile(0.75)
        if q1 is None or q3 is None:
            continue
        iqr = q3 - q1
        lower, upper = q1 - 1.5 * iqr, q3 + 1.5 * iqr
        outlier_count = int(((series < lower) | (series > upper)).sum())
        if outlier_count > 0:
            out.append({
                "column": col,
                "outlier_count": outlier_count,
                "lower_bound": lower,
                "upper_bound": upper,
            })
    return out


def check_invalid_coordinates(df: pl.DataFrame, spatial_config: dict | None) -> dict:
    if not spatial_config or spatial_config.get("geometry_source") in (None, "none"):
        return {"checked": False, "invalid_count": 0}

    gsource = spatial_config.get("geometry_source")
    if gsource == "wgs84_lonlat":
        lon_col, lat_col = spatial_config.get("lon_col"), spatial_config.get("lat_col")
        if not lon_col or not lat_col or lon_col not in df.columns or lat_col not in df.columns:
            return {"checked": False, "invalid_count": 0, "reason": "Coordinate columns not found"}
        invalid = df.filter(
            pl.col(lon_col).is_not_null()
            & pl.col(lat_col).is_not_null()
            & ((pl.col(lon_col) < -180) | (pl.col(lon_col) > 180) | (pl.col(lat_col) < -90) | (pl.col(lat_col) > 90))
        ).height
        return {"checked": True, "invalid_count": invalid}

    if gsource == "projected_xy":
        east_col, north_col = spatial_config.get("east_col"), spatial_config.get("north_col")
        if not east_col or not north_col or east_col not in df.columns or north_col not in df.columns:
            return {"checked": False, "invalid_count": 0, "reason": "Coordinate columns not found"}
        invalid = df.filter(pl.col(east_col).is_null() | pl.col(north_col).is_null() | (pl.col(east_col) == 0) & (pl.col(north_col) == 0)).height
        return {"checked": True, "invalid_count": invalid}

    return {"checked": False, "invalid_count": 0}


def run_quality_report(dataset_id: str) -> dict:
    df, hidden = get_effective_dataframe(dataset_id)
    try:
        meta = load_metadata(dataset_id)
    except FileNotFoundError:
        meta = {}

    role_by_column: dict[str, str] = {c["name"]: c.get("role", "unknown") for c in meta.get("columns", [])}
    numeric_roles = {"assay_element", "assay_oxide", "assay_compound", "physical_numeric",
                      "calculated_numeric", "ratio_numeric", "index_numeric"}
    numeric_columns = [c for c, role in role_by_column.items() if role in numeric_roles and c in df.columns]
    if not numeric_columns:
        numeric_columns = [c for c in df.columns if df.schema[c].is_numeric()]

    return {
        "dataset_id": dataset_id,
        "row_count": df.height,
        "hidden_columns": sorted(hidden),
        "checks": {
            "nulls": check_nulls(df),
            "duplicate_rows": check_duplicate_rows(df),
            "duplicate_column_names": check_duplicate_column_names(df.columns),
            "constant_columns": check_constant_columns(df),
            "mixed_type_columns": check_mixed_type_columns(df),
            "non_numeric_in_numeric": check_non_numeric_in_numeric(df, numeric_columns),
            "below_lod": check_below_lod(df),
            "outliers_iqr": check_outliers_iqr(df, numeric_columns),
            "invalid_coordinates": check_invalid_coordinates(df, meta.get("spatial_config")),
        },
    }
