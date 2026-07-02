"""Map Reddit GDPR export CSV rows to NormalizedItem.

Reddit's export column names have drifted over the years, so matching is
case-insensitive with aliases. Known shapes:

* posts.csv:    id, permalink, date, ip, subreddit, gildings, title, url, body
* comments.csv: id, permalink, date, ip, subreddit, gildings, link, parent, body, media
"""

from __future__ import annotations

import json
from datetime import UTC, datetime

from ..models import ItemType, NormalizedItem, is_fullname, make_fullname, permalink_to_fullnames
from .clean import clean_text, full_permalink

_DATE_FORMATS = (
    "%Y-%m-%d %H:%M:%S %Z",
    "%Y-%m-%d %H:%M:%S UTC",
    "%Y-%m-%d %H:%M:%S",
    "%Y-%m-%dT%H:%M:%S%z",
    "%Y-%m-%dT%H:%M:%S.%f%z",
    "%Y-%m-%dT%H:%M:%SZ",
)


def _lower_keys(row: dict) -> dict:
    return {str(k).strip().lower(): v for k, v in row.items()}


def _pick(row: dict, *names: str) -> str | None:
    for n in names:
        if n in row and row[n] not in (None, ""):
            return str(row[n])
    return None


def _parse_date(value: str | None) -> int | None:
    if not value:
        return None
    v = value.strip()
    # numeric epoch?
    try:
        return int(float(v))
    except ValueError:
        pass
    v_norm = v.replace("UTC", "").strip()
    for fmt in _DATE_FORMATS:
        try:
            dt = datetime.strptime(v if "%Z" in fmt or "%z" in fmt else v_norm, fmt)
            if dt.tzinfo is None:
                dt = dt.replace(tzinfo=UTC)
            return int(dt.timestamp())
        except ValueError:
            continue
    return None


def map_gdpr_post_row(row: dict, *, observed_utc: int) -> NormalizedItem:
    r = _lower_keys(row)
    base36 = str(_pick(r, "id") or "").split("_")[-1]
    fullname = make_fullname(ItemType.SUBMISSION, base36)
    return NormalizedItem(
        id=fullname,
        type=ItemType.SUBMISSION,
        base36=base36,
        author=None,  # export omits author (it's you); left None, merge recovers from live
        subreddit=_pick(r, "subreddit"),
        created_utc=_parse_date(_pick(r, "date", "created", "created_utc")),
        title=clean_text(_pick(r, "title")),
        body=clean_text(_pick(r, "body", "selftext")),
        url=_pick(r, "url"),
        permalink=full_permalink(_pick(r, "permalink")),
        status_hint=_status_from_body(_pick(r, "body")),
        source="gdpr",
        observed_utc=observed_utc,
        raw_json=json.dumps(r, default=str, sort_keys=True),
    )


def map_gdpr_comment_row(row: dict, *, observed_utc: int) -> NormalizedItem:
    r = _lower_keys(row)
    base36 = str(_pick(r, "id") or "").split("_")[-1]
    fullname = make_fullname(ItemType.COMMENT, base36)

    permalink = full_permalink(_pick(r, "permalink"))
    link_id = _resolve_link_id(r, permalink)
    parent_id = _resolve_parent_id(r, link_id)

    return NormalizedItem(
        id=fullname,
        type=ItemType.COMMENT,
        base36=base36,
        author=None,
        subreddit=_pick(r, "subreddit"),
        created_utc=_parse_date(_pick(r, "date", "created", "created_utc")),
        body=clean_text(_pick(r, "body")),
        permalink=permalink,
        link_id=link_id,
        parent_id=parent_id,
        status_hint=_status_from_body(_pick(r, "body")),
        source="gdpr",
        observed_utc=observed_utc,
        raw_json=json.dumps(r, default=str, sort_keys=True),
    )


def _resolve_link_id(r: dict, permalink: str | None) -> str | None:
    raw = _pick(r, "link_id", "link")
    if raw:
        if is_fullname(raw):
            return raw
        # a URL or bare id
        sub_fn, _ = permalink_to_fullnames(raw)
        if sub_fn:
            return sub_fn
        if raw.isalnum():
            return make_fullname(ItemType.SUBMISSION, raw)
    if permalink:
        sub_fn, _ = permalink_to_fullnames(permalink)
        return sub_fn
    return None


def _resolve_parent_id(r: dict, link_id: str | None) -> str | None:
    raw = _pick(r, "parent_id", "parent")
    if raw and is_fullname(raw):
        return raw
    # top-level comments parent the submission
    return link_id


def _status_from_body(body: str | None) -> str | None:
    if body is None:
        return None
    b = body.strip()
    if b == "[removed]":
        return "removed"
    if b == "[deleted]":
        return "deleted"
    return "active" if b else None
