"""모델별 요청 파라미터 호환 계층 (BRIEF B, 2026-10-03).

- gpt-6-sol/luna/astra: temperature 미지원 → 생성자에 temperature 를 넘기지 않는다
  (Jarvis smoke 400 "Unsupported parameter: 'temperature'").
- claude-sonnet-5-5: 비기본 temperature·forced tool_choice(any/tool) 거부 →
  temperature 미전달 + structured output 은 강제 tool_choice 없는 경로.
- 능력은 코드 seed 기준으로 해석한다 — DB-loaded config 는 능력 컬럼이 없어
  기본값(True)으로 떨어지므로 그 값을 믿으면 안 된다.

실호출 없음: provider 클래스는 MagicMock 으로 패치해 생성 kwargs 만 단언한다.
"""

from __future__ import annotations

import logging
from unittest.mock import MagicMock

import pytest
from pydantic import BaseModel

from models.llm_models import (
    _MODEL_INDEX,
    _MODELS,
    LLMModelConfig,
    LLMModelRegistry,
    LLMProvider,
    get_request_capabilities,
)
from services.llm_service import LLMService

_NO_TEMPERATURE = [
    "gpt-6-sol",
    "gpt-6-luna",
    "gpt-6-astra",
    "claude-sonnet-5-5",
    "claude-haiku-5-5",
]
_KEEPS_TEMPERATURE_OPENAI = ["gpt-5.6", "gpt-5.6-sol"]
_KEEPS_TEMPERATURE_ANTHROPIC = ["claude-sonnet-5", "claude-opus-5"]


@pytest.fixture
def _clean_llm_instances():
    original = dict(LLMService._instances)
    LLMService._instances.clear()
    yield
    LLMService._instances.clear()
    LLMService._instances.update(original)


@pytest.fixture
def _registry_cache():
    original_cache = LLMModelRegistry._db_cache
    original_index = LLMModelRegistry._db_index
    yield
    LLMModelRegistry._db_cache = original_cache
    LLMModelRegistry._db_index = original_index


@pytest.fixture
def _provider_keys(monkeypatch):
    monkeypatch.setenv("OPENAI_API_KEY", "test-openai")
    monkeypatch.setenv("ANTHROPIC_API_KEY", "test-anthropic")
    monkeypatch.setenv("GOOGLE_API_KEY", "test-google")


def _db_style_config(model_id: str) -> LLMModelConfig:
    """load_from_db 와 같은 모양: DB 컬럼에 있는 필드만, 능력 필드는 기본값."""
    seed = _MODEL_INDEX[model_id]
    return LLMModelConfig(
        id=seed.id,
        display_name=seed.display_name,
        provider=seed.provider,
        context_window=seed.context_window,
        input_price=seed.input_price,
        output_price=seed.output_price,
        is_default=seed.is_default,
        is_enabled=True,  # 관리자 활성화 이후 상황을 재현 (seed 값은 바꾸지 않음)
        supports_tools=seed.supports_tools,
        supports_vision=seed.supports_vision,
    )


def _install_db_models(model_ids: list[str]) -> None:
    models = [_db_style_config(mid) for mid in model_ids]
    LLMModelRegistry._db_cache = models
    LLMModelRegistry._db_index = {m.id: m for m in models}


# ─── 능력 해석 SSOT ───────────────────────────────────────────


@pytest.mark.parametrize("model_id", _NO_TEMPERATURE)
def test_capabilities_drop_temperature_for_documented_models(model_id):
    assert get_request_capabilities(model_id).supports_temperature is False


@pytest.mark.parametrize("model_id", _KEEPS_TEMPERATURE_OPENAI + _KEEPS_TEMPERATURE_ANTHROPIC)
def test_capabilities_keep_temperature_for_existing_models(model_id):
    assert get_request_capabilities(model_id).supports_temperature is True


def test_capabilities_keep_temperature_for_provider_defaults():
    for provider in ("anthropic", "openai", "google", "ollama"):
        default_id = LLMModelRegistry.get_default(provider)
        assert get_request_capabilities(default_id).supports_temperature is True, default_id


def test_sonnet_5_5_rejects_forced_tool_choice_but_sonnet_5_does_not():
    assert get_request_capabilities("claude-sonnet-5-5").supports_forced_tool_choice is False
    assert get_request_capabilities("claude-sonnet-5").supports_forced_tool_choice is True


