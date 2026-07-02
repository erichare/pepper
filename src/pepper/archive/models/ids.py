"""Reddit fullname parsing and reconstruction.

Reddit identifies things by a *fullname*: a type prefix plus a base-36 id,
e.g. ``t3_abc123`` (a submission/link) or ``t1_def456`` (a comment). The GDPR
export gives bare base-36 ids in separate posts/comments files, so we
reconstruct fullnames to obtain a single canonical key across all sources.
"""

from __future__ import annotations

import re

from .enums import ItemType

_PREFIX_BY_TYPE = {ItemType.COMMENT: "t1", ItemType.SUBMISSION: "t3"}
_TYPE_BY_PREFIX = {"t1": ItemType.COMMENT, "t3": ItemType.SUBMISSION}

# base36 = digits + lowercase letters. Reddit ids are case-insensitive base36.
_FULLNAME_RE = re.compile(r"^(t[0-9])_([0-9a-z]+)$", re.IGNORECASE)
_BASE36_RE = re.compile(r"^[0-9a-z]+$", re.IGNORECASE)


def make_fullname(item_type: ItemType, base36: str) -> str:
    """Build a fullname from a type and a bare base-36 id.

    Accepts an already-prefixed id and validates its prefix matches ``item_type``.
    """
    base36 = base36.strip()
    m = _FULLNAME_RE.match(base36)
    if m:
        prefix, bare = m.group(1).lower(), m.group(2).lower()
        expected = _PREFIX_BY_TYPE[item_type]
        if prefix != expected:
            raise ValueError(f"id {base36!r} has prefix {prefix!r}, expected {expected!r}")
        return f"{prefix}_{bare}"
    if not _BASE36_RE.match(base36):
        raise ValueError(f"invalid base36 id: {base36!r}")
    return f"{_PREFIX_BY_TYPE[item_type]}_{base36.lower()}"


def parse_fullname(fullname: str) -> tuple[ItemType, str]:
    """Split a fullname into (type, base36). Raises on unknown/malformed input."""
    m = _FULLNAME_RE.match(fullname.strip())
    if not m:
        raise ValueError(f"not a fullname: {fullname!r}")
    prefix, base36 = m.group(1).lower(), m.group(2).lower()
    if prefix not in _TYPE_BY_PREFIX:
        raise ValueError(f"unsupported fullname prefix: {prefix!r}")
    return _TYPE_BY_PREFIX[prefix], base36


def base36_of(fullname: str) -> str:
    """Return the bare base-36 portion of a fullname."""
    return parse_fullname(fullname)[1]


def is_fullname(value: str) -> bool:
    m = _FULLNAME_RE.match(value.strip())
    return bool(m and m.group(1).lower() in _TYPE_BY_PREFIX)


def permalink_to_fullnames(permalink: str) -> tuple[str | None, str | None]:
    """Extract (submission_fullname, comment_fullname) from a Reddit permalink.

    Comment permalinks look like ``/r/<sub>/comments/<postid>/<slug>/<commentid>/``.
    Returns ``(t3_<postid>, t1_<commentid>)`` where present, else ``None`` per slot.
    """
    if not permalink:
        return None, None
    m = re.search(
        r"/comments/([0-9a-z]+)(?:/[^/]*(?:/([0-9a-z]+))?)?/?",
        permalink,
        re.IGNORECASE,
    )
    if not m:
        return None, None
    post_id = m.group(1)
    comment_id = m.group(2)
    sub_fn = f"t3_{post_id.lower()}" if post_id else None
    com_fn = f"t1_{comment_id.lower()}" if comment_id else None
    return sub_fn, com_fn
