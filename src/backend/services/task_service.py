"""Task service for managing task operations like deletion and cancellation."""

from datetime import datetime
from pydantic import BaseModel

from models.agent_state import TaskNode, TaskStatus


class TaskDeleteValidation(BaseModel):
    """Result of task deletion validation."""

    can_delete: bool
    reason: str | None = None
    in_progress_task_ids: list[str] = []


class TaskDeleteResult(BaseModel):
    """Result of task deletion operation."""

    success: bool
    deleted_task_ids: list[str] = []
    error: str | None = None


class TaskCancelResult(BaseModel):
    """Result of task cancellation operation."""

    success: bool
    task_id: str
    previous_status: str | None = None
    error: str | None = None


class TaskService:
    """Service for managing task operations."""

    @staticmethod
    def find_children_recursive(
        task_id: str,
        tasks: dict[str, TaskNode],
    ) -> list[str]:
        """Find all children of a task recursively."""
        result = []
        task = tasks.get(task_id)
        if not task:
            return result

        for child_id in task.children:
            result.append(child_id)
            result.extend(TaskService.find_children_recursive(child_id, tasks))

        return result

    @staticmethod
    def find_in_progress_children(
        task_id: str,
        tasks: dict[str, TaskNode],
    ) -> list[str]:
        """Find all in-progress children of a task (including the task itself)."""
        in_progress = []
        task = tasks.get(task_id)
        if not task:
            return in_progress

        # Check the task itself
        if task.status == TaskStatus.IN_PROGRESS:
            in_progress.append(task_id)

        # Check all children recursively
        all_children = TaskService.find_children_recursive(task_id, tasks)
        for child_id in all_children:
            child = tasks.get(child_id)
            if child and child.status == TaskStatus.IN_PROGRESS:
                in_progress.append(child_id)

        return in_progress

    @staticmethod
    def validate_deletion(
        task_id: str,
        tasks: dict[str, TaskNode],
    ) -> TaskDeleteValidation:
        """
        Validate if a task can be deleted.

        Rules:
        1. Task must exist
        2. Task itself must not be in_progress
        3. No children can be in_progress
        """
        task = tasks.get(task_id)
        if not task:
            return TaskDeleteValidation(
                can_delete=False,
                reason=f"Task '{task_id}' not found",
            )

        # Check if task is already deleted
        if task.is_deleted:
            return TaskDeleteValidation(
                can_delete=False,
                reason="Task is already deleted",
            )

        # Find in-progress tasks (self + children)
        in_progress_ids = TaskService.find_in_progress_children(task_id, tasks)

        if in_progress_ids:
            # Check if the task itself is in progress
            if task_id in in_progress_ids:
                return TaskDeleteValidation(
                    can_delete=False,
                    reason="Cannot delete a task that is in progress. Cancel it first.",
                    in_progress_task_ids=in_progress_ids,
                )
            else:
                return TaskDeleteValidation(
                    can_delete=False,
                    reason=f"Cannot delete: {len(in_progress_ids)} child task(s) are in progress",
                    in_progress_task_ids=in_progress_ids,
                )

        return TaskDeleteValidation(can_delete=True)

    @staticmethod
    def soft_delete_task(
        task_id: str,
        tasks: dict[str, TaskNode],
        include_children: bool = True,
    ) -> TaskDeleteResult:
        """
        Soft delete a task and optionally its children.

        Returns the list of deleted task IDs.
        """
        # Validate first
        validation = TaskService.validate_deletion(task_id, tasks)
        if not validation.can_delete:
            return TaskDeleteResult(
                success=False,
                error=validation.reason,
            )

        deleted_ids = []
        now = datetime.utcnow()

        # Delete the task itself
        task = tasks[task_id]
        task.is_deleted = True
        task.deleted_at = now
        task.updated_at = now
        deleted_ids.append(task_id)

        # Delete children if requested
        if include_children:
            children = TaskService.find_children_recursive(task_id, tasks)
            for child_id in children:
                child = tasks.get(child_id)
                if child and not child.is_deleted:
                    child.is_deleted = True
                    child.deleted_at = now
                    child.updated_at = now
                    deleted_ids.append(child_id)

        return TaskDeleteResult(
            success=True,
            deleted_task_ids=deleted_ids,
        )

    @staticmethod
    def cancel_task(
        task_id: str,
        tasks: dict[str, TaskNode],
    ) -> TaskCancelResult:
        """
        Cancel a task if it's in progress.

        Only in_progress tasks can be cancelled.
        """
        task = tasks.get(task_id)
        if not task:
            return TaskCancelResult(
                success=False,
                task_id=task_id,
                error=f"Task '{task_id}' not found",
            )

        if task.is_deleted:
            return TaskCancelResult(
                success=False,
                task_id=task_id,
                error="Cannot cancel a deleted task",
            )

        if task.status != TaskStatus.IN_PROGRESS:
            return TaskCancelResult(
                success=False,
                task_id=task_id,
                previous_status=task.status.value,
                error=f"Task is not in progress (current status: {task.status.value})",
            )

        previous_status = task.status.value
        task.status = TaskStatus.CANCELLED
        task.updated_at = datetime.utcnow()

        return TaskCancelResult(
            success=True,
            task_id=task_id,
            previous_status=previous_status,
        )

    @staticmethod
    def get_deletion_info(
        task_id: str,
        tasks: dict[str, TaskNode],
    ) -> dict:
        """
        Get information about what would be deleted.

        Returns:
            dict with task info and children count
        """
        task = tasks.get(task_id)
        if not task:
            return {"exists": False}

        children = TaskService.find_children_recursive(task_id, tasks)
        in_progress = TaskService.find_in_progress_children(task_id, tasks)

        return {
            "exists": True,
            "task_id": task_id,
            "title": task.title,
            "status": task.status.value,
            "is_deleted": task.is_deleted,
            "children_count": len(children),
            "in_progress_count": len(in_progress),
            "in_progress_ids": in_progress,
            "can_delete": len(in_progress) == 0 and not task.is_deleted,
        }
