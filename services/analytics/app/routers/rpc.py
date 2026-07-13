"""
JSON-RPC 2.0 router — punto de entrada único para todas las llamadas analíticas
desde Tauri. Despacha al handler correcto según el método.
"""

from fastapi import APIRouter
from pydantic import BaseModel
from typing import Any
import uuid

from analysis.data.importer import ColumnMapping, ImportConfig, NullMapping, SampleTypeMapping, SpatialConfig, import_file, preview_file
from analysis.data.storage import save_dataset, load_metadata, list_datasets, get_rows, delete_dataset
from analysis.spatial.kml_export import export_kml

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
    }
    dataset_id = save_dataset(df, name=params["dataset_name"], meta_extra=meta_extra)
    meta = load_metadata(dataset_id)
    meta["module_availability"] = import_meta["module_availability"]
    meta["qaqc_status"] = import_meta["qaqc_status"]
    meta["spatial_status"] = import_meta["spatial_status"]
    meta["spatial_config"] = spatial_config.to_dict() if spatial_config else None
    return {"success": True, "dataset": meta}


def _rpc_data_export_kml(params: dict) -> dict:
    path = export_kml(
        dataset_id=params["dataset_id"],
        lat_col=params.get("lat_col"),
        lon_col=params.get("lon_col"),
        name_col=params.get("name_col"),
        color_col=params.get("color_col"),
    )
    return {"kml_path": path}


METHOD_REGISTRY: dict[str, Any] = {
    "health.ping": lambda _: {"pong": True, "service": "pyorex-analytics"},

    # Data import / export (RF-02)
    "data.preview":    _rpc_data_preview,
    "data.import":     _rpc_data_import,
    "data.list":       lambda _: {"datasets": list_datasets()},
    "data.rows":       lambda p: get_rows(p["dataset_id"], p.get("offset", 0), min(p.get("limit", 200), 5000)),
    "data.delete":     lambda p: {"deleted": delete_dataset(p["dataset_id"])},
    "data.export_kml": _rpc_data_export_kml,
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
