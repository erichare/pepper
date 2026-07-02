from __future__ import annotations

from pepper.archive.models import ItemType
from pepper.archive.normalize import map_gdpr_comment_row, map_gdpr_post_row, map_reddit_obj
from pepper.archive.normalize.clean import coerce_epoch, full_permalink
from pepper.archive.normalize.reddit_map import reddit_status_hint


def test_coerce_epoch_handles_false_and_ms():
    assert coerce_epoch(False) is None
    assert coerce_epoch(True) is None
    assert coerce_epoch(0) is None
    assert coerce_epoch(1_600_000_000) == 1_600_000_000
    assert coerce_epoch(1_600_000_000_000) == 1_600_000_000  # ms -> s
    assert coerce_epoch("1600000000.0") == 1_600_000_000


def test_full_permalink():
    assert full_permalink("/r/x/comments/a/b/").startswith("https://www.reddit.com/r/x")
    assert full_permalink("https://example.com/x") == "https://example.com/x"
    assert full_permalink(None) is None


def test_reddit_status_hint():
    assert reddit_status_hint({"body": "[removed]"}) == "removed"
    assert reddit_status_hint({"body": "[deleted]"}) == "deleted"
    assert reddit_status_hint({"removed_by_category": "moderator"}) == "removed"
    assert reddit_status_hint({"removed_by_category": "deleted"}) == "deleted"
    assert reddit_status_hint({"body": "normal text"}) == "active"


def test_map_reddit_submission():
    data = {
        "id": "abc123", "name": "t3_abc123", "title": "Hello &amp; world",
        "selftext": "body text", "author": "newppinpoint", "subreddit": "test",
        "created_utc": 1_600_000_000, "score": 12, "num_comments": 3, "url": "https://x",
        "over_18": True, "edited": False, "permalink": "/r/test/comments/abc123/hello/",
    }
    n = map_reddit_obj(data, source="arcticshift", observed_utc=999)
    assert n.type is ItemType.SUBMISSION
    assert n.id == "t3_abc123"
    assert n.title == "Hello & world"  # html-unescaped
    assert n.score == 12
    assert n.over_18 is True
    assert n.edited_utc is None
    assert n.permalink.startswith("https://www.reddit.com")


def test_map_reddit_comment():
    data = {
        "id": "def456", "name": "t1_def456", "body": "a comment", "author": "newppinpoint",
        "subreddit": "test", "created_utc": 1_600_000_100, "score": 4,
        "link_id": "t3_abc123", "parent_id": "t3_abc123", "edited": 1_600_000_200,
    }
    n = map_reddit_obj(data, source="praw", observed_utc=999)
    assert n.type is ItemType.COMMENT
    assert n.id == "t1_def456"
    assert n.link_id == "t3_abc123"
    assert n.edited_utc == 1_600_000_200


def test_map_gdpr_post_row():
    row = {"id": "abc123", "date": "2021-05-03 12:34:56 UTC", "subreddit": "pics",
           "title": "My post", "body": "post body", "permalink": "/r/pics/comments/abc123/my_post/"}
    n = map_gdpr_post_row(row, observed_utc=1)
    assert n.id == "t3_abc123"
    assert n.type is ItemType.SUBMISSION
    assert n.created_utc is not None and n.created_utc > 1_600_000_000
    assert n.source == "gdpr"


def test_map_gdpr_comment_row_resolves_link_and_parent():
    row = {
        "id": "def456", "date": "2021-05-03 12:34:56 UTC", "subreddit": "pics",
        "body": "my reply", "permalink": "/r/pics/comments/abc123/title/def456/",
        "parent": "t1_zzz999",
    }
    n = map_gdpr_comment_row(row, observed_utc=1)
    assert n.id == "t1_def456"
    assert n.link_id == "t3_abc123"  # from permalink
    assert n.parent_id == "t1_zzz999"  # explicit parent column
