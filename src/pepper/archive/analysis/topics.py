"""Topic modeling (TF-IDF + NMF) and topics-over-time. Deterministic (fixed seed)."""

from __future__ import annotations

import polars as pl

from ..logging import get_logger

log = get_logger(__name__)

_RANDOM_STATE = 42


def compute_topics(df: pl.DataFrame, n_topics: int = 8, top_terms: int = 12) -> dict:
    if df.is_empty() or "year" not in df.columns:
        return {"empty": True, "reason": "no items"}
    docs_df = df.filter(
        pl.col("text").is_not_null()
        & (pl.col("text").str.len_chars() > 20)
        & (~pl.col("text").is_in(["[deleted]", "[removed]"]))
    ).select(["text", "year"])
    docs = docs_df["text"].to_list()
    years = docs_df["year"].to_list()

    if len(docs) < 20:
        return {"empty": True, "reason": f"only {len(docs)} usable documents"}

    try:
        from sklearn.decomposition import NMF
        from sklearn.feature_extraction.text import TfidfVectorizer
    except Exception as e:  # noqa: BLE001
        log.warning("sklearn_unavailable", error=str(e))
        return {"empty": True, "reason": "scikit-learn unavailable"}

    n_topics = max(2, min(n_topics, len(docs) // 5))
    vec = TfidfVectorizer(
        max_df=0.6, min_df=2, stop_words="english", ngram_range=(1, 2), max_features=5000
    )
    try:
        matrix = vec.fit_transform(docs)
    except ValueError as e:
        return {"empty": True, "reason": f"vectorizer: {e}"}

    if matrix.shape[1] < n_topics:
        return {"empty": True, "reason": "vocabulary too small"}

    nmf = NMF(n_components=n_topics, random_state=_RANDOM_STATE, init="nndsvda", max_iter=400)
    doc_topics = nmf.fit_transform(matrix)
    terms = vec.get_feature_names_out()

    topics = []
    for ti, comp in enumerate(nmf.components_):
        top_idx = comp.argsort()[::-1][:top_terms]
        topics.append({"topic": ti, "terms": [terms[i] for i in top_idx]})

    dominant = doc_topics.argmax(axis=1)
    # topics over time: count of dominant-topic assignments per (year, topic)
    over_time: dict[tuple, int] = {}
    for yr, tp in zip(years, dominant, strict=False):
        if yr is None:
            continue
        over_time[(int(yr), int(tp))] = over_time.get((int(yr), int(tp)), 0) + 1
    over_time_list = [
        {"year": y, "topic": t, "count": c} for (y, t), c in sorted(over_time.items())
    ]

    sizes = [int((dominant == ti).sum()) for ti in range(n_topics)]
    for t, s in zip(topics, sizes, strict=False):
        t["size"] = s

    return {"empty": False, "n_topics": n_topics, "topics": topics, "over_time": over_time_list}
