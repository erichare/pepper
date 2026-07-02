"""Plotly figure builders for the dashboard. All tolerate empty/missing data."""

from __future__ import annotations

import plotly.graph_objects as go

_WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]


def _empty(title: str) -> go.Figure:
    fig = go.Figure()
    fig.add_annotation(text="no data", showarrow=False, font={"size": 16})
    fig.update_layout(title=title, height=320)
    return fig


def timeline_fig(stats: dict) -> go.Figure:
    tl = stats.get("timeline") or []
    if not tl:
        return _empty("Activity over time")
    x = [r["year_month"] for r in tl]
    fig = go.Figure()
    fig.add_bar(x=x, y=[r["comments"] for r in tl], name="comments")
    fig.add_bar(x=x, y=[r["submissions"] for r in tl], name="submissions")
    fig.update_layout(title="Activity over time", barmode="stack", height=380, xaxis_title="month")
    return fig


def subreddits_fig(stats: dict) -> go.Figure:
    subs = (stats.get("subreddits") or [])[:20]
    if not subs:
        return _empty("Top subreddits")
    subs = list(reversed(subs))
    fig = go.Figure(
        go.Bar(x=[s["count"] for s in subs], y=[f"r/{s['subreddit']}" for s in subs], orientation="h")
    )
    fig.update_layout(title="Top subreddits by activity", height=520, xaxis_title="items")
    return fig


def heatmap_fig(stats: dict) -> go.Figure:
    hm = stats.get("heatmap") or []
    if not hm:
        return _empty("Posting rhythm (weekday × hour)")
    grid = [[0] * 24 for _ in range(7)]
    for r in hm:
        wd = int(r["weekday"]) - 1  # 1..7 -> 0..6
        hr = int(r["hour"])
        if 0 <= wd < 7 and 0 <= hr < 24:
            grid[wd][hr] = r["count"]
    fig = go.Figure(
        go.Heatmap(z=grid, x=list(range(24)), y=_WEEKDAYS, colorscale="Viridis")
    )
    fig.update_layout(title="Posting rhythm (weekday × hour, UTC)", height=360, xaxis_title="hour")
    return fig


def karma_year_fig(stats: dict) -> go.Figure:
    ky = (stats.get("karma") or {}).get("by_year") or []
    if not ky:
        return _empty("Karma by year")
    fig = go.Figure(go.Bar(x=[r["year"] for r in ky], y=[r["score"] for r in ky]))
    fig.update_layout(title="Score earned by year", height=340, xaxis_title="year", yaxis_title="score")
    return fig


def topics_over_time_fig(topics: dict) -> go.Figure:
    if topics.get("empty"):
        return _empty("Topics over time")
    ot = topics.get("over_time") or []
    labels = {t["topic"]: ", ".join(t["terms"][:3]) for t in topics.get("topics", [])}
    years = sorted({r["year"] for r in ot})
    fig = go.Figure()
    for tp in sorted({r["topic"] for r in ot}):
        counts = {r["year"]: r["count"] for r in ot if r["topic"] == tp}
        fig.add_bar(x=years, y=[counts.get(y, 0) for y in years], name=labels.get(tp, f"topic {tp}"))
    fig.update_layout(title="Topics over time", barmode="stack", height=400, xaxis_title="year")
    return fig
