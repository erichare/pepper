"""Render a single self-contained HTML dashboard (Plotly JS inlined)."""

from __future__ import annotations

from pathlib import Path

from jinja2 import Environment, FileSystemLoader, select_autoescape

from . import charts

_TEMPLATES = Path(__file__).parent / "templates"


def render_dashboard(analysis: dict, dossier: dict | None, out_path: Path) -> Path:
    stats = analysis.get("stats", {})
    topics = analysis.get("topics", {})

    figs = [
        charts.timeline_fig(stats),
        charts.subreddits_fig(stats),
        charts.heatmap_fig(stats),
        charts.karma_year_fig(stats),
        charts.topics_over_time_fig(topics),
    ]
    # inline plotly.js once (first chart), reference it for the rest -> self-contained
    chart_divs = []
    for i, fig in enumerate(figs):
        chart_divs.append(
            fig.to_html(full_html=False, include_plotlyjs=("inline" if i == 0 else False))
        )

    env = Environment(
        loader=FileSystemLoader(str(_TEMPLATES)),
        autoescape=select_autoescape(["html"]),
    )
    template = env.get_template("dashboard.html.j2")
    html = template.render(
        username=analysis.get("username", "unknown"),
        totals=stats.get("totals", {}),
        chart_divs=chart_divs,
        dossier=dossier,
        linguistic=analysis.get("linguistic", {}),
        graph=analysis.get("graph", {}),
    )
    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_text(html, encoding="utf-8")
    return out_path
