"""LLM Service for unified access to multiple LLM providers."""

import json
import os
import time
from collections.abc import AsyncIterator
from typing import Any

from langchain_core.messages import HumanMessage, SystemMessage, ToolMessage

from models.llm_models import LLMModelRegistry, get_model_configs

# Use central registry for model configurations
MODEL_CONFIGS = get_model_configs()


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
        """Get or create LLM instance for the specified model."""
        config = MODEL_CONFIGS.get(model_id)
        if not config:
            raise ValueError(f"Unknown model: {model_id}")

        provider = config["provider"]
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
                model=config["model"],
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
                model=config["model"],
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
                model=config["model"],
                temperature=temperature,
                max_tokens=max_tokens,
                api_key=api_key,
            )

        else:
            raise ValueError(f"Unsupported provider: {provider}")

        cls._instances[cache_key] = llm
        return llm

    @classmethod
    async def invoke(
        cls,
        prompt: str,
        model_id: str = "gemini-3-flash-preview",
        system_prompt: str | None = None,
        temperature: float = 0.7,
        max_tokens: int = 4096,
        context: dict[str, Any] | None = None,
    ) -> LLMResponse:
        """
        Invoke an LLM with the given prompt.

        Args:
            prompt: The user's prompt
            model_id: Model identifier (e.g., "gemini-3-flash-preview", "claude-sonnet-4-20250514")
            system_prompt: Optional system prompt
            temperature: Sampling temperature
            max_tokens: Maximum output tokens
            context: Optional context dict to include

        Returns:
            LLMResponse with content and metrics
        """
        config = MODEL_CONFIGS.get(model_id, {})
        provider = config.get("provider", "unknown")

        start_time = time.time()

        try:
            llm = cls._get_llm(model_id, temperature, max_tokens)

            # Build messages
            messages = []
            if system_prompt:
                messages.append(SystemMessage(content=system_prompt))

            # Add context if provided
            if context:
                context_str = "\n".join(f"- {k}: {v}" for k, v in context.items())
                full_prompt = f"Context:\n{context_str}\n\nUser: {prompt}"
            else:
                full_prompt = prompt

            messages.append(HumanMessage(content=full_prompt))

            # Invoke LLM
            response = await llm.ainvoke(messages)

            latency_ms = int((time.time() - start_time) * 1000)

            # Extract token usage if available
            input_tokens = 0
            output_tokens = 0

            if hasattr(response, "usage_metadata") and response.usage_metadata:
                input_tokens = response.usage_metadata.get("input_tokens", 0)
                output_tokens = response.usage_metadata.get("output_tokens", 0)
            elif hasattr(response, "response_metadata"):
                metadata = response.response_metadata
                if "usage" in metadata:
                    usage = metadata["usage"]
                    input_tokens = usage.get("input_tokens", usage.get("prompt_tokens", 0))
                    output_tokens = usage.get("output_tokens", usage.get("completion_tokens", 0))

            # Estimate if not available
            if input_tokens == 0:
                input_tokens = len(full_prompt.split()) * 2
            if output_tokens == 0:
                output_tokens = len(response.content.split()) * 2

            return LLMResponse(
                content=response.content,
                input_tokens=input_tokens,
                output_tokens=output_tokens,
                latency_ms=latency_ms,
                model=model_id,
                provider=provider,
            )

        except Exception as e:
            latency_ms = int((time.time() - start_time) * 1000)
            raise RuntimeError(f"LLM invocation failed ({model_id}): {str(e)}")

    @classmethod
    async def stream(
        cls,
        prompt: str,
        model_id: str = "gemini-3-flash-preview",
        system_prompt: str | None = None,
        temperature: float = 0.7,
        max_tokens: int = 4096,
        context: dict[str, Any] | None = None,
    ) -> AsyncIterator[str]:
        """
        Stream response from LLM.

        Yields chunks of text as they arrive.
        """
        try:
            llm = cls._get_llm(model_id, temperature, max_tokens)

            # Build messages
            messages = []
            if system_prompt:
                messages.append(SystemMessage(content=system_prompt))

            if context:
                context_str = "\n".join(f"- {k}: {v}" for k, v in context.items())
                full_prompt = f"Context:\n{context_str}\n\nUser: {prompt}"
            else:
                full_prompt = prompt

            messages.append(HumanMessage(content=full_prompt))

            # Stream response
            async for chunk in llm.astream(messages):
                if hasattr(chunk, "content") and chunk.content:
                    yield chunk.content

        except Exception as e:
            yield f"\n\n[Error: {str(e)}]"

    @classmethod
    async def stream_with_tokens(
        cls,
        prompt: str,
        model_id: str = "gemini-3-flash-preview",
        system_prompt: str | None = None,
        temperature: float = 0.7,
        max_tokens: int = 4096,
        context: dict[str, Any] | None = None,
    ) -> AsyncIterator[tuple[str, dict | None]]:
        """
        Stream response from LLM with token information.

        Uses astream_events() to capture token usage at the end.

        Yields:
            Tuple of (chunk_text, token_info).
            token_info is None for intermediate chunks, and contains
            token usage data in the final yield.
        """
        try:
            llm = cls._get_llm(model_id, temperature, max_tokens)

            # Build messages
            messages = []
            if system_prompt:
                messages.append(SystemMessage(content=system_prompt))

            if context:
                context_str = "\n".join(f"- {k}: {v}" for k, v in context.items())
                full_prompt = f"Context:\n{context_str}\n\nUser: {prompt}"
            else:
                full_prompt = prompt

            messages.append(HumanMessage(content=full_prompt))

            token_info = None

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
                            else:
                                token_info = {
                                    "input_tokens": getattr(usage, "input_tokens", 0),
                                    "output_tokens": getattr(usage, "output_tokens", 0),
                                    "model": model_id,
                                }
                        elif hasattr(output, "response_metadata"):
                            metadata = output.response_metadata
                            usage = metadata.get("usage", {})
                            if usage:
                                token_info = {
                                    "input_tokens": usage.get("input_tokens", 0),
                                    "output_tokens": usage.get("output_tokens", 0),
                                    "model": model_id,
                                }

            # Yield final token info
            if token_info:
                yield "", token_info

        except Exception as e:
            yield f"\n\n[Error: {str(e)}]", None

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
        """
        return LLMModelRegistry.get_default()

    @classmethod
    async def invoke_with_tools(
        cls,
        prompt: str,
        tools: list[str],
        model_id: str = "gemini-3-flash-preview",
        system_prompt: str | None = None,
        temperature: float = 0.7,
        max_tokens: int = 4096,
        context: dict[str, Any] | None = None,
        max_tool_iterations: int = 15,
        working_directory: str | None = None,
    ) -> LLMResponse:
        """
        Invoke an LLM with tool support.

        The LLM can call tools, and this method will execute them
        and return the final response.

        Args:
            prompt: The user's prompt
            tools: List of enabled tool names
            model_id: Model identifier
            system_prompt: Optional system prompt
            temperature: Sampling temperature
            max_tokens: Maximum output tokens
            context: Optional context dict
            max_tool_iterations: Max number of tool call rounds
            working_directory: Working directory for file/code tools

        Returns:
            LLMResponse with content, tool calls, and metrics
        """
        from services.playground_tools import TOOL_DEFINITIONS, execute_tool

        config = MODEL_CONFIGS.get(model_id, {})
        provider = config.get("provider", "unknown")

        start_time = time.time()
        total_input_tokens = 0
        total_output_tokens = 0
        all_tool_calls = []
        all_tool_results = []

        try:
            llm = cls._get_llm(model_id, temperature, max_tokens)

            # Filter tool definitions to only enabled tools
            enabled_tool_defs = [
                t for t in TOOL_DEFINITIONS
                if t["name"] in tools
            ]

            # Bind tools to LLM if any are enabled
            if enabled_tool_defs:
                llm_with_tools = llm.bind_tools(enabled_tool_defs)
            else:
                llm_with_tools = llm

            # Build initial messages
            messages = []
            if system_prompt:
                messages.append(SystemMessage(content=system_prompt))
            else:
                # Default system prompt for tool usage
                messages.append(SystemMessage(content=
                    "You are a helpful AI assistant. "
                    "You have access to tools that you can use to help answer questions. "
                    "Use tools when they would help provide accurate and current information. "
                    "After using tools, synthesize the results into a helpful response."
                ))

            # Add context if provided
            if context:
                context_str = "\n".join(f"- {k}: {v}" for k, v in context.items())
                full_prompt = f"Context:\n{context_str}\n\nUser: {prompt}"
            else:
                full_prompt = prompt

            messages.append(HumanMessage(content=full_prompt))

            # Iterate until we get a final response or hit max iterations
            for _iteration in range(max_tool_iterations):
                # Invoke LLM
                response = await llm_with_tools.ainvoke(messages)

                # Track tokens
                if hasattr(response, "usage_metadata") and response.usage_metadata:
                    total_input_tokens += response.usage_metadata.get("input_tokens", 0)
                    total_output_tokens += response.usage_metadata.get("output_tokens", 0)

                # Check for tool calls
                tool_calls = getattr(response, "tool_calls", [])

                if not tool_calls:
                    # No more tool calls - return final response
                    latency_ms = int((time.time() - start_time) * 1000)

                    # Estimate tokens if not available
                    if total_input_tokens == 0:
                        total_input_tokens = len(full_prompt.split()) * 2
                    if total_output_tokens == 0:
                        total_output_tokens = len(response.content.split()) * 2

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
                    all_tool_calls.append({
                        "name": tool_name,
                        "arguments": tool_args,
                    })

                    # Execute the tool
                    try:
                        result = await execute_tool(tool_name, tool_args, working_directory=working_directory)
                        result_str = json.dumps(result, ensure_ascii=False, indent=2)
                    except Exception as e:
                        result = {"success": False, "error": str(e)}
                        result_str = json.dumps(result)

                    # Record the result
                    all_tool_results.append({
                        "tool": tool_name,
                        "result": result,
                    })

                    # Add tool result message
                    messages.append(ToolMessage(
                        content=result_str,
                        tool_call_id=tool_id,
                    ))

            # Max iterations reached
            latency_ms = int((time.time() - start_time) * 1000)

            return LLMResponse(
                content="[Max tool iterations reached]",
                input_tokens=total_input_tokens,
                output_tokens=total_output_tokens,
                latency_ms=latency_ms,
                model=model_id,
                provider=provider,
                tool_calls=all_tool_calls,
                tool_results=all_tool_results,
            )

        except Exception as e:
            latency_ms = int((time.time() - start_time) * 1000)
            raise RuntimeError(f"LLM invocation with tools failed ({model_id}): {str(e)}")
