"""Shared test fixtures."""

from __future__ import annotations

import sqlite3

import pytest

from pepper.archive.config import Settings
from pepper.archive.models import ItemType, NormalizedItem
from pepper.archive.net.ratelimit import NullRateLimiter
from pepper.archive.storage import Repo, apply_migrations, connect


@pytest.fixture
def settings(tmp_path) -> Settings:
    return Settings(_env_file=None, data_dir=tmp_path / "data", reddit_username="newppinpoint")


@pytest.fixture
def conn(settings) -> sqlite3.Connection:
    settings.ensure_dirs()
    c = connect(settings.db_path)
    apply_migrations(c)
    yield c
    c.close()


@pytest.fixture
def repo(conn) -> Repo:
    return Repo(conn)


@pytest.fixture
def null_limiter() -> NullRateLimiter:
    return NullRateLimiter()


def make_norm(
    *,
    fullname: str,
    item_type: ItemType,
    source: str,
    observed_utc: int,
    created_utc: int | None = 1_600_000_000,
    body: str | None = None,
    title: str | None = None,
    author: str | None = "newppinpoint",
    score: int | None = None,
    status_hint: str | None = None,
    subreddit: str | None = "test",
) -> NormalizedItem:
    base36 = fullname.split("_", 1)[1]
    return NormalizedItem(
        id=fullname,
        type=item_type,
        base36=base36,
        author=author,
        subreddit=subreddit,
        created_utc=created_utc,
        title=title,
        body=body,
        score=score,
        status_hint=status_hint,
        source=source,
        observed_utc=observed_utc,
        raw_json="{}",
    )
