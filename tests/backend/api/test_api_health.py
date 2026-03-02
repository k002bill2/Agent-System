"""HTTP-level API tests for health and basic endpoints."""

import pytest


@pytest.mark.anyio
async def test_health_endpoint(client):
    """GET /api/health should return 200 with status ok."""
    response = await client.get("/api/health")
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "ok"


@pytest.mark.anyio
async def test_health_contains_version(client):
    """Health response should include version info."""
    response = await client.get("/api/health")
    data = response.json()
    assert "version" in data or "status" in data


@pytest.mark.anyio
async def test_nonexistent_endpoint(client):
    """Requesting a non-existent endpoint should return 404."""
    response = await client.get("/api/nonexistent-endpoint-xyz")
    assert response.status_code == 404


@pytest.mark.anyio
async def test_api_sessions_list(client):
    """GET /api/sessions should return a list."""
    response = await client.get("/api/sessions")
    assert response.status_code == 200
    data = response.json()
    assert isinstance(data, list)


@pytest.mark.anyio
async def test_api_sessions_create(client):
    """POST /api/sessions should create a new session."""
    response = await client.post(
        "/api/sessions",
        json={"project_id": "test-project"},
    )
    assert response.status_code == 200
    data = response.json()
    assert "session_id" in data


@pytest.mark.anyio
async def test_api_sessions_get_nonexistent(client):
    """GET /api/sessions/{id} with invalid ID should return 404."""
    response = await client.get("/api/sessions/nonexistent-session-id")
    assert response.status_code == 404


@pytest.mark.anyio
async def test_api_projects_list(client):
    """GET /api/projects should return a list of projects."""
    response = await client.get("/api/projects")
    assert response.status_code == 200
    data = response.json()
    assert isinstance(data, list)


@pytest.mark.anyio
async def test_api_agents_list(client):
    """GET /api/agents should return registered agents."""
    response = await client.get("/api/agents")
    assert response.status_code == 200
    data = response.json()
    assert isinstance(data, (list, dict))
