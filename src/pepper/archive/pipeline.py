"""Stage orchestration. Each stage is independently re-runnable and idempotent.

The CLI wires user commands to these functions; ``run_all`` sequences them in
dependency order, short-circuiting where watermarks say there's nothing to do.
"""

from __future__ import annotations

import time
from collections.abc import Callable

import httpx

from .analysis import run_analysis
from .config import Settings
from .context import fetch_context
from .errors import SourceError
from .logging import get_logger
from .media import MediaStore, extract_media_refs
from .media.download import MediaDownloader
from .models import ItemScope, ItemType
from .sources import ArcticShiftSource, GdprSource, PrawSource, PullPushSource, gdpr_files_present
from .storage import Repo, apply_migrations, connect, export_all

log = get_logger(__name__)

_STREAMS = ((ItemType.SUBMISSION, "submissions"), (ItemType.COMMENT, "comments"))


# ── init ──────────────────────────────────────────────────────────
def init(settings: Settings):
    settings.ensure_dirs()
    conn = connect(settings.db_path)
    applied = apply_migrations(conn)
    log.info("init", db=str(settings.db_path), migrations_applied=applied)
    return conn


# ── GDPR import ───────────────────────────────────────────────────
def import_gdpr(settings: Settings, conn, *, force: bool = False) -> dict:
    if not gdpr_files_present(settings.gdpr_dir):
        log.info("gdpr_absent", dir=str(settings.gdpr_dir))
        return {"present": False, "imported": 0}

    src = GdprSource(settings.gdpr_dir)
    chash = src.content_hash()
    marker = settings.gdpr_dir / ".imported_hash"
    if not force and marker.exists() and marker.read_text().strip() == chash:
        log.info("gdpr_unchanged")
        return {"present": True, "imported": 0, "skipped": True}

    repo = Repo(conn)
    run_id = repo.start_run("import-gdpr", source="gdpr")
    observed = int(time.time())
    total = 0
    batch = []
    for norm in src.iter_all(observed):
        batch.append(norm)
        if len(batch) >= 500:
            total += repo.upsert_items(batch, run_id)
            batch = []
    if batch:
        total += repo.upsert_items(batch, run_id)
    repo.finish_run(run_id, seen=total, upserted=total)
    marker.write_text(chash or "")
    log.info("gdpr_imported", items=total)
    return {"present": True, "imported": total}


# ── PRAW recent ───────────────────────────────────────────────────
def fetch_recent(settings: Settings, conn, *, limit: int | None = 1000) -> dict:
    settings.require_reddit_api()
    repo = Repo(conn)
    praw = PrawSource(settings)
    run_id = repo.start_run("fetch", source="praw")
    stats = {}
    total = 0
    for item_type, stream in _STREAMS:
        created = []
        batch = []
        for norm in praw.iter_recent(item_type, limit=limit):
            batch.append(norm)
            if norm.created_utc:
                created.append(norm.created_utc)
            if len(batch) >= 200:
                total += repo.upsert_items(batch, run_id)
                batch = []
        if batch:
            total += repo.upsert_items(batch, run_id)
        if created:
            repo.update_watermark("praw", stream, newest=max(created), oldest=min(created), run_id=run_id)
        stats[stream] = len(created)
    repo.finish_run(run_id, seen=total, upserted=total)
    log.info("fetch_recent_done", **stats)
    return stats


# ── archive backfill ──────────────────────────────────────────────
def backfill(settings: Settings, conn, *, source: str = "auto") -> dict:
    repo = Repo(conn)
    client = httpx.Client(
        headers={"User-Agent": settings.reddit_user_agent}, timeout=30.0, follow_redirects=True
    )
    try:
        order = _source_order(source, settings, client)
        last_err: Exception | None = None
        for src in order:
            try:
                return _run_archive(src, repo)
            except (SourceError, httpx.HTTPError) as e:
                last_err = e
                log.warning("archive_source_failed", source=src.name, error=str(e))
                continue
        raise SourceError(f"all archive sources failed: {last_err}")
    finally:
        client.close()


def _source_order(source: str, settings: Settings, client):
    from .net import RateLimiter

    arctic = ArcticShiftSource(
        client, RateLimiter(settings.rl_arcticshift_per_sec), settings.reddit_username
    )
    pull = PullPushSource(
        client, RateLimiter(settings.rl_pullpush_per_sec), settings.reddit_username
    )
    if source == "arcticshift":
        return [arctic]
    if source == "pullpush":
        return [pull]
    return [arctic, pull]  # auto


