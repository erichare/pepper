"""SQLite connection management and migration runner."""

from __future__ import annotations

import sqlite3
from importlib import resources
from pathlib import Path

from ..logging import get_logger

log = get_logger(__name__)

_MIGRATIONS_PKG = "pepper.archive.storage.migrations"


def connect(db_path: Path) -> sqlite3.Connection:
    """Open a connection with WAL + foreign keys and Row access."""
    db_path.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(str(db_path), isolation_level=None)  # autocommit; we manage txns
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode = WAL")
    conn.execute("PRAGMA foreign_keys = ON")
    conn.execute("PRAGMA synchronous = NORMAL")
    return conn


def _migration_files() -> list[tuple[str, str]]:
    """Return sorted (name, sql) for every bundled migration."""
    files: list[tuple[str, str]] = []
    for entry in sorted(resources.files(_MIGRATIONS_PKG).iterdir(), key=lambda p: p.name):
        if entry.name.endswith(".sql"):
            files.append((entry.name, entry.read_text(encoding="utf-8")))
    return files


def apply_migrations(conn: sqlite3.Connection) -> list[str]:
    """Apply any unapplied migrations in order. Returns names applied this call."""
    conn.execute(
        "CREATE TABLE IF NOT EXISTS _migrations ("
        "name TEXT PRIMARY KEY, applied_utc TEXT NOT NULL DEFAULT (datetime('now')))"
    )
    applied = {row["name"] for row in conn.execute("SELECT name FROM _migrations")}
    newly: list[str] = []
    for name, sql in _migration_files():
        if name in applied:
            continue
        log.info("apply_migration", name=name)
        # NB: sqlite3.executescript issues an implicit COMMIT, so we cannot wrap it
        # in a manual BEGIN/COMMIT. Migrations use IF NOT EXISTS, so a partial apply
        # is safe to re-run; the marker is only recorded once the script succeeds.
        conn.executescript(sql)
        conn.execute("INSERT INTO _migrations(name) VALUES (?)", (name,))
        newly.append(name)
    return newly
