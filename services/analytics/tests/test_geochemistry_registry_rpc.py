"""``geochemistry.registry``: the additive, read-only projection of the Tool Registry used by the DIAGRAMS navigation.

The legacy ``geochemistry.catalog`` keeps its contract (see test_geochemistry_catalog_contract.py); here we only prove
that the new method exists next to it, serves the classification correctly and touches nothing.
"""
import asyncio
import copy
import json
import re
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from analysis.geochemistry import catalog
from analysis.geochemistry.registry import REGISTRY, Capability
from analysis.geochemistry.registry_view import registry_view
from app.routers import geochemistry_rpc
from app.routers.rpc import METHOD_REGISTRY

ROOT = Path(__file__).resolve().parents[3]
GOLDEN_CATALOG = json.loads((Path(__file__).with_name('golden') / 'geochemistry_catalog.json').read_text(encoding='utf-8'))
TOOL_KEYS = {'id', 'label', 'module', 'family', 'status', 'capabilities', 'renderer'}

DIAGRAMS_NAVIGATION = {
    'distribution': ['histogram', 'boxplot', 'qq-normal', 'probability', 'ecdf'],
    'xy': ['scatter', 'line'],
    'compositional': ['ternary'],
    'profiles': ['downhole'],
}
REMOVED_FROM_DIAGRAMS = [
    'assay-compare', 'assay-difference', 'downhole-compare', 'harker', 'tas', 'qapf', 'afm', 'k2o-sio2', 'mali', 'fe-index',
    'shand-index', 'a-cnk', 'a-nk', 'ree-normalization', 'primitive-mantle', 'element-ratios', 'fertility-sr-y',
    'fertility-la-yb', 'fertility-dy-yb', 'fertility-eu-eu', 'fertility-ce-ce', 'alteration',
]


@pytest.fixture(scope='module')
def view():
    return asyncio.run(geochemistry_rpc.registry({}))


def by_id(view):
    return {t['id']: t for t in view['tools']}


def test_method_is_registered_next_to_the_legacy_catalog():
    assert METHOD_REGISTRY['geochemistry.registry'] is geochemistry_rpc.registry
    assert METHOD_REGISTRY['geochemistry.catalog'] is geochemistry_rpc.catalog


def test_registry_method_is_reachable_through_the_http_rpc_endpoint():
    from app.main import app
    with TestClient(app, base_url='http://localhost') as client:
        response = client.post('/rpc', json={'jsonrpc': '2.0', 'id': '1', 'method': 'geochemistry.registry', 'params': {}})
    body = response.json()
    assert response.status_code == 200 and body['error'] is None
    assert body['result'] == registry_view()


def test_tauri_bridge_allowlist_accepts_the_new_method():
    rust = (ROOT / 'apps' / 'desktop' / 'src-tauri' / 'src' / 'analytics_bridge.rs').read_text(encoding='utf-8')
    allowed = set(re.findall(r'"([a-z_.]+)"', rust[rust.index('ALLOWED_RPC_METHODS'):]))
    assert {'geochemistry.registry', 'geochemistry.catalog', 'geochemistry.compute', 'geochemistry.explore'} <= allowed


def test_method_takes_no_parameters():
    with pytest.raises(Exception):
        asyncio.run(geochemistry_rpc.registry({'dataset_id': 'x'}))


def test_returns_the_31_registry_tools_with_unique_ids(view):
    ids = [t['id'] for t in view['tools']]
    assert len(ids) == 31 and len(set(ids)) == 31
    assert set(ids) == {s.id for s in REGISTRY} == {t['id'] for t in GOLDEN_CATALOG}
    assert view['schema_version'] == 1


def test_every_tool_has_exactly_the_documented_keys_and_json_safe_values(view):
    for tool in view['tools']:
        assert set(tool) == TOOL_KEYS, tool['id']
        assert all(isinstance(tool[k], str) and tool[k] for k in ('id', 'label', 'module', 'family', 'status', 'renderer'))
        assert isinstance(tool['capabilities'], list) and all(isinstance(c, str) for c in tool['capabilities'])
    assert json.loads(json.dumps(view)) == view    # plain data, no python objects


def test_no_bibliographic_or_calculation_metadata_leaks(view):
    assert set(view) == {'schema_version', 'tools'}
    keys = {key for tool in view['tools'] for key in tool}
    assert not keys & {'handler_id', 'calculation', 'reference', 'formula', 'legacy_text', 'parameters', 'aliases', 'inputs'}


def test_projection_matches_the_registry_field_by_field(view):
    projected = by_id(view)
    for spec in REGISTRY:
        tool = projected[spec.id]
        assert (tool['label'], tool['module'], tool['family'], tool['status'], tool['renderer']) == (
            spec.label, spec.module.value, spec.family.value, spec.status.value, spec.renderer.value)
        assert set(tool['capabilities']) == {c.value for c in spec.capabilities}
        assert all(Capability(c) for c in tool['capabilities'])


def test_module_counts(view):
    counts = {}
    for tool in view['tools']:
        counts[tool['module']] = counts.get(tool['module'], 0) + 1
    assert counts == {'data_analysis': 4, 'diagrams': 9, 'lithogeochemistry': 14, 'exploration': 4}
    assert {t['status'] for t in view['tools']} == {'implemented'}


