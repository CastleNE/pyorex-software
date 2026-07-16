"""
JSON-RPC handlers for the Spectrometry module — `spectrometry.*` methods,
merged into rpc.py's METHOD_REGISTRY. Kept in its own file (not crammed into
rpc.py directly) purely for file-size manageability; same dispatch
conventions apply (plain functions taking a dict, soft-failures returned as
`{"available": false, "reason": ...}` dicts rather than raised exceptions —
see qaqc.calculate's precedent).
"""
from __future__ import annotations

import json
from dataclasses import asdict
from pathlib import Path
from typing import Any

import numpy as np
import polars as pl

from analysis.data.storage import DATA_DIR, save_dataset
from analysis.spectrometry import (
    interpretation as interp_mod,
    library_match as lib_match_mod,
    mineral_population,
    preprocessing_overlay as ov,
    quality as quality_mod,
    rules as rules_mod,
    storage as sp_storage,
)
from analysis.spectrometry.feature_presets import FEATURE_PRESETS, resolve_preset
from analysis.spectrometry.features import extract_feature
from analysis.spectrometry.index_presets import INDEX_PRESETS, resolve_index_preset
from analysis.spectrometry.readers.dispatch import read_any
from analysis.spectrometry.readers.common import ReadError
from analysis.spectrometry.readers.folder_scanner import scan_paths
from analysis.spectrometry.spectral_formula import evaluate_spectral_formula
from analysis.data.formula import FormulaError

MAPPING_PRESETS_PATH = DATA_DIR / "spectrometry_mapping_presets.json"


# ── Project ───────────────────────────────────────────────────────────────────

def _rpc_project_create(params: dict) -> dict:
    project_id = sp_storage.create_project(params["name"], params.get("workflow_type", "native"))
    return {"project": sp_storage.load_project_meta(project_id)}


def _rpc_project_list(_params: dict) -> dict:
    return {"projects": sp_storage.list_projects()}


def _rpc_project_get(params: dict) -> dict:
    return {"project": sp_storage.load_project_meta(params["project_id"])}


def _rpc_project_delete(params: dict) -> dict:
    return {"deleted": sp_storage.delete_project(params["project_id"])}


# ── Import: native spectra ───────────────────────────────────────────────────

def _rpc_import_preview_file(params: dict) -> dict:
    try:
        spectrum = read_any(params["file_path"])
    except ReadError as exc:
        return {"available": False, "reason": str(exc)}
    return {"available": True, "spectrum": asdict(spectrum)}


def _sample_id_from_filename(filename: str) -> str:
    return Path(filename).stem


def _rpc_import_native_spectra(params: dict) -> dict:
    project_id = params["project_id"]
    result = scan_paths(params["paths"], recursive=params.get("recursive", True))

    imported = []
    new_sample_ids: set[str] = set()
    spectra_rows = []
    for spectrum in result.spectra:
        sample_id = params.get("sample_id_map", {}).get(spectrum.filename) or _sample_id_from_filename(spectrum.filename)
        spectrum_id = sp_storage.new_spectrum_id()
        spectra_rows.append({
            "spectrum_id": spectrum_id, "sample_id": sample_id, "instrument": spectrum.instrument,
            "format": spectrum.format, "original_path": spectrum.original_path, "original_filename": spectrum.filename,
            "acquisition_date": spectrum.acquisition_date, "wavelength": spectrum.wavelength,
            "reflectance_raw": spectrum.reflectance, "band_count": len(spectrum.wavelength),
            "wavelength_min": min(spectrum.wavelength) if spectrum.wavelength else None,
            "wavelength_max": max(spectrum.wavelength) if spectrum.wavelength else None,
            "import_warnings": spectrum.warnings, "quality_status": "NotReviewed", "quality_score": None,
            "quality_reviewed": False, "imported_at": _iso_now(),
        })
        imported.append({"filename": spectrum.filename, "spectrum_id": spectrum_id, "sample_id": sample_id, "warnings": spectrum.warnings})
        new_sample_ids.add(sample_id)

    if spectra_rows:
        sp_storage.append_rows(project_id, "spectra", spectra_rows)

    existing_samples = set(sp_storage.load_table(project_id, "samples")["sample_id"].to_list())
    missing_samples = [{"sample_id": sid} for sid in new_sample_ids if sid not in existing_samples]
    if missing_samples:
        sp_storage.append_rows(project_id, "samples", missing_samples)

    sp_storage.refresh_project_counts(project_id)

    return {
        "imported": imported,
        "failures": [{"path": f.path, "reason": f.reason} for f in result.failures],
        "n_imported": len(imported), "n_failed": len(result.failures),
    }


