"""Domain models for the archive subsystem."""

from __future__ import annotations

from .enums import (
    CONTENT_PRECEDENCE,
    DELETED_AUTHOR_MARKERS,
    DELETED_BODY_MARKERS,
    LIVE_SOURCES,
    DownloadStatus,
    ItemScope,
    ItemStatus,
    ItemType,
    MediaKind,
    Source,
)
from .ids import (
    base36_of,
    is_fullname,
    make_fullname,
    parse_fullname,
    permalink_to_fullnames,
)
from .item import CanonicalItem, ContextItem, NormalizedItem
from .media import MediaAsset, MediaRef, MediaResult
from .provenance import FetchRun, SourceObservation, SourceStats, Watermark

__all__ = [
    "CONTENT_PRECEDENCE",
    "DELETED_AUTHOR_MARKERS",
    "DELETED_BODY_MARKERS",
    "LIVE_SOURCES",
    "CanonicalItem",
    "ContextItem",
    "DownloadStatus",
    "FetchRun",
    "ItemScope",
    "ItemStatus",
    "ItemType",
    "MediaAsset",
    "MediaKind",
    "MediaRef",
    "MediaResult",
    "NormalizedItem",
    "Source",
    "SourceObservation",
    "SourceStats",
    "Watermark",
    "base36_of",
    "is_fullname",
    "make_fullname",
    "parse_fullname",
    "permalink_to_fullnames",
]
