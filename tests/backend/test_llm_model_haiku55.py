"""2026-10-09 refresh: claude-haiku-5-5 비기본·비활성 등록.

공식 문서(platform.claude.com haiku-5-5 overview / migration-guide, 2026-10-09 조회)
대조 값. 가격은 USD per 1K tokens, ≤100k 프롬프트 구간 단가.
단가 단언은 입력·출력 토큰 수를 다르게 줘서(1000/3000) 전치 오류를 잡는다.
"""

from unittest.mock import MagicMock

import pytest
from pydantic import BaseModel

from models.llm_models import LLMModelRegistry, LLMProvider, get_request_capabilities

_MODEL_ID = "claude-haiku-5-5"
_IN_PRICE = 0.0001  # $0.10/1M (≤100k)
_OUT_PRICE = 0.0005  # $0.50/1M (≤100k)
_IN_TOKENS = 1000
_OUT_TOKENS = 3000
_EXPECTED_COST = _IN_PRICE * (_IN_TOKENS / 1000) + _OUT_PRICE * (_OUT_TOKENS / 1000)


class _Schema(BaseModel):
    answer: str


def test_haiku_5_5_spec_matches_official_docs():
    model = LLMModelRegistry.get_by_id(_MODEL_ID)
    assert model is not None
    assert model.display_name == "Claude Haiku 5.5"
    assert model.provider == LLMProvider.ANTHROPIC
    assert model.context_window == 1_000_000
    assert model.input_price == pytest.approx(_IN_PRICE)
    assert model.output_price == pytest.approx(_OUT_PRICE)
    assert model.supports_tools is True
    assert model.supports_vision is True
    assert model.alias_for is None


def test_haiku_5_5_is_registered_non_default_and_disabled():
    model = LLMModelRegistry.get_by_id(_MODEL_ID)
    assert model is not None
    assert model.is_default is False
    assert model.is_enabled is False
    assert _MODEL_ID not in {m.id for m in LLMModelRegistry.get_enabled()}
    assert LLMModelRegistry.is_available(_MODEL_ID) is False


def test_anthropic_default_unchanged_and_unique():
    assert LLMModelRegistry.get_default("anthropic") == "claude-sonnet-5"
    defaults = [
        m for m in LLMModelRegistry.get_by_provider(LLMProvider.ANTHROPIC) if m.is_default
    ]
    assert [m.id for m in defaults] == ["claude-sonnet-5"]


def test_haiku_5_5_request_capabilities():
    """temperature 는 1 외 400 이라 미전달. forced tool_choice 는 허용 — Sonnet 5.5 와 다름."""
    caps = get_request_capabilities(_MODEL_ID)
    assert caps.supports_temperature is False
    assert caps.supports_forced_tool_choice is True


def test_structured_helper_keeps_default_forced_path_for_haiku_5_5():
    from services.llm_service import LLMService

    llm = MagicMock()
    LLMService.structured(llm, _Schema, _MODEL_ID)
    llm.with_structured_output.assert_called_once_with(_Schema)


def test_installed_langchain_anthropic_forces_tool_choice_for_haiku_5_5():
    """supports_forced_tool_choice=True 의 전제: 설치된 langchain-anthropic 이 이 ID 를
    강제 tool_choice 예외 목록에 두지 않는다 (예외 목록이 바뀌면 여기서 드러난다)."""
    from langchain_anthropic.chat_models import _supports_forced_tool_choice

    assert _supports_forced_tool_choice(_MODEL_ID) is True


# ─── 가격 미러: 정확값 + 미등록 폴백이 아님 (haiku-4 계열 단가로 잡히지 않음) ───


def test_llm_proxy_prices_haiku_5_5_exactly():
    from api.llm_proxy import _calc_cost

    assert _calc_cost(_MODEL_ID, _IN_TOKENS, _OUT_TOKENS) == pytest.approx(_EXPECTED_COST)


def test_anthropic_usage_collector_prices_haiku_5_5_exactly():
    from services.external_usage_service.collectors import AnthropicUsageCollector

    cost, source = AnthropicUsageCollector._calc_cost_detail(_MODEL_ID, _IN_TOKENS, _OUT_TOKENS)
    assert source == "table"
    assert cost == pytest.approx(_EXPECTED_COST)


def test_claude_session_prices_haiku_5_5_exactly():
    from models.claude_session import PRICE_SOURCE_TABLE, calculate_cost_detail

    cost, source = calculate_cost_detail(_MODEL_ID, _IN_TOKENS, _OUT_TOKENS)
    assert source == PRICE_SOURCE_TABLE
    assert cost == pytest.approx(_EXPECTED_COST)


def test_haiku_4_family_prices_unchanged():
    """haiku-5-5 행 추가가 기존 haiku-4 계열 매칭을 바꾸지 않는다."""
    from api.llm_proxy import _calc_cost
    from services.external_usage_service.collectors import AnthropicUsageCollector

    for calc in (_calc_cost, AnthropicUsageCollector._calc_cost):
        assert calc("claude-haiku-4-5-20251001", 1000, 3000) == pytest.approx(0.001 + 3 * 0.005)
        assert calc("claude-haiku-4-20250101", 1000, 3000) == pytest.approx(
            0.00025 + 3 * 0.00125
        )


def test_context_limit_is_1m():
    from models.context_usage import PROVIDER_CONTEXT_LIMITS
    from models.context_usage import LLMProvider as ContextProvider

    assert PROVIDER_CONTEXT_LIMITS[ContextProvider.ANTHROPIC][_MODEL_ID] == 1_000_000
