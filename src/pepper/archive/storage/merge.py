"""Pure field-level merge of per-source observations into a canonical item.

``merge_item`` is a pure function of the list of ``NormalizedItem`` observations
for a single id. This is what makes upserts idempotent: re-running with the same
observations yields a byte-identical canonical row.

Precedence summary (see models.enums):
* content (body/title/created_utc/structural): GDPR > ArcticShift > PullPush > PRAW,
  first non-empty; for body/title, non-deleted values win over ``[deleted]``.
* live metrics (score/ratio/num_comments/awards): freshest live source by observed_utc.
* status: derived from removal/deletion signals across all sources.
"""

from __future__ import annotations

import contextlib
from collections.abc import Iterable, Sequence

from ..models import (
    CONTENT_PRECEDENCE,
    DELETED_BODY_MARKERS,
    LIVE_SOURCES,
    CanonicalItem,
    ItemStatus,
    NormalizedItem,
    Source,
)


def _precedence_index(source: str) -> int:
    try:
        return CONTENT_PRECEDENCE.index(source)
    except ValueError:
        return len(CONTENT_PRECEDENCE)


def _by_content_precedence(obs: Sequence[NormalizedItem]) -> list[NormalizedItem]:
    return sorted(obs, key=lambda o: _precedence_index(o.source))


def _is_deleted_body(body: str | None) -> bool:
    return body is not None and body.strip() in DELETED_BODY_MARKERS


def _has_text(body: str | None) -> bool:
    return bool(body and body.strip() and body.strip() not in DELETED_BODY_MARKERS)


def _first(values: Iterable):
    for v in values:
        if v is not None:
            return v
    return None


def _pick_content(
    ordered: list[NormalizedItem], attr: str
) -> tuple[str | None, str | None]:
    """Pick the best text value for ``attr`` (body/title), preferring real text.

    Returns (value, winning_source).
    """
    # 1) first real (non-deleted, non-empty) value by precedence
    for o in ordered:
        val = getattr(o, attr)
        if _has_text(val):
            return val, o.source
    # 2) fall back to first non-null value at all (likely "[deleted]")
    for o in ordered:
        val = getattr(o, attr)
        if val is not None:
            return val, o.source
    return None, None


def _pick_live_metric(obs: Sequence[NormalizedItem], attr: str):
    """Freshest live-source value for a volatile metric; else best-effort fallback."""
    live = [o for o in obs if o.source in LIVE_SOURCES and getattr(o, attr) is not None]
    if live:
        best = max(live, key=lambda o: o.observed_utc)
        return getattr(best, attr), best.source
    for o in _by_content_precedence(obs):
        if getattr(o, attr) is not None:
            return getattr(o, attr), o.source
    return None, None


def _derive_status(obs: Sequence[NormalizedItem]) -> ItemStatus:
    removed = any(
        (o.status_hint or "").lower() == "removed" or (o.body or "").strip() == "[removed]"
        for o in obs
    )
    if removed:
        return ItemStatus.REMOVED_BY_MOD

    deleted_signal = any(
        (o.body or "").strip() == "[deleted]"
        or (o.author or "").strip() == "[deleted]"
        or (o.status_hint or "").lower() == "deleted"
        for o in obs
    )
    if deleted_signal:
        return ItemStatus.DELETED_BY_USER

    has_real_body = any(_has_text(o.body) or _has_text(o.title) for o in obs)
    live_present = any(o.source in LIVE_SOURCES for o in obs)
    if has_real_body and live_present:
        return ItemStatus.ACTIVE
    return ItemStatus.UNKNOWN


def merge_item(obs: Sequence[NormalizedItem]) -> CanonicalItem:
    """Merge all observations for one id into a canonical row."""
    if not obs:
        raise ValueError("merge_item requires at least one observation")

    ordered = _by_content_precedence(obs)
    head = ordered[0]

    # identity — must be consistent across sources; trust precedence head
    item_id = head.id
    item_type = head.type
    base36 = head.base36

    # created_utc: authoritative from highest-precedence source that has it
    created_utc = _first(o.created_utc for o in ordered)
    if created_utc is None:
        # last resort: any observed_utc so the NOT NULL column is satisfied
        created_utc = _first(o.observed_utc for o in obs) or 0

    body, body_source = _pick_content(ordered, "body")
    title, _title_source = _pick_content(ordered, "title")

    # author: prefer a real (non-deleted) author by precedence
    author = None
    for o in ordered:
        a = (o.author or "").strip()
        if a and a != "[deleted]":
            author = o.author
            break
    author_fullname = _first(o.author_fullname for o in ordered)

    # structural fields: first non-null by content precedence
    subreddit = _first(o.subreddit for o in ordered)
    subreddit_id = _first(o.subreddit_id for o in ordered)
    url = _first(o.url for o in ordered)
    permalink = _first(o.permalink for o in ordered)
    is_self = _first(o.is_self for o in ordered)
    over_18 = _first(o.over_18 for o in ordered)
    spoiler = _first(o.spoiler for o in ordered)
    link_id = _first(o.link_id for o in ordered)
    parent_id = _first(o.parent_id for o in ordered)

    # volatile metrics: freshest live source
    score, score_source = _pick_live_metric(obs, "score")
    upvote_ratio, _ = _pick_live_metric(obs, "upvote_ratio")
    num_comments, _ = _pick_live_metric(obs, "num_comments")
    total_awards, _ = _pick_live_metric(obs, "total_awards")

    # edited: most recent edit reported by any source
    edited_values = [o.edited_utc for o in obs if o.edited_utc]
    edited_utc = max(edited_values) if edited_values else None

    # when we last saw it from a live source
    live_obs_times = [o.observed_utc for o in obs if o.source in LIVE_SOURCES and o.observed_utc]
    retrieved_utc = max(live_obs_times) if live_obs_times else None

    status = _derive_status(obs)

    # raw_json: from the source that supplied the winning body, else precedence head
    raw_json = head.raw_json
    if body_source is not None:
        for o in ordered:
            if o.source == body_source:
                raw_json = o.raw_json
                break

    bitmask = 0
    for o in obs:
        with contextlib.suppress(KeyError):
            bitmask |= int(Source.from_name(o.source))

    return CanonicalItem(
        id=item_id,
        type=item_type,
        base36=base36,
        author=author,
        author_fullname=author_fullname,
        subreddit=subreddit,
        subreddit_id=subreddit_id,
        created_utc=int(created_utc),
        retrieved_utc=retrieved_utc,
        title=title,
        body=body,
        body_source=body_source,
        url=url,
        permalink=permalink,
        is_self=is_self,
        over_18=over_18,
        spoiler=spoiler,
        link_id=link_id,
        parent_id=parent_id,
        score=score,
        score_source=score_source,
        num_comments=num_comments,
        upvote_ratio=upvote_ratio,
        total_awards=total_awards,
        edited_utc=edited_utc,
        status=status,
        raw_json=raw_json,
        sources_bitmask=bitmask,
    )
