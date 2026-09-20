"""Small transactional, user-local store for dated market cache and saved entries."""
import json
import os
import sqlite3
from contextlib import contextmanager
from datetime import datetime, timezone
from pathlib import Path


def now_iso():
    return datetime.now(timezone.utc).isoformat()


class HubRepository:
    def __init__(self, path=None):
        base = Path(os.environ.get('PYOREX_HUB_DIR') or
                    str(Path(os.environ.get('LOCALAPPDATA', Path.home())) / 'PyOrex' / 'hub'))
        self.path = Path(path) if path else base / 'hub.sqlite3'
        self.path.parent.mkdir(parents=True, exist_ok=True)
        with self.connect() as db:
            db.execute('CREATE TABLE IF NOT EXISTS cache (key TEXT PRIMARY KEY, value TEXT NOT NULL)')
            db.execute('CREATE TABLE IF NOT EXISTS archive (id TEXT PRIMARY KEY, value TEXT NOT NULL, saved_at TEXT NOT NULL)')

    @contextmanager
    def connect(self):
        connection = sqlite3.connect(self.path, timeout=10)
        try:
            with connection:
                yield connection
        finally:
            connection.close()

    def cached(self):
        with self.connect() as db:
            row = db.execute("SELECT value FROM cache WHERE key='markets.v1'").fetchone()
        return json.loads(row[0]) if row else None

    def cache(self, value):
        with self.connect() as db:
            db.execute("INSERT OR REPLACE INTO cache VALUES ('markets.v1', ?)",
                       (json.dumps(value, allow_nan=False),))

    def save(self, item):
        with self.connect() as db:
            db.execute('INSERT OR IGNORE INTO archive VALUES (?, ?, ?)',
                       (item['id'], json.dumps(item, allow_nan=False), now_iso()))

    def remove(self, item_id):
        with self.connect() as db:
            db.execute('DELETE FROM archive WHERE id=?', (item_id,))

    def archive(self):
        with self.connect() as db:
            rows = db.execute('SELECT value, saved_at FROM archive ORDER BY saved_at DESC, id').fetchall()
        return [{**json.loads(value), 'saved_at': saved_at} for value, saved_at in rows]
