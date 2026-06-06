"""Tests for ClaudeSessionMonitor truncation metadata.

Focus: the session-details path must expose WHETHER content was truncated
(content_truncated / full_length) and WHETHER the recent_messages list is a
partial window (messages_truncated), so the UI can offer a "view full" affordance
instead of silently hiding conversation content.
"""

import json
import uuid
from datetime import UTC, datetime
from pathlib import Path

import pytest

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
    mon = ClaudeSessionMonitor(
        claude_projects_dirs=[str(projects_dir)], include_external=False
    )
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
