"""get_default fail-closed(LookupError) 전파에 대한 호출부 가드 회귀 테스트.

LLMModelRegistry.get_default 는 미지 provider·enabled 모델 0개 provider 에
LookupError 로 fail-closed 한다 (타 provider 모델 "codex-cli" 조용한 대입
금지 — 정책 2026-09-01). 이 파일은 그 예외가 각 호출부에서 500/기동 실패가
아니라 '통제된' 실패로 번역되는지 고정한다:

- config.py 헬퍼: 구성 기본값 → legacy "codex-cli" 폴백 (내부 기본값 선택,
  실행 시 LLMService._get_llm 게이트가 unknown/disabled 를 재검증)
- services/agent_registry.py: default_factory 경로의 legacy "codex-cli" 폴백
- services/llm_service.py: 모듈 실패 계약 타입(ValueError)으로 번역
- services/llm_runtime_resolver.py: LLMProvider enum 밖 entitlement 거부
  (계약 타입 LLMRuntimeResolutionError)
- agents/base.py: import 시점 해석 금지(safe_import 가 라우터 트리를 조용히
  제거하는 경로 차단) + 인스턴스 생성 시점 ValueError 로 fail-closed
- agents/lead_orchestrator.py: 생성자 경로가 LookupError 를 흘리지 않고
  가드된 기본값 해석(ValueError 계약)에 위임
"""

import os
import subprocess
import sys
from datetime import UTC, datetime
from pathlib import Path

import pytest

from models.llm_access import LLMAccessResponse, LLMEntitlementResponse
from models.llm_models import LLMModelConfig, LLMModelRegistry, LLMProvider
from models.llm_usage import LLMUsageSource
from services.llm_runtime_resolver import (
    LLMRuntimeRequest,
    LLMRuntimeResolutionError,
    resolve_llm_runtime,
)


@pytest.fixture(autouse=True)
def _reset_registry_cache():
    """Ensure the registry serves the in-memory _MODELS list (no DB cache)."""
    original_cache = LLMModelRegistry._db_cache
    original_index = LLMModelRegistry._db_index
    LLMModelRegistry._db_cache = None
    LLMModelRegistry._db_index = {}
    yield
    LLMModelRegistry._db_cache = original_cache
    LLMModelRegistry._db_index = original_index


def _cfg(
    model_id: str,
    *,
    provider: LLMProvider = LLMProvider.GOOGLE,
    is_default: bool = False,
    is_enabled: bool = True,
) -> LLMModelConfig:
    return LLMModelConfig(
        id=model_id,
        display_name=model_id,
        provider=provider,
        context_window=100_000,
        input_price=0.001,
        output_price=0.002,
        is_default=is_default,
        is_enabled=is_enabled,
    )


def _serve_from_cache(models: list[LLMModelConfig]) -> None:
    LLMModelRegistry._db_cache = models
    LLMModelRegistry._db_index = {m.id: m for m in models}


def _entitlement(
    *,
    provider: str,
    mode: str,
    id: str = "ent-1",
) -> LLMEntitlementResponse:
    now = datetime(2026, 9, 1, tzinfo=UTC)
    return LLMEntitlementResponse(
        id=id,
        user_id="user-1",
        organization_id=None,
        provider=provider,
        mode=mode,
        source_scope="all",
        enabled=True,
        cli_profile_id=None,
        allow_api_fallback=False,
        quota_policy_id=None,
        created_at=now,
        updated_at=now,
    )


# ─────────────────────────────────────────────────────────────
# config.py — get_model_for_provider / get_default_model
# ─────────────────────────────────────────────────────────────


class TestConfigDefaultModelHelpers:
    def test_get_model_for_provider_passes_through_valid_provider(self):
        from config import get_model_for_provider

        assert get_model_for_provider("anthropic") == "claude-sonnet-5"

    def test_empty_provider_falls_back_to_configured_default(self, monkeypatch):
        """enabled 모델 0개 provider: LookupError 를 orchestrator/router 초기화
        경로로 흘리지 않고 구성된 기본 모델로 폴백한다."""
        from config import get_model_for_provider

        monkeypatch.delenv("LLM_PROVIDER", raising=False)
        _serve_from_cache(
            [
                _cfg("g-disabled", is_enabled=False),
                _cfg("codex-cli", provider=LLMProvider.CODEX_CLI, is_default=True),
            ]
        )
        assert get_model_for_provider("google") == "codex-cli"

    def test_unknown_provider_name_falls_back_to_configured_default(self, monkeypatch):
        from config import get_model_for_provider

        monkeypatch.delenv("LLM_PROVIDER", raising=False)
        assert get_model_for_provider("not-a-provider") == "codex-cli"

    def test_get_default_model_rogue_env_falls_back_to_codex_cli(self, monkeypatch):
        """LLM_PROVIDER 가 미지 문자열이면 registry 는 fail-closed 하지만,
        config 헬퍼는 legacy "codex-cli" 로 폴백한다 (실행 시 _get_llm 게이트
        가 재검증하는 문서화된 관례)."""
        from config import get_default_model

        monkeypatch.setenv("LLM_PROVIDER", "rogue-provider")
        assert get_default_model() == "codex-cli"


