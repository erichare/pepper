"""Render the Markdown persona dossier from analysis + LLM dossier data."""

from __future__ import annotations

from pathlib import Path

from jinja2 import Environment, FileSystemLoader

_TEMPLATES = Path(__file__).parent / "templates"


def render_markdown(analysis: dict, dossier: dict | None, out_path: Path) -> Path:
    env = Environment(
        loader=FileSystemLoader(str(_TEMPLATES)),
        trim_blocks=True,
        lstrip_blocks=True,
    )
    template = env.get_template("dossier.md.j2")
    md = template.render(
        username=analysis.get("username", "unknown"),
        stats=analysis.get("stats", {}),
        linguistic=analysis.get("linguistic", {}),
        topics=analysis.get("topics", {}),
        graph=analysis.get("graph", {}),
        dossier=dossier,
    )
    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_text(md, encoding="utf-8")
    return out_path
