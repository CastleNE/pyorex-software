"""
Spectral project storage: samples/spectra/features/indices/interpretations/
reference_spectra as per-project Parquet files + JSON metadata, mirroring
analysis/data/storage.py's DATA_DIR convention but scoped per PROJECT (a
spectral project is a relational unit — Samples/Spectra/Features/
Interpretations must load/save together — unlike a single tabular dataset).
"""
from __future__ import annotations

import json
import re
import uuid
from datetime import datetime, timezone
from pathlib import Path

import polars as pl

from analysis.data.storage import DATA_DIR

PROJECTS_DIR = DATA_DIR / "spectral_projects"

_PROJECT_ID_RE = re.compile(r"^[a-zA-Z0-9\-_]{1,64}$")


def validate_project_id(project_id: str) -> str:
    if not _PROJECT_ID_RE.match(project_id):
        raise ValueError(f"Invalid project_id: {project_id!r}")
    resolved = (PROJECTS_DIR / project_id).resolve()
    if not str(resolved).startswith(str(PROJECTS_DIR.resolve())):
        raise ValueError("Path traversal attempt blocked")
    return project_id


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _project_dir(project_id: str) -> Path:
    validate_project_id(project_id)
    return PROJECTS_DIR / project_id


def _ensure_dirs() -> None:
    PROJECTS_DIR.mkdir(parents=True, exist_ok=True)


# ── Table schemas (Polars dtypes) ────────────────────────────────────────────

SAMPLES_SCHEMA = {
    "sample_id": pl.Utf8, "drillhole_id": pl.Utf8, "from_m": pl.Float64, "to_m": pl.Float64,
    "easting": pl.Float64, "northing": pl.Float64, "elevation": pl.Float64,
    "longitude": pl.Float64, "latitude": pl.Float64,
    "project": pl.Utf8, "prospect": pl.Utf8, "lithology": pl.Utf8, "alteration": pl.Utf8,
    "domain": pl.Utf8, "observations": pl.Utf8,
}

SPECTRA_SCHEMA = {
    "spectrum_id": pl.Utf8, "sample_id": pl.Utf8, "instrument": pl.Utf8, "format": pl.Utf8,
    "original_path": pl.Utf8, "original_filename": pl.Utf8, "acquisition_date": pl.Utf8,
    "wavelength": pl.List(pl.Float64), "reflectance_raw": pl.List(pl.Float64),
    "band_count": pl.Int64, "wavelength_min": pl.Float64, "wavelength_max": pl.Float64,
    "import_warnings": pl.List(pl.Utf8),
    "quality_status": pl.Utf8, "quality_score": pl.Float64, "quality_reviewed": pl.Boolean,
    "imported_at": pl.Utf8,
}

FEATURES_SCHEMA = {
    "feature_id": pl.Utf8, "spectrum_id": pl.Utf8, "sample_id": pl.Utf8, "preset_name": pl.Utf8,
    "center": pl.Float64, "depth": pl.Float64, "width_fwhm": pl.Float64, "area": pl.Float64,
    "asymmetry": pl.Float64, "method": pl.Utf8, "window_min": pl.Float64, "window_max": pl.Float64,
    "continuum_method": pl.Utf8, "quality_indicator": pl.Utf8, "calc_date": pl.Utf8,
}

INDICES_SCHEMA = {
    "index_id": pl.Utf8, "spectrum_id": pl.Utf8, "sample_id": pl.Utf8, "index_name": pl.Utf8,
    "formula": pl.Utf8, "bands_used": pl.Utf8, "result": pl.Float64, "unit": pl.Utf8,
    "reference": pl.Utf8, "quality_indicator": pl.Utf8, "calc_date": pl.Utf8,
}

INTERPRETATIONS_SCHEMA = {
    "interpretation_id": pl.Utf8, "sample_id": pl.Utf8, "spectrum_id": pl.Utf8,
    "primary_mineral": pl.Utf8, "secondary_mineral": pl.Utf8, "mineral_group": pl.Utf8,
    "assemblage_name": pl.Utf8, "confidence": pl.Float64,
    "method": pl.Utf8,  # manual | rule_based | library_match
    "rule_id": pl.Utf8, "library_match_score": pl.Float64, "library_reference_id": pl.Utf8,
    "compared_region": pl.Utf8,
    "state": pl.Utf8,  # suggested | interpreted | confirmed
    "comment": pl.Utf8, "created_by": pl.Utf8, "created_at": pl.Utf8,
    "previous_interpretation_id": pl.Utf8, "is_current": pl.Boolean,
}

REFERENCE_SPECTRA_SCHEMA = {
    "reference_id": pl.Utf8, "name": pl.Utf8, "mineral_label": pl.Utf8,
    "wavelength": pl.List(pl.Float64), "reflectance": pl.List(pl.Float64),
    "source": pl.Utf8, "added_at": pl.Utf8,
}

_TABLES = {
    "samples": SAMPLES_SCHEMA,
    "spectra": SPECTRA_SCHEMA,
    "features": FEATURES_SCHEMA,
    "indices": INDICES_SCHEMA,
    "interpretations": INTERPRETATIONS_SCHEMA,
    "reference_spectra": REFERENCE_SPECTRA_SCHEMA,
}


