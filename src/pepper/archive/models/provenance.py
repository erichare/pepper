"""Provenance models: per-source observations and fetch runs.

The archive stores an append-only ``SourceObservation`` for every sighting of
an item by a source. The canonical item row is a *pure function* of the set of
observations for that id, which is what makes re-runs idempotent and merges
auditable.
"""

from __future__ import annotations

from pydantic import BaseModel, ConfigDict, Field

from .enums import ItemScope


class SourceObservation(BaseModel):
    """One source's view of one item at one fetch time."""

    model_config = ConfigDict(frozen=True)

    item_id: str
    item_scope: ItemScope = ItemScope.ITEM
    source: str  # gdpr | praw | arcticshift | pullpush
    observed_utc: int
    source_created_utc: int | None = None
    score: int | None = None
    body: str | None = None
    title: str | None = None
    author: str | None = None
    status_hint: str | None = None  # source's own view: active/deleted/removed
    edited_utc: int | None = None
    raw_json: str = "{}"


class FetchRun(BaseModel):
    """A single invocation of a fetching/ingesting command."""

    run_id: int | None = None
    started_at: str
    finished_at: str | None = None
    command: str
    source: str | None = None
    args_json: str | None = None
    items_seen: int = 0
    items_upserted: int = 0
    status: str = "running"
    error: str | None = None


class Watermark(BaseModel):
    """Newest/oldest timestamps stored per (source, stream) for incremental runs."""

    source: str
    stream: str  # submissions | comments
    newest_created_utc: int | None = None
    oldest_created_utc: int | None = None
    last_run_id: int | None = None
    last_run_utc: int | None = None


class SourceStats(BaseModel):
    """Lightweight per-run counters returned by source adapters."""

    seen: int = 0
    new_observations: int = 0
    pages: int = 0
    errors: list[str] = Field(default_factory=list)