def _iso_now() -> str:
    from datetime import datetime, timezone
    return datetime.now(timezone.utc).isoformat()


# ── Import: processed results table ──────────────────────────────────────────

def _read_table_any(file_path: str) -> pl.DataFrame:
    ext = Path(file_path).suffix.lower()
    if ext in (".xlsx", ".xls"):
        return pl.read_excel(file_path)
    return pl.read_csv(file_path, infer_schema_length=1000, try_parse_dates=False)


def _rpc_import_processed_table_preview(params: dict) -> dict:
    df = _read_table_any(params["file_path"])
    preview_rows = df.head(20).to_dicts()
    columns = [{"name": c, "sample_values": [str(v) for v in df[c].drop_nulls().head(5).to_list()]} for c in df.columns]
    return {"columns": columns, "preview_rows": preview_rows, "total_rows": df.height}


PROCESSED_FIELD_TO_SAMPLE_COL = {
    "Sample ID": "sample_id", "Drillhole ID": "drillhole_id", "Project": "project", "Prospect": "prospect",
    "Easting": "easting", "Northing": "northing", "Elevation": "elevation", "Longitude": "longitude", "Latitude": "latitude",
    "From": "from_m", "To": "to_m",
}
PROCESSED_FIELD_TO_INTERP_COL = {
    "Primary Mineral": "primary_mineral", "Secondary Mineral": "secondary_mineral",
    "Mineral Group": "mineral_group", "Mineral Assemblage": "assemblage_name",
}
PROCESSED_INDEX_FIELDS = {"Al-OH", "Mg-OH", "Fe-OH", "H2O", "OH"}


def _rpc_import_processed_table(params: dict) -> dict:
    project_id = params["project_id"]
    mapping: dict[str, str] = params["column_mapping"]  # {internal_field: source_column_name}
    df = _read_table_any(params["file_path"])

    sample_rows: list[dict] = []
    interp_rows: list[dict] = []
    index_rows: list[dict] = []

    sample_id_col = mapping.get("Sample ID")
    if not sample_id_col or sample_id_col not in df.columns:
        raise ValueError("Sample ID column mapping is required")

    for row in df.to_dicts():
        sample_id = str(row[sample_id_col])
        sample_row = {"sample_id": sample_id}
        for field, sample_col in PROCESSED_FIELD_TO_SAMPLE_COL.items():
            if field == "Sample ID":
                continue
            src = mapping.get(field)
            if src and src in row and row[src] is not None:
                sample_row[sample_col] = row[src]
        sample_rows.append(sample_row)

        has_interp = any(mapping.get(f) for f in PROCESSED_FIELD_TO_INTERP_COL)
        if has_interp:
            interp_row = {"sample_id": sample_id}
            for field, interp_col in PROCESSED_FIELD_TO_INTERP_COL.items():
                src = mapping.get(field)
                if src and src in row:
                    interp_row[interp_col] = row[src]
            interp_rows.append(interp_row)

        for index_field in PROCESSED_INDEX_FIELDS:
            src = mapping.get(index_field)
            if src and src in row and row[src] is not None:
                try:
                    value = float(row[src])
                except (TypeError, ValueError):
                    continue
                index_rows.append({
                    "index_id": sp_storage.new_index_id(), "spectrum_id": None, "sample_id": sample_id,
                    "index_name": index_field, "formula": None, "bands_used": None, "result": value,
                    "unit": None, "reference": "imported", "quality_indicator": "imported", "calc_date": _iso_now(),
                })

    if sample_rows:
        sp_storage.append_rows(project_id, "samples", sample_rows)
    if interp_rows:
        full_rows = [
            {
                "interpretation_id": sp_storage.new_interpretation_id(), "sample_id": r["sample_id"], "spectrum_id": None,
                "primary_mineral": r.get("primary_mineral"), "secondary_mineral": r.get("secondary_mineral"),
                "mineral_group": r.get("mineral_group"), "assemblage_name": r.get("assemblage_name"), "confidence": None,
                "method": "manual", "rule_id": None, "library_match_score": None, "library_reference_id": None,
                "compared_region": None, "state": "interpreted", "comment": "Imported from processed results table",
                "created_by": "import", "created_at": _iso_now(), "previous_interpretation_id": None, "is_current": True,
            }
            for r in interp_rows
        ]
        sp_storage.append_rows(project_id, "interpretations", full_rows)
    if index_rows:
        sp_storage.append_rows(project_id, "indices", index_rows)

    sp_storage.refresh_project_counts(project_id)
    return {"n_samples": len(sample_rows), "n_interpretations": len(interp_rows), "n_indices": len(index_rows)}


