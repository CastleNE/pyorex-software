"""Product plans (demo web, Geoquímica Pro, Completo, Académico) are enforced by the engine."""
import json
import re
from pathlib import Path

import polars as pl
import pytest
from fastapi.testclient import TestClient

from analysis.licensing import plans
from analysis.licensing.plans import PLANS, PlanLimitError, active_plan, check_rows, enforce_rpc

ROOT = Path(__file__).resolve().parents[3]


def test_plan_comes_from_the_environment_and_never_grants_more_than_the_demo_by_mistake(monkeypatch):
    monkeypatch.delenv('PYOREX_PLAN', raising=False)
    assert active_plan().id == 'full'                      # desktop default until signed licences exist
    monkeypatch.setenv('PYOREX_PLAN', 'Demo')
    assert active_plan().id == 'demo'
    monkeypatch.setenv('PYOREX_PLAN', 'enterprise-unlimited')
    assert active_plan().id == 'demo'                      # unknown value → most restrictive edition
    assert PLANS['demo'].to_dict() == {'plan': 'demo', 'label': 'PyOreX Demo', 'modules': ['geochemistry'], 'features': [], 'max_rows': 500}


def test_sample_limit():
    check_rows(500, PLANS['demo'])
    with pytest.raises(PlanLimitError, match='hasta 500 muestras.*este tiene 501'):
        check_rows(501, PLANS['demo'])
    check_rows(1_000_000, PLANS['geochem'])


@pytest.mark.parametrize('plan, method, allowed', [
    ('demo', 'spectrometry.import_files', False), ('geochem', 'spectrometry.import_files', False), ('full', 'spectrometry.import_files', True),
    ('academic', 'spectrometry.import_files', True), ('demo', 'project.save', False), ('geochem', 'project.open', True),
    ('demo', 'geochemistry.compute', True), ('demo', 'data.import', True), ('demo', 'qaqc.calculate', True),
])
def test_modules_and_features_by_plan(plan, method, allowed):
    if allowed:
        enforce_rpc(method, {}, PLANS[plan])
    else:
        with pytest.raises(PlanLimitError):
            enforce_rpc(method, {}, PLANS[plan])


def test_calls_on_a_dataset_bigger_than_the_plan_are_refused():
    sizes = {'small': 120, 'big': 9000}
    enforce_rpc('geochemistry.compute', {'dataset_id': 'small'}, PLANS['demo'], sizes.get)
    enforce_rpc('geochemistry.compute', {'dataset_id': 'missing'}, PLANS['demo'], sizes.get)
    with pytest.raises(PlanLimitError):
        enforce_rpc('geochemistry.compute', {'dataset_id': 'big'}, PLANS['demo'], sizes.get)
    enforce_rpc('geochemistry.compute', {'dataset_id': 'big'}, PLANS['full'], sizes.get)


@pytest.fixture
def demo_client(tmp_path, monkeypatch):
    from analysis.data import overlay, storage
    from app.main import app
    monkeypatch.setattr(storage, 'DATASETS_DIR', tmp_path)
    monkeypatch.setattr(overlay, 'DATASETS_DIR', tmp_path)
    monkeypatch.setenv('PYOREX_PLAN', 'demo')
    with TestClient(app, base_url='http://localhost') as client:
        yield client, tmp_path


def rpc(client, method, params=None):
    return client.post('/rpc', json={'jsonrpc': '2.0', 'id': '1', 'method': method, 'params': params or {}}).json()


def test_demo_engine_refuses_big_imports_spectrometry_and_projects(demo_client):
    client, tmp = demo_client
    for n in (500, 501):
        pl.DataFrame({'Sample_ID': [f'S{i}' for i in range(n)], 'SiO2_pct': [60.0] * n}).write_csv(tmp / f'{n}.csv')
    ok = rpc(client, 'data.import', {'file_path': str(tmp / '500.csv'), 'dataset_name': 'ok'})
    assert ok['error'] is None and ok['result']['dataset']['row_count'] == 500
    big = rpc(client, 'data.import', {'file_path': str(tmp / '501.csv'), 'dataset_name': 'big'})
    assert big['error']['code'] == plans.PLAN_LIMIT_CODE and '500 muestras' in big['error']['message']
    assert len(list(tmp.glob('*.parquet'))) == 1                      # nothing written for the refused file
    assert rpc(client, 'spectrometry.project.list')['error']['code'] == plans.PLAN_LIMIT_CODE
    assert rpc(client, 'project.save', {'path': str(tmp / 'p.orex'), 'state': {}})['error']['code'] == plans.PLAN_LIMIT_CODE
    assert rpc(client, 'app.plan')['result'] == PLANS['demo'].to_dict()


def test_plan_method_is_allowlisted_and_described():
    bridge = (ROOT / 'apps/desktop/src-tauri/src/analytics_bridge.rs').read_text(encoding='utf-8')
    allowed = set(re.findall(r'"([a-z_.]+)"', bridge[bridge.index('ALLOWED_RPC_METHODS'):]))
    assert 'app.plan' in allowed
    contract = json.loads((ROOT / 'packages/ipc-contracts/app/plan.v1.json').read_text(encoding='utf-8'))
    assert contract['method'] == 'app.plan'
    assert set(contract['response']['required']) == set(PLANS['full'].to_dict())
