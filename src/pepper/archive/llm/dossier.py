"""Dossier orchestration: corpus -> cost gate -> map/reduce -> persist."""

from __future__ import annotations

import json
import sqlite3
import time
from collections.abc import Callable

from ..config import Settings
from ..errors import CostAborted
from ..logging import get_logger
from .batch import run_map, run_reduce
from .client import make_anthropic_client
from .corpus import build_records, chunk_records, corpus_hash
from .cost import estimate_cost, format_estimate
from .prompts import PROMPT_VERSION

log = get_logger(__name__)


def generate_dossier(
    conn: sqlite3.Connection,
    settings: Settings,
    *,
    confirm: Callable[[str], bool] | None = None,
    force: bool = False,
    yes: bool = False,
) -> dict:
    """Build the persona dossier. ``confirm`` gates spend unless ``yes`` is set."""
    settings.require_anthropic()

    records = build_records(conn)
    if not records:
        raise ValueError("no corpus to analyze — fetch/backfill items first")
    chash = corpus_hash(records)

    if not force:
        existing = conn.execute(
            "SELECT result_json FROM llm_dossier WHERE corpus_hash=? AND prompt_version=? "
            "ORDER BY created_utc DESC LIMIT 1",
            (chash, PROMPT_VERSION),
        ).fetchone()
        if existing:
            log.info("dossier_cache_hit", corpus_hash=chash[:12])
            return json.loads(existing["result_json"])

    chunks = chunk_records(records)
    est = estimate_cost(chunks, settings)
    print(format_estimate(est))

    if not yes:
        approved = confirm(f"Proceed and spend ~${est['usd']:.2f}?") if confirm else False
        if not approved:
            raise CostAborted("dossier generation declined at cost gate")

    client = make_anthropic_client(settings.anthropic_api_key)
    conn.execute("BEGIN")
    try:
        findings = run_map(client, conn, chunks, settings.llm_model)
        conn.execute("COMMIT")
    except Exception:
        conn.execute("ROLLBACK")
        raise

    dossier = run_reduce(client, findings, settings.llm_model)
    dossier = _attach_permalinks(conn, dossier)

    in_tok = sum(len(json.dumps(f)) // 4 for f in findings)
    conn.execute(
        "INSERT INTO llm_dossier(prompt_version, created_utc, corpus_hash, result_json, "
        "cost_usd_est, input_tokens, output_tokens) VALUES (?,?,?,?,?,?,?)",
        (PROMPT_VERSION, int(time.time()), chash, json.dumps(dossier), est["usd"], in_tok, None),
    )
    return dossier


def _attach_permalinks(conn: sqlite3.Connection, dossier: dict) -> dict:
    """Resolve each biographical fact's source ids to permalinks for the report."""
    for fact in dossier.get("biographical_facts", []) or []:
        links = []
        for sid in fact.get("sources", []) or []:
            row = conn.execute("SELECT permalink FROM items WHERE id=?", (sid,)).fetchone()
            links.append({"id": sid, "permalink": row["permalink"] if row else None})
        fact["source_links"] = links
    return dossier


def load_latest_dossier(conn: sqlite3.Connection) -> dict | None:
    row = conn.execute(
        "SELECT result_json FROM llm_dossier ORDER BY created_utc DESC LIMIT 1"
    ).fetchone()
    return json.loads(row["result_json"]) if row else None
