"""Unit tests for Playground service after the RAG/Tools overhaul.

Covers:
- _to_lc_messages() handles legacy tool-role entries without tool_call_id
- _coerce_llm_content() flattens Gemini multi-part responses
- PlaygroundSession parses legacy JSON dicts (missing rag_k / overrides)
- PlaygroundExecuteRequest carries per-request RAG overrides
- invoke_with_tools force-final round triggers when budget is exhausted
- LLMService._build_messages injects RAG context as a separate SystemMessage
- DEFAULT_SYSTEM_PROMPT contains the updated Gemini-specific guidance
- web_search dispatches to Tavily when TAVILY_API_KEY is set, DDG otherwise
"""

from __future__ import annotations

from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from langchain_core.messages import AIMessage, HumanMessage, SystemMessage

from models.llm_usage import LLMUsageSource
from models.playground import (
    PlaygroundExecuteRequest,
    PlaygroundMessage,
    PlaygroundSession,
    PlaygroundSessionCreate,
)
from services import playground_service
from services.llm_service import LLMResponse, LLMService, _build_messages
from services.playground_service import (
    DEFAULT_SYSTEM_PROMPT,
    PlaygroundService,
    _coerce_llm_content,
    _to_lc_messages,
)

# ─────────────────────────────────────────────────────────────
# Helpers / conversions
# ─────────────────────────────────────────────────────────────


def test_to_lc_messages_absorbs_legacy_tool_role() -> None:
    """Legacy tool entries (no tool_call_id) must not break conversion."""
    msgs = [
        PlaygroundMessage(role="user", content="hi"),
        PlaygroundMessage(role="assistant", content="hello"),
        PlaygroundMessage(role="tool", content="Called web_search"),
        PlaygroundMessage(role="system", content="SHOULD BE DROPPED"),
    ]
    out = _to_lc_messages(msgs)
    assert [type(m).__name__ for m in out] == [
        "HumanMessage",
        "AIMessage",
        "SystemMessage",
    ]
    assert "[previous tool call]" in out[2].content


def test_coerce_llm_content_flattens_multipart() -> None:
    """Gemini tool_use blocks must not leak into persisted text."""
    parts = [
        {"type": "text", "text": "real answer"},
        {"type": "tool_use", "name": "x", "input": {}},
    ]
    assert _coerce_llm_content(parts) == "real answer"


def test_coerce_llm_content_passthrough_string() -> None:
    assert _coerce_llm_content("plain") == "plain"


# ─────────────────────────────────────────────────────────────
# Model defaults / legacy compat
# ─────────────────────────────────────────────────────────────


def test_legacy_session_json_fills_rag_defaults() -> None:
    """Sessions persisted before the schema change should still parse."""
    legacy = {
        "id": "abc",
        "name": "legacy",
        "messages": [],
        "executions": [],
        # explicitly no rag_k / rag_hybrid_override / rag_rerank_override
    }
    sess = PlaygroundSession(**legacy)
    assert sess.rag_k == 5
    assert sess.rag_hybrid_override is None
    assert sess.rag_rerank_override is None


def test_request_carries_per_call_rag_overrides() -> None:
    req = PlaygroundExecuteRequest(
        prompt="hi",
        rag_k=12,
        rag_hybrid_override=True,
        rag_rerank_override=False,
    )
    assert req.rag_k == 12
    assert req.rag_hybrid_override is True
    assert req.rag_rerank_override is False


def test_default_system_prompt_is_gemini_specific() -> None:
    assert "단일 출처" in DEFAULT_SYSTEM_PROMPT
    assert "제공된 컨텍스트에 없습니다" in DEFAULT_SYSTEM_PROMPT


def _register_stale_session(
    model: str,
    *,
    name: str = "stale",
    user_id: str | None = None,
) -> PlaygroundSession:
    """과거에 저장된(legacy/stale) 세션 시뮬레이션.

    create_session 은 이제 unknown/disabled 모델을 거부한다(등록 게이트).
    stale 세션은 '저장 당시엔 유효했지만 이후 disabled 된' 데이터이므로,
    로딩 경로와 동일하게 모델 검증 없이 직접 구성해 레지스트리에 주입한다.
    """
    session = PlaygroundSession(name=name, model=model, user_id=user_id)
    playground_service._sessions[session.id] = session
    return session


def _isolate_sessions(monkeypatch) -> list[bool]:
    """세션 저장소 격리 + _save_sessions 호출 기록을 돌려준다."""
    playground_service._sessions.clear()
    saves: list[bool] = []
    monkeypatch.setattr(playground_service.service, "_load_sessions", lambda: None)
    monkeypatch.setattr(
        playground_service.service, "_save_sessions", lambda: saves.append(True)
    )
    monkeypatch.setattr(
        playground_service.service, "_fire_and_forget", lambda coro: coro.close()
    )
    return saves


# ─────────────────────────────────────────────────────────────
# Session model registration gate (create / settings update)
# ─────────────────────────────────────────────────────────────