@pytest.mark.parametrize(
    ("snapshot_id", "base_id"),
    [
        ("gpt-6-sol-2026-09-22", "gpt-6-sol"),
        ("claude-sonnet-5-5-20260928", "claude-sonnet-5-5"),
    ],
)
def test_dated_snapshot_inherits_seed_capabilities(snapshot_id, base_id):
    """DB-only 날짜 스냅샷 id 는 같은 모델의 고정판 — seed 기본 id 의 제한을 상속."""
    assert get_request_capabilities(snapshot_id) == get_request_capabilities(base_id)


@pytest.mark.parametrize(
    "model_id",
    [
        "claude-sonnet-5-5-preview",  # 날짜 아님 → 근거 없는 확장 금지
        "gpt-6-sol-mini",
        "gpt-6.1-sol",
        "claude-sonnet-5-20260101",  # claude-sonnet-5 스냅샷 → claude-sonnet-5 능력
    ],
)
def test_non_snapshot_or_unrestricted_ids_keep_defaults(model_id):
    caps = get_request_capabilities(model_id)
    assert caps.supports_temperature is True
    assert caps.supports_forced_tool_choice is True


def test_db_only_snapshot_of_restricted_model_end_to_end(
    _clean_llm_instances, _registry_cache, _provider_keys, monkeypatch
):
    import langchain_anthropic

    ctor = MagicMock(name="ChatAnthropic")
    monkeypatch.setattr(langchain_anthropic, "ChatAnthropic", ctor)
    snapshot = _db_style_config("claude-sonnet-5-5").model_copy(
        update={"id": "claude-sonnet-5-5-20260928"}
    )
    LLMModelRegistry._db_cache = [snapshot]
    LLMModelRegistry._db_index = {snapshot.id: snapshot}

    LLMService._get_llm("claude-sonnet-5-5-20260928", temperature=0.7, max_tokens=512)
    assert "temperature" not in ctor.call_args.kwargs

    llm = MagicMock()
    LLMService.structured(llm, _Schema, "claude-sonnet-5-5-20260928")
    llm.with_structured_output.assert_called_once_with(_Schema, method="json_schema")


def test_unknown_model_gets_permissive_defaults():
    caps = get_request_capabilities("db-only-unknown-model")
    assert caps.supports_temperature is True
    assert caps.supports_forced_tool_choice is True


def test_db_loaded_config_does_not_override_seed_capabilities(_registry_cache):
    """DB 경로는 능력 필드를 기본값(True)으로 채운다 — 해석은 seed 를 따라야 한다."""
    _install_db_models(["claude-sonnet-5-5", "gpt-6-sol"])
    db_sonnet = LLMModelRegistry.get_by_id("claude-sonnet-5-5")
    assert db_sonnet is not None and db_sonnet.supports_temperature is True  # 함정 재현

    assert get_request_capabilities("claude-sonnet-5-5").supports_temperature is False
    assert get_request_capabilities("claude-sonnet-5-5").supports_forced_tool_choice is False
    assert get_request_capabilities("gpt-6-sol").supports_temperature is False


# ─── _get_llm 생성 kwargs ─────────────────────────────────────


@pytest.mark.parametrize("model_id", ["gpt-6-sol", "gpt-6-luna", "gpt-6-astra"])
def test_get_llm_omits_temperature_for_gpt6(
    model_id, _clean_llm_instances, _registry_cache, _provider_keys, monkeypatch
):
    import langchain_openai

    ctor = MagicMock(name="ChatOpenAI")
    monkeypatch.setattr(langchain_openai, "ChatOpenAI", ctor)
    _install_db_models([model_id])

    LLMService._get_llm(model_id, temperature=0.7, max_tokens=512)

    kwargs = ctor.call_args.kwargs
    assert "temperature" not in kwargs
    assert kwargs["model"] == model_id
    assert kwargs["max_tokens"] == 512


@pytest.mark.parametrize("model_id", _KEEPS_TEMPERATURE_OPENAI)
def test_get_llm_keeps_temperature_for_existing_openai(
    model_id, _clean_llm_instances, _registry_cache, _provider_keys, monkeypatch
):
    import langchain_openai

    ctor = MagicMock(name="ChatOpenAI")
    monkeypatch.setattr(langchain_openai, "ChatOpenAI", ctor)
    _install_db_models([model_id])

    LLMService._get_llm(model_id, temperature=0.7, max_tokens=512)

    assert ctor.call_args.kwargs["temperature"] == 0.7


