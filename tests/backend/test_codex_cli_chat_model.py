"""Unit tests for CodexCliChatModel.

The Codex CLI binary is never invoked: ``subprocess.run`` is mocked. Where the
model expects Codex to write its answer to the ``--output-last-message`` file,
the mock's side effect writes that file so the full format→run→read→parse path
is exercised without the real CLI.
"""

from pathlib import Path
from unittest.mock import MagicMock, patch

import pytest
from langchain_core.messages import AIMessage, HumanMessage, SystemMessage
from pydantic import BaseModel

from services.codex_cli_chat_model import (
    CodexCliChatModel,
    _format_messages,
    _message_role,
)

MODULE = "services.codex_cli_chat_model"


def _run_side_effect(*, last_message: str | None = None, returncode: int = 0,
                     stdout: str = "", stderr: str = ""):
    """Build a subprocess.run replacement that emulates Codex CLI behaviour.

    If ``last_message`` is given, it is written to the path that follows
    ``--output-last-message`` in the command, mimicking Codex's file output.
    """

    def _side(cmd, **_kwargs):
        if last_message is not None:
            idx = cmd.index("--output-last-message") + 1
            Path(cmd[idx]).write_text(last_message, encoding="utf-8")
        result = MagicMock()
        result.returncode = returncode
        result.stdout = stdout
        result.stderr = stderr
        return result

    return _side


def _model() -> CodexCliChatModel:
    return CodexCliChatModel()


# ── _message_role / _format_messages ─────────────────────────────────────────


def test_message_role_maps_known_types() -> None:
    assert _message_role(SystemMessage(content="x")) == "System"
    assert _message_role(HumanMessage(content="x")) == "User"
    assert _message_role(AIMessage(content="x")) == "Assistant"


def test_format_messages_includes_roles_and_trailing_assistant() -> None:
    prompt = _format_messages(
        [SystemMessage(content="be terse"), HumanMessage(content="hi")]
    )
    assert "## System\nbe terse" in prompt
    assert "## User\nhi" in prompt
    # Must end by cueing the assistant turn so Codex completes the response.
    assert prompt.rstrip().endswith("## Assistant")


# ── _call: success paths ─────────────────────────────────────────────────────


def test_call_reads_output_last_message_file() -> None:
    with patch(f"{MODULE}.subprocess.run",
               side_effect=_run_side_effect(last_message="codex answer")):
        out = _model()._call([HumanMessage(content="q")])
    assert out == "codex answer"


def test_call_falls_back_to_stdout_when_file_empty() -> None:
    # Codex wrote nothing to the file; stdout carries the answer instead.
    with patch(f"{MODULE}.subprocess.run",
               side_effect=_run_side_effect(last_message="", stdout="stdout answer")):
        out = _model()._call([HumanMessage(content="q")])
    assert out == "stdout answer"


def test_call_cleans_up_temp_file() -> None:
    captured: dict[str, str] = {}

    def _side(cmd, **_kwargs):
        idx = cmd.index("--output-last-message") + 1
        captured["path"] = cmd[idx]
        Path(cmd[idx]).write_text("done", encoding="utf-8")
        result = MagicMock()
        result.returncode = 0
        result.stdout = ""
        result.stderr = ""
        return result

    with patch(f"{MODULE}.subprocess.run", side_effect=_side):
        _model()._call([HumanMessage(content="q")])

    assert not Path(captured["path"]).exists()


def test_call_detaches_stdin_to_avoid_interactive_hang() -> None:
    # Regression: without stdin=DEVNULL, Codex inherits the backend's stdin and
    # blocks waiting for interactive input, hanging until the timeout fires.
    import subprocess

    mock_run = MagicMock(side_effect=_run_side_effect(last_message="ok"))
    with patch(f"{MODULE}.subprocess.run", mock_run):
        _model()._call([HumanMessage(content="q")])

    assert mock_run.call_args.kwargs["stdin"] is subprocess.DEVNULL


# ── _call: error paths ───────────────────────────────────────────────────────


def test_call_raises_on_nonzero_exit() -> None:
    with patch(f"{MODULE}.subprocess.run",
               side_effect=_run_side_effect(returncode=1, stderr="boom")):
        with pytest.raises(RuntimeError, match="boom"):
            _model()._call([HumanMessage(content="q")])


def test_call_raises_when_command_not_found() -> None:
    with patch(f"{MODULE}.subprocess.run", side_effect=FileNotFoundError()):
        with pytest.raises(RuntimeError, match="not found"):
            _model()._call([HumanMessage(content="q")])


def test_call_raises_on_timeout() -> None:
    import subprocess

    with patch(f"{MODULE}.subprocess.run",
               side_effect=subprocess.TimeoutExpired(cmd="codex", timeout=1)):
        with pytest.raises(RuntimeError, match="timed out"):
            _model()._call([HumanMessage(content="q")])


# ── bind_tools (no-op) ───────────────────────────────────────────────────────


def test_bind_tools_returns_self() -> None:
    model = _model()
    # Codex CLI cannot emit LangChain tool calls; binding must be a no-op so
    # consumers that check ``response.tool_calls`` degrade gracefully.
    assert model.bind_tools([{"name": "noop"}]) is model


# ── with_structured_output ───────────────────────────────────────────────────


class _Plan(BaseModel):
    title: str
    steps: int


@pytest.mark.asyncio
async def test_structured_output_parses_pydantic() -> None:
    with patch(f"{MODULE}.subprocess.run",
               side_effect=_run_side_effect(last_message='{"title": "x", "steps": 3}')):
        runnable = _model().with_structured_output(_Plan)
        result = await runnable.ainvoke([HumanMessage(content="plan it")])
    assert isinstance(result, _Plan)
    assert result.title == "x"
    assert result.steps == 3


@pytest.mark.asyncio
async def test_structured_output_strips_surrounding_markdown() -> None:
    fenced = "Here you go:\n```json\n{\"title\": \"y\", \"steps\": 1}\n```\nThanks!"
    with patch(f"{MODULE}.subprocess.run",
               side_effect=_run_side_effect(last_message=fenced)):
        runnable = _model().with_structured_output(_Plan)
        result = await runnable.ainvoke([HumanMessage(content="plan it")])
    assert result == _Plan(title="y", steps=1)


@pytest.mark.asyncio
async def test_structured_output_raises_without_json() -> None:
    with patch(f"{MODULE}.subprocess.run",
               side_effect=_run_side_effect(last_message="no json here")):
        runnable = _model().with_structured_output(_Plan)
        with pytest.raises(ValueError, match="did not contain a JSON object"):
            await runnable.ainvoke([HumanMessage(content="plan it")])


def test_structured_output_include_raw_unsupported() -> None:
    with pytest.raises(NotImplementedError):
        _model().with_structured_output(_Plan, include_raw=True)


# ── async delegation ─────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_acall_delegates_to_call() -> None:
    with patch(f"{MODULE}.subprocess.run",
               side_effect=_run_side_effect(last_message="async answer")):
        out = await _model()._acall([HumanMessage(content="q")])
    assert out == "async answer"
