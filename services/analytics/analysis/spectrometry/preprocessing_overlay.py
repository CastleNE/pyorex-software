"""
Non-destructive preprocessing overlay for spectral projects — structural
analog of analysis/data/overlay.py: one ops-log JSON per project (not per
dataset), each op carries a `scope` ({"all": true} or {"spectrum_ids": [...]})
so a preprocessing pipeline can apply to one sample or a whole batch.
`reflectance_raw` in spectra.parquet is NEVER mutated — every read goes
through `get_effective_spectrum()`, which replays scoped ops on top of it.
"""
from __future__ import annotations

import uuid
from datetime import datetime, timezone

import numpy as np
import polars as pl

from analysis.spectrometry.preprocessing import PreprocessingError, apply_operation
from analysis.spectrometry.storage import load_overlay_raw, load_table, save_overlay_raw


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def load_overlay(project_id: str) -> dict:
    return load_overlay_raw(project_id)


def save_overlay(project_id: str, overlay: dict) -> None:
    save_overlay_raw(project_id, overlay)


def _op_applies(op: dict, spectrum_id: str) -> bool:
    scope = op.get("scope", {})
    if scope.get("all"):
        return True
    return spectrum_id in scope.get("spectrum_ids", [])


def _load_raw_arrays(project_id: str, spectrum_id: str) -> tuple[np.ndarray, np.ndarray]:
    spectra = load_table(project_id, "spectra")
    row = spectra.filter(pl.col("spectrum_id") == spectrum_id)
    if row.height == 0:
        raise ValueError(f"Spectrum not found: {spectrum_id}")
    wavelength = np.array(row["wavelength"][0], dtype=float)
    reflectance = np.array(row["reflectance_raw"][0], dtype=float)
    return wavelength, reflectance


def get_effective_spectrum(project_id: str, spectrum_id: str) -> tuple[np.ndarray, np.ndarray, list[str]]:
    """Raw spectrum + every op in the overlay whose scope includes this
    spectrum_id, replayed in order. Never mutates the stored raw arrays."""
    wavelength, reflectance = _load_raw_arrays(project_id, spectrum_id)
    overlay = load_overlay_raw(project_id)
    applied_steps: list[str] = []
    for op in overlay["ops"]:
        if _op_applies(op, spectrum_id):
            wavelength, reflectance = apply_operation(op["type"], wavelength, reflectance, op["params"])
            applied_steps.append(op["type"])
    return wavelength, reflectance, applied_steps


def _scope_test_spectrum_ids(project_id: str, scope: dict) -> list[str]:
    if scope.get("spectrum_ids"):
        return scope["spectrum_ids"]
    if scope.get("all"):
        spectra = load_table(project_id, "spectra")
        ids = spectra["spectrum_id"].to_list()
        return ids[:1]  # validating on the first spectrum is enough to catch parameter errors early
    return []


def append_op(project_id: str, op_type: str, params: dict, scope: dict) -> dict:
    """Validate the operation against the CURRENT effective spectrum(s) in
    scope (fails fast, never persists an invalid op), then append it."""
    for spectrum_id in _scope_test_spectrum_ids(project_id, scope):
        wavelength, reflectance, _ = get_effective_spectrum(project_id, spectrum_id)
        apply_operation(op_type, wavelength, reflectance, params)  # raises PreprocessingError if invalid

    now = _now()
    op_id = f"op_{uuid.uuid4().hex[:12]}"
    op = {"id": op_id, "type": op_type, "params": params, "scope": scope, "applied_at": now}

    overlay = load_overlay_raw(project_id)
    overlay["ops"].append(op)
    overlay["redo_stack"] = []
    overlay["history"].append({"op_id": op_id, "action": "applied", "at": now})
    save_overlay_raw(project_id, overlay)
    return overlay


def undo(project_id: str) -> dict:
    overlay = load_overlay_raw(project_id)
    if not overlay["ops"]:
        raise ValueError("Nothing to undo")
    op = overlay["ops"].pop()
    overlay["redo_stack"].append(op)
    overlay["history"].append({"op_id": op["id"], "action": "undone", "at": _now()})
    save_overlay_raw(project_id, overlay)
    return overlay


def redo(project_id: str) -> dict:
    overlay = load_overlay_raw(project_id)
    if not overlay["redo_stack"]:
        raise ValueError("Nothing to redo")
    op = overlay["redo_stack"].pop()
    overlay["ops"].append(op)
    overlay["history"].append({"op_id": op["id"], "action": "redone", "at": _now()})
    save_overlay_raw(project_id, overlay)
    return overlay


def save_pipeline_preset(project_id: str, name: str, ops: list[dict]) -> None:
    """Save an ordered, scope-less op list as a reusable named pipeline."""
    from analysis.spectrometry.storage import load_project_meta, save_project_meta

    meta = load_project_meta(project_id)
    meta.setdefault("pipeline_presets", {})[name] = ops
    save_project_meta(project_id, meta)


def apply_pipeline_preset(project_id: str, name: str, scope: dict) -> dict:
    from analysis.spectrometry.storage import load_project_meta

    meta = load_project_meta(project_id)
    preset_ops = meta.get("pipeline_presets", {}).get(name)
    if preset_ops is None:
        raise ValueError(f"No pipeline preset named {name!r}")
    overlay = load_overlay_raw(project_id)
    for step in preset_ops:
        overlay = append_op(project_id, step["type"], step["params"], scope)
    return overlay
