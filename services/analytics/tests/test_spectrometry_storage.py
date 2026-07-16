import pytest

from analysis.spectrometry import storage as s


@pytest.fixture(autouse=True)
def isolated_projects_dir(tmp_path, monkeypatch):
    projects_dir = tmp_path / "spectral_projects"
    monkeypatch.setattr(s, "PROJECTS_DIR", projects_dir)
    yield projects_dir


def test_create_project_seeds_empty_tables_and_default_rules():
    pid = s.create_project("Test")
    meta = s.load_project_meta(pid)
    assert meta["name"] == "Test"
    assert meta["sample_count"] == 0

    samples = s.load_table(pid, "samples")
    assert samples.height == 0
    assert "sample_id" in samples.columns

    rules = s.load_rules(pid)["rules"]
    assert len(rules) > 0
    assert rules[0]["id"] == "rule-muscovite-low-al"


def test_append_rows_persists_and_accumulates():
    pid = s.create_project("Test")
    s.append_rows(pid, "samples", [{"sample_id": "S-1"}])
    s.append_rows(pid, "samples", [{"sample_id": "S-2"}])
    df = s.load_table(pid, "samples")
    assert sorted(df["sample_id"].to_list()) == ["S-1", "S-2"]


def test_refresh_project_counts():
    pid = s.create_project("Test")
    s.append_rows(pid, "samples", [{"sample_id": "S-1"}])
    s.append_rows(pid, "spectra", [{"spectrum_id": "SPEC-1", "sample_id": "S-1", "wavelength": [1.0], "reflectance_raw": [0.1]}])
    s.refresh_project_counts(pid)
    meta = s.load_project_meta(pid)
    assert meta["sample_count"] == 1
    assert meta["spectra_count"] == 1


def test_list_projects_and_delete():
    pid1 = s.create_project("P1")
    pid2 = s.create_project("P2")
    ids = {p["id"] for p in s.list_projects()}
    assert {pid1, pid2}.issubset(ids)

    assert s.delete_project(pid1) is True
    assert s.delete_project(pid1) is False
    remaining_ids = {p["id"] for p in s.list_projects()}
    assert pid1 not in remaining_ids
    assert pid2 in remaining_ids


def test_validate_project_id_rejects_path_traversal():
    with pytest.raises(ValueError):
        s.validate_project_id("../../etc")


def test_id_generators_are_unique_and_prefixed():
    ids = {s.new_spectrum_id() for _ in range(20)}
    assert len(ids) == 20
    assert all(i.startswith("SPEC-") for i in ids)
    assert s.new_feature_id().startswith("FEAT-")
    assert s.new_index_id().startswith("IDX-")
    assert s.new_interpretation_id().startswith("INTERP-")
    assert s.new_reference_id().startswith("REF-")
