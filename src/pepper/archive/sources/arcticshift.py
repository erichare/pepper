"""Arctic Shift source — primary public archive.

Docs: https://arctic-shift.photon-reddit.com/api  (ArthurHeitmann/arctic_shift)
Endpoints: /api/posts/search and /api/comments/search, filtered by author with
`after`/`before` (epoch seconds) and `limit`, sorted descending.
"""

from __future__ import annotations

from collections.abc import Iterator

from ..models import ItemType, make_fullname
from ..net import request_with_retry
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

    def fetch_by_fullnames(
        self, fullnames: list[str]
    ) -> Iterator[tuple[str, dict, ItemType]]:
        """Yield (fullname, field-dict, type) for arbitrary ids via the by-id endpoints.

        Same shape as ``PrawSource.fetch_by_fullnames`` so it can drive the context
        stage without Reddit API credentials. Comments and posts use separate
        endpoints, so ids are split by prefix.
        """
        by_type = {
            ItemType.COMMENT: ("comments", [f for f in fullnames if f.startswith("t1_")]),
            ItemType.SUBMISSION: ("posts", [f for f in fullnames if f.startswith("t3_")]),
        }
        for item_type, (leaf, ids) in by_type.items():
            for chunk in _chunks(ids, 50):
                resp = request_with_retry(
                    self.client,
                    f"{_BASE}/{leaf}/ids",
                    params={"ids": ",".join(chunk)},
                    limiter_acquire=self.limiter.acquire,
                )
                for row in self._extract_rows(resp.json()):
                    base36 = str(row.get("id", "")).split("_")[-1]
                    name = row.get("name") or make_fullname(item_type, base36)
                    yield name, row, item_type


def _chunks(seq: list[str], n: int) -> Iterator[list[str]]:
    for i in range(0, len(seq), n):
        yield seq[i : i + n]