def test_create_session_rejects_unknown_model(monkeypatch) -> None:
    """Registry 에 없는 모델은 세션 생성(영속화) 전에 거부된다."""
    saves = _isolate_sessions(monkeypatch)
    with pytest.raises(ValueError, match="Unknown model"):
        PlaygroundService.create_session(
            PlaygroundSessionCreate(name="bad", model="no-such-model")
        )
    assert playground_service._sessions == {}
    assert saves == []


def test_create_session_rejects_disabled_model(monkeypatch) -> None:
    """gpt-5.4 는 registry 에 있으나 disabled — 저장 전에 거부되어야 한다."""
    saves = _isolate_sessions(monkeypatch)
    with pytest.raises(ValueError, match="Model disabled"):
        PlaygroundService.create_session(
            PlaygroundSessionCreate(name="bad", model="gpt-5.4")
        )
    assert playground_service._sessions == {}
    assert saves == []


def test_create_session_accepts_enabled_registry_model(monkeypatch) -> None:
    _isolate_sessions(monkeypatch)
    session = PlaygroundService.create_session(
        PlaygroundSessionCreate(name="ok", model="codex-cli")
    )
    assert session.model == "codex-cli"
    assert session.id in playground_service._sessions


def test_update_settings_rejects_invalid_model_atomically(monkeypatch) -> None:
    """model 검증 실패 시 같은 요청의 다른 필드(name 등)도 반영되지 않아야
    한다 — 거부는 원자적이다 (부분 반영 금지)."""
    saves = _isolate_sessions(monkeypatch)
    session = PlaygroundService.create_session(
        PlaygroundSessionCreate(name="before", model="codex-cli")
    )
    saves.clear()
    before_updated_at = session.updated_at

    with pytest.raises(ValueError, match="Unknown model"):
        PlaygroundService.update_session_settings(
            session.id, model="no-such-model", name="after", temperature=0.1
        )

    assert session.name == "before"
    assert session.model == "codex-cli"
    assert session.temperature == 0.7
    assert session.updated_at == before_updated_at
    assert saves == []


def test_update_settings_rejects_disabled_model(monkeypatch) -> None:
    _isolate_sessions(monkeypatch)
    session = PlaygroundService.create_session(
        PlaygroundSessionCreate(name="s", model="codex-cli")
    )
    with pytest.raises(ValueError, match="Model disabled"):
        PlaygroundService.update_session_settings(session.id, model="gpt-5.4")
    assert session.model == "codex-cli"


def test_update_settings_accepts_enabled_model(monkeypatch) -> None:
    _isolate_sessions(monkeypatch)
    session = PlaygroundService.create_session(
        PlaygroundSessionCreate(name="s", model="codex-cli")
    )
    updated = PlaygroundService.update_session_settings(
        session.id, model="claude-sonnet-5"
    )
    assert updated is not None
    assert updated.model == "claude-sonnet-5"


def test_legacy_session_with_stale_model_still_loads(monkeypatch) -> None:
    """검증은 저장 경로 전용 — 이미 저장된 stale 모델 세션은 로딩/조회가
    그대로 되어야 한다 (legacy JSON/DB 호환, 실행 시 fallback 이 처리)."""
    _isolate_sessions(monkeypatch)
    stale = _register_stale_session("gpt-5.4")
    loaded = PlaygroundService.get_session(stale.id)
    assert loaded is stale
    assert loaded.model == "gpt-5.4"


@pytest.mark.asyncio
async def test_execute_retries_with_safe_default_when_saved_model_is_inaccessible(
    monkeypatch,
) -> None:
    """Persisted sessions with stale OpenAI models should not stay broken."""
    playground_service._sessions.clear()
    monkeypatch.setattr(playground_service.service, "_load_sessions", lambda: None)
    monkeypatch.setattr(playground_service.service, "_save_sessions", lambda: None)

    def close_background_coro(coro):
        coro.close()

    monkeypatch.setattr(playground_service.service, "_fire_and_forget", close_background_coro)
    monkeypatch.setenv("LLM_PROVIDER", "codex_cli")

    session = _register_stale_session("gpt-5.4")
    session.enabled_tools = ["web_search"]

    calls: list[str] = []
    usage_contexts: list[dict] = []

    async def fake_invoke_with_tools(**kwargs):
        model_id = kwargs["model_id"]
        calls.append(model_id)
        usage_contexts.append(kwargs["usage_context"])
        if model_id == "gpt-5.4":
            raise RuntimeError(
                "LLM invocation with tools failed (gpt-5.4): "
                "Error code: 403 - {'error': {'code': 'model_not_found'}}"
            )
        return LLMResponse(content="fallback answer", model=model_id, provider="codex_cli")

    monkeypatch.setattr(LLMService, "invoke_with_tools", fake_invoke_with_tools)

    execution = await PlaygroundService.execute(
        session.id,
        PlaygroundExecuteRequest(prompt="사용모델이 뭐야?"),
    )

    assert calls == ["gpt-5.4", "codex-cli"]
    assert [ctx["source"] for ctx in usage_contexts] == [
        LLMUsageSource.PLAYGROUND,
        LLMUsageSource.PLAYGROUND,
    ]
    assert [ctx["session_id"] for ctx in usage_contexts] == [session.id, session.id]
    assert execution.status.value == "completed"
    assert execution.result == "fallback answer"
    # 정책 변경(model policy guards): fallback은 retry 한정이며 세션의 저장된
    # 모델 선택을 재작성하지 않는다. 성공 모델은 execution.resolved_model에 남는다.
    assert session.model == "gpt-5.4"
    assert execution.resolved_model == "codex-cli"


