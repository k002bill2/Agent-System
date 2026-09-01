"""Codex rollout JSONL discovery tests."""

import json
import os
from datetime import UTC, datetime, timedelta
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

    Both stream, so a tiny budget leaves the list and the detail window fully
    intact. The transcript no longer consults the budget either — it reads a
    bounded window — so this now pins that nothing user-visible does.
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


def test_repeat_discovery_reuses_the_parse_cache(tmp_path: Path) -> None:
    """A finished rollout must not be re-read on every poll."""
    _write_rollout(tmp_path)
    monitor = CodexSessionMonitor(tmp_path)
    reads = 0
    original = monitor._read_file

    def counting(path: Path, *, retain: bool = True):
        nonlocal reads
        reads += 1
        return original(path, retain=retain)

    monitor._read_file = counting  # type: ignore[method-assign]

    monitor.discover_sessions()
    after_first = reads
    monitor.discover_sessions()

    assert after_first == 1
    assert reads == after_first, "두 번째 조회가 파일을 다시 읽었다"


def test_appending_to_a_rollout_invalidates_its_cache(tmp_path: Path) -> None:
    """A live session keeps updating, so its entry must not go stale."""
    path = _write_rollout(tmp_path)
    monitor = CodexSessionMonitor(tmp_path)
    assert monitor.discover_sessions()[0].user_message_count == 1

    with path.open("a", encoding="utf-8") as stream:
        stream.write(
            json.dumps(
                {
                    "timestamp": "2026-08-27T01:00:09Z",
                    "type": "response_item",
                    "payload": {
                        "type": "message",
                        "role": "user",
                        "content": [{"type": "input_text", "text": "one more"}],
                    },
                }
            )
            + "\n"
        )
        os.utime(path, (path.stat().st_atime, path.stat().st_mtime + 10))

    assert monitor.discover_sessions()[0].user_message_count == 2


def test_cached_discovery_still_resolves_session_details(tmp_path: Path) -> None:
    """A cache hit must not lose the id-to-file mapping detail lookup needs."""
    _write_rollout(tmp_path)
    monitor = CodexSessionMonitor(tmp_path)

    monitor.discover_sessions()
    monitor.discover_sessions()

    assert monitor.get_session_details("thread-01abc") is not None


def test_get_codex_monitor_returns_one_shared_instance() -> None:
    """Eight call sites per request must share one cache, not build eight."""
    assert codex_monitor.get_codex_monitor() is codex_monitor.get_codex_monitor()


