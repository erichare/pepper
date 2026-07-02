from __future__ import annotations

import json

from pepper.archive.media import extract_media_refs
from pepper.archive.models import ItemType, MediaKind


def test_extract_direct_image():
    item = {"id": "t3_a", "type": ItemType.SUBMISSION.value, "url": "https://i.redd.it/abc.jpg", "body": "", "raw_json": "{}"}
    refs = extract_media_refs(item)
    assert len(refs) == 1
    assert refs[0].kind is MediaKind.IMAGE
    assert refs[0].source_url == "https://i.redd.it/abc.jpg"


def test_extract_reddit_gallery():
    raw = {
        "is_gallery": True,
        "gallery_data": {"items": [{"media_id": "m1"}, {"media_id": "m2"}]},
        "media_metadata": {
            "m1": {"s": {"u": "https://preview.redd.it/m1.jpg?width=1&amp;s=x"}},
            "m2": {"s": {"u": "https://preview.redd.it/m2.jpg"}},
        },
    }
    item = {"id": "t3_g", "type": ItemType.SUBMISSION.value, "url": "https://reddit.com/gallery/g", "body": "", "raw_json": json.dumps(raw)}
    refs = extract_media_refs(item)
    gallery = [r for r in refs if r.kind is MediaKind.GALLERY_IMAGE]
    assert len(gallery) == 2
    assert gallery[0].gallery_index == 0
    assert "&amp;" not in gallery[0].source_url  # unescaped


def test_extract_video_and_body_link():
    item = {
        "id": "t3_v", "type": ItemType.SUBMISSION.value, "url": "https://v.redd.it/xyz",
        "permalink": "https://www.reddit.com/r/x/comments/v/title/",
        "body": "also see https://i.redd.it/inbody.png here", "raw_json": "{}",
    }
    refs = extract_media_refs(item)
    kinds = {r.kind for r in refs}
    assert MediaKind.VIDEO in kinds
    assert any("inbody.png" in r.source_url for r in refs)


def test_no_media_returns_empty():
    item = {"id": "t1_c", "type": ItemType.COMMENT.value, "url": None, "body": "just text, no links", "raw_json": "{}"}
    assert extract_media_refs(item) == []