@pytest.mark.asyncio
async def test_execute_passes_llm_access_to_usage_context(monkeypatch) -> None:
    """API-provided LLM access should reach the LLM runtime resolver hook."""
    from services.llm_access_service import default_access_response

    playground_service._sessions.clear()
    monkeypatch.setattr(playground_service.service, "_load_sessions", lambda: None)
    monkeypatch.setattr(playground_service.service, "_save_sessions", lambda: None)

    def close_background_coro(coro):
        coro.close()

    monkeypatch.setattr(playground_service.service, "_fire_and_forget", close_background_coro)

    session = PlaygroundService.create_session(
        PlaygroundSessionCreate(name="access", model="codex-cli", user_id="user-1")
    )
    access = default_access_response("user-1")
    captured: dict = {}

    async def fake_invoke(**kwargs):
        captured["usage_context"] = kwargs["usage_context"]
        return LLMResponse(content="answer", model=kwargs["model_id"], provider="codex_cli")

    monkeypatch.setattr(LLMService, "invoke", fake_invoke)

    execution = await PlaygroundService.execute(
        session.id,
        PlaygroundExecuteRequest(prompt="hello"),
        llm_access=access,
    )

    assert execution.status.value == "completed"
    assert captured["usage_context"]["user_id"] == "user-1"
    assert captured["usage_context"]["llm_access"] == access


def test_safe_fallback_resolves_entitled_model_for_authenticated_user(monkeypatch) -> None:
    """Authenticated fallback must resolve the user's entitled model, not the
    global env default — the runtime resolver gates by entitlement, so an
    unentitled env default would just re-raise and break the fallback."""
    from services.llm_access_service import default_access_response
    from services.llm_runtime_resolver import LLMRuntimeRequest, resolve_llm_runtime
    from services.playground_service import _safe_playground_fallback_model

    # env default deliberately differs from the CLI-first entitled default.
    monkeypatch.setenv("LLM_PROVIDER", "google")
    access = default_access_response("user-1")
    usage_context = {"llm_access": access, "user_id": "user-1"}
    expected = resolve_llm_runtime(
        access,
        LLMRuntimeRequest(
            user_id="user-1",
            source=LLMUsageSource.PLAYGROUND.value,
            requested_model_id=None,
        ),
    ).model_id

    assert _safe_playground_fallback_model("stale-model-xyz", usage_context) == expected


@pytest.mark.asyncio
async def test_execute_retries_on_resolver_entitlement_error_for_authenticated_user(
    monkeypatch,
) -> None:
    """A raw LLMRuntimeResolutionError (resolver rejecting the stale model for the
    user's entitlements) must trigger the fallback and retry with the entitled
    model — not just the provider-side 'model_not_found' string."""
    from services.llm_access_service import default_access_response
    from services.llm_runtime_resolver import (
        LLMRuntimeRequest,
        LLMRuntimeResolutionError,
        resolve_llm_runtime,
    )

    playground_service._sessions.clear()
    monkeypatch.setattr(playground_service.service, "_load_sessions", lambda: None)
    monkeypatch.setattr(playground_service.service, "_save_sessions", lambda: None)

    def close_background_coro(coro):
        coro.close()

    monkeypatch.setattr(playground_service.service, "_fire_and_forget", close_background_coro)

    access = default_access_response("user-1")
    entitled = resolve_llm_runtime(
        access,
        LLMRuntimeRequest(
            user_id="user-1",
            source=LLMUsageSource.PLAYGROUND.value,
            requested_model_id=None,
        ),
    ).model_id
    session = _register_stale_session("stale-model-xyz", user_id="user-1")

    calls: list[str] = []

    async def fake_invoke(**kwargs):
        model_id = kwargs["model_id"]
        calls.append(model_id)
        if model_id == "stale-model-xyz":
            raise LLMRuntimeResolutionError(
                "No enabled LLM entitlement for provider=openai, mode=api"
            )
        return LLMResponse(content="ok", model=model_id, provider="codex_cli")

    monkeypatch.setattr(LLMService, "invoke", fake_invoke)

    execution = await PlaygroundService.execute(
        session.id,
        PlaygroundExecuteRequest(prompt="hi"),
        llm_access=access,
    )

    assert calls == ["stale-model-xyz", entitled]
    assert execution.status.value == "completed"
    # 정책 변경(model policy guards): entitled fallback 성공도 세션 모델을
    # 재작성하지 않는다 — 귀속은 execution.resolved_model이 담당한다.
    assert session.model == "stale-model-xyz"
    assert execution.resolved_model == entitled


