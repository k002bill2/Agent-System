"""E2E HITL (Human-in-the-Loop) tests."""

import pytest
from datetime import datetime
from unittest.mock import AsyncMock, MagicMock, patch

from models.agent_state import TaskStatus, TaskNode, create_initial_state
from models.hitl import ApprovalStatus, RiskLevel, TOOL_RISK_CONFIG


@pytest.mark.asyncio
class TestHITLConfiguration:
    """HITL configuration tests."""

    async def test_tool_risk_config_exists(self):
        """Test tool risk configuration is defined."""
        assert TOOL_RISK_CONFIG is not None
        assert isinstance(TOOL_RISK_CONFIG, dict)

    async def test_high_risk_tools_defined(self):
        """Test high risk tools are properly defined."""
        high_risk_tools = [
            tool
            for tool, config in TOOL_RISK_CONFIG.items()
            if config.risk_level == RiskLevel.HIGH
        ]

        # At least execute_bash should be high risk
        assert "execute_bash" in TOOL_RISK_CONFIG
        assert TOOL_RISK_CONFIG["execute_bash"].risk_level == RiskLevel.HIGH
        assert TOOL_RISK_CONFIG["execute_bash"].requires_approval is True

    async def test_approval_status_enum(self):
        """Test ApprovalStatus enum values."""
        assert ApprovalStatus.PENDING.value == "pending"
        assert ApprovalStatus.APPROVED.value == "approved"
        assert ApprovalStatus.DENIED.value == "denied"


@pytest.mark.asyncio
class TestHITLState:
    """HITL state management tests."""

    async def test_initial_state_no_pending_approvals(self, engine, session_id):
        """Test initial state has no pending approvals."""
        state = await engine.get_session(session_id)

        assert state["pending_approvals"] == {}
        assert state["waiting_for_approval"] is False

    async def test_add_pending_approval(self, engine, session_id):
        """Test adding a pending approval request."""
        state = await engine.get_session(session_id)

        # Simulate adding approval request
        approval_id = "approval-123"
        approval_request = {
            "id": approval_id,
            "task_id": "task-456",
            "tool_name": "execute_bash",
            "tool_args": {"command": "rm -rf /tmp/test"},
            "risk_level": "HIGH",
            "risk_description": "Executing shell command with destructive potential",
            "status": ApprovalStatus.PENDING.value,
            "created_at": datetime.utcnow().isoformat(),
        }

        state["pending_approvals"][approval_id] = approval_request
        state["waiting_for_approval"] = True
        engine._sessions[session_id] = state

        # Verify
        updated_state = await engine.get_session(session_id)
        assert approval_id in updated_state["pending_approvals"]
        assert updated_state["waiting_for_approval"] is True

    async def test_approve_pending_request(self, engine, session_id):
        """Test approving a pending request."""
        state = await engine.get_session(session_id)

        # Add approval request
        approval_id = "approval-123"
        state["pending_approvals"][approval_id] = {
            "id": approval_id,
            "task_id": "task-456",
            "tool_name": "read_file",
            "tool_args": {"path": "/test.txt"},
            "risk_level": "LOW",
            "status": ApprovalStatus.PENDING.value,
            "created_at": datetime.utcnow().isoformat(),
        }
        state["waiting_for_approval"] = True

        # Approve
        state["pending_approvals"][approval_id]["status"] = (
            ApprovalStatus.APPROVED.value
        )
        state["waiting_for_approval"] = False
        engine._sessions[session_id] = state

        # Verify
        updated_state = await engine.get_session(session_id)
        assert updated_state["pending_approvals"][approval_id]["status"] == "approved"
        assert updated_state["waiting_for_approval"] is False

    async def test_deny_pending_request(self, engine, session_id):
        """Test denying a pending request."""
        state = await engine.get_session(session_id)

        # Add approval request
        approval_id = "approval-456"
        state["pending_approvals"][approval_id] = {
            "id": approval_id,
            "task_id": "task-789",
            "tool_name": "execute_bash",
            "tool_args": {"command": "rm -rf /"},
            "risk_level": "HIGH",
            "status": ApprovalStatus.PENDING.value,
            "created_at": datetime.utcnow().isoformat(),
        }
        state["waiting_for_approval"] = True

        # Deny
        state["pending_approvals"][approval_id]["status"] = ApprovalStatus.DENIED.value
        state["pending_approvals"][approval_id]["resolver_note"] = "Too dangerous"
        state["waiting_for_approval"] = False
        engine._sessions[session_id] = state

        # Verify
        updated_state = await engine.get_session(session_id)
        assert updated_state["pending_approvals"][approval_id]["status"] == "denied"
        assert (
            "Too dangerous"
            in updated_state["pending_approvals"][approval_id]["resolver_note"]
        )


@pytest.mark.asyncio
class TestHITLAPIIntegration:
    """HITL API integration tests."""

    async def test_get_approvals_endpoint(self, client):
        """Test getting pending approvals via API."""
        # Create session
        create_resp = await client.post("/api/sessions", json={})
        session_id = create_resp.json()["session_id"]

        # Get approvals
        response = await client.get(f"/api/sessions/{session_id}/approvals")

        assert response.status_code == 200
        assert isinstance(response.json(), list)

    async def test_approve_endpoint_requires_valid_approval(self, client):
        """Test approve endpoint requires valid approval ID."""
        # Create session
        create_resp = await client.post("/api/sessions", json={})
        session_id = create_resp.json()["session_id"]

        # Try to approve nonexistent
        response = await client.post(f"/api/sessions/{session_id}/approve/nonexistent")

        assert response.status_code == 404

    async def test_deny_endpoint_requires_valid_approval(self, client):
        """Test deny endpoint requires valid approval ID."""
        # Create session
        create_resp = await client.post("/api/sessions", json={})
        session_id = create_resp.json()["session_id"]

        # Try to deny nonexistent
        response = await client.post(f"/api/sessions/{session_id}/deny/nonexistent")

        assert response.status_code == 404


@pytest.mark.asyncio
class TestTaskNodeHITLFields:
    """TaskNode HITL field tests."""

    async def test_task_node_pending_approval_field(self):
        """Test TaskNode has pending_approval_id field."""
        task = TaskNode(
            id="task-1",
            title="Test Task",
            pending_approval_id=None,
        )

        assert task.pending_approval_id is None

        # Update with approval
        task.pending_approval_id = "approval-123"
        assert task.pending_approval_id == "approval-123"

    async def test_task_node_retry_fields(self):
        """Test TaskNode has retry tracking fields."""
        task = TaskNode(
            id="task-1",
            title="Test Task",
        )

        assert task.retry_count == 0
        assert task.max_retries == 3
        assert task.error_history == []

    async def test_task_node_error_history(self):
        """Test TaskNode tracks error history."""
        task = TaskNode(
            id="task-1",
            title="Test Task",
        )

        # Simulate retries
        task.error_history.append("First attempt failed: timeout")
        task.retry_count = 1

        task.error_history.append("Second attempt failed: rate limit")
        task.retry_count = 2

        assert len(task.error_history) == 2
        assert task.retry_count == 2
        assert task.retry_count < task.max_retries  # Can still retry
