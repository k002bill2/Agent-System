"""PlaygroundService — 세션 CRUD · 실행 · 도구 · 비교.

DB 영속화 5 함수는 `storage.py` 로 들어올린 뒤 클래스에 같은 이름으로
재부착했다(`staticmethod(...)`) — `PlaygroundService.save_session_to_db(...)`
호출 형태가 그대로 유지된다. 클래스 전체가 `@staticmethod` 라 가능한 형태다.

`_load_sessions` · `_save_sessions` · `_fire_and_forget` 을 읽는 곳이 전부
이 모듈이다. 테스트는 이 모듈 객체를 패치한다 —
`monkeypatch.setattr(playground_service.service, "_load_sessions", ...)`.
"""

import json
import logging
from collections.abc import AsyncIterator
from typing import Any

from models.cost import calculate_cost, estimate_tokens
from models.llm_access import LLMAccessResponse
from models.playground import (
    PlaygroundCompareRequest,
    PlaygroundCompareResult,
    PlaygroundExecuteRequest,
    PlaygroundExecution,
    PlaygroundExecutionStatus,
    PlaygroundMessage,
    PlaygroundSession,
    PlaygroundSessionCreate,
    PlaygroundToolTest,
)
from services.llm_runtime_resolver import LLMRuntimeResolutionError
from services.llm_service import LLMService
from services.playground_context import build_effective_system_prompt
from utils.time import utcnow

from .config import DEFAULT_SYSTEM_PROMPT, PLAYGROUND_TOOLS
from .llm import (
    _coerce_llm_content,
    _invoke_with_model_fallback,
    _is_inaccessible_model_error,
    _playground_usage_context,
    _safe_playground_fallback_model,
    _to_lc_messages,
)
from .mock import _generate_mock_tool_result
from .storage import (
    _fire_and_forget,
    _load_sessions,
    _model_to_pydantic,
    _pydantic_to_db_dict,
    _save_sessions,
    _sessions,
    delete_session_from_db,
    load_sessions_from_db,
    save_session_to_db,
)

logger = logging.getLogger(__name__)


