"""Authorization regression tests for the Playground API (P1-1).

Codex finding: a non-owner could read another user's Playground session.
These tests pin the fail-closed contract for *every* session-scoped
read/discovery/mutation surface in ``api.playground``:

- ``GET  /api/playground/sessions``                              (discovery)
- ``GET  /api/playground/sessions/{id}``                         (detail)
- ``GET  /api/playground/sessions/{id}/effective-system-prompt`` (context)
- ``GET  /api/playground/sessions/{id}/history``                 (transcripts)
- ``PATCH/DELETE/POST`` settings, clear, message delete, execute, stream

Contract under test:
1. Unauthenticated callers get 401 — never data.
2. An authenticated non-owner gets 404 (existence is not disclosed).
3. ``user_id is None`` (legacy/ownerless) sessions are NOT world-readable;
   only admin/manager may reach them.
4. Only ``admin`` / ``manager`` (or legacy ``is_admin``) bypass ownership.
5. Owner keeps full access to their own session.
6. Session creation binds the owner from the auth context, never from the
   client-supplied ``user_id``.
"""

from __future__ import annotations

import uuid
from unittest.mock import MagicMock

import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient

from api import deps as api_deps
from models.playground import PlaygroundSession
from services import playground_service

OWNER_ID = "11111111-1111-1111-1111-111111111111"
ATTACKER_ID = "22222222-2222-2222-2222-222222222222"
ADMIN_ID = "33333333-3333-3333-3333-333333333333"
MANAGER_ID = "44444444-4444-4444-4444-444444444444"


def _make_user(user_id: str, role: str = "user", is_admin: bool = False) -> MagicMock:
    user = MagicMock()
    user.id = user_id
    user.email = f"{role}@example.com"
    user.name = role
    user.role = role
    user.is_admin = is_admin
    user.is_active = True
    return user


OWNER = _make_user(OWNER_ID)
ATTACKER = _make_user(ATTACKER_ID)
ADMIN = _make_user(ADMIN_ID, role="admin", is_admin=True)
MANAGER = _make_user(MANAGER_ID, role="manager")


@pytest.fixture(autouse=True)
def _isolated_sessions(monkeypatch):
    """Keep the module-level session registry isolated from disk."""
    monkeypatch.setattr(playground_service.service, "_load_sessions", lambda: None)
    monkeypatch.setattr(playground_service.service, "_save_sessions", lambda: None)
    monkeypatch.setattr(playground_service.service, "_fire_and_forget", lambda coro: coro.close())
    playground_service._sessions.clear()
    yield
    playground_service._sessions.clear()


@pytest.fixture
def owned_session() -> PlaygroundSession:
    session = PlaygroundSession(
        id=str(uuid.uuid4()),
        name="owner private session",
        user_id=OWNER_ID,
        system_prompt="SECRET-OWNER-PROMPT",
    )
    playground_service._sessions[session.id] = session
    return session


@pytest.fixture
def ownerless_session() -> PlaygroundSession:
    """Legacy session with no owner — must be fail-closed, not world-readable."""
    session = PlaygroundSession(
        id=str(uuid.uuid4()),
        name="legacy ownerless session",
        user_id=None,
        system_prompt="SECRET-LEGACY-PROMPT",
    )
    playground_service._sessions[session.id] = session
    return session


@pytest_asyncio.fixture
async def app(monkeypatch):
    from api.app import create_app
    from api.deps import clear_engine, set_engine
    from orchestrator import OrchestrationEngine

    # RateLimitService is a process-global singleton whose in-memory counters
    # are keyed by client IP and survive across test modules. This suite sends
    # a few hundred requests from the same TestClient IP, so leaving the
    # middleware on would exhaust the shared budget and make every LATER test
    # module fail with 429 — an ordering-dependent break that only shows up in
    # a full run. Authorization is what is under test here; rate limiting is
    # covered elsewhere.
    monkeypatch.setenv("RATE_LIMIT_ENABLED", "false")

    set_engine(OrchestrationEngine())
    test_app = create_app(title="Playground AuthZ Test", debug=True)
    # DB is never reached in these tests; keep the dependency inert.
    test_app.dependency_overrides[api_deps.get_db_session] = lambda: MagicMock()
    yield test_app
    test_app.dependency_overrides.clear()
    clear_engine()


