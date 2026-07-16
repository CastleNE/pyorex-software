"""
Mineral interpretation — manual / rule-based / library-match, all converging
on the SAME append-only commit path so edits never silently overwrite a prior
result (spec §19). 3-state model: suggested -> interpreted -> confirmed
(the richer 6-state review lifecycle from the spec is a documented follow-up,
not built this pass).
"""
from __future__ import annotations

from datetime import datetime, timezone

import polars as pl

from analysis.spectrometry.storage import append_rows, load_table, new_interpretation_id, save_table

VALID_STATES = {"suggested", "interpreted", "confirmed"}
VALID_METHODS = {"manual", "rule_based", "library_match"}


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def create_manual(
    project_id: str,
    sample_id: str,
    spectrum_id: str | None = None,
    primary_mineral: str | None = None,
    secondary_mineral: str | None = None,
    mineral_group: str | None = None,
    assemblage_name: str | None = None,
    confidence: float | None = None,
    comment: str | None = None,
    created_by: str = "user",
    state: str = "interpreted",
) -> str:
    if state not in VALID_STATES:
        raise ValueError(f"Invalid state: {state}")
    interpretation_id = new_interpretation_id()
    row = {
        "interpretation_id": interpretation_id, "sample_id": sample_id, "spectrum_id": spectrum_id,
        "primary_mineral": primary_mineral, "secondary_mineral": secondary_mineral,
        "mineral_group": mineral_group, "assemblage_name": assemblage_name, "confidence": confidence,
        "method": "manual", "rule_id": None, "library_match_score": None, "library_reference_id": None,
        "compared_region": None, "state": state, "comment": comment, "created_by": created_by,
        "created_at": _now(), "previous_interpretation_id": None, "is_current": True,
    }
    append_rows(project_id, "interpretations", [row])
    return interpretation_id


def create_from_rule_match(project_id: str, sample_id: str, spectrum_id: str, rule: dict, created_by: str = "system") -> str:
    interpretation_id = new_interpretation_id()
    row = {
        "interpretation_id": interpretation_id, "sample_id": sample_id, "spectrum_id": spectrum_id,
        "primary_mineral": rule["mineral"], "secondary_mineral": None, "mineral_group": rule.get("mineral_group"),
        "assemblage_name": None, "confidence": None,
        "method": "rule_based", "rule_id": rule["id"], "library_match_score": None, "library_reference_id": None,
        "compared_region": None, "state": "suggested", "comment": None, "created_by": created_by,
        "created_at": _now(), "previous_interpretation_id": None, "is_current": True,
    }
    append_rows(project_id, "interpretations", [row])
    return interpretation_id


def create_from_library_match(
    project_id: str, sample_id: str, spectrum_id: str, match, region: tuple[float, float], created_by: str = "system"
) -> str:
    interpretation_id = new_interpretation_id()
    row = {
        "interpretation_id": interpretation_id, "sample_id": sample_id, "spectrum_id": spectrum_id,
        "primary_mineral": match.mineral_label or match.name, "secondary_mineral": None, "mineral_group": None,
        "assemblage_name": None, "confidence": match.match_score,
        "method": "library_match", "rule_id": None, "library_match_score": match.match_score,
        "library_reference_id": match.reference_id, "compared_region": f"{region[0]}-{region[1]}",
        "state": "suggested", "comment": None, "created_by": created_by,
        "created_at": _now(), "previous_interpretation_id": None, "is_current": True,
    }
    append_rows(project_id, "interpretations", [row])
    return interpretation_id


def confirm(
    project_id: str,
    interpretation_id: str,
    new_state: str,
    field_overrides: dict | None = None,
    edited_by: str = "user",
    reason: str | None = None,
) -> str:
    """Never mutates a row in place: flips the old row's is_current=False and
    creates a NEW row carrying previous_interpretation_id — the audit trail
    spec §19 requires (automatic result, edited result, who, when, why)."""
    if new_state not in VALID_STATES:
        raise ValueError(f"Invalid state: {new_state}")

    interpretations = load_table(project_id, "interpretations")
    match = interpretations.filter(pl.col("interpretation_id") == interpretation_id)
    if match.height == 0:
        raise ValueError(f"Interpretation not found: {interpretation_id}")
    old = match.to_dicts()[0]

    new_id = new_interpretation_id()
    new_row = dict(old)
    new_row.update(field_overrides or {})
    new_row["interpretation_id"] = new_id
    new_row["state"] = new_state
    new_row["previous_interpretation_id"] = interpretation_id
    new_row["created_by"] = edited_by
    new_row["created_at"] = _now()
    new_row["is_current"] = True
    if reason:
        new_row["comment"] = reason

    updated = interpretations.with_columns(
        pl.when(pl.col("interpretation_id") == interpretation_id)
        .then(pl.lit(False))
        .otherwise(pl.col("is_current"))
        .alias("is_current")
    )
    save_table(project_id, "interpretations", updated)
    append_rows(project_id, "interpretations", [new_row])
    return new_id


def list_current(project_id: str, sample_id: str | None = None) -> pl.DataFrame:
    df = load_table(project_id, "interpretations").filter(pl.col("is_current") == True)  # noqa: E712
    if sample_id:
        df = df.filter(pl.col("sample_id") == sample_id)
    return df


def get_history(project_id: str, sample_id: str) -> pl.DataFrame:
    df = load_table(project_id, "interpretations").filter(pl.col("sample_id") == sample_id)
    return df.sort("created_at")