# provider → (모듈, 생성자 클래스, max tokens kwarg 이름). CLI provider 는 sampling 을 받지 않아 제외.
_LANGCHAIN_CTORS = {
    LLMProvider.ANTHROPIC: ("langchain_anthropic", "ChatAnthropic", "max_tokens"),
    LLMProvider.OPENAI: ("langchain_openai", "ChatOpenAI", "max_tokens"),
    LLMProvider.GOOGLE: ("langchain_google_genai", "ChatGoogleGenerativeAI", "max_output_tokens"),
    LLMProvider.OLLAMA: ("langchain_ollama", "ChatOllama", "num_predict"),
}
_LANGCHAIN_SEED_IDS = [m.id for m in _MODELS if m.provider in _LANGCHAIN_CTORS]


def test_langchain_seed_sweep_covers_every_provider_and_pins_no_temperature_set():
    """전수 파라미터화가 비지 않았고, temperature 미지원 집합이 문서화된 목록과 같다."""
    providers = {_MODEL_INDEX[mid].provider for mid in _LANGCHAIN_SEED_IDS}
    assert providers == set(_LANGCHAIN_CTORS)
    no_temperature = {
        mid for mid in _LANGCHAIN_SEED_IDS if not _MODEL_INDEX[mid].supports_temperature
    }
    assert no_temperature == set(_NO_TEMPERATURE)


@pytest.mark.parametrize("model_id", _LANGCHAIN_SEED_IDS)
def test_get_llm_sampling_follows_seed_capability_for_every_langchain_model(
    model_id, _clean_llm_instances, _registry_cache, _provider_keys, monkeypatch
):
    """seed 의 LangChain provider 모델 전수: supports_temperature=True 면 전달, False 면 미전달."""
    import importlib

    seed = _MODEL_INDEX[model_id]
    module_name, class_name, max_tokens_kwarg = _LANGCHAIN_CTORS[seed.provider]
    ctor = MagicMock(name=class_name)
    monkeypatch.setattr(importlib.import_module(module_name), class_name, ctor)
    _install_db_models([model_id])

    LLMService._get_llm(model_id, temperature=0.7, max_tokens=512)

    kwargs = ctor.call_args.kwargs
    assert kwargs["model"] == model_id
    assert kwargs[max_tokens_kwarg] == 512
    if seed.supports_temperature:
        assert kwargs["temperature"] == 0.7
    else:
        assert "temperature" not in kwargs


def test_get_llm_passes_temperature_to_google_and_ollama(
    _clean_llm_instances, _registry_cache, _provider_keys, monkeypatch
):
    import langchain_google_genai
    import langchain_ollama

    google = MagicMock(name="ChatGoogleGenerativeAI")
    ollama = MagicMock(name="ChatOllama")
    monkeypatch.setattr(langchain_google_genai, "ChatGoogleGenerativeAI", google)
    monkeypatch.setattr(langchain_ollama, "ChatOllama", ollama)
    google_id = LLMModelRegistry.get_default("google")
    ollama_id = LLMModelRegistry.get_default("ollama")
    _install_db_models([google_id, ollama_id])

    LLMService._get_llm(google_id, temperature=0.3, max_tokens=256)
    LLMService._get_llm(ollama_id, temperature=0.4, max_tokens=128)

    google.assert_called_once()
    assert google.call_args.kwargs["temperature"] == 0.3
    assert google.call_args.kwargs["max_output_tokens"] == 256
    assert google.call_args.kwargs["google_api_key"] == "test-google"
    ollama.assert_called_once()
    assert ollama.call_args.kwargs["temperature"] == 0.4
    assert ollama.call_args.kwargs["num_predict"] == 128


def test_get_llm_omits_temperature_for_sonnet_5_5(
    _clean_llm_instances, _registry_cache, _provider_keys, monkeypatch
):
    import langchain_anthropic

    ctor = MagicMock(name="ChatAnthropic")
    monkeypatch.setattr(langchain_anthropic, "ChatAnthropic", ctor)
    _install_db_models(["claude-sonnet-5-5", "claude-sonnet-5"])

    LLMService._get_llm("claude-sonnet-5-5", temperature=0.7, max_tokens=512)
    assert "temperature" not in ctor.call_args.kwargs
    assert ctor.call_args.kwargs["max_tokens"] == 512

    LLMService._get_llm("claude-sonnet-5", temperature=0.7, max_tokens=512)
    assert ctor.call_args.kwargs["temperature"] == 0.7


