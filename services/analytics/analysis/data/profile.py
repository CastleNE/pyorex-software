"""Column profile of a dataset (Tabla y preparación → «Perfil de columnas»).

One summary per visible column of the rows the grid shows (same filters and selection as ``data.rows``):
how many values are valid, missing, below the detection limit or not analysed, the distribution of numeric
columns (quantiles, mean, std, IQR outliers and a histogram) and the most frequent values of text columns.

Values below the detection limit are counted, never imputed: they are already null in the value column and
flagged in its ``_nulltype_<column>`` companion (see ``analysis/data/importer.py``). Strongly right-skewed,
strictly positive columns (typical trace elements in ppm) get their histogram in log10, which is how they are
read in geochemistry; the response says so in ``histogram.scale``.
"""
from __future__ import annotations

import math

import polars as pl

NULLTYPE_PREFIX = "_nulltype_"
INTERNAL_COLUMNS = {"internal_feature_id", "__pyorex_row_index__"}
HISTOGRAM_BINS = 16
TOP_VALUES = 5
LOG_SKEW = 2.0          # skewness above which a strictly positive column is shown in log10
LOG_SPAN = 10.0         # ... and only when max/min spans at least one order of magnitude


def is_internal(name: str) -> bool:
    return name.startswith("_") or name in INTERNAL_COLUMNS


def _float(v) -> float | None:
    if v is None:
        return None
    f = float(v)
    return f if math.isfinite(f) else None


def _kind(dtype: pl.DataType) -> str:
    if dtype.is_numeric():
        return "numeric"
    if dtype == pl.Boolean:
        return "boolean"
    if dtype.is_temporal():
        return "datetime"
    if dtype in (pl.String, pl.Categorical) or isinstance(dtype, pl.Enum):
        return "text"
    return "other"


def _histogram(values: pl.Series) -> dict:
    lo, hi = float(values.min()), float(values.max())
    if lo == hi:
        return {"scale": "linear", "start": lo, "width": 0.0, "counts": [values.len()]}
    width = (hi - lo) / HISTOGRAM_BINS
    idx = ((values - lo) / width).floor().cast(pl.Int64).clip(0, HISTOGRAM_BINS - 1)
    counts = idx.value_counts()
    by_bin = dict(zip(counts[idx.name].to_list(), counts["count"].to_list()))
    return {"scale": "linear", "start": lo, "width": width, "counts": [int(by_bin.get(i, 0)) for i in range(HISTOGRAM_BINS)]}


def _numeric(values: pl.Series) -> dict | None:
    values = values.cast(pl.Float64).filter(values.cast(pl.Float64).is_finite())
    n = values.len()
    if n == 0:
        return None
    q1, median, q3 = (_float(values.quantile(q, "linear")) for q in (0.25, 0.5, 0.75))
    mean, std = _float(values.mean()), _float(values.std()) if n > 1 else None
    vmin, vmax = _float(values.min()), _float(values.max())
    outliers = 0
    if n >= 4 and q1 is not None and q3 is not None:
        iqr = q3 - q1
        outliers = int(((values < q1 - 1.5 * iqr) | (values > q3 + 1.5 * iqr)).sum())
    skew = _float(values.skew()) if n > 2 and std else None
    log = bool(vmin is not None and vmin > 0 and vmax / vmin >= LOG_SPAN and skew is not None and skew > LOG_SKEW)
    hist = _histogram(values.log10()) if log else _histogram(values)
    if log:
        hist["scale"] = "log10"
    return {"min": vmin, "q1": q1, "median": median, "q3": q3, "max": vmax, "mean": mean, "std": std,
            "outliers": outliers, "histogram": hist}


def _top(values: pl.Series) -> list[dict]:
    counts = values.cast(pl.String).value_counts(sort=True).head(TOP_VALUES)
    name = counts.columns[0]
    return [{"value": v, "count": int(c)} for v, c in zip(counts[name].to_list(), counts["count"].to_list())]


def profile_dataframe(df: pl.DataFrame, hidden: set[str] | frozenset[str] = frozenset()) -> list[dict]:
    """Profile of every visible, non-internal column of ``df`` (in dataset order)."""
    out: list[dict] = []
    for name in df.columns:
        if name in hidden or is_internal(name):
            continue
        series = df[name]
        kind = _kind(series.dtype)
        if kind == "text" and series.null_count() < df.height:
            # Assays imported with "<5"-style sentinels stay text after the sentinels are removed: profile them as
            # numbers when every remaining value is one.
            parsed = series.str.strip_chars().cast(pl.Float64, strict=False)
            if parsed.null_count() == series.null_count():
                series, kind = parsed, "numeric"
        nulltype = df[NULLTYPE_PREFIX + name] if NULLTYPE_PREFIX + name in df.columns else None
        below = int((nulltype == "BELOW_LOD").sum()) if nulltype is not None else 0
        not_analyzed = int((nulltype == "NOT_ANALYZED").sum()) if nulltype is not None else 0
        nulls = int(series.null_count())
        if kind == "numeric":
            nan = int(series.cast(pl.Float64).is_nan().sum())
            nulls += nan
        valid = df.height - nulls
        non_null = series.drop_nulls()
        distinct = int(non_null.n_unique()) if valid else 0
        item = {
            "name": name, "kind": kind, "valid": valid, "below_lod": below, "not_analyzed": not_analyzed,
            "missing": max(nulls - below - not_analyzed, 0), "distinct": distinct, "constant": valid > 1 and distinct == 1,
            "numeric": None, "top": None,
        }
        if kind == "numeric":
            item["numeric"] = _numeric(non_null)
        elif kind in ("text", "boolean"):
            item["top"] = _top(non_null) if valid else []
        out.append(item)
    return out
