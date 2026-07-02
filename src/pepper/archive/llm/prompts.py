"""Prompt templates and structured-output tool schemas for the dossier.

The map stage forces a tool call so output is machine-parseable; every claimed
biographical fact must cite a ``source_id`` that appears in the chunk.
"""

from __future__ import annotations

import json

# bump when prompts/schema change — invalidates the map + dossier caches
PROMPT_VERSION = "2026-07-01.v1"

_FACT_CATEGORIES = ["age", "location", "job", "education", "relationship", "life_event", "health", "other"]

MAP_TOOL = {
    "name": "record_findings",
    "description": "Record what this batch of the user's own Reddit posts/comments reveals about them.",
    "input_schema": {
        "type": "object",
        "properties": {
            "interests": {"type": "array", "items": {"type": "string"},
                          "description": "Topics/hobbies/domains the user is clearly interested in."},
            "opinions": {"type": "array", "items": {"type": "string"},
                         "description": "Distinct opinions/stances the user expresses."},
            "values": {"type": "array", "items": {"type": "string"},
                       "description": "Underlying values/principles evident in their writing."},
            "voice_traits": {"type": "array", "items": {"type": "string"},
                             "description": "Concrete style/voice traits (tone, humor, punctuation, slang, formatting)."},
            "claimed_facts": {
                "type": "array",
                "items": {
                    "type": "object",
                    "properties": {
                        "category": {"type": "string", "enum": _FACT_CATEGORIES},
                        "value": {"type": "string", "description": "The self-disclosed fact, concise."},
                        "confidence": {"type": "string", "enum": ["low", "medium", "high"]},
                        "source_id": {"type": "string",
                                      "description": "The id (t1_/t3_) of the item that states this. MUST be from this batch."},
                    },
                    "required": ["category", "value", "confidence", "source_id"],
                },
                "description": "Self-disclosed biographical facts, each cited to a source id in this batch.",
            },
        },
        "required": ["interests", "opinions", "values", "voice_traits", "claimed_facts"],
    },
}

REDUCE_TOOL = {
    "name": "synthesize_dossier",
    "description": "Synthesize a single persona dossier from many per-batch findings.",
    "input_schema": {
        "type": "object",
        "properties": {
            "summary": {"type": "string", "description": "2-4 paragraph overview of who this person is."},
            "interests": {"type": "array", "items": {"type": "string"}},
            "opinions": {"type": "array", "items": {"type": "string"}},
            "values": {"type": "array", "items": {"type": "string"}},
            "personality": {"type": "array", "items": {"type": "string"},
                            "description": "Personality traits inferred from the corpus."},
            "voice_guide": {
                "type": "object",
                "properties": {
                    "tone": {"type": "string"},
                    "quirks": {"type": "array", "items": {"type": "string"}},
                    "vocabulary": {"type": "array", "items": {"type": "string"}},
                    "dos": {"type": "array", "items": {"type": "string"}},
                    "donts": {"type": "array", "items": {"type": "string"}},
                    "example_openers": {"type": "array", "items": {"type": "string"}},
                },
                "required": ["tone", "quirks", "dos", "donts"],
            },
            "biographical_facts": {
                "type": "array",
                "items": {
                    "type": "object",
                    "properties": {
                        "category": {"type": "string", "enum": _FACT_CATEGORIES},
                        "value": {"type": "string"},
                        "confidence": {"type": "string", "enum": ["low", "medium", "high"]},
                        "sources": {"type": "array", "items": {"type": "string"},
                                    "description": "All item ids that support this fact. Never invent ids."},
                    },
                    "required": ["category", "value", "confidence", "sources"],
                },
            },
        },
        "required": ["summary", "interests", "opinions", "values", "personality",
                     "voice_guide", "biographical_facts"],
    },
}

_MAP_SYSTEM = (
    "You are building a factual profile of a single Reddit user from their OWN posts and "
    "comments (the account owner authorized this). Analyze only the provided batch. Extract "
    "interests, opinions, values, voice/style traits, and any self-disclosed biographical facts. "
    "For every biographical fact, cite the exact item id it came from; only use ids present in "
    "this batch. Be precise and do not speculate beyond the text. Call the record_findings tool."
)

_REDUCE_SYSTEM = (
    "You are synthesizing a single, coherent persona dossier from many per-batch findings about "
    "one Reddit user (the account owner authorized this profile of their own account). Merge and "
    "deduplicate interests/opinions/values/voice traits. Consolidate duplicate biographical facts, "
    "unioning ALL their citing source ids into the sources array. Never invent a source id that "
    "was not provided. Produce a voice guide usable to imitate this person's writing. "
    "Call the synthesize_dossier tool."
)


def build_map_request_params(chunk: list[dict], model: str, max_tokens: int) -> dict:
    lines = [_render_record(r) for r in chunk]
    user = "Here are the user's items for this batch:\n\n" + "\n".join(lines)
    return {
        "model": model,
        "max_tokens": max_tokens,
        "system": _MAP_SYSTEM,
        "tools": [MAP_TOOL],
        "tool_choice": {"type": "tool", "name": "record_findings"},
        "messages": [{"role": "user", "content": user}],
    }


def build_reduce_request_params(findings: list[dict], model: str, max_tokens: int) -> dict:
    user = (
        "Per-batch findings (JSON array) to synthesize into one dossier:\n\n"
        + json.dumps(findings, ensure_ascii=False)
    )
    return {
        "model": model,
        "max_tokens": max_tokens,
        "system": _REDUCE_SYSTEM,
        "tools": [REDUCE_TOOL],
        "tool_choice": {"type": "tool", "name": "synthesize_dossier"},
        "messages": [{"role": "user", "content": user}],
    }


def _render_record(r: dict) -> str:
    head = f"[{r['id']}] r/{r.get('sub')} ({r.get('kind')})"
    if r.get("reply_to"):
        head += f" replying to: {r['reply_to']!r}"
    return f"{head}\n{r.get('text', '')}"
