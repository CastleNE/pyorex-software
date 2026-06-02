"""
PyOrex Analytics Engine — FastAPI service
Communicates with Tauri via JSON-RPC 2.0 over HTTP on port 5174.
"""

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.routers import health, rpc, data_routes

app = FastAPI(
    title="PyOrex Analytics Engine",
    version="0.1.0",
    description="Python compute service for PyOrex geochemical analysis",
    docs_url="/docs",
    redoc_url=None,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "tauri://localhost",
        "http://localhost:1420",
        "http://127.0.0.1:1420",
    ],
    allow_methods=["*"],
    allow_headers=["*"],
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