def _load_mapping_presets() -> dict:
    if not MAPPING_PRESETS_PATH.exists():
        return {"presets": {}}
    return json.loads(MAPPING_PRESETS_PATH.read_text(encoding="utf-8"))


def _rpc_mapping_presets_list(_params: dict) -> dict:
    return _load_mapping_presets()


def _rpc_mapping_presets_upsert(params: dict) -> dict:
    data = _load_mapping_presets()
    data.setdefault("presets", {})[params["name"]] = params["mapping"]
    MAPPING_PRESETS_PATH.parent.mkdir(parents=True, exist_ok=True)
    MAPPING_PRESETS_PATH.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")
    return data


# ── Browsing ──────────────────────────────────────────────────────────────────

def _rpc_samples_list(params: dict) -> dict:
    project_id = params["project_id"]
    samples = sp_storage.load_table(project_id, "samples")
    spectra = sp_storage.load_table(project_id, "spectra")
    counts = spectra.group_by("sample_id").agg(pl.len().alias("spectra_count")) if spectra.height else pl.DataFrame(schema={"sample_id": pl.Utf8, "spectra_count": pl.UInt32})
    joined = samples.join(counts, on="sample_id", how="left").with_columns(pl.col("spectra_count").fill_null(0))
    return {"samples": joined.to_dicts(), "total": joined.height}


def _rpc_spectra_get(params: dict) -> dict:
    project_id, spectrum_id = params["project_id"], params["spectrum_id"]
    spectra = sp_storage.load_table(project_id, "spectra")
    row = spectra.filter(pl.col("spectrum_id") == spectrum_id)
    if row.height == 0:
        return {"available": False, "reason": "Spectrum not found"}
    raw = row.to_dicts()[0]

    processed_wl, processed_refl, applied_steps = ov.get_effective_spectrum(project_id, spectrum_id)

    features = sp_storage.load_table(project_id, "features").filter(pl.col("spectrum_id") == spectrum_id)
    interpretations = sp_storage.load_table(project_id, "interpretations").filter(
        (pl.col("spectrum_id") == spectrum_id) & (pl.col("is_current") == True)  # noqa: E712
    )

    return {
        "available": True,
        "spectrum_id": spectrum_id, "sample_id": raw["sample_id"], "instrument": raw["instrument"],
        "format": raw["format"], "original_filename": raw["original_filename"],
        "raw_wavelength": raw["wavelength"], "raw_reflectance": raw["reflectance_raw"],
        "processed_wavelength": processed_wl.tolist(), "processed_reflectance": processed_refl.tolist(),
        "applied_processing_steps": applied_steps,
        "quality_status": raw["quality_status"], "quality_score": raw["quality_score"],
        "import_warnings": raw["import_warnings"],
        "features": features.to_dicts(), "interpretations": interpretations.to_dicts(),
    }


