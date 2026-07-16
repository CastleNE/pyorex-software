import numpy as np
import pytest

from analysis.data import storage as data_storage
from analysis.spectrometry import storage as sp_storage
from app.routers.spectrometry_rpc import SPECTROMETRY_METHODS as M


@pytest.fixture(autouse=True)
def isolated_dirs(tmp_path, monkeypatch):
    monkeypatch.setattr(sp_storage, "PROJECTS_DIR", tmp_path / "spectral_projects")
    monkeypatch.setattr(data_storage, "DATASETS_DIR", tmp_path / "datasets")
    yield


def _write_ascii(tmp_path, name, center, depth):
    wl = np.arange(2100, 2400, 1.0)
    refl = 0.4 * (1 - depth * np.exp(-0.5 * ((wl - center) / 10) ** 2))
    path = tmp_path / name
    lines = ["Wavelength,Reflectance"] + [f"{w},{r}" for w, r in zip(wl, refl)]
    path.write_text("\n".join(lines), encoding="utf-8")
    return str(path)


def test_project_create_and_list():
    created = M["spectrometry.project.create"]({"name": "P1"})
    pid = created["project"]["id"]
    listing = M["spectrometry.project.list"]({})
    assert any(p["id"] == pid for p in listing["projects"])


def test_import_native_spectra_and_full_pipeline(tmp_path):
    pid = M["spectrometry.project.create"]({"name": "P1"})["project"]["id"]
    _write_ascii(tmp_path, "S-1.csv", 2202.0, 0.2)

    imp = M["spectrometry.import.native_spectra"]({"project_id": pid, "paths": [str(tmp_path)], "recursive": False})
    assert imp["n_imported"] == 1
    assert imp["n_failed"] == 0
    spectrum_id = imp["imported"][0]["spectrum_id"]

    feat = M["spectrometry.features.extract"]({"project_id": pid, "spectrum_ids": [spectrum_id], "preset_name": "AlOH_2200"})
    assert len(feat["results"]) == 1
    assert feat["results"][0]["quality_indicator"] == "ok"

    idx = M["spectrometry.indices.compute"]({"project_id": pid, "spectrum_ids": [spectrum_id], "index_name": "AlOH"})
    assert len(idx["results"]) == 1

    rules_result = M["spectrometry.interpretation.apply_rules"]({"project_id": pid, "spectrum_id": spectrum_id})
    assert len(rules_result["interpretation_ids"]) >= 1

    dataset_result = M["spectrometry.export.to_dataset"]({"project_id": pid})
    assert "dataset_id" in dataset_result


def test_import_native_spectra_isolates_bad_file(tmp_path):
    pid = M["spectrometry.project.create"]({"name": "P1"})["project"]["id"]
    _write_ascii(tmp_path, "good.csv", 2202.0, 0.2)
    (tmp_path / "bad.txt").write_text("not a spectrum", encoding="utf-8")

    imp = M["spectrometry.import.native_spectra"]({"project_id": pid, "paths": [str(tmp_path)], "recursive": False})
    assert imp["n_imported"] == 1
    assert imp["n_failed"] == 1


def test_spectra_get_unavailable_for_missing_spectrum():
    pid = M["spectrometry.project.create"]({"name": "P1"})["project"]["id"]
    result = M["spectrometry.spectra.get"]({"project_id": pid, "spectrum_id": "SPEC-does-not-exist"})
    assert result["available"] is False


def test_library_match_unavailable_with_empty_library(tmp_path):
    pid = M["spectrometry.project.create"]({"name": "P1"})["project"]["id"]
    _write_ascii(tmp_path, "S-1.csv", 2202.0, 0.2)
    imp = M["spectrometry.import.native_spectra"]({"project_id": pid, "paths": [str(tmp_path)], "recursive": False})
    spectrum_id = imp["imported"][0]["spectrum_id"]

    result = M["spectrometry.interpretation.library_match"]({"project_id": pid, "spectrum_id": spectrum_id})
    assert result["available"] is False


def test_quality_report_smoke(tmp_path):
    pid = M["spectrometry.project.create"]({"name": "P1"})["project"]["id"]
    _write_ascii(tmp_path, "S-1.csv", 2202.0, 0.2)
    M["spectrometry.import.native_spectra"]({"project_id": pid, "paths": [str(tmp_path)], "recursive": False})

    report = M["spectrometry.quality.report"]({"project_id": pid})
    assert "checks" in report
    assert len(report["per_spectrum"]) == 1


def test_white_mica_analyze_smoke(tmp_path):
    pid = M["spectrometry.project.create"]({"name": "P1"})["project"]["id"]
    _write_ascii(tmp_path, "S-1.csv", 2202.0, 0.2)
    imp = M["spectrometry.import.native_spectra"]({"project_id": pid, "paths": [str(tmp_path)], "recursive": False})
    spectrum_id = imp["imported"][0]["spectrum_id"]
    M["spectrometry.features.extract"]({"project_id": pid, "spectrum_ids": [spectrum_id], "preset_name": "AlOH_2200"})

    result = M["spectrometry.white_mica.analyze"]({"project_id": pid})
    assert len(result["results"]) == 1
    assert result["results"][0]["spectral_class"] is not None


def test_preprocessing_undo_redo_via_rpc(tmp_path):
    pid = M["spectrometry.project.create"]({"name": "P1"})["project"]["id"]
    _write_ascii(tmp_path, "S-1.csv", 2202.0, 0.2)
    M["spectrometry.import.native_spectra"]({"project_id": pid, "paths": [str(tmp_path)], "recursive": False})

    overlay = M["spectrometry.preprocessing.apply_operation"]({
        "project_id": pid, "op_type": "normalize", "params": {"method": "minmax"}, "scope": {"all": True},
    })
    assert len(overlay["ops"]) == 1

    undone = M["spectrometry.preprocessing.undo_operation"]({"project_id": pid})
    assert len(undone["ops"]) == 0
