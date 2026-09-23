"""``geochemistry.column_roles``: per-dataset column classification (Semantic Variable System v1), and the
allowed_roles constraints declared on scatter/histogram/ternary/downhole. Additive: geochemistry.catalog and the
27 other tools are unaffected — see test_geochemistry_registry_rpc.py for the Registry projection itself."""
import asyncio
import json
import re
from pathlib import Path

import polars as pl
import pytest

from analysis.geochemistry.registry import REGISTRY, get_tool
from analysis.geochemistry.semantics import SemanticRole
from app.routers import geochemistry_rpc
from app.routers.rpc import METHOD_REGISTRY

ROOT = Path(__file__).resolve().parents[3]
COLUMN_KEYS = {'column', 'semantic_role', 'analyte', 'unit', 'confidence', 'source'}


def _fake_dataset(monkeypatch, columns: dict[str, list], roles: dict[str, str] | None = None):
    """columns: {name: values}; roles: {name: 'assay_oxide'|...} mirroring storage.load_metadata()['columns']."""
    df = pl.DataFrame(columns)
    monkeypatch.setattr('analysis.data.overlay.get_effective_dataframe', lambda dataset_id: (df, set()))
    meta_columns = [{'name': name, 'role': (roles or {}).get(name, 'unknown')} for name in columns]
    monkeypatch.setattr('analysis.data.storage.load_metadata', lambda dataset_id: {'name': 'demo', 'columns': meta_columns})


# ── RPC wiring ───────────────────────────────────────────────────────────────────────────────
def test_method_is_registered_next_to_catalog_and_registry():
    assert METHOD_REGISTRY['geochemistry.column_roles'] is geochemistry_rpc.column_roles


def test_tauri_bridge_allowlist_accepts_the_new_method():
    rust = (ROOT / 'apps' / 'desktop' / 'src-tauri' / 'src' / 'analytics_bridge.rs').read_text(encoding='utf-8')
    allowed = set(re.findall(r'"([a-z_.]+)"', rust[rust.index('ALLOWED_RPC_METHODS'):]))
    assert 'geochemistry.column_roles' in allowed


def test_dataset_id_is_required():
    with pytest.raises(Exception):
        asyncio.run(geochemistry_rpc.column_roles({}))


def test_ipc_contract_describes_the_actual_response(monkeypatch):
    _fake_dataset(monkeypatch, {'Cu_ppm': [1.0], 'DHID': ['A']})
    response = asyncio.run(geochemistry_rpc.column_roles({'dataset_id': 'demo'}))
    contract = json.loads((ROOT / 'packages' / 'ipc-contracts' / 'geochemistry' / 'column_roles.v1.json').read_text(encoding='utf-8'))
    assert contract['method'] == 'geochemistry.column_roles'
    assert set(contract['response']['required']) == set(response)
    item = contract['response']['properties']['columns']['items']
    assert set(item['required']) == set(item['properties']) == COLUMN_KEYS
    assert item['properties']['semantic_role']['enum'] == [r.value for r in SemanticRole]
    for column in response['columns']:
        assert set(column) == COLUMN_KEYS


# ── Classification over a real (fake) dataset ───────────────────────────────────────────────────
def test_classifies_the_columns_of_a_dataset(monkeypatch):
    _fake_dataset(monkeypatch, {'Sample_ID': ['S1'], 'DHID': ['DH1'], 'Depth': [1.0], 'East_AMG84_z51': [500000.0],
                                'North_AMG84_z51': [8000000.0], 'SiO2_pct': [60.0], 'Cu_ppm': [120.0], '[Order]': [1]})
    response = asyncio.run(geochemistry_rpc.column_roles({'dataset_id': 'demo'}))
    roles = {c['column']: c['semantic_role'] for c in response['columns']}
    assert roles == {
        'Sample_ID': 'sample_id', 'DHID': 'hole_id', 'Depth': 'depth', 'East_AMG84_z51': 'easting',
        'North_AMG84_z51': 'northing', 'SiO2_pct': 'major_oxide', 'Cu_ppm': 'trace_element', '[Order]': 'row_index',
    }
    by_name = {c['column']: c for c in response['columns']}
    assert (by_name['Cu_ppm']['analyte'], by_name['Cu_ppm']['unit']) == ('Cu', 'ppm')
    assert response['dataset_id'] == 'demo'


def test_excludes_hidden_and_internal_columns_like_the_legacy_catalog(monkeypatch):
    _fake_dataset(monkeypatch, {'Cu_ppm': [1.0], 'internal_feature_id': [1], '_shadow': [1]})
    response = asyncio.run(geochemistry_rpc.column_roles({'dataset_id': 'demo'}))
    assert [c['column'] for c in response['columns']] == ['Cu_ppm']