def test_cache_key_ignores_temperature_when_not_sent(
    _clean_llm_instances, _registry_cache, _provider_keys, monkeypatch
):
    """temperature 를 보내지 않는 모델은 temperature 만 다른 요청이 같은 인스턴스여야 한다."""
    import langchain_openai

    ctor = MagicMock(name="ChatOpenAI", side_effect=lambda **kw: MagicMock(kwargs=kw))
    monkeypatch.setattr(langchain_openai, "ChatOpenAI", ctor)
    _install_db_models(["gpt-6-sol", "gpt-5.6"])

    a = LLMService._get_llm("gpt-6-sol", temperature=0.7, max_tokens=512)
    b = LLMService._get_llm("gpt-6-sol", temperature=0.2, max_tokens=512)
    assert a is b
    assert ctor.call_count == 1

    # 기존 모델은 temperature 가 실제로 전달되므로 별도 인스턴스 (회귀)
    c = LLMService._get_llm("gpt-5.6", temperature=0.7, max_tokens=512)
    d = LLMService._get_llm("gpt-5.6", temperature=0.2, max_tokens=512)
    assert c is not d
    # max_tokens 가 다르면 별도 인스턴스
    e = LLMService._get_llm("gpt-6-sol", temperature=0.7, max_tokens=1024)
    assert e is not a


# ─── structured output 헬퍼 ──────────────────────────────────


class _Schema(BaseModel):
    answer: str


def test_structured_helper_keeps_default_path_for_capable_model():
    llm = MagicMock()
    LLMService.structured(llm, _Schema, "claude-sonnet-5")
    llm.with_structured_output.assert_called_once_with(_Schema)


def test_structured_helper_keeps_default_path_for_unknown_model_id():
    llm = MagicMock()
    LLMService.structured(llm, _Schema, None)
    llm.with_structured_output.assert_called_once_with(_Schema)


def test_structured_helper_avoids_forced_tool_choice_for_sonnet_5_5():
    llm = MagicMock()
    LLMService.structured(llm, _Schema, "claude-sonnet-5-5")
    llm.with_structured_output.assert_called_once_with(_Schema, method="json_schema")


def test_structured_sonnet_5_5_real_binding_has_no_forced_tool_choice():
    """설치된 langchain_anthropic 로 실제 Runnable 을 만들고 바인딩 kwargs 를 단언 (네트워크 없음)."""
    from langchain_anthropic import ChatAnthropic

    llm = ChatAnthropic(model="claude-sonnet-5-5", api_key="test", max_tokens=512)
    runnable = LLMService.structured(llm, _Schema, "claude-sonnet-5-5")
    bound = runnable.first  # RunnableSequence: RunnableBinding(llm) | parser
    assert "tool_choice" not in bound.kwargs
    assert "tools" not in bound.kwargs

    legacy = ChatAnthropic(model="claude-sonnet-5", api_key="test", max_tokens=512)
    legacy_bound = LLMService.structured(legacy, _Schema, "claude-sonnet-5").first
    assert legacy_bound.kwargs["tool_choice"]["type"] == "tool"


def _object_levels_missing_closed_schema(node, path="schema"):
    missing = []
    if isinstance(node, dict):
        if node.get("type") == "object" and node.get("additionalProperties") is not False:
            missing.append(path)
        for key, value in node.items():
            missing += _object_levels_missing_closed_schema(value, f"{path}.{key}")
    elif isinstance(node, list):
        for i, value in enumerate(node):
            missing += _object_levels_missing_closed_schema(value, f"{path}[{i}]")
    return missing


def test_structured_sonnet_5_5_planner_schema_is_closed_json_schema():
    """Sonnet 5.5 structured outputs 는 object 마다 additionalProperties:false 필요
    (Newton newton-1 §체크리스트) — 중첩 SubtaskPlan 까지 SDK 변환 결과를 단언."""
    from langchain_anthropic import ChatAnthropic

    from models.task_plan import TaskPlanResult

    llm = ChatAnthropic(model="claude-sonnet-5-5", api_key="test", max_tokens=512)
    bound = LLMService.structured(llm, TaskPlanResult, "claude-sonnet-5-5").first
    fmt = bound.kwargs["output_config"]["format"]
    assert fmt["type"] == "json_schema"
    assert "SubtaskPlan" in fmt["schema"]["$defs"]
    assert _object_levels_missing_closed_schema(fmt["schema"]) == []