def _rpc_spectra_list_for_sample(params: dict) -> dict:
    spectra = sp_storage.load_table(params["project_id"], "spectra").filter(pl.col("sample_id") == params["sample_id"])
    cols = [c for c in spectra.columns if c not in ("wavelength", "reflectance_raw")]
    return {"spectra": spectra.select(cols).to_dicts()}


# ── Preprocessing ─────────────────────────────────────────────────────────────

def _rpc_preprocessing_preview(params: dict) -> dict:
    from analysis.spectrometry.preprocessing import apply_operation
    project_id, spectrum_id = params["project_id"], params["spectrum_id"]
    wl, refl, _steps = ov.get_effective_spectrum(project_id, spectrum_id)
    try:
        new_wl, new_refl = apply_operation(params["op_type"], wl, refl, params.get("params", {}))
    except Exception as exc:  # noqa: BLE001
        return {"available": False, "reason": str(exc)}
    return {"available": True, "wavelength": new_wl.tolist(), "reflectance": new_refl.tolist()}


def _rpc_preprocessing_apply_operation(params: dict) -> dict:
    return ov.append_op(params["project_id"], params["op_type"], params.get("params", {}), params.get("scope", {"all": True}))


def _rpc_preprocessing_pipeline_presets_list(params: dict) -> dict:
    meta = sp_storage.load_project_meta(params["project_id"])
    return {"presets": meta.get("pipeline_presets", {})}


def _rpc_preprocessing_pipeline_presets_save(params: dict) -> dict:
    ov.save_pipeline_preset(params["project_id"], params["name"], params["ops"])
    return {"success": True}


def _rpc_preprocessing_pipeline_presets_apply(params: dict) -> dict:
    return ov.apply_pipeline_preset(params["project_id"], params["name"], params.get("scope", {"all": True}))


# ── Quality ───────────────────────────────────────────────────────────────────

def _rpc_quality_report(params: dict) -> dict:
    return quality_mod.run_spectral_quality_report(params["project_id"])


def _rpc_quality_set_status(params: dict) -> dict:
    quality_mod.set_quality_status(params["project_id"], params["spectrum_id"], params["status"], params.get("reason", ""))
    return {"success": True}


# ── Features ──────────────────────────────────────────────────────────────────

def _rpc_features_presets_list(params: dict) -> dict:
    meta = sp_storage.load_project_meta(params["project_id"])
    return {"presets": {**FEATURE_PRESETS, **meta.get("custom_feature_presets", {})}}


def _rpc_features_extract(params: dict) -> dict:
    project_id = params["project_id"]
    spectrum_ids: list[str] = params["spectrum_ids"]
    meta = sp_storage.load_project_meta(project_id)

    if params.get("preset_name"):
        preset = resolve_preset(params["preset_name"], meta.get("custom_feature_presets"))
        window = tuple(preset["window"])
        continuum_method = preset.get("continuum_method", "convex_hull")
        preset_name = params["preset_name"]
    else:
        window = tuple(params["window"])
        continuum_method = params.get("continuum_method", "convex_hull")
        preset_name = params.get("preset_name") or "custom"

    results, failures = [], []
    rows = []
    for spectrum_id in spectrum_ids:
        try:
            wl, refl, _steps = ov.get_effective_spectrum(project_id, spectrum_id)
            result = extract_feature(np.array(wl), np.array(refl), window, continuum_method)  # type: ignore[arg-type]
        except Exception as exc:  # noqa: BLE001
            failures.append({"spectrum_id": spectrum_id, "reason": str(exc)})
            continue
        row = {
            "feature_id": sp_storage.new_feature_id(), "spectrum_id": spectrum_id,
            "sample_id": _sample_id_for_spectrum(project_id, spectrum_id),
            "preset_name": preset_name, "center": result.center, "depth": result.depth,
            "width_fwhm": result.width_fwhm, "area": result.area, "asymmetry": result.asymmetry,
            "method": "continuum_removed", "window_min": result.window_min, "window_max": result.window_max,
            "continuum_method": result.continuum_method, "quality_indicator": result.quality_indicator,
            "calc_date": _iso_now(),
        }
        rows.append(row)
        results.append(row)

    if rows:
        sp_storage.append_rows(project_id, "features", rows)
    return {"results": results, "failures": failures}


