"""Linguistic analysis: vocabulary, distinctive phrases, readability, tone.

Uses nltk (stopwords/tokenizer) and textstat when available, with a pure-regex
fallback so the stage never hard-fails. NLTK corpora are cached under the data dir.
"""

from __future__ import annotations

import contextlib
import re
from collections import Counter
from pathlib import Path

import polars as pl

from ..logging import get_logger

log = get_logger(__name__)

_WORD_RE = re.compile(r"[a-zA-Z']+")
_FALLBACK_STOPWORDS = frozenset(
    "the a an and or but if then of to in on for with as at by from into is are was were be "
    "been being it its this that these those i you he she they we me my your his her their our "
    "us them not no so do does did have has had will would can could should just really like im "
    "dont thats what when where who why how".split()
)


def ensure_nltk(nltk_dir: Path) -> bool:
    try:
        import nltk

        nltk_dir.mkdir(parents=True, exist_ok=True)
        if str(nltk_dir) not in nltk.data.path:
            nltk.data.path.insert(0, str(nltk_dir))
        for pkg in ("stopwords", "punkt", "punkt_tab"):
            with contextlib.suppress(Exception):
                nltk.download(pkg, download_dir=str(nltk_dir), quiet=True)
        return True
    except Exception as e:  # noqa: BLE001
        log.warning("nltk_unavailable", error=str(e))
        return False


def _stopwords(nltk_ok: bool) -> set[str]:
    if nltk_ok:
        try:
            from nltk.corpus import stopwords

            return set(stopwords.words("english")) | _FALLBACK_STOPWORDS
        except Exception:  # noqa: BLE001
            pass
    return _FALLBACK_STOPWORDS


def compute_linguistic(df: pl.DataFrame, nltk_dir: Path) -> dict:
    texts = [t for t in df["text"].to_list() if t and t not in ("[deleted]", "[removed]")]
    if not texts:
        return {"empty": True}

    nltk_ok = ensure_nltk(nltk_dir)
    stop = _stopwords(nltk_ok)

    all_tokens: list[str] = []
    for t in texts:
        all_tokens.extend(w.lower() for w in _WORD_RE.findall(t))

    total = len(all_tokens)
    unique = len(set(all_tokens))
    content = [w for w in all_tokens if w not in stop and len(w) > 2]

    top_words = [{"word": w, "count": c} for w, c in Counter(content).most_common(40)]
    bigrams = _top_ngrams(content, 2, 25)
    trigrams = _top_ngrams(content, 3, 20)

    question_items = sum(1 for t in texts if "?" in t)
    tone = {
        "question_ratio": round(question_items / len(texts), 3),
        "exclamation_ratio": round(sum(1 for t in texts if "!" in t) / len(texts), 3),
        "avg_words_per_item": round(total / len(texts), 1),
    }

    readability = _readability("\n\n".join(texts[:5000]))

    return {
        "empty": False,
        "vocabulary": {
            "total_words": total,
            "unique_words": unique,
            "richness": round(unique / total, 4) if total else 0.0,
        },
        "top_words": top_words,
        "distinctive_bigrams": bigrams,
        "distinctive_trigrams": trigrams,
        "tone": tone,
        "readability": readability,
        "nltk": nltk_ok,
    }


def _top_ngrams(tokens: list[str], n: int, top: int) -> list[dict]:
    if len(tokens) < n:
        return []
    grams = Counter(zip(*[tokens[i:] for i in range(n)], strict=False))
    return [{"phrase": " ".join(g), "count": c} for g, c in grams.most_common(top)]


def _readability(text: str) -> dict:
    try:
        import textstat

        return {
            "flesch_reading_ease": round(textstat.flesch_reading_ease(text), 1),
            "flesch_kincaid_grade": round(textstat.flesch_kincaid_grade(text), 1),
            "smog_index": round(textstat.smog_index(text), 1),
        }
    except Exception as e:  # noqa: BLE001
        log.warning("readability_unavailable", error=str(e))
        return {}
