"""
Spectral Quality Control — one pure function per check, mirroring
analysis/data/quality.py's shape. Read-only findings; NEVER auto-deletes an
invalid/flagged spectrum (project rule, same as the tabular Data Quality tool).
"""
from __future__ import annotations

import hashlib
from collections import defaultdict

import numpy as np
import polars as pl

from analysis.spectrometry.storage import load_table, save_table

DIAGNOSTIC_RANGE_MIN = 2100.0  # Al-OH/Mg-OH/Fe-OH diagnostic region needs to be covered
DIAGNOSTIC_RANGE_MAX = 2350.0


def _arrays(row: dict) -> tuple[np.ndarray, np.ndarray]:
    return np.array(row["wavelength"], dtype=float), np.array(row["reflectance_raw"], dtype=float)


def check_empty_spectra(spectra: pl.DataFrame) -> list[dict]:
    out = []
    for row in spectra.iter_rows(named=True):
        if len(row["wavelength"]) == 0 or len(row["reflectance_raw"]) == 0:
            out.append({"spectrum_id": row["spectrum_id"], "reason": "empty wavelength or reflectance array"})
    return out


def check_non_numeric_values(spectra: pl.DataFrame) -> list[dict]:
    out = []
    for row in spectra.iter_rows(named=True):
        _wl, refl = _arrays(row)
        if refl.size and not np.all(np.isfinite(refl)):
            out.append({"spectrum_id": row["spectrum_id"], "n_non_finite": int((~np.isfinite(refl)).sum())})
    return out


def check_out_of_range_reflectance(spectra: pl.DataFrame, lo: float = -0.05, hi: float = 1.5) -> list[dict]:
    out = []
    for row in spectra.iter_rows(named=True):
        _wl, refl = _arrays(row)
        if refl.size == 0:
            continue
        finite = refl[np.isfinite(refl)]
        if finite.size and (finite.min() < lo or finite.max() > hi):
            out.append({"spectrum_id": row["spectrum_id"], "min": float(finite.min()), "max": float(finite.max())})
    return out


def check_saturation(spectra: pl.DataFrame, threshold: float = 0.99, frac: float = 0.05) -> list[dict]:
    out = []
    for row in spectra.iter_rows(named=True):
        _wl, refl = _arrays(row)
        if refl.size == 0:
            continue
        saturated_frac = float((refl >= threshold).mean())
        if saturated_frac >= frac:
            out.append({"spectrum_id": row["spectrum_id"], "saturated_fraction": round(saturated_frac, 3)})
    return out


def check_low_reflectance(spectra: pl.DataFrame, threshold: float = 0.02) -> list[dict]:
    out = []
    for row in spectra.iter_rows(named=True):
        _wl, refl = _arrays(row)
        if refl.size and float(np.mean(refl)) < threshold:
            out.append({"spectrum_id": row["spectrum_id"], "mean_reflectance": round(float(np.mean(refl)), 4)})
    return out


def check_high_noise(spectra: pl.DataFrame, threshold: float = 0.05) -> list[dict]:
    out = []
    for row in spectra.iter_rows(named=True):
        wl, refl = _arrays(row)
        if refl.size < 5:
            continue
        roughness = float(np.std(np.diff(refl, n=2)))
        if roughness > threshold:
            out.append({"spectrum_id": row["spectrum_id"], "roughness": round(roughness, 5)})
    return out


def check_missing_bands(spectra: pl.DataFrame) -> list[dict]:
    out = []
    for row in spectra.iter_rows(named=True):
        wl, _refl = _arrays(row)
        if wl.size < 3:
            continue
        diffs = np.diff(wl)
        median_step = np.median(diffs)
        gaps = int((diffs > median_step * 2.5).sum())
        if gaps > 0:
            out.append({"spectrum_id": row["spectrum_id"], "gap_count": gaps})
    return out


