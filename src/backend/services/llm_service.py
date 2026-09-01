"""LLM Service for unified access to multiple LLM providers."""

import json
import os
import time
from collections.abc import AsyncIterator
from typing import Any

from langchain_core.messages import (
    BaseMessage,
    HumanMessage,
    SystemMessage,
    ToolMessage,
)

from models.llm_access import LLMAccessResponse
from models.llm_models import LLMModelRegistry
from models.llm_usage import (
    LLMRuntimeMode,
    LLMUsageMeasurementMethod,
    LLMUsageRecordCreate,
    LLMUsageStatus,
)
from services.llm_runtime_resolver import (
    LLMRuntimeRequest,
    LLMRuntimeResolution,
    LLMRuntimeResolutionError,
    resolve_llm_runtime,
)
from services.llm_usage_ledger_service import (
    LLMUsageQuotaExceededError,
    enforce_usage_quota_preflight_best_effort,
    record_usage_best_effort,
)


def _runtime_mode_for_provider(provider: str) -> LLMRuntimeMode:
    if provider.endswith("_cli"):
        return LLMRuntimeMode.CLI
    if provider == "ollama":
        return LLMRuntimeMode.LOCAL
    return LLMRuntimeMode.API


def _usage_context_value(usage_context: dict[str, Any] | None, key: str) -> Any:
    if not usage_context:
        return None
    value = usage_context.get(key)
    if hasattr(value, "value"):
        return value.value
    return value


def _usage_context_metadata(usage_context: dict[str, Any] | None) -> dict[str, Any]:
    if not usage_context:
        return {}
    metadata = usage_context.get("metadata")
    return metadata if isinstance(metadata, dict) else {}


def _usage_context_access(
    usage_context: dict[str, Any] | None,
) -> LLMAccessResponse | None:
    if not usage_context:
        return None
    access = usage_context.get("llm_access")
    if isinstance(access, LLMAccessResponse):
        return access
    if isinstance(access, dict):
        return LLMAccessResponse.model_validate(access)
    return None


def _usage_context_with_runtime_resolution(
    usage_context: dict[str, Any] | None,
    resolution: LLMRuntimeResolution,
) -> dict[str, Any] | None:
    if usage_context is None:
        return None
    updated = dict(usage_context)
    metadata = dict(_usage_context_metadata(usage_context))
    metadata.update(resolution.usage_metadata())
    updated["metadata"] = metadata
    return updated


def _resolve_runtime_from_context(
    model_id: str,
    usage_context: dict[str, Any] | None,
) -> tuple[str, str, dict[str, Any] | None]:
    access = _usage_context_access(usage_context)
    source = _usage_context_value(usage_context, "source")
    if not access or not source:
        try:
            resolved_model = model_id or LLMModelRegistry.get_default()
        except LookupError as e:
            # 구성 provider 가 미지이거나 enabled 모델 0개 — 이 모듈의 실패
            # 계약 타입(ValueError, cf. Unknown model/Model disabled)으로 번역.
            raise ValueError(str(e)) from e
        provider = LLMModelRegistry.get_provider(resolved_model)
        return resolved_model, provider.value if provider else "unknown", usage_context

    resolution = resolve_llm_runtime(
        access,
        LLMRuntimeRequest(
            user_id=_usage_context_value(usage_context, "user_id"),
            organization_id=_usage_context_value(usage_context, "organization_id"),
            source=source,
            requested_model_id=model_id or None,
        ),
    )
    return (
        resolution.model_id,
        resolution.provider,
        _usage_context_with_runtime_resolution(usage_context, resolution),
    )


def _estimate_message_tokens(messages: list[BaseMessage], max_tokens: int) -> int:
    input_tokens = sum(len(str(m.content).split()) for m in messages if hasattr(m, "content")) * 2
    return input_tokens + max(max_tokens, 0)


async def _enforce_quota_preflight_from_context(
    usage_context: dict[str, Any] | None,
    messages: list[BaseMessage],
    max_tokens: int,
) -> None:
    await enforce_usage_quota_preflight_best_effort(
        user_id=_usage_context_value(usage_context, "user_id"),
        organization_id=_usage_context_value(usage_context, "organization_id"),
        estimated_tokens=_estimate_message_tokens(messages, max_tokens),
    )


