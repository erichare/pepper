"""Enumerations shared across the archive subsystem."""

from __future__ import annotations

from enum import IntFlag, StrEnum


class ItemType(StrEnum):
    """Kind of Reddit content the subject authored."""

    SUBMISSION = "submission"
    COMMENT = "comment"


class ItemScope(StrEnum):
    """Whether a record belongs to the subject's corpus or is fetched context."""

    ITEM = "item"
    CONTEXT = "context"


class ItemStatus(StrEnum):
    """Lifecycle state derived at merge time from all source observations."""

    ACTIVE = "active"
    DELETED_BY_USER = "deleted_by_user"
    REMOVED_BY_MOD = "removed_by_mod"
    UNKNOWN = "unknown"


class MediaKind(StrEnum):
    IMAGE = "image"
    VIDEO = "video"
    GALLERY_IMAGE = "gallery_image"
    AUDIO = "audio"
    OTHER = "other"


class DownloadStatus(StrEnum):
    OK = "ok"
    FAILED = "failed"
    SKIPPED = "skipped"
    LINK_ROT = "link_rot"


class Source(IntFlag):
    """Bit-flag set of the layers that have contributed to an item.

    Values are stable and persisted in ``items.sources_bitmask``; do not
    renumber. Merge precedence for content fields is GDPR > ARCTICSHIFT >
    PULLPUSH > PRAW (see ``storage.merge``).
    """

    NONE = 0
    GDPR = 1
    PRAW = 2
    ARCTICSHIFT = 4
    PULLPUSH = 8

    @classmethod
    def from_name(cls, name: str) -> Source:
        """Map a lowercase source string (as stored in the DB) to a flag."""
        return {
            "gdpr": cls.GDPR,
            "praw": cls.PRAW,
            "arcticshift": cls.ARCTICSHIFT,
            "pullpush": cls.PULLPUSH,
        }[name]


# Precedence for choosing content fields (body/title/created_utc/author).
# Earlier = higher priority. Names match the DB `source` column values.
CONTENT_PRECEDENCE: tuple[str, ...] = ("gdpr", "arcticshift", "pullpush", "praw")

# Sources considered "live" (their scores/metrics reflect current Reddit state).
LIVE_SOURCES: frozenset[str] = frozenset({"praw", "arcticshift", "pullpush"})

# Markers Reddit uses for removed/deleted bodies.
DELETED_BODY_MARKERS: frozenset[str] = frozenset({"[deleted]", "[removed]"})
DELETED_AUTHOR_MARKERS: frozenset[str] = frozenset({"[deleted]", ""})
