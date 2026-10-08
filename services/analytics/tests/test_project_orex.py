"""``.orex`` project files: round trip, never overwriting different local data, and defensive reading."""
import asyncio
import json
import re
import zipfile
from pathlib import Path

import polars as pl
import pytest
from pydantic import ValidationError

from analysis.data import overlay, storage
from analysis.project import orex
from app.routers import project_rpc
from app.routers.rpc import METHOD_REGISTRY

ROOT = Path(__file__).resolve().parents[3]


@pytest.fixture(autouse=True)
def isolated_datasets_dir(tmp_path, monkeypatch):
    datasets_dir = tmp_path / 'datasets'
    monkeypatch.setattr(storage, 'DATASETS_DIR', datasets_dir)
    monkeypatch.setattr(overlay, 'DATASETS_DIR', datasets_dir)
    yield datasets_dir


def _dataset(name='Intrusivos', cu=(10.0, 20.0, 30.0)) -> str:
    df = pl.DataFrame({'Sample_ID': ['A', 'B', 'C'], 'SiO2_pct': [50.1, 60.2, 70.3], 'Cu_ppm': list(cu)})
    return storage.save_dataset(df, name=name, meta_extra={'column_roles': {'Cu_ppm': 'assay_element'}})


STATE = {'version': 1, 'shell': {'area': 'litho'}, 'windows': {'x': 1}, 'crs': 'EPSG:32718'}


def test_round_trip_keeps_data_overlay_metadata_and_state(tmp_path):
    ds = _dataset()
    overlay.append_op(ds, 'add_calculated_column', {'name': 'Cu_x2', 'formula': 'Cu_ppm * 2'})
    storage.update_metadata(ds, {'semantic_overrides': {'Cu_ppm': {'semantic_role': 'trace_element', 'analyte': 'Cu'}}})
    out = orex.save_project(str(tmp_path / 'tesis.orex'), STATE, [ds], name='Tesis')
    assert out['name'] == 'Tesis' and out['datasets'] == 1 and out['bytes'] > 0

    with zipfile.ZipFile(out['path']) as z:
        assert set(z.namelist()) == {'manifest.json', 'state.json', f'datasets/{ds}.parquet', f'datasets/{ds}.meta.json', f'datasets/{ds}.ops.json'}
        manifest = json.loads(z.read('manifest.json'))
    assert manifest['format'] == 'pyorex-project' and manifest['version'] == orex.VERSION
    assert manifest['datasets'][0]['has_ops'] is True

    # Same machine, nothing changed: ids are kept and nothing is rewritten.
    before = (storage.DATASETS_DIR / f'{ds}.parquet').stat().st_mtime_ns
    opened = orex.open_project(out['path'])
    assert opened['id_map'] == {ds: ds}
    assert opened['state'] == STATE
    assert (storage.DATASETS_DIR / f'{ds}.parquet').stat().st_mtime_ns == before


def test_open_on_another_machine_restores_everything(tmp_path):
    ds = _dataset()
    overlay.append_op(ds, 'add_calculated_column', {'name': 'Cu_x2', 'formula': 'Cu_ppm * 2'})
    path = orex.save_project(str(tmp_path / 'p.orex'), STATE, [ds])['path']
    for f in storage.DATASETS_DIR.iterdir():
        f.unlink()                                                  # a clean machine
    opened = orex.open_project(path)
    assert opened['id_map'] == {ds: ds}
    df, _ = overlay.get_effective_dataframe(ds)
    assert df['Cu_x2'].to_list() == [20.0, 40.0, 60.0]              # overlay replays
    assert opened['datasets'][0]['name'] == 'Intrusivos'


