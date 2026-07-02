from __future__ import annotations

import pytest

from pepper.archive.models import ItemType, base36_of, is_fullname, make_fullname, parse_fullname
from pepper.archive.models.ids import permalink_to_fullnames


def test_make_fullname_from_bare():
    assert make_fullname(ItemType.SUBMISSION, "abc123") == "t3_abc123"
    assert make_fullname(ItemType.COMMENT, "DEF456") == "t1_def456"


def test_make_fullname_accepts_prefixed_and_validates():
    assert make_fullname(ItemType.COMMENT, "t1_xyz") == "t1_xyz"
    with pytest.raises(ValueError):
        make_fullname(ItemType.COMMENT, "t3_xyz")  # prefix mismatch


def test_parse_and_base36():
    assert parse_fullname("t3_abc") == (ItemType.SUBMISSION, "abc")
    assert base36_of("t1_zz9") == "zz9"
    with pytest.raises(ValueError):
        parse_fullname("x9_abc")


def test_is_fullname():
    assert is_fullname("t3_abc")
    assert not is_fullname("abc")
    assert not is_fullname("t9_abc")


def test_permalink_to_fullnames():
    sub, com = permalink_to_fullnames("/r/pics/comments/abc123/some_title/def456/")
    assert sub == "t3_abc123"
    assert com == "t1_def456"
    sub, com = permalink_to_fullnames("/r/pics/comments/abc123/some_title/")
    assert sub == "t3_abc123"
    assert com is None
