"""Run all analysis stages and persist a JSON cache consumed by the report layer."""

from __future__ import annotations

import json
import sqlite3
from pathlib import Path

from ..config import Settings
from ..logging import get_logger
from .frame import load_frame
from .graph import compute_graph
from .linguistic import compute_linguistic
from .stats import compute_stats
from .topics import compute_topics

log = get_logger(__name__)


def run_analysis(conn: sqlite3.Connection, settings: Settings) -> dict:
    """Compute stats/linguistic/topics/graph and write exports/analysis.json."""
    df = load_frame(conn)
    log.info("analysis_frame", rows=df.height)

    result = {
        "username": settings.reddit_username,
        "stats": compute_stats(df),
        "linguistic": compute_linguistic(df, settings.nltk_dir),
        "topics": compute_topics(df),
        "graph": compute_graph(conn),
    }

    settings.exports_dir.mkdir(parents=True, exist_ok=True)
    out = settings.exports_dir / "analysis.json"
    out.write_text(json.dumps(result, indent=2, default=str), encoding="utf-8")
    log.info("analysis_written", path=str(out))
    return result


def load_analysis(settings: Settings) -> dict | None:
    path: Path = settings.exports_dir / "analysis.json"
    if not path.exists():
        return None
    return json.loads(path.read_text(encoding="utf-8"))