def _authenticate_as(app, user) -> None:
    """Override both auth dependencies so the test is agnostic to which one
    the route uses (optional-auth is exactly the bug being fixed)."""
    app.dependency_overrides[api_deps.get_current_user] = lambda: user
    app.dependency_overrides[api_deps.get_current_user_optional] = lambda: user


@pytest_asyncio.fixture
async def client(app):
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        yield ac


def _session_scoped_requests(session_id: str) -> list[tuple[str, str, dict]]:
    """Every session-scoped surface, as (method, url, kwargs)."""
    return [
        ("GET", f"/api/playground/sessions/{session_id}", {}),
        ("GET", f"/api/playground/sessions/{session_id}/effective-system-prompt", {}),
        ("GET", f"/api/playground/sessions/{session_id}/history", {}),
        ("PATCH", f"/api/playground/sessions/{session_id}/settings", {"json": {"name": "pwned"}}),
        ("POST", f"/api/playground/sessions/{session_id}/clear", {}),
        ("DELETE", f"/api/playground/sessions/{session_id}/messages/some-message-id", {}),
        ("POST", f"/api/playground/sessions/{session_id}/execute", {"json": {"prompt": "leak"}}),
        (
            "POST",
            f"/api/playground/sessions/{session_id}/execute/stream",
            {"json": {"prompt": "leak"}},
        ),
        ("DELETE", f"/api/playground/sessions/{session_id}", {}),
    ]


# ─────────────────────────────────────────────────────────────
# 1. Unauthenticated access must never return data
# ─────────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_unauthenticated_cannot_reach_any_session_surface(app, client, owned_session):
    """No token → 401 on every session-scoped route (fail-closed)."""
    for method, url, kwargs in _session_scoped_requests(owned_session.id):
        res = await client.request(method, url, **kwargs)
        assert res.status_code == 401, f"{method} {url} returned {res.status_code}, expected 401"


@pytest.mark.asyncio
async def test_unauthenticated_cannot_list_sessions(app, client, owned_session):
    res = await client.get("/api/playground/sessions")
    assert res.status_code == 401


# ─────────────────────────────────────────────────────────────
# 2. Authenticated non-owner must be denied (404, no existence disclosure)
# ─────────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_non_owner_cannot_reach_any_session_surface(app, client, owned_session):
    """The core P1-1 bypass: another logged-in user must not touch the session."""
    _authenticate_as(app, ATTACKER)
    for method, url, kwargs in _session_scoped_requests(owned_session.id):
        res = await client.request(method, url, **kwargs)
        assert res.status_code == 403, f"{method} {url} returned {res.status_code}, expected 403"
        assert "SECRET-OWNER-PROMPT" not in res.text


@pytest.mark.asyncio
async def test_non_owner_detail_does_not_leak_session_body(app, client, owned_session):
    _authenticate_as(app, ATTACKER)
    res = await client.get(f"/api/playground/sessions/{owned_session.id}")
    assert res.status_code == 403
    assert "owner private session" not in res.text


@pytest.mark.asyncio
async def test_non_owner_cannot_read_effective_system_prompt(app, client, owned_session):
    _authenticate_as(app, ATTACKER)
    res = await client.get(f"/api/playground/sessions/{owned_session.id}/effective-system-prompt")
    assert res.status_code == 403
    assert "SECRET-OWNER-PROMPT" not in res.text


@pytest.mark.asyncio
async def test_non_owner_cannot_read_execution_history(app, client, owned_session):
    """History returned [] instead of denying — silent-success is still a leak."""
    _authenticate_as(app, ATTACKER)
    res = await client.get(f"/api/playground/sessions/{owned_session.id}/history")
    assert res.status_code == 403


@pytest.mark.asyncio
async def test_non_owner_cannot_delete_session(app, client, owned_session):
    _authenticate_as(app, ATTACKER)
    res = await client.delete(f"/api/playground/sessions/{owned_session.id}")
    assert res.status_code == 403
    assert owned_session.id in playground_service._sessions, "session was destroyed by a non-owner"


