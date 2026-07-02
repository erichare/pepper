"""GDPR export source — reads posts.csv / comments.csv (the authoritative layer).

Accepts either extracted CSVs or the export .zip dropped into the gdpr dir.
Files are located case-insensitively and recursively, and the raw bytes are
hashed so ``import-gdpr`` can skip re-import when nothing changed.
"""

from __future__ import annotations

import csv
import hashlib
import io
import zipfile
from collections.abc import Iterator
from pathlib import Path

from ..logging import get_logger
from ..models import NormalizedItem
from ..normalize import map_gdpr_comment_row, map_gdpr_post_row

log = get_logger(__name__)

_POSTS_NAMES = {"posts.csv", "submissions.csv"}
_COMMENTS_NAMES = {"comments.csv"}


def gdpr_files_present(gdpr_dir: Path) -> bool:
    src = _GdprLocator(gdpr_dir)
    return src.posts_bytes() is not None or src.comments_bytes() is not None


class _GdprLocator:
    """Finds and reads posts/comments CSV bytes from a dir or export zip."""

    def __init__(self, gdpr_dir: Path) -> None:
        self.dir = gdpr_dir

    def _zip_paths(self) -> list[Path]:
        return sorted(self.dir.rglob("*.zip")) if self.dir.exists() else []

    def _loose(self, names: set[str]) -> Path | None:
        if not self.dir.exists():
            return None
        for p in sorted(self.dir.rglob("*.csv")):
            if p.name.lower() in names:
                return p
        return None

    def _from_zip(self, names: set[str]) -> bytes | None:
        for zp in self._zip_paths():
            try:
                with zipfile.ZipFile(zp) as zf:
                    for info in zf.infolist():
                        if Path(info.filename).name.lower() in names:
                            return zf.read(info)
            except zipfile.BadZipFile:
                log.warning("bad_zip", path=str(zp))
        return None

    def posts_bytes(self) -> bytes | None:
        loose = self._loose(_POSTS_NAMES)
        if loose:
            return loose.read_bytes()
        return self._from_zip(_POSTS_NAMES)

    def comments_bytes(self) -> bytes | None:
        loose = self._loose(_COMMENTS_NAMES)
        if loose:
            return loose.read_bytes()
        return self._from_zip(_COMMENTS_NAMES)


class GdprSource:
    name = "gdpr"

    def __init__(self, gdpr_dir: Path) -> None:
        self.locator = _GdprLocator(gdpr_dir)

    def content_hash(self) -> str | None:
        posts = self.locator.posts_bytes()
        comments = self.locator.comments_bytes()
        if posts is None and comments is None:
            return None
        h = hashlib.sha256()
        h.update(posts or b"")
        h.update(b"::")
        h.update(comments or b"")
        return h.hexdigest()

    def iter_posts(self, observed_utc: int) -> Iterator[NormalizedItem]:
        data = self.locator.posts_bytes()
        if data is None:
            return
        for row in _read_csv(data):
            if not (row.get("id") or _ci_get(row, "id")):
                continue
            try:
                yield map_gdpr_post_row(row, observed_utc=observed_utc)
            except ValueError as e:  # malformed id
                log.warning("gdpr_post_skip", error=str(e))

    def iter_comments(self, observed_utc: int) -> Iterator[NormalizedItem]:
        data = self.locator.comments_bytes()
        if data is None:
            return
        for row in _read_csv(data):
            if not (row.get("id") or _ci_get(row, "id")):
                continue
            try:
                yield map_gdpr_comment_row(row, observed_utc=observed_utc)
            except ValueError as e:
                log.warning("gdpr_comment_skip", error=str(e))

    def iter_all(self, observed_utc: int) -> Iterator[NormalizedItem]:
        yield from self.iter_posts(observed_utc)
        yield from self.iter_comments(observed_utc)


def _read_csv(data: bytes) -> Iterator[dict]:
    text = data.decode("utf-8-sig", errors="replace")
    reader = csv.DictReader(io.StringIO(text))
    yield from reader


def _ci_get(row: dict, key: str):
    for k, v in row.items():
        if str(k).strip().lower() == key:
            return v
    return None
