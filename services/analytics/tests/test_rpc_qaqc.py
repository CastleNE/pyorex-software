import polars as pl
import pytest

from analysis.data import overlay, storage
from analysis.qaqc import crm_library
from app.routers.rpc import _rpc_qaqc_calculate, _rpc_qaqc_control_chart


@pytest.fixture(autouse=True)
def isolated_env(tmp_path, monkeypatch):
    datasets_dir = tmp_path / "datasets"
    monkeypatch.setattr(storage, "DATASETS_DIR", datasets_dir)
    monkeypatch.setattr(overlay, "DATASETS_DIR", datasets_dir)
    monkeypatch.setattr(crm_library, "CRM_LIBRARY_PATH", tmp_path / "crm_library.json")
    yield


def _dataset_without_sample_type() -> str:
    df = pl.DataFrame({"Au": [10.0, 20.0]})
    return storage.save_dataset(df, name="no-qaqc", meta_extra={})


def _dataset_with_sample_type() -> str:
    df = pl.DataFrame({
        "Au": [10.0, 20.0, 0.1, 10.5, 84.0],
        "__sample_type__": ["S", "S", "FB", "FD", "CRM"],
    })
    return storage.save_dataset(df, name="with-qaqc", meta_extra={})


def test_qaqc_calculate_unavailable_without_sample_type_column():
    ds_id = _dataset_without_sample_type()
    result = _rpc_qaqc_calculate({"dataset_id": ds_id, "variables": ["Au"]})
    assert result["available"] is False
    assert "reason" in result


def test_qaqc_calculate_available_with_sample_type_column():
    ds_id = _dataset_with_sample_type()
    crm_library.upsert_crm("OREAS-262", {"Au": 100.0})
    result = _rpc_qaqc_calculate({"dataset_id": ds_id, "variables": ["Au"]})
    assert result["available"] is True
    assert result["summary"]["n_samples_by_type"]["S"] == 2


def test_qaqc_control_chart_unavailable_with_fewer_than_two_points():
    ds_id = _dataset_with_sample_type()
    crm_library.upsert_crm("OREAS-262", {"Au": 100.0})
    result = _rpc_qaqc_control_chart({
        "dataset_id": ds_id, "crm_name": "OREAS-262", "variable": "Au"
    })
    assert result["available"] is False
    assert result["n_points"] == 1


def test_qaqc_control_chart_raises_without_sample_type_column():
    ds_id = _dataset_without_sample_type()
    with pytest.raises(ValueError):
        _rpc_qaqc_control_chart({"dataset_id": ds_id, "crm_name": "OREAS-262", "variable": "Au"})


def test_crm_library_upsert_then_list_round_trip():
    from app.routers.rpc import METHOD_REGISTRY

    upsert = METHOD_REGISTRY["qaqc.crm_library.upsert"]
    listing = METHOD_REGISTRY["qaqc.crm_library.list"]

    upsert({"name": "OREAS-262", "certified_values": {"Au": 85.0}})
    result = listing({})
    assert len(result["crms"]) == 1
    assert result["crms"][0]["name"] == "OREAS-262"