async def _record_usage_from_context(
    *,
    usage_context: dict[str, Any] | None,
    provider: str,
    model_id: str,
    input_tokens: int | None,
    output_tokens: int | None,
    latency_ms: int | None,
    measurement_method: LLMUsageMeasurementMethod,
    status: LLMUsageStatus,
    started_at: float,
    error_message: str | None = None,
) -> None:
    source = _usage_context_value(usage_context, "source")
    if not source:
        return

    from datetime import UTC, datetime

    started_dt = datetime.fromtimestamp(started_at, tz=UTC)
    completed_dt = datetime.now(tz=UTC)
    await record_usage_best_effort(
        LLMUsageRecordCreate(
            user_id=_usage_context_value(usage_context, "user_id"),
            organization_id=_usage_context_value(usage_context, "organization_id"),
            provider=provider,
            mode=_runtime_mode_for_provider(provider),
            source=source,
            model=model_id,
            input_tokens=input_tokens,
            output_tokens=output_tokens,
            measurement_method=measurement_method,
            estimated_cost_usd=None,
            status=status,
            session_id=_usage_context_value(usage_context, "session_id"),
            task_id=_usage_context_value(usage_context, "task_id"),
            analysis_id=_usage_context_value(usage_context, "analysis_id"),
            project_id=_usage_context_value(usage_context, "project_id"),
            latency_ms=latency_ms,
            error_message=error_message,
            metadata=_usage_context_metadata(usage_context),
            started_at=started_dt,
            completed_at=completed_dt,
        )
    )


class LLMResponse:
    """Response from LLM invocation."""

    def __init__(
        self,
        content: str,
        input_tokens: int = 0,
        output_tokens: int = 0,
        latency_ms: int = 0,
        model: str = "",
        provider: str = "",
        tool_calls: list[dict[str, Any]] | None = None,
        tool_results: list[dict[str, Any]] | None = None,
    ):
        self.content = content
        self.input_tokens = input_tokens
        self.output_tokens = output_tokens
        self.total_tokens = input_tokens + output_tokens
        self.latency_ms = latency_ms
        self.model = model
        self.provider = provider
        self.tool_calls = tool_calls or []
        self.tool_results = tool_results or []

    @property
    def cost(self) -> float:
        """Calculate cost based on model pricing."""
        pricing = LLMModelRegistry.get_pricing(self.model)
        input_cost = (self.input_tokens / 1000) * pricing["input"]
        output_cost = (self.output_tokens / 1000) * pricing["output"]
        return round(input_cost + output_cost, 6)


def _build_messages(
    system_prompt: str | None,
    history: list[BaseMessage] | None,
    prompt: str,
    rag_context: str | None = None,
    extra_context: dict[str, Any] | None = None,
) -> list[BaseMessage]:
    """
    Build a LangChain message sequence for LLM invocation.

    Layout:
        1. SystemMessage: base system prompt (persona, rules)
        2. SystemMessage: RAG / project context (separated so the model treats
           it as authoritative context, not user input)
        3. <history>: previous HumanMessage / AIMessage / ToolMessage turns
        4. HumanMessage: current user prompt (with optional inline extra_context)
    """
    messages: list[BaseMessage] = []

    if system_prompt:
        messages.append(SystemMessage(content=system_prompt))

    if rag_context:
        messages.append(
            SystemMessage(
                content=(
                    "## Relevant project context\n"
                    "Use the following retrieved context as the source of truth "
                    "for any project-specific facts. If the answer isn't in the "
                    "context, say so explicitly instead of guessing.\n\n"
                    f"{rag_context}"
                )
            )
        )

    if history:
        messages.extend(history)

    if extra_context:
        ctx_str = "\n".join(f"- {k}: {v}" for k, v in extra_context.items())
        messages.append(HumanMessage(content=f"Additional context:\n{ctx_str}\n\nUser: {prompt}"))
    else:
        messages.append(HumanMessage(content=prompt))

    return messages


