"""Tests for LLM router API key masking — must not corrupt the stored key.

Regression guard: the API layer masked ``api_key`` in-place on the live in-memory
provider object returned by ``LLMRouterService.list_providers()``/``get_provider()``.
Because the registry shares references, the first ``GET /providers`` call
permanently overwrote the real key with ``***xxxx``, breaking provider auth.

The fix exposes a ``_masked()`` helper that returns a masked *copy*, leaving the
stored object untouched. The discriminating assertion is therefore on the
original object, not the returned one — a test that only checks the response is
masked passes even with the bug.
"""

from api.llm_router import _masked
from models.llm_router import LLMProvider, LLMProviderConfig


def _provider(api_key: str | None) -> LLMProviderConfig:
    return LLMProviderConfig(provider=LLMProvider.OPENAI, model="gpt-4", api_key=api_key)


def test_masked_returns_copy_without_mutating_original():
    provider = _provider("sk-realkey1234")

    masked = _masked(provider)

    # the exposed copy is masked
    assert masked.api_key == "***1234"
    # the stored object keeps its real key — this assertion fails under the bug
    assert provider.api_key == "sk-realkey1234"


def test_masked_short_key_fully_hidden():
    provider = _provider("abcd")  # len == 4, not > 4 → fully hidden

    masked = _masked(provider)

    assert masked.api_key == "***"
    assert provider.api_key == "abcd"


def test_masked_none_key_is_noop():
    provider = _provider(None)

    masked = _masked(provider)

    assert masked.api_key is None
