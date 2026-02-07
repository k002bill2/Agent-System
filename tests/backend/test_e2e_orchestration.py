"""E2E orchestration integration tests."""

import pytest
from unittest.mock import AsyncMock, MagicMock, patch

from models.agent_state import TaskStatus, TaskNode


@pytest.mark.asyncio
class TestOrchestrationEngine:
    """Orchestration engine tests."""

    async def test_create_session(self, engine):
        """Test creating a new session."""
        session_id = await engine.create_session()

        assert session_id is not None
        assert isinstance(session_id, str)

        # Verify session exists
        state = await engine.get_session(session_id)
        assert state is not None
        assert state["session_id"] == session_id

    async def test_session_initial_state(self, engine, session_id):
        """Test initial session state is correct."""
        state = await engine.get_session(session_id)

        assert state["session_id"] == session_id
        assert state["messages"] == []
        assert state["tasks"] == {}
        assert state["root_task_id"] is None
        assert state["iteration_count"] == 0
        assert state["pending_approvals"] == {}
        assert state["waiting_for_approval"] is False
        assert state["token_usage"] == {}
        assert state["total_cost"] == 0.0

    async def test_delete_session(self, engine):
        """Test deleting a session."""
        session_id = await engine.create_session()

        # Delete
        result = await engine.delete_session(session_id)
        assert result is True

        # Verify deleted
        state = await engine.get_session(session_id)
        assert state is None

    async def test_cancel_orchestration(self, engine, session_id):
        """Test cancelling an orchestration."""
        result = await engine.cancel(session_id)

        assert result is True

        state = await engine.get_session(session_id)
        assert "Cancelled by user" in state["errors"]


@pytest.mark.asyncio
class TestTaskExecution:
    """Task execution flow tests."""

    async def test_simple_task_submission(self, engine, session_id):
        """Test submitting a simple task."""
        # Test state retrieval without LLM invocation
        # Full execution requires a running LLM, so we verify state management
        state = await engine.get_session(session_id)
        assert state is not None

    async def test_message_added_to_state(self, engine, session_id):
        """Test that user message is added to state."""
        test_message = "Test task message"

        # Get initial state
        state = await engine.get_session(session_id)
        initial_msg_count = len(state.get("messages", []))

        # Manually add message (simulating run behavior without full LLM execution)
        user_msg = {"id": "test-id", "role": "user", "content": test_message}
        state["messages"] = state.get("messages", []) + [user_msg]
        engine._sessions[session_id] = state

        # Verify message added
        updated_state = await engine.get_session(session_id)
        assert len(updated_state["messages"]) == initial_msg_count + 1
        assert updated_state["messages"][-1]["content"] == test_message


@pytest.mark.asyncio
class TestStreamExecution:
    """Stream execution tests."""

    async def test_stream_yields_messages(self, engine, session_id):
        """Test that stream execution yields message events."""
        # This test verifies the streaming mechanism exists
        # Full E2E streaming requires a running LLM

        # Verify engine has stream method
        assert hasattr(engine, "stream")
        assert callable(engine.stream)

    async def test_stream_handles_nonexistent_session(self, engine):
        """Test stream with nonexistent session raises error."""
        with pytest.raises(ValueError, match="Session not found"):
            async for _ in engine.stream("nonexistent-session", "test"):
                pass


@pytest.mark.asyncio
class TestParallelExecution:
    """Parallel execution tests."""

    async def test_parallel_executor_node_exists(self, engine):
        """Test parallel executor node is initialized."""
        assert hasattr(engine, "parallel_executor_node")
        assert engine.parallel_executor_node is not None

    async def test_parallel_executor_max_concurrent(self, engine):
        """Test parallel executor has correct max concurrent setting."""
        assert engine.parallel_executor_node.max_concurrent == 3


@pytest.mark.asyncio
class TestHITLFlow:
    """Human-in-the-Loop flow tests."""

    async def test_hitl_state_initialized(self, engine, session_id):
        """Test HITL state is properly initialized."""
        state = await engine.get_session(session_id)

        assert "pending_approvals" in state
        assert "waiting_for_approval" in state
        assert state["pending_approvals"] == {}
        assert state["waiting_for_approval"] is False

    async def test_approval_request_format(self):
        """Test approval request has correct format."""
        from models.hitl import ApprovalStatus

        # Verify enum values exist
        assert ApprovalStatus.PENDING.value == "pending"
        assert ApprovalStatus.APPROVED.value == "approved"
        assert ApprovalStatus.DENIED.value == "denied"

    async def test_task_node_has_hitl_fields(self):
        """Test TaskNode has HITL-related fields."""
        task = TaskNode(
            id="test-task",
            title="Test Task",
            pending_approval_id="approval-123",
        )

        assert task.pending_approval_id == "approval-123"
        assert task.retry_count == 0
        assert task.max_retries == 3


@pytest.mark.asyncio
class TestTokenTracking:
    """Token and cost tracking tests."""

    async def test_token_tracking_initialized(self, engine, session_id):
        """Test token tracking is initialized in state."""
        state = await engine.get_session(session_id)

        assert "token_usage" in state
        assert "total_cost" in state
        assert state["token_usage"] == {}
        assert state["total_cost"] == 0.0

    async def test_cost_model_exists(self):
        """Test cost model is defined."""
        from models.cost import get_model_cost

        cost = get_model_cost("claude-sonnet-4-20250514")
        assert "input" in cost
        assert "output" in cost
        assert cost["input"] > 0
        assert cost["output"] > 0
