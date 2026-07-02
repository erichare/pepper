"""Web export: deterministic JSON + media consumed by the Next.js app in ``web/``.

Everything is derived from the SQLite database (and the analysis export).
Re-running on an unchanged database is byte-identical: JSON is dumped with
``sort_keys`` + ``indent``, every query carries a total ORDER BY, and the
"generated" stamp derives from the data (``MAX(items.last_updated_utc)``),
never the wall clock.

Outputs
-------
web/src/data/       profile.json, analysis.json, timeline.json,
                    hall_of_fame.json, persona.json, examples.json, media.json
web/public/data/    browse/index.json, browse/default.json, browse/<shard>.json
web/public/media/   copied archive images, content-addressed by sha prefix
"""

from __future__ import annotations

import json
import shutil
import sqlite3
from pathlib import Path

from ..config import Settings
from ..logging import get_logger
from .examples import build_examples

log = get_logger(__name__)

_DELETED = {"[deleted]", "[removed]", "[deleted by user]", ""}
_HOF_LIMIT = 15
_TIMELINE_TOP_SUBS = 10
_BROWSE_SHARD_TOP_SUBS = 10
_BROWSE_BODY_MAX = 800
_HOF_BODY_MAX = 500

# magic-byte sniffing for assets stored with an empty ext
_MAGIC = [
    (b"\xff\xd8\xff", "jpg"),
    (b"\x89PNG", "png"),
    (b"GIF8", "gif"),
    (b"RIFF", "webp"),
]


def _write_json(path: Path, obj: object) -> Path:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(obj, indent=2, sort_keys=True, ensure_ascii=False) + "\n", encoding="utf-8")
    return path


def _stamp(conn: sqlite3.Connection) -> dict:
    row = conn.execute(
        "SELECT COUNT(*) AS n, MAX(last_updated_utc) AS updated, MIN(created_utc) AS first,"
        " MAX(created_utc) AS last FROM items"
    ).fetchone()
    return {
        "item_count": row["n"],
        "data_updated_utc": row["updated"],
        "first_item_utc": row["first"],
        "last_item_utc": row["last"],
    }


def _truncate(text: str | None, limit: int) -> str:
    if not text:
        return ""
    text = text.strip()
    return text if len(text) <= limit else text[: limit - 1].rstrip() + "…"


# ── builders ──────────────────────────────────────────────────────


def build_profile(conn: sqlite3.Connection, settings: Settings) -> dict | None:
    from ..llm import load_latest_dossier

    dossier = load_latest_dossier(conn)
    if dossier is None:
        return None
    row = conn.execute(
        "SELECT prompt_version, created_utc, corpus_hash FROM llm_dossier ORDER BY created_utc DESC LIMIT 1"
    ).fetchone()
    return {
        "dossier": dossier,
        "meta": {
            "username": settings.reddit_username,
            "prompt_version": row["prompt_version"],
            "dossier_created_utc": row["created_utc"],
            "corpus_hash": row["corpus_hash"],
            **_stamp(conn),
        },
    }


def build_timeline(conn: sqlite3.Connection) -> dict:
    """Monthly counts per top subreddit + an ``other`` bucket, dense month grid."""
    top = [
        r["subreddit"]
        for r in conn.execute(
            "SELECT subreddit, COUNT(*) c FROM items WHERE subreddit IS NOT NULL"
            " GROUP BY subreddit ORDER BY c DESC, subreddit LIMIT ?",
            (_TIMELINE_TOP_SUBS,),
        )
    ]
    rows = conn.execute(
        "SELECT strftime('%Y-%m', created_utc, 'unixepoch') ym, subreddit, COUNT(*) c"
        " FROM items WHERE created_utc IS NOT NULL GROUP BY ym, subreddit ORDER BY ym, subreddit"
    ).fetchall()
    if not rows:
        return {"months": [], "subreddits": [], "series": {}}

    def next_month(ym: str) -> str:
        y, m = int(ym[:4]), int(ym[5:])
        y, m = (y + 1, 1) if m == 12 else (y, m + 1)
        return f"{y:04d}-{m:02d}"

    months: list[str] = []
    cur, last = rows[0]["ym"], rows[-1]["ym"]
    while cur <= last:
        months.append(cur)
        cur = next_month(cur)
    index = {ym: i for i, ym in enumerate(months)}

    keys = [*top, "other"]
    series: dict[str, list[int]] = {k: [0] * len(months) for k in keys}
    for r in rows:
        key = r["subreddit"] if r["subreddit"] in top else "other"
        series[key][index[r["ym"]]] += r["c"]
    return {"months": months, "subreddits": keys, "series": series}


