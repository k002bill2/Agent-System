"""E2E API integration tests."""

from types import SimpleNamespace

import pytest
from httpx import AsyncClient


@pytest.mark.asyncio
class TestHealthEndpoint:
    """Health endpoint tests."""

    async def test_health_check(self, client: AsyncClient):
        """Health check returns the rich handler's status/version/uptime body.

        This used to assert `service == "agent-orchestrator"`, which pinned
        `/api/health` to a bare stub in sessions.py that shadowed the health
        router's prefixed mount. The dashboard badge needs version and uptime,
        so the stub shape is the wrong contract to lock.
        """
        response = await client.get("/api/health")

        assert response.status_code == 200
        data = response.json()
        # Not `== "healthy"`: the handler reports the real dependency state and
        # CI has no `codex` binary, so llm is degraded there. 200 already means
        # HEALTHY or DEGRADED -- UNHEALTHY would have been 503.
        assert data["status"] in {"healthy", "degraded"}
        assert isinstance(data["version"], str)
        assert isinstance(data["uptime_seconds"], int | float)


@pytest.mark.asyncio
class TestSessionAPI:
    """Session management API tests."""

    async def test_create_session(self, client: AsyncClient, authenticated_app):
        """Test session creation."""
        response = await client.post("/api/sessions", json={})

        assert response.status_code == 200
        data = response.json()
        assert "session_id" in data
        assert data["message"] == "Session created successfully"

    async def test_get_session(self, client: AsyncClient, authenticated_app):
        """Test getting session state."""
        # Create session first
        create_resp = await client.post("/api/sessions", json={})
        session_id = create_resp.json()["session_id"]

        # Get session
        response = await client.get(f"/api/sessions/{session_id}")

        assert response.status_code == 200
        data = response.json()
        assert data["session_id"] == session_id
        assert "tasks" in data
        assert "agents" in data
        assert data["iteration_count"] == 0

    async def test_get_nonexistent_session(self, client: AsyncClient, authenticated_app):
        """Test getting nonexistent session returns 404."""
        response = await client.get("/api/sessions/nonexistent-id")

        assert response.status_code == 404
        assert "not found" in response.json()["detail"].lower()

    async def test_delete_session(self, client: AsyncClient, authenticated_app):
        """Test session deletion."""
        # Create session
        create_resp = await client.post("/api/sessions", json={})
        session_id = create_resp.json()["session_id"]

        # Delete session
        response = await client.delete(f"/api/sessions/{session_id}")

        assert response.status_code == 200

        # Verify it's deleted
        get_resp = await client.get(f"/api/sessions/{session_id}")
        assert get_resp.status_code == 404


@pytest.mark.asyncio
class TestProjectAPI:
    """Project management API tests."""

    async def test_list_projects(self, client: AsyncClient, app):
        """Test listing projects for an authenticated user."""
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

    async def test_get_nonexistent_project(self, client: AsyncClient, app):
        """Test getting nonexistent project for an authenticated admin."""
        from api.deps import get_current_user

        app.dependency_overrides[get_current_user] = lambda: SimpleNamespace(
            id="test-user", role="admin", is_admin=True, is_active=True
        )
        try:
            response = await client.get("/api/projects/nonexistent")
        finally:
            app.dependency_overrides.pop(get_current_user, None)

        assert response.status_code == 404


@pytest.mark.asyncio
class TestApprovalAPI:
    """HITL approval API tests."""

    async def test_get_pending_approvals_empty(self, client: AsyncClient, app):
        """Test getting pending approvals when none exist for an admin."""
        from api.deps import get_current_user

        app.dependency_overrides[get_current_user] = lambda: SimpleNamespace(
            id="test-user", role="admin", is_admin=True, is_active=True
        )
        # Create session
        create_resp = await client.post("/api/sessions", json={})
        session_id = create_resp.json()["session_id"]

        try:
            response = await client.get(f"/api/sessions/{session_id}/approvals")
        finally:
            app.dependency_overrides.pop(get_current_user, None)

        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        assert len(data) == 0

    async def test_approve_nonexistent(self, client: AsyncClient, app):
        """Test approving nonexistent approval for an admin."""
        from api.deps import get_current_user

        app.dependency_overrides[get_current_user] = lambda: SimpleNamespace(
            id="test-user", role="admin", is_admin=True, is_active=True
        )
        # Create session
        create_resp = await client.post("/api/sessions", json={})
        session_id = create_resp.json()["session_id"]

        try:
            response = await client.post(
                f"/api/sessions/{session_id}/approve/nonexistent-approval"
            )
        finally:
            app.dependency_overrides.pop(get_current_user, None)

        assert response.status_code == 404
