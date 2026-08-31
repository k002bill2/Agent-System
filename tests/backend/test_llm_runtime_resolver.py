"""Tests for CLI-first LLM runtime resolution."""

from __future__ import annotations

from datetime import UTC, datetime

import pytest

from models.llm_access import (
    LLMAccessResponse,
    LLMCLIProfileResponse,
    LLMEntitlementResponse,
)
from models.llm_usage import LLMUsageSource
from services.llm_access_service import default_access_response
from services.llm_runtime_resolver import (
    LLMRuntimeRequest,
    LLMRuntimeResolutionError,
    resolve_llm_runtime,
)


def _profile(
    *,
    id: str = "profile-1",
    provider: str = "codex_cli",
) -> LLMCLIProfileResponse:
    now = datetime(2026, 7, 3, tzinfo=UTC)
    return LLMCLIProfileResponse(
        id=id,
        owner_user_id="user-1",
        organization_id=None,
        provider=provider,
        profile_name=f"{provider} profile",
        command="codex",
        args_json=["exec"],
        working_directory=None,
        auth_status="connected",
        metadata={},
        created_at=now,
        updated_at=now,
    )


def _entitlement(
    *,
    id: str = "ent-1",
    provider: str = "codex_cli",
    mode: str = "cli",
    source_scope: str = "all",
    enabled: bool = True,
    allow_api_fallback: bool = False,
    cli_profile_id: str | None = "profile-1",
) -> LLMEntitlementResponse:
    now = datetime(2026, 7, 3, tzinfo=UTC)
    return LLMEntitlementResponse(
        id=id,
        user_id="user-1",
        organization_id=None,
        provider=provider,
        mode=mode,
        source_scope=source_scope,
        enabled=enabled,
        cli_profile_id=cli_profile_id,
        allow_api_fallback=allow_api_fallback,
        quota_policy_id=None,
        created_at=now,
        updated_at=now,
    )


def test_resolve_default_codex_cli_access() -> None:
    access = default_access_response("user-1")

    resolution = resolve_llm_runtime(
        access,
        LLMRuntimeRequest(
            user_id="user-1",
            source=LLMUsageSource.PLAYGROUND,
            requested_model_id=None,
        ),
    )

    assert resolution.model_id == "codex-cli"
    assert resolution.provider == "codex_cli"
    assert resolution.mode == "cli"
    assert resolution.entitlement_id == "default-codex-cli-all"
    assert resolution.cli_profile_id == "default-codex-cli"


def test_resolve_matches_source_scope_prefix_for_task_analyzer_execution() -> None:
    access = LLMAccessResponse(
        user_id="user-1",
        api_fallback_enabled=False,
        profiles=[_profile()],
        entitlements=[_entitlement(source_scope="task_analyzer")],
    )

    resolution = resolve_llm_runtime(
        access,
        LLMRuntimeRequest(
            user_id="user-1",
            source=LLMUsageSource.TASK_ANALYZER_EXECUTION,
            requested_model_id="codex-cli",
        ),
    )

    assert resolution.provider == "codex_cli"
    assert resolution.source_scope == "task_analyzer"


def test_resolve_rejects_disabled_entitlement() -> None:
    access = LLMAccessResponse(
        user_id="user-1",
        api_fallback_enabled=False,
        profiles=[_profile()],
        entitlements=[_entitlement(enabled=False)],
    )

    with pytest.raises(LLMRuntimeResolutionError, match="No enabled LLM entitlement"):
        resolve_llm_runtime(
            access,
            LLMRuntimeRequest(
                user_id="user-1",
                source=LLMUsageSource.PLAYGROUND,
                requested_model_id="codex-cli",
            ),
        )


