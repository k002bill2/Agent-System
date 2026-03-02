"""Task service for managing task operations like deletion and cancellation."""

from datetime import datetime

from utils.time import utcnow

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


class TaskRetryResult(BaseModel):
    """Result of task retry operation."""

    success: bool
    task_id: str
    previous_status: str | None = None
    retry_count: int = 0
    error: str | None = None


class TaskPauseResult(BaseModel):
    """Result of task pause operation."""

    success: bool
    task_id: str
    previous_status: str | None = None
    paused_at: datetime | None = None
    error: str | None = None


class TaskResumeResult(BaseModel):
    """Result of task resume operation."""

    success: bool
    task_id: str
    previous_status: str | None = None
    resumed_to: str | None = None
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
        now = utcnow()

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
        task.updated_at = utcnow()

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

    @staticmethod
    def retry_task(
        task_id: str,
        tasks: dict[str, TaskNode],
    ) -> TaskRetryResult:
        """
        Retry a failed or cancelled task.

        Resets the task status to pending, clears the error,
        and increments retry_count for tracking.

        Only failed or cancelled tasks can be retried.
        """
        task = tasks.get(task_id)
        if not task:
            return TaskRetryResult(
                success=False,
                task_id=task_id,
                error=f"Task '{task_id}' not found",
            )

        if task.is_deleted:
            return TaskRetryResult(
                success=False,
                task_id=task_id,
                error="Cannot retry a deleted task",
            )

        # Only allow retry for failed or cancelled tasks
        retryable_statuses = {TaskStatus.FAILED, TaskStatus.CANCELLED}
        if task.status not in retryable_statuses:
            return TaskRetryResult(
                success=False,
                task_id=task_id,
                previous_status=task.status.value,
                retry_count=task.retry_count,
                error=f"Task is not retryable (current status: {task.status.value}). Only failed or cancelled tasks can be retried.",
            )

        previous_status = task.status.value

        # Reset task for retry
        task.status = TaskStatus.PENDING
        if task.error:
            # Save error to history before clearing
            task.error_history.append(task.error)
        task.error = None
        task.retry_count += 1
        task.updated_at = utcnow()

        return TaskRetryResult(
            success=True,
            task_id=task_id,
            previous_status=previous_status,
            retry_count=task.retry_count,
        )

    @staticmethod
    def pause_task(
        task_id: str,
        tasks: dict[str, TaskNode],
        reason: str | None = None,
    ) -> TaskPauseResult:
        """
        Pause a task that is in progress or pending.

        Paused tasks are skipped by the orchestrator and can be resumed later.
        """
        task = tasks.get(task_id)
        if not task:
            return TaskPauseResult(
                success=False,
                task_id=task_id,
                error=f"Task '{task_id}' not found",
            )

        if task.is_deleted:
            return TaskPauseResult(
                success=False,
                task_id=task_id,
                error="Cannot pause a deleted task",
            )

        # Only allow pause for pending or in_progress tasks
        pausable_statuses = {TaskStatus.PENDING, TaskStatus.IN_PROGRESS}
        if task.status not in pausable_statuses:
            return TaskPauseResult(
                success=False,
                task_id=task_id,
                previous_status=task.status.value,
                error=f"Task cannot be paused (current status: {task.status.value}). Only pending or in_progress tasks can be paused.",
            )

        previous_status = task.status.value
        now = utcnow()

        # Pause the task
        task.status = TaskStatus.PAUSED
        task.paused_at = now
        task.pause_reason = reason
        task.updated_at = now

        return TaskPauseResult(
            success=True,
            task_id=task_id,
            previous_status=previous_status,
            paused_at=now,
        )

    @staticmethod
    def resume_task(
        task_id: str,
        tasks: dict[str, TaskNode],
    ) -> TaskResumeResult:
        """
        Resume a paused task.

        Sets the task back to pending so the orchestrator will pick it up.
        """
        task = tasks.get(task_id)
        if not task:
            return TaskResumeResult(
                success=False,
                task_id=task_id,
                error=f"Task '{task_id}' not found",
            )

        if task.is_deleted:
            return TaskResumeResult(
                success=False,
                task_id=task_id,
                error="Cannot resume a deleted task",
            )

        # Only allow resume for paused tasks
        if task.status != TaskStatus.PAUSED:
            return TaskResumeResult(
                success=False,
                task_id=task_id,
                previous_status=task.status.value,
                error=f"Task is not paused (current status: {task.status.value}). Only paused tasks can be resumed.",
            )

        previous_status = task.status.value

        # Resume the task
        task.status = TaskStatus.PENDING
        task.paused_at = None
        task.pause_reason = None
        task.updated_at = utcnow()

        return TaskResumeResult(
            success=True,
            task_id=task_id,
            previous_status=previous_status,
            resumed_to="pending",
        )