_sample_id_cache_key = "__sample_id_by_spectrum__"


def _sample_id_for_spectrum(project_id: str, spectrum_id: str) -> str | None:
    spectra = sp_storage.load_table(project_id, "spectra")
    row = spectra.filter(pl.col("spectrum_id") == spectrum_id)
    if row.height == 0:
        return None
    return row["sample_id"][0]


def _rpc_features_list(params: dict) -> dict:
    features = sp_storage.load_table(params["project_id"], "features")
    if params.get("spectrum_id"):
        features = features.filter(pl.col("spectrum_id") == params["spectrum_id"])
    return {"features": features.to_dicts()}


# ── Indices ───────────────────────────────────────────────────────────────────

def _rpc_indices_presets_list(params: dict) -> dict:
    meta = sp_storage.load_project_meta(params["project_id"])
    return {"presets": {**INDEX_PRESETS, **meta.get("custom_index_presets", {})}}


def _features_for_spectrum(project_id: str, spectrum_id: str) -> dict[str, float]:
    features = sp_storage.load_table(project_id, "features").filter(pl.col("spectrum_id") == spectrum_id)
    return {row["preset_name"]: row["depth"] for row in features.to_dicts() if row["depth"] is not None}


def _rpc_indices_preview_formula(params: dict) -> dict:
    # Rejected/adversarial formulas propagate as a hard JSON-RPC error (same
    # as data.preview_formula in the DATA module) — a FormulaError is a
    # validation failure, not a legitimate "nothing to show yet" state, so it
    # does NOT get the soft available:false treatment used elsewhere in this
    # file for genuinely expected empty states.
    project_id, spectrum_id = params["project_id"], params["spectrum_id"]
    wl, refl, _steps = ov.get_effective_spectrum(project_id, spectrum_id)
    features_for_spectrum = _features_for_spectrum(project_id, spectrum_id)
    value = evaluate_spectral_formula(params["formula"], wl, refl, features_for_spectrum)
    return {"available": True, "value": value}


def _rpc_indices_compute(params: dict) -> dict:
    project_id = params["project_id"]
    spectrum_ids: list[str] = params["spectrum_ids"]
    meta = sp_storage.load_project_meta(project_id)

    if params.get("index_name") and not params.get("formula"):
        preset = resolve_index_preset(params["index_name"], meta.get("custom_index_presets"))
        formula = preset["formula"]
        unit = preset.get("unit")
        reference = preset.get("reference")
    else:
        formula = params["formula"]
        unit = params.get("unit")
        reference = params.get("reference")

    index_name = params.get("index_name", "custom")
    results, failures, rows = [], [], []
    for spectrum_id in spectrum_ids:
        try:
            wl, refl, _steps = ov.get_effective_spectrum(project_id, spectrum_id)
            features_for_spectrum = _features_for_spectrum(project_id, spectrum_id)
            value = evaluate_spectral_formula(formula, wl, refl, features_for_spectrum)
        except (FormulaError, ValueError) as exc:
            failures.append({"spectrum_id": spectrum_id, "reason": str(exc)})
            continue
        row = {
            "index_id": sp_storage.new_index_id(), "spectrum_id": spectrum_id,
            "sample_id": _sample_id_for_spectrum(project_id, spectrum_id), "index_name": index_name,
            "formula": formula, "bands_used": None, "result": value, "unit": unit, "reference": reference,
            "quality_indicator": "ok", "calc_date": _iso_now(),
        }
        rows.append(row)
        results.append(row)

    if rows:
        sp_storage.append_rows(project_id, "indices", rows)
    return {"results": results, "failures": failures}