def test_never_overwrites_a_different_local_dataset_with_the_same_id(tmp_path):
    ds = _dataset()
    path = orex.save_project(str(tmp_path / 'p.orex'), STATE, [ds])['path']
    local = storage.DATASETS_DIR / f'{ds}.parquet'
    pl.DataFrame({'Sample_ID': ['Z'], 'SiO2_pct': [1.0], 'Cu_ppm': [9.0]}).write_parquet(local)   # local data diverged
    local_bytes = local.read_bytes()
    opened = orex.open_project(path)
    new = opened['id_map'][ds]
    assert new != ds
    assert local.read_bytes() == local_bytes                       # untouched
    assert storage.load_metadata(new)['restored_from_id'] == ds
    assert storage.load_dataset(new)['Cu_ppm'].to_list() == [10.0, 20.0, 30.0]


def test_local_edits_in_the_overlay_also_count_as_different(tmp_path):
    ds = _dataset()
    path = orex.save_project(str(tmp_path / 'p.orex'), STATE, [ds])['path']
    overlay.append_op(ds, 'hide_column', {'column': 'Cu_ppm'})     # edited locally after saving
    assert orex.open_project(path)['id_map'][ds] != ds


def test_save_is_atomic_and_validates_inputs(tmp_path):
    ds = _dataset()
    with pytest.raises(orex.ProjectError):
        orex.save_project(str(tmp_path / 'p.zip'), STATE, [ds])      # wrong extension
    with pytest.raises(orex.ProjectError):
        orex.save_project('relativo.orex', STATE, [ds])
    with pytest.raises(orex.ProjectError):
        orex.save_project(str(tmp_path / 'p.orex'), STATE, ['no-existe'])
    assert not list(tmp_path.glob('*.orex')) and not list(tmp_path.glob('.orex-*'))


def _write_zip(path: Path, members: dict[str, bytes]):
    with zipfile.ZipFile(path, 'w') as z:
        for name, data in members.items():
            z.writestr(name, data)


def test_rejects_foreign_members_newer_versions_and_bad_files(tmp_path):
    ok_manifest = json.dumps({'format': 'pyorex-project', 'version': 1, 'datasets': []}).encode()
    traversal = tmp_path / 'a.orex'
    _write_zip(traversal, {'manifest.json': ok_manifest, '../evil.txt': b'x'})
    with pytest.raises(orex.ProjectError, match='no permitido'):
        orex.open_project(str(traversal))
    newer = tmp_path / 'b.orex'
    _write_zip(newer, {'manifest.json': json.dumps({'format': 'pyorex-project', 'version': 99, 'datasets': []}).encode()})
    with pytest.raises(orex.ProjectError, match='más reciente'):
        orex.inspect_project(str(newer))
    notzip = tmp_path / 'c.orex'
    notzip.write_bytes(b'hola')
    with pytest.raises(orex.ProjectError, match='ZIP'):
        orex.open_project(str(notzip))
    other = tmp_path / 'd.orex'
    _write_zip(other, {'manifest.json': json.dumps({'format': 'otra-cosa', 'version': 1}).encode()})
    with pytest.raises(orex.ProjectError):
        orex.open_project(str(other))


def test_detects_corrupted_dataset_content(tmp_path):
    ds = _dataset()
    path = Path(orex.save_project(str(tmp_path / 'p.orex'), STATE, [ds])['path'])
    with zipfile.ZipFile(path) as z:
        members = {n: z.read(n) for n in z.namelist()}
    members[f'datasets/{ds}.parquet'] = members[f'datasets/{ds}.parquet'][:-8] + b'00000000'
    bad = tmp_path / 'bad.orex'
    _write_zip(bad, members)
    for f in storage.DATASETS_DIR.iterdir():
        f.unlink()
    with pytest.raises(orex.ProjectError, match='sha256'):
        orex.open_project(str(bad))


# ── RPC wiring and contracts ─────────────────────────────────────────────────
def test_methods_are_registered_allowlisted_and_described():
    rust = (ROOT / 'apps' / 'desktop' / 'src-tauri' / 'src' / 'analytics_bridge.rs').read_text(encoding='utf-8')
    allowed = set(re.findall(r'"([a-z_.]+)"', rust[rust.index('ALLOWED_RPC_METHODS'):]))
    for method in project_rpc.PROJECT_METHODS:
        assert METHOD_REGISTRY[method] is project_rpc.PROJECT_METHODS[method]
        assert method in allowed
        contract = json.loads((ROOT / 'packages' / 'ipc-contracts' / 'project' / f'{method.split(".")[1]}.v1.json').read_text(encoding='utf-8'))
        assert contract['method'] == method


