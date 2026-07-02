"""Typer CLI. Commands live under ``pepper archive <cmd>``."""

from __future__ import annotations

import json

import typer

from . import pipeline
from .config import Settings
from .errors import ArchiveError
from .logging import configure, get_logger
from .storage import apply_migrations, connect

app = typer.Typer(help="pepper — Reddit archive & persona profiler", no_args_is_help=True)
archive_app = typer.Typer(help="Archive and profile a Reddit account", no_args_is_help=True)
app.add_typer(archive_app, name="archive")

log = get_logger(__name__)


def _settings() -> Settings:
    configure()
    return Settings.load()


def _open(settings: Settings):
    settings.ensure_dirs()
    conn = connect(settings.db_path)
    apply_migrations(conn)
    return conn


def _emit(obj: dict) -> None:
    typer.echo(json.dumps(obj, indent=2, default=str))


def _guard(fn):
    try:
        fn()
    except ArchiveError as e:
        typer.secho(f"error: {e}", fg=typer.colors.RED, err=True)
        raise typer.Exit(1) from e


@archive_app.command()
def init() -> None:
    """Create the data tree, database, and run migrations."""
    s = _settings()

    def run():
        conn = pipeline.init(s)
        _emit({"db": str(s.db_path), "data_dir": str(s.data_dir), "ok": True})
        conn.close()

    _guard(run)


@archive_app.command(name="import-gdpr")
def import_gdpr(force: bool = typer.Option(False, help="Re-import even if unchanged")) -> None:
    """Import posts.csv/comments.csv from the GDPR export (authoritative layer)."""
    s = _settings()

    def run():
        conn = _open(s)
        _emit(pipeline.import_gdpr(s, conn, force=force))
        conn.close()

    _guard(run)


@archive_app.command()
def fetch(limit: int = typer.Option(1000, help="Max recent items per stream")) -> None:
    """Fetch recent posts/comments and refresh recent scores via the Reddit API."""
    s = _settings()

    def run():
        conn = _open(s)
        _emit(pipeline.fetch_recent(s, conn, limit=limit))
        conn.close()

    _guard(run)


@archive_app.command()
def backfill(
    source: str = typer.Option("auto", help="arcticshift | pullpush | auto"),
) -> None:
    """Backfill full history (incl. deleted) from public archives."""
    s = _settings()

    def run():
        conn = _open(s)
        _emit(pipeline.backfill(s, conn, source=source))
        conn.close()

    _guard(run)


@archive_app.command()
def enrich() -> None:
    """Hydrate current score/status for all known items via the Reddit API."""
    s = _settings()

    def run():
        conn = _open(s)
        _emit(pipeline.enrich(s, conn))
        conn.close()

    _guard(run)


@archive_app.command()
def context() -> None:
    """Fetch parent submission + direct parent comment for each comment."""
    s = _settings()

    def run():
        conn = _open(s)
        _emit(pipeline.context(s, conn))
        conn.close()

    _guard(run)


@archive_app.command()
def media(scope: str = typer.Option("own", help="own | all")) -> None:
    """Download images/galleries/videos attached to items."""
    s = _settings()

    def run():
        conn = _open(s)
        _emit(pipeline.media(s, conn, scope=scope))
        conn.close()

    _guard(run)


@archive_app.command()
def analyze() -> None:
    """Compute activity/linguistic/topic/graph analysis."""
    s = _settings()

    def run():
        conn = _open(s)
        res = pipeline.analyze(s, conn)
        _emit({"analysis": "written", "exports": str(s.exports_dir / "analysis.json"),
               "items": res["stats"].get("totals", {}).get("items", 0) if not res["stats"].get("empty") else 0})
        conn.close()

    _guard(run)


@archive_app.command()
def dossier(
    yes: bool = typer.Option(False, "--yes", "-y", help="Skip the cost confirmation gate"),
    force: bool = typer.Option(False, help="Regenerate even if corpus unchanged"),
) -> None:
    """Generate the LLM persona dossier (Anthropic Batch API; cost-gated)."""
    s = _settings()

    def run():
        conn = _open(s)
        result = pipeline.dossier(s, conn, confirm=typer.confirm, force=force, yes=yes)
        _emit({"dossier": "generated", "summary_preview": (result.get("summary") or "")[:200]})
        conn.close()

    _guard(run)


@archive_app.command()
def report() -> None:
    """Render the Markdown dossier + HTML dashboard."""
    s = _settings()

    def run():
        conn = _open(s)
        _emit(pipeline.report(s, conn))
        conn.close()

    _guard(run)


@archive_app.command()
def webexport() -> None:
    """Emit deterministic JSON + media for the Next.js app in web/."""
    s = _settings()

    def run():
        conn = _open(s)
        _emit(pipeline.webexport(s, conn))
        conn.close()

    _guard(run)


@archive_app.command()
def export(fmt: str = typer.Option("parquet", "--format", "-f", help="parquet | csv | json")) -> None:
    """Export core tables to Parquet/CSV/JSON."""
    s = _settings()

    def run():
        _emit(pipeline.export(s, fmt=fmt))

    _guard(run)


@archive_app.command()
def status() -> None:
    """Show counts, watermarks, and pipeline state."""
    s = _settings()

    def run():
        conn = _open(s)
        _emit(pipeline.status(s, conn))
        conn.close()

    _guard(run)


@archive_app.command(name="all")
def run_all(
    yes: bool = typer.Option(False, "--yes", "-y", help="Also run the dossier without prompting"),
) -> None:
    """Run the full pipeline end-to-end."""
    s = _settings()

    def run():
        conn = _open(s)
        _emit(pipeline.run_all(s, conn, yes=yes))
        conn.close()

    _guard(run)


if __name__ == "__main__":
    app()
