"""Report generation: Markdown dossier + self-contained HTML dashboard."""

from __future__ import annotations

from .dashboard import render_dashboard
from .markdown import render_markdown

__all__ = ["render_dashboard", "render_markdown"]
