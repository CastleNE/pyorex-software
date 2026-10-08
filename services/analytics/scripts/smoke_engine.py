"""End-to-end smoke test of a built engine (packaged or not), run by scripts/build-installer.ps1 and CI.

    python scripts/smoke_engine.py <path-to-pyorex-engine(.exe)> [samples-dir]

Starts the engine on a free port with a temporary data folder, waits for /health and exercises the main RPC paths
(import CSV and Excel, profile, a geochemistry diagram, the sample map with IDW, a section). Exits non-zero on failure.
Only the standard library is used, so it also runs from a clean Python.
"""
from __future__ import annotations

import json
import os
import socket
import subprocess
import sys
import tempfile
import time
import urllib.request
from pathlib import Path

HERE = Path(__file__).resolve().parent


def free_port() -> int:
    with socket.socket() as s:
        s.bind(('127.0.0.1', 0))
        return s.getsockname()[1]


def rpc(port: int, method: str, params: dict) -> dict:
    body = json.dumps({'jsonrpc': '2.0', 'id': '1', 'method': method, 'params': params}).encode()
    req = urllib.request.Request(f'http://127.0.0.1:{port}/rpc', data=body, headers={'Content-Type': 'application/json'})
    with urllib.request.urlopen(req, timeout=120) as r:
        out = json.loads(r.read())
    if out.get('error'):
        raise RuntimeError(f"{method}: {out['error']}")
    return out['result']


def write_samples(folder: Path) -> tuple[Path, Path]:
    rows = ['Sample_ID,Este,Norte,Cota,SiO2_pct,Na2O_pct,K2O_pct,Cu_ppm,Sector']
    for i in range(30):
        rows.append(f'S{i:02d},{450000 + (i % 6) * 400},{8830000 + (i // 6) * 400},{2400 + i * 3},{48 + i * 0.8:.1f},{2.5 + (i % 5) * 0.3:.1f},{0.8 + (i % 7) * 0.4:.1f},{20 + i * 11},{"AB"[i % 2]}')
    csv = folder / 'muestras.csv'
    csv.write_text('\n'.join(rows) + '\n', encoding='utf-8')
    dem = folder / 'dem.asc'
    lines = ['ncols 30', 'nrows 30', 'xllcorner 449000', 'yllcorner 8829000', 'cellsize 150', 'NODATA_value -9999']
    lines += [' '.join(str(2400 + r * 2 + c) for c in range(30)) for r in range(30)]
    dem.write_text('\n'.join(lines) + '\n', encoding='utf-8')
    return csv, dem


def main() -> int:
    exe = Path(sys.argv[1]).resolve()
    work = Path(tempfile.mkdtemp(prefix='pyorex-smoke-'))
    csv, dem = write_samples(work)
    port = free_port()
    flags = 0x08000000 if os.name == 'nt' else 0          # CREATE_NO_WINDOW
    cmd = [str(exe)] if exe.suffix != '.py' else [sys.executable, str(exe)]
    proc = subprocess.Popen([*cmd, '--port', str(port), '--data-dir', str(work / 'data'), '--watch-stdin'],
                            stdin=subprocess.PIPE, creationflags=flags)
    started = time.time()
    try:
        while True:
            try:
                with urllib.request.urlopen(f'http://127.0.0.1:{port}/health', timeout=2) as r:
                    if r.status == 200:
                        break
            except OSError:
                pass
            if proc.poll() is not None or time.time() - started > 90:
                raise RuntimeError('the engine did not answer /health')
            time.sleep(0.3)
        print(f'engine up in {time.time() - started:.1f} s')
        spatial = {'geometry_source': 'projected_xy', 'east_col': 'Este', 'north_col': 'Norte', 'projected_epsg': 'EPSG:32718'}
        ds = rpc(port, 'data.import', {'file_path': str(csv), 'dataset_name': 'smoke', 'spatial_config': spatial})['dataset']['id']
        prof = rpc(port, 'data.profile', {'dataset_id': ds})
        assert len(prof['columns']) >= 8, prof
        tas = rpc(port, 'geochemistry.compute', {'dataset_id': ds, 'tool': 'tas', 'columns': {'SiO2': 'SiO2_pct', 'Na2O': 'Na2O_pct', 'K2O': 'K2O_pct'},
                                                 'units': {'SiO2': 'pct', 'Na2O': 'pct', 'K2O': 'pct'}})
        assert tas['quality']['used'] == 30, tas['quality']
        m = rpc(port, 'maps.sample_map', {'dataset_id': ds, 'value': 'Cu_ppm', 'idw': {'resolution': 21}})
        assert m['grid'] and m['quality']['mapped'] == 30
        sec = rpc(port, 'maps.section', {'dataset_id': ds, 'start': [449900, 8830800], 'end': [452500, 8830800], 'width': 900,
                                         'value': 'Cu_ppm', 'dem_path': str(dem)})
        assert sec['topography_source'] == 'dem' and sec['points'], sec['quality']
        try:
            import importlib.util
            if importlib.util.find_spec('polars'):
                import polars as pl
                xlsx = work / 'muestras.xlsx'
                pl.read_csv(csv).write_excel(xlsx)
                rpc(port, 'data.import', {'file_path': str(xlsx), 'dataset_name': 'smoke-xlsx'})
                print('excel import ok')
        except ImportError:
            pass
        print('smoke test ok: import, profile, TAS, map + IDW, section + DEM')
        return 0
    finally:
        if proc.stdin:
            proc.stdin.close()                              # the engine exits by itself (--watch-stdin)
        try:
            proc.wait(timeout=10)
        except subprocess.TimeoutExpired:
            proc.kill()


if __name__ == '__main__':
    sys.exit(main())
