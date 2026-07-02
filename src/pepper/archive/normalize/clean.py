"""Small pure helpers for cleaning/normalizing source values."""

from __future__ import annotations

import html

from ..models import DELETED_BODY_MARKERS

REDDIT_BASE = "https://www.reddit.com"


def coerce_epoch(value) -> int | None:
    """Coerce a created/edited value to an int epoch, or None.

    Reddit's ``edited`` is ``False`` or a float epoch. Timestamps may arrive as
    numeric strings. Sub-second and ms values are handled leniently.
    """
    if value is None or value is False:
        return None
    if value is True:
        return None
    try:
        n = float(value)
    except (TypeError, ValueError):
        return None
    if n <= 0:
        return None
    # crude ms -> s correction (anything past year ~5138 is almost certainly ms)
    if n > 1e12:
        n /= 1000.0
    return int(n)


def clean_text(value: str | None) -> str | None:
    """HTML-unescape body/title text; preserve deletion markers verbatim."""
    if value is None:
        return None
    if value in DELETED_BODY_MARKERS:
        return value
    return html.unescape(value)


def is_deleted_marker(value: str | None) -> bool:
    return value is not None and value.strip() in DELETED_BODY_MARKERS


def full_permalink(permalink: str | None) -> str | None:
    """Ensure a permalink is an absolute reddit.com URL."""
    if not permalink:
        return None
    if permalink.startswith("http://") or permalink.startswith("https://"):
        return permalink
    if not permalink.startswith("/"):
        permalink = "/" + permalink
    return REDDIT_BASE + permalink


def to_bool(value) -> bool | None:
    if value is None:
        return None
    if isinstance(value, bool):
        return value
    if isinstance(value, (int, float)):
        return bool(value)
    if isinstance(value, str):
        v = value.strip().lower()
        if v in {"true", "1", "yes", "t"}:
            return True
        if v in {"false", "0", "no", "f", ""}:
            return False
    return None
