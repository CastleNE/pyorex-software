"""
Lithogeochemistry - TAS (Total Alkali-Silica) classification.

Reduced scope by design: the full Le Bas et al. (1986) IUGS TAS diagram
defines 15 fields (Basalt, Andesite, Rhyolite, Trachyte, Phonolite, ...) via
precisely digitized polygon boundaries. Reproducing those coordinates from
memory risks silently misclassifying real samples under an authoritative-
looking citation, so until a verified reference source is available, this
module classifies by SiO2 series only, using Le Maitre's standard
ultrabasic/basic/intermediate/acid wt% cutoffs (45/52/63) - textbook-level
boundaries stated with confidence. Na2O+K2O ("total alkali") is still
computed and returned for plotting (pure arithmetic, no reference-data
risk), just not yet used to split fields further.
"""
from __future__ import annotations

from dataclasses import dataclass

import polars as pl

from analysis.qaqc.common import infer_sample_id_column

SERIES_BOUNDARIES: tuple[float, float, float] = (45.0, 52.0, 63.0)
SERIES_ORDER = ["Ultrabasic", "Basic", "Intermediate", "Acid"]


@dataclass
class TasSample:
    sample_id: str
    sio2: float | None
    total_alkali: float | None
    series: str


def classify_series(sio2: float | None) -> str:
    if sio2 is None or sio2 < 0 or sio2 > 100:
        return "Invalid"
    lo, mid, hi = SERIES_BOUNDARIES
    if sio2 < lo:
        return "Ultrabasic"
    if sio2 < mid:
        return "Basic"
    if sio2 < hi:
        return "Intermediate"
    return "Acid"


def classify_dataframe(
    df: pl.DataFrame,
    sio2_col: str,
    na2o_col: str,
    k2o_col: str,
    column_roles: dict[str, str] | None = None,
) -> list[TasSample]:
    for col in (sio2_col, na2o_col, k2o_col):
        if col not in df.columns:
            raise ValueError(f"Unknown column: {col}")

    sample_id_col = infer_sample_id_column(df, column_roles)
    sio2 = df[sio2_col]
    na2o = df[na2o_col]
    k2o = df[k2o_col]
    sample_ids = df[sample_id_col]

    samples: list[TasSample] = []
    for i in range(df.height):
        s = sio2[i]
        n = na2o[i]
        k = k2o[i]
        valid_inputs = s is not None and n is not None and k is not None and n >= 0 and k >= 0
        total_alkali = (n + k) if valid_inputs else None
        series = classify_series(s) if valid_inputs else "Invalid"
        samples.append(
            TasSample(
                sample_id=str(sample_ids[i]),
                sio2=float(s) if s is not None else None,
                total_alkali=float(total_alkali) if total_alkali is not None else None,
                series=series,
            )
        )
    return samples


def counts_by_series(samples: list[TasSample]) -> dict[str, int]:
    counts = {name: 0 for name in [*SERIES_ORDER, "Invalid"]}
    for s in samples:
        counts[s.series] = counts.get(s.series, 0) + 1
    return counts
