"""Freezes the CURRENT contract of ``analysis.geochemistry.catalog.TOOLS`` (Phase 1A).

When ``catalog.py`` is later generated from the Tool Registry it must stay backward compatible with this file:
the same 31 ids in the same order, and for each of them exactly the same ``label``, ``group``, ``inputs``,
``kind``, ``unit``, ``formula``, ``reference`` and ``optional_inputs``. Additional keys may be added by a later
phase (the IPC contract only lists required fields), but no existing key may change or disappear.

``tests/golden/geochemistry_catalog.json`` is a plain dump of ``TOOLS`` taken at the baseline
(``json.dumps(TOOLS, indent=1, ensure_ascii=False)``). The id list and the group counts below are typed by hand
so the golden file is not the only witness.
"""
import json
from pathlib import Path

import polars as pl
import pytest

from analysis.geochemistry.catalog import BY_ID, TOOLS

ROOT = Path(__file__).resolve().parents[3]
FROZEN = json.loads((Path(__file__).with_name('golden') / 'geochemistry_catalog.json').read_text(encoding='utf-8'))
CONTRACT_KEYS = {'id', 'label', 'group', 'inputs', 'kind', 'unit', 'formula', 'reference', 'optional_inputs'}

EXPECTED_IDS = [
    'line', 'qq-normal', 'probability', 'ecdf', 'assay-compare', 'assay-difference', 'downhole', 'downhole-compare',
    'scatter', 'histogram', 'boxplot', 'ternary', 'harker',
    'tas', 'qapf', 'afm', 'k2o-sio2', 'mali', 'fe-index', 'shand-index', 'a-cnk', 'a-nk', 'ree-normalization',
    'primitive-mantle', 'element-ratios', 'fertility-sr-y', 'fertility-la-yb', 'fertility-dy-yb', 'fertility-eu-eu',
    'fertility-ce-ce',
    'alteration',
]
EXPECTED_GROUP_COUNTS = {'diagrams': 13, 'lithogeochemistry': 17, 'mineral-exploration': 1}
EXPECTED_KINDS = {
    'line': 'line', 'qq-normal': 'qq', 'probability': 'probability', 'ecdf': 'ecdf', 'assay-compare': 'assay',
    'assay-difference': 'difference', 'downhole': 'downhole', 'downhole-compare': 'downhole', 'scatter': 'scatter',
    'histogram': 'histogram', 'boxplot': 'box', 'ternary': 'ternary', 'harker': 'scatter', 'tas': 'scatter',
    'qapf': 'qapf', 'afm': 'ternary', 'k2o-sio2': 'scatter', 'mali': 'scatter', 'fe-index': 'scatter',
    'shand-index': 'scatter', 'a-cnk': 'scatter', 'a-nk': 'scatter', 'ree-normalization': 'spider',
    'primitive-mantle': 'spider', 'element-ratios': 'scatter', 'fertility-sr-y': 'scatter',
    'fertility-la-yb': 'scatter', 'fertility-dy-yb': 'scatter', 'fertility-eu-eu': 'scatter',
    'fertility-ce-ce': 'scatter', 'alteration': 'scatter',
}
EXPECTED_UNITS_OTHER_THAN_PCT_OR_RAW = {
    'ree-normalization': 'ppm', 'primitive-mantle': 'ppm', 'element-ratios': 'ppm', 'fertility-sr-y': 'ppm',
    'fertility-la-yb': 'ppm', 'fertility-dy-yb': 'ppm', 'fertility-eu-eu': 'ppm', 'fertility-ce-ce': 'ppm',
}


def test_catalog_has_exactly_the_31_expected_ids_in_order():
    assert [t['id'] for t in TOOLS] == EXPECTED_IDS
    assert len(EXPECTED_IDS) == len(set(EXPECTED_IDS)) == 31
    assert set(BY_ID) == set(EXPECTED_IDS)


def test_catalog_entries_have_exactly_the_contract_keys():
    for tool in TOOLS:
        assert set(tool) == CONTRACT_KEYS, tool['id']


def test_catalog_matches_the_frozen_dump_field_by_field():
    assert len(FROZEN) == len(TOOLS) == 31
    for frozen, current in zip(FROZEN, TOOLS):
        assert current['id'] == frozen['id']
        for key in ('label', 'group', 'inputs', 'kind', 'unit', 'formula', 'reference', 'optional_inputs'):
            assert current[key] == frozen[key], f"{frozen['id']}.{key}"


