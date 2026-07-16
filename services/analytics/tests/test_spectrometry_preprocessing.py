import numpy as np
import pytest

from analysis.spectrometry import preprocessing_overlay as ov
from analysis.spectrometry import storage as s
from analysis.spectrometry.continuum import continuum_remove
from analysis.spectrometry.preprocessing import (
    PreprocessingError,
    derivative,
    normalize,
    reflectance_to_absorbance,
    select_range,
    smooth,
)


@pytest.fixture(autouse=True)
def isolated_projects_dir(tmp_path, monkeypatch):
    projects_dir = tmp_path / "spectral_projects"
    monkeypatch.setattr(s, "PROJECTS_DIR", projects_dir)
    yield projects_dir


def _make_spectrum(pid: str, spectrum_id: str = "SPEC-1") -> None:
    wl = list(range(350, 450))
    refl = [0.1 + 0.0005 * i for i in range(len(wl))]
    s.append_rows(pid, "spectra", [{
        "spectrum_id": spectrum_id, "sample_id": "S-1", "wavelength": wl, "reflectance_raw": refl,
        "band_count": len(wl), "wavelength_min": float(wl[0]), "wavelength_max": float(wl[-1]),
    }])


# ── Pure preprocessing functions ─────────────────────────────────────────────

def test_select_range_out_of_bounds_raises():
    wl = np.arange(350, 400, 1.0)
    refl = np.ones_like(wl) * 0.3
    with pytest.raises(PreprocessingError):
        select_range(wl, refl, 9000, 9999)


def test_normalize_minmax_flat_spectrum_raises():
    wl = np.arange(350, 400, 1.0)
    refl = np.ones_like(wl) * 0.3
    with pytest.raises(PreprocessingError):
        normalize(wl, refl, method="minmax")


def test_reflectance_to_absorbance_roundtrip():
    wl = np.arange(350, 360, 1.0)
    refl = np.array([0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.05, 0.15])
    _wl, absorb = reflectance_to_absorbance(wl, refl)
    assert np.all(absorb > 0)


def test_derivative_invalid_order_raises():
    wl = np.arange(350, 360, 1.0)
    refl = np.ones_like(wl)
    with pytest.raises(PreprocessingError):
        derivative(wl, refl, order=3)


def test_continuum_remove_flat_spectrum_near_one():
    wl = np.arange(2100, 2300, 1.0)
    refl = np.ones_like(wl) * 0.4
    cr = continuum_remove(wl, refl, "linear")
    assert np.allclose(cr, 1.0, atol=1e-6)


def test_smooth_too_short_spectrum_raises():
    wl = np.array([350.0, 351.0, 352.0])
    refl = np.array([0.1, 0.2, 0.3])
    with pytest.raises(PreprocessingError):
        smooth(wl, refl, window_length=11, polyorder=5)


# ── Non-destructive overlay ───────────────────────────────────────────────────

def test_get_effective_spectrum_with_no_ops_matches_raw():
    pid = s.create_project("P")
    _make_spectrum(pid)
    wl, refl, steps = ov.get_effective_spectrum(pid, "SPEC-1")
    assert steps == []
    assert len(wl) == 100


def test_original_reflectance_never_mutated():
    pid = s.create_project("P")
    _make_spectrum(pid)
    original = s.load_table(pid, "spectra")["reflectance_raw"][0].to_list()

    ov.append_op(pid, "normalize", {"method": "minmax"}, {"all": True})
    ov.append_op(pid, "derivative", {"order": 1}, {"spectrum_ids": ["SPEC-1"]})

    after = s.load_table(pid, "spectra")["reflectance_raw"][0].to_list()
    assert after == original


def test_undo_redo_roundtrip():
    pid = s.create_project("P")
    _make_spectrum(pid)
    ov.append_op(pid, "normalize", {"method": "minmax"}, {"all": True})
    _wl, _refl, steps_after_apply = ov.get_effective_spectrum(pid, "SPEC-1")
    assert steps_after_apply == ["normalize"]

    ov.undo(pid)
    _wl, _refl, steps_after_undo = ov.get_effective_spectrum(pid, "SPEC-1")
    assert steps_after_undo == []

    ov.redo(pid)
    _wl, _refl, steps_after_redo = ov.get_effective_spectrum(pid, "SPEC-1")
    assert steps_after_redo == ["normalize"]


def test_scope_all_vs_subset():
    pid = s.create_project("P")
    _make_spectrum(pid, "SPEC-1")
    _make_spectrum(pid, "SPEC-2")

    ov.append_op(pid, "normalize", {"method": "minmax"}, {"spectrum_ids": ["SPEC-1"]})
    _wl1, _r1, steps1 = ov.get_effective_spectrum(pid, "SPEC-1")
    _wl2, _r2, steps2 = ov.get_effective_spectrum(pid, "SPEC-2")
    assert steps1 == ["normalize"]
    assert steps2 == []


def test_invalid_operation_not_persisted():
    pid = s.create_project("P")
    _make_spectrum(pid)
    with pytest.raises(PreprocessingError):
        ov.append_op(pid, "select_range", {"wl_min": 9000, "wl_max": 9999}, {"all": True})
    overlay = ov.load_overlay(pid)
    assert overlay["ops"] == []


def test_history_is_append_only():
    pid = s.create_project("P")
    _make_spectrum(pid)
    ov.append_op(pid, "normalize", {"method": "minmax"}, {"all": True})
    ov.undo(pid)
    ov.redo(pid)
    history = ov.load_overlay(pid)["history"]
    assert [h["action"] for h in history] == ["applied", "undone", "redone"]


def test_pipeline_preset_save_and_apply():
    pid = s.create_project("P")
    _make_spectrum(pid)
    ov.save_pipeline_preset(pid, "my_pipeline", [{"type": "normalize", "params": {"method": "minmax"}}])
    ov.apply_pipeline_preset(pid, "my_pipeline", {"all": True})
    _wl, _refl, steps = ov.get_effective_spectrum(pid, "SPEC-1")
    assert steps == ["normalize"]
