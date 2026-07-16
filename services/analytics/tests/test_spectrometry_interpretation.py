import pytest

from analysis.spectrometry import interpretation as interp
from analysis.spectrometry import rules
from analysis.spectrometry import storage as s


@pytest.fixture(autouse=True)
def isolated_projects_dir(tmp_path, monkeypatch):
    projects_dir = tmp_path / "spectral_projects"
    monkeypatch.setattr(s, "PROJECTS_DIR", projects_dir)
    yield projects_dir


def test_evaluate_rule_match_all_true():
    rule = {
        "id": "r1", "mineral": "Muscovite", "match_all": True,
        "conditions": [
            {"feature_preset": "AlOH_2200", "param": "center", "op": "between", "value": [2195, 2210]},
            {"feature_preset": "AlOH_2200", "param": "depth", "op": "gt", "value": 0.05},
        ],
    }
    features = {"AlOH_2200": {"center": 2202.0, "depth": 0.15}}
    assert rules.evaluate_rule(rule, features) is True


def test_evaluate_rule_match_all_false_one_condition_fails():
    rule = {
        "id": "r1", "mineral": "Muscovite", "match_all": True,
        "conditions": [
            {"feature_preset": "AlOH_2200", "param": "center", "op": "between", "value": [2195, 2210]},
            {"feature_preset": "AlOH_2200", "param": "depth", "op": "gt", "value": 0.9},  # fails
        ],
    }
    features = {"AlOH_2200": {"center": 2202.0, "depth": 0.15}}
    assert rules.evaluate_rule(rule, features) is False


def test_evaluate_rule_match_any():
    rule = {
        "id": "r1", "mineral": "X", "match_all": False,
        "conditions": [
            {"feature_preset": "AlOH_2200", "param": "center", "op": "gt", "value": 9999},  # fails
            {"feature_preset": "AlOH_2200", "param": "depth", "op": "gt", "value": 0.05},   # passes
        ],
    }
    features = {"AlOH_2200": {"center": 2202.0, "depth": 0.15}}
    assert rules.evaluate_rule(rule, features) is True


def test_confirm_never_mutates_row_in_place():
    pid = s.create_project("P")
    iid = interp.create_manual(pid, "S-1", "SPEC-1", primary_mineral="Muscovite", state="interpreted")

    new_id = interp.confirm(pid, iid, "confirmed", edited_by="geo1", reason="visual check")
    assert new_id != iid

    all_rows = s.load_table(pid, "interpretations")
    old_row = all_rows.filter(all_rows["interpretation_id"] == iid).to_dicts()[0]
    new_row = all_rows.filter(all_rows["interpretation_id"] == new_id).to_dicts()[0]

    assert old_row["is_current"] is False
    assert new_row["is_current"] is True
    assert new_row["previous_interpretation_id"] == iid
    assert new_row["state"] == "confirmed"
    assert new_row["created_by"] == "geo1"
    # old row's own fields are untouched (never mutated)
    assert old_row["state"] == "interpreted"


def test_list_current_only_returns_is_current_rows():
    pid = s.create_project("P")
    iid = interp.create_manual(pid, "S-1", primary_mineral="A", state="interpreted")
    interp.confirm(pid, iid, "confirmed")

    current = interp.list_current(pid, "S-1")
    assert current.height == 1
    assert current["state"].to_list() == ["confirmed"]


def test_history_returns_all_rows_including_superseded():
    pid = s.create_project("P")
    iid = interp.create_manual(pid, "S-1", primary_mineral="A", state="interpreted")
    interp.confirm(pid, iid, "confirmed")

    history = interp.get_history(pid, "S-1")
    assert history.height == 2
