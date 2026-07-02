"""Load the canonical items into a polars DataFrame with derived time columns."""

from __future__ import annotations

import sqlite3
from datetime import UTC, datetime

import polars as pl

_COLUMNS = (
    "id, type, subreddit, author, created_utc, score, num_comments, "
    "upvote_ratio, total_awards, title, body, permalink, status, over_18, link_id, parent_id"
)


def load_frame(conn: sqlite3.Connection) -> pl.DataFrame:
    """Return a DataFrame of items with derived datetime/hour/weekday/text-length columns."""
    rows = [dict(r) for r in conn.execute(f"SELECT {_COLUMNS} FROM items ORDER BY created_utc")]
    if not rows:
        return _empty_frame()

    # infer_schema_length=None scans all rows: columns like link_id are null for
    # submissions and strings for comments, which trips the default 100-row inference.
    df = pl.DataFrame(rows, infer_schema_length=None)
    # combined text = title + body for length/linguistic work
    df = df.with_columns(
        pl.col("created_utc").cast(pl.Int64),
        (
            pl.when(pl.col("title").is_not_null() & pl.col("body").is_not_null())
            .then(pl.col("title") + "\n" + pl.col("body"))
            .otherwise(pl.coalesce([pl.col("title"), pl.col("body")]))
            .alias("text")
        ),
    )
    dt = pl.from_epoch(pl.col("created_utc"), time_unit="s")
    df = df.with_columns(
        dt.alias("dt"),
        dt.dt.year().alias("year"),
        dt.dt.strftime("%Y-%m").alias("year_month"),
        dt.dt.hour().alias("hour"),
        dt.dt.weekday().alias("weekday"),  # 1=Mon..7=Sun
        pl.col("text").str.len_chars().fill_null(0).alias("char_len"),
        pl.col("text").str.split(" ").list.len().fill_null(0).alias("word_len"),
    )
    return df


def _empty_frame() -> pl.DataFrame:
    return pl.DataFrame(
        schema={
            "id": pl.Utf8, "type": pl.Utf8, "subreddit": pl.Utf8, "author": pl.Utf8,
            "created_utc": pl.Int64, "score": pl.Int64, "num_comments": pl.Int64,
            "upvote_ratio": pl.Float64, "total_awards": pl.Int64, "title": pl.Utf8,
            "body": pl.Utf8, "permalink": pl.Utf8, "status": pl.Utf8, "over_18": pl.Int64,
            "link_id": pl.Utf8, "parent_id": pl.Utf8, "text": pl.Utf8,
        }
    )


def utc_iso(epoch: int | None) -> str | None:
    if epoch is None:
        return None
    return datetime.fromtimestamp(epoch, tz=UTC).isoformat()
