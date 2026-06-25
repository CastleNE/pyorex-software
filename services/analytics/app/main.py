"""
PyOrex Analytics Engine — FastAPI service
Communicates with Tauri via JSON-RPC 2.0 over HTTP on port 5174.
"""

import os

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.trustedhost import TrustedHostMiddleware

from app.routers import health, rpc, data_routes

_DEV_MODE = os.getenv("PYOREX_DEV", "").lower() in ("1", "true", "yes")

app = FastAPI(
    title="PyOrex Analytics Engine",
    version="0.1.0",
    description="Python compute service for PyOrex geochemical analysis",
    docs_url="/docs" if _DEV_MODE else None,
    redoc_url=None,
)

# Only accept requests from localhost — blocks other processes on the machine
app.add_middleware(
    TrustedHostMiddleware,
    allowed_hosts=["127.0.0.1", "localhost"],
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "tauri://localhost",
        "http://localhost:1420",
        "http://127.0.0.1:1420",
    ],
    allow_methods=["GET", "POST"],
    allow_headers=["Content-Type"],
)

app.include_router(health.router, prefix="/health", tags=["health"])
app.include_router(rpc.router, tags=["rpc"])
app.include_router(data_routes.router, prefix="/data", tags=["data"])


@app.get("/")
async def root() -> dict:
    return {
        "service": "pyorex-analytics",
        "version": "0.1.0",
        "status": "ready",
        "protocol": "JSON-RPC 2.0",
    }
