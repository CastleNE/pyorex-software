import asyncio

from pydantic import BaseModel, ConfigDict

from analysis.data import overlay, storage
from analysis.geochemistry.catalog import TOOLS
from analysis.geochemistry.engine import calculate
from analysis.geochemistry.models import DatasetRequest
from analysis.geochemistry.registry_view import registry_view
from analysis.geochemistry.semantics import classification_to_dict, classify_column_with_hint
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
    existing_role = {c['name']: c.get('role') for c in storage.load_metadata(dataset_id)['columns']}
    columns = []
    for name, dtype in df.schema.items():
        if name in hidden or name.startswith('_') or name == 'internal_feature_id':
            continue
        classification = classify_column_with_hint(name, dtype.is_numeric(), existing_role.get(name))
        columns.append(classification_to_dict(classification))
    return {'dataset_id': dataset_id, 'columns': columns}


async def column_roles(params):
    config = ColumnRolesRequest.model_validate(params)
    return await asyncio.to_thread(_column_roles, config.dataset_id)


def _compute(config):
    df, _hidden = overlay.get_effective_dataframe(config.dataset_id)
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


GEOCHEMISTRY_METHODS = {'geochemistry.catalog':catalog,'geochemistry.registry':registry,
                      'geochemistry.column_roles':column_roles,'geochemistry.compute':compute,
                      'geochemistry.explore':exploration}
