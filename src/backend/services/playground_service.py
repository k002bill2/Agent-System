"""Playground service for agent testing environment."""

import asyncio
import json
import logging
import os
from collections.abc import AsyncIterator
from datetime import datetime
from pathlib import Path
from typing import Any

from langchain_core.messages import AIMessage, BaseMessage, HumanMessage, SystemMessage

from models.cost import calculate_cost, estimate_tokens
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
from services.llm_service import LLMResponse, LLMService
from utils.time import utcnow

logger = logging.getLogger(__name__)

# ─────────────────────────────────────────────────────────────
# Database Toggle
# ─────────────────────────────────────────────────────────────

USE_DATABASE = os.getenv("USE_DATABASE", "false").lower() == "true"

# Conditional DB imports (only when USE_DATABASE=true)
try:
    from sqlalchemy import select
    from sqlalchemy.ext.asyncio import AsyncSession

    from db.models.playground import PlaygroundSessionModel

    _DB_AVAILABLE = True
except ImportError:
    _DB_AVAILABLE = False
    AsyncSession = Any  # type: ignore
    PlaygroundSessionModel = None  # type: ignore

# Persistent storage file path
STORAGE_DIR = Path(__file__).parent.parent / "data"
SESSIONS_FILE = STORAGE_DIR / "playground_sessions.json"

# In-memory cache
_sessions: dict[str, PlaygroundSession] = {}
_initialized = False

# Default system prompt for playground — Gemini 특화 가이드
DEFAULT_SYSTEM_PROMPT = """당신은 AOS 플랫폼의 AI 어시스턴트입니다.

- 한국어로 답변하고, 코드/명령어/경로는 원문을 그대로 유지합니다.
- project context가 제공되면 그것을 사실의 단일 출처로 삼고,
  컨텍스트에 없는 사실은 추측 대신 "제공된 컨텍스트에 없습니다"라고 명시합니다.
- 답하기 전에 의도와 필요한 정보를 1~2문장으로 정리한 뒤 답변합니다.
- 외부/최신 정보가 필요하면 사용 가능한 도구를 우선 호출합니다.
- 여러 단계가 필요한 작업은 단계별로 명확히 설명합니다."""


def _to_lc_messages(msgs: list[PlaygroundMessage]) -> list[BaseMessage]:
    """
    Convert persisted ``PlaygroundMessage`` history into LangChain messages.

    - ``user`` → ``HumanMessage``
    - ``assistant`` → ``AIMessage``
    - ``tool`` → ``SystemMessage(content="[previous tool call] ...")``
      (Legacy sessions don't carry ``tool_call_id`` required by LangChain
      ``ToolMessage``; absorbing as SystemMessage preserves the information
      without tripping strict tool-call validation on the next turn.)
    - ``system`` role is omitted (handled via explicit ``system_prompt`` arg)
    """
    out: list[BaseMessage] = []
    for m in msgs:
        role = m.role
        content = m.content or ""
        if role == "user":
            out.append(HumanMessage(content=content))
        elif role == "assistant":
            out.append(AIMessage(content=content))
        elif role == "tool":
            out.append(SystemMessage(content=f"[previous tool call] {content}"))
        # other roles (system, etc.) are intentionally dropped
    return out


def _coerce_llm_content(content: Any) -> str:
    """
    Flatten LLM content into a plain string.

    Gemini's multi-part responses can arrive as ``[{type: "text", text: ...},
    {type: "tool_use", ...}]``. We extract only the textual parts so the
    ``tool_use`` blocks don't leak into persisted transcripts as ``str(dict)``.
    """
    if isinstance(content, str):
        return content
    if isinstance(content, list):
        parts: list[str] = []
        for item in content:
            if isinstance(item, dict):
                # Only collect text parts; skip tool_use/tool_result blocks
                if item.get("type") in (None, "text"):
                    text = item.get("text")
                    if text:
                        parts.append(str(text))
            else:
                parts.append(str(item))
        return " ".join(parts)
    return str(content)


def _ensure_storage_dir():
    """Ensure storage directory exists."""
    STORAGE_DIR.mkdir(parents=True, exist_ok=True)


