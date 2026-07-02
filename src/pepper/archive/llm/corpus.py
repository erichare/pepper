"""Build and chunk the corpus for the dossier, preserving item-id citations."""

from __future__ import annotations

import hashlib
import sqlite3

from .cost import estimate_tokens
from .prompts import PROMPT_VERSION

_CORPUS_SQL = """
SELECT
    i.id, i.type, i.subreddit, i.created_utc, i.title, i.body,
    (SELECT COALESCE(ci.title, substr(ci.body, 1, 240))
       FROM context_links cl JOIN context_items ci ON ci.id = cl.context_id
      WHERE cl.comment_id = i.id AND cl.relation = 'parent' LIMIT 1) AS parent_snip,
    (SELECT ci.title
       FROM context_links cl JOIN context_items ci ON ci.id = cl.context_id
      WHERE cl.comment_id = i.id AND cl.relation = 'link' LIMIT 1) AS link_title
FROM items i
ORDER BY i.created_utc
"""

_DELETED = {"[deleted]", "[removed]", ""}


def build_records(conn: sqlite3.Connection) -> list[dict]:
    """Return compact per-item records (with citation id and reply context)."""
    records: list[dict] = []
    for r in conn.execute(_CORPUS_SQL):
        if r["type"] == "submission":
            text = "\n".join(x for x in (r["title"], r["body"]) if x)
        else:
            text = r["body"] or ""
        if not text or text.strip() in _DELETED:
            continue
        rec = {
            "id": r["id"],
            "sub": r["subreddit"],
            "ts": r["created_utc"],
            "kind": r["type"],
            "text": text.strip(),
        }
        if r["type"] == "comment":
            reply_to = r["parent_snip"] or r["link_title"]
            if reply_to:
                rec["reply_to"] = str(reply_to).strip()[:240]
        records.append(rec)
    return records


def _record_tokens(rec: dict) -> int:
    return estimate_tokens(rec.get("text", "")) + estimate_tokens(rec.get("reply_to", "")) + 20


def chunk_records(records: list[dict], max_input_tokens: int = 16000) -> list[list[dict]]:
    """Greedily pack records into token-bounded chunks."""
    chunks: list[list[dict]] = []
    current: list[dict] = []
    budget = 0
    for rec in records:
        t = _record_tokens(rec)
        if current and budget + t > max_input_tokens:
            chunks.append(current)
            current, budget = [], 0
        current.append(rec)
        budget += t
    if current:
        chunks.append(current)
    return chunks


def chunk_id(records: list[dict]) -> str:
    """Deterministic id from the chunk's item ids + prompt version (map cache key)."""
    ids = sorted(r["id"] for r in records)
    h = hashlib.sha256()
    h.update(PROMPT_VERSION.encode())
    h.update("\n".join(ids).encode())
    return h.hexdigest()[:24]


def corpus_hash(records: list[dict]) -> str:
    ids = sorted(r["id"] for r in records)
    h = hashlib.sha256()
    h.update(PROMPT_VERSION.encode())
    h.update(str(len(ids)).encode())
    h.update("\n".join(ids).encode())
    return h.hexdigest()
