"""
Pure spectral preprocessing operations — each takes (wavelength, reflectance)
numpy arrays + params and returns NEW arrays. Never mutates in place; the
non-destructive ops-log wrapper lives in preprocessing_overlay.py.
"""
from __future__ import annotations

import numpy as np
from scipy.signal import savgol_filter

from analysis.spectrometry.continuum import continuum_remove as _continuum_remove


class PreprocessingError(ValueError):
    pass


def remove_invalid_values(wavelength: np.ndarray, reflectance: np.ndarray, **_) -> tuple[np.ndarray, np.ndarray]:
    mask = np.isfinite(reflectance) & (reflectance >= -0.5)
    return wavelength[mask], reflectance[mask]


def select_range(wavelength: np.ndarray, reflectance: np.ndarray, wl_min: float, wl_max: float, **_) -> tuple[np.ndarray, np.ndarray]:
    mask = (wavelength >= wl_min) & (wavelength <= wl_max)
    if not mask.any():
        raise PreprocessingError(f"No wavelengths fall within [{wl_min}, {wl_max}]")
    return wavelength[mask], reflectance[mask]


def remove_bands(wavelength: np.ndarray, reflectance: np.ndarray, ranges: list[tuple[float, float]], **_) -> tuple[np.ndarray, np.ndarray]:
    mask = np.ones(len(wavelength), dtype=bool)
    for lo, hi in ranges:
        mask &= ~((wavelength >= lo) & (wavelength <= hi))
    return wavelength[mask], reflectance[mask]


def interpolate_gaps(wavelength: np.ndarray, reflectance: np.ndarray, step: float | None = None, **_) -> tuple[np.ndarray, np.ndarray]:
    if len(wavelength) < 2:
        raise PreprocessingError("Need at least 2 points to interpolate gaps")
    resolved_step = step or float(np.median(np.diff(wavelength)))
    if resolved_step <= 0:
        raise PreprocessingError("Could not determine a positive wavelength step")
    full_grid = np.arange(wavelength[0], wavelength[-1] + resolved_step / 2, resolved_step)
    interpolated = np.interp(full_grid, wavelength, reflectance)
    return full_grid, interpolated


def smooth(wavelength: np.ndarray, reflectance: np.ndarray, window_length: int = 11, polyorder: int = 2, **_) -> tuple[np.ndarray, np.ndarray]:
    n = len(reflectance)
    wl_eff = min(window_length, n - (1 - n % 2))
    if wl_eff % 2 == 0:
        wl_eff -= 1
    if wl_eff < polyorder + 2:
        raise PreprocessingError(f"Spectrum too short ({n} points) to smooth with polyorder={polyorder}")
    smoothed = savgol_filter(reflectance, window_length=wl_eff, polyorder=polyorder)
    return wavelength, smoothed


def normalize(wavelength: np.ndarray, reflectance: np.ndarray, method: str = "minmax", **_) -> tuple[np.ndarray, np.ndarray]:
    if method == "vector":
        norm = np.linalg.norm(reflectance)
        if norm == 0:
            raise PreprocessingError("Cannot vector-normalize an all-zero spectrum")
        return wavelength, reflectance / norm
    lo, hi = float(np.min(reflectance)), float(np.max(reflectance))
    if hi == lo:
        raise PreprocessingError("Cannot min-max normalize a flat (constant) spectrum")
    return wavelength, (reflectance - lo) / (hi - lo)


def baseline_correct(wavelength: np.ndarray, reflectance: np.ndarray, **_) -> tuple[np.ndarray, np.ndarray]:
    baseline = np.interp(wavelength, [wavelength[0], wavelength[-1]], [reflectance[0], reflectance[-1]])
    return wavelength, reflectance - baseline


def continuum_remove(wavelength: np.ndarray, reflectance: np.ndarray, method: str = "convex_hull", **_) -> tuple[np.ndarray, np.ndarray]:
    return wavelength, _continuum_remove(wavelength, reflectance, method)  # type: ignore[arg-type]


def reflectance_to_absorbance(wavelength: np.ndarray, reflectance: np.ndarray, **_) -> tuple[np.ndarray, np.ndarray]:
    safe = np.clip(reflectance, 1e-6, None)
    return wavelength, -np.log10(safe)


def absorbance_to_reflectance(wavelength: np.ndarray, absorbance: np.ndarray, **_) -> tuple[np.ndarray, np.ndarray]:
    return wavelength, 10.0 ** (-absorbance)


def derivative(wavelength: np.ndarray, reflectance: np.ndarray, order: int = 1, **_) -> tuple[np.ndarray, np.ndarray]:
    if order not in (1, 2):
        raise PreprocessingError("Derivative order must be 1 or 2")
    result = reflectance
    for _i in range(order):
        result = np.gradient(result, wavelength)
    return wavelength, result


def correct_splice(wavelength: np.ndarray, reflectance: np.ndarray, splice_wavelengths: list[float] | None = None, **_) -> tuple[np.ndarray, np.ndarray]:
    splices = splice_wavelengths or [1000.0, 1830.0]
    refl = reflectance.copy()
    for splice_wl in splices:
        idx = int(np.searchsorted(wavelength, splice_wl))
        if idx <= 0 or idx >= len(wavelength):
            continue
        offset = refl[idx - 1] - refl[idx]
        refl[idx:] += offset
    return wavelength, refl


def resample(wavelength: np.ndarray, reflectance: np.ndarray, target_wl: np.ndarray, **_) -> tuple[np.ndarray, np.ndarray]:
    target = np.asarray(target_wl, dtype=float)
    return target, np.interp(target, wavelength, reflectance)


OPERATIONS = {
    "remove_invalid_values": remove_invalid_values,
    "select_range": select_range,
    "remove_bands": remove_bands,
    "interpolate_gaps": interpolate_gaps,
    "smooth": smooth,
    "normalize": normalize,
    "baseline_correct": baseline_correct,
    "continuum_remove": continuum_remove,
    "reflectance_to_absorbance": reflectance_to_absorbance,
    "absorbance_to_reflectance": absorbance_to_reflectance,
    "derivative": derivative,
    "correct_splice": correct_splice,
    "resample": resample,
}


def apply_operation(op_type: str, wavelength: np.ndarray, reflectance: np.ndarray, params: dict) -> tuple[np.ndarray, np.ndarray]:
    if op_type not in OPERATIONS:
        raise PreprocessingError(f"Unknown preprocessing operation: {op_type}")
    return OPERATIONS[op_type](wavelength, reflectance, **params)