class PlaygroundService:
    """Service for managing playground sessions and executions."""

    # ─────────────────────────────────────────────────────────────
    # Session Management
    # ─────────────────────────────────────────────────────────────

    @staticmethod
    def create_session(data: PlaygroundSessionCreate) -> PlaygroundSession:
        """Create a new playground session."""
        _load_sessions()  # Ensure sessions are loaded

        session = PlaygroundSession(
            name=data.name,
            description=data.description,
            user_id=data.user_id,
            project_id=data.project_id,
            working_directory=data.working_directory,
            agent_id=data.agent_id,
            model=data.model,
            system_prompt=data.system_prompt or DEFAULT_SYSTEM_PROMPT,
            rag_enabled=data.rag_enabled,
            rules_mode=data.rules_mode,
            memory_mode=data.memory_mode,
            selected_rule_ids=list(data.selected_rule_ids),
            selected_memory_ids=list(data.selected_memory_ids),
            context_budget_tokens=data.context_budget_tokens,
            available_tools=list(PLAYGROUND_TOOLS.keys()),
        )
        _sessions[session.id] = session
        _save_sessions()  # Persist to file
        _fire_and_forget(PlaygroundService.save_session_to_db(session))
        return session

    @staticmethod
    def get_session(session_id: str) -> PlaygroundSession | None:
        """Get a playground session by ID."""
        _load_sessions()  # Ensure sessions are loaded
        return _sessions.get(session_id)

    @staticmethod
    def list_sessions(
        user_id: str | None = None,
        *,
        include_all: bool = False,
    ) -> list[PlaygroundSession]:
        """List playground sessions, scoped to the caller by default.

        Fail-closed contract:

        - ``include_all=True`` returns every session. Callers **must** have
          verified an admin/manager role before asking for this.
        - Otherwise only sessions owned by ``user_id`` are returned.
        - ``user_id is None`` (no authenticated identity) returns nothing
          rather than everything, so a caller that forgets to pass an identity
          leaks no data.

        Ownerless legacy sessions (``user_id is None`` on the session) are
        deliberately **excluded** from per-user listings — previously they were
        shown to every user, which disclosed other people's legacy transcripts.
        They remain reachable via ``include_all`` for admin recovery.
        """
        _load_sessions()  # Ensure sessions are loaded
        sessions = _sessions.values()
        if not include_all:
            if not user_id:
                return []
            sessions = (s for s in sessions if s.user_id == user_id)
        return sorted(
            sessions,
            key=lambda s: s.updated_at,
            reverse=True,
        )

    @staticmethod
    def delete_session(session_id: str) -> bool:
        """Delete a playground session."""
        _load_sessions()  # Ensure sessions are loaded
        if session_id in _sessions:
            del _sessions[session_id]
            _save_sessions()  # Persist to file
            _fire_and_forget(PlaygroundService.delete_session_from_db(session_id))
            return True
        return False

    @staticmethod
    def update_session_settings(
        session_id: str,
        agent_id: str | None = None,
        model: str | None = None,
        temperature: float | None = None,
        max_tokens: int | None = None,
        system_prompt: str | None = None,
        enabled_tools: list[str] | None = None,
        name: str | None = None,
        project_id: str | None = None,
        working_directory: str | None = None,
        rag_enabled: bool | None = None,
        rag_k: int | None = None,
        rag_hybrid_override: bool | None = None,
        rag_rerank_override: bool | None = None,
        rag_include_shared: bool | None = None,
        rules_mode: str | None = None,
        memory_mode: str | None = None,
        selected_rule_ids: list[str] | None = None,
        selected_memory_ids: list[str] | None = None,
        context_budget_tokens: int | None = None,
    ) -> PlaygroundSession | None:
        """Update session settings."""
        _load_sessions()  # Ensure sessions are loaded
        session = _sessions.get(session_id)
        if not session:
            return None

        if name is not None:
            session.name = name
        if agent_id is not None:
            session.agent_id = agent_id
        if model is not None:
            session.model = model
        if temperature is not None:
            session.temperature = temperature
        if max_tokens is not None:
            session.max_tokens = max_tokens
        if system_prompt is not None:
            session.system_prompt = system_prompt
        if enabled_tools is not None:
            session.enabled_tools = enabled_tools
        if project_id is not None:
            session.project_id = project_id
        if working_directory is not None:
            session.working_directory = working_directory
        if rag_enabled is not None:
            session.rag_enabled = rag_enabled
        if rag_k is not None:
            session.rag_k = rag_k
        if rag_hybrid_override is not None:
            session.rag_hybrid_override = rag_hybrid_override
        if rag_rerank_override is not None:
            session.rag_rerank_override = rag_rerank_override
        if rag_include_shared is not None:
            session.rag_include_shared = rag_include_shared
        if rules_mode is not None:
            session.rules_mode = rules_mode  # type: ignore[assignment]
        if memory_mode is not None:
            session.memory_mode = memory_mode  # type: ignore[assignment]
        if selected_rule_ids is not None:
            session.selected_rule_ids = list(selected_rule_ids)
        if selected_memory_ids is not None:
            session.selected_memory_ids = list(selected_memory_ids)
        if context_budget_tokens is not None:
            session.context_budget_tokens = context_budget_tokens

        session.updated_at = utcnow()
        _save_sessions()  # Persist to file
        _fire_and_forget(PlaygroundService.save_session_to_db(session))
        return session

    # ─────────────────────────────────────────────────────────────
    # Execution
    # ─────────────────────────────────────────────────────────────

    @staticmethod
    async def execute(
        session_id: str,
        request: PlaygroundExecuteRequest,
        llm_access: LLMAccessResponse | None = None,
    ) -> PlaygroundExecution:
        """Execute a prompt in the playground."""
        _load_sessions()  # Ensure sessions are loaded
        session = _sessions.get(session_id)
        if not session:
            raise ValueError(f"Session {session_id} not found")

        # Create execution record
        execution = PlaygroundExecution(
            agent_id=session.agent_id or "default",
            prompt=request.prompt,
            context=request.context,
            temperature=request.temperature or session.temperature,
            max_tokens=request.max_tokens or session.max_tokens,
            tools_enabled=request.tools or session.enabled_tools,
            requested_model=session.model,
        )

        execution.status = PlaygroundExecutionStatus.RUNNING
        execution.started_at = utcnow()

        # Add user message
        user_msg = PlaygroundMessage(
            role="user",
            content=request.prompt,
        )
        execution.messages.append(user_msg)
        session.messages.append(user_msg)

        try:
            # Convert prior turns (excluding the one we just appended) into
            # LangChain messages so the LLM sees a real multi-turn dialogue.
            history = _to_lc_messages(session.messages[-11:-1])

            # Inject RAG context if enabled
            rag_sources: list[dict] | None = None
            rag_context_str: str | None = None
            if session.rag_enabled and session.project_id:
                try:
                    from services.rag_service import get_project_context_with_sources

                    k = (
                        request.rag_k
                        if getattr(request, "rag_k", None)
                        else getattr(session, "rag_k", None) or 5
                    )
                    force_hybrid = (
                        request.rag_hybrid_override
                        if getattr(request, "rag_hybrid_override", None) is not None
                        else getattr(session, "rag_hybrid_override", None)
                    )
                    force_rerank = (
                        request.rag_rerank_override
                        if getattr(request, "rag_rerank_override", None) is not None
                        else getattr(session, "rag_rerank_override", None)
                    )
                    include_shared = (
                        request.rag_include_shared
                        if getattr(request, "rag_include_shared", None) is not None
                        else bool(getattr(session, "rag_include_shared", False))
                    )
                    rag_context_str, rag_sources = await get_project_context_with_sources(
                        project_id=session.project_id,
                        query=request.prompt,
                        k=k,
                        include_shared=include_shared,
                        force_hybrid=force_hybrid,
                        force_rerank=force_rerank,
                    )
                except Exception as e:
                    logger.warning("RAG context retrieval failed: %s", e)

            # Check if tools are enabled
            enabled_tools = execution.tools_enabled or []

            # Compose the session system prompt with opt-in rules/memory once
            # per invocation (identical for tool and non-tool paths).
            effective_system_prompt = build_effective_system_prompt(session)
            usage_context = _playground_usage_context(
                session,
                execution=execution,
                metadata={"tools_enabled": bool(enabled_tools), "streaming": False},
                llm_access=llm_access,
            )

            if enabled_tools:
                # Use tool-enabled LLM invocation
                llm_response = await _invoke_with_model_fallback(
                    session,
                    LLMService.invoke_with_tools,
                    prompt=request.prompt,
                    tools=enabled_tools,
                    system_prompt=effective_system_prompt,
                    temperature=execution.temperature,
                    max_tokens=execution.max_tokens,
                    context=request.context or None,
                    history=history,
                    rag_context=rag_context_str,
                    working_directory=session.working_directory,
                    usage_context=usage_context,
                )

                # Add tool call messages if any
                for _i, (tool_call, tool_result) in enumerate(
                    zip(llm_response.tool_calls, llm_response.tool_results, strict=False)
                ):
                    # Tool call message
                    tool_msg = PlaygroundMessage(
                        role="tool",
                        content=f"Called {tool_call['name']}({tool_call['arguments']})",
                        tool_calls=[tool_call],
                        tool_results=[tool_result],
                    )
                    execution.messages.append(tool_msg)
                    session.messages.append(tool_msg)
            else:
                # Regular LLM invocation without tools
                llm_response = await _invoke_with_model_fallback(
                    session,
                    LLMService.invoke,
                    prompt=request.prompt,
                    system_prompt=effective_system_prompt,
                    temperature=execution.temperature,
                    max_tokens=execution.max_tokens,
                    context=request.context or None,
                    history=history,
                    rag_context=rag_context_str,
                    usage_context=usage_context,
                )

            # Flatten multi-part content (Gemini) into a persistable string
            content = _coerce_llm_content(llm_response.content)

            assistant_msg = PlaygroundMessage(
                role="assistant",
                content=content,
                tokens=llm_response.output_tokens,
                latency_ms=llm_response.latency_ms,
                rag_sources=rag_sources,
            )
            execution.messages.append(assistant_msg)
            session.messages.append(assistant_msg)

            # Update execution metrics
            execution.result = content
            execution.status = PlaygroundExecutionStatus.COMPLETED
            # 실제 성공한 모델(무변이 fallback retry면 fallback model)을 귀속.
            execution.resolved_model = llm_response.model or session.model
            execution.input_tokens = llm_response.input_tokens
            execution.output_tokens = llm_response.output_tokens
            execution.total_tokens = llm_response.total_tokens
            execution.total_latency_ms = llm_response.latency_ms
            execution.cost = llm_response.cost

        except Exception as e:
            execution.status = PlaygroundExecutionStatus.FAILED
            execution.error = str(e)

            # Add error message
            error_msg = PlaygroundMessage(
                role="assistant",
                content=f"[Error] {str(e)}",
                tokens=0,
                latency_ms=0,
            )
            execution.messages.append(error_msg)
            session.messages.append(error_msg)

        execution.completed_at = utcnow()

        # Update session
        session.executions.append(execution)
        session.total_executions += 1
        session.total_tokens += execution.total_tokens
        session.total_cost += execution.cost
        session.updated_at = utcnow()
        _save_sessions()  # Persist to file
        _fire_and_forget(PlaygroundService.save_session_to_db(session))

        return execution

    @staticmethod
    async def execute_stream(
        session_id: str,
        request: PlaygroundExecuteRequest,
        llm_access: LLMAccessResponse | None = None,
    ) -> AsyncIterator[str]:
        """Execute with streaming response.

        When ``request.tools`` (or session.enabled_tools) are active this
        path routes through ``invoke_with_tools`` (non-streaming at the
        provider level) and yields the final synthesized answer as a single
        chunk, because Gemini's tool-calling protocol requires a complete
        round-trip before a final textual response is produced.
        """
        _load_sessions()  # Ensure sessions are loaded
        session = _sessions.get(session_id)
        if not session:
            raise ValueError(f"Session {session_id} not found")

        # Execution record — 스트리밍도 execute() 와 같은 실행 단위 귀속을 남긴다.
        execution = PlaygroundExecution(
            agent_id=session.agent_id or "default",
            prompt=request.prompt,
            context=request.context,
            temperature=request.temperature or session.temperature,
            max_tokens=request.max_tokens or session.max_tokens,
            tools_enabled=request.tools or session.enabled_tools,
            requested_model=session.model,
        )
        execution.status = PlaygroundExecutionStatus.RUNNING
        execution.started_at = utcnow()

        # Add user message to session
        user_msg = PlaygroundMessage(
            role="user",
            content=request.prompt,
        )
        execution.messages.append(user_msg)
        session.messages.append(user_msg)
        session.executions.append(execution)

        def _record_stream_failure(message: str) -> None:
            # 실패 execution 도 영속화하되, 성공 집계(total_*)는 올리지 않는다
            # (기존 계약 — 실패 스트림은 세션 집계에 반영되지 않는다).
            execution.status = PlaygroundExecutionStatus.FAILED
            execution.error = message
            execution.completed_at = utcnow()
            session.updated_at = utcnow()
            _save_sessions()
            _fire_and_forget(PlaygroundService.save_session_to_db(session))

        # Multi-turn history as LangChain messages (excl. the just-appended user)
        history = _to_lc_messages(session.messages[-11:-1])

        # Inject RAG context if enabled
        rag_sources: list[dict] | None = None
        rag_context_str: str | None = None
        if session.rag_enabled and session.project_id:
            try:
                from services.rag_service import get_project_context_with_sources

                k = (
                    request.rag_k
                    if getattr(request, "rag_k", None)
                    else getattr(session, "rag_k", None) or 5
                )
                force_hybrid = (
                    request.rag_hybrid_override
                    if getattr(request, "rag_hybrid_override", None) is not None
                    else getattr(session, "rag_hybrid_override", None)
                )
                force_rerank = (
                    request.rag_rerank_override
                    if getattr(request, "rag_rerank_override", None) is not None
                    else getattr(session, "rag_rerank_override", None)
                )
                include_shared = (
                    request.rag_include_shared
                    if getattr(request, "rag_include_shared", None) is not None
                    else bool(getattr(session, "rag_include_shared", False))
                )
                rag_context_str, rag_sources = await get_project_context_with_sources(
                    project_id=session.project_id,
                    query=request.prompt,
                    k=k,
                    include_shared=include_shared,
                    force_hybrid=force_hybrid,
                    force_rerank=force_rerank,
                )
            except Exception as e:
                logger.warning("RAG context retrieval failed: %s", e)

        # Choose streaming path vs tool-enabled path
        enabled_tools = request.tools or session.enabled_tools or []
        temperature = request.temperature or session.temperature
        max_tokens = request.max_tokens or session.max_tokens

        full_response = ""
        token_info: dict | None = None

        # Compose once — shared by streaming and tool-enabled branches.
        effective_system_prompt = build_effective_system_prompt(session)
        usage_context = _playground_usage_context(
            session,
            metadata={"tools_enabled": bool(enabled_tools), "streaming": True},
            llm_access=llm_access,
        )

        # 실제 성공한 모델. fallback retry가 다른 모델로 성공하면 갱신되며,
        # 비용/토큰 추정은 session.model이 아니라 이 값으로 계산한다.
        resolved_model = session.model

        try:
            if enabled_tools:
                # Tool-enabled: single-shot invoke_with_tools, yield final answer.
                resp = await _invoke_with_model_fallback(
                    session,
                    LLMService.invoke_with_tools,
                    prompt=request.prompt,
                    tools=enabled_tools,
                    system_prompt=effective_system_prompt,
                    temperature=temperature,
                    max_tokens=max_tokens,
                    context=request.context or None,
                    history=history,
                    rag_context=rag_context_str,
                    working_directory=session.working_directory,
                    usage_context=usage_context,
                )
                resolved_model = resp.model or session.model
                full_response = _coerce_llm_content(resp.content)
                yield full_response
                token_info = {
                    "input_tokens": resp.input_tokens,
                    "output_tokens": resp.output_tokens,
                }
                # Emit tool call/result sentinels so clients can surface them.
                for tc, tr in zip(resp.tool_calls, resp.tool_results, strict=False):
                    yield f"\n\n__TOOL_CALL__{json.dumps({'call': tc, 'result': tr}, ensure_ascii=False)}"
            else:
                # Non-tools: same stale-model fallback as the non-streaming
                # path, but only while nothing has been emitted yet — once a
                # chunk reached the client a retry would duplicate content, so
                # a later error is surfaced as-is. session.model is never
                # rewritten (the retry is execution-scoped).
                attempt_model = session.model
                retried = False
                while True:
                    error: Exception | None = None
                    error_chunk = ""
                    try:
                        async for chunk, info in LLMService.stream_with_tokens(
                            prompt=request.prompt,
                            model_id=attempt_model,
                            system_prompt=effective_system_prompt,
                            temperature=temperature,
                            max_tokens=max_tokens,
                            context=request.context or None,
                            history=history,
                            rag_context=rag_context_str,
                            usage_context=usage_context,
                        ):
                            if info:
                                if info.get("error"):
                                    # Structured error sentinel from the stream
                                    error = Exception(str(info.get("message") or chunk))
                                    error_chunk = chunk
                                    break
                                token_info = info
                            elif chunk:
                                full_response += chunk
                                yield chunk
                    except LLMRuntimeResolutionError as exc:
                        # Resolver rejects on first iteration — raised raw, not
                        # wrapped in the error sentinel.
                        error = exc
                        error_chunk = f"\n\n[Error: {exc}]"

                    if error is None:
                        resolved_model = attempt_model
                        break

                    fallback_model = (
                        None
                        if (retried or full_response)
                        else _safe_playground_fallback_model(attempt_model, usage_context)
                    )
                    if not fallback_model or not _is_inaccessible_model_error(error):
                        # Surface plain text to user (no retry available)
                        _record_stream_failure(str(error))
                        yield error_chunk
                        return

                    logger.warning(
                        "playground_stream_model_inaccessible_retry",
                        extra={"stale_model": attempt_model, "fallback_model": fallback_model},
                    )
                    attempt_model = fallback_model
                    retried = True

            # Calculate token usage
            if token_info:
                input_tokens = token_info.get("input_tokens", 0)
                output_tokens = token_info.get("output_tokens", 0)
            else:
                input_tokens = estimate_tokens(request.prompt, resolved_model)
                output_tokens = estimate_tokens(full_response, resolved_model)

            total_tokens = input_tokens + output_tokens
            cost = calculate_cost(input_tokens, output_tokens, resolved_model)

            # Persist assistant message
            assistant_msg = PlaygroundMessage(
                role="assistant",
                content=full_response,
                tokens=output_tokens,
                rag_sources=rag_sources,
            )
            session.messages.append(assistant_msg)

            # Finalize the execution record with the resolved-model attribution.
            execution.result = full_response
            execution.status = PlaygroundExecutionStatus.COMPLETED
            execution.resolved_model = resolved_model
            execution.input_tokens = input_tokens
            execution.output_tokens = output_tokens
            execution.total_tokens = total_tokens
            execution.cost = cost
            execution.completed_at = utcnow()

            session.total_executions += 1
            session.total_tokens += total_tokens
            session.total_cost += cost
            session.updated_at = utcnow()
            _save_sessions()
            _fire_and_forget(PlaygroundService.save_session_to_db(session))

            if rag_sources:
                yield f"\n\n__RAG_SOURCES__{json.dumps(rag_sources, ensure_ascii=False)}"

        except Exception as e:
            # 비-tools 루프에서 이미 finalize 된 실패는 여기로 오지 않지만,
            # tools 분기 등에서 RUNNING 인 채 떨어진 예외는 여기서 한 번만 마감한다.
            if execution.status == PlaygroundExecutionStatus.RUNNING:
                _record_stream_failure(str(e))
            yield f"\n\n[Error: {str(e)}]"

    # ─────────────────────────────────────────────────────────────
    # Tool Testing
    # ─────────────────────────────────────────────────────────────

    @staticmethod
    async def test_tool(request: PlaygroundToolTest) -> dict[str, Any]:
        """Test a specific tool with given arguments."""
        from services.playground_tools import execute_tool

        tool = PLAYGROUND_TOOLS.get(request.tool_name)
        if not tool:
            return {
                "success": False,
                "error": f"Tool '{request.tool_name}' not found",
            }

        if request.mock_response:
            # Return mock response
            return {
                "success": True,
                "tool": request.tool_name,
                "arguments": request.arguments,
                "result": _generate_mock_tool_result(request.tool_name, request.arguments),
                "mock": True,
            }

        # Actually execute the tool
        try:
            result = await execute_tool(
                request.tool_name,
                request.arguments,
                working_directory=request.working_directory,
            )
            return {
                "success": result.get("success", False),
                "tool": request.tool_name,
                "arguments": request.arguments,
                "result": result,
                "working_directory": request.working_directory,
                "mock": False,
            }
        except Exception as e:
            return {
                "success": False,
                "tool": request.tool_name,
                "arguments": request.arguments,
                "error": str(e),
                "mock": False,
            }

    @staticmethod
    def get_available_tools() -> list[dict[str, Any]]:
        """Get list of available tools for playground."""
        return list(PLAYGROUND_TOOLS.values())

    # ─────────────────────────────────────────────────────────────
    # Comparison
    # ─────────────────────────────────────────────────────────────

    @staticmethod
    async def compare(
        request: PlaygroundCompareRequest,
        *,
        user_id: str | None = None,
        llm_access: LLMAccessResponse | None = None,
    ) -> PlaygroundCompareResult:
        """Compare multiple agents on the same prompt.

        The temporary sessions are owned by ``user_id`` so that, for the brief
        window they live in the registry, they are not ownerless (which would
        otherwise be admin-visible scratch data). ``llm_access`` is forwarded so
        the LLM spend is attributed and entitlement-gated like any other
        execution instead of running as an anonymous call.
        """
        results = []

        for agent_id in request.agents:
            # Create temporary session for each agent
            temp_session = PlaygroundSession(
                agent_id=agent_id,
                user_id=user_id,
            )
            _sessions[temp_session.id] = temp_session

            try:
                exec_request = PlaygroundExecuteRequest(
                    prompt=request.prompt,
                    context=request.context,
                )
                execution = await PlaygroundService.execute(
                    temp_session.id,
                    exec_request,
                    llm_access=llm_access,
                )
                results.append(execution)
            finally:
                # Clean up temporary session
                _sessions.pop(temp_session.id, None)

        # Calculate comparison metrics
        metrics = {
            "fastest": min(results, key=lambda r: r.total_latency_ms).agent_id,
            "cheapest": min(results, key=lambda r: r.cost).agent_id,
            "shortest_response": min(results, key=lambda r: r.output_tokens).agent_id,
            "longest_response": max(results, key=lambda r: r.output_tokens).agent_id,
        }

        return PlaygroundCompareResult(
            prompt=request.prompt,
            results=results,
            comparison_metrics=metrics,
        )

    # ─────────────────────────────────────────────────────────────
    # History
    # ─────────────────────────────────────────────────────────────

    @staticmethod
    def delete_message(session_id: str, message_id: str) -> bool:
        """Delete a specific message from a session."""
        _load_sessions()
        session = _sessions.get(session_id)
        if not session:
            return False

        original_len = len(session.messages)
        session.messages = [m for m in session.messages if m.id != message_id]

        if len(session.messages) == original_len:
            return False  # Message not found

        session.updated_at = utcnow()
        _save_sessions()
        _fire_and_forget(PlaygroundService.save_session_to_db(session))
        return True

    @staticmethod
    def clear_session_history(session_id: str) -> bool:
        """Clear conversation history for a session."""
        _load_sessions()  # Ensure sessions are loaded
        session = _sessions.get(session_id)
        if not session:
            return False

        session.messages = []
        session.executions = []
        session.updated_at = utcnow()
        _save_sessions()  # Persist to file
        _fire_and_forget(PlaygroundService.save_session_to_db(session))
        return True

    @staticmethod
    def get_execution_history(
        session_id: str,
        limit: int = 50,
    ) -> list[PlaygroundExecution]:
        """Get execution history for a session."""
        _load_sessions()  # Ensure sessions are loaded
        session = _sessions.get(session_id)
        if not session:
            return []
        return session.executions[-limit:]

    # ─────────────────────────────────────────────────────────────
    # Async Database Methods
    # ─────────────────────────────────────────────────────────────

    # 모듈 레벨로 들어올린 뒤 같은 이름으로 재부착한다 —
    # `C.f(...)` 호출 형태가 그대로 유지된다.
    _model_to_pydantic = staticmethod(_model_to_pydantic)
    _pydantic_to_db_dict = staticmethod(_pydantic_to_db_dict)
    save_session_to_db = staticmethod(save_session_to_db)
    delete_session_from_db = staticmethod(delete_session_from_db)
    load_sessions_from_db = staticmethod(load_sessions_from_db)
