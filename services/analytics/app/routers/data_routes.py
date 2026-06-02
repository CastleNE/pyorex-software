"""
Data import REST endpoints (also exposed via JSON-RPC through rpc.py).
"""
from __future__ import annotations

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Any

from analysis.data.importer import (
    ImportConfig,
    NullMapping,
    SampleTypeMapping,
    import_file,
    preview_file,
)
from analysis.data.storage import save_dataset, list_datasets, load_metadata

router = APIRouter()


# ── Pydantic schemas ──────────────────────────────────────────────────────────

class PreviewRequest(BaseModel):
    file_path: str
    n_rows: int = 50


class NullMappingSchema(BaseModel):
    column: str
    sentinel_value: str
    null_type: str
    lod_value: float | None = None


class SampleTypeMappingSchema(BaseModel):
    column: str
    value_map: dict[str, str]


class ImportRequest(BaseModel):
    file_path: str
    dataset_name: str
    null_mappings: list[NullMappingSchema] = []
    sample_type_mapping: SampleTypeMappingSchema | None = None
    sheet_name: str | int = 0


# ── Endpoints ─────────────────────────────────────────────────────────────────

@router.post("/preview")
async def preview_dataset(req: PreviewRequest) -> dict:
    """
    Step 2 of the import wizard: read file and return preview.
    IPC method: data.preview
    """
    try:
        result = preview_file(req.file_path, req.n_rows)
        return {
            "columns": result.columns,
            "preview_rows": result.preview_rows,
            "total_rows": result.total_rows,
            "file_size_kb": result.file_size_kb,
        }
    except FileNotFoundError:
        raise HTTPException(status_code=404, detail=f"File not found: {req.file_path}")
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/import")
async def import_dataset(req: ImportRequest) -> dict:
    """
    Final step of import wizard: read, validate, save as Parquet.
    IPC method: data.import
    """
    try:
        config = ImportConfig(
            null_mappings=[
                NullMapping(
                    column=m.column,
                    sentinel_value=m.sentinel_value,
                    null_type=m.null_type,
                    lod_value=m.lod_value,
                )
                for m in req.null_mappings
            ],
            sample_type_mapping=(
                SampleTypeMapping(
                    column=req.sample_type_mapping.column,
                    value_map=req.sample_type_mapping.value_map,
                )
                if req.sample_type_mapping
                else None
            ),
            sheet_name=req.sheet_name,
        )

        df = import_file(req.file_path, config)
        dataset_id = save_dataset(
            df,
            name=req.dataset_name,
            meta_extra={"source_path": req.file_path},
        )
        meta = load_metadata(dataset_id)
        return {"success": True, "dataset": meta}

    except FileNotFoundError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.get("/list")
async def list_all_datasets() -> dict:
    """List all imported datasets."""
    return {"datasets": list_datasets()}
