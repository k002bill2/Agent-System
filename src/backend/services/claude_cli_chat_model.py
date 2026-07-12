"""LangChain-compatible chat model backed by Claude CLI.

This provider is intended for local subscription-backed Claude usage. It shells
out to ``claude -p`` (print mode) instead of using Anthropic's usage-billed API.
Mirrors ``codex_cli_chat_model.py``; the sole structural difference is the output
channel: ``claude -p`` writes the assistant reply to **stdout** rather than to a
``--output-last-message`` file.
"""

import asyncio
import json
import os
import shlex
import subprocess
from typing import Any

from langchain_core.callbacks import CallbackManagerForLLMRun
from langchain_core.language_models.chat_models import SimpleChatModel
from langchain_core.messages import AIMessage, BaseMessage
from pydantic import BaseModel, Field


def _message_role(message: BaseMessage) -> str:
    """Map LangChain message types to compact prompt roles."""
    msg_type = getattr(message, "type", "")
    if msg_type == "system":
        return "System"
    if msg_type == "human":
        return "User"
    if msg_type == "ai":
        return "Assistant"
    if msg_type == "tool":
        return "Tool"
    return msg_type.title() or "Message"


def _format_messages(messages: list[BaseMessage]) -> str:
    """Format a chat transcript into a single Claude CLI prompt."""
    parts: list[str] = [
        "You are being used as a chat completion backend for Agent-System.",
        "Return only the assistant response. Do not modify files or run commands.",
    ]
    for message in messages:
        content = message.content
        if isinstance(content, list):
            content = json.dumps(content, ensure_ascii=False)
        parts.append(f"\n## {_message_role(message)}\n{content}")
    parts.append("\n## Assistant")
    return "\n".join(parts)


class _StructuredClaudeRunnable:
    """Minimal structured-output adapter for code paths that call ainvoke()."""

    def __init__(self, llm: "ClaudeCliChatModel", schema: Any):
        self.llm = llm
        self.schema = schema

    async def ainvoke(self, messages: list[BaseMessage], *args: Any, **kwargs: Any) -> Any:
        schema_text = self._schema_text()
        structured_messages = list(messages)
        structured_messages.append(
            AIMessage(
                content=(
                    "Return valid JSON only. Do not wrap it in Markdown. "
                    f"The JSON must match this schema:\n{schema_text}"
                )
            )
        )
        response = await self.llm.ainvoke(structured_messages, *args, **kwargs)
        data = self._parse_json(str(response.content))
        if isinstance(self.schema, type) and issubclass(self.schema, BaseModel):
            return self.schema(**data)
        return data

    def _schema_text(self) -> str:
        if isinstance(self.schema, type) and issubclass(self.schema, BaseModel):
            return json.dumps(self.schema.model_json_schema(), ensure_ascii=False)
        return json.dumps(self.schema, ensure_ascii=False)

    @staticmethod
    def _parse_json(content: str) -> dict[str, Any]:
        start = content.find("{")
        end = content.rfind("}") + 1
        if start < 0 or end <= start:
            raise ValueError("Claude CLI response did not contain a JSON object")
        return json.loads(content[start:end])


class ClaudeCliChatModel(SimpleChatModel):
    """Simple chat model that invokes ``claude -p`` locally."""

    model_name: str = "claude-cli"
    command: str = Field(default_factory=lambda: os.getenv("CLAUDE_CLI_COMMAND", "claude"))
    args: list[str] = Field(
        default_factory=lambda: shlex.split(
            os.getenv(
                # --permission-mode plan is the read-only hard barrier symmetric
                # to codex's --sandbox read-only (no writes/commands); operators
                # may override via CLAUDE_CLI_ARGS.
                "CLAUDE_CLI_ARGS",
                "-p --output-format text --permission-mode plan",
            )
        )
    )
    timeout_seconds: int = Field(
        default_factory=lambda: int(os.getenv("CLAUDE_CLI_TIMEOUT_SECONDS", "300"))
    )

    @property
    def _llm_type(self) -> str:
        return "claude_cli"

    def bind_tools(self, tools: Any, *args: Any, **kwargs: Any) -> "ClaudeCliChatModel":
        # Claude CLI does not expose LangChain tool-call messages. Returning self
        # keeps existing execution paths functional without API tool billing.
        return self

    def with_structured_output(  # type: ignore[override]
        self,
        schema: dict[str, Any] | type,
        *,
        include_raw: bool = False,
        **kwargs: Any,
    ) -> _StructuredClaudeRunnable:
        # Intentional override divergence: Claude CLI cannot return a full
        # LangChain Runnable, so we hand back a minimal ainvoke-only adapter.
        if include_raw:
            raise NotImplementedError("Claude CLI structured output does not support include_raw")
        return _StructuredClaudeRunnable(self, schema)

    def _call(
        self,
        messages: list[BaseMessage],
        stop: list[str] | None = None,
        run_manager: CallbackManagerForLLMRun | None = None,
        **kwargs: Any,
    ) -> str:
        prompt = _format_messages(messages)

        cmd = [self.command, *self.args, prompt]
        try:
            result = subprocess.run(
                cmd,
                text=True,
                capture_output=True,
                # Detach stdin so Claude never blocks waiting on interactive input
                # when invoked from a non-interactive backend (it sees EOF).
                stdin=subprocess.DEVNULL,
                timeout=self.timeout_seconds,
                check=False,
            )
        except FileNotFoundError as exc:
            raise RuntimeError(
                f"Claude CLI command not found: {self.command}. Install Claude CLI and sign in."
            ) from exc
        except subprocess.TimeoutExpired as exc:
            raise RuntimeError(
                f"Claude CLI timed out after {self.timeout_seconds} seconds"
            ) from exc

        if result.returncode != 0:
            stderr = result.stderr.strip()
            stdout = result.stdout.strip()
            detail = stderr or stdout or f"exit code {result.returncode}"
            raise RuntimeError(f"Claude CLI invocation failed: {detail}")

        # claude -p writes the assistant reply to stdout (no output file).
        return result.stdout.strip()

    async def _acall(
        self,
        messages: list[BaseMessage],
        stop: list[str] | None = None,
        run_manager: CallbackManagerForLLMRun | None = None,
        **kwargs: Any,
    ) -> str:
        return await asyncio.to_thread(
            self._call,
            messages,
            stop=stop,
            run_manager=run_manager,
            **kwargs,
        )