def test_diagrams_contains_exactly_the_nine_implemented_tools_grouped_by_family(view):
    diagrams = [t for t in view['tools'] if t['module'] == 'diagrams' and t['status'] == 'implemented']
    assert len(diagrams) == 9
    grouped = {}
    for tool in diagrams:
        grouped.setdefault(tool['family'], []).append(tool['id'])
    assert grouped == DIAGRAMS_NAVIGATION
    assert list(grouped) == list(DIAGRAMS_NAVIGATION)     # families arrive in canonical navigation order


def test_tools_removed_from_diagrams_belong_to_another_module(view):
    projected = by_id(view)
    for tool_id in REMOVED_FROM_DIAGRAMS:
        assert projected[tool_id]['module'] != 'diagrams', tool_id


def test_owning_modules_of_the_relocated_tools(view):
    projected = by_id(view)
    assert {projected[i]['module'] for i in ('assay-compare', 'assay-difference', 'downhole-compare', 'element-ratios')} == {'data_analysis'}
    assert {projected[i]['module'] for i in ('fertility-sr-y', 'fertility-la-yb', 'fertility-dy-yb', 'alteration')} == {'exploration'}
    assert projected['harker']['module'] == projected['tas']['module'] == 'lithogeochemistry'


def test_diagram_labels_used_by_the_navigation(view):
    labels = {t['id']: t['label'] for t in view['tools']}
    assert labels['scatter'] == 'Dispersión XY' and labels['line'] == 'Líneas XY'
    assert labels['histogram'] == 'Histograma' and labels['boxplot'] == 'Tukey · cajas y bigotes'
    assert labels['qq-normal'] == 'Q–Q normal' and labels['ternary'] == 'Ternario ABC'


def test_capabilities_are_ordered_deterministically(view):
    order = [c.value for c in Capability]
    for tool in view['tools']:
        assert tool['capabilities'] == sorted(tool['capabilities'], key=order.index)
    assert registry_view() == view                          # pure: two calls give the same answer


def test_every_ordered_tool_id_used_for_navigation_exists():
    from analysis.geochemistry.registry_view import _TOOL_NAV_ORDER
    assert set(_TOOL_NAV_ORDER) <= {s.id for s in REGISTRY} and len(set(_TOOL_NAV_ORDER)) == len(_TOOL_NAV_ORDER)


def test_calling_the_registry_does_not_change_the_legacy_catalog(view):
    before = copy.deepcopy(catalog.TOOLS)
    asyncio.run(geochemistry_rpc.registry({}))
    assert catalog.TOOLS == before == GOLDEN_CATALOG
    assert len(catalog.TOOLS) == 31
    assert [t['id'] for t in catalog.TOOLS] == [t['id'] for t in GOLDEN_CATALOG]      # legacy order, not navigation order


def test_legacy_catalog_response_is_untouched_by_the_new_method():
    import polars as pl
    from analysis.data import overlay, storage
    original = (overlay.get_effective_dataframe, storage.load_metadata)
    try:
        overlay.get_effective_dataframe = lambda dataset_id: (pl.DataFrame({'SiO2': [1.0], 'note': ['a']}), set())
        storage.load_metadata = lambda dataset_id: {'name': 'demo'}
        response = asyncio.run(geochemistry_rpc.catalog({'dataset_id': 'demo'}))
    finally:
        overlay.get_effective_dataframe, storage.load_metadata = original
    assert set(response) == {'tools', 'columns', 'dataset_id', 'dataset_name'}
    assert response['tools'] == GOLDEN_CATALOG
    assert response['columns'] == [{'name': 'SiO2', 'numeric': True}, {'name': 'note', 'numeric': False}]


def test_frontend_fixture_is_exactly_what_the_backend_serves():
    """Contract between both sides: apps/desktop/src/lib/fixtures/geochemistry-registry.json feeds the frontend tests.

    If the registry projection changes, regenerate the fixture (json.dumps(registry_view(), indent=1, ensure_ascii=False)).
    """
    fixture = ROOT / 'apps' / 'desktop' / 'src' / 'lib' / 'fixtures' / 'geochemistry-registry.json'
    assert json.loads(fixture.read_text(encoding='utf-8')) == registry_view()


def test_ipc_contract_describes_the_actual_response(view):
    from analysis.geochemistry.registry import Module, Status
    contract = json.loads((ROOT / 'packages' / 'ipc-contracts' / 'geochemistry' / 'registry.v1.json').read_text(encoding='utf-8'))
    assert contract['method'] == 'geochemistry.registry' and contract['version'] == 'v1'
    assert contract['request']['additionalProperties'] is False and contract['request']['properties'] == {}
    response = contract['response']
    assert set(response['required']) == set(view) and response['properties']['schema_version']['const'] == view['schema_version']
    item = response['properties']['tools']['items']
    assert set(item['required']) == set(item['properties']) == TOOL_KEYS and item['additionalProperties'] is False
    assert item['properties']['module']['enum'] == [m.value for m in Module]
    assert item['properties']['status']['enum'] == [s.value for s in Status]
    assert all(t['module'] in item['properties']['module']['enum'] and t['status'] in item['properties']['status']['enum'] for t in view['tools'])
