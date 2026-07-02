"""Deterministic exports of the SQLite tables to Parquet / CSV / JSON via DuckDB."""

from __future__ import annotations

import json
import sqlite3
from pathlib import Path

from ..logging import get_logger

log = get_logger(__name__)

_EXPORT_TABLES = ("items", "context_items", "media_assets", "item_media")
_ORDER_BY = {
    "items": "type, created_utc, id",
    "context_items": "created_utc, id",
    "media_assets": "sha256",
    "item_media": "item_id, source_url",
}


def export_all(db_path: Path, out_dir: Path, fmt: str = "parquet") -> list[Path]:
    """Export core tables. Returns the files written.

    Uses DuckDB's sqlite scanner for parquet/csv; falls back to stdlib for json.
    """
    out_dir.mkdir(parents=True, exist_ok=True)
    if fmt == "json":
        return _export_json(db_path, out_dir)

    import duckdb  # local import: heavy

    written: list[Path] = []
    con = duckdb.connect()
    try:
        con.execute("INSTALL sqlite; LOAD sqlite;")
        con.execute("SET GLOBAL sqlite_all_varchar=false;")
        con.execute(f"ATTACH '{db_path.as_posix()}' AS src (TYPE sqlite);")
        for table in _EXPORT_TABLES:
            target = out_dir / f"{table}.{fmt}"
            order = _ORDER_BY[table]
            query = f"SELECT * FROM src.{table} ORDER BY {order}"
            if fmt == "parquet":
                con.execute(
                    f"COPY ({query}) TO '{target.as_posix()}' (FORMAT PARQUET);"
                )
            elif fmt == "csv":
                con.execute(
                    f"COPY ({query}) TO '{target.as_posix()}' (FORMAT CSV, HEADER);"
                )
            else:
                raise ValueError(f"unsupported export format: {fmt}")
            written.append(target)
            log.info("exported", table=table, path=str(target), fmt=fmt)
    finally:
        con.close()
    return written


def _export_json(db_path: Path, out_dir: Path) -> list[Path]:
    conn = sqlite3.connect(str(db_path))
    conn.row_factory = sqlite3.Row
    written: list[Path] = []
    try:
        for table in _EXPORT_TABLES:
            order = _ORDER_BY[table]
            rows = [dict(r) for r in conn.execute(f"SELECT * FROM {table} ORDER BY {order}")]
            target = out_dir / f"{table}.json"
            target.write_text(json.dumps(rows, indent=2, sort_keys=True), encoding="utf-8")
            written.append(target)
            log.info("exported", table=table, path=str(target), fmt="json", rows=len(rows))
    finally:
        conn.close()
    return written