@pytest.mark.asyncio
async def test_fallback_retry_does_not_mutate_session_model_and_attributes_execution(
    monkeypatch,
) -> None:
    """The stale-model fallback is execution-scoped: ``session.model`` (the
    user's saved choice) must survive a successful retry untouched, while the
    execution records both the requested and the actually-used model."""
    playground_service._sessions.clear()
    monkeypatch.setattr(playground_service.service, "_load_sessions", lambda: None)
    monkeypatch.setattr(playground_service.service, "_save_sessions", lambda: None)

    def close_background_coro(coro):
        coro.close()

    monkeypatch.setattr(playground_service.service, "_fire_and_forget", close_background_coro)
    monkeypatch.setenv("LLM_PROVIDER", "codex_cli")

    session = _register_stale_session("gpt-5.4")

    async def fake_invoke(**kwargs):
        model_id = kwargs["model_id"]
        if model_id == "gpt-5.4":
            raise RuntimeError(
                "LLM invocation failed (gpt-5.4): "
                "Error code: 403 - {'error': {'code': 'model_not_found'}}"
            )
        return LLMResponse(content="ok", model=model_id, provider="codex_cli")

    monkeypatch.setattr(LLMService, "invoke", fake_invoke)

    execution = await PlaygroundService.execute(
        session.id,
        PlaygroundExecuteRequest(prompt="hi"),
    )

    assert execution.status.value == "completed"
    assert session.model == "gpt-5.4"
    assert execution.requested_model == "gpt-5.4"
    assert execution.resolved_model == "codex-cli"


@pytest.mark.asyncio
async def test_failed_fallback_target_is_not_persisted_to_session(monkeypatch) -> None:
    """When the fallback target itself fails to build/invoke, the failure must
    not be committed as the session model — otherwise a broken fallback
    poisons every subsequent execution of the session."""
    playground_service._sessions.clear()
    monkeypatch.setattr(playground_service.service, "_load_sessions", lambda: None)
    monkeypatch.setattr(playground_service.service, "_save_sessions", lambda: None)

    def close_background_coro(coro):
        coro.close()

    monkeypatch.setattr(playground_service.service, "_fire_and_forget", close_background_coro)
    monkeypatch.setenv("LLM_PROVIDER", "codex_cli")

    session = _register_stale_session("gpt-5.4")

    calls: list[str] = []

    async def fake_invoke(**kwargs):
        calls.append(kwargs["model_id"])
        raise RuntimeError(
            f"LLM invocation failed ({kwargs['model_id']}): "
            "Error code: 403 - {'error': {'code': 'model_not_found'}}"
        )

    monkeypatch.setattr(LLMService, "invoke", fake_invoke)

    execution = await PlaygroundService.execute(
        session.id,
        PlaygroundExecuteRequest(prompt="hi"),
    )

    assert calls == ["gpt-5.4", "codex-cli"]
    assert execution.status.value == "failed"
    assert session.model == "gpt-5.4"
    assert execution.requested_model == "gpt-5.4"
    assert execution.resolved_model is None


def test_execution_model_attribution_fields_default_none_for_legacy_records() -> None:
    """Legacy persisted executions (JSON without the new fields) must keep
    parsing — attribution fields are additive and default to None."""
    from models.playground import PlaygroundExecution

    legacy = PlaygroundExecution(agent_id="a", prompt="p")
    assert legacy.requested_model is None
    assert legacy.resolved_model is None


def test_safe_fallback_returns_none_when_authenticated_user_has_no_entitlement() -> None:
    """An authenticated user with no usable entitlement gets None (no doomed
    retry) instead of an env default the resolver would reject."""
    from models.llm_access import LLMAccessResponse
    from services.playground_service import _safe_playground_fallback_model

    access = LLMAccessResponse(user_id="user-1", api_fallback_enabled=False)
    fallback = _safe_playground_fallback_model(
        "stale-model-xyz", {"llm_access": access, "user_id": "user-1"}
    )
    assert fallback is None


# ─────────────────────────────────────────────────────────────
# execute_stream fallback parity (non-tools) + resolved-model cost
# ─────────────────────────────────────────────────────────────


def _patch_stream_env(monkeypatch) -> list[float]:
    """Common stream-test scaffolding; returns the captured cost-model list."""
    playground_service._sessions.clear()
    monkeypatch.setattr(playground_service.service, "_load_sessions", lambda: None)
    monkeypatch.setattr(playground_service.service, "_save_sessions", lambda: None)

    def close_background_coro(coro):
        coro.close()

    monkeypatch.setattr(playground_service.service, "_fire_and_forget", close_background_coro)
    monkeypatch.setenv("LLM_PROVIDER", "codex_cli")

    cost_models: list[str] = []

    def fake_calculate_cost(input_tokens: int, output_tokens: int, model: str) -> float:
        cost_models.append(model)
        return 0.5

    # service.py의 import 바인딩을 패치한다 (정의처 models.cost가 아니라).
    monkeypatch.setattr(playground_service.service, "calculate_cost", fake_calculate_cost)
    return cost_models