def _rpc_indices_presets_save(params: dict) -> dict:
    meta = sp_storage.load_project_meta(params["project_id"])
    meta.setdefault("custom_index_presets", {})[params["name"]] = {
        "formula": params["formula"], "unit": params.get("unit"), "reference": params.get("reference"),
    }
    sp_storage.save_project_meta(params["project_id"], meta)
    return {"success": True}


def _rpc_indices_list(params: dict) -> dict:
    indices = sp_storage.load_table(params["project_id"], "indices")
    if params.get("spectrum_id"):
        indices = indices.filter(pl.col("spectrum_id") == params["spectrum_id"])
    return {"indices": indices.to_dicts()}


# ── Interpretation ────────────────────────────────────────────────────────────

def _rpc_interpretation_create_manual(params: dict) -> dict:
    interpretation_id = interp_mod.create_manual(
        params["project_id"], params["sample_id"], params.get("spectrum_id"),
        params.get("primary_mineral"), params.get("secondary_mineral"), params.get("mineral_group"),
        params.get("assemblage_name"), params.get("confidence"), params.get("comment"),
        params.get("created_by", "user"), params.get("state", "interpreted"),
    )
    return {"interpretation_id": interpretation_id}


def _rpc_interpretation_rules_list(params: dict) -> dict:
    return {"rules": rules_mod.list_rules(params["project_id"])}


def _rpc_interpretation_rules_upsert(params: dict) -> dict:
    return {"rule": rules_mod.upsert_rule(params["project_id"], params["rule"])}


def _rpc_interpretation_apply_rules(params: dict) -> dict:
    project_id, spectrum_id = params["project_id"], params["spectrum_id"]
    sample_id = _sample_id_for_spectrum(project_id, spectrum_id)
    matched = rules_mod.apply_rules(project_id, spectrum_id)
    created = [interp_mod.create_from_rule_match(project_id, sample_id, spectrum_id, rule) for rule in matched]
    return {"matched_rules": matched, "interpretation_ids": created}


def _rpc_interpretation_library_list(params: dict) -> dict:
    refs = sp_storage.load_table(params["project_id"], "reference_spectra")
    cols = [c for c in refs.columns if c not in ("wavelength", "reflectance")]
    return {"references": refs.select(cols).to_dicts()}


def _rpc_interpretation_library_upsert(params: dict) -> dict:
    project_id = params["project_id"]
    reference_id = sp_storage.new_reference_id()
    row = {
        "reference_id": reference_id, "name": params["name"], "mineral_label": params.get("mineral_label", ""),
        "wavelength": params["wavelength"], "reflectance": params["reflectance"],
        "source": params.get("source", "imported"), "added_at": _iso_now(),
    }
    sp_storage.append_rows(project_id, "reference_spectra", [row])
    return {"reference_id": reference_id}


def _rpc_interpretation_library_match(params: dict) -> dict:
    project_id, spectrum_id = params["project_id"], params["spectrum_id"]
    wl, refl, _steps = ov.get_effective_spectrum(project_id, spectrum_id)
    refs = sp_storage.load_table(project_id, "reference_spectra")
    candidates = refs.to_dicts()
    if not candidates:
        return {"available": False, "reason": "No reference spectra in the project library yet."}
    region = tuple(params.get("region", [float(wl.min()), float(wl.max())]))
    try:
        matches = lib_match_mod.library_match(wl, refl, candidates, region)  # type: ignore[arg-type]
    except lib_match_mod.LibraryMatchError as exc:
        return {"available": False, "reason": str(exc)}
    return {"available": True, "matches": [asdict(m) for m in matches]}


