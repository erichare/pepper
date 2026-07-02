"""Anthropic client factory."""

from __future__ import annotations


def make_anthropic_client(api_key: str):
    import anthropic

    return anthropic.Anthropic(api_key=api_key)
