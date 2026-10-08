"""PyOreX project files (``.orex``).

A ``.orex`` file is a ZIP container that makes a whole working session portable:

    manifest.json              format, version, name, saved_at, datasets (id, name, rows, columns, sha256)
    state.json                 the desktop's presentation state (areas, windows, classes, sessions, project CRS)
    datasets/<id>.parquet      the dataset exactly as stored (originals are never modified)
    datasets/<id>.meta.json    its metadata (column roles, spatial config, semantic overrides…)
    datasets/<id>.ops.json     its non-destructive edit overlay, when it has one

Design rules
    * Nothing scientific is computed or changed here: files are copied byte for byte.
    * Opening never overwrites local data that differs: a dataset whose id already exists locally with different
      content is restored under a NEW id and the caller receives ``id_map`` to remap the presentation state.
    * Archives are read defensively: only the members above are accepted (no path traversal), sizes and the
      compression ratio are bounded (zip bombs), and a newer, unknown format version is refused, not guessed.
    * Saving is atomic: the archive is written next to the target and moved into place only when complete.
"""
from __future__ import annotations

import hashlib
import io
import json
import os
import re
import tempfile
import uuid
import zipfile
from datetime import UTC, datetime
from pathlib import Path

from analysis.licensing.plans import check_rows
from analysis.data import storage

FORMAT = 'pyorex-project'
VERSION = 1
EXTENSION = '.orex'
MAX_STATE_BYTES = 20 * 1024 * 1024            # presentation state is small; refuse anything absurd
MAX_MEMBER_BYTES = 4 * 1024 * 1024 * 1024     # one dataset member (uncompressed)
MAX_TOTAL_BYTES = 16 * 1024 * 1024 * 1024     # whole archive (uncompressed)
MAX_RATIO = 200                                 # uncompressed / compressed, per member

_ID = r'[a-zA-Z0-9\-_]{1,64}'
_MEMBER = re.compile(rf'^(manifest\.json|state\.json|datasets/({_ID})\.(parquet|meta\.json|ops\.json))$')
_SUFFIXES = ('.parquet', '.meta.json', '.ops.json')
_USER_META_KEYS = ('name', 'semantic_overrides', 'spatial_config', 'columns')


class ProjectError(ValueError):
    """User-facing problem with a project file (message is shown as is)."""


def _now() -> str:
    return datetime.now(UTC).isoformat()