def _rpc_interpretation_accept_match(params: dict) -> dict:
    project_id, spectrum_id = params["project_id"], params["spectrum_id"]
    sample_id = _sample_id_for_spectrum(project_id, spectrum_id)
    match = lib_match_mod.MatchResult(**params["match"])
    region = tuple(params["region"])
    interpretation_id = interp_mod.create_from_library_match(project_id, sample_id, spectrum_id, match, region)
    return {"interpretation_id": interpretation_id}


def _rpc_interpretation_confirm(params: dict) -> dict:
    new_id = interp_mod.confirm(
        params["project_id"], params["interpretation_id"], params["new_state"],
        params.get("field_overrides"), params.get("edited_by", "user"), params.get("reason"),
    )
    return {"interpretation_id": new_id}


def _rpc_interpretation_list(params: dict) -> dict:
    return {"interpretations": interp_mod.list_current(params["project_id"], params.get("sample_id")).to_dicts()}


def _rpc_interpretation_history(params: dict) -> dict:
    return {"history": interp_mod.get_history(params["project_id"], params["sample_id"]).to_dicts()}


# ── Specialized: White Mica / Chlorite ───────────────────────────────────────

def _rpc_white_mica_analyze(params: dict) -> dict:
    result = mineral_population.analyze_white_mica(params["project_id"], params.get("preset_name", "AlOH_2200"))
    return {"results": result.to_dicts()}


def _rpc_chlorite_analyze(params: dict) -> dict:
    result = mineral_population.analyze_chlorite(params["project_id"], params.get("preset_name", "MgOH_2320"))
    return {"results": result.to_dicts()}


# ── Spectral Log ──────────────────────────────────────────────────────────────

def _rpc_log_data(params: dict) -> dict:
    project_id = params["project_id"]
    samples = sp_storage.load_table(project_id, "samples")
    if params.get("drillhole_ids"):
        samples = samples.filter(pl.col("drillhole_id").is_in(params["drillhole_ids"]))
    interpretations = interp_mod.list_current(project_id)
    indices = sp_storage.load_table(project_id, "indices")
    quality = sp_storage.load_table(project_id, "spectra").select(["sample_id", "quality_status", "quality_score"])

    return {
        "samples": samples.to_dicts(),
        "interpretations": interpretations.to_dicts(),
        "indices": indices.to_dicts(),
        "quality": quality.to_dicts(),
    }


# ── Export ────────────────────────────────────────────────────────────────────

def _rpc_export_table(params: dict) -> dict:
    project_id, table_name, fmt = params["project_id"], params["table_name"], params.get("format", "csv")
    df = sp_storage.load_table(project_id, table_name)
    non_list_cols = [c for c, t in df.schema.items() if not isinstance(t, pl.List)]
    df = df.select(non_list_cols)

    export_dir = DATA_DIR / "exports"
    export_dir.mkdir(parents=True, exist_ok=True)
    out_path = export_dir / f"{project_id}_{table_name}.{fmt}"
    if fmt == "csv":
        df.write_csv(out_path)
    elif fmt == "json":
        out_path.write_text(json.dumps(df.to_dicts(), ensure_ascii=False, indent=2), encoding="utf-8")
    else:
        raise ValueError(f"Unsupported export format: {fmt}")
    return {"path": str(out_path)}


def _rpc_export_to_dataset(params: dict) -> dict:
    project_id = params["project_id"]
    samples = sp_storage.load_table(project_id, "samples")
    interpretations = interp_mod.list_current(project_id).select([
        "sample_id", "primary_mineral", "secondary_mineral", "mineral_group", "assemblage_name", "state",
    ])
    indices = sp_storage.load_table(project_id, "indices")
    if indices.height > 0:
        indices_wide = indices.filter(pl.col("sample_id").is_not_null()).pivot(
            values="result", index="sample_id", on="index_name", aggregate_function="mean"
        )
    else:
        indices_wide = pl.DataFrame({"sample_id": []}, schema={"sample_id": pl.Utf8})

    joined = samples.join(interpretations, on="sample_id", how="left").join(indices_wide, on="sample_id", how="left")
    meta = sp_storage.load_project_meta(project_id)
    dataset_id = save_dataset(joined, name=f"{meta['name']} (spectral export)", meta_extra={"source": "spectrometry", "spectral_project_id": project_id})
    return {"dataset_id": dataset_id}


