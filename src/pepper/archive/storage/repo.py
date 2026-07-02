"""Repository: the only module that reads/writes the SQLite tables.

Central invariant: observations are upserted (one row per item+source, latest
wins) and the canonical ``items`` row is recomputed from *all* of an item's
observations via ``merge.merge_item``. Recompute is pure, so identical inputs
produce identical rows — the basis of idempotent re-runs.
"""

from __future__ import annotations

import json
import sqlite3
import time
from collections.abc import Iterator
from datetime import UTC, datetime

from ..models import (
    CanonicalItem,
    ContextItem,
    ItemScope,
    MediaAsset,
    NormalizedItem,
    Watermark,
)
from .merge import merge_item


def _now_utc() -> int:
    return int(time.time())


def _iso_now() -> str:
    return datetime.now(UTC).isoformat()


class Repo:
    def __init__(self, conn: sqlite3.Connection) -> None:
        self.conn = conn

    # ── run lifecycle ────────────────────────────────────────────
    def start_run(self, command: str, source: str | None = None, args: dict | None = None) -> int:
        cur = self.conn.execute(
            "INSERT INTO fetch_runs(started_at, command, source, args_json) VALUES (?,?,?,?)",
            (_iso_now(), command, source, json.dumps(args or {}, sort_keys=True)),
        )
        return int(cur.lastrowid)

    def finish_run(
        self, run_id: int, *, seen: int = 0, upserted: int = 0, error: str | None = None
    ) -> None:
        self.conn.execute(
            "UPDATE fetch_runs SET finished_at=?, items_seen=?, items_upserted=?, "
            "status=?, error=? WHERE run_id=?",
            (_iso_now(), seen, upserted, "error" if error else "ok", error, run_id),
        )

    # ── observations + canonical recompute ───────────────────────
    def record_observation(self, norm: NormalizedItem, run_id: int) -> None:
        """Upsert one source observation (latest wins per item+source)."""
        self.conn.execute(
            """
            INSERT INTO source_observations
                (item_id, item_scope, source, run_id, observed_utc, source_created_utc,
                 score, body, title, author, status_hint, edited_utc, norm_json, raw_json)
            VALUES (:item_id, 'item', :source, :run_id, :observed_utc, :created,
                    :score, :body, :title, :author, :status_hint, :edited, :norm, :raw)
            ON CONFLICT(item_id, item_scope, source) DO UPDATE SET
                run_id=excluded.run_id, observed_utc=excluded.observed_utc,
                source_created_utc=excluded.source_created_utc, score=excluded.score,
                body=excluded.body, title=excluded.title, author=excluded.author,
                status_hint=excluded.status_hint, edited_utc=excluded.edited_utc,
                norm_json=excluded.norm_json, raw_json=excluded.raw_json
            """,
            {
                "item_id": norm.id,
                "source": norm.source,
                "run_id": run_id,
                "observed_utc": norm.observed_utc,
                "created": norm.created_utc,
                "score": norm.score,
                "body": norm.body,
                "title": norm.title,
                "author": norm.author,
                "status_hint": norm.status_hint,
                "edited": norm.edited_utc,
                "norm": norm.model_dump_json(),
                "raw": norm.raw_json,
            },
        )

    def _observations_for(self, item_id: str) -> list[NormalizedItem]:
        rows = self.conn.execute(
            "SELECT norm_json FROM source_observations WHERE item_id=? AND item_scope='item'",
            (item_id,),
        ).fetchall()
        return [NormalizedItem.model_validate_json(r["norm_json"]) for r in rows]

    def recompute_canonical(self, item_id: str) -> CanonicalItem | None:
        obs = self._observations_for(item_id)
        if not obs:
            return None
        canon = merge_item(obs)
        self._upsert_canonical(canon)
        return canon

    def _upsert_canonical(self, c: CanonicalItem) -> None:
        now = _now_utc()
        self.conn.execute(
            """
            INSERT INTO items
                (id, type, base36, author, author_fullname, subreddit, subreddit_id,
                 created_utc, retrieved_utc, title, body, body_source, url, permalink,
                 is_self, over_18, spoiler, link_id, parent_id, score, score_source,
                 num_comments, upvote_ratio, total_awards, edited_utc, status, raw_json,
                 first_seen_utc, last_updated_utc, sources_bitmask)
            VALUES
                (:id, :type, :base36, :author, :author_fullname, :subreddit, :subreddit_id,
                 :created_utc, :retrieved_utc, :title, :body, :body_source, :url, :permalink,
                 :is_self, :over_18, :spoiler, :link_id, :parent_id, :score, :score_source,
                 :num_comments, :upvote_ratio, :total_awards, :edited_utc, :status, :raw_json,
                 :now, :now, :bitmask)
            ON CONFLICT(id) DO UPDATE SET
                type=excluded.type, base36=excluded.base36, author=excluded.author,
                author_fullname=excluded.author_fullname, subreddit=excluded.subreddit,
                subreddit_id=excluded.subreddit_id, created_utc=excluded.created_utc,
                retrieved_utc=excluded.retrieved_utc, title=excluded.title, body=excluded.body,
                body_source=excluded.body_source, url=excluded.url, permalink=excluded.permalink,
                is_self=excluded.is_self, over_18=excluded.over_18, spoiler=excluded.spoiler,
                link_id=excluded.link_id, parent_id=excluded.parent_id, score=excluded.score,
                score_source=excluded.score_source, num_comments=excluded.num_comments,
                upvote_ratio=excluded.upvote_ratio, total_awards=excluded.total_awards,
                edited_utc=excluded.edited_utc, status=excluded.status, raw_json=excluded.raw_json,
                last_updated_utc=excluded.last_updated_utc, sources_bitmask=excluded.sources_bitmask
            """,
            {
                "id": c.id,
                "type": c.type.value,
                "base36": c.base36,
                "author": c.author,
                "author_fullname": c.author_fullname,
                "subreddit": c.subreddit,
                "subreddit_id": c.subreddit_id,
                "created_utc": c.created_utc,
                "retrieved_utc": c.retrieved_utc,
                "title": c.title,
                "body": c.body,
                "body_source": c.body_source,
                "url": c.url,
                "permalink": c.permalink,
                "is_self": _b(c.is_self),
                "over_18": _b(c.over_18),
                "spoiler": _b(c.spoiler),
                "link_id": c.link_id,
                "parent_id": c.parent_id,
                "score": c.score,
                "score_source": c.score_source,
                "num_comments": c.num_comments,
                "upvote_ratio": c.upvote_ratio,
                "total_awards": c.total_awards,
                "edited_utc": c.edited_utc,
                "status": c.status.value,
                "raw_json": c.raw_json,
                "now": now,
                "bitmask": c.sources_bitmask,
            },
        )

    def upsert_items(self, norms: list[NormalizedItem], run_id: int) -> int:
        """Record observations for a batch, then recompute affected canonical rows.

        Returns the number of distinct items upserted.
        """
        touched: set[str] = set()
        self.conn.execute("BEGIN")
        try:
            for norm in norms:
                self.record_observation(norm, run_id)
                touched.add(norm.id)
            for item_id in touched:
                self.recompute_canonical(item_id)
            self.conn.execute("COMMIT")
        except Exception:
            self.conn.execute("ROLLBACK")
            raise
        return len(touched)

    # ── context items ────────────────────────────────────────────
    def upsert_context(self, ctx: ContextItem) -> None:
        now = _now_utc()
        self.conn.execute(
            """
            INSERT INTO context_items
                (id, type, author, subreddit, created_utc, title, body, permalink, status,
                 raw_json, first_seen_utc, last_updated_utc)
            VALUES (:id,:type,:author,:subreddit,:created,:title,:body,:permalink,:status,:raw,:now,:now)
            ON CONFLICT(id) DO UPDATE SET
                type=excluded.type, author=excluded.author, subreddit=excluded.subreddit,
                created_utc=excluded.created_utc, title=excluded.title, body=excluded.body,
                permalink=excluded.permalink, status=excluded.status, raw_json=excluded.raw_json,
                last_updated_utc=excluded.last_updated_utc
            """,
            {
                "id": ctx.id,
                "type": ctx.type.value,
                "author": ctx.author,
                "subreddit": ctx.subreddit,
                "created": ctx.created_utc,
                "title": ctx.title,
                "body": ctx.body,
                "permalink": ctx.permalink,
                "status": ctx.status.value,
                "raw": ctx.raw_json,
                "now": now,
            },
        )

    def link_context(self, comment_id: str, context_id: str, relation: str) -> None:
        self.conn.execute(
            "INSERT OR IGNORE INTO context_links(comment_id, context_id, relation) VALUES (?,?,?)",
            (comment_id, context_id, relation),
        )

    def context_exists(self, context_id: str) -> bool:
        row = self.conn.execute(
            "SELECT 1 FROM context_items WHERE id=?", (context_id,)
        ).fetchone()
        return row is not None

    # ── media ─────────────────────────────────────────────────────
    def upsert_media_asset(self, a: MediaAsset) -> None:
        self.conn.execute(
            """
            INSERT INTO media_assets
                (sha256, kind, ext, bytes, width, height, duration_s, local_path,
                 downloaded_utc, downloader, has_audio)
            VALUES (:sha,:kind,:ext,:bytes,:w,:h,:dur,:path,:dl,:downloader,:audio)
            ON CONFLICT(sha256) DO UPDATE SET
                kind=excluded.kind, ext=excluded.ext, bytes=excluded.bytes,
                width=excluded.width, height=excluded.height, duration_s=excluded.duration_s,
                local_path=excluded.local_path, downloader=excluded.downloader,
                has_audio=excluded.has_audio
            """,
            {
                "sha": a.sha256,
                "kind": a.kind.value,
                "ext": a.ext,
                "bytes": a.bytes,
                "w": a.width,
                "h": a.height,
                "dur": a.duration_s,
                "path": a.local_path,
                "dl": a.downloaded_utc,
                "downloader": a.downloader,
                "audio": _b(a.has_audio),
            },
        )

    def link_media(
        self,
        item_id: str,
        source_url: str,
        *,
        scope: ItemScope = ItemScope.ITEM,
        sha256: str | None = None,
        gallery_index: int | None = None,
        kind: str | None = None,
        download_status: str = "ok",
        error: str | None = None,
    ) -> None:
        self.conn.execute(
            """
            INSERT INTO item_media
                (item_id, item_scope, sha256, source_url, gallery_index, kind, download_status, error)
            VALUES (?,?,?,?,?,?,?,?)
            ON CONFLICT(item_id, item_scope, source_url) DO UPDATE SET
                sha256=excluded.sha256, gallery_index=excluded.gallery_index,
                kind=excluded.kind, download_status=excluded.download_status, error=excluded.error
            """,
            (item_id, scope.value, sha256, source_url, gallery_index, kind, download_status, error),
        )

    def media_url_done(self, item_id: str, source_url: str, scope: ItemScope = ItemScope.ITEM) -> bool:
        row = self.conn.execute(
            "SELECT download_status FROM item_media WHERE item_id=? AND item_scope=? AND source_url=?",
            (item_id, scope.value, source_url),
        ).fetchone()
        return bool(row and row["download_status"] == "ok")

    def asset_by_hash(self, sha256: str) -> sqlite3.Row | None:
        return self.conn.execute(
            "SELECT * FROM media_assets WHERE sha256=?", (sha256,)
        ).fetchone()

    # ── watermarks ───────────────────────────────────────────────
    def get_watermark(self, source: str, stream: str) -> Watermark:
        row = self.conn.execute(
            "SELECT * FROM source_watermarks WHERE source=? AND stream=?", (source, stream)
        ).fetchone()
        if not row:
            return Watermark(source=source, stream=stream)
        return Watermark(
            source=source,
            stream=stream,
            newest_created_utc=row["newest_created_utc"],
            oldest_created_utc=row["oldest_created_utc"],
            last_run_id=row["last_run_id"],
            last_run_utc=row["last_run_utc"],
        )

    def update_watermark(
        self,
        source: str,
        stream: str,
        *,
        newest: int | None = None,
        oldest: int | None = None,
        run_id: int | None = None,
    ) -> None:
        wm = self.get_watermark(source, stream)
        new_newest = max([v for v in (wm.newest_created_utc, newest) if v is not None], default=None)
        new_oldest = min([v for v in (wm.oldest_created_utc, oldest) if v is not None], default=None)
        self.conn.execute(
            """
            INSERT INTO source_watermarks
                (source, stream, newest_created_utc, oldest_created_utc, last_run_id, last_run_utc)
            VALUES (?,?,?,?,?,?)
            ON CONFLICT(source, stream) DO UPDATE SET
                newest_created_utc=excluded.newest_created_utc,
                oldest_created_utc=excluded.oldest_created_utc,
                last_run_id=excluded.last_run_id, last_run_utc=excluded.last_run_utc
            """,
            (source, stream, new_newest, new_oldest, run_id, _now_utc()),
        )

    # ── queries used by analysis/report/other stages ─────────────
    def count_items(self, item_type: str | None = None) -> int:
        if item_type:
            row = self.conn.execute(
                "SELECT COUNT(*) c FROM items WHERE type=?", (item_type,)
            ).fetchone()
        else:
            row = self.conn.execute("SELECT COUNT(*) c FROM items").fetchone()
        return int(row["c"])

    def has_item(self, item_id: str) -> bool:
        return self.conn.execute("SELECT 1 FROM items WHERE id=?", (item_id,)).fetchone() is not None

    def iter_items(self, item_type: str | None = None) -> Iterator[sqlite3.Row]:
        sql = "SELECT * FROM items"
        params: tuple = ()
        if item_type:
            sql += " WHERE type=?"
            params = (item_type,)
        sql += " ORDER BY type, created_utc, id"
        yield from self.conn.execute(sql, params)

    def iter_comments_needing_context(self) -> Iterator[sqlite3.Row]:
        yield from self.conn.execute(
            "SELECT * FROM items WHERE type='comment' ORDER BY created_utc"
        )

    def status_summary(self) -> dict:
        rows = self.conn.execute(
            "SELECT type, status, COUNT(*) c FROM items GROUP BY type, status"
        ).fetchall()
        summary: dict = {"submission": {}, "comment": {}}
        for r in rows:
            summary.setdefault(r["type"], {})[r["status"]] = r["c"]
        return summary

    def context_pair_for(self, comment_row: sqlite3.Row) -> dict:
        """Return {'link': ContextItem-ish row|None, 'parent': ...} for a comment."""
        out: dict = {}
        for rel in ("link", "parent"):
            link = self.conn.execute(
                "SELECT ci.* FROM context_links cl JOIN context_items ci ON ci.id=cl.context_id "
                "WHERE cl.comment_id=? AND cl.relation=? LIMIT 1",
                (comment_row["id"], rel),
            ).fetchone()
            out[rel] = link
        return out


def _b(v: bool | None) -> int | None:
    return None if v is None else int(bool(v))
