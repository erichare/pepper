from __future__ import annotations

from pepper.archive.models import ItemStatus, ItemType, Source
from pepper.archive.storage.merge import merge_item

from .conftest import make_norm


def test_gdpr_body_beats_live_deleted_and_marks_deleted_by_user():
    gdpr = make_norm(
        fullname="t1_a", item_type=ItemType.COMMENT, source="gdpr", observed_utc=100,
        created_utc=1000, body="my real comment", author=None,
    )
    praw = make_norm(
        fullname="t1_a", item_type=ItemType.COMMENT, source="praw", observed_utc=200,
        created_utc=1000, body="[deleted]", author="[deleted]", status_hint="deleted",
    )
    c = merge_item([praw, gdpr])
    assert c.body == "my real comment"
    assert c.body_source == "gdpr"
    assert c.status is ItemStatus.DELETED_BY_USER
    assert c.created_utc == 1000


def test_mod_removed_detected():
    praw = make_norm(
        fullname="t1_b", item_type=ItemType.COMMENT, source="praw", observed_utc=200,
        body="[removed]", status_hint="removed",
    )
    arctic = make_norm(
        fullname="t1_b", item_type=ItemType.COMMENT, source="arcticshift", observed_utc=150,
        body="original text before removal",
    )
    c = merge_item([praw, arctic])
    assert c.status is ItemStatus.REMOVED_BY_MOD
    # original text still recovered from the archive
    assert c.body == "original text before removal"
    assert c.body_source == "arcticshift"


def test_score_uses_freshest_live_source():
    old = make_norm(
        fullname="t3_c", item_type=ItemType.SUBMISSION, source="arcticshift",
        observed_utc=100, score=5, title="hi", body="b",
    )
    new = make_norm(
        fullname="t3_c", item_type=ItemType.SUBMISSION, source="praw",
        observed_utc=999, score=42, title="hi", body="b",
    )
    c = merge_item([old, new])
    assert c.score == 42
    assert c.score_source == "praw"


def test_public_only_active():
    arctic = make_norm(
        fullname="t1_d", item_type=ItemType.COMMENT, source="arcticshift",
        observed_utc=100, body="hello world",
    )
    c = merge_item([arctic])
    assert c.status is ItemStatus.ACTIVE
    assert c.body == "hello world"


def test_bitmask_accumulates_all_sources():
    obs = [
        make_norm(fullname="t3_e", item_type=ItemType.SUBMISSION, source=s, observed_utc=i, title="t", body="b")
        for i, s in enumerate(("gdpr", "praw", "arcticshift", "pullpush"))
    ]
    c = merge_item(obs)
    expected = int(Source.GDPR | Source.PRAW | Source.ARCTICSHIFT | Source.PULLPUSH)
    assert c.sources_bitmask == expected


def test_created_utc_precedence_gdpr_over_praw():
    gdpr = make_norm(fullname="t1_f", item_type=ItemType.COMMENT, source="gdpr", observed_utc=1, created_utc=111, body="x")
    praw = make_norm(fullname="t1_f", item_type=ItemType.COMMENT, source="praw", observed_utc=2, created_utc=222, body="x")
    c = merge_item([praw, gdpr])
    assert c.created_utc == 111


def test_author_recovered_from_non_deleted_source():
    praw = make_norm(fullname="t1_g", item_type=ItemType.COMMENT, source="praw", observed_utc=2, author="[deleted]", body="[deleted]")
    arctic = make_norm(fullname="t1_g", item_type=ItemType.COMMENT, source="arcticshift", observed_utc=1, author="newppinpoint", body="real")
    c = merge_item([praw, arctic])
    assert c.author == "newppinpoint"
