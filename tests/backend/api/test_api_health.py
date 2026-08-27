"""HTTP-level API tests for health and basic endpoints."""

from types import SimpleNamespace

import pytest


@pytest.mark.anyio
async def test_health_endpoint(client):
    """GET /api/health returns 200 with a status the badge can render.

    Asserting `== "healthy"` pinned the *environment*, not the endpoint: the
    rich handler reports DEGRADED when any dependency is missing, and CI has
    no `codex` binary so the llm component is degraded there. 200 vs 503 is
    the contract that matters -- the handler returns 200 for HEALTHY and
    DEGRADED, 503 only for UNHEALTHY.
    """
    response = await client.get("/api/health")
    assert response.status_code == 200
    data = response.json()
    assert data["status"] in {"healthy", "degraded"}


@pytest.mark.anyio
async def test_health_contains_version(client):
    """`/api/health` must serve the rich handler, not a bare status stub.

    The dashboard's HealthBadge rejects any body missing `version` or
    `uptime_seconds` and falls back to a permanent "offline" pill, so the
    prefixed mount has to carry the same contract as bare `/health`. A
    `status`-only stub registered ahead of the health router silently
    shadowed this route once (sessions.py) — assert the full shape, not
    `"version" in data or "status" in data`, which is true for both.
    """
    response = await client.get("/api/health")
    data = response.json()
    assert isinstance(data.get("version"), str)
    assert isinstance(data.get("uptime_seconds"), int | float)


@pytest.mark.anyio
async def test_nonexistent_endpoint(client):
    """Requesting a non-existent endpoint should return 404."""
    response = await client.get("/api/nonexistent-endpoint-xyz")
    assert response.status_code == 404


@pytest.mark.anyio
async def test_api_sessions_list(client):
    """GET /api/sessions is not supported (POST only); should return 405."""
    response = await client.get("/api/sessions")
    assert response.status_code == 405


@pytest.mark.anyio
async def test_api_sessions_create(client, authenticated_app):
    """POST /api/sessions should create a new session."""
    response = await client.post(
        "/api/sessions",
        json={},
    )
    assert response.status_code == 200
    data = response.json()
    assert "session_id" in data


@pytest.mark.anyio
async def test_api_sessions_get_nonexistent(client, authenticated_app):
    """GET /api/sessions/{id} with invalid ID should return 404."""
    response = await client.get("/api/sessions/nonexistent-session-id")
    assert response.status_code == 404


@pytest.mark.anyio
async def test_api_projects_list(client, app):
    """GET /api/projects should return a list for an authenticated user."""
    from api.deps import get_current_user

    app.dependency_overrides[get_current_user] = lambda: SimpleNamespace(
        id="test-user", role="admin", is_admin=True, is_active=True
    )
    try:
        response = await client.get("/api/projects")
    finally:
        app.dependency_overrides.pop(get_current_user, None)

    assert response.status_code == 200
    data = response.json()
    assert isinstance(data, list)


@pytest.mark.anyio
async def test_api_agents_list_requires_auth(client):
    """GET /api/agents without auth should return 401."""
    response = await client.get("/api/agents")
    assert response.status_code == 401
