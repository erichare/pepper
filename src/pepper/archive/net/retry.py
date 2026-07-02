"""Retry helper for archive HTTP GETs.

Retries on transport errors and 429/5xx responses, honoring a ``Retry-After``
header when present and otherwise backing off exponentially with jitter. When
retries are exhausted the error is surfaced as ``SourceUnavailable`` so callers
(e.g. the backfill auto-fallback) can catch it and try another source.
"""

from __future__ import annotations

from collections.abc import Callable

import httpx
from tenacity import (
    RetryCallState,
    retry,
    retry_if_exception_type,
    stop_after_attempt,
    wait_exponential_jitter,
)

from ..errors import SourceUnavailable
from ..logging import get_logger

log = get_logger(__name__)

# 422 is included because Arctic Shift returns it with {"error": "Timeout. Maybe
# slow down a bit"} as a soft throttle signal (not a true unprocessable-entity).
RETRYABLE_STATUS = frozenset({422, 429, 500, 502, 503, 504})
_MAX_RETRY_AFTER = 120.0


class RetryableStatus(Exception):
    """Raised internally to trigger a retry on a retryable HTTP status."""

    def __init__(self, response: httpx.Response) -> None:
        self.response = response
        self.retry_after = _parse_retry_after(response.headers.get("Retry-After"))
        super().__init__(f"retryable status {response.status_code}")


def _parse_retry_after(value: str | None) -> float | None:
    if not value:
        return None
    try:
        return min(float(value), _MAX_RETRY_AFTER)
    except ValueError:
        return None


def _wait(retry_state: RetryCallState) -> float:
    """Honor Retry-After if the last failure carried one, else exponential jitter."""
    exc = retry_state.outcome.exception() if retry_state.outcome else None
    if isinstance(exc, RetryableStatus) and exc.retry_after is not None:
        return exc.retry_after
    return wait_exponential_jitter(initial=1.0, max=60.0)(retry_state)


def request_with_retry(
    client: httpx.Client,
    url: str,
    *,
    params: dict | None = None,
    max_attempts: int = 6,
    limiter_acquire: Callable[[], None] | None = None,
) -> httpx.Response:
    """GET ``url`` with retry/backoff. Returns a 2xx response or raises."""

    @retry(
        retry=retry_if_exception_type((RetryableStatus, httpx.TransportError)),
        wait=_wait,
        stop=stop_after_attempt(max_attempts),
        reraise=True,
    )
    def _do() -> httpx.Response:
        if limiter_acquire is not None:
            limiter_acquire()
        resp = client.get(url, params=params)
        if resp.status_code in RETRYABLE_STATUS:
            log.warning(
                "http_retryable",
                url=str(resp.request.url),
                status=resp.status_code,
                retry_after=resp.headers.get("Retry-After"),
            )
            raise RetryableStatus(resp)
        resp.raise_for_status()
        return resp

    try:
        return _do()
    except RetryableStatus as e:
        raise SourceUnavailable(
            f"{url} still returning {e.response.status_code} after {max_attempts} attempts"
        ) from e
    except httpx.TransportError as e:
        raise SourceUnavailable(f"{url}: transport error after {max_attempts} attempts: {e}") from e
