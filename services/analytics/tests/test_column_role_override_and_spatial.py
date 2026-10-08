"""User correction of semantic roles (geochemistry.set_column_role) and CRS assignment (data.set_spatial_config).
Both only touch dataset metadata: values are never read differently or changed."""
import asyncio
import json
from pathlib import Path

import polars as pl
import pytest

from analysis.data import overlay, storage
from analysis.geochemistry.semantics import (
    ColumnClassification,
    Confidence,
    SemanticRole,
    validate_override,
    with_override,
)
from app.routers import geochemistry_rpc
from app.routers.rpc import METHOD_REGISTRY

ROOT = Path(__file__).resolve().parents[3]


@pytest.fixture(autouse=True)
def isolated_datasets_dir(tmp_path, monkeypatch):
    datasets_dir = tmp_path / 'datasets'
    monkeypatch.setattr(storage, 'DATASETS_DIR', datasets_dir)
    monkeypatch.setattr(overlay, 'DATASETS_DIR', datasets_dir)
    yield datasets_dir


def _dataset() -> str:
    df = pl.DataFrame({'Muestra': ['A', 'B'], 'Var7': [1.0, 2.0], 'SiO2_pct': [50.0, 60.0], 'Este': [450000.0, 451000.0],
                       'Norte': [8830000.0, 8831000.0], 'Lito': ['x', 'y']})
    return storage.save_dataset(df, name='demo', meta_extra={})


def _roles(ds):
    return {c['column']: c for c in asyncio.run(geochemistry_rpc.column_roles({'dataset_id': ds}))['columns']}


# ── semantics (pure) ─────────────────────────────────────────────────────────
def test_validate_override_accepts_vocabulary_and_rejects_nonsense():
    assert validate_override('ree', 'La') == (SemanticRole.REE, 'La')
    assert validate_override('categorical', None) == (SemanticRole.CATEGORICAL, None)
    with pytest.raises(ValueError):
        validate_override('ree', 'SiO2')
    with pytest.raises(ValueError):
        validate_override('categorical', 'Cu')
    with pytest.raises(ValueError):
        validate_override('not_a_role', None)


def test_override_wins_with_user_source_and_keeps_a_compatible_analyte():
    base = ColumnClassification('Cu_ppm', SemanticRole.TRACE_ELEMENT, analyte='Cu', unit='ppm', confidence=Confidence.HIGH, source='name')
    out = with_override(base, {'semantic_role': 'assay'})
    assert (out.semantic_role, out.analyte, out.unit, out.confidence, out.source) == (SemanticRole.ASSAY, 'Cu', 'ppm', Confidence.HIGH, 'user')
    assert with_override(base, {'semantic_role': 'categorical'}).analyte is None
    assert with_override(base, None) is base


def test_spanish_coordinate_names_are_recognised_as_whole_tokens():
    from analysis.geochemistry.semantics import classify_column
    for name, role in [('Este', 'easting'), ('UTM_Este', 'easting'), ('Norte_PSAD56', 'northing'), ('norte (m)', 'northing')]:
        assert classify_column(name, True).semantic_role.value == role
    for name in ('Oeste_flag', 'Nordeste'):
        assert classify_column(name, True).semantic_role.value not in ('easting', 'northing')


# ── RPC ──────────────────────────────────────────────────────────────────────
def test_set_column_role_is_stored_applied_and_removable():
    ds = _dataset()
    assert _roles(ds)['Var7']['semantic_role'] == 'numeric_generic'
    out = asyncio.run(geochemistry_rpc.set_column_role({'dataset_id': ds, 'column': 'Var7', 'semantic_role': 'trace_element', 'analyte': 'Cu'}))
    var7 = {c['column']: c for c in out['columns']}['Var7']
    assert (var7['semantic_role'], var7['analyte'], var7['source'], var7['confidence']) == ('trace_element', 'Cu', 'user', 'high')
    assert storage.load_metadata(ds)['semantic_overrides'] == {'Var7': {'semantic_role': 'trace_element', 'analyte': 'Cu'}}
    asyncio.run(geochemistry_rpc.set_column_role({'dataset_id': ds, 'column': 'Var7', 'semantic_role': None}))
    assert _roles(ds)['Var7']['source'] != 'user'
    assert storage.load_dataset(ds)['Var7'].to_list() == [1.0, 2.0]          # data untouched


def test_set_column_role_rejects_unknown_columns_and_bad_analytes():
    ds = _dataset()
    with pytest.raises(ValueError):
        asyncio.run(geochemistry_rpc.set_column_role({'dataset_id': ds, 'column': 'Nope', 'semantic_role': 'ree'}))
    with pytest.raises(ValueError):
        asyncio.run(geochemistry_rpc.set_column_role({'dataset_id': ds, 'column': 'Var7', 'semantic_role': 'ree', 'analyte': 'Cu'}))


def test_stale_override_never_breaks_classification():
    ds = _dataset()
    storage.update_metadata(ds, {'semantic_overrides': {'Var7': {'semantic_role': 'gone_role'}}})
    assert _roles(ds)['Var7']['semantic_role'] == 'numeric_generic'


def test_set_spatial_config_requires_a_projected_crs_for_east_north():
    ds = _dataset()
    rpc = METHOD_REGISTRY['data.set_spatial_config']
    out = rpc({'dataset_id': ds, 'geometry_source': 'projected_xy', 'east_col': 'Este', 'north_col': 'Norte', 'projected_epsg': 'EPSG:32718'})
    sc = out['dataset']['spatial_config']
    assert sc['projected_epsg'] == 'EPSG:32718' and 'UTM zone 18S' in sc['projected_crs_label']
    assert out['dataset']['spatial_status'] == 'ok'
    with pytest.raises(ValueError, match='proyectado'):
        rpc({'dataset_id': ds, 'geometry_source': 'projected_xy', 'east_col': 'Este', 'north_col': 'Norte', 'projected_epsg': 'EPSG:4326'})
    with pytest.raises(ValueError, match='no es numérica'):
        rpc({'dataset_id': ds, 'geometry_source': 'projected_xy', 'east_col': 'Lito', 'north_col': 'Norte', 'projected_epsg': 'EPSG:32718'})
    with pytest.raises(ValueError):
        rpc({'dataset_id': ds, 'geometry_source': 'projected_xy', 'east_col': 'Este', 'north_col': 'Norte', 'projected_epsg': 'EPSG:999999'})
    cleared = rpc({'dataset_id': ds, 'geometry_source': 'none'})['dataset']
    assert cleared['spatial_config']['projected_epsg'] is None and cleared['spatial_status'] == 'no_coordinates'
    assert storage.load_dataset(ds)['Este'].to_list() == [450000.0, 451000.0]   # never reprojected


def test_new_methods_have_contracts_and_are_allowlisted():
    import re
    rust = (ROOT / 'apps/desktop/src-tauri/src/analytics_bridge.rs').read_text(encoding='utf-8')
    allowed = set(re.findall(r'"([a-z_.]+)"', rust[rust.index('ALLOWED_RPC_METHODS'):]))
    for method, file in [('geochemistry.set_column_role', 'geochemistry/set_column_role.v1.json'), ('data.set_spatial_config', 'data/set_spatial_config.v1.json')]:
        assert method in METHOD_REGISTRY and method in allowed
        assert json.loads((ROOT / 'packages/ipc-contracts' / file).read_text(encoding='utf-8'))['method'] == method
