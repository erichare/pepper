"""Activity statistics computed from the items DataFrame (all JSON-serializable)."""

from __future__ import annotations

import polars as pl

from .frame import utc_iso


def compute_stats(df: pl.DataFrame) -> dict:
    if df.is_empty():
        return {"empty": True}

    totals = {
        "items": df.height,
        "submissions": int((df["type"] == "submission").sum()),
        "comments": int((df["type"] == "comment").sum()),
        "subreddits": int(df["subreddit"].n_unique()),
        "first_activity": utc_iso(int(df["created_utc"].min())),
        "last_activity": utc_iso(int(df["created_utc"].max())),
    }

    subreddits = (
        df.group_by("subreddit")
        .agg(
            pl.len().alias("count"),
            pl.col("score").sum().alias("total_score"),
            pl.col("score").mean().round(2).alias("avg_score"),
        )
        .sort("count", descending=True)
        .head(50)
        .to_dicts()
    )

    timeline = (
        df.group_by("year_month")
        .agg(
            pl.len().alias("count"),
            (pl.col("type") == "submission").sum().alias("submissions"),
            (pl.col("type") == "comment").sum().alias("comments"),
        )
        .sort("year_month")
        .to_dicts()
    )

    heatmap = (
        df.group_by(["weekday", "hour"]).agg(pl.len().alias("count")).sort(["weekday", "hour"]).to_dicts()
    )

    karma = {
        "total_score": int(df["score"].fill_null(0).sum()),
        "avg_score": round(float(df["score"].fill_null(0).mean()), 2),
        "median_score": float(df["score"].fill_null(0).median()),
        "max_score": int(df["score"].fill_null(0).max()),
        "min_score": int(df["score"].fill_null(0).min()),
        "by_year": (
            df.group_by("year")
            .agg(pl.col("score").fill_null(0).sum().alias("score"), pl.len().alias("count"))
            .sort("year")
            .to_dicts()
        ),
    }

    length = {
        "avg_chars": round(float(df["char_len"].mean()), 1),
        "avg_words": round(float(df["word_len"].mean()), 1),
        "median_words": float(df["word_len"].median()),
        "max_words": int(df["word_len"].max()),
    }

    top_cols = ["id", "type", "subreddit", "score", "title", "permalink", "created_utc"]
    top_posts = (
        df.filter(pl.col("type") == "submission")
        .sort("score", descending=True)
        .head(20)
        .select(top_cols)
        .to_dicts()
    )
    top_comments = (
        df.filter(pl.col("type") == "comment")
        .sort("score", descending=True)
        .head(20)
        .select(["id", "subreddit", "score", "body", "permalink", "created_utc"])
        .to_dicts()
    )

    status_breakdown = (
        df.group_by(["type", "status"]).agg(pl.len().alias("count")).sort(["type", "status"]).to_dicts()
    )

    gaps = _activity_gaps(df)

    return {
        "empty": False,
        "totals": totals,
        "subreddits": subreddits,
        "timeline": timeline,
        "heatmap": heatmap,
        "karma": karma,
        "length": length,
        "top_posts": top_posts,
        "top_comments": top_comments,
        "status_breakdown": status_breakdown,
        "activity_gaps": gaps,
    }


def _activity_gaps(df: pl.DataFrame, top_n: int = 10) -> list[dict]:
    ts = df["created_utc"].sort().to_list()
    if len(ts) < 2:
        return []
    gaps = []
    for a, b in zip(ts, ts[1:], strict=False):
        gaps.append((b - a, a, b))
    gaps.sort(reverse=True)
    return [
        {"days": round(g / 86400.0, 1), "from": utc_iso(a), "to": utc_iso(b)}
        for g, a, b in gaps[:top_n]
    ]