def _flush(repo: Repo, batch: list, run_id: int, source: str, stream: str) -> int:
    """Persist a batch and advance the (source, stream) watermark. Returns count."""
    created = [n.created_utc for n in batch if n.created_utc]
    upserted = repo.upsert_items(batch, run_id)
    if created:
        repo.update_watermark(source, stream, newest=max(created), oldest=min(created), run_id=run_id)
    return upserted


def _run_archive(src, repo: Repo) -> dict:
    """Walk both streams for one archive source.

    A stream that fails mid-walk (persistent throttle/outage) is caught so the
    other stream still runs; the source only propagates an error when it ingested
    *nothing* (so ``backfill`` can fall back to the secondary). The watermark is
    updated as we go, making an interrupted backfill resumable on the next run.
    """
    run_id = repo.start_run("backfill", source=src.name)
    stats: dict = {"source": src.name, "partial": False}
    total = 0
    errors: list[str] = []

    for item_type, stream in _STREAMS:
        wm = repo.get_watermark(src.name, stream)
        if wm.newest_created_utc is None and wm.oldest_created_utc is None:
            passes = [{"after": None, "before": None}]
        else:
            passes = [
                {"after": wm.newest_created_utc, "before": None},  # newer than we have
                {"after": None, "before": wm.oldest_created_utc},  # older backfill
            ]
        stream_count = 0
        batch: list = []
        try:
            for p in passes:
                for norm in src.iter_author_items(item_type, after=p["after"], before=p["before"]):
                    batch.append(norm)
                    if len(batch) >= 500:
                        total += _flush(repo, batch, run_id, src.name, stream)
                        stream_count += len(batch)
                        batch = []
            if batch:
                total += _flush(repo, batch, run_id, src.name, stream)
                stream_count += len(batch)
                batch = []
        except SourceError as e:
            if batch:  # persist whatever we accumulated before the failure
                total += _flush(repo, batch, run_id, src.name, stream)
                stream_count += len(batch)
            errors.append(f"{stream}: {e}")
            stats["partial"] = True
            log.warning("backfill_stream_incomplete", source=src.name, stream=stream, error=str(e))
        stats[stream] = stream_count

    repo.finish_run(run_id, seen=total, upserted=total, error="; ".join(errors) or None)
    if total == 0 and errors:
        raise SourceError(f"{src.name} ingested nothing: {'; '.join(errors)}")
    log.info("backfill_done", source=src.name, total=total, partial=stats["partial"])
    return stats


# ── enrich (hydrate scores/status) ────────────────────────────────
def enrich(settings: Settings, conn) -> dict:
    settings.require_reddit_api()
    repo = Repo(conn)
    praw = PrawSource(settings)
    ids = [row["id"] for row in list(repo.iter_items())]
    if not ids:
        return {"hydrated": 0}
    run_id = repo.start_run("enrich", source="praw")
    total = 0
    batch = []
    for norm in praw.hydrate(ids):
        batch.append(norm)
        if len(batch) >= 200:
            total += repo.upsert_items(batch, run_id)
            batch = []
    if batch:
        total += repo.upsert_items(batch, run_id)
    repo.finish_run(run_id, seen=len(ids), upserted=total)
    log.info("enrich_done", hydrated=total, requested=len(ids))
    return {"hydrated": total, "requested": len(ids)}


# ── context ───────────────────────────────────────────────────────
def context(settings: Settings, conn) -> dict:
    """Fetch comment parents. Uses the Reddit API when configured, else falls
    back to Arctic Shift's by-id endpoint (no credentials required)."""
    repo = Repo(conn)
    if settings.has_reddit_api():
        return fetch_context(repo, PrawSource(settings))

    from .net import RateLimiter, make_client

    client = make_client(settings.reddit_user_agent)
    try:
        source = ArcticShiftSource(
            client, RateLimiter(settings.rl_arcticshift_per_sec), settings.reddit_username
        )
        return fetch_context(repo, source)
    finally:
        client.close()


