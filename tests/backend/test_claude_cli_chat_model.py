"""Unit tests for ClaudeCliChatModel.

The Claude CLI binary is never invoked: ``subprocess.run`` is mocked. Unlike
Codex (which writes to a ``--output-last-message`` file), ``claude -p`` returns
its answer on **stdout**, so the mock supplies stdout directly and the full
format→run→read→parse path is exercised without the real CLI.
"""

from unittest.mock import MagicMock, patch

import pytest
from langchain_core.messages import AIMessage, HumanMessage, SystemMessage
from pydantic import BaseModel

from services.claude_cli_chat_model import (
    ClaudeCliChatModel,
    _format_messages,
    _message_role,
)

MODULE = "services.claude_cli_chat_model"


def _run_side_effect(*, returncode: int = 0, stdout: str = "", stderr: str = ""):
    """Build a subprocess.run replacement that emulates Claude CLI behaviour.

    ``claude -p`` prints the assistant reply to stdout, so the mock simply
    returns the given stdout/stderr/returncode.
    """

    def _side(cmd, **_kwargs):
        result = MagicMock()
        result.returncode = returncode
        result.stdout = stdout
        result.stderr = stderr
        return result

    return _side


def _model() -> ClaudeCliChatModel:
    return ClaudeCliChatModel()


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
    # Must end by cueing the assistant turn so Claude completes the response.
    assert prompt.rstrip().endswith("## Assistant")


# ── _call: success paths ─────────────────────────────────────────────────────


def test_call_reads_answer_from_stdout() -> None:
    with patch(f"{MODULE}.subprocess.run",
               side_effect=_run_side_effect(stdout="claude answer")):
        out = _model()._call([HumanMessage(content="q")])
    assert out == "claude answer"


def test_call_strips_stdout_whitespace() -> None:
    with patch(f"{MODULE}.subprocess.run",
               side_effect=_run_side_effect(stdout="  spaced answer \n")):
        out = _model()._call([HumanMessage(content="q")])
    assert out == "spaced answer"


def test_call_passes_prompt_as_trailing_argv() -> None:
    # Contract: `claude -p --output-format text <prompt>` — prompt is the last
    # positional arg, and the default args flow through verbatim.
    mock_run = MagicMock(side_effect=_run_side_effect(stdout="ok"))
    with patch(f"{MODULE}.subprocess.run", mock_run):
        _model()._call([HumanMessage(content="hello")])

    cmd = mock_run.call_args.args[0]
    assert cmd[0] == "claude"
    assert cmd[1:3] == ["-p", "--output-format"]
    assert cmd[3] == "text"
    # The formatted prompt is the final argv element.
    assert cmd[-1].rstrip().endswith("## Assistant")
    assert "hello" in cmd[-1]


def test_call_detaches_stdin_to_avoid_interactive_hang() -> None:
    # Regression: without stdin=DEVNULL, Claude inherits the backend's stdin and
    # blocks waiting for interactive input, hanging until the timeout fires.
    import subprocess

    mock_run = MagicMock(side_effect=_run_side_effect(stdout="ok"))
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
               side_effect=subprocess.TimeoutExpired(cmd="claude", timeout=1)):
        with pytest.raises(RuntimeError, match="timed out"):
            _model()._call([HumanMessage(content="q")])


# ── bind_tools (no-op) ───────────────────────────────────────────────────────


def test_bind_tools_returns_self() -> None:
    model = _model()
    # Claude CLI cannot emit LangChain tool calls; binding must be a no-op so
    # consumers that check ``response.tool_calls`` degrade gracefully.
    assert model.bind_tools([{"name": "noop"}]) is model


# ── with_structured_output ───────────────────────────────────────────────────


class _Plan(BaseModel):
    title: str
    steps: int


@pytest.mark.asyncio
async def test_structured_output_parses_pydantic() -> None:
    with patch(f"{MODULE}.subprocess.run",
               side_effect=_run_side_effect(stdout='{"title": "x", "steps": 3}')):
        runnable = _model().with_structured_output(_Plan)
        result = await runnable.ainvoke([HumanMessage(content="plan it")])
    assert isinstance(result, _Plan)
    assert result.title == "x"
    assert result.steps == 3


@pytest.mark.asyncio
async def test_structured_output_strips_surrounding_markdown() -> None:
    fenced = "Here you go:\n```json\n{\"title\": \"y\", \"steps\": 1}\n```\nThanks!"
    with patch(f"{MODULE}.subprocess.run",
               side_effect=_run_side_effect(stdout=fenced)):
        runnable = _model().with_structured_output(_Plan)
        result = await runnable.ainvoke([HumanMessage(content="plan it")])
    assert result == _Plan(title="y", steps=1)


@pytest.mark.asyncio
async def test_structured_output_raises_without_json() -> None:
    with patch(f"{MODULE}.subprocess.run",
               side_effect=_run_side_effect(stdout="no json here")):
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
               side_effect=_run_side_effect(stdout="async answer")):
        out = await _model()._acall([HumanMessage(content="q")])
    assert out == "async answer"


# ── env configuration (CLAUDE_CLI_* boundary contract) ───────────────────────
# The defaults are locked by test_call_passes_prompt_as_trailing_argv; these
# assert the *override* half of the contract — a renamed/dropped env var would
# otherwise silently ignore operator config without any failing test.


def test_command_and_args_read_from_env(monkeypatch) -> None:
    # default_factory reads env at instantiation, so set env BEFORE constructing.
    monkeypatch.setenv("CLAUDE_CLI_COMMAND", "claude-custom")
    monkeypatch.setenv("CLAUDE_CLI_ARGS", "-p --output-format json --verbose")

    mock_run = MagicMock(side_effect=_run_side_effect(stdout="ok"))
    with patch(f"{MODULE}.subprocess.run", mock_run):
        ClaudeCliChatModel()._call([HumanMessage(content="q")])

    cmd = mock_run.call_args.args[0]
    assert cmd[0] == "claude-custom"
    # CLAUDE_CLI_ARGS is shlex-split and flows through verbatim before the prompt.
    assert cmd[1:5] == ["-p", "--output-format", "json", "--verbose"]
    assert cmd[-1].rstrip().endswith("## Assistant")


def test_timeout_read_from_env(monkeypatch) -> None:
    monkeypatch.setenv("CLAUDE_CLI_TIMEOUT_SECONDS", "42")

    mock_run = MagicMock(side_effect=_run_side_effect(stdout="ok"))
    with patch(f"{MODULE}.subprocess.run", mock_run):
        ClaudeCliChatModel()._call([HumanMessage(content="q")])

    # The env-configured timeout must reach subprocess.run, not the 300s default.
    assert mock_run.call_args.kwargs["timeout"] == 42
