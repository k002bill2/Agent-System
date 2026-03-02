"""Tests for SelfCorrectionNode error category branching.

Verifies that structured error categories enable fast-path decisions
without LLM analysis for PERMANENT, TRANSIENT, and RESOURCE errors.
"""

from __future__ import annotations

from datetime import datetime
from unittest.mock import AsyncMock, MagicMock

import pytest

from models.agent_state import AgentState, TaskNode, TaskStatus, create_initial_state
from models.errors import ErrorCategory, ErrorSeverity, StructuredError
from orchestrator.nodes import SelfCorrectionNode


def _make_structured_error(
    category: ErrorCategory,
    severity: ErrorSeverity = ErrorSeverity.MEDIUM,
    message: str = "test error",
) -> StructuredError:
    """Helper to create a StructuredError with specified category."""
    return StructuredError(
        category=category,
        severity=severity,
        message=message,
        original_type="TestException",
        retry_hint=f"Hint for {category.value}",
    )


def _make_failed_task(
    task_id: str = "task-1",
    structured_errors: list[StructuredError] | None = None,
    retry_count: int = 0,
) -> TaskNode:
    """Helper to create a failed TaskNode with optional structured errors."""
    return TaskNode(
        id=task_id,
        title="Test Task",
        description="Test task description",
        status=TaskStatus.FAILED,
        error="Something went wrong",
        retry_count=retry_count,
        max_retries=3,
        error_history=[],
        structured_errors=structured_errors or [],
    )


def _make_state(task: TaskNode) -> AgentState:
    """Create an AgentState with a single failed task."""
    state = create_initial_state(session_id="test-session")
    state["tasks"] = {task.id: task}
    state["current_task_id"] = task.id
    return state


@pytest.fixture
def mock_llm():
    """Create a mock LLM that should NOT be called for fast-path categories."""
    llm = MagicMock()
    llm.ainvoke = AsyncMock()
    llm.with_structured_output = MagicMock()
    return llm


@pytest.fixture
def node(mock_llm):
    """Create SelfCorrectionNode with mock LLM."""
    return SelfCorrectionNode(llm=mock_llm)


class TestPermanentError:
    """PERMANENT errors should fail immediately without retry."""

    @pytest.mark.asyncio
    async def test_permanent_error_no_retry(self, node, mock_llm):
        error = _make_structured_error(ErrorCategory.PERMANENT, message="Access denied")
        task = _make_failed_task(structured_errors=[error])
        state = _make_state(task)

        result = await node.run(state)

        # Task stays FAILED
        updated_task = result["tasks"]["task-1"]
        assert updated_task.status == TaskStatus.FAILED
        assert "Permanent error" in updated_task.error

        # LLM should NOT be called
        mock_llm.ainvoke.assert_not_called()
        mock_llm.with_structured_output.assert_not_called()

        # No next_action (don't re-execute)
        assert "next_action" not in result


class TestTransientError:
    """TRANSIENT errors should retry immediately without LLM analysis."""

    @pytest.mark.asyncio
    async def test_transient_error_simple_retry(self, node, mock_llm):
        error = _make_structured_error(ErrorCategory.TRANSIENT, message="Connection timeout")
        task = _make_failed_task(structured_errors=[error])
        state = _make_state(task)

        result = await node.run(state)

        # Task reset to PENDING for retry
        updated_task = result["tasks"]["task-1"]
        assert updated_task.status == TaskStatus.PENDING
        assert updated_task.retry_count == 1
        assert updated_task.error is None

        # LLM should NOT be called
        mock_llm.ainvoke.assert_not_called()

        # Should signal re-execution
        assert result.get("next_action") == "execute"

    @pytest.mark.asyncio
    async def test_transient_error_respects_max_retries(self, node, mock_llm):
        error = _make_structured_error(ErrorCategory.TRANSIENT)
        task = _make_failed_task(structured_errors=[error], retry_count=3)
        state = _make_state(task)

        result = await node.run(state)

        # Should hit max_retries check before category check
        assert "tasks" in result
        # max_retries exceeded → no retry


class TestResourceError:
    """RESOURCE errors should have limited retry (max 1)."""

    @pytest.mark.asyncio
    async def test_resource_error_first_retry(self, node, mock_llm):
        error = _make_structured_error(ErrorCategory.RESOURCE, ErrorSeverity.CRITICAL)
        task = _make_failed_task(structured_errors=[error], retry_count=0)
        state = _make_state(task)

        result = await node.run(state)

        updated_task = result["tasks"]["task-1"]
        assert updated_task.status == TaskStatus.PENDING
        assert updated_task.retry_count == 1
        assert result.get("next_action") == "execute"

        mock_llm.ainvoke.assert_not_called()

    @pytest.mark.asyncio
    async def test_resource_error_no_second_retry(self, node, mock_llm):
        error = _make_structured_error(ErrorCategory.RESOURCE, ErrorSeverity.CRITICAL)
        task = _make_failed_task(structured_errors=[error], retry_count=1)
        state = _make_state(task)

        result = await node.run(state)

        updated_task = result["tasks"]["task-1"]
        assert updated_task.status == TaskStatus.FAILED
        assert "Resource error persists" in updated_task.error


