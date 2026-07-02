"""Map a Reddit-shaped dict (PRAW / Arctic Shift / PullPush) to NormalizedItem.

All three Reddit-derived sources share the classic Reddit/Pushshift field names,
so one mapper serves them; the caller supplies ``source`` and ``observed_utc``.
"""

from __future__ import annotations

import json

from ..models import ItemType, NormalizedItem, make_fullname
from .clean import clean_text, coerce_epoch, full_permalink, to_bool

# removed_by_category values that mean the *author* removed it, not a mod/admin.
_USER_DELETE_CATEGORIES = {"deleted", "author"}


def _get(data: dict, *keys):
    for k in keys:
        if k in data and data[k] is not None:
            return data[k]
    return None


def reddit_status_hint(data: dict) -> str | None:
    """Derive a per-source lifecycle hint: 'active' | 'deleted' | 'removed' | None."""
    body = (_get(data, "body", "selftext") or "")
    author = (_get(data, "author") or "")
    removed_cat = _get(data, "removed_by_category")
    banned_by = _get(data, "banned_by")

    if isinstance(body, str) and body.strip() == "[removed]":
        return "removed"
    if removed_cat and removed_cat not in _USER_DELETE_CATEGORIES:
        return "removed"
    if banned_by:
        return "removed"
    if removed_cat in _USER_DELETE_CATEGORIES:
        return "deleted"
    if isinstance(body, str) and body.strip() == "[deleted]":
        return "deleted"
    if isinstance(author, str) and author.strip() == "[deleted]":
        return "deleted"
    if body or _get(data, "title"):
        return "active"
    return None


def _infer_type(data: dict) -> ItemType:
    name = _get(data, "name") or ""
    if name.startswith("t3_") or "title" in data:
        return ItemType.SUBMISSION
    if name.startswith("t1_") or "body" in data:
        return ItemType.COMMENT
    # link_id present => it's a comment
    if _get(data, "link_id"):
        return ItemType.COMMENT
    return ItemType.SUBMISSION


def map_reddit_obj(
    data: dict,
    *,
    source: str,
    observed_utc: int,
    item_type: ItemType | None = None,
    raw_json: str | None = None,
) -> NormalizedItem:
    """Map a plain dict of Reddit fields into a NormalizedItem."""
    it = item_type or _infer_type(data)
    base36 = str(_get(data, "id") or "").split("_")[-1]
    fullname = make_fullname(it, base36)

    author = _get(data, "author")
    author_fullname = _get(data, "author_fullname")

    created = coerce_epoch(_get(data, "created_utc", "created"))
    edited = coerce_epoch(_get(data, "edited"))

    if it is ItemType.SUBMISSION:
        title = clean_text(_get(data, "title"))
        body = clean_text(_get(data, "selftext"))
    else:
        title = None
        body = clean_text(_get(data, "body"))

    permalink = full_permalink(_get(data, "permalink"))

    return NormalizedItem(
        id=fullname,
        type=it,
        base36=base36,
        author=author,
        author_fullname=author_fullname,
        subreddit=_get(data, "subreddit"),
        subreddit_id=_get(data, "subreddit_id"),
        created_utc=created,
        edited_utc=edited,
        title=title,
        body=body,
        url=_get(data, "url") if it is ItemType.SUBMISSION else None,
        permalink=permalink,
        is_self=to_bool(_get(data, "is_self")) if it is ItemType.SUBMISSION else None,
        over_18=to_bool(_get(data, "over_18")),
        spoiler=to_bool(_get(data, "spoiler")),
        link_id=_get(data, "link_id") if it is ItemType.COMMENT else None,
        parent_id=_get(data, "parent_id") if it is ItemType.COMMENT else None,
        score=_as_int(_get(data, "score")),
        num_comments=_as_int(_get(data, "num_comments")) if it is ItemType.SUBMISSION else None,
        upvote_ratio=_as_float(_get(data, "upvote_ratio")),
        total_awards=_as_int(_get(data, "total_awards_received", "total_awards")),
        status_hint=reddit_status_hint(data),
        source=source,
        observed_utc=observed_utc,
        raw_json=raw_json if raw_json is not None else json.dumps(data, default=str, sort_keys=True),
    )


def _as_int(v) -> int | None:
    try:
        return int(v) if v is not None else None
    except (TypeError, ValueError):
        return None


def _as_float(v) -> float | None:
    try:
        return float(v) if v is not None else None
    except (TypeError, ValueError):
        return None
