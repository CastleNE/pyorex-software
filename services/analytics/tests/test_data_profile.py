"""data.profile: per-column summary of the rows the grid shows (Tabla y preparación → Perfil de columnas)."""
import json
import re
from pathlib import Path

import polars as pl
import pytest

from analysis.data import overlay, storage
from analysis.data.importer import ImportConfig, NullMapping, import_file
from analysis.data.profile import HISTOGRAM_BINS, profile_dataframe
from app.routers.rpc import _rpc_data_profile

ROOT = Path(__file__).resolve().parents[3]


def _by_name(cols):
    return {c['name']: c for c in cols}


def test_counts_censored_and_missing_values_without_imputing_them():
    df = pl.DataFrame({
        'Au_ppb': [5.0, None, None, 12.0, None, 8.0],
        '_nulltype_Au_ppb': [None, 'BELOW_LOD', 'BELOW_LOD', None, 'NOT_ANALYZED', None],
        'Sector': ['A', 'B', 'A', None, 'A', 'C'],
        'internal_feature_id': ['x'] * 6,
    })
    cols = _by_name(profile_dataframe(df))
    assert set(cols) == {'Au_ppb', 'Sector'}                      # internal and companion columns are not profiled
    au = cols['Au_ppb']
    assert (au['valid'], au['below_lod'], au['not_analyzed'], au['missing']) == (3, 2, 1, 0)
    assert au['numeric']['min'] == 5.0 and au['numeric']['max'] == 12.0 and au['numeric']['median'] == 8.0
    assert sum(au['numeric']['histogram']['counts']) == 3          # censored values never enter the distribution
    sector = cols['Sector']
    assert sector['kind'] == 'text' and sector['missing'] == 1 and sector['distinct'] == 3
    assert sector['top'][0] == {'value': 'A', 'count': 3}


def test_numeric_summary_outliers_and_constant_columns():
    df = pl.DataFrame({'SiO2': [50.0, 51.0, 52.0, 53.0, 54.0, 90.0], 'K': [1.0] * 6, 'Empty': [None] * 6},
                      schema={'SiO2': pl.Float64, 'K': pl.Float64, 'Empty': pl.Float64})
    cols = _by_name(profile_dataframe(df))
    s = cols['SiO2']['numeric']
    assert s['q1'] == pytest.approx(51.25) and s['q3'] == pytest.approx(53.75) and s['outliers'] == 1
    assert s['histogram']['scale'] == 'linear' and len(s['histogram']['counts']) == HISTOGRAM_BINS
    assert s['histogram']['counts'][:2] == [3, 2] and s['histogram']['counts'][-1] == 1   # bins of 2.5 from 50
    assert cols['K']['constant'] is True and cols['K']['numeric']['histogram']['counts'] == [6]
    assert cols['Empty']['valid'] == 0 and cols['Empty']['missing'] == 6 and cols['Empty']['numeric'] is None


def test_skewed_trace_elements_get_a_log10_histogram():
    cu = [10.0] * 20 + [20.0, 30.0, 50.0, 80.0, 5000.0]
    s = _by_name(profile_dataframe(pl.DataFrame({'Cu_ppm': cu})))['Cu_ppm']['numeric']
    assert s['histogram']['scale'] == 'log10'
    assert s['histogram']['start'] == pytest.approx(1.0)                       # log10(10)
    assert s['histogram']['start'] + s['histogram']['width'] * HISTOGRAM_BINS == pytest.approx(3.69897, abs=1e-4)
    normal = _by_name(profile_dataframe(pl.DataFrame({'SiO2': [50.0, 55.0, 60.0, 65.0, 70.0]})))['SiO2']['numeric']
    assert normal['histogram']['scale'] == 'linear'


def test_rpc_follows_grid_filters_selection_and_hidden_columns(tmp_path, monkeypatch):
    monkeypatch.setattr(storage, 'DATASETS_DIR', tmp_path)
    monkeypatch.setattr(overlay, 'DATASETS_DIR', tmp_path)
    ds = storage.save_dataset(pl.DataFrame({'Sample': ['a', 'b', 'c', 'd'], 'Cu': [40.0, 10.0, 30.0, 20.0], 'Note': ['x'] * 4}), 'profile', {})
    overlay.append_op(ds, 'hide_column', {'column': 'Note'})
    out = _rpc_data_profile({'dataset_id': ds, 'filters': [{'column': 'Cu', 'op': 'gt', 'value': 15}], 'only_rows': [0, 1, 3]})
    assert out['rows'] == 2 and out['total_rows'] == 4
    cols = _by_name(out['columns'])
    assert set(cols) == {'Sample', 'Cu'}
    assert cols['Cu']['numeric']['min'] == 20.0 and cols['Cu']['numeric']['max'] == 40.0
    contract = json.loads((ROOT / 'packages/ipc-contracts/data/profile.v1.json').read_text(encoding='utf-8'))
    assert contract['method'] == 'data.profile'
    assert set(out) == set(contract['response']['required'])
    assert all(set(c) == set(contract['response']['properties']['columns']['items']['required']) for c in out['columns'])
    bridge = (ROOT / 'apps/desktop/src-tauri/src/analytics_bridge.rs').read_text(encoding='utf-8')
    assert 'data.profile' in set(re.findall(r'"([a-z_.]+)"', bridge[bridge.index('ALLOWED_RPC_METHODS'):]))


def test_imported_detection_limits_are_flagged_only_where_the_sentinel_was(tmp_path):
    csv = tmp_path / 'au.csv'
    csv.write_text('Sample,Au_ppb\na,<5\nb,12.5\nc,\nd,ND\ne,8\n', encoding='utf-8')
    df, _meta = import_file(str(csv), ImportConfig(null_mappings=[NullMapping('Au_ppb', '<5', 'BELOW_LOD', 5.0),
                                                            NullMapping('Au_ppb', 'ND', 'NOT_ANALYZED')]))
    assert df['_nulltype_Au_ppb'].to_list() == ['BELOW_LOD', None, None, 'NOT_ANALYZED', None]
    au = _by_name(profile_dataframe(df))['Au_ppb']
    assert au['kind'] == 'numeric'                                  # text after the sentinels, numbers in practice
    assert (au['valid'], au['below_lod'], au['not_analyzed'], au['missing']) == (2, 1, 1, 1)
    assert au['numeric']['min'] == 8.0 and au['numeric']['max'] == 12.5
