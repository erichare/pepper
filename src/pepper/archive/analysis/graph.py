"""Interaction graph: who the subject replies to, and community structure.

Derived from comments joined to their fetched parents (context_items). Produces
top interlocutors, subreddit participation, and networkx graph metrics. Degrades
gracefully to an empty result when context wasn't fetched.
"""

from __future__ import annotations

import sqlite3

from ..logging import get_logger

log = get_logger(__name__)

_REPLY_SQL = """
SELECT ci.author AS author, i.subreddit AS subreddit, cl.relation AS relation, COUNT(*) AS c
FROM items i
JOIN context_links cl ON cl.comment_id = i.id
JOIN context_items ci ON ci.id = cl.context_id
WHERE i.type = 'comment'
  AND ci.author IS NOT NULL AND ci.author NOT IN ('[deleted]', '')
GROUP BY ci.author, i.subreddit, cl.relation
"""


def compute_graph(conn: sqlite3.Connection) -> dict:
    rows = conn.execute(_REPLY_SQL).fetchall()
    if not rows:
        return {"empty": True, "reason": "no context/interaction data"}

    try:
        import networkx as nx
    except Exception as e:  # noqa: BLE001
        log.warning("networkx_unavailable", error=str(e))
        nx = None

    author_counts: dict[str, int] = {}
    author_subs: dict[str, set[str]] = {}
    edges: dict[str, int] = {}
    for r in rows:
        author, sub, _rel, c = r["author"], r["subreddit"], r["relation"], r["c"]
        author_counts[author] = author_counts.get(author, 0) + c
        author_subs.setdefault(author, set())
        if sub:
            author_subs[author].add(sub)
        edges[author] = edges.get(author, 0) + c

    top_interlocutors = sorted(
        (
            {"author": a, "replies": n, "subreddits": sorted(author_subs.get(a, []))[:10]}
            for a, n in author_counts.items()
        ),
        key=lambda d: d["replies"],
        reverse=True,
    )[:30]

    metrics: dict = {"distinct_interlocutors": len(author_counts)}
    if nx is not None:
        g = nx.Graph()
        you = "u/self"
        g.add_node(you)
        for author, weight in edges.items():
            g.add_edge(you, f"u/{author}", weight=weight)
        metrics.update(
            nodes=g.number_of_nodes(),
            edges=g.number_of_edges(),
            density=round(nx.density(g), 5) if g.number_of_nodes() > 1 else 0.0,
        )

    edge_list = [
        {"source": "u/self", "target": f"u/{a}", "weight": n}
        for a, n in sorted(edges.items(), key=lambda kv: kv[1], reverse=True)[:200]
    ]

    return {
        "empty": False,
        "top_interlocutors": top_interlocutors,
        "metrics": metrics,
        "edges": edge_list,
    }