@pytest.mark.asyncio
async def test_stream_retries_inaccessible_model_before_first_output(monkeypatch) -> None:
    """Non-tools streaming must apply the same stale-model fallback as the
    non-streaming path when the error arrives BEFORE any output chunk, and the
    cost must be computed with the resolved (fallback) model."""
    cost_models = _patch_stream_env(monkeypatch)
    session = _register_stale_session("gpt-5.4", name="stale-stream")

    calls: list[str] = []

    def fake_stream(**kwargs):
        async def gen():
            model_id = kwargs["model_id"]
            calls.append(model_id)
            if model_id == "gpt-5.4":
                yield (
                    "\n\n[Error: model_not_found]",
                    {"error": True, "message": "model_not_found"},
                )
                return
            yield ("hello ", None)
            yield ("world", None)
            yield ("", {"input_tokens": 3, "output_tokens": 5, "model": model_id})

        return gen()

    monkeypatch.setattr(LLMService, "stream_with_tokens", fake_stream)

    chunks = [
        c
        async for c in PlaygroundService.execute_stream(
            session.id, PlaygroundExecuteRequest(prompt="hi")
        )
    ]

    assert calls == ["gpt-5.4", "codex-cli"]
    assert "".join(chunks) == "hello world"
    # 무변이: 스트림 fallback도 세션의 저장된 선택을 재작성하지 않는다.
    assert session.model == "gpt-5.4"
    # 비용은 실제 성공한(resolved) 모델로 계산한다.
    assert cost_models == ["codex-cli"]
    assert session.total_executions == 1
    assert session.total_cost == 0.5


@pytest.mark.asyncio
async def test_stream_retries_on_resolver_error_before_first_output(monkeypatch) -> None:
    """The resolver rejecting the stale model raises a raw
    LLMRuntimeResolutionError on first iteration — that shape must also
    trigger the pre-output fallback, not just the provider error sentinel."""
    from services.llm_runtime_resolver import LLMRuntimeResolutionError

    _patch_stream_env(monkeypatch)
    session = _register_stale_session("stale-model-xyz", name="stale-stream")

    calls: list[str] = []

    async def fake_stream(**kwargs):
        model_id = kwargs["model_id"]
        calls.append(model_id)
        if model_id == "stale-model-xyz":
            raise LLMRuntimeResolutionError(
                "No enabled LLM entitlement for provider=openai, mode=api"
            )
        yield ("ok", None)
        yield ("", {"input_tokens": 1, "output_tokens": 2, "model": model_id})

    monkeypatch.setattr(LLMService, "stream_with_tokens", fake_stream)

    chunks = [
        c
        async for c in PlaygroundService.execute_stream(
            session.id, PlaygroundExecuteRequest(prompt="hi")
        )
    ]

    assert calls == ["stale-model-xyz", "codex-cli"]
    assert "".join(chunks) == "ok"
    assert session.model == "stale-model-xyz"


@pytest.mark.asyncio
async def test_stream_does_not_retry_after_first_output(monkeypatch) -> None:
    """Once a chunk has been emitted to the client, a retry would duplicate
    already-streamed content — the failure must be surfaced, not retried."""
    _patch_stream_env(monkeypatch)
    session = _register_stale_session("gpt-5.4", name="stale-stream")

    calls: list[str] = []

    def fake_stream(**kwargs):
        async def gen():
            calls.append(kwargs["model_id"])
            yield ("partial ", None)
            yield (
                "\n\n[Error: model_not_found]",
                {"error": True, "message": "model_not_found"},
            )

        return gen()

    monkeypatch.setattr(LLMService, "stream_with_tokens", fake_stream)

    chunks = [
        c
        async for c in PlaygroundService.execute_stream(
            session.id, PlaygroundExecuteRequest(prompt="hi")
        )
    ]

    assert calls == ["gpt-5.4"]
    assert chunks[0] == "partial "
    assert "[Error" in chunks[-1]
    # 실패한 스트림은 세션 집계에 반영되지 않는다 (기존 계약 유지).
    assert session.total_executions == 0


@pytest.mark.asyncio
async def test_stream_tools_branch_costs_resolved_model(monkeypatch) -> None:
    """Tools-path streaming already retries via _invoke_with_model_fallback;
    its cost must also use the resolved model, not the stale session model."""
    cost_models = _patch_stream_env(monkeypatch)
    session = _register_stale_session("gpt-5.4", name="stale-stream")
    session.enabled_tools = ["web_search"]

    async def fake_invoke_with_tools(**kwargs):
        model_id = kwargs["model_id"]
        if model_id == "gpt-5.4":
            raise RuntimeError(
                "LLM invocation with tools failed (gpt-5.4): "
                "Error code: 403 - {'error': {'code': 'model_not_found'}}"
            )
        return LLMResponse(
            content="tool answer",
            input_tokens=3,
            output_tokens=5,
            model=model_id,
            provider="codex_cli",
        )

    monkeypatch.setattr(LLMService, "invoke_with_tools", fake_invoke_with_tools)

    chunks = [
        c
        async for c in PlaygroundService.execute_stream(
            session.id, PlaygroundExecuteRequest(prompt="hi")
        )
    ]

    assert chunks[0] == "tool answer"
    assert session.model == "gpt-5.4"
    assert cost_models == ["codex-cli"]


