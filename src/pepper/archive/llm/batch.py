"""Anthropic Batch API map stage + reduce synthesis.

Map: one batch request per corpus chunk, cached in ``llm_chunks`` keyed by a
deterministic chunk id so re-runs never re-spend on unchanged chunks. Reduce:
hierarchical synthesis (synchronous calls — tiny volume) that unions citations.
"""

from __future__ import annotations

import json
import time

from ..logging import get_logger
from .corpus import chunk_id as compute_chunk_id
from .cost import MAP_MAX_OUTPUT_TOKENS, REDUCE_MAX_OUTPUT_TOKENS
from .prompts import build_map_request_params, build_reduce_request_params

log = get_logger(__name__)

_POLL_SECONDS = 15
_MAX_POLL_SECONDS = 60 * 60 * 4  # 4h ceiling


def _extract_tool_input(message, tool_name: str) -> dict | None:
    for block in getattr(message, "content", []) or []:
        if getattr(block, "type", None) == "tool_use" and getattr(block, "name", None) == tool_name:
            return dict(block.input)
    return None


def _validate_facts(findings: dict, allowed_ids: set[str]) -> dict:
    facts = findings.get("claimed_facts") or []
    kept = [f for f in facts if f.get("source_id") in allowed_ids]
    dropped = len(facts) - len(kept)
    if dropped:
        log.warning("dropped_uncited_facts", dropped=dropped)
    findings["claimed_facts"] = kept
    return findings


def run_map(client, conn, chunks: list[list[dict]], model: str) -> list[dict]:
    """Return per-chunk findings, using/refreshing the llm_chunks cache."""
    now = int(time.time())
    pending: list[tuple[str, list[dict]]] = []
    cached: list[dict] = []

    for chunk in chunks:
        cid = compute_chunk_id(chunk)
        row = conn.execute(
            "SELECT result_json FROM llm_chunks WHERE chunk_id=? AND status='done'", (cid,)
        ).fetchone()
        if row and row["result_json"]:
            cached.append(json.loads(row["result_json"]))
        else:
            pending.append((cid, chunk))
            conn.execute(
                "INSERT INTO llm_chunks(chunk_id, item_ids_json, prompt_version, custom_id, status, created_utc) "
                "VALUES (?,?,?,?,'pending',?) ON CONFLICT(chunk_id) DO UPDATE SET status='pending'",
                (cid, json.dumps(sorted(r["id"] for r in chunk)), _pv(), cid, now),
            )

    log.info("map_stage", total=len(chunks), cached=len(cached), pending=len(pending))
    if not pending:
        return cached

    requests = [
        {"custom_id": cid, "params": build_map_request_params(chunk, model, MAP_MAX_OUTPUT_TOKENS)}
        for cid, chunk in pending
    ]
    batch = client.messages.batches.create(requests=requests)
    batch_id = batch.id
    log.info("batch_submitted", batch_id=batch_id, requests=len(requests))
    conn.execute("UPDATE llm_chunks SET batch_id=?, status='submitted' WHERE status='pending'", (batch_id,))

    _poll_batch(client, batch_id)

    id_sets = {cid: {r["id"] for r in chunk} for cid, chunk in pending}
    new_findings: list[dict] = []
    for entry in client.messages.batches.results(batch_id):
        cid = entry.custom_id
        result = entry.result
        if getattr(result, "type", None) != "succeeded":
            log.warning("batch_entry_failed", custom_id=cid, type=getattr(result, "type", "?"))
            conn.execute("UPDATE llm_chunks SET status='error' WHERE chunk_id=?", (cid,))
            continue
        findings = _extract_tool_input(result.message, "record_findings")
        if findings is None:
            conn.execute("UPDATE llm_chunks SET status='error' WHERE chunk_id=?", (cid,))
            continue
        findings = _validate_facts(findings, id_sets.get(cid, set()))
        usage = getattr(result.message, "usage", None)
        conn.execute(
            "UPDATE llm_chunks SET status='done', result_json=?, input_tokens=?, output_tokens=? WHERE chunk_id=?",
            (
                json.dumps(findings),
                getattr(usage, "input_tokens", None),
                getattr(usage, "output_tokens", None),
                cid,
            ),
        )
        new_findings.append(findings)

    return cached + new_findings


def run_reduce(client, findings: list[dict], model: str) -> dict:
    """Hierarchically synthesize the final dossier from per-chunk findings."""
    if not findings:
        raise ValueError("no findings to reduce")

    group_size = 30
    if len(findings) <= group_size:
        return _reduce_once(client, findings, model)

    intermediates: list[dict] = []
    for i in range(0, len(findings), group_size):
        group = findings[i : i + group_size]
        intermediates.append(_reduce_once(client, group, model))
        log.info("reduce_group", done=len(intermediates))
    return _reduce_once(client, intermediates, model)


def _reduce_once(client, findings: list[dict], model: str) -> dict:
    params = build_reduce_request_params(findings, model, REDUCE_MAX_OUTPUT_TOKENS)
    message = client.messages.create(**params)
    dossier = _extract_tool_input(message, "synthesize_dossier")
    if dossier is None:
        raise RuntimeError("reduce did not return a synthesize_dossier tool call")
    return dossier


def _poll_batch(client, batch_id: str) -> None:
    waited = 0
    while waited < _MAX_POLL_SECONDS:
        b = client.messages.batches.retrieve(batch_id)
        if b.processing_status == "ended":
            log.info("batch_ended", batch_id=batch_id, counts=str(getattr(b, "request_counts", "")))
            return
        time.sleep(_POLL_SECONDS)
        waited += _POLL_SECONDS
    raise TimeoutError(f"batch {batch_id} did not finish within {_MAX_POLL_SECONDS}s")


def _pv() -> str:
    from .prompts import PROMPT_VERSION

    return PROMPT_VERSION
