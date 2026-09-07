"""기본 provider seed 단가는 레지스트리(SSOT)에서 파생돼야 한다.

하드코딩 seed 는 가격 갱신 때 조용히 어긋난다 — `least_cost` 선택과 비용
리포트가 함께 틀어지는데, 어느 쪽도 에러를 내지 않는다.
"""

import pytest

from models.llm_models import LLMModelRegistry
from models.llm_router import LLMProvider
from services import llm_router_service
from services.llm_router_service import LLMRouterService


@pytest.fixture(autouse=True)
def _isolated_providers():
    llm_router_service._providers.clear()
    yield
    llm_router_service._providers.clear()


@pytest.mark.parametrize(
    ("env_var", "provider_enum", "registry_provider"),
    [
        ("ANTHROPIC_API_KEY", LLMProvider.ANTHROPIC, "anthropic"),
        ("GOOGLE_API_KEY", LLMProvider.GOOGLE, "google"),
        ("OPENAI_API_KEY", LLMProvider.OPENAI, "openai"),
    ],
)
def test_default_provider_costs_come_from_the_registry(
    monkeypatch, env_var, provider_enum, registry_provider
):
    for key in ("ANTHROPIC_API_KEY", "GOOGLE_API_KEY", "OPENAI_API_KEY", "OLLAMA_BASE_URL"):
        monkeypatch.delenv(key, raising=False)
    monkeypatch.setenv(env_var, "test-key")

    LLMRouterService.initialize_default_providers()

    seeded = [p for p in llm_router_service._providers.values() if p.provider == provider_enum]
    assert len(seeded) == 1, f"{registry_provider} provider 가 시드되지 않았다"

    model = LLMModelRegistry.get_by_id(seeded[0].model)
    assert model is not None, f"시드된 모델 {seeded[0].model!r} 이 레지스트리에 없다"
    assert seeded[0].cost_per_1k_input == model.input_price
    assert seeded[0].cost_per_1k_output == model.output_price
