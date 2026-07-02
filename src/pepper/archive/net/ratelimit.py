"""A simple monotonic token-bucket rate limiter.

One instance per source. ``acquire()`` blocks until a token is available.
Time is injected (``time_fn``/``sleep_fn``) so tests can drive it deterministically
with freezegun or fakes without real sleeping.
"""

from __future__ import annotations

import threading
import time
from collections.abc import Callable


class RateLimiter:
    def __init__(
        self,
        rate_per_sec: float,
        burst: float | None = None,
        *,
        time_fn: Callable[[], float] = time.monotonic,
        sleep_fn: Callable[[float], None] = time.sleep,
    ) -> None:
        if rate_per_sec <= 0:
            raise ValueError("rate_per_sec must be > 0")
        self.rate = rate_per_sec
        self.capacity = burst if burst is not None else max(1.0, rate_per_sec)
        self._tokens = self.capacity
        self._time = time_fn
        self._sleep = sleep_fn
        self._last = time_fn()
        self._lock = threading.Lock()

    def _refill(self) -> None:
        now = self._time()
        elapsed = now - self._last
        if elapsed > 0:
            self._tokens = min(self.capacity, self._tokens + elapsed * self.rate)
            self._last = now

    def acquire(self, tokens: float = 1.0) -> None:
        while True:
            with self._lock:
                self._refill()
                if self._tokens >= tokens:
                    self._tokens -= tokens
                    return
                deficit = tokens - self._tokens
                wait = deficit / self.rate
            self._sleep(wait)

    @classmethod
    def per_minute(cls, per_min: float, **kw) -> RateLimiter:
        return cls(per_min / 60.0, **kw)


class NullRateLimiter(RateLimiter):
    """No-op limiter for tests: never blocks."""

    def __init__(self) -> None:  # noqa: D107 - trivial
        pass

    def acquire(self, tokens: float = 1.0) -> None:  # noqa: D102
        return None
