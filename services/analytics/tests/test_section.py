"""maps.section: projection onto A–A', drill holes along straight traces, DEM reading and sampling."""
import asyncio
import json
import math
import re
from pathlib import Path

import numpy as np
import polars as pl
import pytest

from analysis.data import overlay, storage
from analysis.maps.dem import _read_asc, load_dem
from analysis.maps.section import section
from app.routers.maps_rpc import section_rpc

ROOT = Path(__file__).resolve().parents[3]
UTM = {'geometry_source': 'projected_xy', 'east_col': 'E', 'north_col': 'N', 'projected_epsg': 'EPSG:32718'}


def _write_asc(path, z0=1000.0):
    # 5 x 4 cells of 100 m, z = z0 + x/10 (plane rising to the east), lower-left corner at (0, 0)
    lines = ['ncols 5', 'nrows 4', 'xllcorner 0', 'yllcorner 0', 'cellsize 100', 'NODATA_value -9999']
    for r in range(4):
        lines.append(' '.join(str(z0 + (50 + 100 * c) / 10) for c in range(5)))
    path.write_text('\n'.join(lines) + '\n', encoding='utf-8')
    return str(path)


def test_surface_samples_are_projected_onto_the_line_and_filtered_by_width():
    df = pl.DataFrame({'S': ['a', 'b', 'c', 'd'], 'E': [100.0, 200.0, 300.0, 900.0], 'N': [10.0, -40.0, 300.0, 0.0],
                       'Z': [500.0, 510.0, 520.0, 530.0], 'Cu': [10.0, 20.0, 30.0, 40.0]})
    out = section(df, {'start': [0, 0], 'end': [1000, 0], 'width': 100, 'value': 'Cu', 'elevation_column': 'Z'}, UTM)
    by = {p['sample_id']: p for p in out['points']}
    assert set(by) == {'a', 'b', 'd'}                                   # c is 300 m away, the band is ±50 m
    assert by['a']['distance'] == pytest.approx(100) and by['a']['offset'] == pytest.approx(-10)   # north of an eastward line = left
    assert by['b']['offset'] == pytest.approx(40) and by['b']['z'] == 510.0
    assert out['line']['azimuth'] == pytest.approx(90) and out['line']['length'] == pytest.approx(1000)
    assert out['topography_source'] == 'samples' and [t for t, _ in out['topography']] == [100.0, 200.0, 900.0]
    assert out['quality']['outside'] == 1


def test_drill_intervals_follow_a_straight_inclined_hole():
    df = pl.DataFrame({'H': ['DDH1'] * 3, 'E': [0.0] * 3, 'N': [0.0] * 3, 'Z': [1000.0] * 3,
                       'FROM': [0.0, 10.0, 20.0], 'TO': [10.0, 20.0, 30.0], 'AZ': [90.0] * 3, 'DIP': [-60.0] * 3, 'Cu': [1.0, 2.0, 3.0]})
    req = {'start': [-100, 0], 'end': [100, 0], 'width': 50, 'value': 'Cu', 'elevation_column': 'Z',
           'drill': {'hole_column': 'H', 'from_column': 'FROM', 'to_column': 'TO', 'azimuth_column': 'AZ', 'dip_column': 'DIP'}}
    out = section(df, req, UTM)
    p = out['points'][1]                                                # mid depth 15 m
    assert p['distance'] == pytest.approx(100 + 15 * math.cos(math.radians(60)))
    assert p['z'] == pytest.approx(1000 - 15 * math.sin(math.radians(60)))
    (h,) = out['holes']
    assert h['collar_distance'] == pytest.approx(100) and h['max_depth'] == 30
    assert h['end_z'] == pytest.approx(1000 - 30 * math.sin(math.radians(60)))
    req['drill'] = {'hole_column': 'H', 'from_column': 'FROM', 'to_column': 'TO', 'dip': 60}      # positive dip still goes down
    assert section(df, req, UTM)['points'][0]['z'] == pytest.approx(1000 - 5 * math.sin(math.radians(60)))