def test_uses_the_existing_column_role_only_to_enrich_ambiguous_columns(monkeypatch):
    _fake_dataset(monkeypatch, {'Grade': [60.0]}, roles={'Grade': 'assay_oxide'})
    response = asyncio.run(geochemistry_rpc.column_roles({'dataset_id': 'demo'}))
    assert response['columns'][0]['semantic_role'] == 'major_oxide'
    assert response['columns'][0]['source'] == 'catalog'


def test_does_not_mutate_the_legacy_catalog_or_data_endpoints(monkeypatch):
    _fake_dataset(monkeypatch, {'Cu_ppm': [1.0]})
    from analysis.geochemistry.catalog import TOOLS
    before = len(TOOLS)
    asyncio.run(geochemistry_rpc.column_roles({'dataset_id': 'demo'}))
    assert len(TOOLS) == before


# ── Tool Registry: allowed_roles for the four target tools, backward compat for everyone else ────
MIGRATED_SEMANTIC_TOOLS = {'scatter', 'histogram', 'ternary', 'downhole'}


def test_only_the_four_target_tools_declare_role_restrictions():
    restricted = {s.id for s in REGISTRY if any(i.allowed_roles for i in s.inputs) or s.group_allowed_roles}
    assert restricted == MIGRATED_SEMANTIC_TOOLS


def test_every_other_tool_keeps_empty_allowed_roles_backward_compat():
    for spec in REGISTRY:
        if spec.id in MIGRATED_SEMANTIC_TOOLS:
            continue
        assert all(i.allowed_roles == () for i in spec.inputs)
        assert spec.group_allowed_roles == ()


def test_scatter_is_permissive_for_geochemically_numeric_variables_including_depth_and_coordinates():
    scatter = get_tool('scatter')
    for input_spec in scatter.inputs:
        allowed = set(input_spec.allowed_roles)
        assert {SemanticRole.MAJOR_OXIDE, SemanticRole.TRACE_ELEMENT, SemanticRole.DEPTH, SemanticRole.EASTING,
                SemanticRole.LONGITUDE, SemanticRole.LATITUDE, SemanticRole.NUMERIC_GENERIC} <= allowed
        assert not allowed & {SemanticRole.SAMPLE_ID, SemanticRole.HOLE_ID, SemanticRole.ROW_INDEX,
                              SemanticRole.CATEGORICAL, SemanticRole.UNKNOWN}


def test_histogram_excludes_identifiers_and_row_index_but_allows_ordinary_numeric_variables():
    histogram = get_tool('histogram')
    allowed = set(histogram.inputs[0].allowed_roles)
    assert SemanticRole.NUMERIC_GENERIC in allowed
    assert {SemanticRole.LONGITUDE, SemanticRole.LATITUDE} <= allowed
    assert not allowed & {SemanticRole.SAMPLE_ID, SemanticRole.HOLE_ID, SemanticRole.ROW_INDEX}


def test_ternary_excludes_order_identifiers_coordinates_lat_lon_and_depth():
    ternary = get_tool('ternary')
    for input_spec in ternary.inputs:
        allowed = set(input_spec.allowed_roles)
        assert allowed == {SemanticRole.MAJOR_OXIDE, SemanticRole.TRACE_ELEMENT, SemanticRole.REE, SemanticRole.ASSAY,
                           SemanticRole.RATIO}
        assert not allowed & {SemanticRole.NUMERIC_GENERIC, SemanticRole.SAMPLE_ID, SemanticRole.HOLE_ID,
                              SemanticRole.ROW_INDEX, SemanticRole.EASTING, SemanticRole.NORTHING,
                              SemanticRole.ELEVATION, SemanticRole.LONGITUDE, SemanticRole.LATITUDE,
                              SemanticRole.DEPTH, SemanticRole.DEPTH_FROM, SemanticRole.DEPTH_TO}


def test_row_index_is_not_permitted_anywhere_yet():
    for tool_id in ('scatter', 'histogram', 'ternary', 'downhole'):
        for input_spec in get_tool(tool_id).inputs:
            assert SemanticRole.ROW_INDEX not in input_spec.allowed_roles, (tool_id, input_spec.key)


def test_downhole_depth_selector_accepts_only_depth_family_roles():
    depth_input = next(i for i in get_tool('downhole').inputs if i.key == 'Depth')
    assert set(depth_input.allowed_roles) == {SemanticRole.DEPTH, SemanticRole.DEPTH_FROM, SemanticRole.DEPTH_TO}


def test_downhole_value_selector_accepts_numeric_geological_variables():
    value_input = next(i for i in get_tool('downhole').inputs if i.key == 'Value')
    assert set(value_input.allowed_roles) == {SemanticRole.ASSAY, SemanticRole.TRACE_ELEMENT, SemanticRole.REE,
                                              SemanticRole.MAJOR_OXIDE, SemanticRole.RATIO, SemanticRole.NUMERIC_GENERIC}


def test_downhole_group_selector_prioritizes_hole_id():
    assert get_tool('downhole').group_allowed_roles == (SemanticRole.HOLE_ID,)
