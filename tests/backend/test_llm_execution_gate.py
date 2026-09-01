"""Execution-gate tests: ``LLMService._get_llm`` must honor the live registry.

The legacy static ``MODEL_CONFIGS`` map was frozen at import time from the code
``_MODELS`` list, which broke both directions of the gate:

- DB-discovered models (present only in the registry cache) raised
  ``Unknown model`` even when enabled, and
- registry-disabled models still built real provider clients because the static
  map carries disabled entries and never sees admin disable actions.
"""

from __future__ import annotations

import pytest

from models.llm_models import LLMModelConfig, LLMModelRegistry, LLMProvider
from services.llm_service import LLMService


@pytest.fixture
def _clean_llm_instances():
    """Isolate the _get_llm instance cache so gates run for every test."""
    original = dict(LLMService._instances)
    LLMService._instances.clear()
    yield
    LLMService._instances.clear()
    LLMService._instances.update(original)


@pytest.fixture
def _registry_cache():
    """Snapshot/restore the registry DB cache mutated by these tests."""
    original_cache = LLMModelRegistry._db_cache
    original_index = LLMModelRegistry._db_index
    yield
    LLMModelRegistry._db_cache = original_cache
    LLMModelRegistry._db_index = original_index


def _install_db_models(models: list[LLMModelConfig]) -> None:
    LLMModelRegistry._db_cache = models
    LLMModelRegistry._db_index = {m.id: m for m in models}


def test_get_llm_builds_db_only_enabled_registry_model(
    _clean_llm_instances, _registry_cache
) -> None:
    """A model that exists only in the DB-loaded registry (not in the legacy
    static map) must build from registry metadata when enabled."""
    from services.codex_cli_chat_model import CodexCliChatModel

    _install_db_models(
        [
            LLMModelConfig(
                id="db-only-codex-model",
                display_name="DB Only Codex",
                provider=LLMProvider.CODEX_CLI,
                context_window=200000,
                input_price=0.0,
                output_price=0.0,
                is_enabled=True,
            )
        ]
    )

    llm = LLMService._get_llm("db-only-codex-model")

    assert isinstance(llm, CodexCliChatModel)
    assert llm.model_name == "db-only-codex-model"


def test_get_llm_rejects_statically_disabled_model(
    _clean_llm_instances, _registry_cache, monkeypatch
) -> None:
    """A disabled model from the code registry must not build a real provider
    client even when the provider API key is present."""
    monkeypatch.setenv("OPENAI_API_KEY", "test-key")
    LLMModelRegistry._db_cache = None
    LLMModelRegistry._db_index = {}

    with pytest.raises(ValueError, match="Model disabled"):
        LLMService._get_llm("gpt-5.4")


def test_get_llm_rejects_db_disabled_model(_clean_llm_instances, _registry_cache) -> None:
    """An admin-disabled DB model must be rejected as disabled — not silently
    conflated with an unknown model."""
    _install_db_models(
        [
            LLMModelConfig(
                id="db-disabled-model",
                display_name="DB Disabled",
                provider=LLMProvider.CODEX_CLI,
                context_window=200000,
                input_price=0.0,
                output_price=0.0,
                is_enabled=False,
            )
        ]
    )

    with pytest.raises(ValueError, match="Model disabled"):
        LLMService._get_llm("db-disabled-model")


def test_get_llm_unknown_model_still_rejected(_clean_llm_instances, _registry_cache) -> None:
    LLMModelRegistry._db_cache = None
    LLMModelRegistry._db_index = {}

    with pytest.raises(ValueError, match="Unknown model"):
        LLMService._get_llm("no-such-model-anywhere")
