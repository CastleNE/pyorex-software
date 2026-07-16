import pytest

from analysis.qaqc import crm_library


@pytest.fixture(autouse=True)
def isolated_crm_library(tmp_path, monkeypatch):
    path = tmp_path / "crm_library.json"
    monkeypatch.setattr(crm_library, "CRM_LIBRARY_PATH", path)
    yield path


def test_list_crms_with_no_file_returns_empty_list():
    assert crm_library.list_crms() == []


def test_upsert_creates_file_and_round_trips_without_precision_loss():
    crm_library.upsert_crm("OREAS-262", {"Au": 85.333333, "Cu": 1200.125}, {"Au": 2.1})
    result = crm_library.list_crms()

    assert len(result) == 1
    assert result[0].name == "OREAS-262"
    assert result[0].certified_values == {"Au": 85.333333, "Cu": 1200.125}
    assert result[0].uncertainty == {"Au": 2.1}


def test_upsert_same_name_overwrites_not_duplicates():
    crm_library.upsert_crm("OREAS-262", {"Au": 85.0})
    first = crm_library.list_crms()[0].updated_at

    crm_library.upsert_crm("OREAS-262", {"Au": 90.0})
    result = crm_library.list_crms()

    assert len(result) == 1
    assert result[0].certified_values == {"Au": 90.0}


def test_get_crm_values_map_shape():
    crm_library.upsert_crm("OREAS-262", {"Au": 85.0})
    crm_library.upsert_crm("OREAS-263", {"Au": 50.0})

    values_map = crm_library.get_crm_values_map()
    assert values_map == {"OREAS-262": {"Au": 85.0}, "OREAS-263": {"Au": 50.0}}
