import asyncio
import json
from pathlib import Path

import pytest

from analysis.hub.markets import MarketService, normalize
from analysis.hub.repository import HubRepository
from analysis.hub.catalog import CATALOG


def payload():
    return {'config': {'series': [{'name': n} for n in ['Cobre', 'Plata', 'Zinc', 'Oro']]},
            'periods': [{'name': '15.Sep.26', 'values': ['400', '30', '120', '2500']},
                        {'name': '16.Sep.26', 'values': ['410', 'n.d.', '121', '2525']}]}


def test_normalize_units_missing_values_and_change():
    quotes = normalize(payload())
    assert len(quotes) == 4
    assert quotes[0]['value'] == 410
    assert quotes[0]['unit'] == 'US cents / lb'
    assert quotes[0]['change_pct'] == 2.5
    assert quotes[0]['observed_at'] == '2026-09-16'
    assert quotes[1]['observed_at'] == '2026-09-15'
    assert quotes[1]['change_pct'] is None
    assert quotes[3]['unit'] == 'USD / troy oz'


@pytest.mark.parametrize('values', [['NaN'] * 4, ['Infinity'] * 4, ['-1'] * 4, ['0'] * 4, ['n.d.'] * 4])
def test_invalid_numbers_never_become_quotes(values):
    data = payload()
    data['periods'] = [{'name': '16.Sep.26', 'values': values}]
    with pytest.raises(ValueError):
        normalize(data)


def test_bad_shape_rejected():
    with pytest.raises(ValueError):
        normalize({'periods': [{'name': '16.Sep.26', 'values': ['410']}]})


def test_refresh_cache_offline_and_restart(tmp_path):
    repo = HubRepository(tmp_path / 'hub.sqlite3')
    calls = []
    def fetch():
        calls.append(1)
        return payload()
    service = MarketService(repo, fetch)
    assert service.get()['status'] == 'empty'
    live = service.get(refresh=True)
    assert live['status'] == 'updated'
    assert len(calls) == 1
    assert service.get()['status'] == 'cached'
    def fail():
        raise OSError('offline')
    restarted = MarketService(HubRepository(tmp_path / 'hub.sqlite3'), fail)
    cached = restarted.get(refresh=True)
    assert cached['status'] == 'cached'
    assert cached['quotes'] == live['quotes']
    assert cached['warning']
    assert cached['fetched_at'] == live['fetched_at']


def test_failed_first_fetch_and_recovery(tmp_path):
    def fail():
        raise OSError('offline')
    repo = HubRepository(tmp_path / 'hub.sqlite3')
    assert MarketService(repo, fail).get(refresh=True)['status'] == 'unavailable'
    assert MarketService(repo, payload).get(refresh=True)['status'] == 'updated'


def test_archive_idempotent_and_persistent(tmp_path):
    repo = HubRepository(tmp_path / 'hub.sqlite3')
    item = CATALOG[0]
    repo.save(item)
    repo.save(item)
    assert len(HubRepository(tmp_path / 'hub.sqlite3').archive()) == 1
    assert repo.archive()[0]['id'] == item['id']
    repo.remove(item['id'])
    repo.remove(item['id'])
    assert repo.archive() == []


def test_hub_rpc_validates_and_roundtrips(tmp_path, monkeypatch):
    from app.routers import hub_rpc
    from app.routers.rpc import METHOD_REGISTRY
    monkeypatch.setattr(hub_rpc, 'repository', lambda: HubRepository(tmp_path / 'hub.sqlite3'))
    assert 'hub.markets' in METHOD_REGISTRY
    async def scenario():
        result = await hub_rpc.HUB_METHODS['hub.catalog']({})
        item = result['items'][0]
        await hub_rpc.HUB_METHODS['hub.archive.save']({'item_id': item['id']})
        archive = await hub_rpc.HUB_METHODS['hub.archive.list']({})
        assert len(archive['items']) == 1
        await hub_rpc.HUB_METHODS['hub.archive.remove']({'item_id': item['id']})
        assert (await hub_rpc.HUB_METHODS['hub.archive.list']({}))['items'] == []
        with pytest.raises(ValueError):
            await hub_rpc.HUB_METHODS['hub.archive.save']({'item_id': '../../fake'})
        with pytest.raises(ValueError):
            await hub_rpc.HUB_METHODS['hub.markets']({'refresh': 'yes'})
    asyncio.run(scenario())


def test_contracts_and_native_allowlist():
    root = Path(__file__).resolve().parents[3]
    from app.routers.hub_rpc import HUB_METHODS
    bridge = (root / 'apps/desktop/src-tauri/src/analytics_bridge.rs').read_text()
    contracts = [json.loads(p.read_text()) for p in (root / 'packages/ipc-contracts/hub').glob('*.json')]
    assert {c['method'] for c in contracts} == set(HUB_METHODS)
    for contract in contracts:
        assert f'"{contract["method"]}"' in bridge
        assert contract['version'] == 'v1'
        assert contract['request']['type'] == 'object'
        assert contract['response']['type'] == 'object'