def test_resolve_rejects_api_model_without_fallback_policy() -> None:
    access = LLMAccessResponse(
        user_id="user-1",
        api_fallback_enabled=False,
        profiles=[],
        entitlements=[
            _entitlement(
                provider="openai",
                mode="api",
                cli_profile_id=None,
                allow_api_fallback=True,
            )
        ],
    )

    # gpt-4o (enabled) instead of gpt-5.4: the registry-disabled gate now fires
    # before entitlement selection, and this test's intent is the fallback
    # policy rejection, not the disabled-model rejection.
    with pytest.raises(LLMRuntimeResolutionError, match="API fallback is disabled"):
        resolve_llm_runtime(
            access,
            LLMRuntimeRequest(
                user_id="user-1",
                source=LLMUsageSource.PLAYGROUND,
                requested_model_id="gpt-4o",
            ),
        )


def test_resolve_rejects_semantically_invalid_provider_mode_pair() -> None:
    """A provider=openai/mode=cli entitlement is malformed: the mode gate
    trusts `mode` (cli bypasses the API-fallback check) while the executor
    builds by provider (ChatOpenAI). It must never be selected — with no
    valid entitlement left, resolution fails closed."""
    access = LLMAccessResponse(
        user_id="user-1",
        api_fallback_enabled=False,
        profiles=[],
        entitlements=[
            _entitlement(
                provider="openai",
                mode="cli",
                cli_profile_id=None,
            )
        ],
    )

    with pytest.raises(LLMRuntimeResolutionError, match="No enabled LLM entitlement"):
        resolve_llm_runtime(
            access,
            LLMRuntimeRequest(
                user_id="user-1",
                source=LLMUsageSource.PLAYGROUND,
                requested_model_id=None,
            ),
        )


def test_resolve_skips_malformed_entitlement_in_favor_of_valid_one() -> None:
    """When a malformed pair precedes a valid CLI entitlement, the default
    (no requested model) path must select the valid one, not the malformed."""
    access = LLMAccessResponse(
        user_id="user-1",
        api_fallback_enabled=False,
        profiles=[_profile(id="profile-claude", provider="claude_cli")],
        entitlements=[
            _entitlement(
                id="ent-malformed",
                provider="openai",
                mode="cli",
                cli_profile_id=None,
            ),
            _entitlement(
                id="ent-valid",
                provider="claude_cli",
                mode="cli",
                cli_profile_id="profile-claude",
            ),
        ],
    )

    resolution = resolve_llm_runtime(
        access,
        LLMRuntimeRequest(
            user_id="user-1",
            source=LLMUsageSource.PLAYGROUND,
            requested_model_id=None,
        ),
    )

    assert resolution.entitlement_id == "ent-valid"
    assert resolution.provider == "claude_cli"
    assert resolution.mode == "cli"


@pytest.fixture
def _static_registry():
    """Serve the in-memory _MODELS list (no DB cache) for registry-gate tests."""
    from models.llm_models import LLMModelRegistry

    original_cache = LLMModelRegistry._db_cache
    original_index = LLMModelRegistry._db_index
    LLMModelRegistry._db_cache = None
    LLMModelRegistry._db_index = {}
    yield
    LLMModelRegistry._db_cache = original_cache
    LLMModelRegistry._db_index = original_index


def test_resolve_rejects_disabled_requested_model(_static_registry) -> None:
    """A registry-disabled model must be rejected even for a fully entitled
    user — entitlements authorize the provider/mode, not a disabled model."""
    access = LLMAccessResponse(
        user_id="user-1",
        api_fallback_enabled=True,
        profiles=[],
        entitlements=[
            _entitlement(
                provider="openai",
                mode="api",
                cli_profile_id=None,
                allow_api_fallback=True,
            )
        ],
    )

    with pytest.raises(LLMRuntimeResolutionError, match="Model disabled"):
        resolve_llm_runtime(
            access,
            LLMRuntimeRequest(
                user_id="user-1",
                source=LLMUsageSource.PLAYGROUND,
                requested_model_id="gpt-5.4",
            ),
        )