def test_rpc_round_trip_matches_the_contracts(tmp_path):
    ds = _dataset()
    saved = asyncio.run(project_rpc.save({'path': str(tmp_path / 'r.orex'), 'state': STATE, 'dataset_ids': [ds], 'name': 'R'}))
    contract = json.loads((ROOT / 'packages/ipc-contracts/project/save.v1.json').read_text(encoding='utf-8'))
    assert set(saved) == set(contract['response']['required'])
    opened = asyncio.run(project_rpc.open_({'path': saved['path']}))
    contract = json.loads((ROOT / 'packages/ipc-contracts/project/open.v1.json').read_text(encoding='utf-8'))
    assert set(opened) == set(contract['response']['required'])
    assert asyncio.run(project_rpc.inspect({'path': saved['path']}))['manifest']['name'] == 'R'
    with pytest.raises(ValidationError):
        asyncio.run(project_rpc.save({'path': str(tmp_path / 'x.orex'), 'state': STATE, 'x': 1}))


def test_metadata_corrections_in_the_project_are_not_replaced_by_local_ones(tmp_path):
    ds = _dataset()
    path = orex.save_project(str(tmp_path / 'p.orex'), STATE, [ds])['path']
    storage.update_metadata(ds, {'semantic_overrides': {'Cu_ppm': {'semantic_role': 'assay', 'analyte': 'Cu'}}})
    new = orex.open_project(path)['id_map'][ds]
    assert new != ds
    assert 'semantic_overrides' not in storage.load_metadata(new)              # the project's own version
    assert storage.load_metadata(ds)['semantic_overrides']                     # local version kept


def test_a_deleted_datasets_edits_never_come_back(tmp_path):
    ds = _dataset()
    path = orex.save_project(str(tmp_path / 'p.orex'), STATE, [ds])['path']
    overlay.append_op(ds, 'hide_column', {'column': 'Cu_ppm'})
    storage.delete_dataset(ds)
    assert not (storage.DATASETS_DIR / f'{ds}.ops.json').exists()
    (storage.DATASETS_DIR / f'{ds}.ops.json').write_text('{"ops": [{"type": "hide_column", "params": {"column": "Cu_ppm"}}]}')
    orex.open_project(path)
    _, hidden = overlay.get_effective_dataframe(ds)
    assert hidden == set()


def test_a_corrupt_dataset_imports_nothing(tmp_path):
    a, b = _dataset('A'), _dataset('B', cu=(1.0, 2.0, 3.0))
    path = Path(orex.save_project(str(tmp_path / 'p.orex'), STATE, [a, b])['path'])
    with zipfile.ZipFile(path) as z:
        members = {n: z.read(n) for n in z.namelist()}
    members[f'datasets/{b}.parquet'] = members[f'datasets/{b}.parquet'][:-8] + b'00000000'
    bad = tmp_path / 'bad.orex'
    _write_zip(bad, members)
    for f in storage.DATASETS_DIR.iterdir():
        f.unlink()
    with pytest.raises(orex.ProjectError):
        orex.open_project(str(bad))
    assert not list(storage.DATASETS_DIR.iterdir())


def test_concurrent_metadata_writes_are_serialised():
    import threading
    ds = _dataset()
    def work(i):
        for k in range(20):
            storage.mutate_metadata(ds, lambda m, i=i, k=k: {'semantic_overrides': {**(m.get('semantic_overrides') or {}), f'c{i}_{k}': {'semantic_role': 'ratio'}}})
    threads = [threading.Thread(target=work, args=(i,)) for i in range(4)]
    for t in threads:
        t.start()
    for t in threads:
        t.join()
    assert len(storage.load_metadata(ds)['semantic_overrides']) == 80
