"""E2E API integration tests."""

import pytest
from httpx import AsyncClient


@pytest.mark.asyncio
class TestHealthEndpoint:
    """Health endpoint tests."""

    async def test_health_check(self, client: AsyncClient):
        """Test health check endpoint returns healthy status."""
        response = await client.get("/api/health")

        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "healthy"
        assert data["service"] == "agent-orchestrator"


@pytest.mark.asyncio
class TestSessionAPI:
    """Session management API tests."""

    async def test_create_session(self, client: AsyncClient):
        """Test session creation."""
        response = await client.post("/api/sessions", json={})

        assert response.status_code == 200
        data = response.json()
        assert "session_id" in data
        assert data["message"] == "Session created successfully"

    async def test_get_session(self, client: AsyncClient):
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

    async def test_get_nonexistent_session(self, client: AsyncClient):
        """Test getting nonexistent session returns 404."""
        response = await client.get("/api/sessions/nonexistent-id")

        assert response.status_code == 404
        assert "not found" in response.json()["detail"].lower()

    async def test_delete_session(self, client: AsyncClient):
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

    async def test_list_projects(self, client: AsyncClient):
        """Test listing projects."""
        response = await client.get("/api/projects")

        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)

    async def test_get_nonexistent_project(self, client: AsyncClient):
        """Test getting nonexistent project."""
        response = await client.get("/api/projects/nonexistent")

        assert response.status_code == 404


@pytest.mark.asyncio
class TestApprovalAPI:
    """HITL approval API tests."""

    async def test_get_pending_approvals_empty(self, client: AsyncClient):
        """Test getting pending approvals when none exist."""
        # Create session
        create_resp = await client.post("/api/sessions", json={})
        session_id = create_resp.json()["session_id"]

        # Get approvals
        response = await client.get(f"/api/sessions/{session_id}/approvals")

        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        assert len(data) == 0

    async def test_approve_nonexistent(self, client: AsyncClient):
        """Test approving nonexistent approval."""
        # Create session
        create_resp = await client.post("/api/sessions", json={})
        session_id = create_resp.json()["session_id"]

        response = await client.post(
            f"/api/sessions/{session_id}/approve/nonexistent-approval"
        )

        assert response.status_code == 404
