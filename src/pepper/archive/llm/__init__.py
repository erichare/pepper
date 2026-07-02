"""LLM persona dossier via the Anthropic Batch API (map-reduce, cost-gated)."""

from __future__ import annotations

from .corpus import build_records, chunk_records
from .cost import estimate_cost, format_estimate
from .dossier import generate_dossier, load_latest_dossier
from .prompts import PROMPT_VERSION

__all__ = [
    "PROMPT_VERSION",
    "build_records",
    "chunk_records",
    "estimate_cost",
    "format_estimate",
    "generate_dossier",
    "load_latest_dossier",
]
