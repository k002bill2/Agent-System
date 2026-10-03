"""2026-10-03 refresh: claude-sonnet-5-5, gpt-6-sol, gpt-6-luna 비기본 등록.

공식 문서(platform.claude.com sonnet-5-5 overview, developers.openai.com
gpt-6-sol/gpt-6-luna/pricing) 대조 값. 가격은 USD per 1K tokens.
"""

import pytest

from models.llm_models import LLMModelRegistry, LLMProvider

# (id, provider, context_window, input_price, output_price)
_NEW_MODELS = [
    ("claude-sonnet-5-5", LLMProvider.ANTHROPIC, 1_000_000, 0.002, 0.010),
    ("gpt-6-sol", LLMProvider.OPENAI, 1_050_000, 0.002, 0.010),
    ("gpt-6-luna", LLMProvider.OPENAI, 1_050_000, 0.0001, 0.0005),
]


@pytest.mark.parametrize(
    ("model_id", "provider", "context_window", "input_price", "output_price"),
    _NEW_MODELS,
)
def test_new_model_spec_matches_official_docs(
    model_id, provider, context_window, input_price, output_price
):
    model = LLMModelRegistry.get_by_id(model_id)
    assert model is not None
    assert model.provider == provider
    assert model.context_window == context_window
    assert model.input_price == pytest.approx(input_price)
    assert model.output_price == pytest.approx(output_price)
    assert model.is_default is False
    assert model.supports_tools is True
    assert model.supports_vision is True
    assert model.alias_for is None


def test_provider_defaults_unchanged():
    assert LLMModelRegistry.get_default("anthropic") == "claude-sonnet-5"
    assert LLMModelRegistry.get_default("openai") == "gpt-5.6"
    for provider in (LLMProvider.ANTHROPIC, LLMProvider.OPENAI):
        defaults = [m for m in LLMModelRegistry.get_by_provider(provider) if m.is_default]
        assert len(defaults) == 1, provider


@pytest.mark.parametrize(
    ("model_id", "expected_cost"),
    [
        ("claude-sonnet-5-5", 0.002 + 0.010),
        ("gpt-6-sol", 0.002 + 0.010),
        ("gpt-6-luna", 0.0001 + 0.0005),
    ],
)
def test_proxy_cost_table_prices_new_models(model_id, expected_cost):
    """미매칭이면 $0 정산 — gpt-6-sol/luna 는 gpt-6-astra 행과 prefix 가 다르다."""
    from api.llm_proxy import _calc_cost

    assert _calc_cost(model_id, 1000, 1000) == pytest.approx(expected_cost)


def test_gpt_6_1_sol_is_not_priced_as_gpt_6_sol():
    """gpt-6.1-sol 은 별도 모델 — gpt-6-sol 행에 자동 매핑되면 안 된다."""
    from api.llm_proxy import COST_TABLE

    assert not any("gpt-6.1-sol".startswith(p) for p, _, _ in COST_TABLE)


@pytest.mark.parametrize("model_id", [m[0] for m in _NEW_MODELS])
def test_new_models_are_gated_off_until_adapter_fix(model_id):
    """기본 경로 요청 형태(temperature=0.7 등)가 신모델에서
    400 을 낼 수 있어 비활성 등록 — 선택 목록·가용성에서 빠져야 한다."""
    model = LLMModelRegistry.get_by_id(model_id)
    assert model is not None
    assert model.is_enabled is False
    assert model_id not in {m.id for m in LLMModelRegistry.get_enabled()}
    assert LLMModelRegistry.is_available(model_id) is False