def check_duplicate_wavelengths(spectra: pl.DataFrame) -> list[dict]:
    out = []
    for row in spectra.iter_rows(named=True):
        wl, _refl = _arrays(row)
        if wl.size and len(set(wl.tolist())) != wl.size:
            out.append({"spectrum_id": row["spectrum_id"], "n_duplicates": wl.size - len(set(wl.tolist()))})
    return out


def check_incomplete_spectra(spectra: pl.DataFrame) -> list[dict]:
    out = []
    for row in spectra.iter_rows(named=True):
        wl, _refl = _arrays(row)
        if wl.size == 0:
            continue
        if not (wl.min() <= DIAGNOSTIC_RANGE_MIN and wl.max() >= DIAGNOSTIC_RANGE_MAX):
            out.append({
                "spectrum_id": row["spectrum_id"],
                "reason": f"does not cover the {DIAGNOSTIC_RANGE_MIN:.0f}-{DIAGNOSTIC_RANGE_MAX:.0f} nm diagnostic region",
                "wavelength_min": float(wl.min()), "wavelength_max": float(wl.max()),
            })
    return out


def check_detector_discontinuities(spectra: pl.DataFrame, splices: list[float] | None = None, threshold: float = 0.03) -> list[dict]:
    splice_list = splices or [1000.0, 1830.0]
    out = []
    for row in spectra.iter_rows(named=True):
        wl, refl = _arrays(row)
        if wl.size < 3:
            continue
        jumps = []
        for splice_wl in splice_list:
            idx = int(np.searchsorted(wl, splice_wl))
            if 0 < idx < len(wl):
                jump = abs(float(refl[idx] - refl[idx - 1]))
                if jump > threshold:
                    jumps.append({"near_nm": splice_wl, "jump": round(jump, 4)})
        if jumps:
            out.append({"spectrum_id": row["spectrum_id"], "discontinuities": jumps})
    return out


def check_possible_calibration_issues(spectra: pl.DataFrame) -> list[dict]:
    """Heuristic only — flags spectra with a suspiciously large fraction of
    values above 1.0 reflectance, a common calibration/dark-current symptom.
    NOT authoritative; always shown alongside its criteria."""
    out = []
    for row in spectra.iter_rows(named=True):
        _wl, refl = _arrays(row)
        if refl.size == 0:
            continue
        frac_over_1 = float((refl > 1.0).mean())
        if frac_over_1 > 0.10:
            out.append({"spectrum_id": row["spectrum_id"], "fraction_over_1": round(frac_over_1, 3)})
    return out


def check_duplicate_files(spectra: pl.DataFrame) -> list[dict]:
    seen: dict[str, list[str]] = defaultdict(list)
    for row in spectra.iter_rows(named=True):
        key = row.get("original_path") or ""
        if key:
            seen[key].append(row["spectrum_id"])
    return [{"original_path": path, "spectrum_ids": ids} for path, ids in seen.items() if len(ids) > 1]


def check_duplicate_sample_ids(spectra: pl.DataFrame) -> list[dict]:
    """Flags only the same (sample_id, original_filename) combination
    appearing more than once — i.e. the exact same file imported twice under
    the same sample. Multiple genuinely different spectra per sample are
    valid by design and never flagged here."""
    seen: dict[tuple[str, str], list[str]] = defaultdict(list)
    for row in spectra.iter_rows(named=True):
        key = (row.get("sample_id") or "", row.get("original_filename") or "")
        seen[key].append(row["spectrum_id"])
    return [
        {"sample_id": k[0], "original_filename": k[1], "spectrum_ids": ids}
        for k, ids in seen.items() if len(ids) > 1 and k[1]
    ]


def check_identical_spectra(spectra: pl.DataFrame) -> list[dict]:
    hashes: dict[str, list[str]] = defaultdict(list)
    for row in spectra.iter_rows(named=True):
        _wl, refl = _arrays(row)
        digest = hashlib.sha256(refl.round(6).tobytes()).hexdigest()
        hashes[digest].append(row["spectrum_id"])
    return [{"spectrum_ids": ids} for ids in hashes.values() if len(ids) > 1]


