from __future__ import annotations

from pepper.archive.context import fetch_context
from pepper.archive.errors import SourceError
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


class FlakySource:
    """Yields parents until it raises SourceError (simulates a throttle)."""

    def __init__(self, mapping: dict[str, dict], fail_after: int):
        self.mapping = mapping
        self.fail_after = fail_after

    def fetch_by_fullnames(self, fullnames):
        yielded = 0
        for fn in sorted(fullnames):
            if yielded >= self.fail_after:
                raise SourceError("throttled")
            data = self.mapping.get(fn)
            if data:
                yield fn, data, ItemType.SUBMISSION
                yielded += 1


def _post_data(pid):
    return {"id": pid.split("_")[1], "name": pid, "title": f"post {pid}", "author": "op",
            "subreddit": "test", "created_utc": 900}


def test_context_is_resumable_after_source_error(repo):
    # three comments, three distinct submission parents
    parents = ["t3_pa", "t3_pb", "t3_pc"]
    for i, p in enumerate(parents):
        _comment(repo, f"t1_r{i}", p, p)
    mapping = {p: _post_data(p) for p in parents}

    # first pass fails after persisting 2 parents; progress must be kept (not rolled back)
    stats1 = fetch_context(repo, FlakySource(mapping, fail_after=2), commit_every=1)
    assert stats1["fetched"] == 2
    persisted = [p for p in parents if repo.context_exists(p)]
    assert len(persisted) == 2  # committed despite the later failure

    # second pass only needs the remaining parent and completes
    stats2 = fetch_context(repo, FlakySource(mapping, fail_after=99), commit_every=1)
    assert stats2["fetched"] == 1
    assert all(repo.context_exists(p) for p in parents)
