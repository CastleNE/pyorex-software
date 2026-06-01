from fastapi import APIRouter

router = APIRouter()


@router.get("")
async def health_check() -> dict:
    """Endpoint de salud para verificar que el servicio Python está activo."""
    return {"status": "healthy", "service": "pyorex-analytics"}
