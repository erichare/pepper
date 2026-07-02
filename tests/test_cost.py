from __future__ import annotations

from pepper.archive.config import Settings
from pepper.archive.llm.corpus import chunk_records
from pepper.archive.llm.cost import BATCH_DISCOUNT, estimate_cost, estimate_tokens


def test_estimate_tokens_monotonic():
    assert estimate_tokens("") == 0
    assert estimate_tokens("a" * 40) == 10
    assert estimate_tokens("x" * 400) > estimate_tokens("x" * 40)


def test_chunking_respects_token_budget():
    records = [{"id": f"t1_{i}", "text": "word " * 500} for i in range(50)]
    chunks = chunk_records(records, max_input_tokens=2000)
    assert len(chunks) > 1
    assert sum(len(c) for c in chunks) == 50


def test_estimate_cost_applies_batch_discount():
    settings = Settings(_env_file=None, llm_price_input_per_mtok=3.0, llm_price_output_per_mtok=15.0)
    records = [{"id": f"t1_{i}", "text": "hello world " * 100} for i in range(40)]
    chunks = chunk_records(records, max_input_tokens=5000)

    est = estimate_cost(chunks, settings)
    assert est["batch_discount"] == BATCH_DISCOUNT
    assert est["usd"] > 0
    assert est["input_tokens"] > 0 and est["output_tokens"] > 0

    # doubling the raw price should ~double the estimate
    pricey = Settings(_env_file=None, llm_price_input_per_mtok=6.0, llm_price_output_per_mtok=30.0)
    est2 = estimate_cost(chunks, pricey)
    assert est2["usd"] > est["usd"]