@pytest.mark.asyncio
async def test_stream_records_execution_with_requested_and_resolved_model(monkeypatch) -> None:
    """A stream request must leave one PlaygroundExecution on the session,
    attributing the requested (saved) model and the actually-used resolved
    model, and the new fields must survive the existing DB serialization."""
    _patch_stream_env(monkeypatch)
    session = _register_stale_session("gpt-5.4", name="stale-stream")

    def fake_stream(**kwargs):
        async def gen():
            model_id = kwargs["model_id"]
            if model_id == "gpt-5.4":
                yield (
                    "\n\n[Error: model_not_found]",
                    {"error": True, "message": "model_not_found"},
                )
                return
            yield ("hello ", None)
            yield ("world", None)
            yield ("", {"input_tokens": 3, "output_tokens": 5, "model": model_id})

        return gen()

    monkeypatch.setattr(LLMService, "stream_with_tokens", fake_stream)

    async for _ in PlaygroundService.execute_stream(
        session.id, PlaygroundExecuteRequest(prompt="hi")
    ):
        pass

    assert len(session.executions) == 1
    execution = session.executions[0]
    assert execution.status.value == "completed"
    assert execution.requested_model == "gpt-5.4"
    assert execution.resolved_model == "codex-cli"
    assert execution.result == "hello world"
    assert execution.input_tokens == 3
    assert execution.output_tokens == 5
    assert execution.total_tokens == 8
    assert execution.cost == 0.5
    # 기존 DB 직렬화(JSON 컬럼) 경로에 새 필드가 포함되어야 한다.
    db_dict = PlaygroundService._pydantic_to_db_dict(session)
    assert db_dict["executions"][0]["requested_model"] == "gpt-5.4"
    assert db_dict["executions"][0]["resolved_model"] == "codex-cli"


@pytest.mark.asyncio
async def test_stream_failure_records_failed_execution_without_totals(monkeypatch) -> None:
    """A stream that fails after the first chunk must persist a FAILED
    execution (with error, no resolved model) while keeping the existing
    contract that failed streams do not count toward session totals."""
    _patch_stream_env(monkeypatch)
    save_calls: list[bool] = []
    monkeypatch.setattr(
        playground_service.service, "_save_sessions", lambda: save_calls.append(True)
    )
    session = _register_stale_session("gpt-5.4", name="stale-stream")
    save_calls.clear()

    def fake_stream(**kwargs):
        async def gen():
            yield ("partial ", None)
            yield (
                "\n\n[Error: model_not_found]",
                {"error": True, "message": "model_not_found"},
            )

        return gen()

    monkeypatch.setattr(LLMService, "stream_with_tokens", fake_stream)

    async for _ in PlaygroundService.execute_stream(
        session.id, PlaygroundExecuteRequest(prompt="hi")
    ):
        pass

    assert len(session.executions) == 1
    execution = session.executions[0]
    assert execution.status.value == "failed"
    assert execution.error is not None and "model_not_found" in execution.error
    assert execution.requested_model == "gpt-5.4"
    assert execution.resolved_model is None
    # 실패한 execution 도 영속화 경로는 타야 한다.
    assert save_calls
    # 기존 계약 유지: 실패 스트림은 성공 집계를 올리지 않는다.
    assert session.total_executions == 0
    assert session.total_tokens == 0
    assert session.total_cost == 0.0


@pytest.mark.asyncio
async def test_stream_tools_branch_exception_records_failed_execution(monkeypatch) -> None:
    """A non-fallback exception in the tools branch surfaces the generic
    [Error: ...] chunk — that path must also leave a FAILED execution."""
    _patch_stream_env(monkeypatch)
    session = _register_stale_session("gpt-5.4", name="tools-stream")
    session.enabled_tools = ["web_search"]

    async def fake_invoke_with_tools(**kwargs):
        raise RuntimeError("provider exploded")

    monkeypatch.setattr(LLMService, "invoke_with_tools", fake_invoke_with_tools)

    chunks = [
        c
        async for c in PlaygroundService.execute_stream(
            session.id, PlaygroundExecuteRequest(prompt="hi")
        )
    ]

    assert "[Error: provider exploded]" in chunks[-1]
    assert len(session.executions) == 1
    execution = session.executions[0]
    assert execution.status.value == "failed"
    assert execution.error == "provider exploded"
    assert execution.requested_model == "gpt-5.4"
    assert execution.resolved_model is None
    assert session.total_executions == 0


# ─────────────────────────────────────────────────────────────
# execute_stream lifecycle: cancellation / disconnect / init errors
# ─────────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_stream_client_disconnect_finalizes_execution_as_cancelled(
    monkeypatch,
) -> None:
    """클라이언트 disconnect 로 generator 가 aclose() 되면(GeneratorExit)
    execution 이 RUNNING 인 채 영속화 경로에 남으면 안 된다 — CANCELLED 로
    마감하고 저장까지 탄다."""
    _patch_stream_env(monkeypatch)
    save_calls: list[bool] = []
    monkeypatch.setattr(
        playground_service.service, "_save_sessions", lambda: save_calls.append(True)
    )
    session = PlaygroundService.create_session(
        PlaygroundSessionCreate(name="s", model="codex-cli")
    )
    save_calls.clear()

    def fake_stream(**kwargs):
        async def gen():
            yield ("chunk-1 ", None)
            yield ("chunk-2 ", None)
            yield ("", {"input_tokens": 1, "output_tokens": 1, "model": kwargs["model_id"]})

        return gen()

    monkeypatch.setattr(LLMService, "stream_with_tokens", fake_stream)

    stream = PlaygroundService.execute_stream(
        session.id, PlaygroundExecuteRequest(prompt="hi")
    )
    assert await stream.__anext__() == "chunk-1 "
    await stream.aclose()

    assert len(session.executions) == 1
    execution = session.executions[0]
    assert execution.status.value == "cancelled"
    assert execution.completed_at is not None
    assert save_calls, "취소 마감도 영속화 경로를 타야 한다"
    # 취소는 성공 집계에 반영되지 않는다.
    assert session.total_executions == 0


