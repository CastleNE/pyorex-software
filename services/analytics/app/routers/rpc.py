"""
JSON-RPC 2.0 router — punto de entrada único para todas las llamadas analíticas
desde Tauri. Despacha al handler correcto según el método.
"""

from fastapi import APIRouter
from pydantic import BaseModel
from typing import Any
import uuid

from analysis.data.importer import ImportConfig, NullMapping, SampleTypeMapping, SpatialRef, import_file, preview_file
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
    sr_raw = params.get("spatial_ref")
    spatial_ref = (
        SpatialRef(
            x_col=sr_raw["x_col"],
            y_col=sr_raw["y_col"],
            crs=sr_raw["crs"],
            crs_label=sr_raw["crs_label"],
            is_geographic=sr_raw["is_geographic"],
        )
        if sr_raw
        else None
    )
    config = ImportConfig(
        null_mappings=null_mappings,
        sample_type_mapping=sample_type_mapping,
        sheet_name=params.get("sheet_name", 0),
        separator=params.get("separator", ","),
        spatial_ref=spatial_ref,
    )
    df = import_file(params["file_path"], config)
    meta_extra = {
        "source_path": params["file_path"],
        "spatial_ref": sr_raw,
        "iogas_display_cols": params.get("iogas_display_cols", []),
    }
    dataset_id = save_dataset(df, name=params["dataset_name"], meta_extra=meta_extra)
    return {"success": True, "dataset": load_metadata(dataset_id)}


def _rpc_data_export_kml(params: dict) -> dict:
    path = export_kml(
        dataset_id=params["dataset_id"],
        lat_col=params.get("lat_col"),
        lon_col=params.get("lon_col"),
        name_col=params.get("name_col"),
        color_col=params.get("color_col"),
        output_dir=params.get("output_dir"),
    )
    return {"kml_path": path}


METHOD_REGISTRY: dict[str, Any] = {
    "health.ping": lambda _: {"pong": True, "service": "pyorex-analytics"},

    # Data import / export (RF-02)
    "data.preview":    _rpc_data_preview,
    "data.import":     _rpc_data_import,
    "data.list":       lambda _: {"datasets": list_datasets()},
    "data.rows":       lambda p: get_rows(p["dataset_id"], p.get("offset", 0), p.get("limit", 200)),
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
        return RpcResponse(
            id=request.id,
            error=RpcError(code=-32603, message=f"Internal error: {exc}"),
        )
