# PyInstaller spec for the PyOreX analytics engine (folder build, bundled by Tauri as a resource).
#
#   cd services/analytics
#   pyinstaller pyorex-engine.spec --noconfirm        ->  dist/pyorex-engine/pyorex-engine(.exe)
#
# A folder build (not one-file) starts in ~2 s instead of unpacking ~300 MB to a temp folder on every launch.
# Smoke test after building:  dist/pyorex-engine/pyorex-engine --check
from PyInstaller.utils.hooks import collect_data_files, collect_submodules

hidden = [
    *collect_submodules('app'),
    *collect_submodules('analysis'),
    # uvicorn picks these by name at runtime
    'uvicorn.logging', 'uvicorn.loops.auto', 'uvicorn.loops.asyncio', 'uvicorn.protocols.http.auto',
    'uvicorn.protocols.http.h11_impl', 'uvicorn.protocols.http.httptools_impl', 'uvicorn.protocols.websockets.auto',
    'uvicorn.lifespan.on', 'uvicorn.lifespan.off',
    # optional engines loaded lazily
    'fastexcel', 'tifffile', 'pyarrow',
    'sklearn.utils._typedefs', 'sklearn.utils._heap', 'sklearn.utils._sorting', 'sklearn.utils._vector_sentinel',
    'sklearn.neighbors._partition_nodes',
    'statsmodels.tsa.statespace._filters', 'factor_analyzer',
]

datas = [
    ('analysis/geochemistry/references', 'analysis/geochemistry/references'),
    *collect_data_files('pyproj'),            # PROJ database (CRS checks, EPSG labels)
    *collect_data_files('asteval'),
]

a = Analysis(
    ['pyorex_engine.py'],
    pathex=['.'],
    binaries=[],
    datas=datas,
    hiddenimports=hidden,
    hookspath=[],
    runtime_hooks=[],
    # Not used by the engine: keep the installer small.
    excludes=['matplotlib', 'seaborn', 'pingouin', 'tkinter', 'IPython', 'jupyter', 'notebook', 'pytest', 'PyInstaller',
              'PIL', 'lxml', 'cryptography'],
    noarchive=False,
)
pyz = PYZ(a.pure)
exe = EXE(
    pyz, a.scripts, [],
    exclude_binaries=True,
    name='pyorex-engine',
    console=True,          # stdin/stdout pipes for the desktop app; it starts us with CREATE_NO_WINDOW (no window shown)
    upx=False,
    icon='../../apps/desktop/src-tauri/icons/icon.ico',
)
coll = COLLECT(exe, a.binaries, a.datas, strip=False, upx=False, name='pyorex-engine')
