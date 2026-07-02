"""Content-addressed media store: files live at by-hash/ab/cd/<sha256>.<ext>."""

from __future__ import annotations

import hashlib
import shutil
import time
from pathlib import Path

from ..models import MediaAsset, MediaKind


class MediaStore:
    def __init__(self, media_dir: Path) -> None:
        self.root = media_dir / "by-hash"
        self.root.mkdir(parents=True, exist_ok=True)

    def _path_for(self, sha256: str, ext: str | None) -> Path:
        suffix = f".{ext.lstrip('.')}" if ext else ""
        return self.root / sha256[:2] / sha256[2:4] / f"{sha256}{suffix}"

    def exists(self, sha256: str, ext: str | None) -> bool:
        return self._path_for(sha256, ext).exists()

    def store_bytes(self, data: bytes, *, kind: MediaKind, ext: str | None) -> MediaAsset:
        sha = hashlib.sha256(data).hexdigest()
        dest = self._path_for(sha, ext)
        if not dest.exists():
            dest.parent.mkdir(parents=True, exist_ok=True)
            dest.write_bytes(data)
        return MediaAsset(
            sha256=sha,
            kind=kind,
            ext=ext.lstrip(".") if ext else None,
            bytes=len(data),
            local_path=str(dest),
            downloaded_utc=int(time.time()),
        )

    def store_file(
        self, path: Path, *, kind: MediaKind, has_audio: bool | None = None, downloader: str | None = None
    ) -> MediaAsset:
        """Ingest an already-downloaded file (e.g. from yt-dlp) into the store."""
        data = path.read_bytes()
        sha = hashlib.sha256(data).hexdigest()
        ext = path.suffix.lstrip(".") or None
        dest = self._path_for(sha, ext)
        if not dest.exists():
            dest.parent.mkdir(parents=True, exist_ok=True)
            shutil.copyfile(path, dest)
        return MediaAsset(
            sha256=sha,
            kind=kind,
            ext=ext,
            bytes=len(data),
            local_path=str(dest),
            downloaded_utc=int(time.time()),
            has_audio=has_audio,
            downloader=downloader,
        )
