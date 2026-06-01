"""
JSON-RPC 2.0 router — punto de entrada único para todas las llamadas analíticas
desde Tauri. Despacha al handler correcto según el método.
"""

from fastapi import APIRouter
from pydantic import BaseModel
from typing import Any
import uuid

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

METHOD_REGISTRY: dict[str, Any] = {
    # health
    "health.ping": lambda _: {"pong": True, "service": "pyorex-analytics"},

    # QAQC (RF-10) — implemented
    # "qaqc.calculate": handlers.qaqc_calculate,
    # "qaqc.control_chart": handlers.qaqc_control_chart,
    # "qaqc.report": handlers.qaqc_report,
    # "qaqc.crm_library.list": handlers.qaqc_crm_list,
    # "qaqc.crm_library.upsert": handlers.qaqc_crm_upsert,

    # Analytics (Fase 1 — TODO):
    # "analytics.descriptive": ...,
    # "analytics.pca": ...,
    # "analytics.clustering.kmeans": ...,
    # "analytics.clustering.hierarchical": ...,
    # "analytics.correlation": ...,
    # "analytics.factor": ...,
    # "analytics.outlier": ...,
    # "analytics.geochemical_index": ...,
    # "preprocessing.pipeline.execute": ...,
    # "preprocessing.quality_report": ...,
    # "data.import.csv": ...,
    # "data.import.excel": ...,
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