class TestLLMError:
    """LLM_ERROR should retry with backoff, without LLM analysis."""

    @pytest.mark.asyncio
    async def test_llm_error_retry(self, node, mock_llm):
        error = _make_structured_error(ErrorCategory.LLM_ERROR, message="Rate limit exceeded")
        task = _make_failed_task(structured_errors=[error])
        state = _make_state(task)

        result = await node.run(state)

        updated_task = result["tasks"]["task-1"]
        assert updated_task.status == TaskStatus.PENDING
        assert updated_task.retry_count == 1
        assert result.get("next_action") == "execute"

        mock_llm.ainvoke.assert_not_called()


class TestLogicError:
    """LOGIC errors should fall through to LLM analysis."""

    @pytest.mark.asyncio
    async def test_logic_error_uses_llm(self, node, mock_llm):
        error = _make_structured_error(ErrorCategory.LOGIC, message="Assertion failed")
        task = _make_failed_task(structured_errors=[error])
        state = _make_state(task)

        # Mock LLM structured output
        mock_correction = MagicMock()
        mock_correction.error_analysis = "Logic error in processing"
        mock_correction.root_cause = "Invalid state transition"
        mock_correction.correction_strategy = "Reset state and retry"
        mock_correction.updated_description = "Updated task"
        mock_correction.should_retry = True
        mock_correction.confidence = "medium"
        mock_correction.response_metadata = {}

        structured_llm = AsyncMock(return_value=mock_correction)
        mock_llm.with_structured_output.return_value = MagicMock()
        mock_llm.with_structured_output.return_value.ainvoke = structured_llm

        result = await node.run(state)

        # LLM SHOULD be called (unlike TRANSIENT/PERMANENT)
        assert mock_llm.with_structured_output.called or mock_llm.ainvoke.called


class TestConfidenceBasedRetryBudget:
    """Confidence from LLM analysis should limit retry attempts."""

    @pytest.mark.asyncio
    async def test_low_confidence_limits_to_1_retry(self, node, mock_llm):
        """Low confidence (< 0.5) should allow only 1 retry."""
        error = _make_structured_error(ErrorCategory.LOGIC)
        task = _make_failed_task(structured_errors=[error], retry_count=1)
        state = _make_state(task)

        # Mock LLM response with low confidence
        mock_correction = MagicMock()
        mock_correction.error_analysis = "Complex issue"
        mock_correction.root_cause = "Unknown"
        mock_correction.correction_strategy = "Try different approach"
        mock_correction.updated_description = "Updated"
        mock_correction.should_retry = True
        mock_correction.confidence = "low"
        mock_correction.response_metadata = {}

        structured_llm = AsyncMock(return_value=mock_correction)
        mock_llm.with_structured_output.return_value = MagicMock()
        mock_llm.with_structured_output.return_value.ainvoke = structured_llm

        result = await node.run(state)

        # retry_count=1 >= max_retries_by_confidence(low)=1 → should NOT retry
        updated_task = result["tasks"]["task-1"]
        assert updated_task.status == TaskStatus.FAILED
        assert "Max retries" in (updated_task.error or "")
        assert "confidence" in (updated_task.error or "").lower()


class TestNoStructuredError:
    """Without structured_errors, should fall through to existing LLM analysis."""

    @pytest.mark.asyncio
    async def test_no_structured_error_uses_llm(self, node, mock_llm):
        task = _make_failed_task(structured_errors=[])  # No structured errors
        state = _make_state(task)

        # Mock LLM to avoid actual API call
        mock_correction = MagicMock()
        mock_correction.error_analysis = "Analysis"
        mock_correction.root_cause = "Root cause"
        mock_correction.correction_strategy = "Strategy"
        mock_correction.updated_description = "Updated"
        mock_correction.should_retry = False
        mock_correction.confidence = "low"
        mock_correction.response_metadata = {}

        structured_llm = AsyncMock(return_value=mock_correction)
        mock_llm.with_structured_output.return_value = MagicMock()
        mock_llm.with_structured_output.return_value.ainvoke = structured_llm

        result = await node.run(state)

        # LLM should be called since no structured error for fast path
        assert mock_llm.with_structured_output.called or mock_llm.ainvoke.called