def _load_sessions():
    """Load sessions from persistent storage."""
    global _sessions, _initialized
    if _initialized:
        return

    _ensure_storage_dir()

    if SESSIONS_FILE.exists():
        try:
            with open(SESSIONS_FILE, encoding="utf-8") as f:
                data = json.load(f)
                for session_data in data:
                    # Convert datetime strings back to datetime objects
                    if "created_at" in session_data and isinstance(session_data["created_at"], str):
                        session_data["created_at"] = datetime.fromisoformat(
                            session_data["created_at"]
                        )
                    if "updated_at" in session_data and isinstance(session_data["updated_at"], str):
                        session_data["updated_at"] = datetime.fromisoformat(
                            session_data["updated_at"]
                        )

                    # Convert messages
                    if "messages" in session_data:
                        for msg in session_data["messages"]:
                            if "timestamp" in msg and isinstance(msg["timestamp"], str):
                                msg["timestamp"] = datetime.fromisoformat(msg["timestamp"])

                    # Convert executions
                    if "executions" in session_data:
                        for exec_data in session_data["executions"]:
                            for dt_field in ["created_at", "started_at", "completed_at"]:
                                if dt_field in exec_data and isinstance(exec_data[dt_field], str):
                                    exec_data[dt_field] = datetime.fromisoformat(
                                        exec_data[dt_field]
                                    )
                            if "messages" in exec_data:
                                for msg in exec_data["messages"]:
                                    if "timestamp" in msg and isinstance(msg["timestamp"], str):
                                        msg["timestamp"] = datetime.fromisoformat(msg["timestamp"])

                    session = PlaygroundSession(**session_data)
                    _sessions[session.id] = session
        except Exception as e:
            print(f"Warning: Failed to load playground sessions: {e}")

    _initialized = True


def _save_sessions():
    """Save sessions to persistent storage."""
    _ensure_storage_dir()

    try:
        data = []
        for session in _sessions.values():
            session_dict = session.model_dump()
            # Convert datetime objects to ISO strings for JSON serialization
            if session_dict.get("created_at"):
                session_dict["created_at"] = session_dict["created_at"].isoformat()
            if session_dict.get("updated_at"):
                session_dict["updated_at"] = session_dict["updated_at"].isoformat()

            # Convert messages
            for msg in session_dict.get("messages", []):
                if msg.get("timestamp"):
                    msg["timestamp"] = msg["timestamp"].isoformat()

            # Convert executions
            for exec_data in session_dict.get("executions", []):
                for dt_field in ["created_at", "started_at", "completed_at"]:
                    if exec_data.get(dt_field):
                        exec_data[dt_field] = exec_data[dt_field].isoformat()
                for msg in exec_data.get("messages", []):
                    if msg.get("timestamp"):
                        msg["timestamp"] = msg["timestamp"].isoformat()

            data.append(session_dict)

        with open(SESSIONS_FILE, "w", encoding="utf-8") as f:
            json.dump(data, f, ensure_ascii=False, indent=2)
    except Exception as e:
        print(f"Warning: Failed to save playground sessions: {e}")


# Mock tools for playground
PLAYGROUND_TOOLS = {
    "web_search": {
        "name": "web_search",
        "description": "Search the web for information",
        "parameters": {
            "query": {"type": "string", "description": "Search query"},
            "max_results": {"type": "integer", "description": "Max results", "default": 5},
        },
    },
    "code_execute": {
        "name": "code_execute",
        "description": "Execute code in a sandbox",
        "parameters": {
            "language": {"type": "string", "description": "Programming language"},
            "code": {"type": "string", "description": "Code to execute"},
        },
    },
    "file_read": {
        "name": "file_read",
        "description": "Read a file from the workspace",
        "parameters": {
            "path": {"type": "string", "description": "File path"},
        },
    },
    "file_write": {
        "name": "file_write",
        "description": "Write content to a file",
        "parameters": {
            "path": {"type": "string", "description": "File path"},
            "content": {"type": "string", "description": "Content to write"},
        },
    },
    "api_call": {
        "name": "api_call",
        "description": "Make an HTTP API call",
        "parameters": {
            "method": {"type": "string", "description": "HTTP method"},
            "url": {"type": "string", "description": "URL to call"},
            "body": {"type": "object", "description": "Request body"},
        },
    },
}


