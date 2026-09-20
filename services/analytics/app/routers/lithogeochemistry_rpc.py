"""
JSON-RPC handlers for the Lithogeochemistry module — `lithogeochemistry.*`
methods, merged into rpc.py's METHOD_REGISTRY. Kept in its own file, same
convention as spectrometry_rpc.py.
"""
from __future__ import annotations

from dataclasses import asdict
from typing import Any

from analysis.data import overlay
from analysis.lithogeochemistry.tas import SERIES_BOUNDARIES, classify_dataframe, counts_by_series


def _rpc_tas_classify(params: dict) -> dict:
    dataset_id = params["dataset_id"]
    df, _hidden = overlay.get_effective_dataframe(dataset_id)
    samples = classify_dataframe(df, params["sio2_column"], params["na2o_column"], params["k2o_column"])
    return {
        "samples": [asdict(s) for s in samples],
        "counts_by_series": counts_by_series(samples),
        "series_boundaries": list(SERIES_BOUNDARIES),
    }


LITHOGEOCHEMISTRY_METHODS: dict[str, Any] = {
    "lithogeochemistry.tas.classify": _rpc_tas_classify,
}