def test_dem_ascii_reading_bilinear_sampling_and_topography(tmp_path):
    path = _write_asc(tmp_path / 'dem.asc')
    dem = _read_asc(path)
    assert dem.z.shape == (4, 5) and dem.x0 == 50 and dem.y0 == 350
    assert dem.sample(np.array([125.0]), np.array([200.0]))[0] == pytest.approx(1012.5)
    assert math.isnan(dem.sample(np.array([10.0]), np.array([200.0]))[0])     # outside the cell centres
    df = pl.DataFrame({'S': ['a'], 'E': [250.0], 'N': [200.0], 'Cu': [5.0]})
    out = section(df, {'start': [50, 200], 'end': [450, 200], 'width': 20, 'value': 'Cu', 'dem_path': path}, UTM)
    assert out['points'][0]['z'] == pytest.approx(1025.0)               # elevation from the DEM
    assert out['topography_source'] == 'dem' and out['topography'][0] == [0.0, pytest.approx(1005.0)]
    assert any('no declara sistema' in w for w in out['warnings'])
    with pytest.raises(ValueError, match='ruta completa'):
        load_dem('dem.asc')
    with pytest.raises(ValueError, match='No existe'):
        load_dem(str(tmp_path / 'missing.asc'))


def test_rules():
    df = pl.DataFrame({'E': [0.0], 'N': [0.0]})
    with pytest.raises(ValueError, match='dos puntos'):
        section(df, {'start': [1, 1], 'end': [1, 1]}, UTM)
    with pytest.raises(ValueError, match='proyectadas'):
        section(df.rename({'E': 'lon', 'N': 'lat'}), {'start': [0, 0], 'end': [1, 1]}, {'geometry_source': 'wgs84_lonlat', 'lon_col': 'lon', 'lat_col': 'lat'})
    with pytest.raises(ValueError, match='Desde y Hasta'):
        section(df, {'start': [0, 0], 'end': [1, 1], 'drill': {'hole_column': 'E'}}, UTM)


def test_rpc_matches_contract_and_bridge(tmp_path, monkeypatch):
    monkeypatch.setattr(storage, 'DATASETS_DIR', tmp_path)
    monkeypatch.setattr(overlay, 'DATASETS_DIR', tmp_path)
    ds = storage.save_dataset(pl.DataFrame({'S': ['a', 'b'], 'E': [10.0, 20.0], 'N': [0.0, 5.0], 'Z': [1.0, 2.0], 'Cu': [1.0, 2.0]}), 'sec', {'spatial_config': UTM})
    out = asyncio.run(section_rpc({'dataset_id': ds, 'start': [0, 0], 'end': [30, 0], 'width': 20, 'value': 'Cu', 'elevation_column': 'Z'}))
    contract = json.loads((ROOT / 'packages/ipc-contracts/maps/section.v1.json').read_text(encoding='utf-8'))
    assert contract['method'] == 'maps.section'
    assert set(out) == set(contract['response']['required'])
    assert all(set(p) == set(contract['response']['properties']['points']['items']['required']) for p in out['points'])
    bridge = (ROOT / 'apps/desktop/src-tauri/src/analytics_bridge.rs').read_text(encoding='utf-8')
    assert 'maps.section' in set(re.findall(r'"([a-z_.]+)"', bridge[bridge.index('ALLOWED_RPC_METHODS'):]))


def test_geotiff_dem_georeference_and_crs(tmp_path):
    tifffile = pytest.importorskip('tifffile')
    z = np.array([[100.0, 110.0, 120.0], [200.0, 210.0, 220.0]], dtype='float32')
    keys = (1, 1, 0, 3, 1024, 0, 1, 1, 1025, 0, 1, 1, 3072, 0, 1, 32718)     # projected, PixelIsArea, EPSG:32718
    path = tmp_path / 'dem.tif'
    tifffile.imwrite(path, z, extratags=[(33550, 'd', 3, (10.0, 10.0, 0.0)), (33922, 'd', 6, (0.0, 0.0, 0.0, 500.0, 1000.0, 0.0)),
                                         (34735, 'H', len(keys), keys)])
    dem = load_dem(str(path))
    assert dem.epsg == 32718 and dem.x0 == 505.0 and dem.y0 == 995.0
    assert dem.sample(np.array([515.0]), np.array([995.0]))[0] == pytest.approx(110.0)
    assert dem.sample(np.array([510.0]), np.array([990.0]))[0] == pytest.approx(155.0)
    df = pl.DataFrame({'E': [515.0], 'N': [995.0]})
    with pytest.raises(ValueError, match='no reproyecta'):
        section(df, {'start': [505, 995], 'end': [525, 995], 'dem_path': str(path)}, {**UTM, 'projected_epsg': 'EPSG:32719'})
