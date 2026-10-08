"""PyOreX analytics engine launcher.

Entry point of the packaged engine (PyInstaller, see ``pyorex-engine.spec``) and a convenient way to run it by hand:

    python pyorex_engine.py --port 5174

The desktop app starts it with a free port, the user's data folder and ``--watch-stdin``: the engine exits as soon as
the app goes away (its stdin pipe closes), so no orphan process is left running. Only 127.0.0.1 is ever bound.
"""
from __future__ import annotations

import argparse
import logging
import os
import sys
import threading
from pathlib import Path

ENGINE_VERSION = '0.1.0'


def default_data_dir() -> Path:
    """Per-user, writable location: %LOCALAPPDATA%\\PyOrex\\data on Windows, ~/.local/share/pyorex/data elsewhere."""
    if sys.platform == 'win32':
        return Path(os.environ.get('LOCALAPPDATA') or Path.home() / 'AppData' / 'Local') / 'PyOrex' / 'data'
    return Path(os.environ.get('XDG_DATA_HOME') or Path.home() / '.local' / 'share') / 'pyorex' / 'data'


def _watch_stdin() -> None:
    """Exit when the parent closes our stdin (the desktop app quit or crashed)."""
    stream = sys.stdin
    if stream is None:
        return
    try:
        while stream.readline():
            pass
    except (OSError, ValueError):
        pass
    logging.getLogger('pyorex.engine').info('stdin closed: the desktop app is gone, shutting down')
    os._exit(0)


def parse_args(argv: list[str] | None = None) -> argparse.Namespace:
    p = argparse.ArgumentParser(prog='pyorex-engine', description='PyOreX analytics engine (JSON-RPC over HTTP, 127.0.0.1 only)')
    p.add_argument('--port', type=int, default=int(os.environ.get('PYOREX_PORT', 5174)))
    p.add_argument('--data-dir', default=os.environ.get('PYOREX_DATA_DIR'), help='datasets, projects and libraries (default: per-user folder)')
    p.add_argument('--plan', default=None, help='edition (demo, geochem, full, academic); default: PYOREX_PLAN or full')
    p.add_argument('--log-file', default=None)
    p.add_argument('--watch-stdin', action='store_true', help='exit when stdin closes (used by the desktop app)')
    p.add_argument('--check', action='store_true', help='import every module and exit (packaging smoke test)')
    p.add_argument('--version', action='version', version=f'pyorex-engine {ENGINE_VERSION}')
    return p.parse_args(argv)


def main(argv: list[str] | None = None) -> int:
    args = parse_args(argv)
    if not 1 <= args.port <= 65535:
        print('Puerto no válido', file=sys.stderr)
        return 2
    data_dir = Path(args.data_dir) if args.data_dir else default_data_dir()
    data_dir.mkdir(parents=True, exist_ok=True)
    # Storage modules read these at import time: set them before importing the app.
    os.environ['PYOREX_DATA_DIR'] = str(data_dir)
    os.environ.setdefault('PYOREX_HUB_DIR', str(data_dir.parent / 'hub'))
    if args.plan:
        os.environ['PYOREX_PLAN'] = args.plan

    handlers: list[logging.Handler] = [logging.StreamHandler(sys.stderr)] if sys.stderr else []
    if args.log_file:
        Path(args.log_file).parent.mkdir(parents=True, exist_ok=True)
        handlers.append(logging.FileHandler(args.log_file, encoding='utf-8'))
    logging.basicConfig(level=logging.INFO, format='%(asctime)s %(levelname)s %(name)s: %(message)s', handlers=handlers or None, force=True)
    log = logging.getLogger('pyorex.engine')

    from app.main import app  # noqa: E402  (after the environment is set)

    if args.check:
        from app.routers.rpc import METHOD_REGISTRY
        print(f'pyorex-engine {ENGINE_VERSION} ok · {len(METHOD_REGISTRY)} RPC methods · data {data_dir}')
        return 0

    if args.watch_stdin:
        threading.Thread(target=_watch_stdin, name='stdin-watch', daemon=True).start()

    import uvicorn
    log.info('PyOreX engine %s on 127.0.0.1:%s · data %s', ENGINE_VERSION, args.port, data_dir)
    uvicorn.run(app, host='127.0.0.1', port=args.port, log_level='warning', access_log=False, log_config=None)
    return 0


if __name__ == '__main__':
    sys.exit(main())
