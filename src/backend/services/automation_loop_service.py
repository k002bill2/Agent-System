"""Automation loop service — periodic condition monitoring with action triggers."""

import asyncio
import logging
import uuid
from datetime import datetime
from enum import Enum
from typing import Any, Literal

from pydantic import BaseModel, Field

from utils.time import utcnow

logger = logging.getLogger(__name__)


# ── Models ──────────────────────────────────────────────────


class ConditionDef(BaseModel, frozen=True):
    """Trigger condition definition."""

    metric: str  # e.g., "health.database.latency_ms"
    operator: Literal["gt", "lt", "eq", "ne", "gte", "lte"]
    threshold: float
    duration_seconds: int = 0  # Sustained duration before trigger


class ActionDef(BaseModel, frozen=True):
    """Action to execute when conditions are met."""

    type: Literal["webhook", "workflow", "log", "notify", "pipeline"]
    target: str  # webhook URL, workflow_id, log message, etc.
    params: dict[str, Any] = {}


class AutomationLoopConfig(BaseModel, frozen=True):
    """Automation loop configuration (immutable)."""

    name: str
    interval_seconds: int = 60
    max_iterations: int | None = None
    conditions: list[ConditionDef]
    actions: list[ActionDef]
    cooldown_seconds: int = 300


class LoopState(str, Enum):
    """Loop execution state."""

    PENDING = "pending"
    RUNNING = "running"
    STOPPED = "stopped"
    COMPLETED = "completed"
    ERROR = "error"


class ConditionResult(BaseModel, frozen=True):
    """Result of a single condition evaluation."""

    metric: str
    current_value: float | None = None
    threshold: float
    operator: str
    triggered: bool
    message: str = ""


class ActionResult(BaseModel, frozen=True):
    """Result of a single action execution."""

    action_type: str
    target: str
    success: bool
    message: str = ""
    executed_at: datetime = Field(default_factory=utcnow)


class LoopStatus(BaseModel):
    """Loop status snapshot."""

    loop_id: str
    name: str
    state: LoopState
    iteration_count: int = 0
    max_iterations: int | None = None
    last_check_at: datetime | None = None
    last_triggered_at: datetime | None = None
    conditions_met_count: int = 0
    actions_executed_count: int = 0
    created_at: datetime = Field(default_factory=utcnow)
    error: str | None = None


# ── Operators ───────────────────────────────────────────────

_OPERATORS: dict[str, callable] = {
    "gt": lambda v, t: v > t,
    "lt": lambda v, t: v < t,
    "eq": lambda v, t: v == t,
    "ne": lambda v, t: v != t,
    "gte": lambda v, t: v >= t,
    "lte": lambda v, t: v <= t,
}


# ── Service ─────────────────────────────────────────────────


