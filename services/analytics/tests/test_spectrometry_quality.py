import polars as pl

from analysis.spectrometry.quality import (
    check_duplicate_sample_ids,
    check_empty_spectra,
    check_identical_spectra,
    check_incomplete_spectra,
    check_saturation,
    compute_quality_status,
)


def _spectra_df(rows: list[dict]) -> pl.DataFrame:
    defaults = {
        "spectrum_id": "SPEC-X", "sample_id": "S-X", "original_filename": "f.csv",
        "wavelength": [], "reflectance_raw": [],
    }
    full_rows = [{**defaults, **r} for r in rows]
    return pl.DataFrame(full_rows)


def test_check_empty_spectra():
    df = _spectra_df([
        {"spectrum_id": "SPEC-1", "wavelength": [], "reflectance_raw": []},
        {"spectrum_id": "SPEC-2", "wavelength": [1.0, 2.0], "reflectance_raw": [0.1, 0.2]},
    ])
    result = check_empty_spectra(df)
    assert len(result) == 1
    assert result[0]["spectrum_id"] == "SPEC-1"


def test_check_saturation_flat_spectrum_no_false_positive():
    wl = list(range(2100, 2300))
    refl = [0.4] * len(wl)  # no saturation
    df = _spectra_df([{"spectrum_id": "SPEC-1", "wavelength": wl, "reflectance_raw": refl}])
    assert check_saturation(df) == []


def test_check_saturation_flags_pinned_values():
    wl = list(range(2100, 2300))
    refl = [0.995] * len(wl)
    df = _spectra_df([{"spectrum_id": "SPEC-1", "wavelength": wl, "reflectance_raw": refl}])
    result = check_saturation(df)
    assert len(result) == 1


def test_check_duplicate_sample_ids_legitimate_multiple_spectra_not_flagged():
    """Multiple genuinely different spectra per sample (different files) are
    valid by design and must NOT be flagged as duplicate sample ids."""
    df = _spectra_df([
        {"spectrum_id": "SPEC-1", "sample_id": "S-1", "original_filename": "a.csv"},
        {"spectrum_id": "SPEC-2", "sample_id": "S-1", "original_filename": "b.csv"},
    ])
    assert check_duplicate_sample_ids(df) == []


def test_check_duplicate_sample_ids_same_file_imported_twice_flagged():
    df = _spectra_df([
        {"spectrum_id": "SPEC-1", "sample_id": "S-1", "original_filename": "a.csv"},
        {"spectrum_id": "SPEC-2", "sample_id": "S-1", "original_filename": "a.csv"},
    ])
    result = check_duplicate_sample_ids(df)
    assert len(result) == 1
    assert set(result[0]["spectrum_ids"]) == {"SPEC-1", "SPEC-2"}


def test_check_identical_spectra():
    wl = list(range(350, 360))
    refl = [0.3] * len(wl)
    df = _spectra_df([
        {"spectrum_id": "SPEC-1", "wavelength": wl, "reflectance_raw": refl},
        {"spectrum_id": "SPEC-2", "wavelength": wl, "reflectance_raw": refl},
        {"spectrum_id": "SPEC-3", "wavelength": wl, "reflectance_raw": [v + 0.1 for v in refl]},
    ])
    result = check_identical_spectra(df)
    assert len(result) == 1
    assert set(result[0]["spectrum_ids"]) == {"SPEC-1", "SPEC-2"}


def test_check_incomplete_spectra_narrow_range_flagged():
    wl = list(range(350, 500))  # doesn't cover the 2100-2350 diagnostic region
    refl = [0.3] * len(wl)
    df = _spectra_df([{"spectrum_id": "SPEC-1", "wavelength": wl, "reflectance_raw": refl}])
    result = check_incomplete_spectra(df)
    assert len(result) == 1


def test_check_incomplete_spectra_full_range_not_flagged():
    wl = list(range(350, 2500))
    refl = [0.3] * len(wl)
    df = _spectra_df([{"spectrum_id": "SPEC-1", "wavelength": wl, "reflectance_raw": refl}])
    assert check_incomplete_spectra(df) == []


def test_compute_quality_status_no_findings_is_valid():
    status, score, reasons = compute_quality_status("SPEC-1", {"check_empty_spectra": []})
    assert status == "Valid"
    assert score == 100.0
    assert reasons == []


def test_compute_quality_status_critical_finding_is_invalid():
    checks = {"check_empty_spectra": [{"spectrum_id": "SPEC-1"}]}
    status, score, reasons = compute_quality_status("SPEC-1", checks)
    assert status == "Invalid"
    assert score < 100.0
    assert "check_empty_spectra" in reasons
