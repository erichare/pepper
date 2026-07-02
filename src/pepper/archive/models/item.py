"""Core item domain models.

Two shapes:

* ``NormalizedItem`` — what a *single source* reports about an item, mapped to a
  common schema. Sources emit these; the repo persists one observation per
  ``NormalizedItem`` and the full object is round-tripped through JSON so the
  merge can be recomputed exactly.
* ``CanonicalItem`` — the merged, best-of-all-sources row written to ``items``.
  It is a pure function of the set of ``NormalizedItem`` observations for an id.

``ContextItem`` is the parent submission/comment fetched to give a comment its
conversational context; it is deliberately a thinner, single-source shape.
"""

from __future__ import annotations

from pydantic import BaseModel, ConfigDict

from .enums import ItemStatus, ItemType


class NormalizedItem(BaseModel):
    """A single source's normalized view of one submission or comment."""

    model_config = ConfigDict(frozen=True)

    # identity
    id: str  # fullname, t3_/t1_
    type: ItemType
    base36: str

    # who / where
    author: str | None = None
    author_fullname: str | None = None
    subreddit: str | None = None
    subreddit_id: str | None = None

    # when
    created_utc: int | None = None
    edited_utc: int | None = None

    # content
    title: str | None = None  # submissions
    body: str | None = None  # comment body OR submission selftext
    url: str | None = None
    permalink: str | None = None
    is_self: bool | None = None
    over_18: bool | None = None
    spoiler: bool | None = None

    # threading (comments)
    link_id: str | None = None
    parent_id: str | None = None

    # metrics
    score: int | None = None
    num_comments: int | None = None
    upvote_ratio: float | None = None
    total_awards: int | None = None

    # source view of lifecycle: "active" | "deleted" | "removed" | None
    status_hint: str | None = None

    # provenance
    source: str = "unknown"
    observed_utc: int = 0
    raw_json: str = "{}"


class CanonicalItem(BaseModel):
    """The merged, canonical representation persisted in ``items``."""

    id: str
    type: ItemType
    base36: str

    author: str | None = None
    author_fullname: str | None = None
    subreddit: str | None = None
    subreddit_id: str | None = None

    created_utc: int
    retrieved_utc: int | None = None

    title: str | None = None
    body: str | None = None
    body_source: str | None = None
    url: str | None = None
    permalink: str | None = None
    is_self: bool | None = None
    over_18: bool | None = None
    spoiler: bool | None = None

    link_id: str | None = None
    parent_id: str | None = None

    score: int | None = None
    score_source: str | None = None
    num_comments: int | None = None
    upvote_ratio: float | None = None
    total_awards: int | None = None
    edited_utc: int | None = None

    status: ItemStatus = ItemStatus.UNKNOWN
    raw_json: str | None = None
    sources_bitmask: int = 0


class ContextItem(BaseModel):
    """A parent submission/comment (authored by someone else) kept as context."""

    id: str
    type: ItemType
    author: str | None = None
    subreddit: str | None = None
    created_utc: int | None = None
    title: str | None = None
    body: str | None = None
    permalink: str | None = None
    status: ItemStatus = ItemStatus.UNKNOWN
    raw_json: str | None = None
