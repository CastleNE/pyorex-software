"""maps.sample_map: samples at their coordinates with a value/expression, categories and an optional IDW surface."""
import asyncio
import json
import re
from pathlib import Path

import polars as pl
import pytest

from analysis.data import overlay, storage
from analysis.maps.sample_map import coordinate_setup, sample_map
from app.routers.maps_rpc import sample_map_rpc

ROOT = Path(__file__).resolve().parents[3]
UTM = {'geometry_source': 'projected_xy', 'east_col': 'E', 'north_col': 'N', 'projected_epsg': 'EPSG:32718', 'projected_crs_label': 'UTM 18S'}


def _df():
    return pl.DataFrame({
        'Sample': ['a', 'b', 'c', 'd', 'e', 'f'],
        'E': [0.0, 100.0, 0.0, 100.0, 50.0, None],
        'N': [0.0, 0.0, 100.0, 100.0, 50.0, 10.0],
        'Cu': [10.0, 100.0, 1000.0, None, 50.0, 5.0],
        '_nulltype_Cu': [None, None, None, 'BELOW_LOD', None, None],
        'Zn': [5.0, 50.0, 0.0, 10.0, 25.0, 1.0],
        'Sector': ['A', 'A', 'B', None, 'B', 'A'],
        '__sample_type__': ['S', 'S', 'S', 'S', 'S', 'STD'],
    })


def test_points_keep_censored_samples_without_value_and_skip_controls_and_missing_coordinates():
    out = sample_map(_df(), {'value': 'Cu', 'category_column': 'Sector'}, UTM)
    assert out['quality'] == {'total': 6, 'mapped': 5, 'no_coordinates': 0, 'no_value': 1, 'excluded_qaqc': 1}
    by_id = {p['sample_id']: p for p in out['points']}
    assert set(by_id) == {'a', 'b', 'c', 'd', 'e'}
    assert by_id['d']['value'] is None and by_id['d']['reason'] and by_id['d']['category'] == 'Sin dato'
    assert by_id['b'] == {'row_index': 1, 'sample_id': 'b', 'x': 100.0, 'y': 0.0, 'value': 100.0, 'reason': None, 'category': 'A'}
    assert out['crs']['epsg'] == 32718 and out['crs']['interpolable'] and out['grid'] is None


def test_expressions_and_non_finite_results():
    out = sample_map(_df(), {'value': 'Cu/Zn'}, UTM)
    by_id = {p['sample_id']: p for p in out['points']}
    assert by_id['b']['value'] == pytest.approx(2.0)
    assert by_id['c']['value'] is None                       # division by zero is not a value
    assert out['value_columns'] == ['Cu', 'Zn']


def test_idw_surface_in_log10_is_back_transformed_and_stays_inside_the_hull():
    out = sample_map(_df(), {'value': 'Cu', 'idw': {'resolution': 21, 'log': True}}, UTM)
    g = out['grid']
    assert g['log'] is True and len(g['x']) == 21 and len(g['z']) == 21
    assert g['z'][0][0] == pytest.approx(10.0)               # exact at a sample location (a at 0,0)
    finite = [v for line in g['z'] for v in line if v is not None]
    assert min(finite) >= 10.0 - 1e-9 and max(finite) <= 1000.0 + 1e-6
    linear = sample_map(_df(), {'value': 'Cu', 'idw': {'resolution': 21}}, UTM)['grid']
    centre = 10                                              # sample e (50 ppm) sits at the grid centre
    assert linear['z'][centre][centre] == pytest.approx(50.0)


def test_coordinate_rules():
    with pytest.raises(ValueError, match='coordenadas'):
        coordinate_setup(None)
    geo = coordinate_setup({'geometry_source': 'wgs84_lonlat', 'lon_col': 'lon', 'lat_col': 'lat'})
    assert geo['geographic'] and not geo['interpolable']
    local = coordinate_setup({'geometry_source': 'local_grid', 'east_col': 'E', 'north_col': 'N'})
    assert local['interpolable'] and local['epsg'] is None
    df = _df().rename({'E': 'lon', 'N': 'lat'})
    with pytest.raises(ValueError, match='proyectadas'):
        sample_map(df, {'value': 'Cu', 'idw': {}}, {'geometry_source': 'wgs84_lonlat', 'lon_col': 'lon', 'lat_col': 'lat'})
    with pytest.raises(ValueError, match='valor'):
        sample_map(_df(), {'idw': {}}, UTM)


def test_rpc_matches_contract_and_bridge(tmp_path, monkeypatch):
    monkeypatch.setattr(storage, 'DATASETS_DIR', tmp_path)
    monkeypatch.setattr(overlay, 'DATASETS_DIR', tmp_path)
    ds = storage.save_dataset(_df(), 'mapa', {'spatial_config': UTM})
    out = asyncio.run(sample_map_rpc({'dataset_id': ds, 'value': 'Cu', 'idw': {'resolution': 15}}))
    contract = json.loads((ROOT / 'packages/ipc-contracts/maps/sample_map.v1.json').read_text(encoding='utf-8'))
    assert contract['method'] == 'maps.sample_map'
    assert set(out) == set(contract['response']['required'])
    assert all(set(p) == set(contract['response']['properties']['points']['items']['required']) for p in out['points'])
    bridge = (ROOT / 'apps/desktop/src-tauri/src/analytics_bridge.rs').read_text(encoding='utf-8')
    assert 'maps.sample_map' in set(re.findall(r'"([a-z_.]+)"', bridge[bridge.index('ALLOWED_RPC_METHODS'):]))
