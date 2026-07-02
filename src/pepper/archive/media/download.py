"""Download media referenced by items into the content-addressed store.

Routing:
* images / direct files  -> httpx GET
* Reddit & host videos    -> yt-dlp (merges video+audio when ffmpeg is present)
* imgur albums / galleries-> gallery-dl (may yield several files)

Every failure is captured as a ``MediaResult`` with a status rather than raised,
so one dead link never aborts the media stage. The stage is re-runnable and
skips URLs already downloaded ok.
"""

from __future__ import annotations

import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

import httpx

from ..logging import get_logger
from ..models import DownloadStatus, MediaKind, MediaRef, MediaResult
from .store import MediaStore

log = get_logger(__name__)


class MediaDownloader:
    def __init__(self, store: MediaStore, *, user_agent: str = "pepper-archive/0.1", timeout: float = 60.0) -> None:
        self.store = store
        self.timeout = timeout
        self.client = httpx.Client(
            headers={"User-Agent": user_agent}, timeout=timeout, follow_redirects=True
        )
        self.ffmpeg = shutil.which("ffmpeg") is not None

    def close(self) -> None:
        self.client.close()

    def download(self, ref: MediaRef) -> list[MediaResult]:
        try:
            if ref.kind in (MediaKind.IMAGE, MediaKind.GALLERY_IMAGE):
                if any(h in ref.source_url.lower() for h in ("imgur.com/a/", "imgur.com/gallery/")):
                    return self._download_album(ref)
                return [self._download_image(ref)]
            if ref.kind is MediaKind.VIDEO:
                return [self._download_video(ref)]
            return self._download_album(ref)  # OTHER -> let gallery-dl try
        except Exception as e:  # noqa: BLE001 - never let one asset kill the run
            log.warning("media_download_error", url=ref.source_url, error=str(e))
            return [MediaResult(ref=ref, download_status=DownloadStatus.FAILED, error=str(e))]

    def _download_image(self, ref: MediaRef) -> MediaResult:
        resp = self.client.get(ref.source_url)
        if resp.status_code in (403, 404, 410):
            return MediaResult(
                ref=ref, download_status=DownloadStatus.LINK_ROT, error=f"HTTP {resp.status_code}"
            )
        resp.raise_for_status()
        ext = _ext_from(ref.source_url, resp.headers.get("content-type"))
        asset = self.store.store_bytes(resp.content, kind=ref.kind, ext=ext)
        asset = asset.model_copy(update={"downloader": "httpx"})
        return MediaResult(ref=ref, asset=asset)

    def _download_video(self, ref: MediaRef) -> MediaResult:
        import yt_dlp

        fmt = "bestvideo+bestaudio/best" if self.ffmpeg else "best"
        with tempfile.TemporaryDirectory() as td:
            outtmpl = str(Path(td) / "%(id)s.%(ext)s")
            opts = {
                "outtmpl": outtmpl,
                "quiet": True,
                "noprogress": True,
                "format": fmt,
                "merge_output_format": "mp4",
                "noplaylist": True,
            }
            with yt_dlp.YoutubeDL(opts) as ydl:
                info = ydl.extract_info(ref.source_url, download=True)
            files = sorted(Path(td).glob("*"))
            files = [f for f in files if f.is_file()]
            if not files:
                return MediaResult(ref=ref, download_status=DownloadStatus.FAILED, error="no output file")
            has_audio = self.ffmpeg and bool(info.get("acodec") not in (None, "none"))
            asset = self.store.store_file(
                files[0], kind=MediaKind.VIDEO, has_audio=has_audio, downloader="yt-dlp"
            )
            return MediaResult(ref=ref, asset=asset)

    def _download_album(self, ref: MediaRef) -> list[MediaResult]:
        with tempfile.TemporaryDirectory() as td:
            proc = subprocess.run(
                [sys.executable, "-m", "gallery_dl", "-q", "-D", td, ref.source_url],
                capture_output=True,
                text=True,
                timeout=self.timeout * 5,
            )
            files = [f for f in sorted(Path(td).rglob("*")) if f.is_file()]
            if not files:
                status = DownloadStatus.LINK_ROT if proc.returncode != 0 else DownloadStatus.SKIPPED
                return [MediaResult(ref=ref, download_status=status, error=proc.stderr[:500] or None)]
            results: list[MediaResult] = []
            for idx, f in enumerate(files):
                kind = MediaKind.GALLERY_IMAGE if len(files) > 1 else ref.kind
                asset = self.store.store_file(f, kind=kind, downloader="gallery-dl")
                # distinct source_url per file so item_media rows don't collide
                sub_url = ref.source_url if len(files) == 1 else f"{ref.source_url}#{idx}"
                sub_ref = ref.model_copy(update={"source_url": sub_url, "gallery_index": idx})
                results.append(MediaResult(ref=sub_ref, asset=asset))
            return results


def _ext_from(url: str, content_type: str | None) -> str | None:
    from urllib.parse import urlparse

    path = urlparse(url).path
    if "." in path:
        ext = path.rsplit(".", 1)[-1].lower()
        if 1 <= len(ext) <= 5:
            return ext
    if content_type:
        mapping = {
            "image/jpeg": "jpg",
            "image/png": "png",
            "image/gif": "gif",
            "image/webp": "webp",
            "video/mp4": "mp4",
        }
        return mapping.get(content_type.split(";")[0].strip())
    return None
