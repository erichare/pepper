"""PullPush.io source — secondary/fallback public archive (Pushshift-style).

Endpoints: https://api.pullpush.io/reddit/search/{submission,comment}/
Params: author, size (<=100 reliable), before/after (epoch), sort, sort_type.
"""

from __future__ import annotations

from ..models import ItemType
from .base import ArchiveSource

_BASE = "https://api.pullpush.io/reddit/search"


class PullPushSource(ArchiveSource):
    name = "pullpush"
    page_size = 100

    def _endpoint(self, item_type: ItemType) -> str:
        leaf = "submission" if item_type is ItemType.SUBMISSION else "comment"
        return f"{_BASE}/{leaf}/"

    def _params(self, item_type: ItemType, *, before: int | None, after: int | None) -> dict:
        params: dict = {
            "author": self.username,
            "size": self.page_size,
            "sort": "desc",
            "sort_type": "created_utc",
        }
        if before is not None:
            params["before"] = before
        if after is not None:
            params["after"] = after
        return params