@pytest.mark.asyncio
async def test_non_owner_cannot_mutate_settings(app, client, owned_session):
    _authenticate_as(app, ATTACKER)
    res = await client.patch(
        f"/api/playground/sessions/{owned_session.id}/settings",
        json={"name": "pwned", "system_prompt": "attacker-controlled"},
    )
    assert res.status_code == 403
    assert playground_service._sessions[owned_session.id].name == "owner private session"
    assert playground_service._sessions[owned_session.id].system_prompt == "SECRET-OWNER-PROMPT"


# ─────────────────────────────────────────────────────────────
# 3. Ownerless / legacy sessions are fail-closed
# ─────────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_ownerless_session_is_not_readable_by_regular_user(app, client, ownerless_session):
    """`user_id is None` must not mean 'everyone'."""
    _authenticate_as(app, ATTACKER)
    res = await client.get(f"/api/playground/sessions/{ownerless_session.id}")
    assert res.status_code == 403
    assert "SECRET-LEGACY-PROMPT" not in res.text


@pytest.mark.asyncio
async def test_ownerless_session_excluded_from_listing(app, client, ownerless_session):
    _authenticate_as(app, OWNER)
    res = await client.get("/api/playground/sessions")
    assert res.status_code == 200
    assert [s for s in res.json() if s["id"] == ownerless_session.id] == []


@pytest.mark.asyncio
async def test_admin_can_reach_ownerless_session(app, client, ownerless_session):
    """Explicitly allowed break-glass path for recovering legacy data."""
    _authenticate_as(app, ADMIN)
    res = await client.get(f"/api/playground/sessions/{ownerless_session.id}")
    assert res.status_code == 200


# ─────────────────────────────────────────────────────────────
# 4. Listing is scoped to the caller
# ─────────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_listing_excludes_other_users_sessions(app, client, owned_session):
    _authenticate_as(app, ATTACKER)
    res = await client.get("/api/playground/sessions")
    assert res.status_code == 200
    assert [s for s in res.json() if s["id"] == owned_session.id] == []


@pytest.mark.asyncio
async def test_listing_includes_own_sessions(app, client, owned_session):
    _authenticate_as(app, OWNER)
    res = await client.get("/api/playground/sessions")
    assert res.status_code == 200
    assert [s["id"] for s in res.json()] == [owned_session.id]


@pytest.mark.asyncio
async def test_admin_listing_sees_all_sessions(app, client, owned_session, ownerless_session):
    _authenticate_as(app, ADMIN)
    res = await client.get("/api/playground/sessions")
    assert res.status_code == 200
    ids = {s["id"] for s in res.json()}
    assert {owned_session.id, ownerless_session.id} <= ids


# ─────────────────────────────────────────────────────────────
# 5. Privileged roles and the owner keep access
# ─────────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_owner_can_read_own_session(app, client, owned_session):
    _authenticate_as(app, OWNER)
    res = await client.get(f"/api/playground/sessions/{owned_session.id}")
    assert res.status_code == 200
    assert res.json()["id"] == owned_session.id


@pytest.mark.asyncio
async def test_owner_can_read_effective_system_prompt(app, client, owned_session):
    _authenticate_as(app, OWNER)
    res = await client.get(f"/api/playground/sessions/{owned_session.id}/effective-system-prompt")
    assert res.status_code == 200
    assert res.json()["session_id"] == owned_session.id


@pytest.mark.asyncio
async def test_admin_can_read_other_users_session(app, client, owned_session):
    _authenticate_as(app, ADMIN)
    res = await client.get(f"/api/playground/sessions/{owned_session.id}")
    assert res.status_code == 200


@pytest.mark.asyncio
async def test_manager_can_read_other_users_session(app, client, owned_session):
    _authenticate_as(app, MANAGER)
    res = await client.get(f"/api/playground/sessions/{owned_session.id}")
    assert res.status_code == 200


@pytest.mark.asyncio
async def test_legacy_is_admin_flag_still_grants_access(app, client, owned_session):
    legacy_admin = _make_user("55555555-5555-5555-5555-555555555555", role="user", is_admin=True)
    _authenticate_as(app, legacy_admin)
    res = await client.get(f"/api/playground/sessions/{owned_session.id}")
    assert res.status_code == 200