def _empty_df(schema: dict) -> pl.DataFrame:
    return pl.DataFrame(schema={k: v for k, v in schema.items()})


def _table_path(project_id: str, name: str) -> Path:
    return _project_dir(project_id) / f"{name}.parquet"


def load_table(project_id: str, name: str) -> pl.DataFrame:
    if name not in _TABLES:
        raise ValueError(f"Unknown spectral table: {name}")
    path = _table_path(project_id, name)
    if not path.exists():
        return _empty_df(_TABLES[name])
    return pl.read_parquet(path)


def save_table(project_id: str, name: str, df: pl.DataFrame) -> None:
    if name not in _TABLES:
        raise ValueError(f"Unknown spectral table: {name}")
    _project_dir(project_id).mkdir(parents=True, exist_ok=True)
    df.write_parquet(_table_path(project_id, name))


def append_rows(project_id: str, name: str, rows: list[dict]) -> pl.DataFrame:
    """Append rows (list of dicts matching the table's schema) and persist. Returns the full table."""
    if not rows:
        return load_table(project_id, name)
    existing = load_table(project_id, name)
    schema = _TABLES[name]
    new_df = pl.DataFrame(rows, schema={k: schema[k] for k in rows[0].keys()})
    combined = pl.concat([existing, new_df], how="diagonal_relaxed")
    save_table(project_id, name, combined)
    return combined


# ── Project lifecycle ────────────────────────────────────────────────────────

def create_project(name: str, workflow_type: str = "native") -> str:
    _ensure_dirs()
    project_id = str(uuid.uuid4())
    project_dir = _project_dir(project_id)
    project_dir.mkdir(parents=True, exist_ok=True)

    for table_name, schema in _TABLES.items():
        save_table(project_id, table_name, _empty_df(schema))

    meta = {
        "id": project_id,
        "name": name,
        "workflow_type": workflow_type,
        "created_at": _now(),
        "sample_count": 0,
        "spectra_count": 0,
        "instrument_summary": {},
        "custom_feature_presets": {},
        "custom_index_presets": {},
        "pipeline_presets": {},
    }
    save_project_meta(project_id, meta)

    from analysis.spectrometry.rule_presets import DEFAULT_RULES
    save_rules(project_id, {"rules": DEFAULT_RULES})

    save_overlay_raw(project_id, {"project_id": project_id, "ops": [], "redo_stack": [], "history": []})
    return project_id


def load_project_meta(project_id: str) -> dict:
    path = _project_dir(project_id) / "project.meta.json"
    if not path.exists():
        raise FileNotFoundError(f"Spectral project not found: {project_id}")
    return json.loads(path.read_text(encoding="utf-8"))


def save_project_meta(project_id: str, meta: dict) -> None:
    path = _project_dir(project_id) / "project.meta.json"
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(meta, ensure_ascii=False, indent=2), encoding="utf-8")


def refresh_project_counts(project_id: str) -> None:
    meta = load_project_meta(project_id)
    meta["sample_count"] = load_table(project_id, "samples").height
    meta["spectra_count"] = load_table(project_id, "spectra").height
    save_project_meta(project_id, meta)


def list_projects() -> list[dict]:
    _ensure_dirs()
    result = []
    for meta_path in sorted(PROJECTS_DIR.glob("*/project.meta.json")):
        try:
            result.append(json.loads(meta_path.read_text(encoding="utf-8")))
        except Exception:
            pass
    return result


def delete_project(project_id: str) -> bool:
    project_dir = _project_dir(project_id)
    if not project_dir.exists():
        return False
    import shutil
    shutil.rmtree(project_dir)
    return True


# ── Rules (per-project JSON) ─────────────────────────────────────────────────

def load_rules(project_id: str) -> dict:
    path = _project_dir(project_id) / "rules.json"
    if not path.exists():
        return {"rules": []}
    return json.loads(path.read_text(encoding="utf-8"))


def save_rules(project_id: str, rules: dict) -> None:
    path = _project_dir(project_id) / "rules.json"
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(rules, ensure_ascii=False, indent=2), encoding="utf-8")


# ── Preprocessing overlay raw JSON I/O (logic lives in preprocessing_overlay.py) ──

def load_overlay_raw(project_id: str) -> dict:
    path = _project_dir(project_id) / "spectral_ops.json"
    if not path.exists():
        return {"project_id": project_id, "ops": [], "redo_stack": [], "history": []}
    return json.loads(path.read_text(encoding="utf-8"))


def save_overlay_raw(project_id: str, overlay: dict) -> None:
    path = _project_dir(project_id) / "spectral_ops.json"
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(overlay, ensure_ascii=False, indent=2), encoding="utf-8")


# ── ID generation ─────────────────────────────────────────────────────────────

def new_spectrum_id() -> str:
    return f"SPEC-{uuid.uuid4().hex[:12]}"


def new_feature_id() -> str:
    return f"FEAT-{uuid.uuid4().hex[:12]}"


def new_index_id() -> str:
    return f"IDX-{uuid.uuid4().hex[:12]}"


def new_interpretation_id() -> str:
    return f"INTERP-{uuid.uuid4().hex[:12]}"


def new_reference_id() -> str:
    return f"REF-{uuid.uuid4().hex[:12]}"
