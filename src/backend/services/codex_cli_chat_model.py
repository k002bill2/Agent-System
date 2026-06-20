"""LangChain-compatible chat model backed by Codex CLI.

This provider is intended for local subscription-backed Codex usage. It shells
out to ``codex exec`` instead of using OpenAI's usage-billed API.
"""

import asyncio
import json
import os
import shlex
import subprocess
import tempfile
from pathlib import Path
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
    """Format a chat transcript into a single Codex CLI prompt."""
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


class _StructuredCodexRunnable:
    """Minimal structured-output adapter for code paths that call ainvoke()."""

    def __init__(self, llm: "CodexCliChatModel", schema: Any):
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
            raise ValueError("Codex CLI response did not contain a JSON object")
        return json.loads(content[start:end])


class CodexCliChatModel(SimpleChatModel):
    """Simple chat model that invokes ``codex exec`` locally."""

    model_name: str = "codex-cli"
    command: str = Field(default_factory=lambda: os.getenv("CODEX_CLI_COMMAND", "codex"))
    args: list[str] = Field(
        default_factory=lambda: shlex.split(
            os.getenv(
                "CODEX_CLI_ARGS",
                "exec --sandbox read-only --color never",
            )
        )
    )
    timeout_seconds: int = Field(
        default_factory=lambda: int(os.getenv("CODEX_CLI_TIMEOUT_SECONDS", "300"))
    )
    working_directory: str = Field(
        default_factory=lambda: os.getenv("CODEX_CLI_WORKDIR", os.getcwd())
    )

    @property
    def _llm_type(self) -> str:
        return "codex_cli"

    def bind_tools(self, tools: Any, *args: Any, **kwargs: Any) -> "CodexCliChatModel":
        # Codex CLI does not expose LangChain tool-call messages. Returning self
        # keeps existing execution paths functional without API tool billing.
        return self

    def with_structured_output(  # type: ignore[override]
        self,
        schema: dict[str, Any] | type,
        *,
        include_raw: bool = False,
        **kwargs: Any,
    ) -> _StructuredCodexRunnable:
        # Intentional override divergence: Codex CLI cannot return a full
        # LangChain Runnable, so we hand back a minimal ainvoke-only adapter.
        if include_raw:
            raise NotImplementedError("Codex CLI structured output does not support include_raw")
        return _StructuredCodexRunnable(self, schema)

    def _call(
        self,
        messages: list[BaseMessage],
        stop: list[str] | None = None,
        run_manager: CallbackManagerForLLMRun | None = None,
        **kwargs: Any,
    ) -> str:
        prompt = _format_messages(messages)
        output_path: Path | None = None
        with tempfile.NamedTemporaryFile(prefix="aos-codex-", suffix=".txt", delete=False) as tmp:
            output_path = Path(tmp.name)

        cmd = [self.command, *self.args, "--output-last-message", str(output_path), prompt]
        try:
            result = subprocess.run(
                cmd,
                cwd=self.working_directory,
                text=True,
                capture_output=True,
                # Detach stdin so Codex never blocks waiting on interactive input
                # when invoked from a non-interactive backend (it sees EOF).
                stdin=subprocess.DEVNULL,
                timeout=self.timeout_seconds,
                check=False,
            )
        except FileNotFoundError as exc:
            raise RuntimeError(
                f"Codex CLI command not found: {self.command}. Install Codex CLI and sign in."
            ) from exc
        except subprocess.TimeoutExpired as exc:
            raise RuntimeError(f"Codex CLI timed out after {self.timeout_seconds} seconds") from exc

        if result.returncode != 0:
            stderr = result.stderr.strip()
            stdout = result.stdout.strip()
            detail = stderr or stdout or f"exit code {result.returncode}"
            raise RuntimeError(f"Codex CLI invocation failed: {detail}")

        try:
            output = output_path.read_text(encoding="utf-8").strip() if output_path else ""
        finally:
            if output_path:
                output_path.unlink(missing_ok=True)

        return output or result.stdout.strip()

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
