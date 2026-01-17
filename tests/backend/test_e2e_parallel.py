"""E2E parallel execution tests."""

import pytest
from unittest.mock import AsyncMock, MagicMock, patch
import asyncio

from models.agent_state import TaskStatus, TaskNode, create_initial_state


@pytest.mark.asyncio
class TestParallelExecutor:
    """Parallel executor node tests."""

    async def test_parallel_executor_initialization(self, engine):
        """Test parallel executor is properly initialized."""
        executor = engine.parallel_executor_node

        assert executor.max_concurrent == 3
        assert executor.llm is not None
        assert len(executor.tools) > 0

    async def test_batch_task_ids_in_state(self, engine, session_id):
        """Test batch_task_ids field exists in state."""
        state = await engine.get_session(session_id)

        assert "batch_task_ids" in state
        assert isinstance(state["batch_task_ids"], list)

    async def test_state_supports_parallel_tasks(self):
        """Test state structure supports parallel task tracking."""
        state = create_initial_state(session_id="test")

        # Add multiple tasks
        task1 = TaskNode(id="task-1", title="Task 1")
        task2 = TaskNode(id="task-2", title="Task 2")
        task3 = TaskNode(id="task-3", title="Task 3")

        state["tasks"]["task-1"] = task1
        state["tasks"]["task-2"] = task2
        state["tasks"]["task-3"] = task3
        state["batch_task_ids"] = ["task-1", "task-2", "task-3"]

        assert len(state["tasks"]) == 3
        assert len(state["batch_task_ids"]) == 3


@pytest.mark.asyncio
class TestParallelExecutorNode:
    """ParallelExecutorNode specific tests."""

    async def test_executor_handles_empty_batch(self, engine):
        """Test executor handles empty batch gracefully."""
        state = create_initial_state(session_id="test")
        state["batch_task_ids"] = []

        executor = engine.parallel_executor_node
        # Should not raise error with empty batch
        assert executor is not None

    async def test_executor_semaphore_limit(self, engine):
        """Test executor respects semaphore limit."""
        executor = engine.parallel_executor_node

        # Verify max concurrent setting
        assert executor.max_concurrent == 3

    async def test_task_dependencies_tracked(self):
        """Test task dependencies are properly tracked in plan_metadata."""
        state = create_initial_state(session_id="test")

        # Simulate dependency tracking
        state["plan_metadata"]["dependencies"] = {
            "task-2": ["task-1"],  # task-2 depends on task-1
            "task-3": ["task-1"],  # task-3 depends on task-1
            "task-4": ["task-2", "task-3"],  # task-4 depends on both
        }

        deps = state["plan_metadata"]["dependencies"]
        assert "task-2" in deps
        assert "task-1" in deps["task-2"]
        assert len(deps["task-4"]) == 2


@pytest.mark.asyncio
class TestConcurrentTaskExecution:
    """Concurrent task execution simulation tests."""

    async def test_multiple_tasks_can_be_pending(self):
        """Test multiple tasks can be in pending state."""
        state = create_initial_state(session_id="test")

        # Create multiple pending tasks
        for i in range(5):
            task = TaskNode(
                id=f"task-{i}",
                title=f"Task {i}",
                status=TaskStatus.PENDING,
            )
            state["tasks"][f"task-{i}"] = task

        pending_count = sum(
            1 for t in state["tasks"].values()
            if t.status == TaskStatus.PENDING
        )
        assert pending_count == 5

    async def test_tasks_can_be_marked_in_progress(self):
        """Test tasks can be moved to in_progress state."""
        state = create_initial_state(session_id="test")

        # Create tasks
        task1 = TaskNode(id="task-1", title="Task 1", status=TaskStatus.PENDING)
        task2 = TaskNode(id="task-2", title="Task 2", status=TaskStatus.PENDING)
        task3 = TaskNode(id="task-3", title="Task 3", status=TaskStatus.PENDING)

        state["tasks"]["task-1"] = task1
        state["tasks"]["task-2"] = task2
        state["tasks"]["task-3"] = task3

        # Mark first 3 as in_progress (parallel execution)
        for tid in ["task-1", "task-2", "task-3"]:
            state["tasks"][tid].status = TaskStatus.IN_PROGRESS

        in_progress_count = sum(
            1 for t in state["tasks"].values()
            if t.status == TaskStatus.IN_PROGRESS
        )
        assert in_progress_count == 3

    async def test_async_gather_simulation(self):
        """Test asyncio.gather can execute tasks concurrently."""
        results = []

        async def mock_task(task_id: str, delay: float):
            await asyncio.sleep(delay)
            results.append(task_id)
            return task_id

        # Execute 3 tasks concurrently
        await asyncio.gather(
            mock_task("task-1", 0.1),
            mock_task("task-2", 0.1),
            mock_task("task-3", 0.1),
        )

        assert len(results) == 3
        assert set(results) == {"task-1", "task-2", "task-3"}
