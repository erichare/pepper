"""Token/cost estimation for the Batch API dossier (with 50% batch discount)."""

from __future__ import annotations

from ..config import Settings

BATCH_DISCOUNT = 0.5
# Per-chunk output cap for the map stage. Must be generous: a chunk covers a few
# hundred comments and the structured output (interests/opinions/values/voice/
# facts) was being truncated at 1500, silently dropping the later fields.
MAP_MAX_OUTPUT_TOKENS = 4000
REDUCE_MAX_OUTPUT_TOKENS = 8000


def estimate_tokens(text: str | None) -> int:
    """Rough token estimate (~4 chars/token). Used for chunking + cost preview."""
    if not text:
        return 0
    return max(1, len(text) // 4)


def estimate_cost(
    chunks: list[list[dict]],
    settings: Settings,
    *,
    reduce_groups: int | None = None,
) -> dict:
    """Estimate input/output tokens and USD for the whole map-reduce run."""
    # map stage
    map_input = 0
    for chunk in chunks:
        map_input += 400  # prompt/tool overhead per request
        for rec in chunk:
            map_input += estimate_tokens(rec.get("text")) + estimate_tokens(rec.get("reply_to")) + 20
    map_output = len(chunks) * MAP_MAX_OUTPUT_TOKENS

    # reduce stage (hierarchical): assume map outputs re-read once + final synthesis
    n_reduce = reduce_groups if reduce_groups is not None else max(1, len(chunks) // 30)
    reduce_input = len(chunks) * MAP_MAX_OUTPUT_TOKENS + n_reduce * 500
    reduce_output = (n_reduce + 1) * REDUCE_MAX_OUTPUT_TOKENS

    input_tokens = map_input + reduce_input
    output_tokens = map_output + reduce_output

    in_price = settings.llm_price_input_per_mtok * BATCH_DISCOUNT
    out_price = settings.llm_price_output_per_mtok * BATCH_DISCOUNT
    usd = (input_tokens / 1_000_000) * in_price + (output_tokens / 1_000_000) * out_price

    return {
        "chunks": len(chunks),
        "reduce_groups": n_reduce,
        "input_tokens": input_tokens,
        "output_tokens": output_tokens,
        "usd": round(usd, 4),
        "model": settings.llm_model,
        "batch_discount": BATCH_DISCOUNT,
    }


def format_estimate(est: dict) -> str:
    return (
        "LLM dossier cost estimate (Anthropic Batch API, 50% discount applied)\n"
        f"  model............ {est['model']}\n"
        f"  map chunks....... {est['chunks']}\n"
        f"  reduce groups.... {est['reduce_groups']}\n"
        f"  input tokens..... ~{est['input_tokens']:,}\n"
        f"  output tokens.... ~{est['output_tokens']:,}\n"
        f"  estimated cost... ${est['usd']:.2f}\n"
    )
