"""Parallel task executor for concurrent task execution."""

import asyncio
from datetime import datetime
from typing import Any

from langchain_core.language_models import BaseChatModel
from langchain_core.tools import BaseTool

from models.agent_state import AgentState, TaskNode, TaskStatus
from orchestrator.nodes import BaseNode, ExecutorNode

# Maximum concurrent tasks (configurable)
DEFAULT_MAX_CONCURRENT_TASKS = 3


class ParallelExecutorNode(BaseNode):
    """
    Executes multiple independent tasks concurrently.

    Uses asyncio.gather() with a semaphore to limit concurrent executions.
    This node is triggered when the orchestrator identifies multiple
    ready-to-execute tasks with no dependencies between them.
    """

    def __init__(
        self,
        llm: BaseChatModel | None = None,
        tools: list[BaseTool] | None = None,
        max_concurrent: int = DEFAULT_MAX_CONCURRENT_TASKS,
    ):
        """
        Initialize the parallel executor.

        Args:
            llm: Language model for task execution
            tools: Available tools for execution
            max_concurrent: Maximum number of concurrent task executions
        """
        super().__init__(llm)
        self.tools = tools or []
        self.max_concurrent = max_concurrent

        # Create a single-task executor for reuse
        self.executor = ExecutorNode(llm=llm, tools=tools)

    async def _execute_with_semaphore(
        self,
        task_id: str,
        state: AgentState,
        semaphore: asyncio.Semaphore,
    ) -> dict[str, Any]:
        """
        Execute a single task with semaphore-controlled concurrency.

        Args:
            task_id: ID of the task to execute
            state: Current agent state
            semaphore: Semaphore for concurrency control

        Returns:
            Dict with task updates
        """
        async with semaphore:
            # Create a task-specific state copy
            task_state = dict(state)
            task_state["current_task_id"] = task_id

            # Execute using the single-task executor
            result = await self.executor.run(task_state)

            return {
                "task_id": task_id,
                "result": result,
            }

    def _merge_results(
        self,
        results: list[dict[str, Any]],
        state: AgentState,
    ) -> dict[str, Any]:
        """
        Merge results from parallel executions into a single state update.

        Args:
            results: List of execution results
            state: Original state

        Returns:
            Merged state update
        """
        merged_tasks = dict(state.get("tasks", {}))
        all_messages = []
        all_errors = list(state.get("errors", []))
        waiting_for_approval = False
        pending_approvals = dict(state.get("pending_approvals", {}))

        # Accumulate token usage
        token_usage = dict(state.get("token_usage", {}))
        total_cost = state.get("total_cost", 0.0)

        completed_count = 0
        failed_count = 0

        for task_result in results:
            _task_id = task_result["task_id"]
            result = task_result["result"]

            # Merge task updates
            if "tasks" in result:
                for tid, task in result["tasks"].items():
                    merged_tasks[tid] = task
                    if task.status == TaskStatus.COMPLETED:
                        completed_count += 1
                    elif task.status == TaskStatus.FAILED:
                        failed_count += 1

            # Collect messages
            if "messages" in result:
                all_messages.extend(result["messages"])

            # Collect errors
            if "errors" in result:
                all_errors.extend(result["errors"])

            # Check for waiting states (HITL)
            if result.get("waiting_for_approval"):
                waiting_for_approval = True

            # Merge pending approvals
            if "pending_approvals" in result:
                pending_approvals.update(result["pending_approvals"])

            # Merge token usage
            if "token_usage" in result:
                for agent_name, usage in result["token_usage"].items():
                    if agent_name not in token_usage:
                        token_usage[agent_name] = usage
                    else:
                        for key in ["total_input_tokens", "total_output_tokens", "total_tokens", "call_count"]:
                            token_usage[agent_name][key] = (
                                token_usage[agent_name].get(key, 0) + usage.get(key, 0)
                            )
                        token_usage[agent_name]["total_cost_usd"] = (
                            token_usage[agent_name].get("total_cost_usd", 0.0) +
                            usage.get("total_cost_usd", 0.0)
                        )

            if "total_cost" in result:
                total_cost += result["total_cost"] - state.get("total_cost", 0.0)

        # Add summary message
        all_messages.append({
            "id": f"batch-{datetime.utcnow().isoformat()}",
            "role": "system",
            "content": (
                f"Parallel execution completed: {completed_count} succeeded, "
                f"{failed_count} failed out of {len(results)} tasks"
            ),
            "timestamp": datetime.utcnow().isoformat(),
        })

        return {
            "tasks": merged_tasks,
            "messages": all_messages,
            "errors": all_errors,
            "waiting_for_approval": waiting_for_approval,
            "pending_approvals": pending_approvals,
            "token_usage": token_usage,
            "total_cost": total_cost,
            "batch_results": {
                "total": len(results),
                "completed": completed_count,
                "failed": failed_count,
            },
        }

    async def run(self, state: AgentState) -> dict[str, Any]:
        """
        Execute multiple tasks in parallel.

        Expects state to contain batch_task_ids with list of task IDs to execute.

        Args:
            state: Current agent state with batch_task_ids

        Returns:
            Merged state update from all executions
        """
        batch_task_ids = state.get("batch_task_ids", [])
        tasks = state.get("tasks", {})

        # Validate batch tasks
        valid_task_ids = [
            tid for tid in batch_task_ids
            if tid in tasks and tasks[tid].status == TaskStatus.PENDING
        ]

        if not valid_task_ids:
            return {
                "messages": [self._create_message(
                    "system",
                    "Parallel executor: No valid tasks to execute"
                )],
            }

        # Create semaphore for concurrency control
        semaphore = asyncio.Semaphore(self.max_concurrent)

        # Execute tasks in parallel
        execution_tasks = [
            self._execute_with_semaphore(task_id, state, semaphore)
            for task_id in valid_task_ids
        ]

        results = await asyncio.gather(*execution_tasks, return_exceptions=True)

        # Handle any exceptions
        processed_results = []
        for task_id, result in zip(valid_task_ids, results, strict=False):
            if isinstance(result, Exception):
                # Create error result for failed tasks
                task = tasks[task_id]
                task.status = TaskStatus.FAILED
                task.error = str(result)
                task.updated_at = datetime.utcnow()

                processed_results.append({
                    "task_id": task_id,
                    "result": {
                        "tasks": {task_id: task},
                        "errors": [str(result)],
                    },
                })
            else:
                processed_results.append(result)

        # Merge all results
        return self._merge_results(processed_results, state)


