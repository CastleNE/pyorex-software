import asyncio

from pydantic import BaseModel, ConfigDict

from analysis.data import overlay, storage
from analysis.geochemistry.catalog import TOOLS
from analysis.geochemistry.custom_diagram import preview as diagram_preview
from analysis.geochemistry.engine import calculate
from analysis.geochemistry.models import DatasetRequest
from analysis.geochemistry.registry_view import registry_view
from analysis.geochemistry.semantics import classification_to_dict, classify_column_with_hint, validate_override, with_override
from analysis.geochemistry.exploration import ExplorationDatasetRequest, explore


class CatalogRequest(BaseModel):
    model_config = ConfigDict(extra='forbid', strict=True)
    dataset_id: str


class RegistryRequest(BaseModel):
    model_config = ConfigDict(extra='forbid', strict=True)


async def registry(params):
    RegistryRequest.model_validate(params)
    return registry_view()


def _catalog(dataset_id):
    df, hidden = overlay.get_effective_dataframe(dataset_id)
    metadata = storage.load_metadata(dataset_id)
    columns = []
    for name,dtype in df.schema.items():
        if name in hidden or name.startswith('_') or name == 'internal_feature_id':
            continue
        columns.append({'name':name,'numeric':dtype.is_numeric()})
    return {'tools':TOOLS,'columns':columns,'dataset_id':dataset_id,'dataset_name':metadata['name']}


async def catalog(params):
    config = CatalogRequest.model_validate(params)
    return await asyncio.to_thread(_catalog, config.dataset_id)


class ColumnRolesRequest(BaseModel):
    model_config = ConfigDict(extra='forbid', strict=True)
    dataset_id: str


def _column_roles(dataset_id):
    """Semantic Variable System (v1): the actual per-column classification for one dataset, enriched (only where
    ambiguous) by the coarse ColumnRole already computed at import time. Never reads or changes a value."""
    df, hidden = overlay.get_effective_dataframe(dataset_id)
    meta = storage.load_metadata(dataset_id)
    existing_role = {c['name']: c.get('role') for c in meta['columns']}
    overrides = meta.get('semantic_overrides') or {}
    columns = []
    for name, dtype in df.schema.items():
        if name in hidden or name.startswith('_') or name == 'internal_feature_id':
            continue
        classification = classify_column_with_hint(name, dtype.is_numeric(), existing_role.get(name))
        try:
            classification = with_override(classification, overrides.get(name))
        except ValueError:
            pass  # a stale/invalid stored correction never breaks the classification
        columns.append(classification_to_dict(classification))
    return {'dataset_id': dataset_id, 'columns': columns}


async def column_roles(params):
    config = ColumnRolesRequest.model_validate(params)
    return await asyncio.to_thread(_column_roles, config.dataset_id)


class SetColumnRoleRequest(BaseModel):
    model_config = ConfigDict(extra='forbid', strict=True)
    dataset_id: str
    column: str
    semantic_role: str | None      # None removes the user correction (back to the classifier)
    analyte: str | None = None


def _set_column_role(req: SetColumnRoleRequest):
    """User correction of one column's semantic role, stored in the dataset metadata. Never changes a value."""
    df, hidden = overlay.get_effective_dataframe(req.dataset_id)
    if req.column not in df.columns or req.column in hidden:
        raise ValueError(f'Columna inexistente en el dataset: {req.column!r}')
    correction = None if req.semantic_role is None else validate_override(req.semantic_role, req.analyte)

    def change(meta):   # merged under the metadata lock: concurrent corrections never overwrite each other
        overrides = dict(meta.get('semantic_overrides') or {})
        if correction is None:
            overrides.pop(req.column, None)
        else:
            overrides[req.column] = {'semantic_role': correction[0].value, 'analyte': correction[1]}
        return {'semantic_overrides': overrides}
    storage.mutate_metadata(req.dataset_id, change)
    return _column_roles(req.dataset_id)


async def set_column_role(params):
    req = SetColumnRoleRequest.model_validate(params)
    return await asyncio.to_thread(_set_column_role, req)


def _compute(config):
    df, _hidden = overlay.get_effective_dataframe(config.dataset_id)
    if config.diagram is not None:   # a user diagram may only read the columns the user can see
        df = df.drop([c for c in _hidden if c in df.columns])
    meta = storage.load_metadata(config.dataset_id)
    roles = {c['name']:c.get('role','unknown') for c in meta['columns']}
    result = calculate(df,config.model_dump(exclude={'dataset_id'}),roles)
    result['pipeline']['dataset_id'] = config.dataset_id
    result['pipeline']['dataset_name'] = meta['name']
    result['pipeline']['operations'] = overlay.load_overlay(config.dataset_id)['ops']
    return result


async def compute(params):
    config = DatasetRequest.model_validate(params)
    return await asyncio.to_thread(_compute,config)


def _explore(config):
    df, hidden = overlay.get_effective_dataframe(config.dataset_id)
    selected = [*config.variables, config.east, config.north, config.label_column]
    if any(c in hidden for c in selected if c):
        raise ValueError('Una columna seleccionada está oculta; actualiza la selección')
    meta = storage.load_metadata(config.dataset_id)
    roles = {c['name']:c.get('role','unknown') for c in meta['columns']}
    result = explore(df,config.model_dump(exclude={'dataset_id'}),roles)
    result['pipeline'].update(dataset_id=config.dataset_id,dataset_name=meta['name'],
                              operations=overlay.load_overlay(config.dataset_id)['ops'])
    return result


async def exploration(params):
    config = ExplorationDatasetRequest.model_validate(params)
    return await asyncio.to_thread(_explore,config)


class DiagramPreviewRequest(BaseModel):
    model_config = ConfigDict(extra='forbid', strict=True)
    dataset_id: str
    expressions: dict[str, str]
    include_qaqc: bool = False


def _diagram_preview(config):
    if not config.expressions or len(config.expressions) > 3 or set(config.expressions) - {'x', 'y', 'z'}:
        raise ValueError('Expresiones permitidas: x, y y z')
    df, hidden = overlay.get_effective_dataframe(config.dataset_id)
    visible = df.drop([c for c in hidden if c in df.columns])
    result = diagram_preview(visible, config.expressions, config.include_qaqc)
    result['dataset_id'] = config.dataset_id
    return result


async def diagram_preview_rpc(params):
    """Diagram Builder live check: parses each axis expression and reports columns used, valid count and range."""
    config = DiagramPreviewRequest.model_validate(params)
    return await asyncio.to_thread(_diagram_preview, config)


GEOCHEMISTRY_METHODS = {'geochemistry.catalog':catalog,'geochemistry.registry':registry,
                      'geochemistry.column_roles':column_roles,'geochemistry.set_column_role':set_column_role,'geochemistry.compute':compute,
                      'geochemistry.explore':exploration,'geochemistry.diagram_preview':diagram_preview_rpc}
