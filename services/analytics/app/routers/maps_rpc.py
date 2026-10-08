"""RPC for Secciones y mapas (phase 5): maps.sample_map and maps.section."""
import asyncio

from analysis.data import overlay, storage
from analysis.maps.sample_map import MapDatasetRequest, sample_map
from analysis.maps.section import SectionDatasetRequest, section


def _sample_map(config: MapDatasetRequest) -> dict:
    df, hidden = overlay.get_effective_dataframe(config.dataset_id)
    if any(c in hidden for c in (config.category_column, config.label_column) if c):
        raise ValueError('Una columna seleccionada está oculta; actualiza la selección')
    meta = storage.load_metadata(config.dataset_id)
    roles = {c['name']: c.get('role', 'unknown') for c in meta.get('columns', [])}
    result = sample_map(df, config.model_dump(exclude={'dataset_id'}), meta.get('spatial_config'), roles)
    result['dataset_id'] = config.dataset_id
    return result


async def sample_map_rpc(params):
    config = MapDatasetRequest.model_validate(params)
    return await asyncio.to_thread(_sample_map, config)


def _section(config: SectionDatasetRequest) -> dict:
    df, hidden = overlay.get_effective_dataframe(config.dataset_id)
    used = [config.category_column, config.label_column, config.elevation_column]
    if config.drill:
        d = config.drill
        used += [d.hole_column, d.from_column, d.to_column, d.depth_column, d.azimuth_column, d.dip_column]
    if any(c in hidden for c in used if c):
        raise ValueError('Una columna seleccionada está oculta; actualiza la selección')
    meta = storage.load_metadata(config.dataset_id)
    roles = {c['name']: c.get('role', 'unknown') for c in meta.get('columns', [])}
    result = section(df, config.model_dump(exclude={'dataset_id'}), meta.get('spatial_config'), roles)
    result['dataset_id'] = config.dataset_id
    return result


async def section_rpc(params):
    config = SectionDatasetRequest.model_validate(params)
    return await asyncio.to_thread(_section, config)


MAPS_METHODS = {'maps.sample_map': sample_map_rpc, 'maps.section': section_rpc}