# ─────────────────────────────────────────────────────────────
# services/agent_registry.py — _default_agent_model (default_factory)
# ─────────────────────────────────────────────────────────────


class TestAgentRegistryDefaultModel:
    def test_rogue_env_falls_back_to_codex_cli(self, monkeypatch):
        """default_factory 경로: LookupError 가 AgentMetadata 생성(등록 초기화)
        을 죽이면 안 된다 — legacy "codex-cli" 폴백."""
        from services.agent_registry import _default_agent_model

        monkeypatch.setenv("LLM_PROVIDER", "rogue-provider")
        assert _default_agent_model() == "codex-cli"

    def test_configured_provider_still_resolves(self, monkeypatch):
        from services.agent_registry import _default_agent_model

        monkeypatch.setenv("LLM_PROVIDER", "anthropic")
        assert _default_agent_model() == "claude-sonnet-5"


# ─────────────────────────────────────────────────────────────
# services/llm_service.py — ValueError 계약 번역
# ─────────────────────────────────────────────────────────────


class TestLLMServiceLookupErrorTranslation:
    def test_get_llm_translates_lookup_error_to_value_error(self, monkeypatch):
        """빈 model_id 로 기본값을 해석하다 실패하면, 이 메서드의 기존 실패
        계약(ValueError — Unknown model/Model disabled)과 같은 타입이어야
        한다."""
        from services.llm_service import LLMService

        monkeypatch.setenv("LLM_PROVIDER", "rogue-provider")
        with pytest.raises(ValueError, match="rogue-provider"):
            LLMService._get_llm("")

    def test_get_default_model_translates_lookup_error(self, monkeypatch):
        from services.llm_service import LLMService

        monkeypatch.setenv("LLM_PROVIDER", "rogue-provider")
        with pytest.raises(ValueError, match="rogue-provider"):
            LLMService.get_default_model()

    def test_resolve_runtime_from_context_translates_lookup_error(self, monkeypatch):
        """no-access/no-source 분기의 기본 모델 해석도 같은 계약으로 실패한다."""
        from services.llm_service import _resolve_runtime_from_context

        monkeypatch.setenv("LLM_PROVIDER", "rogue-provider")
        with pytest.raises(ValueError, match="rogue-provider"):
            _resolve_runtime_from_context("", None)


# ─────────────────────────────────────────────────────────────
# agents/base.py — import 안전 + 인스턴스 생성 시점 fail-closed
# ─────────────────────────────────────────────────────────────