def _hof_rows(conn: sqlite3.Connection, item_type: str, ascending: bool) -> list[dict]:
    text_col = "title" if item_type == "submission" else "body"
    order = "ASC" if ascending else "DESC"
    rows = conn.execute(
        f"""
        SELECT id, type, subreddit, score, title, body, permalink, created_utc, status
        FROM items
        WHERE type = ? AND score IS NOT NULL
          AND {text_col} IS NOT NULL AND TRIM({text_col}) NOT IN ('[deleted]','[removed]','[deleted by user]','')
        ORDER BY score {order}, created_utc ASC, id ASC
        LIMIT ?
        """,
        (item_type, _HOF_LIMIT),
    ).fetchall()
    return [
        {
            "id": r["id"],
            "type": r["type"],
            "subreddit": r["subreddit"],
            "score": r["score"],
            "title": _truncate(r["title"], 300) or None,
            "body": _truncate(r["body"], _HOF_BODY_MAX) or None,
            "permalink": r["permalink"],
            "created_utc": r["created_utc"],
            "status": r["status"],
        }
        for r in rows
    ]


def build_hall_of_fame(conn: sqlite3.Connection) -> dict:
    return {
        "top_comments": _hof_rows(conn, "comment", ascending=False),
        "bottom_comments": _hof_rows(conn, "comment", ascending=True),
        "top_submissions": _hof_rows(conn, "submission", ascending=False),
        "bottom_submissions": _hof_rows(conn, "submission", ascending=True),
    }


def build_persona(profile: dict | None) -> dict | None:
    if profile is None:
        return None
    d = profile["dossier"]
    return {
        "summary": d.get("summary", ""),
        "voice_guide": d.get("voice_guide", {}),
        "personality": d.get("personality", []),
        "interests": (d.get("interests") or [])[:12],
        "opinions": (d.get("opinions") or [])[:12],
        "values": (d.get("values") or [])[:8],
    }


# ── browse shards ─────────────────────────────────────────────────


def _slug(name: str) -> str:
    return "".join(ch if ch.isalnum() else "-" for ch in name.lower()).strip("-") or "unknown"


def _browse_item(r: sqlite3.Row, media_ids: frozenset[str]) -> dict:
    return {
        "id": r["id"],
        "type": r["type"],
        "subreddit": r["subreddit"],
        "created_utc": r["created_utc"],
        "score": r["score"],
        "title": _truncate(r["title"], 300) or None,
        "body": _truncate(r["body"], _BROWSE_BODY_MAX) or None,
        "permalink": r["permalink"],
        "status": r["status"],
        "has_media": r["id"] in media_ids,
    }


def build_browse(conn: sqlite3.Connection, media_ids: frozenset[str]) -> tuple[dict, dict[str, list[dict]], list[dict]]:
    """Return (manifest, shards keyed by filename, default page)."""
    top = [
        r["subreddit"]
        for r in conn.execute(
            "SELECT subreddit, COUNT(*) c FROM items WHERE subreddit IS NOT NULL"
            " GROUP BY subreddit ORDER BY c DESC, subreddit LIMIT ?",
            (_BROWSE_SHARD_TOP_SUBS,),
        )
    ]
    rows = conn.execute(
        "SELECT id, type, subreddit, created_utc, score, title, body, permalink, status,"
        " CAST(strftime('%Y', created_utc, 'unixepoch') AS INTEGER) AS year"
        " FROM items WHERE created_utc IS NOT NULL ORDER BY created_utc ASC, id ASC"
    ).fetchall()

    shards: dict[str, list[dict]] = {}
    shard_meta: dict[str, dict] = {}
    for r in rows:
        sub = r["subreddit"] or "unknown"
        year = r["year"]
        key = f"{_slug(sub)}-{year}" if sub in top else f"other-{year}"
        fname = f"{key}.json"
        shards.setdefault(fname, []).append(_browse_item(r, media_ids))
        meta = shard_meta.setdefault(fname, {"file": fname, "subreddit": sub if sub in top else "other", "year": year, "count": 0})
        meta["count"] += 1

    sub_counts = [
        {"subreddit": r["subreddit"] or "unknown", "count": r["c"]}
        for r in conn.execute(
            "SELECT subreddit, COUNT(*) c FROM items GROUP BY subreddit ORDER BY c DESC, subreddit"
        )
    ]
    default_rows = conn.execute(
        "SELECT id, type, subreddit, created_utc, score, title, body, permalink, status"
        " FROM items WHERE score IS NOT NULL ORDER BY score ASC, created_utc ASC, id ASC LIMIT 200"
    ).fetchall()
    default_page = [_browse_item(r, media_ids) for r in default_rows]

    manifest = {
        "total": sum(m["count"] for m in shard_meta.values()),
        "shards": sorted(shard_meta.values(), key=lambda m: m["file"]),
        "subreddits": sub_counts,
        "top_subreddits": top,
    }
    return manifest, shards, default_page


