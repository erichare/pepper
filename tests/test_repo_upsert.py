from __future__ import annotations

from freezegun import freeze_time

from pepper.archive.models import ItemType, Source

from .conftest import make_norm


def _dump_items(conn):
    return [dict(r) for r in conn.execute("SELECT * FROM items ORDER BY id")]


def test_upsert_is_idempotent_under_frozen_time(repo, conn):
    norms = [
        make_norm(fullname="t3_a", item_type=ItemType.SUBMISSION, source="arcticshift", observed_utc=500, title="hello", body="world", score=3),
        make_norm(fullname="t1_b", item_type=ItemType.COMMENT, source="arcticshift", observed_utc=500, body="a comment", score=1),
    ]
    with freeze_time("2026-01-01"):
        run1 = repo.start_run("backfill", source="arcticshift")
        repo.upsert_items(norms, run1)
        first = _dump_items(conn)

        run2 = repo.start_run("backfill", source="arcticshift")
        repo.upsert_items(norms, run2)
        second = _dump_items(conn)

    assert first == second  # byte-identical canonical rows on re-run
    # one observation row per (item, source), not per run
    obs = conn.execute(
        "SELECT item_id, source, COUNT(*) c FROM source_observations GROUP BY item_id, source"
    ).fetchall()
    assert all(r["c"] == 1 for r in obs)
    assert conn.execute("SELECT COUNT(*) c FROM source_observations").fetchone()["c"] == 2


def test_second_source_updates_and_accumulates_bitmask(repo, conn):
    run1 = repo.start_run("backfill", source="arcticshift")
    repo.upsert_items(
        [make_norm(fullname="t3_a", item_type=ItemType.SUBMISSION, source="arcticshift", observed_utc=100, title="t", body="b", score=5)],
        run1,
    )
    run2 = repo.start_run("enrich", source="praw")
    repo.upsert_items(
        [make_norm(fullname="t3_a", item_type=ItemType.SUBMISSION, source="praw", observed_utc=200, title="t", body="b", score=99)],
        run2,
    )
    row = conn.execute("SELECT score, score_source, sources_bitmask FROM items WHERE id='t3_a'").fetchone()
    assert row["score"] == 99  # freshest live source
    assert row["score_source"] == "praw"
    assert row["sources_bitmask"] == int(Source.ARCTICSHIFT | Source.PRAW)


def test_counts_and_status_summary(repo, conn):
    run = repo.start_run("backfill", source="arcticshift")
    repo.upsert_items(
        [
            make_norm(fullname="t3_a", item_type=ItemType.SUBMISSION, source="arcticshift", observed_utc=1, title="t", body="b"),
            make_norm(fullname="t1_b", item_type=ItemType.COMMENT, source="arcticshift", observed_utc=1, body="c"),
        ],
        run,
    )
    assert repo.count_items("submission") == 1
    assert repo.count_items("comment") == 1
    assert repo.count_items() == 2
    summary = repo.status_summary()
    assert summary["submission"]["active"] == 1
