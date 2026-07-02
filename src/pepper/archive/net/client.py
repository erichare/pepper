"""Shared httpx client factory."""

from __future__ import annotations

import httpx

DEFAULT_UA = "pepper-archive/0.1 (+https://github.com/erichare/pepper)"


def make_client(user_agent: str = DEFAULT_UA, timeout: float = 30.0) -> httpx.Client:
    """Build an httpx.Client with sane defaults for archive APIs."""
    return httpx.Client(
        headers={"User-Agent": user_agent, "Accept": "application/json"},
        timeout=httpx.Timeout(timeout, connect=10.0),
        follow_redirects=True,
    )
