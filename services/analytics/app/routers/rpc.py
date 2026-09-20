"""
JSON-RPC 2.0 router — punto de entrada único para todas las llamadas analíticas
desde Tauri. Despacha al handler correcto según el método.
"""

from fastapi import APIRouter
from pydantic import BaseModel
from typing import Any
from dataclasses import asdict
import uuid

from analysis.data.importer import ColumnMapping, ImportConfig, NullMapping, SampleTypeMapping, SpatialConfig, import_file, preview_file
from analysis.data.storage import save_dataset, load_metadata, list_datasets, delete_dataset
from analysis.data import overlay
from analysis.data import query as query_mod
from analysis.data import formula as formula_mod
from analysis.data import quality as quality_mod
from analysis.spatial.kml_export import export_kml
from analysis.analytics.descriptive import run_descriptive
from analysis.analytics.pca import run_pca
from analysis.qaqc import common as qaqc_common, crm_library
from analysis.qaqc.control_charts import build_shewhart_chart
from analysis.qaqc.crm import analyze_crm
from analysis.qaqc.report import build_qaqc_report
from app.routers.spectrometry_rpc import SPECTROMETRY_METHODS

router = APIRouter()


# ─── JSON-RPC 2.0 Models ────────────────────────────────────────────────────

class RpcRequest(BaseModel):
    jsonrpc: str = "2.0"
    method: str
    params: dict[str, Any] = {}
    id: str


class RpcError(BaseModel):
    code: int
    message: str


class RpcResponse(BaseModel):
    jsonrpc: str = "2.0"
    result: Any = None
    error: RpcError | None = None
    id: str


# ─── Method Registry ────────────────────────────────────────────────────────
# Maps method names to handler functions.
# Add new methods here as the analytics modules are implemented.

def _rpc_data_preview(params: dict) -> dict:
    result = preview_file(params["file_path"], params.get("n_rows", 50), params.get("separator", ","))
    return {
        "columns": result.columns,
        "preview_rows": result.preview_rows,
        "total_rows": result.total_rows,
        "file_size_kb": result.file_size_kb,
        "spatial_detection": result.spatial_detection,
        "column_profiles": result.column_profiles,
    }


def _rpc_data_import(params: dict) -> dict:
    null_mappings = [
        NullMapping(
            column=m["column"],
            sentinel_value=m["sentinel_value"],
            null_type=m["null_type"],
            lod_value=m.get("lod_value"),
        )
        for m in params.get("null_mappings", [])
    ]
    stm_raw = params.get("sample_type_mapping")
    sample_type_mapping = (
        SampleTypeMapping(column=stm_raw["column"], value_map=stm_raw["value_map"])
        if stm_raw
        else None
    )
    sc_raw = params.get("spatial_config")
    spatial_config = (
        SpatialConfig(
            geometry_source=sc_raw["geometry_source"],
            east_col=sc_raw.get("east_col"),
            north_col=sc_raw.get("north_col"),
            projected_epsg=sc_raw.get("projected_epsg"),
            projected_crs_label=sc_raw.get("projected_crs_label"),
            lon_col=sc_raw.get("lon_col"),
            lat_col=sc_raw.get("lat_col"),
        )
        if sc_raw
        else None
    )
    column_mappings = [
        ColumnMapping(
            original_name=m["original_name"],
            import_flag=m.get("import_flag", "yes"),
            role_override=m.get("role_override"),
            analyte_override=m.get("analyte_override"),
            unit_override=m.get("unit_override"),
            alias=m.get("alias"),
        )
        for m in params.get("column_mappings", [])
    ]
    config = ImportConfig(
        null_mappings=null_mappings,
        sample_type_mapping=sample_type_mapping,
        sheet_name=params.get("sheet_name", 0),
        separator=params.get("separator", ","),
        spatial_config=spatial_config,
        column_role_overrides=params.get("column_role_overrides", {}),
        column_mappings=column_mappings,
    )
    df, import_meta = import_file(params["file_path"], config)
    role_by_column = {p["original_name"]: p["role"] for p in import_meta["column_profiles"]}
    meta_extra = {
        "source_path": params["file_path"],
        "spatial_config": spatial_config.to_dict() if spatial_config else None,
        "iogas_display_cols": params.get("iogas_display_cols", []),
        "import_status": import_meta["import_status"],
        "chemical_status": import_meta["chemical_status"],
        "spatial_status": import_meta["spatial_status"],
        "plot_status": import_meta["plot_status"],
        "qaqc_status": import_meta["qaqc_status"],
        "module_availability": import_meta["module_availability"],
        "column_roles": role_by_column,
    }
    dataset_id = save_dataset(df, name=params["dataset_name"], meta_extra=meta_extra)
    meta = load_metadata(dataset_id)
    meta["module_availability"] = import_meta["module_availability"]
    meta["qaqc_status"] = import_meta["qaqc_status"]
    meta["spatial_status"] = import_meta["spatial_status"]
    meta["spatial_config"] = spatial_config.to_dict() if spatial_config else None
    return {"success": True, "dataset": meta}