# ─────────────────────────────────────────────────────────────
# 6. Non-existent sessions & owner binding
# ─────────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_missing_session_returns_404_for_authenticated_user(app, client):
    _authenticate_as(app, OWNER)
    res = await client.get(f"/api/playground/sessions/{uuid.uuid4()}")
    assert res.status_code == 404


@pytest.mark.asyncio
async def test_forbidden_and_missing_are_distinct_statuses(app, client, owned_session):
    """403 for a denied session, 404 for a missing one — a deliberate split.

    This repository standardised on ``authorize_owner_or_privileged`` (403)
    across every protected surface, so playground follows suit rather than
    keeping a local 404 idiom. The trade-off is explicit: an authenticated
    caller can tell an existing-but-denied session ID from a non-existent one.
    That enumeration oracle is accepted here because reaching it already
    requires a valid account, and a second authz idiom in the same file was
    judged the larger risk. Pinned so the choice cannot regress silently.
    """
    _authenticate_as(app, ATTACKER)
    forbidden = await client.get(f"/api/playground/sessions/{owned_session.id}")
    missing = await client.get(f"/api/playground/sessions/{uuid.uuid4()}")
    assert forbidden.status_code == 403
    assert missing.status_code == 404


@pytest.mark.asyncio
async def test_create_session_binds_owner_from_auth_not_request_body(app, client):
    """A client-supplied user_id must never win over the authenticated identity."""
    _authenticate_as(app, ATTACKER)
    res = await client.post(
        "/api/playground/sessions",
        json={"name": "spoofed", "user_id": OWNER_ID},
    )
    assert res.status_code == 200
    assert res.json()["user_id"] == ATTACKER_ID


@pytest.mark.asyncio
async def test_create_session_requires_authentication(app, client):
    res = await client.post("/api/playground/sessions", json={"name": "anon"})
    assert res.status_code == 401


# ─────────────────────────────────────────────────────────────
# 6b. Session model registration gate (create / settings PATCH → 400)
# ─────────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_create_session_with_unknown_model_returns_400(app, client):
    """Registry 에 없는 모델은 세션 생성 전에 명확한 검증 오류(400)로 거부되고,
    아무것도 영속화되지 않는다 (500 이나 조용한 저장 금지)."""
    _authenticate_as(app, OWNER)
    res = await client.post(
        "/api/playground/sessions",
        json={"name": "bad-model", "model": "no-such-model"},
    )
    assert res.status_code == 400
    assert "no-such-model" in res.json()["detail"]
    assert playground_service._sessions == {}


@pytest.mark.asyncio
async def test_create_session_with_disabled_model_returns_400(app, client):
    """gpt-5.4 는 registry 에 있으나 disabled — 저장 전에 400 으로 거부."""
    _authenticate_as(app, OWNER)
    res = await client.post(
        "/api/playground/sessions",
        json={"name": "bad-model", "model": "gpt-5.4"},
    )
    assert res.status_code == 400
    assert "gpt-5.4" in res.json()["detail"]
    assert playground_service._sessions == {}


@pytest.mark.asyncio
async def test_settings_update_with_invalid_model_returns_400_atomically(
    app, client, owned_session
):
    """settings PATCH 의 model 검증 실패는 400 이고, 같은 요청의 다른 필드
    (name)도 반영되지 않아야 한다 — 원자적 거부."""
    _authenticate_as(app, OWNER)
    model_before = owned_session.model  # 같은 객체가 dict 에 있으므로 사전 캡처
    res = await client.patch(
        f"/api/playground/sessions/{owned_session.id}/settings",
        json={"name": "should-not-apply", "model": "no-such-model"},
    )
    assert res.status_code == 400
    unchanged = playground_service._sessions[owned_session.id]
    assert unchanged.name == "owner private session"
    assert unchanged.model == model_before


# ─────────────────────────────────────────────────────────────
# 7. Service layer: fail-closed listing without an identity
# ─────────────────────────────────────────────────────────────


