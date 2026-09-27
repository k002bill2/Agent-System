"""Tests for ClaudeSessionMonitor truncation metadata.

Focus: the session-details path must expose WHETHER content was truncated
(content_truncated / full_length) and WHETHER the recent_messages list is a
partial window (messages_truncated), so the UI can offer a "view full" affordance
instead of silently hiding conversation content.
"""

import json
import uuid
from datetime import UTC, datetime, timedelta
from pathlib import Path

import pytest

from models.claude_session import (
    MODEL_COSTS,
    calculate_cost,
    calculate_cost_detail,
    resolve_model_price,
)
from services.claude_session_monitor import (
    RECENT_MESSAGE_CONTENT_LIMIT,
    ClaudeSessionMonitor,
)


def _write_session(projects_dir: Path, lines: list[dict]) -> str:
    """Write a JSONL session file and return its session_id (UUID)."""
    session_id = str(uuid.uuid4())
    project_dir = projects_dir / "-Users-tester-Work-Demo"
    project_dir.mkdir(parents=True, exist_ok=True)
    session_file = project_dir / f"{session_id}.jsonl"
    with open(session_file, "w", encoding="utf-8") as f:
        for entry in lines:
            f.write(json.dumps(entry) + "\n")
    return session_id


def _user_line(text: str, ts: str = "2026-06-06T10:00:00Z") -> dict:
    return {"type": "user", "timestamp": ts, "message": {"content": text}}


def _assistant_line(text: str, ts: str = "2026-06-06T10:00:01Z") -> dict:
    return {
        "type": "assistant",
        "timestamp": ts,
        "message": {
            "model": "claude-opus-4-8",
            "content": [{"type": "text", "text": text}],
            "usage": {"input_tokens": 1, "output_tokens": 1},
        },
    }


@pytest.fixture
def monitor(tmp_path: Path) -> ClaudeSessionMonitor:
    projects_dir = tmp_path / "projects"
    projects_dir.mkdir()
    mon = ClaudeSessionMonitor(claude_projects_dirs=[str(projects_dir)], include_external=False)
    # Expose the temp projects dir for helpers
    mon._test_projects_dir = projects_dir  # type: ignore[attr-defined]
    return mon


def test_long_message_sets_content_truncated_and_full_length(monitor):
    """A message longer than the cap must be flagged, not silently cut."""
    projects_dir: Path = monitor._test_projects_dir
    long_text = "A" * (RECENT_MESSAGE_CONTENT_LIMIT + 500)
    session_id = _write_session(projects_dir, [_user_line(long_text)])

    detail = monitor.get_session_details(session_id)

    assert detail is not None
    msg = detail.recent_messages[-1]
    assert msg.content is not None
    assert len(msg.content) == RECENT_MESSAGE_CONTENT_LIMIT
    assert msg.content_truncated is True
    assert msg.full_length == RECENT_MESSAGE_CONTENT_LIMIT + 500


def test_short_message_is_not_flagged(monitor):
    """A short message must NOT be flagged as truncated."""
    projects_dir: Path = monitor._test_projects_dir
    session_id = _write_session(projects_dir, [_user_line("hello world")])

    detail = monitor.get_session_details(session_id)

    assert detail is not None
    msg = detail.recent_messages[-1]
    assert msg.content == "hello world"
    assert msg.content_truncated is False
    assert msg.full_length is None


def test_many_messages_sets_messages_truncated(monitor):
    """When there are more messages than the recent window, flag it."""
    projects_dir: Path = monitor._test_projects_dir
    lines = []
    for i in range(25):
        ts = datetime(2026, 6, 6, 10, 0, i, tzinfo=UTC).isoformat()
        lines.append(_user_line(f"message number {i}", ts=ts))
    session_id = _write_session(projects_dir, lines)

    detail = monitor.get_session_details(session_id)

    assert detail is not None
    assert detail.message_count == 25
    assert len(detail.recent_messages) <= 20
    assert detail.messages_truncated is True