def test_cached_session_status_still_ages(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    """Status is derived from the clock, so a cache hit must recompute it.

    A rollout that stops changing is exactly a session that goes idle and then
    completes — freezing its status would pin it to active forever.
    """
    path = tmp_path / "2026" / "08" / "27" / "rollout-live.jsonl"
    path.parent.mkdir(parents=True)
    now = datetime.now(UTC)
    path.write_text(
        json.dumps(
            {
                "timestamp": now.isoformat().replace("+00:00", "Z"),
                "type": "session_meta",
                "payload": {"id": "thread-live", "cwd": "/Users/tester/Work/AOS"},
            }
        )
        + "\n",
        encoding="utf-8",
    )
    monitor = CodexSessionMonitor(tmp_path)

    assert monitor.discover_sessions()[0].status.value == "active"

    # The file never changes, but two hours pass.
    monkeypatch.setattr(codex_monitor, "utcnow", lambda: now + timedelta(hours=2))

    assert monitor.discover_sessions()[0].status.value == "completed"


def _write_numbered_rollout(root: Path, count: int) -> Path:
    """A rollout whose records carry their own index, so a page states its range."""
    path = root / "2026" / "08" / "28" / "rollout-2026-08-28T10-00-00-0numb.jsonl"
    path.parent.mkdir(parents=True, exist_ok=True)
    records: list[dict] = [
        {
            "timestamp": "2026-08-28T01:00:00Z",
            "type": "session_meta",
            "payload": {"id": "thread-numbered", "cwd": "/Users/tester/Work/AOS"},
        }
    ]
    records += [
        {
            "timestamp": "2026-08-28T01:00:00Z",
            "type": "response_item",
            "index": index,
            "payload": {
                "type": "message",
                "role": "user",
                "content": [{"type": "input_text", "text": f"record {index}"}],
            },
        }
        for index in range(1, count)
    ]
    path.write_text("\n".join(json.dumps(record) for record in records), encoding="utf-8")
    return path


def test_transcript_reaches_records_past_the_retain_budget(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    """Pagination is not bounded by how much of the file fits in memory.

    The transcript used to retain a prefix of the file — everything up to
    ``MAX_RETAINED_BYTES`` — then slice that prefix and report its length as the
    total. Records past the budget were unreachable at every offset, and the
    total under-reported them, so nothing in the response said they existed.

    Real data cannot produce this (the largest rollout on hand is 29.7MB against
    a 48MB budget), so the budget is forced small here. That is the only lever
    that reaches the regime.
    """
    _write_numbered_rollout(tmp_path, 40)
    # Fits one 10-record page (~1.8KB) but stops a whole-file read around
    # record 11 — so the old prefix never reached offset 30.
    monkeypatch.setattr(codex_monitor, "MAX_RETAINED_BYTES", 2048)
    monitor = CodexSessionMonitor(tmp_path)

    head, total = monitor.get_session_transcript("thread-numbered", offset=0, limit=10)
    tail, tail_total = monitor.get_session_transcript("thread-numbered", offset=30, limit=10)

    assert total == 40, "total must count the whole file, not the retained prefix"
    assert tail_total == total
    assert [record["index"] for record in tail] == list(range(30, 40))
    assert [record["index"] for record in head[1:]] == list(range(1, 10))


def test_transcript_window_holds_only_the_requested_page(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    """A page costs ``limit`` records, not the whole file.

    Asserted through the byte budget rather than by measuring memory: with a
    budget far smaller than the file, a windowed read still returns a full page
    because only the page is retained. A whole-file read cannot.
    """
    _write_numbered_rollout(tmp_path, 200)
    # Fits one 25-record page (~4.6KB); a whole-file read stops near
    # record 33 of 200.
    monkeypatch.setattr(codex_monitor, "MAX_RETAINED_BYTES", 6144)
    monitor = CodexSessionMonitor(tmp_path)

    page, total = monitor.get_session_transcript("thread-numbered", offset=150, limit=25)

    assert total == 200
    assert [record["index"] for record in page] == list(range(150, 175))


def test_transcript_offset_past_the_end_is_empty_with_a_true_total(
    tmp_path: Path,
) -> None:
    """Paging off the end reports the total rather than zero."""
    _write_numbered_rollout(tmp_path, 12)
    monitor = CodexSessionMonitor(tmp_path)

    page, total = monitor.get_session_transcript("thread-numbered", offset=99, limit=10)

    assert page == []
    assert total == 12


def test_transcript_page_is_whole_regardless_of_the_retain_budget(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    """The byte budget does not reach the transcript path at all.

    Cutting a page short would relocate the bug rather than fix it: the
    dashboard pages by ``(page - 1) * size``, so it would step over whatever did
    not fit and those records would be hidden again. A page therefore returns
    its whole requested range, and the page size is bounded instead.
    """
    _write_numbered_rollout(tmp_path, 40)
    monkeypatch.setattr(codex_monitor, "MAX_RETAINED_BYTES", 256)
    monitor = CodexSessionMonitor(tmp_path)

    page, total = monitor.get_session_transcript("thread-numbered", offset=30, limit=10)

    assert total == 40
    assert [record["index"] for record in page] == list(range(30, 40))


def test_transcript_limit_is_clamped_in_the_monitor(tmp_path: Path) -> None:
    """The monitor does not trust either router to have clamped the page size."""
    _write_numbered_rollout(tmp_path, 400)
    monitor = CodexSessionMonitor(tmp_path)

    page, total = monitor.get_session_transcript("thread-numbered", offset=0, limit=10_000)

    assert total == 400
    assert len(page) == codex_monitor.MAX_TRANSCRIPT_LIMIT


def test_windowed_scan_does_not_collect_the_detail_tail(tmp_path: Path) -> None:
    """A page holds its own records and nothing else.

    ``absorb`` runs for every record, before the window filter, so the 20-entry
    detail tail would otherwise fill with messages decoded from records outside
    the page — content the transcript never returns. With the 2MiB line cap that
    is up to 40MiB riding on top of the bound the window exists to provide.
    Aggregates must survive the change, so the counts are asserted too.
    """
    monitor = CodexSessionMonitor(tmp_path)
    path = _write_numbered_rollout(tmp_path, 60)

    windowed = monitor._read_file(path, record_window=(50, 5))
    whole = monitor._read_file(path, retain=False)

    assert windowed.tail_messages == ()
    assert whole.tail_messages, "the detail path still needs its tail"
    assert windowed.record_count == whole.record_count == 60
    assert windowed.user_count == whole.user_count
    assert len(windowed.records) == 5


def _write_preamble_rollout(root: Path) -> Path:
    """Write a rollout that opens the way real ones do.

    The record shapes come from a survey of 150 local rollouts: a
    ``<recommended_plugins>`` blob and an ``# AGENTS.md instructions for`` blob
    always precede the first genuine turn.
    """
    path = root / "2026" / "09" / "01" / "rollout-2026-09-01T10-00-00-01pre.jsonl"
    path.parent.mkdir(parents=True)
    records = [
        {
            "timestamp": "2026-09-01T01:00:00Z",
            "type": "session_meta",
            "payload": {"id": "thread-preamble", "cwd": "/Users/tester/Work/AOS"},
        },
        {
            "timestamp": "2026-09-01T01:00:01Z",
            "type": "response_item",
            "payload": {
                "type": "message",
                "role": "user",
                "content": [
                    {
                        "type": "input_text",
                        "text": "<recommended_plugins>\nHere is a list of plugins.\n"
                        "</recommended_plugins>",
                    }
                ],
            },
        },
        {
            "timestamp": "2026-09-01T01:00:02Z",
            "type": "response_item",
            "payload": {
                "type": "message",
                "role": "user",
                "content": [
                    {
                        "type": "input_text",
                        "text": "# AGENTS.md instructions for /Users/tester/Work/AOS\n\n"
                        "<INSTRUCTIONS>\n",
                    }
                ],
            },
        },
        {
            "timestamp": "2026-09-01T01:00:03Z",
            "type": "response_item",
            "payload": {
                "type": "message",
                "role": "user",
                "content": [{"type": "input_text", "text": "포트 8000 좀비 소켓 진단해줘"}],
            },
        },
        {
            "timestamp": "2026-09-01T01:00:04Z",
            "type": "response_item",
            "payload": {
                "type": "message",
                "role": "assistant",
                "model": "gpt-5.5",
                "content": [{"type": "output_text", "text": "netstat 으로 확인하겠습니다."}],
            },
        },
    ]
    with path.open("wb") as stream:
        for record in records:
            stream.write(json.dumps(record).encode("utf-8") + b"\n")
    return path


def test_first_messages_skip_the_injected_preamble(tmp_path: Path) -> None:
    """Summaries must come from the conversation, not the harness prologue.

    Without the filter every Codex session summarizes the same two blobs.
    """
    _write_preamble_rollout(tmp_path)
    monitor = CodexSessionMonitor(tmp_path)

    messages = monitor._get_first_messages("thread-preamble")

    assert [message["role"] for message in messages] == ["user", "assistant"]
    assert messages[0]["content"] == "포트 8000 좀비 소켓 진단해줘"
    assert not any("recommended_plugins" in message["content"] for message in messages)
    assert not any("AGENTS.md" in message["content"] for message in messages)


@pytest.mark.asyncio
async def test_generate_summary_serves_the_cache_without_calling_ollama(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    """A cached summary is returned as-is, so a Codex session needs no network."""
    cache_dir = tmp_path / "summaries"
    cache_dir.mkdir()
    (cache_dir / "thread-preamble.txt").write_text("좀비 소켓 진단\n")
    monkeypatch.setenv("SUMMARY_CACHE_DIR", str(cache_dir))
    _write_preamble_rollout(tmp_path)
    monitor = CodexSessionMonitor(tmp_path)

    assert monitor.get_cached_summary("thread-preamble") == "좀비 소켓 진단"
    assert await monitor.generate_summary("thread-preamble") == "좀비 소켓 진단"


def _write_preamble_only_rollout(root: Path) -> Path:
    """A rollout whose every message is injected context and nothing else."""
    path = root / "2026" / "09" / "01" / "rollout-2026-09-01T11-00-00-01only.jsonl"
    path.parent.mkdir(parents=True, exist_ok=True)
    records = [
        {
            "timestamp": "2026-09-01T02:00:00Z",
            "type": "session_meta",
            "payload": {"id": "thread-preamble-only", "cwd": "/Users/tester/Work/AOS"},
        },
        {
            "timestamp": "2026-09-01T02:00:01Z",
            "type": "response_item",
            "payload": {
                "type": "message",
                "role": "user",
                "content": [{"type": "input_text", "text": "<recommended_plugins>\nplugins\n"}],
            },
        },
        {
            "timestamp": "2026-09-01T02:00:02Z",
            "type": "response_item",
            "payload": {
                "type": "message",
                "role": "user",
                "content": [{"type": "input_text", "text": "[Base]\nYou are operating inside X."}],
            },
        },
    ]
    with path.open("wb") as stream:
        for record in records:
            stream.write(json.dumps(record).encode("utf-8") + b"\n")
    return path


def test_first_messages_skip_repeated_harness_blocks(tmp_path: Path) -> None:
    """`[Base]`/`[Context]` repeat verbatim across sessions, so they are dropped.

    Measured over 120 local rollouts, dropping them changes the summary input
    for 40 — otherwise every session of the same harness summarizes alike.
    """
    _write_preamble_rollout(tmp_path)
    monitor = CodexSessionMonitor(tmp_path)
    path = tmp_path / "2026" / "09" / "01" / "rollout-2026-09-01T10-00-00-01pre.jsonl"
    scanned = monitor._read_file(path).messages
    harness = [
        message
        for message in scanned
        if message.content and message.content.startswith(("[Base]", "[Context]"))
    ]

    assert not harness, "fixture guard: this rollout carries no harness blocks"
    assert codex_monitor._is_injected_preamble("[Base]\nYou are operating inside Buzz.")
    assert codex_monitor._is_injected_preamble("[Context]\nScope: thread")
    assert codex_monitor._is_injected_preamble("[New message — arrived while you were working]")
    assert not codex_monitor._is_injected_preamble("포트 8000 좀비 소켓 진단해줘")


def test_first_messages_fall_back_when_only_preamble_exists(tmp_path: Path) -> None:
    """A session of nothing but injected context still summarizes something.

    4 of 120 local rollouts look like this; dropping everything would report
    '대화 내용 없음' for a session that genuinely has content on screen.
    """
    _write_preamble_only_rollout(tmp_path)
    monitor = CodexSessionMonitor(tmp_path)

    messages = monitor._get_first_messages("thread-preamble-only")

    assert messages, "the fallback must not return an empty conversation"
    assert messages[0]["content"].startswith("<recommended_plugins>")


def test_xml_wrapped_user_request_is_not_treated_as_preamble() -> None:
    """Only the observed envelopes are injected; a `<task>` turn is a real request.

    Matching any lone `<tag>` line would drop the request and summarize the
    replies to a question nobody can see.
    """
    assert codex_monitor._is_injected_preamble("<recommended_plugins>\nplugins")
    assert codex_monitor._is_injected_preamble("<user_action>\nopened a file")
    assert not codex_monitor._is_injected_preamble("<task>\n포트 8000 좀비 소켓 진단해줘")
    assert not codex_monitor._is_injected_preamble("<spec>\nbuild the thing")


def test_first_message_scan_stops_at_the_limit(tmp_path: Path) -> None:
    """A summary reads the opening turns, not the whole rollout.

    The detail path retains up to 48MiB; doing that once per session while
    walking every session is the cost this bound exists to avoid.
    """
    _write_preamble_rollout(tmp_path)
    monitor = CodexSessionMonitor(tmp_path)
    path = tmp_path / "2026" / "09" / "01" / "rollout-2026-09-01T10-00-00-01pre.jsonl"

    kept, raw = monitor._scan_first_messages(path, limit=1)

    assert len(kept) == 1
    assert kept[0]["content"] == "포트 8000 좀비 소켓 진단해줘"
    assert len(raw) <= 1


@pytest.mark.asyncio
async def test_cached_summary_is_served_without_opening_the_rollout(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    """A cached summary must not cost a file read, nor need the file to exist."""
    cache_dir = tmp_path / "summaries"
    cache_dir.mkdir()
    (cache_dir / "thread-preamble.txt").write_text("좀비 소켓 진단")
    monkeypatch.setenv("SUMMARY_CACHE_DIR", str(cache_dir))
    _write_preamble_rollout(tmp_path)
    monitor = CodexSessionMonitor(tmp_path)

    def _fail(*args: object, **kwargs: object) -> None:
        raise AssertionError("the rollout must not be read when a summary is cached")

    monkeypatch.setattr(monitor, "_get_first_messages", _fail)

    assert await monitor.generate_summary("thread-preamble") == "좀비 소켓 진단"
