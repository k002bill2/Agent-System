"""HTTP-level wiring for the provider-neutral session routes.

The unit tests in ``test_agent_sessions`` call the handlers directly, which
verifies the logic but skips everything FastAPI does around it: whether the
router is actually mounted, whether ``provider`` survives query extraction and
its ``Literal`` validation, and whether the routes are behind the same
authorization as the legacy ones. A typo in the prefix or a parameter FastAPI
cannot parse passes those unit tests and breaks only at runtime.
"""

from collections.abc import Iterator
from datetime import UTC, datetime
from types import SimpleNamespace

import pytest
from fastapi.testclient import TestClient

from api.app import app
from api.claude_sessions import core
from api.deps import get_current_user
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


@pytest.fixture
def client(monkeypatch: pytest.MonkeyPatch) -> Iterator[TestClient]:
    """A client whose session data is fake but whose routing is real."""
    monkeypatch.setattr(core, "get_monitor", lambda: _FakeMonitor([_session("claude", "c-1")]))
    monkeypatch.setattr(core, "get_codex_monitor", lambda: _FakeMonitor([_session("codex", "x-1")]))

    async def noop_sync(sessions: list[ClaudeSessionInfo]) -> None:
        return None

    monkeypatch.setattr(core, "_sync_sessions_to_db", noop_sync)
    app.dependency_overrides[get_current_user] = lambda: SimpleNamespace(
        id="test-user", role="admin", is_admin=True
    )
    try:
        yield TestClient(app)
    finally:
        app.dependency_overrides.pop(get_current_user, None)


def test_neutral_route_is_mounted_and_defaults_to_all_providers(client: TestClient) -> None:
    response = client.get("/api/agent-sessions")

    assert response.status_code == 200
    assert {s["session_id"] for s in response.json()["sessions"]} == {"c-1", "x-1"}


@pytest.mark.parametrize(
    ("provider", "expected"),
    [("all", {"c-1", "x-1"}), ("claude", {"c-1"}), ("codex", {"x-1"})],
)
def test_provider_query_parameter_reaches_the_handler(
    client: TestClient, provider: str, expected: set[str]
) -> None:
    """Proves FastAPI extracts ``provider`` — a direct handler call cannot."""
    response = client.get("/api/agent-sessions", params={"provider": provider})

    assert response.status_code == 200
    assert {s["session_id"] for s in response.json()["sessions"]} == expected


def test_unknown_provider_is_rejected_by_validation(client: TestClient) -> None:
    """The Literal must be enforced at the boundary, not silently ignored."""
    assert client.get("/api/agent-sessions", params={"provider": "bogus"}).status_code == 422


def test_legacy_route_stays_claude_only_by_default(client: TestClient) -> None:
    """The documented legacy contract must not start returning Codex rows."""
    response = client.get("/api/claude-sessions")

    assert response.status_code == 200
    assert {s["session_id"] for s in response.json()["sessions"]} == {"c-1"}


@pytest.mark.parametrize(
    "path",
    [
        "/api/agent-sessions",
        "/api/agent-sessions/any-id",
        "/api/agent-sessions/any-id/transcript",
        "/api/agent-sessions/any-id/activity",
    ],
)
def test_neutral_routes_require_authorization(path: str) -> None:
    """Router-level dependencies do not follow an imported handler.

    The alias re-registers handlers from ``api.claude_sessions`` on its own
    router, so it has to declare the same policy itself — otherwise the same
    data is served with the auth stripped off.
    """
    assert TestClient(app).get(path).status_code in (401, 403)
