"""
Generic spectral-population classification — ONE function shared by White
Mica Analysis and Chlorite Analysis (spec §14/§15: both are spectral proxies
classified from an absorption-feature position, not direct chemical
analyses — the same recipe with a different preset/class table, not two
bespoke tools).
"""
from __future__ import annotations

import polars as pl

from analysis.spectrometry.storage import load_table

WHITE_MICA_CLASS_TABLE: list[dict] = [
    {"class_name": "Phengitic (low-Al)", "range": [2190.0, 2200.0]},
    {"class_name": "Muscovite", "range": [2200.0, 2208.0]},
    {"class_name": "Paragonitic (high-Al)", "range": [2208.0, 2220.0]},
]

CHLORITE_CLASS_TABLE: list[dict] = [
    {"class_name": "Mg-chlorite (clinochlore)", "range": [2320.0, 2335.0]},
    {"class_name": "Fe-chlorite (chamosite)", "range": [2335.0, 2360.0]},
]


def classify_value(value: float | None, class_table: list[dict]) -> str | None:
    if value is None:
        return None
    for entry in class_table:
        lo, hi = entry["range"]
        if lo <= value <= hi:
            return entry["class_name"]
    return None


def classify_population(project_id: str, preset_name: str, class_table: list[dict], param: str = "center") -> pl.DataFrame:
    """Joins features (filtered to preset_name) with samples, adds a
    `spectral_class` column. Result is explicitly a spectral proxy — never
    presented as a direct chemical composition."""
    features = load_table(project_id, "features").filter(pl.col("preset_name") == preset_name)
    samples = load_table(project_id, "samples")

    classes = [classify_value(v, class_table) for v in features[param].to_list()]
    features = features.with_columns(pl.Series("spectral_class", classes))

    joined = features.join(samples, on="sample_id", how="left", suffix="_sample")
    return joined.select([
        "sample_id", "drillhole_id", "from_m", "to_m", "spectrum_id",
        param, "spectral_class", "depth", "quality_indicator",
    ]).rename({param: "diagnostic_position"})


def analyze_white_mica(project_id: str, preset_name: str = "AlOH_2200") -> pl.DataFrame:
    return classify_population(project_id, preset_name, WHITE_MICA_CLASS_TABLE)


def analyze_chlorite(project_id: str, preset_name: str = "MgOH_2320") -> pl.DataFrame:
    return classify_population(project_id, preset_name, CHLORITE_CLASS_TABLE)