def _rpc_analytics_descriptive(params: dict) -> dict:
    df, _hidden = overlay.get_effective_dataframe(params["dataset_id"])
    result = run_descriptive(df, params["variables"], params.get("include_qaqc_flagged", False))
    return asdict(result)


def _rpc_analytics_pca(params: dict) -> dict:
    df, _hidden = overlay.get_effective_dataframe(params["dataset_id"])
    result = run_pca(
        df, params["variables"], params.get("n_components"), params.get("include_qaqc_flagged", False)
    )
    return asdict(result)


def _rpc_data_export_kml(params: dict) -> dict:
    path = export_kml(
        dataset_id=params["dataset_id"],
        lat_col=params.get("lat_col"),
        lon_col=params.get("lon_col"),
        name_col=params.get("name_col"),
        color_col=params.get("color_col"),
    )
    return {"kml_path": path}


def _rpc_data_rows(params: dict) -> dict:
    dataset_id = params["dataset_id"]
    offset = params.get("offset", 0)
    limit = min(params.get("limit", 200), 5000)
    include_hidden = params.get("include_hidden", False)

    df, hidden = overlay.get_effective_dataframe(dataset_id)
    total_rows_unfiltered = df.height

    df = query_mod.apply_filters(df, params.get("filters"), params.get("filter_combinator", "and"))
    df = query_mod.apply_sort(df, params.get("sort"))

    visible_columns = [c for c in df.columns if include_hidden or c not in hidden]
    page = df.slice(offset, limit)
    return {
        "columns": visible_columns,
        "rows": page.select(visible_columns).to_dicts(),
        "total_rows": df.height,
        "total_rows_unfiltered": total_rows_unfiltered,
        "offset": offset,
        "hidden_columns": sorted(hidden),
    }


def _rpc_data_preview_formula(params: dict) -> dict:
    df, _hidden = overlay.get_effective_dataframe(params["dataset_id"])
    return formula_mod.evaluate_preview(
        params["formula"], df, params.get("variables", []), params.get("sample_size", 20)
    )


def _rpc_data_apply_operation(params: dict) -> dict:
    op = params["operation"]
    return overlay.append_op(params["dataset_id"], op["type"], op["params"])


def _rpc_data_save_changes(params: dict) -> dict:
    dataset_id = params["dataset_id"]
    df, _hidden = overlay.get_effective_dataframe(dataset_id)
    prev_meta = load_metadata(dataset_id)

    role_by_column = {c["name"]: c.get("role", "unknown") for c in prev_meta.get("columns", [])}
    meta_extra = {k: v for k, v in prev_meta.items() if k not in ("id", "name", "row_count", "column_count", "columns", "imported_at")}
    meta_extra["derived_from"] = dataset_id
    meta_extra["version"] = prev_meta.get("version", 1) + 1
    meta_extra["column_roles"] = role_by_column

    new_id = save_dataset(df, name=prev_meta["name"], meta_extra=meta_extra)
    overlay.delete_overlay(dataset_id)
    return {"success": True, "dataset": load_metadata(new_id)}


def _rpc_qaqc_calculate(params: dict) -> dict:
    dataset_id = params["dataset_id"]
    df, _hidden = overlay.get_effective_dataframe(dataset_id)
    sample_type_col = qaqc_common.get_sample_type_column(df)
    if sample_type_col is None:
        return {"available": False, "reason": "El dataset no tiene un tipo de muestra mapeado."}

    report = build_qaqc_report(
        df,
        dataset_id,
        sample_type_col,
        params["variables"],
        crm_library.get_crm_values_map(),
        blank_factor=params.get("blank_factor", 0.20),
        fd_threshold=params.get("fd_threshold", 20.0),
        ld_threshold=params.get("ld_threshold", 15.0),
        crm_warning_pct=params.get("crm_warning_pct", 15.0),
        crm_failure_pct=params.get("crm_failure_pct", 25.0),
    )
    return {"available": True, **asdict(report)}


def _rpc_qaqc_report(params: dict) -> dict:
    # Same aggregator as qaqc.calculate today (see analysis/qaqc/report.py) —
    # kept as a distinct method so a future PDF-export step can diverge from
    # the interactive "calculate" contract without a breaking change.
    return _rpc_qaqc_calculate(params)