def test_groups_kinds_and_units_are_the_documented_ones():
    counts = {}
    for tool in TOOLS:
        counts[tool['group']] = counts.get(tool['group'], 0) + 1
    assert counts == EXPECTED_GROUP_COUNTS
    assert {t['id']: t['kind'] for t in TOOLS} == EXPECTED_KINDS
    others = {t['id']: t['unit'] for t in TOOLS if t['unit'] not in ('pct', 'raw')}
    assert others == EXPECTED_UNITS_OTHER_THAN_PCT_OR_RAW
    assert {t['unit'] for t in TOOLS} == {'pct', 'ppm', 'raw'}


def test_optional_inputs_only_for_the_two_spider_tools():
    assert [t['id'] for t in TOOLS if t['optional_inputs']] == ['ree-normalization', 'primitive-mantle']
    assert [len(t['inputs']) for t in TOOLS if t['optional_inputs']] == [14, 26]


def test_inputs_are_the_documented_keys():
    assert BY_ID['scatter']['inputs'] == ['X', 'Y']
    assert BY_ID['harker']['inputs'] == ['SiO2', 'Oxide']
    assert BY_ID['element-ratios']['inputs'] == ['numerator', 'denominator']
    assert BY_ID['downhole-compare']['inputs'] == ['Depth', 'Assay1', 'Assay2']
    assert BY_ID['afm']['inputs'] == ['Na2O', 'K2O', 'FeTotal', 'MgO']
    assert BY_ID['alteration']['inputs'] == ['MgO', 'K2O', 'Na2O', 'CaO', 'FeTotal']
    assert BY_ID['fertility-eu-eu']['inputs'] == ['Sm', 'Eu', 'Gd'] and BY_ID['fertility-ce-ce']['inputs'] == ['La', 'Ce', 'Pr']
    assert BY_ID['qapf']['inputs'] == ['Q', 'A', 'P', 'F']


# CURRENT BEHAVIOR — characterization only: catalog.tool() falls back to ``reference = formula`` when no
# citation is given, so "no reference" is indistinguishable from "has a reference". 21 of 31 tools do this.
def test_reference_falls_back_to_formula_for_uncited_tools():
    uncited = [t['id'] for t in TOOLS if t['reference'] == t['formula']]
    assert uncited == [
        'line', 'qq-normal', 'probability', 'ecdf', 'assay-compare', 'assay-difference', 'downhole', 'downhole-compare',
        'scatter', 'histogram', 'boxplot', 'ternary', 'harker', 'afm', 'k2o-sio2', 'a-cnk', 'a-nk', 'element-ratios',
        'fertility-sr-y', 'fertility-la-yb', 'fertility-dy-yb',
    ]
    assert all(t['reference'] and t['formula'] for t in TOOLS)


def test_catalog_tools_satisfy_the_ipc_contract():
    contract = json.loads((ROOT / 'packages/ipc-contracts/geochemistry/catalog.v1.json').read_text(encoding='utf-8'))
    item = contract['response']['properties']['tools']['items']
    assert set(item['required']) == CONTRACT_KEYS
    for tool in TOOLS:
        assert CONTRACT_KEYS <= set(tool)


def test_rpc_catalog_returns_the_frozen_tools_unchanged(tmp_path, monkeypatch):
    from fastapi.testclient import TestClient
    from analysis.data import overlay, storage
    from app.main import app
    monkeypatch.setattr(storage, 'DATASETS_DIR', tmp_path)
    monkeypatch.setattr(overlay, 'DATASETS_DIR', tmp_path)
    dataset_id = storage.save_dataset(pl.DataFrame({'sample_id': ['S1'], 'SiO2': [60.]}), 'Catalog contract', {})
    with TestClient(app, base_url='http://localhost') as client:
        body = client.post('/rpc', json={'jsonrpc': '2.0', 'id': 'cat', 'method': 'geochemistry.catalog',
                                          'params': {'dataset_id': dataset_id}}).json()
    assert body['error'] is None
    result = body['result']
    assert result['tools'] == FROZEN
    assert set(result) == {'tools', 'columns', 'dataset_id', 'dataset_name'}
    assert result['dataset_name'] == 'Catalog contract'


def test_no_tool_is_renamed_or_lost_relative_to_the_frozen_dump():
    assert {t['id'] for t in FROZEN} == set(EXPECTED_IDS)
    with pytest.raises(KeyError):
        BY_ID['sr-y']  # the short names used in planning are NOT ids; the real ids keep the 'fertility-' prefix
