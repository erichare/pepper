"""Fetch the parent submission + direct parent comment for each comment.

Parents are authored by other users, so they land in ``context_items`` (kept
separate from the subject's corpus) and are wired to the originating comment via
``context_links``. Driven by any source exposing ``fetch_by_fullnames`` — the
Reddit API (PRAW ``info()``) when configured, otherwise Arctic Shift's by-id
endpoint, so context works without Reddit credentials.
"""

from __future__ import annotations

from ..errors import SourceError
from ..logging import get_logger
from ..models import ContextItem, ItemStatus, ItemType, is_fullname
from ..normalize import map_reddit_obj

log = get_logger(__name__)

_STATUS = {
    "removed": ItemStatus.REMOVED_BY_MOD,
    "deleted": ItemStatus.DELETED_BY_USER,
    "active": ItemStatus.ACTIVE,
}


def _to_context_item(fullname: str, data: dict, item_type: ItemType) -> ContextItem:
    norm = map_reddit_obj(data, source="praw", observed_utc=0, item_type=item_type)
    return ContextItem(
        id=fullname,
        type=item_type,
        author=norm.author,
        subreddit=norm.subreddit,
        created_utc=norm.created_utc,
        title=norm.title,
        body=norm.body,
        permalink=norm.permalink,
        status=_STATUS.get(norm.status_hint or "", ItemStatus.UNKNOWN),
        raw_json=norm.raw_json,
    )


def fetch_context(repo, parent_source, *, commit_every: int = 200) -> dict:
    """Populate context_items/context_links for all comments. Returns stats.

    ``parent_source`` is anything exposing ``fetch_by_fullnames`` (PrawSource or
    ArcticShiftSource). Parents are committed in batches so a large run is
    resumable — an interrupted fetch keeps its progress and a re-run only fetches
    the parents still missing (guarded by ``context_exists``).
    """
    # 1) gather parent fullnames per comment
    comment_links: list[tuple[str, str | None, str | None]] = []
    needed: set[str] = set()
    for row in repo.iter_comments_needing_context():
        link_id = row["link_id"] if is_fullname(row["link_id"] or "") else None
        parent_id = row["parent_id"] if is_fullname(row["parent_id"] or "") else None
        comment_links.append((row["id"], link_id, parent_id))
        for fn in (link_id, parent_id):
            if fn:
                needed.add(fn)

    # 2) fetch parents still missing from context_items (incremental commits)
    to_fetch = sorted(fn for fn in needed if not repo.context_exists(fn))
    fetched = 0
    if to_fetch and parent_source is not None:
        fetched = _fetch_parents(repo, parent_source, to_fetch, commit_every=commit_every)
    elif to_fetch and parent_source is None:
        log.warning("context_no_source", needed=len(to_fetch))

    # 3) wire links (only where the context row exists)
    linked = 0
    repo.conn.execute("BEGIN")
    try:
        for comment_id, link_id, parent_id in comment_links:
            if link_id and repo.context_exists(link_id):
                repo.link_context(comment_id, link_id, "link")
                linked += 1
            if parent_id and parent_id != link_id and repo.context_exists(parent_id):
                repo.link_context(comment_id, parent_id, "parent")
                linked += 1
        repo.conn.execute("COMMIT")
    except Exception:
        repo.conn.execute("ROLLBACK")
        raise

    return {"comments": len(comment_links), "parents_needed": len(needed), "fetched": fetched, "links": linked}


def _fetch_parents(repo, source, to_fetch: list[str], *, commit_every: int) -> int:
    """Fetch + upsert parents, committing every ``commit_every`` rows.

    A source throttle/outage (SourceError) commits progress so far and stops
    gracefully; the caller's return still reflects what was persisted, and a
    re-run resumes on the parents that remain missing.
    """
    fetched = 0
    pending = 0
    repo.conn.execute("BEGIN")
    try:
        for fullname, data, item_type in source.fetch_by_fullnames(to_fetch):
            repo.upsert_context(_to_context_item(fullname, data, item_type))
            fetched += 1
            pending += 1
            if pending >= commit_every:
                repo.conn.execute("COMMIT")
                repo.conn.execute("BEGIN")
                pending = 0
        repo.conn.execute("COMMIT")
    except SourceError as e:
        repo.conn.execute("COMMIT")  # keep everything fetched before the failure
        log.warning("context_fetch_incomplete", fetched=fetched, error=str(e))
    except Exception:
        repo.conn.execute("COMMIT")  # preserve progress, then surface the error
        raise
    return fetched