def _sha256(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def _target_path(path: str, must_exist: bool) -> Path:
    if not isinstance(path, str) or not path.strip():
        raise ProjectError('Ruta de proyecto vacía.')
    p = Path(path).expanduser()
    if not p.is_absolute():
        raise ProjectError('La ruta del proyecto debe ser absoluta.')
    if p.suffix.lower() != EXTENSION:
        raise ProjectError(f'El proyecto debe tener extensión {EXTENSION}.')
    if must_exist and not p.is_file():
        raise ProjectError(f'No existe el proyecto: {p}')
    if not must_exist and not p.parent.is_dir():
        raise ProjectError(f'No existe la carpeta de destino: {p.parent}')
    return p


def _dataset_files(dataset_id: str) -> dict[str, bytes]:
    storage.validate_dataset_id(dataset_id)
    base = storage.DATASETS_DIR
    files: dict[str, bytes] = {}
    for suffix in _SUFFIXES:
        f = base / f'{dataset_id}{suffix}'
        if f.is_file():
            files[suffix] = f.read_bytes()
    if '.parquet' not in files or '.meta.json' not in files:
        raise ProjectError(f'Dataset no encontrado en este equipo: {dataset_id}')
    return files


# ── Save ──────────────────────────────────────────────────────────────────────

def save_project(path: str, state: dict, dataset_ids: list[str], name: str | None = None) -> dict:
    """Write a complete project archive atomically. Returns a summary for the UI."""
    target = _target_path(path, must_exist=False)
    if not isinstance(state, dict):
        raise ProjectError('El estado del proyecto debe ser un objeto JSON.')
    state_bytes = json.dumps(state, ensure_ascii=False, separators=(',', ':')).encode('utf-8')
    if len(state_bytes) > MAX_STATE_BYTES:
        raise ProjectError('El estado del proyecto es demasiado grande.')
    ids = list(dict.fromkeys(dataset_ids))           # keep order, drop duplicates

    datasets, payload = [], {}
    for dataset_id in ids:
        files = _dataset_files(dataset_id)
        meta = json.loads(files['.meta.json'].decode('utf-8'))
        datasets.append({'id': dataset_id, 'name': meta.get('name', dataset_id), 'row_count': meta.get('row_count'),
                         'column_count': meta.get('column_count'), 'sha256': _sha256(files['.parquet']),
                         'has_ops': '.ops.json' in files})
        payload[dataset_id] = files

    manifest = {'format': FORMAT, 'version': VERSION, 'app': 'PyOreX', 'name': (name or target.stem).strip() or target.stem,
                'saved_at': _now(), 'datasets': datasets}

    fd, tmp = tempfile.mkstemp(prefix='.orex-', suffix='.tmp', dir=str(target.parent))
    os.close(fd)
    try:
        with zipfile.ZipFile(tmp, 'w', compression=zipfile.ZIP_DEFLATED, compresslevel=6) as z:
            z.writestr('manifest.json', json.dumps(manifest, ensure_ascii=False, indent=2))
            z.writestr('state.json', state_bytes)
            for dataset_id, files in payload.items():
                for suffix, data in files.items():
                    # Parquet is already compressed: store it to keep saving fast.
                    kind = zipfile.ZIP_STORED if suffix == '.parquet' else zipfile.ZIP_DEFLATED
                    z.writestr(zipfile.ZipInfo(f'datasets/{dataset_id}{suffix}', date_time=_zip_time()), data, compress_type=kind)
        with open(tmp, 'rb+') as fh:     # durable before it replaces the previous project file
            os.fsync(fh.fileno())
        os.replace(tmp, target)
    except BaseException:
        Path(tmp).unlink(missing_ok=True)
        raise
    return {'path': str(target), 'name': manifest['name'], 'saved_at': manifest['saved_at'],
            'datasets': len(datasets), 'bytes': target.stat().st_size}


def _zip_time() -> tuple[int, int, int, int, int, int]:
    t = datetime.now()
    return (max(1980, t.year), t.month, t.day, t.hour, t.minute, t.second)


# ── Read ──────────────────────────────────────────────────────────────────────

def _open_archive(path: str) -> tuple[zipfile.ZipFile, dict]:
    p = _target_path(path, must_exist=True)
    try:
        z = zipfile.ZipFile(p)
    except zipfile.BadZipFile as e:
        raise ProjectError('El archivo no es un proyecto PyOreX válido (ZIP dañado).') from e
    total = 0
    for info in z.infolist():
        if info.is_dir():
            continue
        if not _MEMBER.match(info.filename):
            z.close()
            raise ProjectError(f'Contenido no permitido en el proyecto: {info.filename}')
        if info.file_size > MAX_MEMBER_BYTES or (info.compress_size and info.file_size / info.compress_size > MAX_RATIO and info.file_size > 1024 * 1024):
            z.close()
            raise ProjectError(f'Miembro sospechoso o demasiado grande: {info.filename}')
        total += info.file_size
    if total > MAX_TOTAL_BYTES:
        z.close()
        raise ProjectError('El proyecto excede el tamaño máximo admitido.')
    try:
        manifest = json.loads(z.read('manifest.json').decode('utf-8'))
    except KeyError as e:
        z.close()
        raise ProjectError('Falta manifest.json: no es un proyecto PyOreX.') from e
    if manifest.get('format') != FORMAT:
        z.close()
        raise ProjectError('El archivo no es un proyecto PyOreX.')
    version = manifest.get('version')
    if not isinstance(version, int) or version < 1:
        z.close()
        raise ProjectError('Versión de proyecto inválida.')
    if version > VERSION:
        z.close()
        raise ProjectError(f'El proyecto se creó con una versión más reciente de PyOreX (formato v{version}). Actualiza la aplicación.')
    for entry in manifest.get('datasets', []):
        if not isinstance(entry, dict) or not re.fullmatch(_ID, str(entry.get('id', ''))):
            z.close()
            raise ProjectError('Manifiesto con un dataset inválido.')
    return z, manifest


def inspect_project(path: str) -> dict:
    """Manifest only (no data is imported)."""
    z, manifest = _open_archive(path)
    z.close()
    return {'manifest': manifest}


def open_project(path: str) -> dict:
    """Restore every dataset of the archive into local storage and return the presentation state.

    ``id_map`` maps each archived dataset id to the id it has locally: identical content keeps its id, an id that
    exists locally with different content gets a fresh id (local data is never overwritten).
    """
    z, manifest = _open_archive(path)
    with z:
        state_raw = z.read('state.json') if 'state.json' in z.namelist() else b'{}'
        if len(state_raw) > MAX_STATE_BYTES:
            raise ProjectError('El estado del proyecto es demasiado grande.')
        state = json.loads(state_raw.decode('utf-8') or '{}')
        if not isinstance(state, dict):
            raise ProjectError('Estado de proyecto inválido.')

        storage.DATASETS_DIR.mkdir(parents=True, exist_ok=True)
        # 1) Read and verify EVERY dataset before writing anything: a corrupt archive imports nothing.
        verified = []
        for entry in manifest.get('datasets', []):
            old = entry['id']
            files = {}
            for suffix in _SUFFIXES:
                member = f'datasets/{old}{suffix}'
                if member in z.namelist():
                    files[suffix] = z.read(member)
            if '.parquet' not in files or '.meta.json' not in files:
                raise ProjectError(f'Al proyecto le faltan archivos del dataset {entry.get("name", old)}.')
            if entry.get('sha256') and _sha256(files['.parquet']) != entry['sha256']:
                raise ProjectError(f'Integridad fallida en el dataset {entry.get("name", old)} (sha256 distinto).')
            rows = json.loads(files['.meta.json'].decode('utf-8')).get('row_count')
            if isinstance(rows, int):
                check_rows(rows)   # an edition with a sample limit never restores a bigger dataset
            verified.append((old, files))
        # 2) Restore: identical local copies are reused, differing ones are kept and the archive gets a new id.
        id_map: dict[str, str] = {}
        restored = []
        for old, files in verified:
            new = old if _can_keep_id(old, files) else str(uuid.uuid4())
            id_map[old] = new
            if new != old or not (storage.DATASETS_DIR / f'{old}.parquet').exists():
                _write_dataset(new, old, files)
            restored.append(storage.load_metadata(new))
    return {'manifest': manifest, 'state': state, 'id_map': id_map, 'datasets': restored}


def _can_keep_id(dataset_id: str, files: dict[str, bytes]) -> bool:
    """True when the id is free locally, or when the local copy is byte-identical (data AND edit overlay)."""
    base = storage.DATASETS_DIR
    local_parquet = base / f'{dataset_id}.parquet'
    if not local_parquet.exists():
        return True
    if local_parquet.read_bytes() != files['.parquet']:
        return False
    local_ops = base / f'{dataset_id}.ops.json'
    archived_ops = files.get('.ops.json')
    if local_ops.exists() != (archived_ops is not None):
        return False
    if archived_ops is not None and _canonical(local_ops.read_bytes()) != _canonical(archived_ops):
        return False
    # Metadata the user can change after import (role corrections, coordinates/CRS) must match too, or the
    # project's version would be silently replaced by the local one.
    local_meta_path = base / f'{dataset_id}.meta.json'
    if not local_meta_path.exists():
        return False
    try:
        local_meta = json.loads(local_meta_path.read_text(encoding='utf-8'))
        archived_meta = json.loads(files['.meta.json'].decode('utf-8'))
    except ValueError:
        return False
    return all(local_meta.get(k) == archived_meta.get(k) for k in _USER_META_KEYS)


def _canonical(raw: bytes) -> str:
    try:
        return json.dumps(json.loads(raw.decode('utf-8')), sort_keys=True)
    except ValueError:
        return raw.decode('utf-8', 'replace')


def _write_dataset(new_id: str, old_id: str, files: dict[str, bytes]) -> None:
    storage.validate_dataset_id(new_id)
    base = storage.DATASETS_DIR
    meta = json.loads(files['.meta.json'].decode('utf-8'))
    meta['id'] = new_id
    if new_id != old_id:
        meta['restored_from_id'] = old_id
    meta['restored_at'] = _now()
    # Write data first and metadata last: list_datasets() only sees a dataset once its metadata exists.
    (base / f'{new_id}.parquet').write_bytes(files['.parquet'])
    if '.ops.json' not in files:
        (base / f'{new_id}.ops.json').unlink(missing_ok=True)      # never inherit a stale local overlay
    else:
        ops = json.loads(files['.ops.json'].decode('utf-8'))
        if isinstance(ops, dict):
            ops['dataset_id'] = new_id
        (base / f'{new_id}.ops.json').write_text(json.dumps(ops, ensure_ascii=False, indent=2), encoding='utf-8')
    (base / f'{new_id}.meta.json').write_text(json.dumps(meta, ensure_ascii=False, indent=2), encoding='utf-8')


def manifest_from_bytes(data: bytes) -> dict:
    """Helper for tests and tooling: read the manifest of an in-memory archive."""
    with zipfile.ZipFile(io.BytesIO(data)) as z:
        return json.loads(z.read('manifest.json').decode('utf-8'))