@pytest.mark.asyncio
async def test_self_correction_routes_structured_output_through_helper():
    from unittest.mock import AsyncMock

    from models.agent_state import TaskNode, TaskStatus, create_initial_state
    from models.errors import ErrorCategory, ErrorSeverity, StructuredError
    from orchestrator.nodes import SelfCorrectionNode

    llm = MagicMock()
    llm.model_name = "claude-sonnet-5-5"
    correction = MagicMock(
        error_analysis="a",
        root_cause="b",
        correction_strategy="c",
        updated_description="d",
        should_retry=True,
        confidence="medium",
        response_metadata={},
    )
    llm.with_structured_output.return_value.ainvoke = AsyncMock(return_value=correction)
    error = StructuredError(
        category=ErrorCategory.LOGIC,
        severity=ErrorSeverity.MEDIUM,
        message="Assertion failed",
        original_type="AssertionError",
        retry_hint="",
    )
    task = TaskNode(
        id="t1",
        title="T",
        description="D",
        status=TaskStatus.FAILED,
        error="boom",
        retry_count=0,
        max_retries=3,
        error_history=[],
        structured_errors=[error],
    )
    state = create_initial_state(session_id="s1")
    state["tasks"] = {task.id: task}
    state["current_task_id"] = task.id

    await SelfCorrectionNode(llm=llm).run(state)

    llm.with_structured_output.assert_called_once()
    assert llm.with_structured_output.call_args.kwargs == {"method": "json_schema"}


# ─── planner 조용한 축소 관측 ─────────────────────────────────


@pytest.mark.asyncio
async def test_planner_fallback_logs_warning_with_model_and_exception(caplog):
    from models.agent_state import create_initial_state
    from orchestrator.nodes.planner import PlannerNode

    llm = MagicMock()
    llm.model_name = "claude-sonnet-5-5"
    llm.with_structured_output.return_value.ainvoke = MagicMock(
        side_effect=RuntimeError("HTTP 400 tool_choice")
    )
    node = PlannerNode(llm=llm)
    state = create_initial_state(session_id="s1")
    state["messages"] = [{"role": "user", "content": "do it"}]

    with caplog.at_level(logging.WARNING, logger="orchestrator.nodes.planner"):
        result = await node.run(state)

    records = [r for r in caplog.records if r.name == "orchestrator.nodes.planner"]
    assert records, "planner fallback must emit a warning"
    msg = records[-1].getMessage()
    assert "RuntimeError" in msg
    assert "claude-sonnet-5-5" in msg
    # 동작 유지: 단일 태스크 플랜으로 축소
    subtasks = [t for t in result["tasks"].values() if t.title == "Execute task"]
    assert len(subtasks) == 1


@pytest.mark.asyncio
async def test_planner_routes_structured_output_through_helper(monkeypatch, caplog):
    """planner 는 with_structured_output 을 직접 부르지 않고 LLMService.structured 를 거친다."""
    from unittest.mock import AsyncMock

    from models.agent_state import create_initial_state
    from models.task_plan import SubtaskPlan, TaskPlanResult
    from orchestrator.nodes.planner import PlannerNode

    spy = MagicMock(wraps=LLMService.structured)
    monkeypatch.setattr(LLMService, "structured", spy)
    llm = MagicMock()
    llm.model_name = "claude-sonnet-5-5"
    plan = TaskPlanResult(
        analysis="ok", is_complex=False, subtasks=[SubtaskPlan(title="Only", description="d")]
    )
    llm.with_structured_output.return_value.ainvoke = AsyncMock(return_value=plan)
    state = create_initial_state(session_id="s1")
    state["messages"] = [{"role": "user", "content": "do it"}]

    with caplog.at_level(logging.WARNING, logger="orchestrator.nodes.planner"):
        result = await PlannerNode(llm=llm).run(state)

    spy.assert_called_once_with(llm, TaskPlanResult, "claude-sonnet-5-5")
    # helper 의 효과까지: Sonnet 5.5 는 forced tool_choice 없는 json_schema 경로
    llm.with_structured_output.assert_called_once_with(TaskPlanResult, method="json_schema")
    assert not [r for r in caplog.records if r.name == "orchestrator.nodes.planner"]
    assert [t.title for t in result["tasks"].values() if t.title == "Only"] == ["Only"]


