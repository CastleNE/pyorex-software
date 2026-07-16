"""
Continuum computation — shared by preprocessing (continuum removal as a
preprocessing step) and feature extraction (continuum-removed band fitting).
One implementation, not two, so the two tools never disagree on the same math.
"""
from __future__ import annotations

from typing import Literal

import numpy as np

ContinuumMethod = Literal["convex_hull", "linear"]


def compute_continuum(wavelength: np.ndarray, reflectance: np.ndarray, method: ContinuumMethod = "convex_hull") -> np.ndarray:
    """Upper-envelope continuum line over the given window."""
    if method == "linear":
        return np.interp(wavelength, [wavelength[0], wavelength[-1]], [reflectance[0], reflectance[-1]])

    # Convex hull upper envelope: the smallest set of points forming a
    # concave-down chain above the spectrum, interpolated back onto the
    # original wavelength grid.
    points = np.column_stack([wavelength, reflectance])
    hull_idx = _upper_hull_indices(points)
    return np.interp(wavelength, wavelength[hull_idx], reflectance[hull_idx])


def _upper_hull_indices(points: np.ndarray) -> np.ndarray:
    """Monotone-chain upper convex hull (Andrew's algorithm), indices into `points`, sorted by x."""
    order = np.argsort(points[:, 0])
    pts = points[order]

    def cross(o, a, b):
        return (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0])

    upper: list[int] = []
    for i in range(len(pts)):
        while len(upper) >= 2 and cross(pts[upper[-2]], pts[upper[-1]], pts[i]) >= 0:
            upper.pop()
        upper.append(i)
    return order[np.array(upper)]


def continuum_remove(wavelength: np.ndarray, reflectance: np.ndarray, method: ContinuumMethod = "convex_hull") -> np.ndarray:
    continuum = compute_continuum(wavelength, reflectance, method)
    with np.errstate(divide="ignore", invalid="ignore"):
        removed = np.where(continuum != 0, reflectance / continuum, 1.0)
    return removed