class TestAgentsBaseDefaultModel:
    def test_import_survives_rogue_provider(self):
        """safe_import 회귀: LLM_PROVIDER 가 rogue 여도 agents.base 임포트는
        성공해야 한다 — 임포트가 죽으면 api/app.py safe_import 가 agents
        라우터 트리를 조용히 제거한다(silent fail-open과 동급의 가용성 구멍)."""
        import agents.base as base

        backend_dir = Path(base.__file__).resolve().parents[1]
        result = subprocess.run(
            [sys.executable, "-c", "import agents.base"],
            cwd=backend_dir,
            env={**os.environ, "LLM_PROVIDER": "rogue-provider"},
            capture_output=True,
            text=True,
            timeout=120,
        )
        assert result.returncode == 0, (
            f"agents.base import failed under rogue LLM_PROVIDER:\n{result.stderr}"
        )

    def test_agent_config_default_rogue_provider_raises_value_error(self, monkeypatch):
        """model_name 미지정 AgentConfig 생성은 rogue provider 에서 codex-cli
        대입 없이 모듈 계약 타입(ValueError)으로 fail-closed 한다."""
        from agents.base import AgentConfig

        monkeypatch.setenv("LLM_PROVIDER", "rogue-provider")
        with pytest.raises(ValueError, match="rogue-provider"):
            AgentConfig(name="a", description="b", system_prompt="c")

    def test_agent_config_default_zero_enabled_provider_raises_value_error(self, monkeypatch):
        monkeypatch.setenv("LLM_PROVIDER", "google")
        _serve_from_cache([_cfg("g-disabled", is_enabled=False)])
        with pytest.raises(ValueError, match="google"):
            from agents.base import AgentConfig

            AgentConfig(name="a", description="b", system_prompt="c")

    def test_agent_config_default_resolves_configured_provider(self, monkeypatch):
        from agents.base import AgentConfig

        monkeypatch.setenv("LLM_PROVIDER", "anthropic")
        config = AgentConfig(name="a", description="b", system_prompt="c")
        assert config.model_name == "claude-sonnet-5"

    def test_agent_config_explicit_model_name_bypasses_resolution(self, monkeypatch):
        from agents.base import AgentConfig

        monkeypatch.setenv("LLM_PROVIDER", "rogue-provider")
        config = AgentConfig(
            name="a", description="b", system_prompt="c", model_name="claude-sonnet-5"
        )
        assert config.model_name == "claude-sonnet-5"

    def test_specialist_model_env_override_short_circuits_registry(self, monkeypatch):
        """SPECIALIST_AGENT_MODEL env 가 있으면 registry 를 건드리지 않는다 —
        rogue provider 여도 override 값이 그대로 반환된다."""
        import agents.base as base

        monkeypatch.setenv("LLM_PROVIDER", "rogue-provider")
        monkeypatch.setenv("SPECIALIST_AGENT_MODEL", "my-override-model")
        assert base.SPECIALIST_AGENT_MODEL == "my-override-model"

    def test_specialist_model_rogue_provider_raises_value_error(self, monkeypatch):
        import agents.base as base

        monkeypatch.setenv("LLM_PROVIDER", "rogue-provider")
        monkeypatch.delenv("SPECIALIST_AGENT_MODEL", raising=False)
        with pytest.raises(ValueError, match="rogue-provider"):
            _ = base.SPECIALIST_AGENT_MODEL


# ─────────────────────────────────────────────────────────────
# agents/lead_orchestrator.py — 생성자 경로 fail-closed 위임
# ─────────────────────────────────────────────────────────────


class TestLeadOrchestratorDefaultModel:
    def test_rogue_provider_fails_closed_with_value_error(self, monkeypatch):
        """lazy 오케스트레이터 생성이 uncaught LookupError 대신 모듈 계약
        타입(ValueError)으로 실패한다 — codex-cli 조용한 대입 금지."""
        from agents.lead_orchestrator import LeadOrchestratorAgent

        monkeypatch.setenv("LLM_PROVIDER", "rogue-provider")
        with pytest.raises(ValueError, match="rogue-provider"):
            LeadOrchestratorAgent()

    def test_zero_enabled_provider_fails_closed_with_value_error(self, monkeypatch):
        """DB drift 로 구성 provider 의 enabled 모델이 0개인 경우."""
        from agents.lead_orchestrator import LeadOrchestratorAgent

        monkeypatch.setenv("LLM_PROVIDER", "google")
        _serve_from_cache([_cfg("g-disabled", is_enabled=False)])
        with pytest.raises(ValueError, match="google"):
            LeadOrchestratorAgent()

    def test_valid_provider_resolves_registry_default(self, monkeypatch):
        from agents.base import BaseAgent
        from agents.lead_orchestrator import LeadOrchestratorAgent

        monkeypatch.setenv("LLM_PROVIDER", "anthropic")
        monkeypatch.setattr(BaseAgent, "_create_llm", staticmethod(lambda config: object()))
        orchestrator = LeadOrchestratorAgent()
        assert orchestrator.config.model_name == "claude-sonnet-5"


# ─────────────────────────────────────────────────────────────
# services/llm_runtime_resolver.py — enum 밖 entitlement provider 거부
# ─────────────────────────────────────────────────────────────


class TestResolverUnknownProviderEntitlements:
    def test_unknown_cli_provider_entitlement_is_rejected(self):
        """provider "somefake_cli" 는 mode 파생상 "cli" 라 CLI-first 선호까지 이길 수
        있던 경로 — LLMProvider enum 밖 provider 는 entitlement 필터에서
        거부되어야 한다 (조용한 기본 모델 대입 = 정책 우회)."""
        access = LLMAccessResponse(
            user_id="user-1",
            api_fallback_enabled=False,
            profiles=[],
            entitlements=[_entitlement(provider="somefake_cli", mode="cli")],
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

    def test_unknown_api_provider_entitlement_is_rejected(self):
        access = LLMAccessResponse(
            user_id="user-1",
            api_fallback_enabled=False,
            profiles=[],
            entitlements=[_entitlement(provider="evilprov", mode="api")],
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
