"""Curated few-shot examples for the persona reply generator.

Selects ~40 real r/Chipotle comments (with their parent post titles) that
anchor the persona's register: short dismissals, medium opinions, long
skimping lectures, and the wealth bit. Selection is fully deterministic:
hand-pinned ids first, then quota fills with total ORDER BY.

``_PINNED`` and ``_BLOCKED`` encode the manual review pass — pin comments the
persona design verified as high-signal, block anything that reads as genuine
harassment out of context.
"""

from __future__ import annotations

import re
import sqlite3

_SHORT_MAX = 80
_MEDIUM_MAX = 300
_LONG_MAX = 900

_QUOTA = {"short": 16, "medium": 14, "long": 7}
_WEALTH_QUOTA = 3

# verified high-signal comments (persona design review, 2026-07-02)
_PINNED: tuple[str, ...] = (
    "t1_ndm0qcm",  # "Your wrong"
    "t1_mkhn5zz",  # "Your all idiots"
    "t1_koe0tu1",  # "It's fake…" (+258)
    "t1_mw77tr2",  # Pepper defense
    "t1_on1hxc1",  # wealth bracket / rolling burritos
    "t1_nk4igwg",  # skimping lecture: ORDER INGREDIENTS
    "t1_n3widqt",  # rice-and-cheese anecdote
    "t1_lk981a6",  # "pathetic taste buds"
    "t1_iv877z1",  # skimping lecture
    "t1_jbt2f6t",  # bare "Reported."
    "t1_ixhdbra",  # bare "Cap" (-21)
    "t1_jcc93m7",  # bare "Fake"
)

# excluded after manual review (harassment out of context, near-dupes)
_BLOCKED: frozenset[str] = frozenset(
    {
        "t1_jmucsvn",  # "Your an asshole" — directed personal insult
        "t1_mlacmlm",  # "Your an asshole" — duplicate of the above
        "t1_jbzvmsl",  # "It is one of his alts lol" — accuses a specific person
    }
)

# comments mentioning users, links, or slur-adjacent content never ship
_EXCLUDE_RE = re.compile(r"(/?u/[A-Za-z0-9_-]{3,}|https?://|\br[e3]tard|\bfag|\bn[i1]gg)", re.IGNORECASE)

_SIGNATURE_RE = re.compile(
    r"^(reported|cap|fake|wrong|womp womp)\b|\byour\s+(wrong|all|an?\s)|\blmao\b|\blol\b", re.IGNORECASE
)
_WEALTH_RE = re.compile(r"wealth bracket|my butler|chauffeur|net worth|private security", re.IGNORECASE)

_TAG_RULES: tuple[tuple[str, re.Pattern[str]], ...] = (
    ("dismissal", re.compile(r"^(reported|cap|fake|wrong|womp)", re.IGNORECASE)),
    ("your-quirk", re.compile(r"\bYour\s+(wrong|all|an?\s|the\b)")),
    ("wealth-bit", _WEALTH_RE),
    ("skimping", re.compile(r"skimp", re.IGNORECASE)),
    ("pepper", re.compile(r"\bpepper\b", re.IGNORECASE)),
    ("order-detail", re.compile(r"extra|double|fajita|salsa|sour cream|white rice", re.IGNORECASE)),
)


def _length_class(body: str) -> str:
    n = len(body)
    if n < _SHORT_MAX:
        return "short"
    if n < _MEDIUM_MAX:
        return "medium"
    return "long"


def _tags(body: str) -> list[str]:
    return [name for name, rx in _TAG_RULES if rx.search(body)]


def _pool(conn: sqlite3.Connection) -> list[sqlite3.Row]:
    return conn.execute(
        """
        SELECT i.id, TRIM(i.body) AS body, i.score, TRIM(ci.title) AS post_title
        FROM items i
        JOIN context_links cl ON cl.comment_id = i.id AND cl.relation = 'link'
        JOIN context_items ci ON ci.id = cl.context_id
        WHERE i.type = 'comment' AND i.subreddit = 'Chipotle' AND i.status = 'active'
          AND i.body IS NOT NULL AND TRIM(i.body) NOT IN ('', '[deleted]', '[removed]')
          AND ci.title IS NOT NULL AND TRIM(ci.title) NOT IN ('', '[deleted by user]', '[deleted]', '[removed]')
          AND LENGTH(TRIM(i.body)) <= ?
        ORDER BY i.id ASC
        """,
        (_LONG_MAX,),
    ).fetchall()


def _entry(row: sqlite3.Row) -> dict:
    body = row["body"]
    return {
        "id": row["id"],
        "postTitle": row["post_title"][:200],
        "body": body,
        "score": row["score"],
        "lengthClass": _length_class(body),
        "tags": _tags(body),
    }


def build_examples(conn: sqlite3.Connection) -> list[dict]:
    rows = [r for r in _pool(conn) if r["id"] not in _BLOCKED and not _EXCLUDE_RE.search(r["body"])]
    by_id = {r["id"]: r for r in rows}

    chosen: dict[str, dict] = {}
    for pid in _PINNED:
        if pid in by_id:
            chosen[pid] = _entry(by_id[pid])

    def fill(candidates: list[sqlite3.Row], quota: int) -> None:
        for r in candidates:
            if quota <= 0:
                return
            if r["id"] not in chosen:
                chosen[r["id"]] = _entry(by_id[r["id"]])
                quota -= 1

    # wealth bit first (spans length classes)
    wealth = [r for r in rows if _WEALTH_RE.search(r["body"])]
    wealth.sort(key=lambda r: (-(r["score"] or 0), r["id"]))
    have_wealth = sum(1 for e in chosen.values() if "wealth-bit" in e["tags"])
    fill(wealth, _WEALTH_QUOTA - have_wealth)

    for cls, quota in _QUOTA.items():
        have = sum(1 for e in chosen.values() if e["lengthClass"] == cls)
        remaining = quota - have
        if remaining <= 0:
            continue
        cands = [r for r in rows if _length_class(r["body"]) == cls]
        if cls == "short":
            # signature moves first, then by score for variety across the spectrum
            cands.sort(
                key=lambda r: (
                    0 if _SIGNATURE_RE.search(r["body"]) else 1,
                    -(r["score"] or 0),
                    r["id"],
                )
            )
        else:
            # mix engagement extremes deterministically: best-scored then worst-scored
            best = sorted(cands, key=lambda r: (-(r["score"] or 0), r["id"]))
            worst = sorted(cands, key=lambda r: ((r["score"] or 0), r["id"]))
            interleaved: list[sqlite3.Row] = []
            for pair in zip(best, worst, strict=True):
                interleaved.extend(pair)
            cands = interleaved
        fill(cands, remaining)

    return sorted(chosen.values(), key=lambda e: (e["lengthClass"], e["id"]))