@pytest.mark.asyncio
async def test_stream_task_cancellation_finalizes_execution_as_cancelled(
    monkeypatch,
) -> None:
    """asyncio 취소(CancelledError)는 BaseException 이라 기존 except Exception
    이 놓친다 — CANCELLED 로 마감한 뒤 그대로 재전파해야 한다."""
    import asyncio

    _patch_stream_env(monkeypatch)
    session = PlaygroundService.create_session(
        PlaygroundSessionCreate(name="s", model="codex-cli")
    )

    def fake_stream(**kwargs):
        async def gen():
            yield ("chunk-1 ", None)
            yield ("chunk-2 ", None)

        return gen()

    monkeypatch.setattr(LLMService, "stream_with_tokens", fake_stream)

    stream = PlaygroundService.execute_stream(
        session.id, PlaygroundExecuteRequest(prompt="hi")
    )
    assert await stream.__anext__() == "chunk-1 "
    with pytest.raises(asyncio.CancelledError):
        await stream.athrow(asyncio.CancelledError)

    assert len(session.executions) == 1
    execution = session.executions[0]
    assert execution.status.value == "cancelled"
    assert execution.completed_at is not None


@pytest.mark.asyncio
async def test_stream_init_exception_does_not_leave_running_execution(
    monkeypatch,
) -> None:
    """LLM 루프 진입 전(history/RAG 준비 단계) 예외도 RUNNING execution 을
    남기지 않고 FAILED 로 마감한 뒤 in-band [Error] 청크로 표면화한다."""
    _patch_stream_env(monkeypatch)
    session = PlaygroundService.create_session(
        PlaygroundSessionCreate(name="s", model="codex-cli")
    )

    def boom(_msgs):
        raise RuntimeError("history exploded")

    monkeypatch.setattr(playground_service.service, "_to_lc_messages", boom)

    chunks = [
        c
        async for c in PlaygroundService.execute_stream(
            session.id, PlaygroundExecuteRequest(prompt="hi")
        )
    ]

    assert "[Error: history exploded]" in chunks[-1]
    assert len(session.executions) == 1
    execution = session.executions[0]
    assert execution.status.value == "failed"
    assert execution.error == "history exploded"


# ─────────────────────────────────────────────────────────────
# Optional execution metadata: registry revision
# ─────────────────────────────────────────────────────────────


def test_legacy_execution_json_defaults_registry_revision_none() -> None:
    """구버전 JSON/DB 레코드(필드 부재)는 None 으로 파싱되어야 한다."""
    from models.playground import PlaygroundExecution

    legacy = PlaygroundExecution(agent_id="a", prompt="p")
    assert legacy.registry_revision is None


@pytest.mark.asyncio
async def test_execute_stamps_registry_revision(monkeypatch) -> None:
    """실행 레코드는 어느 registry snapshot 아래에서 돌았는지 optional
    metadata 로 남긴다 (additive 필드 — 기존 JSON/DB schema 안전)."""
    from models.llm_models import LLMModelRegistry

    _isolate_sessions(monkeypatch)
    session = PlaygroundService.create_session(
        PlaygroundSessionCreate(name="s", model="codex-cli")
    )

    async def fake_invoke(**kwargs):
        return LLMResponse(content="ok", model=kwargs["model_id"], provider="codex_cli")

    monkeypatch.setattr(LLMService, "invoke", fake_invoke)

    execution = await PlaygroundService.execute(
        session.id, PlaygroundExecuteRequest(prompt="hi")
    )

    assert execution.registry_revision == LLMModelRegistry.get_revision()
    # 기존 DB JSON 직렬화 경로에도 자동 포함된다 (model_dump 전량 직렬화).
    db_dict = PlaygroundService._pydantic_to_db_dict(session)
    assert db_dict["executions"][0]["registry_revision"] == execution.registry_revision


@pytest.mark.asyncio
async def test_stream_stamps_registry_revision(monkeypatch) -> None:
    from models.llm_models import LLMModelRegistry

    _patch_stream_env(monkeypatch)
    session = PlaygroundService.create_session(
        PlaygroundSessionCreate(name="s", model="codex-cli")
    )

    def fake_stream(**kwargs):
        async def gen():
            yield ("ok", None)
            yield ("", {"input_tokens": 1, "output_tokens": 1, "model": kwargs["model_id"]})

        return gen()

    monkeypatch.setattr(LLMService, "stream_with_tokens", fake_stream)

    async for _ in PlaygroundService.execute_stream(
        session.id, PlaygroundExecuteRequest(prompt="hi")
    ):
        pass

    assert session.executions[0].registry_revision == LLMModelRegistry.get_revision()


