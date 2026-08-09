"""ReviewerNode — 품질 검증과 결과 집계."""

from typing import Any

from models.agent_state import AgentState, TaskStatus
from utils.time import utcnow

from .base import BaseNode


class ReviewerNode(BaseNode):
    """
    Reviewer node for quality assurance.

    Responsibilities:
    - Review completed work
    - Verify correctness
    - Suggest improvements
    """

    SYSTEM_PROMPT = """You are the Reviewer agent in a multi-agent system.

Your role is to:
1. Review the completed task results
2. Verify correctness and quality
3. Approve or request revisions

Respond with a JSON object containing:
{
    "analysis": "Your review of the work",
    "issues": ["List of issues found"],
    "approved": true|false,
    "suggestions": ["Improvement suggestions"]
}"""

    async def run(self, state: AgentState) -> dict[str, Any]:
        """Run reviewer logic."""
        current_task_id = state.get("current_task_id")
        tasks = state.get("tasks", {})

        if not current_task_id or current_task_id not in tasks:
            return {
                "last_error": "No valid task to review",
            }

        task = tasks[current_task_id]

        # Check all subtasks are completed
        all_children_complete = all(
            tasks[child_id].status == TaskStatus.COMPLETED
            for child_id in task.children
            if child_id in tasks
        )

        if all_children_complete:
            # Aggregate results from children
            child_results = [
                tasks[child_id].result
                for child_id in task.children
                if child_id in tasks and tasks[child_id].result
            ]

            task.status = TaskStatus.COMPLETED
            task.result = {
                "summary": "All subtasks completed successfully",
                "child_results": child_results,
            }
            task.updated_at = utcnow()

            return {
                "tasks": {current_task_id: task},
                "messages": [self._create_message("system", f"Review complete for: {task.title}")],
            }

        return {
            "messages": [self._create_message("system", "Review: Some subtasks still pending")],
        }
