"""Pure source-shape -> canonical NormalizedItem mapping."""

from __future__ import annotations

from .gdpr_map import map_gdpr_comment_row, map_gdpr_post_row
from .reddit_map import map_reddit_obj, reddit_status_hint

__all__ = [
    "map_gdpr_comment_row",
    "map_gdpr_post_row",
    "map_reddit_obj",
    "reddit_status_hint",
]