@pytest.mark.asyncio
async def test_planner_fallback_warning_redacts_exception_text_and_prompt(caplog):
    """경고는 예외 타입명·모델명만 — 예외 본문(프롬프트·응답 조각이 섞일 수 있음)과
    사용자 프롬프트는 로그 레코드(포맷된 메시지·args·traceback)에 남지 않는다."""
    from models.agent_state import create_initial_state
    from orchestrator.nodes.planner import PlannerNode

    exc_canary = "EXC-CANARY-7f3a"
    prompt_canary = "PROMPT-CANARY-91c2"
    llm = MagicMock()
    llm.model_name = "claude-sonnet-5-5"
    llm.with_structured_output.return_value.ainvoke = MagicMock(
        side_effect=RuntimeError(f"HTTP 400 {exc_canary} echo={prompt_canary}")
    )
    state = create_initial_state(session_id="s1")
    state["messages"] = [{"role": "user", "content": f"secret task {prompt_canary}"}]

    with caplog.at_level(logging.DEBUG, logger="orchestrator.nodes.planner"):
        await PlannerNode(llm=llm).run(state)

    records = [r for r in caplog.records if r.name == "orchestrator.nodes.planner"]
    warnings = [r for r in records if r.levelno == logging.WARNING]
    assert warnings, "planner fallback must emit a warning"
    assert "RuntimeError" in warnings[-1].getMessage()
    for record in records:
        rendered = caplog.handler.format(record) + repr(record.args)
        assert exc_canary not in rendered, rendered
        assert prompt_canary not in rendered, rendered
        assert record.exc_info is None


# ─── 불변식 ───────────────────────────────────────────────────


def test_defaults_and_enabled_set_unchanged():
    assert LLMModelRegistry.get_default("anthropic") == "claude-sonnet-5"
    assert LLMModelRegistry.get_default("openai") == "gpt-5.6"
    for mid in ("claude-sonnet-5-5", "gpt-6-sol", "gpt-6-luna"):
        assert _MODEL_INDEX[mid].is_enabled is False
    assert _MODEL_INDEX["gpt-6-astra"].is_enabled is True
    assert LLMProvider.OPENAI in {m.provider for m in LLMModelRegistry.get_enabled()}


# (REGISTRY_REVISION, seed 정책 스냅샷 sha256) 이력 — 마지막 항목이 현재 상태.
# seed 를 바꿨으면 REGISTRY_REVISION 을 올리고 새 쌍을 **추가**한다 (기존 항목 수정 금지).
_REGISTRY_REVISION_HISTORY = [
    ("2026-10-03.3", "5006bcee91b45941ca1be652ed5ea73929af9f1399d54e932d8841dd9e2f131b"),
    ("2026-10-09.1", "1d06785cfb29e4d4754c720691bbe56e6d4c180ff4d0daff43dd1ed08c60b7b3"),
]


def _seed_policy_snapshot_sha256() -> str:
    import hashlib
    import json

    rows = sorted(
        (
            m.id,
            m.provider.value,
            m.is_default,
            m.is_enabled,
            m.supports_temperature,
            m.supports_forced_tool_choice,
        )
        for m in _MODELS
    )
    return hashlib.sha256(json.dumps(rows).encode()).hexdigest()


def test_registry_revision_tracks_seed_policy_snapshot():
    """정책 관련 seed(모델 집합·default·enabled·요청 능력)가 바뀌면 REGISTRY_REVISION 도
    바뀌어야 한다 — 감사 메타데이터가 다른 요청 형태를 같은 revision 으로 기록하지 않게."""
    from models.llm_models import REGISTRY_REVISION

    revisions = [rev for rev, _ in _REGISTRY_REVISION_HISTORY]
    assert len(revisions) == len(set(revisions)), "revision 이력에 중복 — 새 revision 으로 bump"
    pinned_revision, pinned_sha = _REGISTRY_REVISION_HISTORY[-1]
    current_sha = _seed_policy_snapshot_sha256()
    if current_sha != pinned_sha:
        assert REGISTRY_REVISION != pinned_revision, (
            f"seed 정책 스냅샷이 바뀌었는데 REGISTRY_REVISION 이 {pinned_revision!r} 그대로다. "
            "models/llm_models.py 의 REGISTRY_REVISION 을 올리고 "
            f"_REGISTRY_REVISION_HISTORY 에 (새 revision, {current_sha!r}) 를 추가하라."
        )
        pytest.fail(
            f"REGISTRY_REVISION={REGISTRY_REVISION!r} 로 bump 됨 — "
            f"_REGISTRY_REVISION_HISTORY 에 ({REGISTRY_REVISION!r}, {current_sha!r}) 를 추가하라."
        )
    assert REGISTRY_REVISION == pinned_revision, (
        f"REGISTRY_REVISION 이 {REGISTRY_REVISION!r} 로 바뀌었다 — "
        f"_REGISTRY_REVISION_HISTORY 에 ({REGISTRY_REVISION!r}, {current_sha!r}) 를 추가하라."
    )