def test_safe_fallback_returns_none_when_configured_provider_has_no_models(
    monkeypatch,
) -> None:
    """익명 폴백 경로: 구성된 provider 에 enabled 모델이 0개면 get_default 가
    fail-closed(LookupError) 한다 — 폴백 헬퍼는 이를 '재시도 없음'(None)으로
    번역해 원래 오류가 그대로 표면화되게 해야 한다."""
    from models.llm_models import LLMModelRegistry
    from services.playground_service import _safe_playground_fallback_model

    def raise_lookup(provider=None):
        raise LookupError("No enabled models for provider google")

    monkeypatch.setattr(LLMModelRegistry, "get_default", raise_lookup)
    assert _safe_playground_fallback_model("stale-model", None) is None


# ─────────────────────────────────────────────────────────────
# LLMService message building + force-final
# ─────────────────────────────────────────────────────────────


def test_build_messages_separates_rag_into_system_message() -> None:
    msgs = _build_messages(
        system_prompt="Sys",
        history=[HumanMessage(content="prev_u"), AIMessage(content="prev_a")],
        prompt="current",
        rag_context="RAG BLOCK",
        extra_context={"k": "v"},
    )
    # System, RAG-System, prev_u, prev_a, current-Human
    assert len(msgs) == 5
    assert isinstance(msgs[0], SystemMessage) and msgs[0].content == "Sys"
    assert isinstance(msgs[1], SystemMessage)
    assert "RAG BLOCK" in msgs[1].content
    assert "source of truth" in msgs[1].content.lower()
    assert isinstance(msgs[2], HumanMessage) and msgs[2].content == "prev_u"
    assert isinstance(msgs[3], AIMessage) and msgs[3].content == "prev_a"
    assert isinstance(msgs[4], HumanMessage)
    assert "current" in msgs[4].content
    assert "- k: v" in msgs[4].content


def test_build_messages_without_history_or_rag() -> None:
    msgs = _build_messages(
        system_prompt=None,
        history=None,
        prompt="just ask",
    )
    assert len(msgs) == 1
    assert isinstance(msgs[0], HumanMessage)
    assert msgs[0].content == "just ask"


@pytest.mark.asyncio
async def test_invoke_with_tools_force_final_on_budget_exhaustion() -> None:
    """When tool iterations run out we must still return a real answer."""
    # Mock LLM that *always* wants to call a tool, forcing budget exhaustion.
    mock_llm = MagicMock()

    always_tool_response = MagicMock()
    always_tool_response.content = ""
    always_tool_response.tool_calls = [{"name": "web_search", "args": {"query": "x"}, "id": "t1"}]
    always_tool_response.usage_metadata = {"input_tokens": 10, "output_tokens": 2}

    # Raw llm.ainvoke (used for the force-final round) returns a clean answer.
    forced_final = MagicMock()
    forced_final.content = "final synthesized answer"
    forced_final.usage_metadata = {"input_tokens": 20, "output_tokens": 5}

    mock_llm.ainvoke = AsyncMock(return_value=forced_final)
    mock_bound = MagicMock()
    mock_bound.ainvoke = AsyncMock(return_value=always_tool_response)
    mock_llm.bind_tools = MagicMock(return_value=mock_bound)

    async def fake_exec(_name, _args, working_directory=None):
        return {"success": True, "results": []}

    with (
        patch.object(LLMService, "_get_llm", return_value=mock_llm),
        patch("services.playground_tools.execute_tool", side_effect=fake_exec),
    ):
        resp = await LLMService.invoke_with_tools(
            prompt="q",
            tools=["web_search"],
            model_id="gemini-3.1-pro-preview",
            max_tool_iterations=2,
        )

    assert resp.content == "final synthesized answer"
    # Budget of 2 rounds -> 2 tool calls recorded before force-final kicks in
    assert len(resp.tool_calls) == 2


# ─────────────────────────────────────────────────────────────
# Web search provider dispatch
# ─────────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_web_search_uses_tavily_when_key_set(monkeypatch) -> None:
    from services import playground_tools

    async def fake_tavily(query, max_results, api_key):
        return {
            "success": True,
            "query": query,
            "provider": "tavily",
            "results": [{"title": "t", "url": "u", "snippet": "s", "score": 0.9}],
            "total": 1,
            "answer": "synthesized",
        }

    monkeypatch.setenv("TAVILY_API_KEY", "fake-key")
    monkeypatch.setattr(playground_tools.PlaygroundTools, "_web_search_tavily", fake_tavily)

    res = await playground_tools.PlaygroundTools.web_search("test", 3)
    assert res["provider"] == "tavily"
    assert res["answer"] == "synthesized"


@pytest.mark.asyncio
async def test_web_search_falls_back_to_ddg_without_key(monkeypatch) -> None:
    from services import playground_tools

    async def fake_ddg(query, max_results=5):
        return {"success": True, "provider": "duckduckgo", "results": []}

    monkeypatch.delenv("TAVILY_API_KEY", raising=False)
    monkeypatch.setattr(playground_tools.PlaygroundTools, "_web_search_ddg", fake_ddg)

    res = await playground_tools.PlaygroundTools.web_search("test", 3)
    assert res["provider"] == "duckduckgo"
