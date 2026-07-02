"""Typed exception hierarchy for the archive subsystem."""

from __future__ import annotations


class ArchiveError(Exception):
    """Base class for all archive errors."""


class ConfigError(ArchiveError):
    """Missing or invalid configuration/credentials."""


class SourceError(ArchiveError):
    """A data source failed in a way callers may want to handle/fall back on."""


class SourceUnavailable(SourceError):
    """A source is unreachable or returned repeated server errors."""


class CredentialsMissing(ConfigError):
    """A required credential for a requested stage is absent."""


class MediaError(ArchiveError):
    """Media extraction/download failure (usually recoverable per-asset)."""


class CostAborted(ArchiveError):
    """The user declined an LLM cost estimate."""
