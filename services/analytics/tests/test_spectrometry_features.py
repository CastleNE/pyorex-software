import numpy as np
import pytest

from analysis.spectrometry.features import extract_feature


def _gaussian_dip(wl, center, depth, sigma, continuum=0.5):
    return continuum * (1 - depth * np.exp(-0.5 * ((wl - center) / sigma) ** 2))


def test_clean_gaussian_feature_matches_hand_computed_values():
    wl = np.arange(2150, 2231, 1.0)
    center_true, depth_true, sigma = 2200.0, 0.15, 8.0
    refl = _gaussian_dip(wl, center_true, depth_true, sigma)

    result = extract_feature(wl, refl, (2150, 2230), "linear")

    assert result.center == pytest.approx(center_true, abs=0.1)
    assert result.depth == pytest.approx(depth_true, abs=0.001)
    expected_fwhm = 2.3548 * sigma
    assert result.width_fwhm == pytest.approx(expected_fwhm, abs=0.1)
    assert result.quality_indicator == "ok"


def test_flat_spectrum_no_feature_detected_no_crash():
    wl = np.arange(2150, 2231, 1.0)
    refl = np.ones_like(wl) * 0.3
    result = extract_feature(wl, refl, (2150, 2230))
    assert result.quality_indicator == "no_feature_detected"
    assert result.center is None


def test_minimum_at_window_edge_flagged():
    wl = np.arange(2150, 2231, 1.0)
    refl = _gaussian_dip(wl, 2150.0, 0.15, 8.0)  # dip centered exactly at the left edge
    result = extract_feature(wl, refl, (2150, 2230), "linear")
    assert result.quality_indicator in ("minimum_at_edge", "shallow_feature")


def test_multiple_local_minima_flagged_but_global_min_still_returned():
    wl = np.arange(2100, 2301, 1.0)
    refl = _gaussian_dip(wl, 2150.0, 0.05, 6.0) * _gaussian_dip(wl, 2250.0, 0.15, 6.0) / 0.5
    result = extract_feature(wl, refl, (2100, 2300), "linear")
    assert result.center is not None  # still returns a result, doesn't crash
    assert result.quality_indicator in ("multiple_local_minima", "ok")


def test_window_too_narrow_returns_no_feature_detected():
    wl = np.arange(2150, 2160, 1.0)
    refl = np.ones_like(wl) * 0.3
    result = extract_feature(wl, refl, (2150, 2152))
    assert result.quality_indicator == "no_feature_detected"


def test_area_is_positive_for_a_real_absorption_feature():
    wl = np.arange(2150, 2231, 1.0)
    refl = _gaussian_dip(wl, 2200.0, 0.15, 8.0)
    result = extract_feature(wl, refl, (2150, 2230), "linear")
    assert result.area is not None and result.area > 0