def test_few_messages_not_messages_truncated(monitor):
    """When all messages fit in the window, do not flag truncation."""
    projects_dir: Path = monitor._test_projects_dir
    lines = [_user_line("a"), _assistant_line("b")]
    session_id = _write_session(projects_dir, lines)

    detail = monitor.get_session_details(session_id)

    assert detail is not None
    assert detail.messages_truncated is False


def test_cached_session_status_still_ages(
    monitor: ClaudeSessionMonitor, monkeypatch: pytest.MonkeyPatch
) -> None:
    """Status is clock-derived, so a cache hit must recompute it.

    A session file that stops changing is exactly one that goes idle and then
    completes; serving the cached status would pin it to active forever.
    """
    import services.claude_session_monitor as claude_monitor
    from services.claude_session_monitor import _session_cache

    _session_cache.clear()
    now = datetime.now(UTC)
    stamp = now.isoformat().replace("+00:00", "Z")
    _write_session(
        monitor._test_projects_dir,  # type: ignore[attr-defined]
        [_user_line("hi", ts=stamp), _assistant_line("hello", ts=stamp)],
    )

    assert monitor.discover_sessions()[0].status.value == "active"

    # The file never changes, but two hours pass.
    monkeypatch.setattr(claude_monitor, "utcnow", lambda: now + timedelta(hours=2))

    assert monitor.discover_sessions()[0].status.value == "completed"


# ---------------------------------------------------------------------------
# Usage accounting: idempotency, cache tokens, price provenance (감사 §4, §6)
# ---------------------------------------------------------------------------


def _assistant_usage_line(
    *,
    message_id: str | None,
    input_tokens: int,
    output_tokens: int,
    cache_read: int | None = None,
    cache_creation: int | None = None,
    model: str = "claude-opus-4-8",
    ts: str = "2026-06-06T10:00:01Z",
    with_usage: bool = True,
) -> dict:
    """Build one assistant JSONL line mirroring the real transcript schema.

    실데이터 실측(400 파일 / 43,510 assistant 라인): `message.id` 누락 0건,
    `message.usage` 누락 0건, 중복 `message.id` 를 가진 파일 337건.
    """
    message: dict = {"model": model, "content": [{"type": "text", "text": "hi"}]}
    if message_id is not None:
        message["id"] = message_id
    if with_usage:
        usage: dict = {"input_tokens": input_tokens, "output_tokens": output_tokens}
        if cache_read is not None:
            usage["cache_read_input_tokens"] = cache_read
        if cache_creation is not None:
            usage["cache_creation_input_tokens"] = cache_creation
        message["usage"] = usage
    return {"type": "assistant", "timestamp": ts, "message": message}


def _parse(monitor, lines: list[dict]):
    """Write a session file and parse it directly (no cache reuse across ids)."""
    projects_dir = monitor._test_projects_dir
    session_id = _write_session(projects_dir, lines)
    session_file = projects_dir / "-Users-tester-Work-Demo" / f"{session_id}.jsonl"
    return monitor._parse_session_file(session_file, "-Users-tester-Work-Demo")


def test_repeated_same_message_id_usage_is_counted_once(monitor):
    """같은 `message.id` 가 반복 기록돼도 usage 는 1회만 계상된다 (감사 §4).

    수정 전에는 3줄이 그대로 합산되어 input=30 / output=300 이 나왔다.
    """
    lines = [
        _assistant_usage_line(message_id="msg_dup", input_tokens=10, output_tokens=100)
        for _ in range(3)
    ]

    info = _parse(monitor, lines)

    assert info is not None
    assert info.total_input_tokens == 10
    assert info.total_output_tokens == 100


def test_distinct_message_ids_are_summed(monitor):
    """서로 다른 id 는 정상 합산된다 (중복제거가 과잉 적용되지 않는다)."""
    lines = [
        _assistant_usage_line(message_id="msg_a", input_tokens=10, output_tokens=100),
        _assistant_usage_line(message_id="msg_b", input_tokens=7, output_tokens=13),
    ]

    info = _parse(monitor, lines)

    assert info is not None
    assert info.total_input_tokens == 17
    assert info.total_output_tokens == 113


