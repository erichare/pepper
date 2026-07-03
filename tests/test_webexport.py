from __future__ import annotations

import json
from pathlib import Path

import pytest

from pepper.archive.config import Settings
from pepper.archive.models import ItemType
from pepper.archive.webexport import build_hall_of_fame, build_timeline, run_webexport
from pepper.archive.webexport.examples import build_examples

from .conftest import make_norm


@pytest.fixture
def web_settings(tmp_path) -> Settings:
    return Settings(
        _env_file=None,
        data_dir=tmp_path / "data",
        web_dir=tmp_path / "web",
        reddit_username="newppinpoint",
    )


def _seed(repo, *, n_comments: int = 6) -> None:
    run = repo.start_run("backfill", source="arcticshift")
    items = [
        make_norm(
            fullname="t3_post1",
            item_type=ItemType.SUBMISSION,
            source="arcticshift",
            observed_utc=1,
            created_utc=1_600_000_000,
            title="Chili Cheese Burrito is HERE",
            body="body",
            score=528,
            subreddit="tacobell",
        )
    ]
    for i in range(n_comments):
        items.append(
            make_norm(
                fullname=f"t1_c{i}",
                item_type=ItemType.COMMENT,
                source="arcticshift",
                observed_utc=1,
                created_utc=1_600_000_000 + i * 40_000_000,  # spreads across years
                body=f"comment body {i}",
                score=(-100 * i) + 50,
                subreddit="Chipotle" if i % 2 == 0 else "tacobell",
            )
        )
    repo.upsert_items(items, run)


def _snapshot(root: Path) -> dict[str, bytes]:
    return {str(p.relative_to(root)): p.read_bytes() for p in sorted(root.rglob("*.json"))}


def test_webexport_writes_expected_files(repo, conn, web_settings):
    _seed(repo)
    out = run_webexport(conn, web_settings)

    data = web_settings.web_data_dir
    for name in ("analysis.json", "timeline.json", "hall_of_fame.json", "examples.json", "media.json"):
        assert (data / name).exists(), name
    assert (web_settings.web_public_dir / "data" / "browse" / "index.json").exists()
    assert (web_settings.web_public_dir / "data" / "browse" / "default.json").exists()
    # no dossier row seeded -> no profile/persona, flagged in result
    assert out["has_dossier"] is False
    assert not (data / "profile.json").exists()


def test_webexport_is_deterministic(repo, conn, web_settings):
    _seed(repo)
    run_webexport(conn, web_settings)
    first = _snapshot(web_settings.web_dir)
    run_webexport(conn, web_settings)
    second = _snapshot(web_settings.web_dir)
    assert first == second
    assert len(first) > 5


def test_hall_of_fame_sorted_and_filtered(repo, conn, web_settings):
    _seed(repo)
    run2 = repo.start_run("backfill", source="arcticshift")
    repo.upsert_items(
        [
            make_norm(
                fullname="t1_deleted",
                item_type=ItemType.COMMENT,
                source="arcticshift",
                observed_utc=2,
                body="[removed]",
                score=-9999,
                subreddit="Chipotle",
            )
        ],
        run2,
    )
    hof = build_hall_of_fame(conn)
    bottom = hof["bottom_comments"]
    assert bottom, "expected scored comments"
    scores = [c["score"] for c in bottom]
    assert scores == sorted(scores), "bottom comments must ascend by score"
    assert all(c["id"] != "t1_deleted" for c in bottom), "removed bodies must be excluded"
    assert hof["top_submissions"][0]["score"] == 528


def test_timeline_dense_month_grid(repo, conn, web_settings):
    _seed(repo)
    tl = build_timeline(conn)
    assert tl["months"] == sorted(tl["months"])
    # dense: consecutive months with no gaps
    assert len(tl["months"]) >= 2
    for sub in tl["subreddits"]:
        assert len(tl["series"][sub]) == len(tl["months"])
    assert "other" in tl["subreddits"]


def test_examples_exclude_usernames_and_links(repo, conn, web_settings):
    run = repo.start_run("backfill", source="arcticshift")
    repo.upsert_items(
        [
            make_norm(
                fullname="t1_ok",
                item_type=ItemType.COMMENT,
                source="arcticshift",
                observed_utc=1,
                body="Reported.",
                score=5,
                subreddit="Chipotle",
                status_hint="active",
            ),
            make_norm(
                fullname="t1_bad_user",
                item_type=ItemType.COMMENT,
                source="arcticshift",
                observed_utc=1,
                body="u/somebody is an idiot",
                score=5,
                subreddit="Chipotle",
                status_hint="active",
            ),
            make_norm(
                fullname="t1_bad_link",
                item_type=ItemType.COMMENT,
                source="arcticshift",
                observed_utc=1,
                body="look at https://example.com lol",
                score=5,
                subreddit="Chipotle",
                status_hint="active",
            ),
        ],
        run,
    )
    # context titles for the pool join
    conn.executemany(
        "INSERT INTO context_items (id, type, title, first_seen_utc, last_updated_utc)"
        " VALUES (?, 'submission', ?, 1, 1)",
        [("t3_p1", "Did I get skimped?")],
    )
    conn.executemany(
        "INSERT INTO context_links (comment_id, context_id, relation) VALUES (?, ?, 'link')",
        [("t1_ok", "t3_p1"), ("t1_bad_user", "t3_p1"), ("t1_bad_link", "t3_p1")],
    )
    conn.commit()
    examples = build_examples(conn)
    ids = {e["id"] for e in examples}
    assert "t1_ok" in ids
    assert "t1_bad_user" not in ids
    assert "t1_bad_link" not in ids
    ok = next(e for e in examples if e["id"] == "t1_ok")
    assert ok["postTitle"] == "Did I get skimped?"
    assert ok["lengthClass"] == "short"
    assert "dismissal" in ok["tags"]


def test_examples_json_roundtrip_and_shape(repo, conn, web_settings):
    _seed(repo)
    run_webexport(conn, web_settings)
    raw = (web_settings.web_data_dir / "examples.json").read_text(encoding="utf-8")
    examples = json.loads(raw)
    for e in examples:
        assert set(e) == {"id", "postTitle", "body", "score", "lengthClass", "tags"}