class AutomationLoopService:
    """Periodic condition monitoring + action execution loop service.

    Note: In-memory storage. Loop definitions are lost on restart.
    """

    MAX_LOOPS = 100

    def __init__(self) -> None:
        self._loops: dict[str, dict[str, Any]] = {}
        self._tasks: dict[str, asyncio.Task] = {}
        self._cooldowns: dict[str, datetime] = {}  # condition_key -> last_triggered

    # ── CRUD ────────────────────────────────────────────────

    async def create_loop(self, config: AutomationLoopConfig) -> str:
        """Create a new automation loop. Returns loop_id."""
        if len(self._loops) >= self.MAX_LOOPS:
            raise ValueError(f"Maximum loop count ({self.MAX_LOOPS}) reached")

        loop_id = str(uuid.uuid4())
        now = utcnow()

        self._loops[loop_id] = {
            "id": loop_id,
            "config": config,
            "state": LoopState.PENDING,
            "iteration_count": 0,
            "last_check_at": None,
            "last_triggered_at": None,
            "conditions_met_count": 0,
            "actions_executed_count": 0,
            "created_at": now,
            "error": None,
        }

        logger.info(f"Automation loop created: {loop_id} ({config.name})")
        return loop_id

    async def delete_loop(self, loop_id: str) -> bool:
        """Delete a loop (stops it first if running)."""
        if loop_id not in self._loops:
            return False

        await self.stop_loop(loop_id)
        del self._loops[loop_id]
        logger.info(f"Automation loop deleted: {loop_id}")
        return True

    # ── Lifecycle ───────────────────────────────────────────

    async def start_loop(self, loop_id: str) -> None:
        """Start a loop as a background asyncio.Task."""
        loop_data = self._loops.get(loop_id)
        if not loop_data:
            raise ValueError(f"Loop not found: {loop_id}")

        if loop_data["state"] == LoopState.RUNNING:
            raise ValueError(f"Loop already running: {loop_id}")

        loop_data["state"] = LoopState.RUNNING
        task = asyncio.create_task(self._run_loop(loop_id))
        task.add_done_callback(lambda t: self._on_task_done(loop_id, t))
        self._tasks[loop_id] = task

        logger.info(f"Automation loop started: {loop_id}")

    async def stop_loop(self, loop_id: str) -> None:
        """Stop a running loop gracefully."""
        task = self._tasks.pop(loop_id, None)
        if task and not task.done():
            task.cancel()
            try:
                await task
            except asyncio.CancelledError:
                pass

        loop_data = self._loops.get(loop_id)
        if loop_data and loop_data["state"] == LoopState.RUNNING:
            loop_data["state"] = LoopState.STOPPED

        logger.info(f"Automation loop stopped: {loop_id}")

    # ── Status ──────────────────────────────────────────────

    async def get_loop_status(self, loop_id: str) -> LoopStatus | None:
        """Get status of a specific loop."""
        loop_data = self._loops.get(loop_id)
        if not loop_data:
            return None
        return self._build_status(loop_data)

    async def list_loops(self) -> list[LoopStatus]:
        """List all loops with their current status."""
        return [self._build_status(data) for data in self._loops.values()]

    # ── Internal Loop ───────────────────────────────────────

    async def _run_loop(self, loop_id: str) -> None:
        """Main loop execution logic."""
        loop_data = self._loops.get(loop_id)
        if not loop_data:
            return

        config: AutomationLoopConfig = loop_data["config"]

        try:
            while loop_data["state"] == LoopState.RUNNING:
                # Check max iterations
                if (
                    config.max_iterations is not None
                    and loop_data["iteration_count"] >= config.max_iterations
                ):
                    loop_data["state"] = LoopState.COMPLETED
                    logger.info(
                        f"Loop {loop_id} completed after {loop_data['iteration_count']} iterations"
                    )
                    break

                loop_data["iteration_count"] += 1
                loop_data["last_check_at"] = utcnow()

                # Evaluate conditions
                results = await self._evaluate_conditions(config.conditions)
                triggered = [r for r in results if r.triggered]

                if triggered:
                    # Check cooldown
                    cooldown_key = f"{loop_id}:conditions"
                    if self._is_in_cooldown(cooldown_key, config.cooldown_seconds):
                        logger.debug(f"Loop {loop_id}: conditions met but in cooldown")
                    else:
                        loop_data["conditions_met_count"] += 1
                        loop_data["last_triggered_at"] = utcnow()
                        self._cooldowns[cooldown_key] = utcnow()

                        # Execute actions
                        action_results = await self._execute_actions(config.actions)
                        successful = [r for r in action_results if r.success]
                        loop_data["actions_executed_count"] += len(successful)

                        logger.info(
                            f"Loop {loop_id}: {len(triggered)} conditions met, "
                            f"{len(successful)}/{len(action_results)} actions succeeded"
                        )

                await asyncio.sleep(config.interval_seconds)

        except asyncio.CancelledError:
            logger.info(f"Loop {loop_id} cancelled")
            raise
        except Exception as e:
            loop_data["state"] = LoopState.ERROR
            loop_data["error"] = str(e)
            logger.error(f"Loop {loop_id} error: {e}")

    async def _evaluate_conditions(self, conditions: list[ConditionDef]) -> list[ConditionResult]:
        """Evaluate all conditions against current metrics."""
        results: list[ConditionResult] = []

        for condition in conditions:
            try:
                value = await self._get_metric_value(condition.metric)

                if value is None:
                    results.append(
                        ConditionResult(
                            metric=condition.metric,
                            current_value=None,
                            threshold=condition.threshold,
                            operator=condition.operator,
                            triggered=False,
                            message=f"Metric not available: {condition.metric}",
                        )
                    )
                    continue

                op_func = _OPERATORS.get(condition.operator)
                if not op_func:
                    results.append(
                        ConditionResult(
                            metric=condition.metric,
                            current_value=value,
                            threshold=condition.threshold,
                            operator=condition.operator,
                            triggered=False,
                            message=f"Unknown operator: {condition.operator}",
                        )
                    )
                    continue

                triggered = op_func(value, condition.threshold)
                results.append(
                    ConditionResult(
                        metric=condition.metric,
                        current_value=value,
                        threshold=condition.threshold,
                        operator=condition.operator,
                        triggered=triggered,
                        message=f"{condition.metric}={value} {condition.operator} {condition.threshold}",
                    )
                )
            except Exception as e:
                results.append(
                    ConditionResult(
                        metric=condition.metric,
                        current_value=None,
                        threshold=condition.threshold,
                        operator=condition.operator,
                        triggered=False,
                        message=f"Error evaluating: {e}",
                    )
                )

        return results

    async def _get_metric_value(self, metric: str) -> float | None:
        """Get current metric value from HealthService.

        Metric format: "health.<component>.<field>"
        Example: "health.database.latency_ms"
        """
        parts = metric.split(".")
        if len(parts) < 3 or parts[0] != "health":
            return None

        try:
            from services.health_service import get_health_service

            service = get_health_service()
            health = await service.check_health(include_details=True)

            component_name = parts[1]
            field_name = parts[2]

            component = health.components.get(component_name)
            if not component:
                return None

            # Check standard fields
            if field_name == "latency_ms":
                return component.latency_ms
            elif field_name == "status":
                # Map status to numeric: healthy=0, degraded=1, unhealthy=2
                status_map = {"healthy": 0.0, "degraded": 1.0, "unhealthy": 2.0}
                return status_map.get(component.status.value, -1.0)

            # Check details dict
            return component.details.get(field_name)
        except Exception as e:
            logger.warning(f"Failed to get metric {metric}: {e}")
            return None

    async def _execute_actions(self, actions: list[ActionDef]) -> list[ActionResult]:
        """Execute all configured actions."""
        results: list[ActionResult] = []

        for action in actions:
            try:
                result = await self._execute_single_action(action)
                results.append(result)
            except Exception as e:
                results.append(
                    ActionResult(
                        action_type=action.type,
                        target=action.target,
                        success=False,
                        message=f"Error: {e}",
                    )
                )

        return results

    async def _execute_single_action(self, action: ActionDef) -> ActionResult:
        """Execute a single action based on its type."""
        if action.type == "log":
            logger.info(f"Automation action [log]: {action.target}")
            return ActionResult(
                action_type="log",
                target=action.target,
                success=True,
                message=f"Logged: {action.target}",
            )

        elif action.type == "workflow":
            try:
                from models.workflow import TriggerType, WorkflowRunTrigger
                from services.workflow_service import get_workflow_service

                service = get_workflow_service()
                trigger = WorkflowRunTrigger(
                    trigger_type=TriggerType.SCHEDULE,
                    inputs=action.params,
                )
                run = await service.trigger_run(action.target, trigger)
                return ActionResult(
                    action_type="workflow",
                    target=action.target,
                    success=True,
                    message=f"Workflow triggered: run_id={run.get('id', 'unknown')}",
                )
            except Exception as e:
                return ActionResult(
                    action_type="workflow",
                    target=action.target,
                    success=False,
                    message=f"Workflow trigger failed: {e}",
                )

        elif action.type == "webhook":
            try:
                # SSRF prevention: validate URL scheme and block private IPs
                self._validate_webhook_url(action.target)

                import aiohttp

                async with aiohttp.ClientSession() as session:
                    async with session.post(
                        action.target,
                        json=action.params,
                        timeout=aiohttp.ClientTimeout(total=10),
                    ) as resp:
                        return ActionResult(
                            action_type="webhook",
                            target=action.target,
                            success=resp.status < 400,
                            message=f"HTTP {resp.status}",
                        )
            except ValueError as e:
                return ActionResult(
                    action_type="webhook",
                    target=action.target,
                    success=False,
                    message=f"URL validation failed: {e}",
                )
            except ImportError:
                # aiohttp not available — use log fallback
                logger.warning(f"aiohttp not installed, webhook action skipped: {action.target}")
                return ActionResult(
                    action_type="webhook",
                    target=action.target,
                    success=False,
                    message="aiohttp not installed",
                )
            except Exception as e:
                return ActionResult(
                    action_type="webhook",
                    target=action.target,
                    success=False,
                    message=f"Webhook failed: {e}",
                )

        elif action.type == "notify":
            logger.info(f"Automation action [notify]: {action.target}")
            return ActionResult(
                action_type="notify",
                target=action.target,
                success=True,
                message=f"Notification: {action.target}",
            )

        elif action.type == "pipeline":
            try:
                from services.pipeline.pipeline_service import get_pipeline_service

                pipeline_service = get_pipeline_service()
                result = await pipeline_service.execute_pipeline(
                    action.target, action.params.get("initial_data")
                )
                return ActionResult(
                    action_type="pipeline",
                    target=action.target,
                    success=result.status != "failed",
                    message=f"Pipeline run: {result.run_id} ({result.status})",
                )
            except Exception as e:
                return ActionResult(
                    action_type="pipeline",
                    target=action.target,
                    success=False,
                    message=f"Pipeline trigger failed: {e}",
                )

        return ActionResult(
            action_type=action.type,
            target=action.target,
            success=False,
            message=f"Unknown action type: {action.type}",
        )

    # ── Shutdown ─────────────────────────────────────────────

    async def shutdown(self) -> None:
        """Cancel all running loop tasks gracefully."""
        for loop_id in list(self._tasks.keys()):
            await self.stop_loop(loop_id)
        self._cooldowns.clear()
        logger.info("AutomationLoopService shutdown complete")

    # ── Helpers ─────────────────────────────────────────────

    @staticmethod
    def _validate_webhook_url(url: str) -> None:
        """Validate webhook URL to prevent SSRF attacks."""
        import ipaddress
        import socket
        from urllib.parse import urlparse

        parsed = urlparse(url)
        if parsed.scheme not in ("https", "http"):
            raise ValueError(f"Invalid URL scheme: {parsed.scheme}")

        hostname = parsed.hostname
        if not hostname:
            raise ValueError("URL has no hostname")

        # Block private/loopback IPs
        try:
            for info in socket.getaddrinfo(hostname, None):
                addr = info[4][0]
                ip = ipaddress.ip_address(addr)
                if ip.is_private or ip.is_loopback or ip.is_link_local:
                    raise ValueError(f"Webhook URL resolves to private/loopback IP: {addr}")
        except socket.gaierror:
            raise ValueError(f"Cannot resolve hostname: {hostname}")

    def _is_in_cooldown(self, key: str, cooldown_seconds: int) -> bool:
        """Check if a condition key is still in cooldown period."""
        last_triggered = self._cooldowns.get(key)
        if not last_triggered:
            return False

        elapsed = (utcnow() - last_triggered).total_seconds()
        return elapsed < cooldown_seconds

    def _on_task_done(self, loop_id: str, task: asyncio.Task) -> None:
        """Callback when a loop task completes. Clean up references."""
        self._tasks.pop(loop_id, None)

        # Handle unexpected errors
        if not task.cancelled() and task.exception():
            loop_data = self._loops.get(loop_id)
            if loop_data:
                loop_data["state"] = LoopState.ERROR
                loop_data["error"] = str(task.exception())

    def _build_status(self, loop_data: dict[str, Any]) -> LoopStatus:
        """Build a LoopStatus from internal loop data."""
        config: AutomationLoopConfig = loop_data["config"]
        return LoopStatus(
            loop_id=loop_data["id"],
            name=config.name,
            state=loop_data["state"],
            iteration_count=loop_data["iteration_count"],
            max_iterations=config.max_iterations,
            last_check_at=loop_data["last_check_at"],
            last_triggered_at=loop_data["last_triggered_at"],
            conditions_met_count=loop_data["conditions_met_count"],
            actions_executed_count=loop_data["actions_executed_count"],
            created_at=loop_data["created_at"],
            error=loop_data["error"],
        )


# ── Singleton ───────────────────────────────────────────────

_service: AutomationLoopService | None = None


def get_automation_loop_service() -> AutomationLoopService:
    """Get or create the singleton AutomationLoopService."""
    global _service
    if _service is None:
        _service = AutomationLoopService()
    return _service
