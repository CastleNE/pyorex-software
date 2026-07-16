"""
CRM (Certified Reference Material) library persistence — single JSON file,
same DATA_DIR convention as storage.py. Not yet per-tenant (no multi-tenancy
exists in the app today) — the top-level "crms" key (not a bare array) keeps
the shape forward-compatible with an eventual sibling "tenant_id" key.
"""
from __future__ import annotations

import json
from dataclasses import asdict, dataclass, field
from datetime import datetime, timezone

from analysis.data.storage import DATA_DIR

CRM_LIBRARY_PATH = DATA_DIR / "crm_library.json"


@dataclass
class CRMDefinition:
    name: str
    certified_values: dict[str, float] = field(default_factory=dict)
    uncertainty: dict[str, float] = field(default_factory=dict)
    updated_at: str = ""


def _load_raw() -> dict:
    if not CRM_LIBRARY_PATH.exists():
        return {"version": 1, "crms": {}}
    try:
        return json.loads(CRM_LIBRARY_PATH.read_text(encoding="utf-8"))
    except (json.JSONDecodeError, OSError):
        return {"version": 1, "crms": {}}


def _save_raw(data: dict) -> None:
    CRM_LIBRARY_PATH.parent.mkdir(parents=True, exist_ok=True)
    CRM_LIBRARY_PATH.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")


def list_crms() -> list[CRMDefinition]:
    raw = _load_raw()
    return [CRMDefinition(**entry) for entry in raw.get("crms", {}).values()]


def upsert_crm(
    name: str, certified_values: dict[str, float], uncertainty: dict[str, float] | None = None
) -> CRMDefinition:
    raw = _load_raw()
    definition = CRMDefinition(
        name=name,
        certified_values=certified_values,
        uncertainty=uncertainty or {},
        updated_at=datetime.now(timezone.utc).isoformat(),
    )
    raw.setdefault("crms", {})[name] = asdict(definition)
    _save_raw(raw)
    return definition


def get_crm_values_map() -> dict[str, dict[str, float]]:
    """Shape expected by analyze_crm(): {crm_name: certified_values}."""
    return {c.name: c.certified_values for c in list_crms()}
