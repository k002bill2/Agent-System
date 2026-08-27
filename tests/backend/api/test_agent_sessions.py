"""Provider-aware Claude session route tests."""

import asyncio
from datetime import UTC, datetime

import pytest
from fastapi import HTTPException

from api.claude_sessions import core
from api.claude_sessions import sessions as session_routes
from models.claude_session import ClaudeSessionInfo


def _session(provider: str, session_id: str) -> ClaudeSessionInfo:
    now = datetime.now(UTC)
    return ClaudeSessionInfo(
        provider=provider,
        session_id=session_id,
        slug=session_id,
        model="gpt-5.5" if provider == "codex" else "claude-sonnet-4-6",
        project_path="/tmp/AOS",
        project_name="AOS",
        cwd="/tmp/AOS",
        created_at=now,
        last_activity=now,
    )


class _FakeMonitor:
    def __init__(self, sessions: list[ClaudeSessionInfo]) -> None:
        self.sessions = sessions

    def discover_sessions(self, source_user: str | None = None) -> list[ClaudeSessionInfo]:
        return self.sessions

    def get_cached_summary(self, session_id: str) -> str | None:
        return None


@pytest.mark.asyncio
async def test_list_sessions_includes_and_filters_codex(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    claude = _session("claude", "claude-1")
    codex = _session("codex", "codex-1")
    monkeypatch.setattr(core, "get_monitor", lambda: _FakeMonitor([claude]))
    monkeypatch.setattr(core, "get_codex_monitor", lambda: _FakeMonitor([codex]))
    sync_calls: list[list[str]] = []

    async def noop_sync(sessions: list[ClaudeSessionInfo]) -> None:
        sync_calls.append([session.session_id for session in sessions])

    monkeypatch.setattr(core, "_sync_sessions_to_db", noop_sync)

    all_response = await core.list_sessions(provider="all")
    codex_response = await core.list_sessions(provider="codex")
    claude_response = await core.list_sessions(provider="claude")
    await asyncio.sleep(0)

    assert {session.session_id for session in all_response.sessions} == {"claude-1", "codex-1"}
    assert all_response.total_count == 2
    assert [session.session_id for session in codex_response.sessions] == ["codex-1"]
    assert [session.session_id for session in claude_response.sessions] == ["claude-1"]
    assert all(session.provider == "codex" for session in codex_response.sessions)
    assert sync_calls == [["claude-1"], [], ["claude-1"]]


@pytest.mark.asyncio
async def test_legacy_list_default_is_claude_only(monkeypatch: pytest.MonkeyPatch) -> None:
    claude = _session("claude", "claude-1")
    codex = _session("codex", "codex-1")
    monkeypatch.setattr(core, "get_monitor", lambda: _FakeMonitor([claude]))
    monkeypatch.setattr(core, "get_codex_monitor", lambda: _FakeMonitor([codex]))
    monkeypatch.setattr(core, "_sync_sessions_to_db", lambda _: asyncio.sleep(0))

    response = await core.list_sessions()

    assert [session.session_id for session in response.sessions] == ["claude-1"]


@pytest.mark.asyncio
async def test_unknown_summary_returns_not_found(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(session_routes, "_resolve_session", lambda _: (object(), None))

    with pytest.raises(HTTPException) as error:
        await session_routes.get_session_summary("missing")

    assert error.value.status_code == 404


@pytest.mark.asyncio
async def test_codex_session_mutations_are_rejected(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    codex = _session("codex", "codex-1")
    detail = codex.model_copy(update={"recent_messages": [], "messages_truncated": False})

    class _Monitor:
        def get_cached_summary(self, session_id: str) -> str | None:
            return None

    monkeypatch.setattr(session_routes, "_resolve_session", lambda _: (_Monitor(), detail))

    with pytest.raises(HTTPException) as stream_error:
        await session_routes.stream_session("codex-1")
    with pytest.raises(HTTPException) as summary_error:
        await session_routes.get_session_summary("codex-1")

    assert stream_error.value.status_code == 409
    assert summary_error.value.status_code == 409
