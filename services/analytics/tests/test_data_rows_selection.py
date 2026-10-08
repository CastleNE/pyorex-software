"""data.rows returns the row_index of every row so the data grid shares the selection with the chart windows."""
import json
from pathlib import Path

import polars as pl

from analysis.data import overlay, storage
from app.routers.rpc import _rpc_data_rows

ROOT = Path(__file__).resolve().parents[3]


def test_rows_carry_their_dataset_position_through_filters_sort_and_selection(tmp_path, monkeypatch):
    monkeypatch.setattr(storage, 'DATASETS_DIR', tmp_path)
    monkeypatch.setattr(overlay, 'DATASETS_DIR', tmp_path)
    ds = storage.save_dataset(pl.DataFrame({'Sample': ['a', 'b', 'c', 'd'], 'Cu': [40.0, 10.0, 30.0, 20.0]}), 'rows', {})
    page = _rpc_data_rows({'dataset_id': ds, 'sort': {'column': 'Cu', 'direction': 'asc'}})
    assert page['row_indices'] == [1, 3, 2, 0]
    assert [r['Sample'] for r in page['rows']] == ['b', 'd', 'c', 'a']
    assert '__pyorex_row_index__' not in page['columns'] and all('__pyorex_row_index__' not in r for r in page['rows'])
    filtered = _rpc_data_rows({'dataset_id': ds, 'filters': [{'column': 'Cu', 'op': 'gt', 'value': 15}], 'only_rows': [0, 1, 3]})
    assert filtered['row_indices'] == [0, 3] and filtered['total_rows'] == 2 and filtered['total_rows_unfiltered'] == 4
    contract = json.loads((ROOT / 'packages/ipc-contracts/data/rows.v1.json').read_text(encoding='utf-8'))
    assert set(page) == set(contract['response']['required'])
