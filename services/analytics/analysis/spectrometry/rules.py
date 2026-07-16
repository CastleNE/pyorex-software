"""
Rule-based mineral interpretation — a rule is a configurable table of
feature-position conditions (spec: interpretation rules must be configurable,
not rigid), evaluated against already-extracted features.parquet rows.
"""
from __future__ import annotations

import polars as pl

from analysis.spectrometry.storage import load_rules, load_table, save_rules

_OPS = {"eq", "neq", "gt", "gte", "lt", "lte", "between"}


def _check_condition(cond: dict, features_for_spectrum: dict[str, dict]) -> bool:
    preset = cond["feature_preset"]
    param = cond["param"]
    op = cond["op"]
    value = cond["value"]
    if op not in _OPS:
        raise ValueError(f"Unknown rule operator: {op}")

    feat = features_for_spectrum.get(preset)
    if feat is None or feat.get(param) is None:
        return False
    actual = feat[param]

    if op == "between":
        lo, hi = value
        return lo <= actual <= hi
    if op == "eq":
        return actual == value
    if op == "neq":
        return actual != value
    if op == "gt":
        return actual > value
    if op == "gte":
        return actual >= value
    if op == "lt":
        return actual < value
    if op == "lte":
        return actual <= value
    return False


def evaluate_rule(rule: dict, features_for_spectrum: dict[str, dict]) -> bool:
    conditions = rule.get("conditions", [])
    if not conditions:
        return False
    results = [_check_condition(c, features_for_spectrum) for c in conditions]
    return all(results) if rule.get("match_all", True) else any(results)


def _features_by_preset(project_id: str, spectrum_id: str) -> dict[str, dict]:
    features = load_table(project_id, "features")
    rows = features.filter(pl.col("spectrum_id") == spectrum_id).to_dicts()
    return {row["preset_name"]: row for row in rows}


def apply_rules(project_id: str, spectrum_id: str) -> list[dict]:
    """Returns the list of rule dicts that matched this spectrum's extracted features."""
    rules = load_rules(project_id).get("rules", [])
    features_for_spectrum = _features_by_preset(project_id, spectrum_id)
    return [r for r in rules if evaluate_rule(r, features_for_spectrum)]


def list_rules(project_id: str) -> list[dict]:
    return load_rules(project_id).get("rules", [])


def upsert_rule(project_id: str, rule: dict) -> dict:
    data = load_rules(project_id)
    rules = data.get("rules", [])
    idx = next((i for i, r in enumerate(rules) if r["id"] == rule["id"]), None)
    if idx is not None:
        rules[idx] = rule
    else:
        rules.append(rule)
    data["rules"] = rules
    save_rules(project_id, data)
    return rule