# ── media ─────────────────────────────────────────────────────────
def media(settings: Settings, conn, *, scope: str = "own") -> dict:
    repo = Repo(conn)
    store = MediaStore(settings.media_dir)
    downloader = MediaDownloader(store, user_agent=settings.reddit_user_agent)
    stats = {"items": 0, "refs": 0, "downloaded": 0, "failed": 0}
    try:
        rows = list(repo.iter_items())
        for row in rows:
            item = dict(row)
            refs = extract_media_refs(item, scope=ItemScope.ITEM)
            stats["items"] += 1 if refs else 0
            for ref in refs:
                stats["refs"] += 1
                if repo.media_url_done(ref.item_id, ref.source_url):
                    continue
                for res in downloader.download(ref):
                    sha = res.asset.sha256 if res.asset else None
                    if res.asset:
                        repo.upsert_media_asset(res.asset)
                        stats["downloaded"] += 1
                    else:
                        stats["failed"] += 1
                    repo.link_media(
                        res.ref.item_id,
                        res.ref.source_url,
                        scope=ItemScope.ITEM,
                        sha256=sha,
                        gallery_index=res.ref.gallery_index,
                        kind=res.ref.kind.value,
                        download_status=res.download_status.value,
                        error=res.error,
                    )
    finally:
        downloader.close()
    log.info("media_done", **stats)
    return stats


# ── analyze / dossier / report / export ───────────────────────────
def analyze(settings: Settings, conn) -> dict:
    return run_analysis(conn, settings)


def dossier(settings: Settings, conn, *, confirm: Callable[[str], bool] | None = None, force=False, yes=False) -> dict:
    from .llm import generate_dossier

    return generate_dossier(conn, settings, confirm=confirm, force=force, yes=yes)


def report(settings: Settings, conn) -> dict:
    from .analysis import load_analysis
    from .llm import load_latest_dossier
    from .report import render_dashboard, render_markdown

    analysis = load_analysis(settings) or run_analysis(conn, settings)
    doss = load_latest_dossier(conn)
    md = render_markdown(analysis, doss, settings.dossier_dir / "dossier.md")
    html = render_dashboard(analysis, doss, settings.dossier_dir / "dashboard.html")
    log.info("report_written", markdown=str(md), dashboard=str(html))
    return {"markdown": str(md), "dashboard": str(html), "dossier": doss is not None}


def export(settings: Settings, fmt: str = "parquet") -> dict:
    files = export_all(settings.db_path, settings.exports_dir, fmt=fmt)
    return {"files": [str(f) for f in files]}


def webexport(settings: Settings, conn) -> dict:
    from .webexport import run_webexport

    return run_webexport(conn, settings)


# ── status ────────────────────────────────────────────────────────
def status(settings: Settings, conn) -> dict:
    repo = Repo(conn)
    wms = [dict(r) for r in conn.execute("SELECT * FROM source_watermarks")]
    dossier_count = conn.execute("SELECT COUNT(*) c FROM llm_dossier").fetchone()["c"]
    media_count = conn.execute("SELECT COUNT(*) c FROM media_assets").fetchone()["c"]
    ctx_count = conn.execute("SELECT COUNT(*) c FROM context_items").fetchone()["c"]
    return {
        "submissions": repo.count_items("submission"),
        "comments": repo.count_items("comment"),
        "status_breakdown": repo.status_summary(),
        "watermarks": wms,
        "context_items": ctx_count,
        "media_assets": media_count,
        "dossiers": dossier_count,
    }


# ── full pipeline ─────────────────────────────────────────────────
def run_all(settings: Settings, conn, *, yes: bool = False) -> dict:
    out: dict = {}
    out["gdpr"] = import_gdpr(settings, conn)
    if settings.has_reddit_api():
        out["fetch"] = fetch_recent(settings, conn)
    out["backfill"] = backfill(settings, conn)
    if settings.has_reddit_api():
        out["enrich"] = enrich(settings, conn)
    out["context"] = context(settings, conn)
    out["media"] = media(settings, conn)
    out["analyze"] = {"ok": True}
    analyze(settings, conn)
    if settings.has_anthropic() and yes:
        try:
            dossier(settings, conn, yes=True)
            out["dossier"] = {"ok": True}
        except Exception as e:  # noqa: BLE001
            out["dossier"] = {"error": str(e)}
    out["report"] = report(settings, conn)
    out["webexport"] = webexport(settings, conn)
    return out
