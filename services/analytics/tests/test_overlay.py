import polars as pl
import pytest

from analysis.analytics.descriptive import run_descriptive
from analysis.data import overlay, storage


@pytest.fixture(autouse=True)
def isolated_datasets_dir(tmp_path, monkeypatch):
    datasets_dir = tmp_path / "datasets"
    monkeypatch.setattr(storage, "DATASETS_DIR", datasets_dir)
    monkeypatch.setattr(overlay, "DATASETS_DIR", datasets_dir)
    yield datasets_dir


def _make_dataset() -> str:
    df = pl.DataFrame({
        "Cu_ppm": [10.0, 20.0, 30.0],
        "Au_ppm": [1.0, 2.0, 3.0],
    })
    return storage.save_dataset(df, name="test", meta_extra={
        "column_roles": {"Cu_ppm": "assay_element", "Au_ppm": "assay_element"},
    })


def test_get_effective_dataframe_with_no_ops_matches_raw():
    ds_id = _make_dataset()
    eff, hidden = overlay.get_effective_dataframe(ds_id)
    assert eff.columns == ["Cu_ppm", "Au_ppm"]
    assert hidden == set()


def test_original_parquet_is_never_mutated():
    ds_id = _make_dataset()
    original_bytes = (overlay.DATASETS_DIR / f"{ds_id}.parquet").read_bytes()

    overlay.append_op(ds_id, "rename_column", {"column": "Cu_ppm", "new_name": "Cu"})
    overlay.append_op(ds_id, "add_calculated_column", {"name": "ratio", "formula": "Cu / Au_ppm"})
    overlay.append_op(ds_id, "hide_column", {"column": "Au_ppm"})

    assert (overlay.DATASETS_DIR / f"{ds_id}.parquet").read_bytes() == original_bytes


def test_rename_hide_calculated_column_roundtrip():
    ds_id = _make_dataset()
    overlay.append_op(ds_id, "rename_column", {"column": "Cu_ppm", "new_name": "Cu"})
    overlay.append_op(ds_id, "add_calculated_column", {"name": "ratio", "formula": "Cu / Au_ppm"})
    overlay.append_op(ds_id, "hide_column", {"column": "Au_ppm"})

    eff, hidden = overlay.get_effective_dataframe(ds_id)
    assert set(eff.columns) == {"Cu", "Au_ppm", "ratio"}
    assert hidden == {"Au_ppm"}
    assert eff["ratio"].to_list() == [10.0, 10.0, 10.0]


def test_undo_reverts_last_op_and_redo_reapplies_it():
    ds_id = _make_dataset()
    overlay.append_op(ds_id, "rename_column", {"column": "Cu_ppm", "new_name": "Cu"})
    overlay.append_op(ds_id, "hide_column", {"column": "Au_ppm"})

    overlay.undo(ds_id)
    eff, hidden = overlay.get_effective_dataframe(ds_id)
    assert hidden == set()
    assert "Cu" in eff.columns

    overlay.redo(ds_id)
    eff, hidden = overlay.get_effective_dataframe(ds_id)
    assert hidden == {"Au_ppm"}


def test_new_op_after_undo_clears_redo_stack():
    ds_id = _make_dataset()
    overlay.append_op(ds_id, "rename_column", {"column": "Cu_ppm", "new_name": "Cu"})
    overlay.undo(ds_id)
    overlay.append_op(ds_id, "hide_column", {"column": "Au_ppm"})

    state = overlay.load_overlay(ds_id)
    assert state["redo_stack"] == []


def test_history_is_append_only():
    ds_id = _make_dataset()
    overlay.append_op(ds_id, "rename_column", {"column": "Cu_ppm", "new_name": "Cu"})
    overlay.undo(ds_id)
    overlay.redo(ds_id)

    history = overlay.load_overlay(ds_id)["history"]
    actions = [h["action"] for h in history]
    assert actions == ["applied", "undone", "redone"]


def test_invalid_operation_is_not_persisted():
    ds_id = _make_dataset()
    with pytest.raises(ValueError):
        overlay.append_op(ds_id, "rename_column", {"column": "does_not_exist", "new_name": "x"})

    state = overlay.load_overlay(ds_id)
    assert state["ops"] == []


def test_undo_with_no_ops_raises():
    ds_id = _make_dataset()
    with pytest.raises(ValueError):
        overlay.undo(ds_id)


def test_renamed_column_visible_to_analytics_descriptive():
    """Regression: _rpc_analytics_descriptive/_rpc_analytics_pca were rewired
    to read via overlay.get_effective_dataframe() so renamed/calculated
    columns are visible to analysis — not just the raw Parquet."""
    ds_id = _make_dataset()
    overlay.append_op(ds_id, "rename_column", {"column": "Cu_ppm", "new_name": "Cu"})
    overlay.append_op(ds_id, "add_calculated_column", {"name": "ratio", "formula": "Cu / Au_ppm"})

    eff, _hidden = overlay.get_effective_dataframe(ds_id)
    result = run_descriptive(eff, ["Cu", "ratio"])
    variables = [s.variable for s in result.stats]
    assert "Cu" in variables
    assert "ratio" in variables