class LLMService:
    """Service for invoking LLMs from different providers."""

    _instances: dict[str, Any] = {}

    @classmethod
    def _get_llm(
        cls,
        model_id: str,
        temperature: float = 0.7,
        max_tokens: int = 4096,
    ) -> Any:
        """Get or create LLM instance for the specified model.

        Gates on the live registry (DB-aware), not a static snapshot: a model
        must be registered AND enabled to build. DB-discovered models carry
        enough metadata (provider + id) to build without a code entry.
        """
        if not model_id:
            try:
                model_id = LLMModelRegistry.get_default()
            except LookupError as e:
                # 이 메서드의 기존 실패 계약(ValueError)으로 번역한다.
                raise ValueError(str(e)) from e
        model = LLMModelRegistry.get_by_id(model_id)
        if model is None:
            raise ValueError(f"Unknown model: {model_id}")
        if not model.is_enabled:
            raise ValueError(f"Model disabled: {model_id}")

        provider = model.provider.value
        model_name = model.id
        cache_key = f"{model_id}:{temperature}:{max_tokens}"

        if cache_key in cls._instances:
            return cls._instances[cache_key]

        llm = None

        if provider == "google":
            from langchain_google_genai import ChatGoogleGenerativeAI

            api_key = os.getenv("GOOGLE_API_KEY")
            if not api_key:
                raise ValueError("GOOGLE_API_KEY not set")
            llm = ChatGoogleGenerativeAI(
                model=model_name,
                temperature=temperature,
                max_output_tokens=max_tokens,
                google_api_key=api_key,
            )

        elif provider == "anthropic":
            from langchain_anthropic import ChatAnthropic

            api_key = os.getenv("ANTHROPIC_API_KEY")
            if not api_key:
                raise ValueError("ANTHROPIC_API_KEY not set")
            llm = ChatAnthropic(
                model=model_name,
                temperature=temperature,
                max_tokens=max_tokens,
                api_key=api_key,
            )

        elif provider == "openai":
            from langchain_openai import ChatOpenAI

            api_key = os.getenv("OPENAI_API_KEY")
            if not api_key:
                raise ValueError("OPENAI_API_KEY not set")
            llm = ChatOpenAI(
                model=model_name,
                temperature=temperature,
                max_tokens=max_tokens,
                api_key=api_key,
            )

        elif provider == "codex_cli":
            from services.codex_cli_chat_model import CodexCliChatModel

            llm = CodexCliChatModel(model_name=model_name)

        elif provider == "claude_cli":
            from services.claude_cli_chat_model import ClaudeCliChatModel

            llm = ClaudeCliChatModel(model_name=model_name)

        elif provider == "ollama":
            from langchain_ollama import ChatOllama

            llm = ChatOllama(
                model=model_name,
                temperature=temperature,
                num_predict=max_tokens,
                base_url=os.getenv("OLLAMA_BASE_URL", "http://localhost:11434"),
            )

        else:
            raise ValueError(f"Unsupported provider: {provider}")

        cls._instances[cache_key] = llm
        return llm

    @classmethod
    async def invoke(
        cls,
        prompt: str,
        model_id: str = "",
        system_prompt: str | None = None,
        temperature: float = 0.7,
        max_tokens: int = 4096,
        context: dict[str, Any] | None = None,
        history: list[BaseMessage] | None = None,
        rag_context: str | None = None,
        usage_context: dict[str, Any] | None = None,
    ) -> LLMResponse:
        """
        Invoke an LLM with the given prompt.

        Args:
            prompt: The user's prompt (current turn).
            model_id: Model identifier (e.g., "gemini-3-flash-preview").
            system_prompt: Optional system prompt.
            temperature: Sampling temperature.
            max_tokens: Maximum output tokens.
            context: Optional extra-context dict inlined above the user prompt.
            history: Prior turns as LangChain messages (enables multi-turn).
            rag_context: Retrieved project context injected as a separate
                SystemMessage so the model treats it as authoritative.
        """
        model_id, provider, usage_context = _resolve_runtime_from_context(
            model_id,
            usage_context,
        )

        start_time = time.time()

        try:
            messages = _build_messages(
                system_prompt=system_prompt,
                history=history,
                prompt=prompt,
                rag_context=rag_context,
                extra_context=context,
            )
            await _enforce_quota_preflight_from_context(usage_context, messages, max_tokens)

            llm = cls._get_llm(model_id, temperature, max_tokens)

            # Invoke LLM
            response = await llm.ainvoke(messages)

            latency_ms = int((time.time() - start_time) * 1000)

            # Extract token usage if available
            input_tokens = 0
            output_tokens = 0
            measurement_method = LLMUsageMeasurementMethod.UNKNOWN

            if hasattr(response, "usage_metadata") and response.usage_metadata:
                input_tokens = response.usage_metadata.get("input_tokens", 0)
                output_tokens = response.usage_metadata.get("output_tokens", 0)
                measurement_method = LLMUsageMeasurementMethod.PROVIDER_METADATA
            elif hasattr(response, "response_metadata"):
                metadata = response.response_metadata
                if "usage" in metadata:
                    usage = metadata["usage"]
                    input_tokens = usage.get("input_tokens", usage.get("prompt_tokens", 0))
                    output_tokens = usage.get("output_tokens", usage.get("completion_tokens", 0))
                    measurement_method = LLMUsageMeasurementMethod.PROVIDER_METADATA

            # Estimate if not available (sum across all messages — history +
            # rag + current turn — to reflect what the model actually saw)
            if input_tokens == 0:
                approx = sum(len(str(m.content).split()) for m in messages if hasattr(m, "content"))
                input_tokens = approx * 2
                measurement_method = LLMUsageMeasurementMethod.ESTIMATED
            if output_tokens == 0:
                output_tokens = len(str(response.content).split()) * 2
                measurement_method = LLMUsageMeasurementMethod.ESTIMATED

            await _record_usage_from_context(
                usage_context=usage_context,
                provider=provider,
                model_id=model_id,
                input_tokens=input_tokens,
                output_tokens=output_tokens,
                latency_ms=latency_ms,
                measurement_method=measurement_method,
                status=LLMUsageStatus.SUCCESS,
                started_at=start_time,
            )

            return LLMResponse(
                content=response.content,
                input_tokens=input_tokens,
                output_tokens=output_tokens,
                latency_ms=latency_ms,
                model=model_id,
                provider=provider,
            )

        except (LLMUsageQuotaExceededError, LLMRuntimeResolutionError):
            raise
        except Exception as e:
            latency_ms = int((time.time() - start_time) * 1000)
            await _record_usage_from_context(
                usage_context=usage_context,
                provider=provider,
                model_id=model_id,
                input_tokens=None,
                output_tokens=None,
                latency_ms=latency_ms,
                measurement_method=LLMUsageMeasurementMethod.UNKNOWN,
                status=LLMUsageStatus.ERROR,
                started_at=start_time,
                error_message=str(e),
            )
            raise RuntimeError(f"LLM invocation failed ({model_id}): {str(e)}")

    @classmethod
    async def stream(
        cls,
        prompt: str,
        model_id: str = "",
        system_prompt: str | None = None,
        temperature: float = 0.7,
        max_tokens: int = 4096,
        context: dict[str, Any] | None = None,
        history: list[BaseMessage] | None = None,
        rag_context: str | None = None,
    ) -> AsyncIterator[str]:
        """Stream response from LLM. See ``invoke`` for argument semantics."""
        try:
            llm = cls._get_llm(model_id, temperature, max_tokens)

            messages = _build_messages(
                system_prompt=system_prompt,
                history=history,
                prompt=prompt,
                rag_context=rag_context,
                extra_context=context,
            )

            async for chunk in llm.astream(messages):
                if hasattr(chunk, "content") and chunk.content:
                    yield chunk.content

        except Exception as e:
            yield f"\n\n[Error: {str(e)}]"

    @classmethod
    async def stream_with_tokens(
        cls,
        prompt: str,
        model_id: str = "",
        system_prompt: str | None = None,
        temperature: float = 0.7,
        max_tokens: int = 4096,
        context: dict[str, Any] | None = None,
        history: list[BaseMessage] | None = None,
        rag_context: str | None = None,
        usage_context: dict[str, Any] | None = None,
    ) -> AsyncIterator[tuple[str, dict | None]]:
        """
        Stream response from LLM with token information.

        Uses astream_events() to capture token usage at the end.

        Yields:
            Tuple of (chunk_text, token_info).
            ``token_info`` is None for intermediate chunks; the final yield
            carries usage data, or ``{"error": True, "message": ...}`` on
            failure so callers can distinguish error payloads from streamed
            content.
        """
        model_id, provider, usage_context = _resolve_runtime_from_context(
            model_id,
            usage_context,
        )
        start_time = time.time()

        try:
            messages = _build_messages(
                system_prompt=system_prompt,
                history=history,
                prompt=prompt,
                rag_context=rag_context,
                extra_context=context,
            )
            await _enforce_quota_preflight_from_context(usage_context, messages, max_tokens)

            llm = cls._get_llm(model_id, temperature, max_tokens)

            token_info = None
            measurement_method = LLMUsageMeasurementMethod.UNKNOWN

            # Use astream_events for token tracking
            async for event in llm.astream_events(messages, version="v2"):
                event_type = event.get("event", "")

                if event_type == "on_chat_model_stream":
                    # Streaming chunk
                    chunk = event.get("data", {}).get("chunk")
                    if chunk and hasattr(chunk, "content") and chunk.content:
                        yield chunk.content, None

                elif event_type == "on_chat_model_end":
                    # Final event with token info
                    output = event.get("data", {}).get("output")
                    if output:
                        # Extract token info from usage_metadata or response_metadata
                        if hasattr(output, "usage_metadata") and output.usage_metadata:
                            usage = output.usage_metadata
                            if isinstance(usage, dict):
                                token_info = {
                                    "input_tokens": usage.get("input_tokens", 0),
                                    "output_tokens": usage.get("output_tokens", 0),
                                    "model": model_id,
                                }
                                measurement_method = LLMUsageMeasurementMethod.PROVIDER_METADATA
                            else:
                                token_info = {
                                    "input_tokens": getattr(usage, "input_tokens", 0),
                                    "output_tokens": getattr(usage, "output_tokens", 0),
                                    "model": model_id,
                                }
                                measurement_method = LLMUsageMeasurementMethod.PROVIDER_METADATA
                        elif hasattr(output, "response_metadata"):
                            metadata = output.response_metadata
                            usage = metadata.get("usage", {})
                            if usage:
                                token_info = {
                                    "input_tokens": usage.get("input_tokens", 0),
                                    "output_tokens": usage.get("output_tokens", 0),
                                    "model": model_id,
                                }
                                measurement_method = LLMUsageMeasurementMethod.PROVIDER_METADATA

            # Yield final token info
            if token_info:
                latency_ms = int((time.time() - start_time) * 1000)
                await _record_usage_from_context(
                    usage_context=usage_context,
                    provider=provider,
                    model_id=model_id,
                    input_tokens=token_info.get("input_tokens", 0),
                    output_tokens=token_info.get("output_tokens", 0),
                    latency_ms=latency_ms,
                    measurement_method=measurement_method,
                    status=LLMUsageStatus.SUCCESS,
                    started_at=start_time,
                )
                yield "", token_info

        except (LLMUsageQuotaExceededError, LLMRuntimeResolutionError):
            raise
        except Exception as e:
            latency_ms = int((time.time() - start_time) * 1000)
            await _record_usage_from_context(
                usage_context=usage_context,
                provider=provider,
                model_id=model_id,
                input_tokens=None,
                output_tokens=None,
                latency_ms=latency_ms,
                measurement_method=LLMUsageMeasurementMethod.UNKNOWN,
                status=LLMUsageStatus.ERROR,
                started_at=start_time,
                error_message=str(e),
            )
            # Emit error with structured sentinel so callers can distinguish
            # an error payload from a streamed content chunk.
            yield f"\n\n[Error: {str(e)}]", {"error": True, "message": str(e)}

    @classmethod
    def get_available_models(cls) -> list[dict[str, Any]]:
        """Get list of available models.

        Uses the central LLMModelRegistry.
        """
        return LLMModelRegistry.get_available_models()

    @classmethod
    def get_default_model(cls) -> str:
        """Get the default model based on available API keys.

        Uses the central LLMModelRegistry.

        Raises:
            ValueError: 구성 provider 가 미지이거나 enabled 모델이 0개
                (registry fail-closed 를 서비스 계약 타입으로 번역).
        """
        try:
            return LLMModelRegistry.get_default()
        except LookupError as e:
            raise ValueError(str(e)) from e

    @classmethod
    async def invoke_with_tools(
        cls,
        prompt: str,
        tools: list[str],
        model_id: str = "",
        system_prompt: str | None = None,
        temperature: float = 0.7,
        max_tokens: int = 4096,
        context: dict[str, Any] | None = None,
        max_tool_iterations: int = 15,
        working_directory: str | None = None,
        history: list[BaseMessage] | None = None,
        rag_context: str | None = None,
        usage_context: dict[str, Any] | None = None,
    ) -> LLMResponse:
        """
        Invoke an LLM with tool support.

        The LLM can call tools, and this method will execute them
        and return the final response. When the iteration budget is exhausted
        a single forced-final round is performed (without tools) so callers
        always receive a real answer instead of a sentinel string.

        See ``invoke`` for ``history`` / ``rag_context`` semantics.
        """
        from services.playground_tools import TOOL_DEFINITIONS, execute_tool

        model_id, provider, usage_context = _resolve_runtime_from_context(
            model_id,
            usage_context,
        )

        start_time = time.time()
        total_input_tokens = 0
        total_output_tokens = 0
        measurement_method = LLMUsageMeasurementMethod.UNKNOWN
        all_tool_calls: list[dict[str, Any]] = []
        all_tool_results: list[dict[str, Any]] = []

        default_tool_sys = (
            "You are a helpful AI assistant. You have access to tools that you can use "
            "to help answer questions. Use tools when they would help provide accurate "
            "and current information. After using tools, synthesize the results into a "
            "helpful response."
        )

        try:
            messages = _build_messages(
                system_prompt=system_prompt or default_tool_sys,
                history=history,
                prompt=prompt,
                rag_context=rag_context,
                extra_context=context,
            )
            await _enforce_quota_preflight_from_context(usage_context, messages, max_tokens)

            llm = cls._get_llm(model_id, temperature, max_tokens)

            # Filter tool definitions to only enabled tools
            enabled_tool_defs = [t for t in TOOL_DEFINITIONS if t["name"] in tools]

            # Bind tools to LLM if any are enabled
            if enabled_tool_defs:
                llm_with_tools = llm.bind_tools(enabled_tool_defs)
            else:
                llm_with_tools = llm

            # Iterate until we get a final response or hit max iterations
            for _iteration in range(max_tool_iterations):
                # Invoke LLM
                response = await llm_with_tools.ainvoke(messages)

                # Track tokens
                if hasattr(response, "usage_metadata") and response.usage_metadata:
                    total_input_tokens += response.usage_metadata.get("input_tokens", 0)
                    total_output_tokens += response.usage_metadata.get("output_tokens", 0)
                    measurement_method = LLMUsageMeasurementMethod.PROVIDER_METADATA

                # Check for tool calls
                tool_calls = getattr(response, "tool_calls", [])

                if not tool_calls:
                    # No more tool calls - return final response
                    latency_ms = int((time.time() - start_time) * 1000)

                    # Estimate tokens if not available — sum across all messages
                    if total_input_tokens == 0:
                        approx = sum(
                            len(str(m.content).split()) for m in messages if hasattr(m, "content")
                        )
                        total_input_tokens = approx * 2
                        measurement_method = LLMUsageMeasurementMethod.ESTIMATED
                    if total_output_tokens == 0:
                        total_output_tokens = len(str(response.content).split()) * 2
                        measurement_method = LLMUsageMeasurementMethod.ESTIMATED

                    await _record_usage_from_context(
                        usage_context=usage_context,
                        provider=provider,
                        model_id=model_id,
                        input_tokens=total_input_tokens,
                        output_tokens=total_output_tokens,
                        latency_ms=latency_ms,
                        measurement_method=measurement_method,
                        status=LLMUsageStatus.SUCCESS,
                        started_at=start_time,
                    )

                    return LLMResponse(
                        content=response.content,
                        input_tokens=total_input_tokens,
                        output_tokens=total_output_tokens,
                        latency_ms=latency_ms,
                        model=model_id,
                        provider=provider,
                        tool_calls=all_tool_calls,
                        tool_results=all_tool_results,
                    )

                # Execute each tool call
                messages.append(response)  # Add assistant message with tool calls

                for tool_call in tool_calls:
                    tool_name = tool_call.get("name", "")
                    tool_args = tool_call.get("args", {})
                    tool_id = tool_call.get("id", "")

                    # Record the tool call
                    all_tool_calls.append(
                        {
                            "name": tool_name,
                            "arguments": tool_args,
                        }
                    )

                    # Execute the tool
                    try:
                        result = await execute_tool(
                            tool_name,
                            tool_args,
                            working_directory=working_directory,
                            usage_context=usage_context,
                        )
                        result_str = json.dumps(result, ensure_ascii=False, indent=2)
                    except Exception as e:
                        result = {"success": False, "error": str(e)}
                        result_str = json.dumps(result)

                    # Record the result
                    all_tool_results.append(
                        {
                            "tool": tool_name,
                            "result": result,
                        }
                    )

                    # Add tool result message
                    messages.append(
                        ToolMessage(
                            content=result_str,
                            tool_call_id=tool_id,
                        )
                    )

            # Tool iteration budget exhausted — force a final-answer round
            # using the raw (non-tool-bound) LLM so we never return the
            # "[Max tool iterations reached]" sentinel to users.
            messages.append(
                SystemMessage(
                    content=(
                        "Tool budget exhausted. Based on the tool results gathered "
                        "so far, produce your best final answer to the user now. "
                        "Do NOT call any more tools."
                    )
                )
            )
            final_response = await llm.ainvoke(messages)

            if hasattr(final_response, "usage_metadata") and final_response.usage_metadata:
                total_input_tokens += final_response.usage_metadata.get("input_tokens", 0)
                total_output_tokens += final_response.usage_metadata.get("output_tokens", 0)
                measurement_method = LLMUsageMeasurementMethod.PROVIDER_METADATA

            latency_ms = int((time.time() - start_time) * 1000)

            if total_input_tokens == 0:
                approx = sum(len(str(m.content).split()) for m in messages if hasattr(m, "content"))
                total_input_tokens = approx * 2
                measurement_method = LLMUsageMeasurementMethod.ESTIMATED
            if total_output_tokens == 0:
                total_output_tokens = len(str(final_response.content).split()) * 2
                measurement_method = LLMUsageMeasurementMethod.ESTIMATED

            await _record_usage_from_context(
                usage_context=usage_context,
                provider=provider,
                model_id=model_id,
                input_tokens=total_input_tokens,
                output_tokens=total_output_tokens,
                latency_ms=latency_ms,
                measurement_method=measurement_method,
                status=LLMUsageStatus.SUCCESS,
                started_at=start_time,
            )

            return LLMResponse(
                content=final_response.content,
                input_tokens=total_input_tokens,
                output_tokens=total_output_tokens,
                latency_ms=latency_ms,
                model=model_id,
                provider=provider,
                tool_calls=all_tool_calls,
                tool_results=all_tool_results,
            )

        except (LLMUsageQuotaExceededError, LLMRuntimeResolutionError):
            raise
        except Exception as e:
            latency_ms = int((time.time() - start_time) * 1000)
            await _record_usage_from_context(
                usage_context=usage_context,
                provider=provider,
                model_id=model_id,
                input_tokens=None,
                output_tokens=None,
                latency_ms=latency_ms,
                measurement_method=LLMUsageMeasurementMethod.UNKNOWN,
                status=LLMUsageStatus.ERROR,
                started_at=start_time,
                error_message=str(e),
            )
            raise RuntimeError(f"LLM invocation with tools failed ({model_id}): {str(e)}")