def test_same_message_id_keeps_last_usage_value(monitor):
    """같은 id 의 usage 가 갱신되면 마지막 값을 취한다 (last-wins, 누계 갱신 대비)."""
    lines = [
        _assistant_usage_line(message_id="msg_x", input_tokens=10, output_tokens=50),
        _assistant_usage_line(message_id="msg_x", input_tokens=10, output_tokens=120),
    ]

    info = _parse(monitor, lines)

    assert info is not None
    assert info.total_output_tokens == 120


def test_usage_less_line_does_not_erase_recorded_usage(monitor):
    """usage 가 없는 같은 id 후속 라인이 기존 값을 0 으로 덮지 않는다."""
    lines = [
        _assistant_usage_line(message_id="msg_y", input_tokens=10, output_tokens=100),
        _assistant_usage_line(
            message_id="msg_y", input_tokens=0, output_tokens=0, with_usage=False
        ),
    ]

    info = _parse(monitor, lines)

    assert info is not None
    assert info.total_output_tokens == 100


def test_usage_entries_without_id_are_counted_and_surfaced(monitor):
    """id 없는 라인은 dedupe 불가 → 1회만 가산하고 카운터로 표면화한다."""
    lines = [
        _assistant_usage_line(message_id=None, input_tokens=1, output_tokens=2),
        _assistant_usage_line(message_id=None, input_tokens=3, output_tokens=4),
    ]

    info = _parse(monitor, lines)

    assert info is not None
    assert info.total_input_tokens == 4
    assert info.total_output_tokens == 6
    assert info.usage_entries_without_id == 2


def test_cache_tokens_are_separate_and_do_not_change_input_total(monitor):
    """cache 토큰은 별도 필드로 수집되고 기존 총계·비용에 섞이지 않는다."""
    lines = [
        _assistant_usage_line(
            message_id="msg_c",
            input_tokens=10,
            output_tokens=20,
            cache_read=23520,
            cache_creation=21819,
        )
    ]

    info = _parse(monitor, lines)

    assert info is not None
    assert info.total_input_tokens == 10
    assert info.cache_read_tokens == 23520
    assert info.cache_creation_tokens == 21819
    # 비용은 cache 토큰을 포함하지 않는다 (단가 미검증).
    assert info.estimated_cost == pytest.approx(calculate_cost("claude-opus-4-8", 10, 20))


def test_price_source_is_table_for_registered_model(monitor):
    lines = [_assistant_usage_line(message_id="m1", input_tokens=1, output_tokens=1)]

    info = _parse(monitor, lines)

    assert info is not None
    assert info.price_source == "table"


def test_price_source_is_fallback_for_unregistered_model(monitor):
    """미등록 모델의 추정 비용이 기본 단가임을 숨기지 않는다 (감사 §6)."""
    lines = [
        _assistant_usage_line(
            message_id="m1",
            input_tokens=1,
            output_tokens=1,
            # 실존 family 이름을 쓰면 레지스트리 갱신 때마다 조용히 "table" 로 바뀐다.
            model="claude-unregistered-test-model",
        )
    ]

    info = _parse(monitor, lines)

    assert info is not None
    assert info.price_source == "fallback"


def test_resolve_model_price_reports_source():
    prices, source = resolve_model_price("claude-sonnet-5")
    assert source == "table"
    assert prices is MODEL_COSTS["claude-sonnet-5"]

    _, unknown_source = resolve_model_price("totally-unknown-model")
    assert unknown_source == "fallback"


def test_calculate_cost_detail_matches_legacy_calculate_cost():
    """신규 detail 함수가 기존 `calculate_cost` 와 값이 동일해야 한다 (계약 불변)."""
    cost, source = calculate_cost_detail("claude-sonnet-5", 1000, 1000)
    assert cost == pytest.approx(calculate_cost("claude-sonnet-5", 1000, 1000))
    assert source == "table"