def test_service_list_sessions_without_user_id_returns_nothing(owned_session, ownerless_session):
    """Defense in depth: no identity → no rows, even if a caller forgets to scope."""
    from services.playground_service import PlaygroundService

    assert PlaygroundService.list_sessions(user_id=None) == []


def test_service_list_sessions_scopes_to_owner(owned_session, ownerless_session):
    from services.playground_service import PlaygroundService

    result = PlaygroundService.list_sessions(user_id=OWNER_ID)
    assert [s.id for s in result] == [owned_session.id]


def test_service_list_sessions_include_all_is_explicit(owned_session, ownerless_session):
    from services.playground_service import PlaygroundService

    result = PlaygroundService.list_sessions(user_id=ADMIN_ID, include_all=True)
    assert {s.id for s in result} == {owned_session.id, ownerless_session.id}


# ─────────────────────────────────────────────────────────────
# 8. Non session-scoped Playground surfaces require authentication
#
# ``/tools/test`` reaches code_execute (spawns an interpreter on the host),
# file_read / file_write (arbitrary host paths) and api_call (outbound HTTP).
# ``/compare`` spends LLM budget. Neither may be reachable anonymously.
# ─────────────────────────────────────────────────────────────


_UNAUTHENTICATED_NON_SESSION_REQUESTS: list[tuple[str, str, dict]] = [
    ("GET", "/api/playground/tools", {}),
    (
        "POST",
        "/api/playground/tools/test",
        {"json": {"tool_name": "file_read", "arguments": {"path": "/etc/passwd"}}},
    ),
    (
        "POST",
        "/api/playground/compare",
        {"json": {"prompt": "leak", "agents": ["a", "b"]}},
    ),
    ("GET", "/api/playground/models", {}),
]


@pytest.mark.asyncio
@pytest.mark.parametrize("method,url,kwargs", _UNAUTHENTICATED_NON_SESSION_REQUESTS)
async def test_non_session_surfaces_require_authentication(app, client, method, url, kwargs):
    res = await client.request(method, url, **kwargs)
    assert res.status_code == 401, f"{method} {url} returned {res.status_code}, expected 401"


@pytest.mark.asyncio
async def test_tool_test_does_not_execute_for_unauthenticated_caller(app, client, monkeypatch):
    """The 401 must short-circuit *before* any tool implementation runs."""
    called = False

    async def _tripwire(*_args, **_kwargs):
        nonlocal called
        called = True
        return {"success": True}

    monkeypatch.setattr(playground_service.PlaygroundService, "test_tool", staticmethod(_tripwire))
    res = await client.post(
        "/api/playground/tools/test",
        json={"tool_name": "code_execute", "arguments": {"code": "print(1)"}},
    )
    assert res.status_code == 401
    assert called is False, "tool executed despite missing authentication"


@pytest.mark.asyncio
async def test_compare_binds_scratch_sessions_to_caller(app, client, monkeypatch):
    """Scratch sessions must be owned by the caller, never left ownerless."""
    seen: dict[str, object] = {}

    async def _capture(request, *, user_id=None, llm_access=None):
        seen["user_id"] = user_id
        raise RuntimeError("stop-after-capture")

    monkeypatch.setattr(playground_service.PlaygroundService, "compare", staticmethod(_capture))
    monkeypatch.setattr(
        "api.playground._get_llm_access_for_playground",
        lambda current_user, db: _async_none(),
    )
    _authenticate_as(app, OWNER)
    with pytest.raises(RuntimeError):
        await client.post(
            "/api/playground/compare",
            json={"prompt": "hi", "agents": ["a", "b"]},
        )
    assert seen["user_id"] == OWNER_ID


async def _async_none():
    return None


@pytest.mark.asyncio
async def test_compare_rejects_too_few_agents_for_authenticated_user(app, client, monkeypatch):
    """Validation still applies once authenticated (400, not 401/500)."""
    monkeypatch.setattr(
        "api.playground._get_llm_access_for_playground",
        lambda current_user, db: _async_none(),
    )
    _authenticate_as(app, OWNER)
    res = await client.post("/api/playground/compare", json={"prompt": "hi", "agents": ["a"]})
    assert res.status_code == 400
