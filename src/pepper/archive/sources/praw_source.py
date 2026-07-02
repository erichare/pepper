"""Reddit official API source via PRAW.

Used for the *recent* window (new items + score refresh) and for hydrating
arbitrary fullnames — deliberately NOT for full history (the 1000-item listing
cap makes that impossible; the archives own history). Also serves context
lookups for comment parents.
"""

from __future__ import annotations

import json
import time
from collections.abc import Iterable, Iterator

from ..config import Settings
from ..logging import get_logger
from ..models import ItemType, NormalizedItem
from ..normalize import map_reddit_obj

log = get_logger(__name__)

# fields we pull off PRAW objects into a plain dict for the shared mapper
_SUBMISSION_ATTRS = (
    "id", "name", "author", "author_fullname", "subreddit", "subreddit_id",
    "created_utc", "title", "selftext", "url", "permalink", "is_self", "over_18",
    "spoiler", "score", "num_comments", "upvote_ratio", "total_awards_received",
    "edited", "removed_by_category", "banned_by",
)
_COMMENT_ATTRS = (
    "id", "name", "author", "author_fullname", "subreddit", "subreddit_id",
    "created_utc", "body", "permalink", "link_id", "parent_id", "score",
    "total_awards_received", "edited", "removed_by_category", "banned_by",
    "is_submitter",
)


def _obj_to_dict(obj, attrs: Iterable[str]) -> dict:
    out: dict = {}
    for a in attrs:
        try:
            val = getattr(obj, a)
        except Exception:  # noqa: BLE001 - PRAW lazy attrs can raise
            val = None
        if a in ("author", "subreddit") and val is not None:
            val = str(val)  # Redditor/Subreddit -> name
        out[a] = val
    return out


class PrawSource:
    name = "praw"

    def __init__(self, settings: Settings) -> None:
        import praw  # local import: only needed when creds present

        self.settings = settings
        self.username = settings.reddit_username.lstrip("u/").lstrip("/")
        kwargs = {
            "client_id": settings.reddit_client_id,
            "client_secret": settings.reddit_client_secret,
            "user_agent": settings.reddit_user_agent,
        }
        if settings.reddit_password:
            kwargs["username"] = self.username
            kwargs["password"] = settings.reddit_password
        self.reddit = praw.Reddit(**kwargs)
        self.reddit.read_only = not settings.reddit_password

    # ── recent listings (newest-first, capped at ~1000 by Reddit) ──
    def iter_recent(self, item_type: ItemType, limit: int | None = 1000) -> Iterator[NormalizedItem]:
        redditor = self.reddit.redditor(self.username)
        listing = (
            redditor.submissions.new(limit=limit)
            if item_type is ItemType.SUBMISSION
            else redditor.comments.new(limit=limit)
        )
        attrs = _SUBMISSION_ATTRS if item_type is ItemType.SUBMISSION else _COMMENT_ATTRS
        observed = int(time.time())
        for obj in listing:
            data = _obj_to_dict(obj, attrs)
            yield map_reddit_obj(
                data, source=self.name, observed_utc=observed, item_type=item_type,
                raw_json=json.dumps(data, default=str, sort_keys=True),
            )

    # ── hydrate arbitrary fullnames (score/status refresh) ─────────
    def hydrate(self, fullnames: list[str]) -> Iterator[NormalizedItem]:
        observed = int(time.time())
        for chunk in _chunks(fullnames, 100):
            for obj in self.reddit.info(fullnames=chunk):
                yield self._obj_to_norm(obj, observed)

    def _obj_to_norm(self, obj, observed: int) -> NormalizedItem:
        name = getattr(obj, "name", "") or ""
        it = ItemType.SUBMISSION if name.startswith("t3_") else ItemType.COMMENT
        attrs = _SUBMISSION_ATTRS if it is ItemType.SUBMISSION else _COMMENT_ATTRS
        data = _obj_to_dict(obj, attrs)
        return map_reddit_obj(
            data, source=self.name, observed_utc=observed, item_type=it,
            raw_json=json.dumps(data, default=str, sort_keys=True),
        )

    def fetch_by_fullnames(self, fullnames: list[str]) -> Iterator[tuple[str, dict, ItemType]]:
        """Yield (fullname, field-dict, type) for context parents."""
        for chunk in _chunks(fullnames, 100):
            for obj in self.reddit.info(fullnames=chunk):
                name = getattr(obj, "name", "") or ""
                it = ItemType.SUBMISSION if name.startswith("t3_") else ItemType.COMMENT
                attrs = _SUBMISSION_ATTRS if it is ItemType.SUBMISSION else _COMMENT_ATTRS
                yield name, _obj_to_dict(obj, attrs), it


def _chunks(seq: list[str], n: int) -> Iterator[list[str]]:
    for i in range(0, len(seq), n):
        yield seq[i : i + n]
