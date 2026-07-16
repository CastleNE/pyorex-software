"""
Library matching via Spectral Angle Mapper (SAM) — scale/albedo-invariant,
the de facto standard metric for TSG/USGS-style spectral library comparison
(chosen over a plain correlation, which the spec never names and which is
more sensitive to overall brightness normalization differences between the
sample and reference spectra).

A statistical match is NEVER auto-persisted as a confirmed mineral ID — the
caller (interpretation.py) always commits results as `state="suggested"`.
"""
from __future__ import annotations

from dataclasses import dataclass

import numpy as np


class LibraryMatchError(ValueError):
    pass


@dataclass
class MatchResult:
    reference_id: str
    name: str
    mineral_label: str
    angle_radians: float
    match_score: float


def spectral_angle(a: np.ndarray, b: np.ndarray) -> float:
    norm = float(np.linalg.norm(a) * np.linalg.norm(b))
    if norm == 0:
        raise LibraryMatchError("Cannot compute a spectral angle against an all-zero spectrum")
    cos_angle = np.clip(float(np.dot(a, b)) / norm, -1.0, 1.0)
    return float(np.arccos(cos_angle))


def match_score_from_angle(angle_radians: float) -> float:
    return round(100.0 * (1.0 - angle_radians / (np.pi / 2)), 2)


def library_match(
    sample_wl: np.ndarray,
    sample_refl: np.ndarray,
    candidates: list[dict],
    region: tuple[float, float],
) -> list[MatchResult]:
    """candidates: [{"reference_id","name","mineral_label","wavelength","reflectance"}, ...]"""
    lo, hi = region
    mask = (sample_wl >= lo) & (sample_wl <= hi)
    common_wl = sample_wl[mask]
    if len(common_wl) < 5:
        raise LibraryMatchError(f"Comparison region [{lo}, {hi}] contains fewer than 5 sample points")
    sample_segment = sample_refl[mask]

    results: list[MatchResult] = []
    for cand in candidates:
        cand_wl = np.array(cand["wavelength"], dtype=float)
        cand_refl = np.array(cand["reflectance"], dtype=float)
        if cand_wl.min() > lo or cand_wl.max() < hi:
            continue  # reference doesn't cover the comparison region
        cand_resampled = np.interp(common_wl, cand_wl, cand_refl)
        try:
            angle = spectral_angle(sample_segment, cand_resampled)
        except LibraryMatchError:
            continue
        results.append(MatchResult(
            reference_id=cand["reference_id"], name=cand["name"], mineral_label=cand.get("mineral_label", ""),
            angle_radians=round(angle, 5), match_score=match_score_from_angle(angle),
        ))

    results.sort(key=lambda r: -r.match_score)
    return results