def _rpc_qaqc_control_chart(params: dict) -> dict:
    dataset_id = params["dataset_id"]
    df, _hidden = overlay.get_effective_dataframe(dataset_id)
    sample_type_col = qaqc_common.get_sample_type_column(df)
    if sample_type_col is None:
        raise ValueError("El dataset no tiene un tipo de muestra mapeado.")

    variable = params["variable"]
    crm_name = params["crm_name"]
    crm_warning_pct = params.get("crm_warning_pct", 15.0)
    crm_failure_pct = params.get("crm_failure_pct", 25.0)

    crm_results = analyze_crm(
        df, sample_type_col, [variable], crm_library.get_crm_values_map(), crm_warning_pct, crm_failure_pct
    )
    series = [
        (r.sample_id, r.recovery_by_variable[variable])
        for r in crm_results
        if r.crm_name == crm_name and variable in r.recovery_by_variable
    ]
    if len(series) < 2:
        return {
            "available": False,
            "reason": f"Solo {len(series)} punto(s) — se necesitan al menos 2 para una carta de control.",
            "n_points": len(series),
        }

    chart = build_shewhart_chart(series, crm_warning_pct, crm_failure_pct)
    return {"available": True, **asdict(chart)}


METHOD_REGISTRY: dict[str, Any] = {
    "health.ping": lambda _: {"pong": True, "service": "pyorex-analytics"},

    # Data import / export (RF-02)
    "data.preview":    _rpc_data_preview,
    "data.import":     _rpc_data_import,
    "data.list":       lambda _: {"datasets": list_datasets()},
    "data.rows":       _rpc_data_rows,
    "data.delete":     lambda p: {"deleted": delete_dataset(p["dataset_id"])},
    "data.export_kml": _rpc_data_export_kml,

    # Non-destructive edit overlay (DATA screen toolbar)
    "data.quality_report":  lambda p: quality_mod.run_quality_report(p["dataset_id"]),
    "data.preview_formula": _rpc_data_preview_formula,
    "data.apply_operation": _rpc_data_apply_operation,
    "data.undo_operation":  lambda p: overlay.undo(p["dataset_id"]),
    "data.redo_operation":  lambda p: overlay.redo(p["dataset_id"]),
    "data.get_operations":  lambda p: overlay.load_overlay(p["dataset_id"]),
    "data.save_changes":    _rpc_data_save_changes,

    # Analytics (RF-04): descriptive stats + PCA
    "analytics.descriptive": _rpc_analytics_descriptive,
    "analytics.pca":         _rpc_analytics_pca,

    # QAQC (RF-10): blanks, duplicates, CRM, Shewhart control charts
    "qaqc.calculate":          _rpc_qaqc_calculate,
    "qaqc.control_chart":      _rpc_qaqc_control_chart,
    "qaqc.report":             _rpc_qaqc_report,
    "qaqc.crm_library.list":   lambda _: {"crms": [asdict(c) for c in crm_library.list_crms()]},
    "qaqc.crm_library.upsert": lambda p: {
        "crm": asdict(crm_library.upsert_crm(p["name"], p["certified_values"], p.get("uncertainty")))
    },

    # Spectrometry (TSG-like spectral interpretation module)
    **SPECTROMETRY_METHODS,
}


# ─── RPC Endpoint ───────────────────────────────────────────────────────────

@router.post("/rpc", response_model=RpcResponse)
async def json_rpc(request: RpcRequest) -> RpcResponse:
    """
    JSON-RPC 2.0 dispatcher. All analytics calls from Tauri come through here.
    Contract: ipc-contracts/analytics/*.v1.json
    """
    if request.jsonrpc != "2.0":
        return RpcResponse(
            id=request.id,
            error=RpcError(code=-32600, message="Invalid JSON-RPC version — must be '2.0'"),
        )

    handler = METHOD_REGISTRY.get(request.method)
    if handler is None:
        return RpcResponse(
            id=request.id,
            error=RpcError(
                code=-32601,
                message=f"Method not found: '{request.method}'",
            ),
        )

    try:
        import asyncio
        result = handler(request.params)
        if asyncio.iscoroutine(result):
            result = await result
        return RpcResponse(id=request.id, result=result)
    except Exception as exc:
        detail = str(exc) if str(exc) else repr(exc)
        return RpcResponse(
            id=request.id,
            error=RpcError(code=-32603, message=f"Internal error: {type(exc).__name__}: {detail}"),
        )
