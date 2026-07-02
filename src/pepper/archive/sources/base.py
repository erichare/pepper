"""Base classes for paginated public-archive sources (Arctic Shift, PullPush).

Both expose the same author-history search shape, so the pagination walk lives
here and subclasses only supply the endpoint + response parsing.
"""

from __future__ import annotations

import abc
import time
from collections.abc import Iterator

import httpx

from ..logging import get_logger
from ..models import ItemType, NormalizedItem
from ..net import RateLimiter, request_with_retry
from ..normalize import map_reddit_obj

log = get_logger(__name__)

# safety cap so a misbehaving cursor can't loop forever
_MAX_PAGES = 10_000


class ArchiveSource(abc.ABC):
    """A paginated public archive keyed by author + created_utc cursors."""

    name: str
    page_size: int = 100

    def __init__(self, client: httpx.Client, limiter: RateLimiter, username: str) -> None:
        self.client = client
        self.limiter = limiter
        self.username = username.lstrip("u/").lstrip("/")

    # ── subclass hooks ────────────────────────────────────────────
    @abc.abstractmethod
    def _endpoint(self, item_type: ItemType) -> str: ...

    @abc.abstractmethod
    def _params(
        self, item_type: ItemType, *, before: int | None, after: int | None
    ) -> dict: ...

    def _extract_rows(self, payload: object) -> list[dict]:
        if isinstance(payload, dict):
            data = payload.get("data", payload.get("results", []))
        else:
            data = payload
        return [d for d in (data or []) if isinstance(d, dict)]

    # ── the shared descending paginator ───────────────────────────
    def iter_author_items(
        self,
        item_type: ItemType,
        *,
        after: int | None = None,
        before: int | None = None,
    ) -> Iterator[NormalizedItem]:
        """Yield the author's items with ``after < created_utc < before``.

        Walks newest→oldest. ``after`` (inclusive lower bound) is used to stop an
        incremental "new items" pass; ``before`` seeds a resumable backfill.
        """
        cursor = before
        seen: set[str] = set()
        for _page in range(_MAX_PAGES):
            params = self._params(item_type, before=cursor, after=after)
            resp = request_with_retry(
                self.client,
                self._endpoint(item_type),
                params=params,
                limiter_acquire=self.limiter.acquire,
            )
            rows = self._extract_rows(resp.json())
            if not rows:
                return

            observed = int(time.time())
            page_min: int | None = None
            new_in_page = 0
            for row in rows:
                created = _created_of(row)
                if created is not None:
                    page_min = created if page_min is None else min(page_min, created)
                    if after is not None and created <= after:
                        continue  # older than our lower bound; skip
                fullname = _fullname_of(row, item_type)
                if fullname in seen:
                    continue
                seen.add(fullname)
                new_in_page += 1
                yield map_reddit_obj(
                    row, source=self.name, observed_utc=observed, item_type=item_type
                )

            # advance cursor strictly downward
            if page_min is None:
                return
            next_cursor = page_min
            if cursor is not None and next_cursor >= cursor:
                next_cursor = cursor - 1
            cursor = next_cursor
            # stop conditions
            if after is not None and page_min <= after:
                return
            if new_in_page == 0:
                return


def _created_of(row: dict) -> int | None:
    v = row.get("created_utc", row.get("created"))
    try:
        return int(float(v)) if v is not None else None
    except (TypeError, ValueError):
        return None


def _fullname_of(row: dict, item_type: ItemType) -> str:
    name = row.get("name")
    if isinstance(name, str) and "_" in name:
        return name
    prefix = "t3_" if item_type is ItemType.SUBMISSION else "t1_"
    return f"{prefix}{str(row.get('id', '')).split('_')[-1]}"
