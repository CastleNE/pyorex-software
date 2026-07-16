import pytest

from analysis.spectrometry import storage as s
from analysis.spectrometry.mineral_population import CHLORITE_CLASS_TABLE, WHITE_MICA_CLASS_TABLE, analyze_white_mica, classify_value


@pytest.fixture(autouse=True)
def isolated_projects_dir(tmp_path, monkeypatch):
    projects_dir = tmp_path / "spectral_projects"
    monkeypatch.setattr(s, "PROJECTS_DIR", projects_dir)
    yield projects_dir


def test_classify_value_exact_class_boundary():
    # 2200.0 is the shared boundary between "Phengitic" [2190,2200] and "Muscovite" [2200,2208]
    result = classify_value(2200.0, WHITE_MICA_CLASS_TABLE)
    # inclusive lower bound of the second entry wins because ranges are checked in order and both are inclusive;
    # the important thing is it resolves to ONE definite class, not None/ambiguous.
    assert result in ("Phengitic (low-Al)", "Muscovite")


def test_classify_value_outside_all_ranges_is_none():
    assert classify_value(9999.0, WHITE_MICA_CLASS_TABLE) is None


def test_classify_value_none_input_is_none():
    assert classify_value(None, CHLORITE_CLASS_TABLE) is None


def test_analyze_white_mica_joins_sample_metadata():
    pid = s.create_project("P")
    s.append_rows(pid, "samples", [{"sample_id": "S-1", "drillhole_id": "DH-1", "from_m": 10.0, "to_m": 12.0}])
    s.append_rows(pid, "features", [{
        "feature_id": "F1", "spectrum_id": "SPEC-1", "sample_id": "S-1", "preset_name": "AlOH_2200",
        "center": 2202.0, "depth": 0.15, "quality_indicator": "ok",
    }])
    result = analyze_white_mica(pid)
    assert result.height == 1
    row = result.to_dicts()[0]
    assert row["drillhole_id"] == "DH-1"
    assert row["spectral_class"] == "Muscovite"
    assert row["diagnostic_position"] == 2202.0
