"""Extract downloadable media references from an item (pure function).

Handles: direct images (i.redd.it / imgur direct / generic image URLs), Reddit
galleries (media_metadata), Reddit-hosted video (v.redd.it), and external video
hosts (redgifs/gfycat/youtube/streamable/imgur albums) that yt-dlp / gallery-dl
can resolve.
"""

from __future__ import annotations

import json
import re

from ..models import ItemScope, MediaKind, MediaRef

_IMAGE_EXT = re.compile(r"\.(jpg|jpeg|png|gif|webp|bmp)(\?.*)?$", re.IGNORECASE)
_VIDEO_EXT = re.compile(r"\.(mp4|webm|mov|mkv)(\?.*)?$", re.IGNORECASE)
_VIDEO_HOSTS = ("v.redd.it", "redgifs.com", "gfycat.com", "youtube.com", "youtu.be", "streamable.com")
_ALBUM_HOSTS = ("imgur.com/a/", "imgur.com/gallery/")
_URL_IN_TEXT = re.compile(r"https?://[^\s)>\]]+", re.IGNORECASE)


def _classify(url: str) -> MediaKind | None:
    u = url.lower()
    if "v.redd.it" in u or _VIDEO_EXT.search(u) or any(h in u for h in _VIDEO_HOSTS):
        return MediaKind.VIDEO
    if "i.redd.it" in u or _IMAGE_EXT.search(u):
        return MediaKind.IMAGE
    if any(h in u for h in _ALBUM_HOSTS):
        return MediaKind.OTHER  # album -> gallery-dl
    if "imgur.com" in u:
        return MediaKind.IMAGE
    return None


def _gallery_refs(item_id: str, scope: ItemScope, raw: dict) -> list[MediaRef]:
    refs: list[MediaRef] = []
    meta = raw.get("media_metadata")
    if not isinstance(meta, dict):
        return refs
    order = []
    gd = raw.get("gallery_data")
    if isinstance(gd, dict) and isinstance(gd.get("items"), list):
        order = [it.get("media_id") for it in gd["items"] if isinstance(it, dict)]
    if not order:
        order = list(meta.keys())
    for idx, media_id in enumerate(order):
        entry = meta.get(media_id)
        if not isinstance(entry, dict):
            continue
        url = None
        s = entry.get("s")
        if isinstance(s, dict):
            url = s.get("u") or s.get("gif") or s.get("mp4")
        if url:
            url = url.replace("&amp;", "&")
            refs.append(
                MediaRef(
                    item_id=item_id,
                    item_scope=scope,
                    source_url=url,
                    kind=MediaKind.GALLERY_IMAGE,
                    gallery_index=idx,
                )
            )
    return refs


def extract_media_refs(item: dict, scope: ItemScope = ItemScope.ITEM) -> list[MediaRef]:
    """Return media references for one item dict.

    ``item`` needs keys: id, type, url, body, raw_json, permalink.
    """
    item_id = item["id"]
    refs: list[MediaRef] = []
    seen: set[str] = set()

    raw: dict = {}
    if item.get("raw_json"):
        try:
            raw = json.loads(item["raw_json"])
        except (TypeError, ValueError):
            raw = {}

    # 1) reddit gallery
    if raw.get("is_gallery") or "media_metadata" in raw:
        for ref in _gallery_refs(item_id, scope, raw):
            if ref.source_url not in seen:
                seen.add(ref.source_url)
                refs.append(ref)

    # 2) reddit-hosted video (prefer the permalink so yt-dlp merges audio)
    reddit_video = None
    media = raw.get("media") or raw.get("secure_media")
    if isinstance(media, dict) and isinstance(media.get("reddit_video"), dict):
        reddit_video = item.get("permalink") or media["reddit_video"].get("fallback_url")
    if reddit_video and reddit_video not in seen:
        seen.add(reddit_video)
        refs.append(
            MediaRef(item_id=item_id, item_scope=scope, source_url=reddit_video, kind=MediaKind.VIDEO)
        )

    # 3) the submission's primary url
    url = item.get("url")
    if isinstance(url, str) and url and not url.startswith("/"):
        kind = _classify(url)
        if kind and url not in seen:
            seen.add(url)
            refs.append(
                MediaRef(item_id=item_id, item_scope=scope, source_url=url, kind=kind)
            )

    # 4) media links embedded in body text
    body = item.get("body") or ""
    if isinstance(body, str):
        for m in _URL_IN_TEXT.findall(body):
            kind = _classify(m)
            if kind and m not in seen:
                seen.add(m)
                refs.append(
                    MediaRef(item_id=item_id, item_scope=scope, source_url=m, kind=kind)
                )

    return refs
