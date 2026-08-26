"""Codex rollout JSONL discovery tests."""

import json
from pathlib import Path

import pytest

import services.codex_session_monitor as codex_monitor
from services.codex_session_monitor import CodexSessionMonitor


def _write_rollout(root: Path) -> Path:
    path = root / "2026" / "08" / "27" / "rollout-2026-08-27T10-00-00-01abc.jsonl"
    path.parent.mkdir(parents=True)
    records = [
        {
            "timestamp": "2026-08-27T01:00:00Z",
            "type": "session_meta",
            "payload": {
                "session_id": "root-thread",
                "id": "thread-01abc",
                "cwd": "/Users/tester/Work/AOS",
                "parent_thread_id": None,
                "model_provider": "openai",
            },
        },
        {
            "timestamp": "2026-08-27T01:00:01Z",
            "type": "response_item",
            "payload": {
                "type": "message",
                "role": "user",
                "content": [{"type": "input_text", "text": "Add Codex sessions"}],
            },
        },
        {
            "timestamp": "2026-08-27T01:00:02Z",
            "type": "response_item",
            "payload": {
                "type": "message",
                "role": "assistant",
                "model": "gpt-5.5",
                "content": [{"type": "output_text", "text": "Implemented."}],
                "usage": {"input_tokens": 12, "output_tokens": 8},
            },
        },
        {
            "timestamp": "2026-08-27T01:00:03Z",
            "type": "response_item",
            "payload": {
                "type": "function_call",
                "name": "apply_patch",
                "call_id": "call-1",
                "arguments": "{}",
            },
        },
        {"timestamp": "2026-08-27T01:00:04Z", "type": "unknown_event", "payload": {}},
        b"not-json",
    ]
    with path.open("wb") as stream:
        for record in records:
            stream.write(
                (record if isinstance(record, bytes) else json.dumps(record).encode("utf-8"))
                + b"\n"
            )
    return path


def test_discovers_and_normalizes_codex_rollout(tmp_path: Path) -> None:
    _write_rollout(tmp_path)
    monitor = CodexSessionMonitor(tmp_path)

    sessions = monitor.discover_sessions()

    assert len(sessions) == 1
    session = sessions[0]
    assert session.provider == "codex"
    assert session.session_id == "thread-01abc"
    assert session.model == "gpt-5.5"
    assert session.project_name == "AOS"
    assert session.cwd == "/Users/tester/Work/AOS"
    assert session.user_message_count == 1
    assert session.assistant_message_count == 1
    assert session.tool_call_count == 1
    assert session.message_count == 3
    assert session.total_input_tokens == 12
    assert session.total_output_tokens == 8


def test_codex_detail_exposes_messages_and_ignores_unknown_events(tmp_path: Path) -> None:
    _write_rollout(tmp_path)
    monitor = CodexSessionMonitor(tmp_path)

    detail = monitor.get_session_details("thread-01abc")

    assert detail is not None
    assert detail.provider == "codex"
    assert [message.type.value for message in detail.recent_messages] == [
        "user",
        "assistant",
        "tool_use",
    ]
    assert detail.recent_messages[0].content == "Add Codex sessions"
    assert detail.recent_messages[1].model == "gpt-5.5"
    assert detail.recent_messages[2].tool_name == "apply_patch"


def test_codex_child_rollouts_are_discoverable_by_their_thread_id(tmp_path: Path) -> None:
    path = _write_rollout(tmp_path)
    child = path.parent / "rollout-child.jsonl"
    child.write_text(
        json.dumps(
            {
                "timestamp": "2026-08-27T01:01:00Z",
                "type": "session_meta",
                "payload": {
                    "session_id": "root-thread",
                    "id": "child-thread",
                    "parent_thread_id": "thread-01abc",
                    "cwd": "/Users/tester/Work/AOS",
                },
            }
        )
        + "\n",
        encoding="utf-8",
    )

    sessions = CodexSessionMonitor(tmp_path).discover_sessions()

    assert {session.session_id for session in sessions} == {"thread-01abc", "child-thread"}
    assert all(session.provider == "codex" for session in sessions)


def test_ignores_rollout_symlink_outside_sessions_root(tmp_path: Path) -> None:
    outside = tmp_path / "outside.jsonl"
    source_path = _write_rollout(tmp_path / "source")
    valid = tmp_path / "2026" / "08" / "27" / "rollout-valid.jsonl"
    valid.parent.mkdir(parents=True, exist_ok=True)
    valid.write_text(source_path.read_text(), encoding="utf-8")
    outside.write_text(source_path.read_text(), encoding="utf-8")
    link = tmp_path / "2026" / "08" / "27" / "rollout-link.jsonl"
    link.parent.mkdir(parents=True, exist_ok=True)
    link.symlink_to(outside)

    sessions = CodexSessionMonitor(tmp_path).discover_sessions()

    assert {session.slug for session in sessions} == {"valid"}


def test_skips_rollout_above_file_size_limit(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    path = _write_rollout(tmp_path)
    monkeypatch.setattr(codex_monitor, "MAX_ROLLOUT_BYTES", path.stat().st_size - 1)

    assert CodexSessionMonitor(tmp_path).discover_sessions() == []


def test_malformed_usage_values_do_not_break_message_parsing() -> None:
    message = CodexSessionMonitor._message_from_record(
        {
            "type": "response_item",
            "timestamp": "2026-08-27T01:00:00Z",
            "payload": {
                "type": "message",
                "role": "assistant",
                "content": "ok",
                "usage": {
                    "input_tokens": "invalid",
                    "output_tokens": None,
                    "cache_read_tokens": {},
                    "cache_creation_tokens": "3",
                },
            },
        }
    )

    assert message is not None
    assert message.usage is not None
    assert message.usage.input_tokens == 0
    assert message.usage.output_tokens == 0
    assert message.usage.cache_read_tokens == 0
    assert message.usage.cache_creation_tokens == 3
