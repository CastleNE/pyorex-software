"""
Data importer: CSV and Excel → Polars DataFrame with null-value handling.
RF-02, RF-04-CUA: BELOW_LOD, NOT_ANALYZED, MISSING support.
Includes spatial column auto-detection for coordinate reference systems.
"""
from __future__ import annotations

import re
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

import polars as pl


# ── Spatial models ────────────────────────────────────────────────────────────

@dataclass
class SpatialRef:
    x_col: str           # Easting / Longitude column
    y_col: str           # Northing / Latitude column
    crs: str             # EPSG string, e.g. "EPSG:4326" or "EPSG:20351"
    crs_label: str       # Human-readable label
    is_geographic: bool  # True = lat/lon degrees; False = projected metres


@dataclass
class SpatialDetection:
    pairs: list[SpatialRef]
    iogas_display_cols: list[str]  # columns named like [Colour], [Shape], etc.


# ── CRS catalogue ─────────────────────────────────────────────────────────────

# Maps a normalised CRS token → (epsg, label, is_geographic)
_CRS_CATALOGUE: dict[str, tuple[str, str, bool]] = {
    "WGS84":     ("EPSG:4326",  "WGS84 (geographic)",    True),
    "GDA94":     ("EPSG:4283",  "GDA94 (geographic)",    True),
    "GDA2020":   ("EPSG:7844",  "GDA2020 (geographic)",  True),
    "PSAD56":    ("EPSG:4248",  "PSAD56 (South America)", True),
}

# UTM zones 1-60 for WGS84 (North / South)
for _z in range(1, 61):
    _CRS_CATALOGUE[f"UTM_{_z}N"] = (f"EPSG:{32600 + _z}", f"WGS84 / UTM Zone {_z}N", False)
    _CRS_CATALOGUE[f"UTM_{_z}S"] = (f"EPSG:{32700 + _z}", f"WGS84 / UTM Zone {_z}S", False)

# Australian Map Grid 1984 (GDA94), zones 48-58
for _z in range(48, 59):
    _CRS_CATALOGUE[f"AMG84_z{_z}"] = (f"EPSG:{20200 + _z}", f"GDA94 / AMG Zone {_z}", False)

# PSAD56 UTM South America, zones 17-22 South
for _z in range(17, 23):
    _CRS_CATALOGUE[f"PSAD56_UTM_{_z}S"] = (f"EPSG:{24860 + _z}", f"PSAD56 / UTM Zone {_z}S", False)


def _extract_crs_token(col_lower: str) -> str | None:
    """Parse a CRS token from a lowercase column name."""
    if "wgs84" in col_lower:
        return "WGS84"
    if "gda2020" in col_lower:
        return "GDA2020"
    if "gda94" in col_lower:
        return "GDA94"
    # AMG84 zone
    m = re.search(r"amg84_?z?_?(\d+)", col_lower)
    if m:
        return f"AMG84_z{m.group(1)}"
    # WGS84 UTM
    m = re.search(r"utm_?(\d+)(n|s)", col_lower)
    if m:
        return f"UTM_{m.group(1)}{m.group(2).upper()}"
    # PSAD56 UTM
    m = re.search(r"psad56.*utm.*?(\d+)(n|s)", col_lower)
    if m:
        return f"PSAD56_UTM_{m.group(1)}{m.group(2).upper()}"
    if "psad56" in col_lower:
        return "PSAD56"
    return None


def detect_spatial_columns(columns: list[str]) -> SpatialDetection:
    """
    Scan column names for coordinate pairs and ioGAS display columns.

    Pairs are matched by shared CRS token in the column name suffix
    (e.g. East_AMG84_z51 + North_AMG84_z51 → one projected pair).
    """
    iogas_display_cols = [c for c in columns if c.startswith("[") and c.endswith("]")]

    x_candidates: list[tuple[str, str | None]] = []  # (original_name, crs_token)
    y_candidates: list[tuple[str, str | None]] = []

    _X_PREFIXES = re.compile(r"^(east|easting|long|lon|longitude|x)[\W_]|^(x|long|lon)$", re.I)
    _Y_PREFIXES = re.compile(r"^(north|northing|lat|latitude|y)[\W_]|^(y|lat)$", re.I)

    for col in columns:
        if col in iogas_display_cols:
            continue
        norm = col.strip()
        crs_token = _extract_crs_token(norm.lower())

        if _X_PREFIXES.match(norm):
            x_candidates.append((col, crs_token))
        if _Y_PREFIXES.match(norm):
            y_candidates.append((col, crs_token))

    # Match pairs: prefer same CRS token, fall back to positional
    pairs: list[SpatialRef] = []
    matched_x: set[str] = set()
    matched_y: set[str] = set()

    for x_col, x_crs in x_candidates:
        for y_col, y_crs in y_candidates:
            if x_col == y_col or y_col in matched_y:
                continue
            shared_crs = x_crs if x_crs == y_crs else (x_crs or y_crs)
            # Require at least one column to have a CRS hint, or both are just X/Y
            if shared_crs or (x_col.lower().strip() in ("x",) and y_col.lower().strip() in ("y",)):
                epsg, label, is_geo = _CRS_CATALOGUE.get(
                    shared_crs or "", ("EPSG:4326", "WGS84 (geographic)", True)
                )
                pairs.append(SpatialRef(
                    x_col=x_col,
                    y_col=y_col,
                    crs=epsg,
                    crs_label=label,
                    is_geographic=is_geo,
                ))
                matched_x.add(x_col)
                matched_y.add(y_col)
                break

    return SpatialDetection(pairs=pairs, iogas_display_cols=iogas_display_cols)


# ── Main models ───────────────────────────────────────────────────────────────

