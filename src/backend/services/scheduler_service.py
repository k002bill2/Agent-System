"""Workflow scheduler service using APScheduler."""

import logging
from datetime import datetime
from typing import Any

from apscheduler.schedulers.background import BackgroundScheduler
from apscheduler.triggers.cron import CronTrigger
from croniter import croniter

logger = logging.getLogger(__name__)


class SchedulerService:
    """Manages cron-based workflow scheduling."""

    def __init__(self):
        self._scheduler = BackgroundScheduler()
        self._schedules: dict[str, dict[str, Any]] = {}  # workflow_id -> schedule config
        self._started = False

    def start(self):
        """Start the scheduler."""
        if not self._started:
            self._scheduler.start()
            self._started = True

    def shutdown(self):
        """Shutdown the scheduler."""
        if self._started:
            self._scheduler.shutdown(wait=False)
            self._started = False

    def add_schedule(
        self,
        workflow_id: str,
        cron_expression: str,
        timezone: str = "UTC",
    ) -> dict:
        """Add a cron schedule for a workflow."""
        # Validate cron expression
        if not croniter.is_valid(cron_expression):
            raise ValueError(f"Invalid cron expression: {cron_expression}")

        # Remove existing schedule if any
        self.remove_schedule(workflow_id)

        # Parse cron fields
        parts = cron_expression.split()
        if len(parts) == 5:
            minute, hour, day, month, day_of_week = parts
        else:
            raise ValueError(f"Cron expression must have 5 fields: {cron_expression}")

        trigger = CronTrigger(
            minute=minute,
            hour=hour,
            day=day,
            month=month,
            day_of_week=day_of_week,
            timezone=timezone,
        )

        job = self._scheduler.add_job(
            self._trigger_workflow,
            trigger=trigger,
            args=[workflow_id],
            id=f"workflow_{workflow_id}",
            replace_existing=True,
        )

        schedule = {
            "workflow_id": workflow_id,
            "cron": cron_expression,
            "timezone": timezone,
            "is_active": True,
            "next_run": job.next_run_time.isoformat() if job.next_run_time else None,
            "created_at": datetime.utcnow().isoformat(),
        }
        self._schedules[workflow_id] = schedule
        return schedule

    def remove_schedule(self, workflow_id: str) -> bool:
        """Remove a workflow's schedule."""
        job_id = f"workflow_{workflow_id}"
        try:
            self._scheduler.remove_job(job_id)
        except Exception:
            pass
        return self._schedules.pop(workflow_id, None) is not None

    def get_schedule(self, workflow_id: str) -> dict | None:
        """Get the schedule for a workflow."""
        schedule = self._schedules.get(workflow_id)
        if schedule:
            # Update next run time
            job = self._scheduler.get_job(f"workflow_{workflow_id}")
            if job and job.next_run_time:
                schedule["next_run"] = job.next_run_time.isoformat()
        return schedule

    def pause_schedule(self, workflow_id: str) -> bool:
        """Pause a workflow's schedule."""
        job_id = f"workflow_{workflow_id}"
        try:
            self._scheduler.pause_job(job_id)
            if workflow_id in self._schedules:
                self._schedules[workflow_id]["is_active"] = False
            return True
        except Exception:
            return False

    def resume_schedule(self, workflow_id: str) -> bool:
        """Resume a paused schedule."""
        job_id = f"workflow_{workflow_id}"
        try:
            self._scheduler.resume_job(job_id)
            if workflow_id in self._schedules:
                self._schedules[workflow_id]["is_active"] = True
            return True
        except Exception:
            return False

    def get_next_runs(self, cron_expression: str, count: int = 5) -> list[str]:
        """Get next N run times for a cron expression (for preview)."""
        if not croniter.is_valid(cron_expression):
            raise ValueError(f"Invalid cron expression: {cron_expression}")
        cron = croniter(cron_expression, datetime.utcnow())
        return [cron.get_next(datetime).isoformat() for _ in range(count)]

    def _trigger_workflow(self, workflow_id: str):
        """Callback when a scheduled workflow should run."""
        import asyncio

        try:
            loop = asyncio.get_event_loop()
            if loop.is_running():
                asyncio.ensure_future(self._async_trigger(workflow_id))
            else:
                loop.run_until_complete(self._async_trigger(workflow_id))
        except RuntimeError:
            # No event loop - create one
            asyncio.run(self._async_trigger(workflow_id))

    async def _async_trigger(self, workflow_id: str):
        """Async workflow trigger."""
        try:
            from models.workflow import TriggerType, WorkflowRunTrigger
            from services.workflow_service import get_workflow_service

            service = get_workflow_service()
            trigger = WorkflowRunTrigger(trigger_type=TriggerType.SCHEDULE)
            await service.trigger_run(workflow_id, trigger)
            logger.info(f"Scheduled workflow triggered: {workflow_id}")
        except Exception as e:
            logger.error(f"Failed to trigger scheduled workflow {workflow_id}: {e}")


# Singleton
_scheduler: SchedulerService | None = None


def get_scheduler_service() -> SchedulerService:
    global _scheduler
    if _scheduler is None:
        _scheduler = SchedulerService()
        _scheduler.start()
    return _scheduler
