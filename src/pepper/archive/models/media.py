"""Media domain models."""

from __future__ import annotations

from pydantic import BaseModel

from .enums import DownloadStatus, ItemScope, MediaKind


class MediaRef(BaseModel):
    """A media URL discovered on an item, before download."""

    item_id: str
    item_scope: ItemScope = ItemScope.ITEM
    source_url: str
    kind: MediaKind = MediaKind.OTHER
    gallery_index: int | None = None


class MediaAsset(BaseModel):
    """A downloaded, content-addressed media file."""

    sha256: str
    kind: MediaKind
    ext: str | None = None
    bytes: int | None = None
    width: int | None = None
    height: int | None = None
    duration_s: float | None = None
    local_path: str
    downloaded_utc: int
    downloader: str | None = None
    has_audio: bool | None = None


class MediaResult(BaseModel):
    """Outcome of attempting to fetch one MediaRef."""

    ref: MediaRef
    asset: MediaAsset | None = None
    download_status: DownloadStatus = DownloadStatus.OK
    error: str | None = None
