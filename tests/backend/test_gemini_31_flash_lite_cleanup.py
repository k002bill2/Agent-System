"""2026-10-03: gemini-3.1-flash-lite-preview 정리.

Google 은 preview ID 를 2026-05-25 에 shutdown 했고, 현재 요청은 서버가 stable
`gemini-3.1-flash-lite` 로 redirect 해 응답 modelVersion 이 stable ID 로 온다.
비용표는 응답 modelVersion 을 prefix 매칭하므로 preview 행만 두면 비용이 unknown 이 된다.
"""

import pytest

from models.llm_models import LLMModelRegistry, LLMProvider

# 비대칭 토큰 — 같은 수면 (in, out) 전치 오류가 통과한다.
_IN_TOKENS = 3000
_OUT_TOKENS = 700
_EXPECTED = (_IN_TOKENS / 1000) * 0.00025 + (_OUT_TOKENS / 1000) * 0.0015


@pytest.mark.parametrize(
    "model_id",
    ["gemini-3.1-flash-lite", "gemini-3.1-flash-lite-preview"],
)
def test_proxy_prices_both_requested_preview_and_redirected_stable(model_id):
    from api.llm_proxy import _calc_cost, _ledger_cost_or_none

    assert _calc_cost(model_id, _IN_TOKENS, _OUT_TOKENS) == pytest.approx(_EXPECTED)
    ledger = _ledger_cost_or_none(model_id, _IN_TOKENS, _OUT_TOKENS)
    assert ledger is not None
    assert ledger == pytest.approx(_EXPECTED)


def test_flash_lite_row_does_not_swallow_pro_preview():
    from api.llm_proxy import _calc_cost

    assert _calc_cost("gemini-3.1-pro-preview", 1000, 0) == pytest.approx(0.002)


def test_shut_down_preview_seed_is_disabled_but_kept():
    model = LLMModelRegistry.get_by_id("gemini-3.1-flash-lite-preview")
    assert model is not None
    assert model.is_enabled is False
    assert model.is_default is False


def test_new_lite_models_are_not_registered():
    assert LLMModelRegistry.get_by_id("gemini-3.1-flash-lite") is None
    assert LLMModelRegistry.get_by_id("gemini-3.5-flash-lite") is None


def test_google_default_unchanged():
    assert LLMModelRegistry.get_default("google") == "gemini-3.8-flash"
    defaults = [m for m in LLMModelRegistry.get_by_provider(LLMProvider.GOOGLE) if m.is_default]
    assert [m.id for m in defaults] == ["gemini-3.8-flash"]