def get_ready_tasks(state: AgentState) -> list[str]:
    """
    Get all task IDs that are ready to execute (no pending dependencies).

    Args:
        state: Current agent state

    Returns:
        List of task IDs ready for execution
    """
    tasks = state.get("tasks", {})
    root_task_id = state.get("root_task_id")
    plan_metadata = state.get("plan_metadata", {})
    dependencies = plan_metadata.get("dependencies", {})

    if not root_task_id:
        return []

    ready_tasks = []

    # Get all pending tasks under root
    pending_tasks = [
        t for t in tasks.values()
        if t.status == TaskStatus.PENDING and t.parent_id == root_task_id
    ]

    for task in pending_tasks:
        task_deps = dependencies.get(task.id, [])

        if not task_deps:
            # No dependencies, task is ready
            ready_tasks.append(task.id)
        else:
            # Check if all dependencies are completed
            all_deps_complete = all(
                tasks.get(dep_id, TaskNode(id="", title="")).status == TaskStatus.COMPLETED
                for dep_id in task_deps
            )
            if all_deps_complete:
                ready_tasks.append(task.id)

    return ready_tasks


def should_use_parallel_execution(ready_tasks: list[str]) -> bool:
    """
    Determine if parallel execution should be used.

    Uses parallel execution when there are 2+ independent tasks ready.

    Args:
        ready_tasks: List of ready task IDs

    Returns:
        True if parallel execution should be used
    """
    return len(ready_tasks) >= 2