def check_insufficient_spectral_range(spectra: pl.DataFrame, min_span_nm: float = 500.0) -> list[dict]:
    out = []
    for row in spectra.iter_rows(named=True):
        wl, _refl = _arrays(row)
        if wl.size == 0:
            continue
        span = float(wl.max() - wl.min())
        if span < min_span_nm:
            out.append({"spectrum_id": row["spectrum_id"], "span_nm": round(span, 1)})
    return out


def compute_quality_status(spectrum_id: str, checks: dict[str, list[dict]]) -> tuple[str, float, list[str]]:
    reasons: list[str] = []
    critical_hits = 0
    warning_hits = 0

    critical_checks = ["check_empty_spectra", "check_non_numeric_values", "check_out_of_range_reflectance"]
    warning_checks = [
        "check_saturation", "check_low_reflectance", "check_high_noise", "check_missing_bands",
        "check_duplicate_wavelengths", "check_incomplete_spectra", "check_detector_discontinuities",
        "check_possible_calibration_issues", "check_insufficient_spectral_range",
    ]
    for check_name in critical_checks:
        if any(r.get("spectrum_id") == spectrum_id for r in checks.get(check_name, [])):
            critical_hits += 1
            reasons.append(check_name)
    for check_name in warning_checks:
        if any(r.get("spectrum_id") == spectrum_id for r in checks.get(check_name, [])):
            warning_hits += 1
            reasons.append(check_name)

    score = max(0.0, 100.0 - critical_hits * 40.0 - warning_hits * 10.0)
    if critical_hits > 0:
        status = "Invalid"
    elif warning_hits > 0:
        status = "Warning"
    else:
        status = "Valid"
    return status, round(score, 1), reasons


def run_spectral_quality_report(project_id: str) -> dict:
    spectra = load_table(project_id, "spectra")
    checks = {
        "check_empty_spectra": check_empty_spectra(spectra),
        "check_non_numeric_values": check_non_numeric_values(spectra),
        "check_out_of_range_reflectance": check_out_of_range_reflectance(spectra),
        "check_saturation": check_saturation(spectra),
        "check_low_reflectance": check_low_reflectance(spectra),
        "check_high_noise": check_high_noise(spectra),
        "check_missing_bands": check_missing_bands(spectra),
        "check_duplicate_wavelengths": check_duplicate_wavelengths(spectra),
        "check_incomplete_spectra": check_incomplete_spectra(spectra),
        "check_detector_discontinuities": check_detector_discontinuities(spectra),
        "check_possible_calibration_issues": check_possible_calibration_issues(spectra),
        "check_duplicate_files": check_duplicate_files(spectra),
        "check_duplicate_sample_ids": check_duplicate_sample_ids(spectra),
        "check_identical_spectra": check_identical_spectra(spectra),
        "check_insufficient_spectral_range": check_insufficient_spectral_range(spectra),
    }
    per_spectrum = []
    for spectrum_id in spectra["spectrum_id"].to_list():
        status, score, reasons = compute_quality_status(spectrum_id, checks)
        per_spectrum.append({"spectrum_id": spectrum_id, "status": status, "score": score, "reasons": reasons})
    return {"project_id": project_id, "checks": checks, "per_spectrum": per_spectrum}


def set_quality_status(project_id: str, spectrum_id: str, status: str, reason: str) -> None:
    spectra = load_table(project_id, "spectra")
    if spectrum_id not in spectra["spectrum_id"].to_list():
        raise ValueError(f"Spectrum not found: {spectrum_id}")
    spectra = spectra.with_columns(
        pl.when(pl.col("spectrum_id") == spectrum_id)
        .then(pl.lit(status))
        .otherwise(pl.col("quality_status"))
        .alias("quality_status"),
        pl.when(pl.col("spectrum_id") == spectrum_id)
        .then(pl.lit(True))
        .otherwise(pl.col("quality_reviewed"))
        .alias("quality_reviewed"),
    )
    save_table(project_id, "spectra", spectra)
