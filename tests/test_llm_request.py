"""Tests for request-scoped LLM configuration normalization."""

import pytest

from app.core.llm_request import normalize_reasoning_effort


@pytest.mark.parametrize("effort", ["none", "low", "medium", "high", "xhigh", "max"])
def test_normalize_reasoning_effort_accepts_supported_levels(effort):
    # Header values are normalized before being passed to the provider client.
    assert normalize_reasoning_effort(f" {effort.upper()} ") == effort


def test_normalize_reasoning_effort_rejects_unknown_level():
    # Unknown values are omitted rather than forwarded to the provider.
    assert normalize_reasoning_effort("extreme") is None
