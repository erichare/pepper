from __future__ import annotations

import httpx
import pytest

from pepper.archive.models import ItemType
from pepper.archive.net.ratelimit import NullRateLimiter
from pepper.archive.sources import ArcticShiftSource, PullPushSource


@pytest.fixture
def client():
    c = httpx.Client()
    yield c
    c.close()


def _post(id_, created):
    return {"id": id_, "name": f"t3_{id_}", "title": f"post {id_}", "selftext": "x",
            "author": "newppinpoint", "subreddit": "test", "created_utc": created, "score": 1}


def test_arcticshift_paginates_and_terminates(httpx_mock, client):
    # page 1: two items; page 2: one older item; page 3: empty -> stop
    httpx_mock.add_response(json={"data": [_post("aaa", 3000), _post("bbb", 2000)]})
    httpx_mock.add_response(json={"data": [_post("ccc", 1000)]})
    httpx_mock.add_response(json={"data": []})

    src = ArcticShiftSource(client, NullRateLimiter(), "newppinpoint")
    items = list(src.iter_author_items(ItemType.SUBMISSION))
    ids = [i.id for i in items]
    assert ids == ["t3_aaa", "t3_bbb", "t3_ccc"]
    assert all(i.source == "arcticshift" for i in items)


def test_dedup_across_pages(httpx_mock, client):
    # overlapping id 'bbb' across pages should not be yielded twice
    httpx_mock.add_response(json={"data": [_post("aaa", 3000), _post("bbb", 2000)]})
    httpx_mock.add_response(json={"data": [_post("bbb", 2000), _post("ccc", 1000)]})
    httpx_mock.add_response(json={"data": []})

    src = ArcticShiftSource(client, NullRateLimiter(), "newppinpoint")
    ids = [i.id for i in src.iter_author_items(ItemType.SUBMISSION)]
    assert ids == ["t3_aaa", "t3_bbb", "t3_ccc"]


def test_after_lower_bound_stops_walk(httpx_mock, client):
    # only items with created > 1500 should be yielded (incremental "new" pass)
    httpx_mock.add_response(json={"data": [_post("aaa", 3000), _post("bbb", 2000)]})
    httpx_mock.add_response(json={"data": [_post("ccc", 1000)]})

    src = ArcticShiftSource(client, NullRateLimiter(), "newppinpoint")
    ids = [i.id for i in src.iter_author_items(ItemType.SUBMISSION, after=1500)]
    assert ids == ["t3_aaa", "t3_bbb"]


def test_pullpush_uses_results_or_data_key(httpx_mock, client):
    httpx_mock.add_response(json={"data": [{"id": "q1", "name": "t1_q1", "body": "hi",
                                            "author": "newppinpoint", "subreddit": "s", "created_utc": 500, "score": 2}]})
    httpx_mock.add_response(json={"data": []})
    src = PullPushSource(client, NullRateLimiter(), "newppinpoint")
    items = list(src.iter_author_items(ItemType.COMMENT))
    assert [i.id for i in items] == ["t1_q1"]
    assert items[0].type is ItemType.COMMENT