SPECTROMETRY_METHODS: dict[str, Any] = {
    "spectrometry.project.create": _rpc_project_create,
    "spectrometry.project.list": _rpc_project_list,
    "spectrometry.project.get": _rpc_project_get,
    "spectrometry.project.delete": _rpc_project_delete,

    "spectrometry.import.preview_file": _rpc_import_preview_file,
    "spectrometry.import.native_spectra": _rpc_import_native_spectra,
    "spectrometry.import.processed_table_preview": _rpc_import_processed_table_preview,
    "spectrometry.import.processed_table": _rpc_import_processed_table,
    "spectrometry.import.mapping_presets.list": _rpc_mapping_presets_list,
    "spectrometry.import.mapping_presets.upsert": _rpc_mapping_presets_upsert,

    "spectrometry.samples.list": _rpc_samples_list,
    "spectrometry.spectra.get": _rpc_spectra_get,
    "spectrometry.spectra.list_for_sample": _rpc_spectra_list_for_sample,

    "spectrometry.preprocessing.preview": _rpc_preprocessing_preview,
    "spectrometry.preprocessing.apply_operation": _rpc_preprocessing_apply_operation,
    "spectrometry.preprocessing.undo_operation": lambda p: ov.undo(p["project_id"]),
    "spectrometry.preprocessing.redo_operation": lambda p: ov.redo(p["project_id"]),
    "spectrometry.preprocessing.get_operations": lambda p: ov.load_overlay(p["project_id"]),
    "spectrometry.preprocessing.pipeline_presets.list": _rpc_preprocessing_pipeline_presets_list,
    "spectrometry.preprocessing.pipeline_presets.save": _rpc_preprocessing_pipeline_presets_save,
    "spectrometry.preprocessing.pipeline_presets.apply": _rpc_preprocessing_pipeline_presets_apply,

    "spectrometry.quality.report": _rpc_quality_report,
    "spectrometry.quality.set_status": _rpc_quality_set_status,

    "spectrometry.features.presets.list": _rpc_features_presets_list,
    "spectrometry.features.extract": _rpc_features_extract,
    "spectrometry.features.list": _rpc_features_list,

    "spectrometry.indices.presets.list": _rpc_indices_presets_list,
    "spectrometry.indices.preview_formula": _rpc_indices_preview_formula,
    "spectrometry.indices.compute": _rpc_indices_compute,
    "spectrometry.indices.presets.save": _rpc_indices_presets_save,
    "spectrometry.indices.list": _rpc_indices_list,

    "spectrometry.interpretation.create_manual": _rpc_interpretation_create_manual,
    "spectrometry.interpretation.rules.list": _rpc_interpretation_rules_list,
    "spectrometry.interpretation.rules.upsert": _rpc_interpretation_rules_upsert,
    "spectrometry.interpretation.apply_rules": _rpc_interpretation_apply_rules,
    "spectrometry.interpretation.library.list": _rpc_interpretation_library_list,
    "spectrometry.interpretation.library.upsert": _rpc_interpretation_library_upsert,
    "spectrometry.interpretation.library_match": _rpc_interpretation_library_match,
    "spectrometry.interpretation.accept_match": _rpc_interpretation_accept_match,
    "spectrometry.interpretation.confirm": _rpc_interpretation_confirm,
    "spectrometry.interpretation.list": _rpc_interpretation_list,
    "spectrometry.interpretation.history": _rpc_interpretation_history,

    "spectrometry.white_mica.analyze": _rpc_white_mica_analyze,
    "spectrometry.chlorite.analyze": _rpc_chlorite_analyze,

    "spectrometry.log.data": _rpc_log_data,

    "spectrometry.export.table": _rpc_export_table,
    "spectrometry.export.to_dataset": _rpc_export_to_dataset,
}
