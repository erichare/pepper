from __future__ import annotations

from pepper.archive.analysis import run_analysis
from pepper.archive.analysis.frame import load_frame
from pepper.archive.models import ItemType, NormalizedItem


def _seed(repo, n=30):
    run = repo.start_run("backfill", source="arcticshift")
    norms = []
    for i in range(n):
        norms.append(
            NormalizedItem(
                id=f"t1_c{i}", type=ItemType.COMMENT, base36=f"c{i}", author="newppinpoint",
                subreddit="food" if i % 2 else "pics", created_utc=1_600_000_000 + i * 3600,
                body=f"I really like pizza and burgers number {i}? yes indeed here we go",
                score=i, source="arcticshift", observed_utc=1,
            )
        )
    repo.upsert_items(norms, run)


def test_load_frame_derives_columns(repo, conn):
    _seed(repo, 5)
    df = load_frame(conn)
    assert df.height == 5
    assert {"hour", "weekday", "year_month", "word_len", "text"}.issubset(set(df.columns))


def test_run_analysis_produces_sections(repo, conn, settings):
    _seed(repo, 30)
    result = run_analysis(conn, settings)
    assert not result["stats"]["empty"]
    assert result["stats"]["totals"]["comments"] == 30
    assert result["stats"]["totals"]["subreddits"] == 2
    assert not result["linguistic"]["empty"]
    assert result["linguistic"]["vocabulary"]["total_words"] > 0
    # analysis.json cache written
    assert (settings.exports_dir / "analysis.json").exists()


def test_analysis_empty_db(conn, settings):
    result = run_analysis(conn, settings)
    assert result["stats"]["empty"] is True
