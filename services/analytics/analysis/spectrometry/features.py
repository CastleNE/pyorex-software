"""
Generic continuum-removed absorption-feature extraction over a configurable
window — NOT hardcoded to any specific mineral; presets (Al-OH/Mg-OH/Fe-OH/
H2O/OH) are just named default windows, see feature_presets.py.
"""
from __future__ import annotations

from dataclasses import dataclass
from typing import Literal

import numpy as np

from analysis.spectrometry.continuum import continuum_remove

QualityIndicator = Literal["ok", "no_feature_detected", "minimum_at_edge", "multiple_local_minima", "shallow_feature"]

SHALLOW_DEPTH_THRESHOLD = 0.01


@dataclass
class FeatureResult:
    center: float | None
    depth: float | None
    width_fwhm: float | None
    area: float | None
    asymmetry: float | None
    quality_indicator: QualityIndicator
    window_min: float = 0.0
    window_max: float = 0.0
    continuum_method: str = "convex_hull"


def _empty_result(window: tuple[float, float], continuum_method: str, indicator: QualityIndicator) -> FeatureResult:
    return FeatureResult(None, None, None, None, None, indicator, window[0], window[1], continuum_method)


def extract_feature(
    wavelength: np.ndarray,
    reflectance: np.ndarray,
    window: tuple[float, float],
    continuum_method: Literal["convex_hull", "linear"] = "convex_hull",
) -> FeatureResult:
    wl_min, wl_max = window
    mask = (wavelength >= wl_min) & (wavelength <= wl_max)
    wl = wavelength[mask]
    refl = reflectance[mask]

    if len(wl) < 5:
        return _empty_result(window, continuum_method, "no_feature_detected")

    cr = continuum_remove(wl, refl, continuum_method)  # type: ignore[arg-type]
    min_idx = int(np.argmin(cr))
    min_val = float(cr[min_idx])
    depth = 1.0 - min_val

    if depth <= 0:
        return _empty_result(window, continuum_method, "no_feature_detected")

    at_edge = min_idx == 0 or min_idx == len(wl) - 1

    # Count local minima strictly inside the window as a proxy for ambiguity.
    n_local_minima = 0
    if len(cr) >= 3:
        interior = cr[1:-1]
        local_min_mask = (interior < cr[:-2]) & (interior < cr[2:])
        n_local_minima = int(local_min_mask.sum())

    # Parabolic refinement of the band center around the discrete minimum.
    if 0 < min_idx < len(wl) - 1:
        x0, x1, x2 = wl[min_idx - 1], wl[min_idx], wl[min_idx + 1]
        y0, y1, y2 = cr[min_idx - 1], cr[min_idx], cr[min_idx + 1]
        denom = y0 - 2 * y1 + y2
        if denom != 0:
            step = (x2 - x0) / 2.0
            delta = 0.5 * (y0 - y2) / denom
            center = float(x1 + np.clip(delta, -1, 1) * step)
        else:
            center = float(x1)
    else:
        center = float(wl[min_idx])

    half_level = 1.0 - depth / 2.0
    left_wl = _interp_crossing(wl, cr, min_idx, half_level, direction=-1)
    right_wl = _interp_crossing(wl, cr, min_idx, half_level, direction=1)
    width_fwhm = (right_wl - left_wl) if (left_wl is not None and right_wl is not None) else None

    _trapz = getattr(np, "trapezoid", None) or np.trapz  # numpy >=2.0 renamed trapz -> trapezoid
    area = float(_trapz(1.0 - cr, wl))

    asymmetry = None
    if width_fwhm and left_wl is not None and right_wl is not None:
        left_half = center - left_wl
        right_half = right_wl - center
        total = left_half + right_half
        if total > 0:
            asymmetry = (right_half - left_half) / total

    if at_edge:
        indicator: QualityIndicator = "minimum_at_edge"
    elif n_local_minima > 1:
        indicator = "multiple_local_minima"
    elif depth < SHALLOW_DEPTH_THRESHOLD:
        indicator = "shallow_feature"
    else:
        indicator = "ok"

    return FeatureResult(
        center=round(center, 2), depth=round(depth, 5),
        width_fwhm=round(width_fwhm, 2) if width_fwhm is not None else None,
        area=round(area, 5),
        asymmetry=round(asymmetry, 4) if asymmetry is not None else None,
        quality_indicator=indicator, window_min=wl_min, window_max=wl_max, continuum_method=continuum_method,
    )


def _interp_crossing(wl: np.ndarray, cr: np.ndarray, start_idx: int, level: float, direction: int) -> float | None:
    """Walk from start_idx in `direction` (-1 left, +1 right) until cr crosses
    `level`, then linearly interpolate the exact crossing wavelength."""
    i = start_idx
    n = len(wl)
    while 0 <= i + direction < n and cr[i] < level:
        i += direction
    if not (0 <= i < n) or cr[i] < level:
        return None  # never crosses within the window
    prev = i - direction
    if not (0 <= prev < n):
        return float(wl[i])
    y0, y1 = cr[prev], cr[i]
    x0, x1 = wl[prev], wl[i]
    if y1 == y0:
        return float(x1)
    t = (level - y0) / (y1 - y0)
    return float(x0 + t * (x1 - x0))
