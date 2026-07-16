import numpy as np
import pytest

from analysis.spectrometry.library_match import (
    LibraryMatchError,
    library_match,
    match_score_from_angle,
    spectral_angle,
)


def test_self_match_score_is_100():
    wl = np.arange(2100, 2300, 1.0)
    refl = 0.5 - 0.1 * np.exp(-0.5 * ((wl - 2200) / 8) ** 2)
    angle = spectral_angle(refl, refl)
    assert angle == pytest.approx(0.0, abs=1e-6)
    assert match_score_from_angle(angle) == pytest.approx(100.0, abs=0.01)


def test_zero_vector_spectrum_raises_not_nan():
    a = np.zeros(10)
    b = np.ones(10)
    with pytest.raises(LibraryMatchError):
        spectral_angle(a, b)


def test_flat_spectra_different_levels_well_defined():
    a = np.ones(10) * 0.3
    b = np.ones(10) * 0.6
    angle = spectral_angle(a, b)
    assert np.isfinite(angle)
    assert angle == pytest.approx(0.0, abs=1e-6)  # parallel vectors -> zero angle regardless of magnitude


def test_library_match_ranks_best_candidate_first():
    wl = np.arange(2100, 2300, 1.0)
    sample = 0.5 - 0.1 * np.exp(-0.5 * ((wl - 2200) / 8) ** 2)
    close_match = sample.copy()
    far_match = 0.5 - 0.1 * np.exp(-0.5 * ((wl - 2260) / 8) ** 2)

    candidates = [
        {"reference_id": "REF-far", "name": "Far", "mineral_label": "X", "wavelength": wl.tolist(), "reflectance": far_match.tolist()},
        {"reference_id": "REF-close", "name": "Close", "mineral_label": "Y", "wavelength": wl.tolist(), "reflectance": close_match.tolist()},
    ]
    results = library_match(wl, sample, candidates, (2150, 2250))
    assert results[0].reference_id == "REF-close"
    assert results[0].match_score > results[1].match_score


def test_library_match_mismatched_grid_resamples_correctly():
    wl = np.arange(2100, 2300, 1.0)
    sample = 0.5 - 0.1 * np.exp(-0.5 * ((wl - 2200) / 8) ** 2)
    coarse_wl = np.arange(2100, 2300, 5.0)  # coarser reference grid
    coarse_refl = 0.5 - 0.1 * np.exp(-0.5 * ((coarse_wl - 2200) / 8) ** 2)

    candidates = [{"reference_id": "REF-1", "name": "Coarse", "mineral_label": "Z", "wavelength": coarse_wl.tolist(), "reflectance": coarse_refl.tolist()}]
    results = library_match(wl, sample, candidates, (2150, 2250))
    assert len(results) == 1
    assert results[0].match_score > 95.0  # near-identical shape despite different sampling


def test_region_too_narrow_raises():
    wl = np.arange(2100, 2300, 1.0)
    sample = np.ones_like(wl) * 0.3
    with pytest.raises(LibraryMatchError):
        library_match(wl, sample, [], (2200.0, 2200.5))
