"""Source adapters: fetch raw data and normalize to NormalizedItem."""

from __future__ import annotations

from .arcticshift import ArcticShiftSource
from .base import ArchiveSource
from .gdpr import GdprSource, gdpr_files_present
from .praw_source import PrawSource
from .pullpush import PullPushSource

__all__ = [
    "ArchiveSource",
    "ArcticShiftSource",
    "GdprSource",
    "PrawSource",
    "PullPushSource",
    "gdpr_files_present",
]
