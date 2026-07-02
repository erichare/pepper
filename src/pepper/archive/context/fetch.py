"""Fetch the parent submission + direct parent comment for each comment.

Parents are authored by other users, so they land in ``context_items`` (kept
separate from the subject's corpus) and are wired to the originating comment via
``context_links``. Uses PRAW ``info()`` (100 fullnames/call). If the Reddit API
isn't configured, context is skipped with a warning — history/backfill still work.
"""

from __future__ import annotations

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


def fetch_context(repo, praw_source) -> dict:
    """Populate context_items/context_links for all comments. Returns stats."""
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

    # 2) which parents are missing from context_items
    to_fetch = sorted(fn for fn in needed if not repo.context_exists(fn))
    fetched = 0
    if to_fetch and praw_source is not None:
        repo.conn.execute("BEGIN")
        try:
            for fullname, data, item_type in praw_source.fetch_by_fullnames(to_fetch):
                repo.upsert_context(_to_context_item(fullname, data, item_type))
                fetched += 1
            repo.conn.execute("COMMIT")
        except Exception:
            repo.conn.execute("ROLLBACK")
            raise
    elif to_fetch and praw_source is None:
        log.warning("context_skipped_no_praw", needed=len(to_fetch))

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
