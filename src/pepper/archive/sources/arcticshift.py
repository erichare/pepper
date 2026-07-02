"""Arctic Shift source — primary public archive.

Docs: https://arctic-shift.photon-reddit.com/api  (ArthurHeitmann/arctic_shift)
Endpoints: /api/posts/search and /api/comments/search, filtered by author with
`after`/`before` (epoch seconds) and `limit`, sorted descending.
"""

from __future__ import annotations

from ..models import ItemType
from .base import ArchiveSource

_BASE = "https://arctic-shift.photon-reddit.com/api"


class ArcticShiftSource(ArchiveSource):
    name = "arcticshift"
    page_size = 100

    def _endpoint(self, item_type: ItemType) -> str:
        leaf = "posts" if item_type is ItemType.SUBMISSION else "comments"
        return f"{_BASE}/{leaf}/search"

    def _params(self, item_type: ItemType, *, before: int | None, after: int | None) -> dict:
        params: dict = {
            "author": self.username,
            "limit": self.page_size,
            "sort": "desc",
        }
        if before is not None:
            params["before"] = before
        if after is not None:
            params["after"] = after
        return params