# ── media ─────────────────────────────────────────────────────────


def _sniff_ext(path: Path) -> str:
    try:
        head = path.open("rb").read(12)
    except OSError:
        return "jpg"
    for magic, ext in _MAGIC:
        if head.startswith(magic):
            return ext
    return "jpg"


def _resolve_media_path(local_path: str, settings: Settings) -> Path | None:
    p = Path(local_path)
    candidates = [p] if p.is_absolute() else [
        Path(local_path),
        settings.data_dir.parent / local_path,
        settings.data_dir / Path(local_path).name,
    ]
    for c in candidates:
        if c.exists():
            return c
    return None


def export_media(conn: sqlite3.Connection, settings: Settings, media_dir: Path) -> list[dict]:
    rows = conn.execute(
        """
        SELECT m.sha256, m.ext, m.width, m.height, m.local_path,
               im.item_id, i.permalink, i.subreddit, i.title, i.created_utc, i.score
        FROM media_assets m
        JOIN item_media im ON im.sha256 = m.sha256 AND im.item_scope = 'item' AND im.download_status = 'ok'
        JOIN items i ON i.id = im.item_id
        WHERE m.kind IN ('image', 'gallery_image')
        ORDER BY i.created_utc ASC, m.sha256 ASC, im.item_id ASC
        """
    ).fetchall()
    media_dir.mkdir(parents=True, exist_ok=True)
    entries: list[dict] = []
    seen: set[str] = set()
    for r in rows:
        src = _resolve_media_path(r["local_path"], settings)
        if src is None:
            log.warning("media_missing", sha=r["sha256"], path=r["local_path"])
            continue
        ext = (r["ext"] or "").lstrip(".") or _sniff_ext(src)
        fname = f"{r['sha256'][:12]}.{ext}"
        if r["sha256"] not in seen:
            shutil.copyfile(src, media_dir / fname)
            seen.add(r["sha256"])
        entries.append(
            {
                "file": fname,
                "sha256": r["sha256"],
                "item_id": r["item_id"],
                "permalink": r["permalink"],
                "subreddit": r["subreddit"],
                "title": _truncate(r["title"], 300) or None,
                "created_utc": r["created_utc"],
                "score": r["score"],
                "width": r["width"],
                "height": r["height"],
            }
        )
    return entries


# ── orchestrator ──────────────────────────────────────────────────


def run_webexport(conn: sqlite3.Connection, settings: Settings) -> dict:
    from ..analysis import load_analysis
    from ..analysis.runner import run_analysis

    data_dir = settings.web_data_dir
    public_dir = settings.web_public_dir
    written: list[str] = []

    profile = build_profile(conn, settings)
    if profile is not None:
        written.append(str(_write_json(data_dir / "profile.json", profile)))
    persona = build_persona(profile)
    if persona is not None:
        written.append(str(_write_json(data_dir / "persona.json", persona)))

    analysis = load_analysis(settings) or run_analysis(conn, settings)
    written.append(str(_write_json(data_dir / "analysis.json", analysis)))
    written.append(str(_write_json(data_dir / "timeline.json", build_timeline(conn))))
    written.append(str(_write_json(data_dir / "hall_of_fame.json", build_hall_of_fame(conn))))
    written.append(str(_write_json(data_dir / "examples.json", build_examples(conn))))

    media_entries = export_media(conn, settings, public_dir / "media")
    written.append(str(_write_json(data_dir / "media.json", media_entries)))
    media_ids = frozenset(e["item_id"] for e in media_entries)

    manifest, shards, default_page = build_browse(conn, media_ids)
    browse_dir = public_dir / "data" / "browse"
    written.append(str(_write_json(browse_dir / "index.json", manifest)))
    written.append(str(_write_json(browse_dir / "default.json", default_page)))
    for fname, items in sorted(shards.items()):
        _write_json(browse_dir / fname, items)

    out = {
        "data_dir": str(data_dir),
        "public_dir": str(public_dir),
        "files_written": len(written) + len(shards),
        "browse_shards": len(shards),
        "media_files": len(media_ids),
        "examples": len(json.loads((data_dir / "examples.json").read_text(encoding="utf-8"))),
        "has_dossier": profile is not None,
    }
    log.info("webexport_done", **out)
    return out