def _fire_and_forget(coro) -> None:
    """Schedule a coroutine as fire-and-forget if an event loop is running."""
    try:
        loop = asyncio.get_event_loop()
        if loop.is_running():
            asyncio.create_task(coro)
    except RuntimeError:
        pass


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
    def list_sessions(user_id: str | None = None) -> list[PlaygroundSession]:
        """List playground sessions. If user_id given, return only that user's sessions."""
        _load_sessions()  # Ensure sessions are loaded
        sessions = _sessions.values()
        if user_id:
            # 자신의 세션 + user_id 없는 레거시 세션 포함
            sessions = (s for s in sessions if s.user_id == user_id or s.user_id is None)
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
                    rag_context_str, rag_sources = await get_project_context_with_sources(
                        project_id=session.project_id,
                        query=request.prompt,
                        k=k,
                        force_hybrid=force_hybrid,
                        force_rerank=force_rerank,
                    )
                except Exception as e:
                    logger.warning("RAG context retrieval failed: %s", e)

            # Check if tools are enabled
            enabled_tools = execution.tools_enabled or []

            if enabled_tools:
                # Use tool-enabled LLM invocation
                llm_response: LLMResponse = await LLMService.invoke_with_tools(
                    prompt=request.prompt,
                    tools=enabled_tools,
                    model_id=session.model,
                    system_prompt=session.system_prompt,
                    temperature=execution.temperature,
                    max_tokens=execution.max_tokens,
                    context=request.context or None,
                    history=history,
                    rag_context=rag_context_str,
                    working_directory=session.working_directory,
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
                llm_response = await LLMService.invoke(
                    prompt=request.prompt,
                    model_id=session.model,
                    system_prompt=session.system_prompt,
                    temperature=execution.temperature,
                    max_tokens=execution.max_tokens,
                    context=request.context or None,
                    history=history,
                    rag_context=rag_context_str,
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

        # Add user message to session
        user_msg = PlaygroundMessage(
            role="user",
            content=request.prompt,
        )
        session.messages.append(user_msg)

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
                rag_context_str, rag_sources = await get_project_context_with_sources(
                    project_id=session.project_id,
                    query=request.prompt,
                    k=k,
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

        try:
            if enabled_tools:
                # Tool-enabled: single-shot invoke_with_tools, yield final answer.
                resp = await LLMService.invoke_with_tools(
                    prompt=request.prompt,
                    tools=enabled_tools,
                    model_id=session.model,
                    system_prompt=session.system_prompt,
                    temperature=temperature,
                    max_tokens=max_tokens,
                    context=request.context or None,
                    history=history,
                    rag_context=rag_context_str,
                    working_directory=session.working_directory,
                )
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
                async for chunk, info in LLMService.stream_with_tokens(
                    prompt=request.prompt,
                    model_id=session.model,
                    system_prompt=session.system_prompt,
                    temperature=temperature,
                    max_tokens=max_tokens,
                    context=request.context or None,
                    history=history,
                    rag_context=rag_context_str,
                ):
                    if info:
                        if info.get("error"):
                            # Structured error — surface plain text to user
                            yield chunk
                            return
                        token_info = info
                    elif chunk:
                        full_response += chunk
                        yield chunk

            # Calculate token usage
            if token_info:
                input_tokens = token_info.get("input_tokens", 0)
                output_tokens = token_info.get("output_tokens", 0)
            else:
                input_tokens = estimate_tokens(request.prompt, session.model)
                output_tokens = estimate_tokens(full_response, session.model)

            total_tokens = input_tokens + output_tokens
            cost = calculate_cost(input_tokens, output_tokens, session.model)

            # Persist assistant message
            assistant_msg = PlaygroundMessage(
                role="assistant",
                content=full_response,
                tokens=output_tokens,
                rag_sources=rag_sources,
            )
            session.messages.append(assistant_msg)
            session.total_executions += 1
            session.total_tokens += total_tokens
            session.total_cost += cost
            session.updated_at = utcnow()
            _save_sessions()
            _fire_and_forget(PlaygroundService.save_session_to_db(session))

            if rag_sources:
                yield f"\n\n__RAG_SOURCES__{json.dumps(rag_sources, ensure_ascii=False)}"

        except Exception as e:
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
    async def compare(request: PlaygroundCompareRequest) -> PlaygroundCompareResult:
        """Compare multiple agents on the same prompt."""
        results = []

        for agent_id in request.agents:
            # Create temporary session for each agent
            temp_session = PlaygroundSession(
                agent_id=agent_id,
            )
            _sessions[temp_session.id] = temp_session

            try:
                exec_request = PlaygroundExecuteRequest(
                    prompt=request.prompt,
                    context=request.context,
                )
                execution = await PlaygroundService.execute(temp_session.id, exec_request)
                results.append(execution)
            finally:
                # Clean up temporary session
                del _sessions[temp_session.id]

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

    @staticmethod
    def _model_to_pydantic(model: "PlaygroundSessionModel") -> PlaygroundSession:
        """Convert SQLAlchemy model to Pydantic model."""
        return PlaygroundSession(
            id=model.id,
            name=model.name,
            description=model.description or "",
            user_id=model.user_id,
            project_id=model.project_id,
            working_directory=model.working_directory,
            agent_id=model.agent_id,
            model=model.model or "",
            temperature=model.temperature or 0.7,
            max_tokens=model.max_tokens or 4096,
            system_prompt=model.system_prompt,
            rag_enabled=model.rag_enabled or False,
            rag_k=getattr(model, "rag_k", None) or 5,
            rag_hybrid_override=getattr(model, "rag_hybrid_override", None),
            rag_rerank_override=getattr(model, "rag_rerank_override", None),
            available_tools=model.available_tools or [],
            enabled_tools=model.enabled_tools or [],
            messages=[PlaygroundMessage(**m) for m in (model.messages or [])],
            executions=[PlaygroundExecution(**e) for e in (model.executions or [])],
            total_executions=model.total_executions or 0,
            total_tokens=model.total_tokens or 0,
            total_cost=model.total_cost or 0.0,
            created_at=model.created_at,
            updated_at=model.updated_at,
        )

    @staticmethod
    def _pydantic_to_db_dict(session: PlaygroundSession) -> dict:
        """Convert Pydantic model to dict for DB upsert."""
        return {
            "name": session.name,
            "description": session.description,
            "user_id": session.user_id,
            "project_id": session.project_id,
            "working_directory": session.working_directory,
            "agent_id": session.agent_id,
            "model": session.model,
            "temperature": session.temperature,
            "max_tokens": session.max_tokens,
            "system_prompt": session.system_prompt,
            "rag_enabled": session.rag_enabled,
            "rag_k": session.rag_k,
            "rag_hybrid_override": session.rag_hybrid_override,
            "rag_rerank_override": session.rag_rerank_override,
            "available_tools": session.available_tools,
            "enabled_tools": session.enabled_tools,
            "messages": [m.model_dump(mode="json") for m in session.messages],
            "executions": [e.model_dump(mode="json") for e in session.executions],
            "total_executions": session.total_executions,
            "total_tokens": session.total_tokens,
            "total_cost": session.total_cost,
            "updated_at": utcnow(),
        }

    @staticmethod
    async def save_session_to_db(session: PlaygroundSession) -> None:
        """Save/update a session to the database."""
        if not USE_DATABASE or not _DB_AVAILABLE:
            return
        try:
            from db.database import async_session_factory

            async with async_session_factory() as db:
                result = await db.execute(
                    select(PlaygroundSessionModel).where(PlaygroundSessionModel.id == session.id)
                )
                existing = result.scalar_one_or_none()
                data = PlaygroundService._pydantic_to_db_dict(session)
                if existing:
                    for key, value in data.items():
                        setattr(existing, key, value)
                else:
                    model = PlaygroundSessionModel(
                        id=session.id, **data, created_at=session.created_at
                    )
                    db.add(model)
                await db.commit()
        except Exception:
            logger.warning("Failed to save playground session %s to DB", session.id)

    @staticmethod
    async def delete_session_from_db(session_id: str) -> None:
        """Delete a session from the database."""
        if not USE_DATABASE or not _DB_AVAILABLE:
            return
        try:
            from db.database import async_session_factory

            async with async_session_factory() as db:
                result = await db.execute(
                    select(PlaygroundSessionModel).where(PlaygroundSessionModel.id == session_id)
                )
                existing = result.scalar_one_or_none()
                if existing:
                    await db.delete(existing)
                    await db.commit()
        except Exception:
            logger.warning("Failed to delete playground session %s from DB", session_id)

    @staticmethod
    async def load_sessions_from_db() -> None:
        """Load sessions from DB into in-memory cache (startup sync)."""
        if not USE_DATABASE or not _DB_AVAILABLE:
            return
        try:
            from db.database import async_session_factory

            global _sessions, _initialized
            async with async_session_factory() as db:
                result = await db.execute(select(PlaygroundSessionModel))
                models = result.scalars().all()
                for model in models:
                    if model.id not in _sessions:
                        _sessions[model.id] = PlaygroundService._model_to_pydantic(model)
                _initialized = True
        except Exception:
            logger.warning("Failed to load playground sessions from DB")


# ─────────────────────────────────────────────────────────────
# Helper Functions
# ─────────────────────────────────────────────────────────────


def _generate_mock_response(
    prompt: str,
    agent_id: str | None,
    tools: list[str],
) -> str:
    """Generate a mock LLM response for testing."""
    agent_name = agent_id or "default agent"

    if "code" in prompt.lower() or "function" in prompt.lower():
        return f"""I'll help you with that coding task. Here's a solution:

```python
def example_function():
    # Implementation based on your request
    result = process_data()
    return result
```

This implementation follows best practices and handles edge cases. Let me know if you need any modifications!

[Generated by {agent_name} in playground mode]"""

    elif "explain" in prompt.lower() or "what is" in prompt.lower():
        return f"""Great question! Let me explain:

The concept you're asking about involves several key components:

1. **First Component**: This handles the initial processing
2. **Second Component**: This manages the core logic
3. **Third Component**: This produces the final output

Each component works together to achieve the desired result. Would you like me to elaborate on any specific part?

[Generated by {agent_name} in playground mode]"""

    else:
        return f"""I understand your request. Here's my response:

Based on the context provided, I would recommend the following approach:

- Start by analyzing the requirements
- Break down the task into smaller steps
- Implement each step carefully
- Test and validate the results

Available tools for this session: {", ".join(tools) if tools else "None"}

Is there anything specific you'd like me to focus on?

[Generated by {agent_name} in playground mode]"""


def _generate_mock_tool_result(tool_name: str, arguments: dict[str, Any]) -> Any:
    """Generate mock tool execution result."""
    if tool_name == "web_search":
        return {
            "results": [
                {"title": "Result 1", "url": "https://example.com/1", "snippet": "..."},
                {"title": "Result 2", "url": "https://example.com/2", "snippet": "..."},
            ],
            "total": 2,
        }
    elif tool_name == "code_execute":
        return {
            "output": "Hello, World!",
            "exit_code": 0,
            "execution_time_ms": 50,
        }
    elif tool_name == "file_read":
        return {
            "content": "# Sample file content\nThis is a test file.",
            "size": 42,
        }
    elif tool_name == "file_write":
        return {
            "success": True,
            "path": arguments.get("path", "unknown"),
            "bytes_written": len(arguments.get("content", "")),
        }
    elif tool_name == "api_call":
        return {
            "status": 200,
            "body": {"message": "Success"},
            "headers": {"content-type": "application/json"},
        }
    return {"result": "Mock result"}


# Note: _calculate_cost removed - use models.cost.calculate_cost instead
