"""OrchestratorNode — 상태 분석·다음 액션 결정·의존성 기반 스케줄링."""

from typing import Any

from models.agent_state import AgentState, TaskNode, TaskStatus
from models.hitl import (
    ORPHANED_APPROVAL_ERROR,
    is_task_orphaned_by_consumed_approval,
    is_task_resumable_after_approval,
)
from utils.time import utcnow

from .base import BaseNode


class OrchestratorNode(BaseNode):
    """
    Main orchestrator node.

    Responsibilities:
    - Analyze current state
    - Decide next action (plan, execute, review, or finish)
    - Coordinate between agents
    """

    SYSTEM_PROMPT = """You are the Orchestrator agent in a multi-agent system.

Your role is to:
1. Analyze the current task state
2. Decide the next action: "plan", "execute", "review", or "finish"
3. Coordinate work between specialized agents

Current capabilities:
- plan: Break down complex tasks into subtasks
- execute: Run a specific task using appropriate tools
- review: Verify completed work and suggest improvements
- finish: Complete the orchestration when all tasks are done

Respond with a JSON object containing:
{
    "thought": "Your reasoning about the current state",
    "next_action": "plan|execute|review|finish",
    "target_task_id": "task_id to act on (if applicable)"
}"""

    async def run(self, state: AgentState) -> dict[str, Any]:
        """Run orchestrator logic."""
        # Increment iteration count
        iteration_count = state.get("iteration_count", 0) + 1

        # Check termination conditions
        if iteration_count >= state.get("max_iterations", 100):
            return {
                "next_action": None,
                "iteration_count": iteration_count,
                "errors": state.get("errors", []) + ["Max iterations reached"],
            }

        # If no tasks exist, we need to plan
        if not state.get("tasks") or not state.get("root_task_id"):
            return {
                "next_action": "plan",
                "iteration_count": iteration_count,
            }

        # Check task statuses
        tasks = state.get("tasks", {})
        root_task_id = state.get("root_task_id")
        pending_approvals = state.get("pending_approvals", {})

        # 소비된 승인에 매달린 잔재 정리.
        # executor 는 승인을 도구 실행 **전에** `consumed` 로 전이·영속화하므로,
        # 실행 도중 프로세스가 죽으면 소비 기록만 남고 결과는 남지 않는다.
        # 도구가 실제로 부수효과를 냈는지 알 수 없으니 재개는 금지다 — 다만
        # 조용히 멈추면 세션이 영영 끝나지 않으므로 실패로 드러낸다.
        orphaned = {
            task_id: task
            for task_id, task in tasks.items()
            if is_task_orphaned_by_consumed_approval(task, pending_approvals)
        }
        if orphaned:
            for task in orphaned.values():
                task.status = TaskStatus.FAILED
                task.error = ORPHANED_APPROVAL_ERROR
                task.updated_at = utcnow()

            return {
                "tasks": orphaned,
                "next_action": None,
                "iteration_count": iteration_count,
                "errors": state.get("errors", []) + [ORPHANED_APPROVAL_ERROR],
            }

        if root_task_id and root_task_id in tasks:
            root_task = tasks[root_task_id]

            if root_task.status == TaskStatus.COMPLETED:
                return {
                    "next_action": None,  # Finish
                    "iteration_count": iteration_count,
                }

            # Find next task to execute (respecting dependencies)
            # 승인이 끝난 WAITING task 도 실행 대상이다 — 승인 대기 중에는 status 가
            # PENDING 이 아니라 WAITING 이라, 이 조건이 없으면 승인해도 executor 로
            # 돌아가지 못하고 그래프가 그대로 끝난다.
            pending_tasks = [
                t
                for t in tasks.values()
                if t.parent_id == root_task_id
                and (
                    t.status == TaskStatus.PENDING
                    or is_task_resumable_after_approval(t, pending_approvals)
                )
            ]

            # Get dependency map from plan_metadata if available
            plan_metadata = state.get("plan_metadata", {})
            dependencies = plan_metadata.get("dependencies", {})

            if pending_tasks:
                # Filter tasks whose dependencies are all completed
                ready_tasks = []
                for task in pending_tasks:
                    task_deps = dependencies.get(task.id, [])
                    if not task_deps:
                        ready_tasks.append(task)
                    else:
                        # Check if all dependencies are completed
                        all_deps_complete = all(
                            tasks.get(dep_id, TaskNode(id="", title="")).status
                            == TaskStatus.COMPLETED
                            for dep_id in task_deps
                        )
                        if all_deps_complete:
                            ready_tasks.append(task)

                if ready_tasks:
                    if len(ready_tasks) >= 2:
                        # Multiple independent tasks ready - use parallel execution
                        # Limit to max 3 concurrent tasks
                        batch_task_ids = [t.id for t in ready_tasks[:3]]
                        return {
                            "next_action": "execute_batch",
                            "batch_task_ids": batch_task_ids,
                            "iteration_count": iteration_count,
                        }
                    else:
                        # Single task - use sequential execution
                        next_task = ready_tasks[0]
                        return {
                            "next_action": "execute",
                            "current_task_id": next_task.id,
                            "iteration_count": iteration_count,
                        }
                elif pending_tasks:
                    # Has pending tasks but none ready (circular dependency or error)
                    return {
                        "next_action": None,
                        "iteration_count": iteration_count,
                        "errors": state.get("errors", [])
                        + ["Dependency deadlock: no tasks ready to execute"],
                    }

            # Check if all children are complete
            all_children_complete = all(
                tasks[child_id].status == TaskStatus.COMPLETED
                for child_id in root_task.children
                if child_id in tasks
            )

            if all_children_complete and root_task.children:
                return {
                    "next_action": "review",
                    "current_task_id": root_task_id,
                    "iteration_count": iteration_count,
                }

        return {
            "next_action": None,
            "iteration_count": iteration_count,
        }
