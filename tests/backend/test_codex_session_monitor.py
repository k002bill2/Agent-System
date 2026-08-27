"""Codex rollout JSONL discovery tests."""

import json
from datetime import UTC, datetime
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


def test_large_rollout_is_truncated_not_dropped(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    """Exhausting the retain budget must degrade the session, not hide it.

    File size is a poor proxy for memory cost — a rollout is usually large
    because a few tool outputs are huge, not because it holds many records.
    """
    _write_rollout(tmp_path)
    monkeypatch.setattr(codex_monitor, "MAX_ROLLOUT_RECORDS", 2)

    sessions = CodexSessionMonitor(tmp_path).discover_sessions()

    assert [session.session_id for session in sessions] == ["thread-01abc"]
    assert sessions[0].records_truncated is True
    # Counts reflect only what was read, so they are a lower bound.
    assert sessions[0].user_message_count == 1
    assert sessions[0].tool_call_count == 0


def test_list_view_streams_without_retaining_records(tmp_path: Path) -> None:
    """The polled list must not hold the conversation in memory.

    Aggregates still have to be exact — this is the contract that lets the
    file-size gate go away without trading a silent drop for memory growth.
    """
    path = _write_rollout(tmp_path)

    streamed = CodexSessionMonitor(tmp_path)._read_file(path, retain=False)
    retained = CodexSessionMonitor(tmp_path)._read_file(path, retain=True)

    assert streamed.records == []
    assert streamed.messages == []
    assert retained.records and retained.messages
    for field in (
        "message_count",
        "user_count",
        "assistant_count",
        "tool_count",
        "model",
        "tokens",
    ):
        assert getattr(streamed, field) == getattr(retained, field), field
    assert streamed.first_timestamp == retained.first_timestamp
    assert streamed.last_timestamp == retained.last_timestamp


def test_detail_retain_budget_degrades_instead_of_failing(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    """Neither discovery nor detail depends on the retain budget any more.

    Both stream, so a tiny budget — which only bounds the transcript path —
    leaves the list and the detail window fully intact.
    """
    _write_rollout(tmp_path)
    monkeypatch.setattr(codex_monitor, "MAX_RETAINED_BYTES", 1)
    monitor = CodexSessionMonitor(tmp_path)

    sessions = monitor.discover_sessions()
    detail = monitor.get_session_details("thread-01abc")

    assert [session.session_id for session in sessions] == ["thread-01abc"]
    assert detail is not None
    assert [message.type.value for message in detail.recent_messages] == [
        "user",
        "assistant",
        "tool_use",
    ]


def test_oversized_line_is_skipped_without_dropping_the_session(tmp_path: Path) -> None:
    """One huge line must not cost the whole session."""
    path = _write_rollout(tmp_path)
    with path.open("a", encoding="utf-8") as stream:
        stream.write(
            json.dumps(
                {
                    "timestamp": "2026-08-27T01:00:05Z",
                    "type": "response_item",
                    "payload": {
                        "type": "function_call",
                        "name": "read_file",
                        "arguments": "x" * (codex_monitor.MAX_ROLLOUT_LINE_BYTES + 1),
                    },
                }
            )
            + "\n"
        )

    sessions = CodexSessionMonitor(tmp_path).discover_sessions()

    assert [session.session_id for session in sessions] == ["thread-01abc"]
    # The giant record is dropped, so the earlier apply_patch call is the only tool.
    assert sessions[0].tool_call_count == 1
    assert sessions[0].records_truncated is True


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


def _write_real_shape_rollout(root: Path) -> Path:
    """Rollout using the field layout real Codex CLI writes.

    Real rollouts carry the model in ``turn_context``, cumulative usage in an
    ``event_msg``/``token_count`` record, and tools such as ``apply_patch`` as
    ``custom_tool_call`` — none of which appear on ``response_item`` messages.
    """
    path = root / "2026" / "08" / "27" / "rollout-2026-08-27T11-00-00-02real.jsonl"
    path.parent.mkdir(parents=True, exist_ok=True)
    records = [
        {
            "timestamp": "2026-08-27T02:00:00Z",
            "type": "session_meta",
            "payload": {"id": "thread-real", "cwd": "/Users/tester/Work/AOS"},
        },
        {
            "timestamp": "2026-08-27T02:00:01Z",
            "type": "turn_context",
            "payload": {"cwd": "/Users/tester/Work/AOS", "model": "gpt-5.2-codex"},
        },
        {
            "timestamp": "2026-08-27T02:00:02Z",
            "type": "response_item",
            "payload": {
                "type": "custom_tool_call",
                "status": "completed",
                "call_id": "call_real_1",
                "name": "apply_patch",
                "input": "*** Begin Patch",
            },
        },
        {
            "timestamp": "2026-08-27T02:00:03Z",
            "type": "event_msg",
            "payload": {
                "type": "token_count",
                "info": {
                    "total_token_usage": {
                        "input_tokens": 100,
                        "cached_input_tokens": 40,
                        "output_tokens": 7,
                        "reasoning_output_tokens": 3,
                        "total_tokens": 107,
                    }
                },
            },
        },
        {
            "timestamp": "2026-08-27T02:00:04Z",
            "type": "event_msg",
            "payload": {
                "type": "token_count",
                "info": {
                    "total_token_usage": {
                        "input_tokens": 250,
                        "cached_input_tokens": 90,
                        "output_tokens": 11,
                        "reasoning_output_tokens": 4,
                        "total_tokens": 261,
                    }
                },
            },
        },
        {
            "timestamp": "2026-08-27T02:00:05Z",
            "type": "event_msg",
            "payload": {"type": "token_count", "info": None},
        },
    ]
    with path.open("w", encoding="utf-8") as stream:
        for record in records:
            stream.write(json.dumps(record) + "\n")
    return path


def test_model_comes_from_turn_context_when_messages_omit_it(tmp_path: Path) -> None:
    _write_real_shape_rollout(tmp_path)

    session = CodexSessionMonitor(tmp_path).discover_sessions()[0]

    assert session.model == "gpt-5.2-codex"


def test_token_totals_use_latest_cumulative_token_count(tmp_path: Path) -> None:
    _write_real_shape_rollout(tmp_path)

    session = CodexSessionMonitor(tmp_path).discover_sessions()[0]

    # total_token_usage is cumulative, so the last record wins instead of summing.
    assert session.total_input_tokens == 250
    assert session.total_output_tokens == 11


def test_custom_tool_calls_are_counted_as_tool_use(tmp_path: Path) -> None:
    _write_real_shape_rollout(tmp_path)
    monitor = CodexSessionMonitor(tmp_path)

    session = monitor.discover_sessions()[0]
    detail = monitor.get_session_details("thread-real")

    assert session.tool_call_count == 1
    assert detail is not None
    assert [message.tool_name for message in detail.recent_messages] == ["apply_patch"]
    assert detail.recent_messages[0].tool_id == "call_real_1"


def test_non_string_payload_types_are_skipped_not_fatal(tmp_path: Path) -> None:
    """A corrupt record must not abort discovery for the whole rollout."""
    path = tmp_path / "2026" / "08" / "27" / "rollout-corrupt.jsonl"
    path.parent.mkdir(parents=True)
    records = [
        {
            "timestamp": "2026-08-27T03:00:00Z",
            "type": "session_meta",
            "payload": {"id": "thread-corrupt", "cwd": "/Users/tester/Work/AOS"},
        },
        # Unhashable payload type / role: membership tests must not raise.
        {"timestamp": "2026-08-27T03:00:01Z", "type": "response_item", "payload": {"type": ["x"]}},
        {
            "timestamp": "2026-08-27T03:00:02Z",
            "type": "response_item",
            "payload": {"type": "message", "role": {"a": 1}},
        },
        {
            "timestamp": "2026-08-27T03:00:03Z",
            "type": "response_item",
            "payload": {
                "type": "message",
                "role": "user",
                "content": [{"type": "input_text", "text": "survived"}],
            },
        },
    ]
    with path.open("w", encoding="utf-8") as stream:
        for record in records:
            stream.write(json.dumps(record) + "\n")

    monitor = CodexSessionMonitor(tmp_path)
    sessions = monitor.discover_sessions()

    assert [session.session_id for session in sessions] == ["thread-corrupt"]
    assert sessions[0].user_message_count == 1


def test_oversized_line_is_never_materialized_whole(tmp_path: Path, monkeypatch) -> None:
    """The reader must not allocate a line bigger than the per-line cap.

    Iterating the file object would build the whole line before its size could
    be checked, so a single huge tool output could exhaust memory.
    """
    path = _write_rollout(tmp_path)
    # A line far larger than the cap, spanning many read chunks.
    with path.open("ab") as stream:
        stream.write(b'{"padding": "' + b"x" * (12 * 1024 * 1024) + b'"}\n')
        stream.write(
            json.dumps(
                {
                    "timestamp": "2026-08-27T01:00:06Z",
                    "type": "response_item",
                    "payload": {
                        "type": "message",
                        "role": "user",
                        "content": [{"type": "input_text", "text": "after the giant"}],
                    },
                }
            ).encode()
            + b"\n"
        )

    biggest = 0
    original = CodexSessionMonitor._iter_lines

    def spy(stream, agg):
        nonlocal biggest
        for line in original(stream, agg):
            biggest = max(biggest, len(line))
            yield line

    monkeypatch.setattr(CodexSessionMonitor, "_iter_lines", staticmethod(spy))
    sessions = CodexSessionMonitor(tmp_path).discover_sessions()

    assert biggest <= codex_monitor.MAX_ROLLOUT_LINE_BYTES
    assert sessions[0].records_truncated is True
    # Records on both sides of the giant line survive.
    assert sessions[0].user_message_count == 2
    assert sessions[0].tool_call_count == 1


def test_scan_stops_at_the_total_scan_budget(tmp_path: Path, monkeypatch) -> None:
    """A pathological rollout must not scan forever on every list refresh."""
    _write_rollout(tmp_path)
    monkeypatch.setattr(codex_monitor, "MAX_SCAN_BYTES", 1)

    sessions = CodexSessionMonitor(tmp_path).discover_sessions()

    assert len(sessions) == 1
    assert sessions[0].records_truncated is True


def test_detail_shows_the_real_tail_when_the_scan_stops_early(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    """A truncated scan must not present the oldest messages as the newest."""
    _write_rollout(tmp_path)
    monkeypatch.setattr(codex_monitor, "DETAIL_WINDOW", 1)
    monitor = CodexSessionMonitor(tmp_path)

    detail = monitor.get_session_details("thread-01abc")

    assert detail is not None
    # apply_patch is the last message in the fixture, not the first.
    assert [message.tool_name for message in detail.recent_messages] == ["apply_patch"]
    assert detail.messages_truncated is True


def test_truncated_scan_uses_file_mtime_for_last_activity(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    """Activity status must not be derived from a prefix of the file."""
    path = _write_rollout(tmp_path)
    monkeypatch.setattr(codex_monitor, "MAX_SCAN_BYTES", 1)

    session = CodexSessionMonitor(tmp_path).discover_sessions()[0]

    assert session.records_truncated is True
    mtime = datetime.fromtimestamp(path.stat().st_mtime, UTC)
    assert abs((session.last_activity - mtime).total_seconds()) < 1
