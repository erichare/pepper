from __future__ import annotations

from pepper.archive.context import fetch_context
from pepper.archive.models import ItemType, NormalizedItem


class FakePraw:
    """Stands in for PrawSource.fetch_by_fullnames."""

    def __init__(self, mapping: dict[str, dict]):
        self.mapping = mapping
        self.calls: list[list[str]] = []

    def fetch_by_fullnames(self, fullnames):
        self.calls.append(list(fullnames))
        for fn in fullnames:
            data = self.mapping.get(fn)
            if data is None:
                continue
            it = ItemType.SUBMISSION if fn.startswith("t3_") else ItemType.COMMENT
            yield fn, data, it


def _comment(repo, cid, link_id, parent_id):
    n = NormalizedItem(
        id=cid, type=ItemType.COMMENT, base36=cid.split("_")[1], author="newppinpoint",
        subreddit="test", created_utc=1000, body="my reply", link_id=link_id,
        parent_id=parent_id, source="arcticshift", observed_utc=1,
    )
    run = repo.start_run("backfill", source="arcticshift")
    repo.upsert_items([n], run)


def test_fetch_context_populates_parents_and_links(repo):
    _comment(repo, "t1_c1", "t3_p1", "t1_pc1")  # reply to a comment under post p1
    fake = FakePraw(
        {
            "t3_p1": {"id": "p1", "name": "t3_p1", "title": "Original post", "author": "someone", "subreddit": "test", "created_utc": 900},
            "t1_pc1": {"id": "pc1", "name": "t1_pc1", "body": "parent comment", "author": "other", "subreddit": "test", "created_utc": 950},
        }
    )
    stats = fetch_context(repo, fake)
    assert stats["fetched"] == 2
    assert repo.context_exists("t3_p1")
    assert repo.context_exists("t1_pc1")

    links = repo.conn.execute("SELECT relation, context_id FROM context_links WHERE comment_id='t1_c1' ORDER BY relation").fetchall()
    rels = {r["relation"]: r["context_id"] for r in links}
    assert rels["link"] == "t3_p1"
    assert rels["parent"] == "t1_pc1"


def test_context_skipped_without_praw(repo):
    _comment(repo, "t1_c2", "t3_p2", "t3_p2")
    stats = fetch_context(repo, None)  # no API configured
    assert stats["fetched"] == 0
    assert not repo.context_exists("t3_p2")