@dataclass
class NullMapping:
    column: str
    sentinel_value: str | float | int
    null_type: str  # "BELOW_LOD" | "NOT_ANALYZED" | "MISSING"
    lod_value: float | None = None


@dataclass
class SampleTypeMapping:
    column: str
    value_map: dict[str, str]  # {"BLANK": "FB", "DUP": "FD", ...}


@dataclass
class ImportConfig:
    null_mappings: list[NullMapping] = field(default_factory=list)
    sample_type_mapping: SampleTypeMapping | None = None
    sheet_name: str | int = 0
    separator: str = ","
    spatial_ref: SpatialRef | None = None  # selected CRS for spatial analysis/KML


@dataclass
class PreviewResult:
    columns: list[dict]
    preview_rows: list[dict]
    total_rows: int
    file_size_kb: float
    encoding_detected: str
    spatial_detection: dict  # serialised SpatialDetection for JSON transport


# ── Preview ───────────────────────────────────────────────────────────────────

def preview_file(path: str, n_rows: int = 50, separator: str = ",") -> PreviewResult:
    """Read a file and return a preview with spatial detection."""
    p = Path(path)
    file_size_kb = round(p.stat().st_size / 1024, 1)
    ext = p.suffix.lower()

    if ext == ".csv":
        df_full = _read_csv_polars(path, separator=separator)
    elif ext in (".xlsx", ".xls", ".xlsm"):
        df_full = _read_excel_polars(path)
    else:
        raise ValueError(f"Unsupported file type: {ext}. Supported: .csv, .xlsx, .xls")

    total_rows = df_full.height
    df = df_full.head(n_rows)

    detection = detect_spatial_columns(df_full.columns)

    columns = []
    for col in df.columns:
        series = df_full[col]
        sample_vals = (
            series.drop_nulls()
            .unique()
            .head(5)
            .cast(pl.String)
            .to_list()
        )
        columns.append({
            "name": col,
            "dtype": _friendly_dtype(series.dtype),
            "null_count": int(series.null_count()),
            "null_pct": round(series.null_count() / max(series.len(), 1) * 100, 1),
            "sample_values": sample_vals,
            "is_iogas_display": col in detection.iogas_display_cols,
        })

    return PreviewResult(
        columns=columns,
        preview_rows=df.to_dicts(),
        total_rows=total_rows,
        file_size_kb=file_size_kb,
        encoding_detected="utf-8",
        spatial_detection={
            "pairs": [
                {
                    "x_col": p.x_col,
                    "y_col": p.y_col,
                    "crs": p.crs,
                    "crs_label": p.crs_label,
                    "is_geographic": p.is_geographic,
                }
                for p in detection.pairs
            ],
            "iogas_display_cols": detection.iogas_display_cols,
        },
    )


# ── Import ────────────────────────────────────────────────────────────────────

def import_file(path: str, config: ImportConfig) -> pl.DataFrame:
    """Full import: read → apply null mappings → apply sample type mapping."""
    p = Path(path)
    ext = p.suffix.lower()

    if ext == ".csv":
        df = _read_csv_polars(path, separator=config.separator)
    elif ext in (".xlsx", ".xls", ".xlsm"):
        df = _read_excel_polars(path, sheet=config.sheet_name)
    else:
        raise ValueError(f"Unsupported file type: {ext}")

    for mapping in config.null_mappings:
        if mapping.column not in df.columns:
            continue
        sentinel = mapping.sentinel_value
        df = df.with_columns(
            pl.when(pl.col(mapping.column).cast(pl.String) == str(sentinel))
            .then(None)
            .otherwise(pl.col(mapping.column))
            .alias(mapping.column)
        )
        null_type_col = f"_nulltype_{mapping.column}"
        df = df.with_columns(
            pl.when(pl.col(mapping.column).is_null())
            .then(pl.lit(mapping.null_type))
            .otherwise(pl.lit(None))
            .alias(null_type_col)
        )

    if config.sample_type_mapping:
        stm = config.sample_type_mapping
        if stm.column in df.columns:
            expr = pl.col(stm.column).cast(pl.String)
            for raw_val, standard_type in stm.value_map.items():
                expr = (
                    pl.when(pl.col(stm.column).cast(pl.String) == raw_val)
                    .then(pl.lit(standard_type))
                    .otherwise(expr)
                )
            df = df.with_columns(expr.alias("__sample_type__"))
        else:
            df = df.with_columns(pl.lit("S").alias("__sample_type__"))

    return df


# ── Internal helpers ──────────────────────────────────────────────────────────

def _read_csv_polars(path: str, separator: str = ",") -> pl.DataFrame:
    sep = separator if len(separator) == 1 else ","
    try:
        return pl.read_csv(
            path,
            separator=sep,
            infer_schema_length=2000,
            null_values=["", "NA", "N/A", "n/a", "#N/A"],
            try_parse_dates=False,
            ignore_errors=False,
        )
    except Exception:
        return pl.read_csv(
            path,
            separator=sep,
            infer_schema=False,
            null_values=["", "NA", "N/A"],
        )


def _read_excel_polars(path: str, sheet: str | int = 0) -> pl.DataFrame:
    try:
        return pl.read_excel(path, sheet_name=sheet, infer_schema_length=2000)
    except Exception as e:
        raise RuntimeError(
            f"Failed to read Excel file. Make sure 'fastexcel' is installed. Error: {e}"
        ) from e


def _friendly_dtype(dtype: pl.DataType) -> str:
    s = str(dtype)
    if "Float" in s or "Int" in s:
        return "numeric"
    if "Boolean" in s:
        return "boolean"
    if "Date" in s or "Time" in s:
        return "datetime"
    return "text"
