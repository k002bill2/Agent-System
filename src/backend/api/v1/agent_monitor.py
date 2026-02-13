"""Agent Monitoring API - SSE stream and metrics endpoints.

Real-time agent status monitoring via Server-Sent Events (SSE)
and aggregated metrics for agent performance analysis.
"""

import asyncio
from collections.abc import AsyncGenerator
from datetime import UTC, datetime, timedelta
from enum import Enum

from fastapi import APIRouter, HTTPException, Query
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field

router = APIRouter(prefix="/api/v1/agents", tags=["agent-monitor"])


# ─────────────────────────────────────────────────────────────
# Enums
# ─────────────────────────────────────────────────────────────


class AgentStatus(str, Enum):
    """Possible agent statuses."""

    idle = "idle"
    running = "running"
    error = "error"
    offline = "offline"


class MetricType(str, Enum):
    """Types of agent metrics."""

    success_rate = "success_rate"
    avg_duration_ms = "avg_duration_ms"
    total_cost = "total_cost"
    task_count = "task_count"
    error_count = "error_count"


# ─────────────────────────────────────────────────────────────
# Pydantic Models
# ─────────────────────────────────────────────────────────────


class AgentStatusEvent(BaseModel):
    """SSE event for agent status changes."""

    agent_id: str
    status: AgentStatus
    timestamp: str


class AgentMetricEvent(BaseModel):
    """SSE event for agent metric updates."""

    agent_id: str
    metric_type: MetricType
    value: float
    timestamp: str


class HeartbeatEvent(BaseModel):
    """SSE heartbeat event."""

    timestamp: str


class MetricBucket(BaseModel):
    """A single time-bucketed metrics data point."""

    timestamp: str
    success_rate: float = Field(ge=0.0, le=1.0)
    avg_duration_ms: float = Field(ge=0.0)
    total_cost: float = Field(ge=0.0)
    task_count: int = Field(ge=0)


class AgentMetricsResponse(BaseModel):
    """Aggregated metrics for a single agent over a time period."""

    agent_id: str
    buckets: list[MetricBucket]


class MetricsSummaryResponse(BaseModel):
    """Summary of metrics across all agents."""

    total_agents: int = Field(ge=0)
    active_agents: int = Field(ge=0)
    avg_success_rate: float = Field(ge=0.0, le=1.0)
    total_cost_24h: float = Field(ge=0.0)
    tasks_completed_24h: int = Field(ge=0)


# ─────────────────────────────────────────────────────────────
# In-memory Storage
# ─────────────────────────────────────────────────────────────


class AgentRecord(BaseModel):
    """Internal agent tracking record."""

    agent_id: str
    name: str
    status: AgentStatus = AgentStatus.idle
    last_active: str = ""
    total_tasks: int = 0
    successful_tasks: int = 0
    total_cost: float = 0.0
    avg_duration_ms: float = 0.0


# In-memory store for agent data
_agents: dict[str, AgentRecord] = {}
_metric_history: list[dict[str, float | str | int]] = []
_sse_subscribers: list[asyncio.Queue[str]] = []


def _now_iso() -> str:
    """Return current UTC time as ISO string."""
    return datetime.now(UTC).isoformat()


def _seed_agents() -> None:
    """Seed sample agents if empty."""
    if _agents:
        return
    sample_agents = [
        ("agent-planner", "Planner Agent", AgentStatus.running),
        ("agent-executor", "Executor Agent", AgentStatus.idle),
        ("agent-reviewer", "Reviewer Agent", AgentStatus.running),
        ("agent-researcher", "Researcher Agent", AgentStatus.offline),
    ]
    now = _now_iso()
    for agent_id, name, status in sample_agents:
        _agents[agent_id] = AgentRecord(
            agent_id=agent_id,
            name=name,
            status=status,
            last_active=now,
            total_tasks=50,
            successful_tasks=45,
            total_cost=12.5,
            avg_duration_ms=350.0,
        )


def _broadcast_event(event_type: str, data: str) -> None:
    """Send an SSE event to all active subscribers."""
    formatted = f"event: {event_type}\ndata: {data}\n\n"
    dead_queues: list[asyncio.Queue[str]] = []
    for queue in _sse_subscribers:
        try:
            queue.put_nowait(formatted)
        except asyncio.QueueFull:
            dead_queues.append(queue)
    for dq in dead_queues:
        if dq in _sse_subscribers:
            _sse_subscribers.remove(dq)


# ─────────────────────────────────────────────────────────────
# SSE Stream Endpoint
# ─────────────────────────────────────────────────────────────


async def event_stream(
    interval_seconds: float = 5.0,
) -> AsyncGenerator[str, None]:
    """Async generator that yields SSE events for agent monitoring.

    Sends agent_status and agent_metric events at regular intervals,
    with heartbeat events between data pushes.
    """
    queue: asyncio.Queue[str] = asyncio.Queue(maxsize=256)
    _sse_subscribers.append(queue)

    try:
        _seed_agents()

        # Send initial snapshot
        for agent in _agents.values():
            status_event = AgentStatusEvent(
                agent_id=agent.agent_id,
                status=agent.status,
                timestamp=_now_iso(),
            )
            yield f"event: agent_status\ndata: {status_event.model_dump_json()}\n\n"

        tick = 0
        while True:
            # Check for broadcasts from other endpoints
            try:
                while True:
                    msg = queue.get_nowait()
                    yield msg
            except asyncio.QueueEmpty:
                pass

            tick += 1

            # Send heartbeat every interval
            heartbeat = HeartbeatEvent(timestamp=_now_iso())
            yield f"event: heartbeat\ndata: {heartbeat.model_dump_json()}\n\n"

            # Every 3rd tick, simulate status changes
            if tick % 3 == 0:
                for agent in _agents.values():
                    # Simulate metric event
                    success_rate = (
                        agent.successful_tasks / agent.total_tasks if agent.total_tasks > 0 else 0.0
                    )
                    metric_event = AgentMetricEvent(
                        agent_id=agent.agent_id,
                        metric_type=MetricType.success_rate,
                        value=round(success_rate, 3),
                        timestamp=_now_iso(),
                    )
                    yield f"event: agent_metric\ndata: {metric_event.model_dump_json()}\n\n"

            await asyncio.sleep(interval_seconds)
    except asyncio.CancelledError:
        pass
    finally:
        if queue in _sse_subscribers:
            _sse_subscribers.remove(queue)


@router.get("/monitor/stream")
async def stream_agent_monitor(
    interval: float = Query(
        default=5.0, ge=1.0, le=60.0, description="Interval between events in seconds"
    ),
) -> StreamingResponse:
    """Stream real-time agent status and metric events via SSE.

    Events:
    - agent_status: Agent status changes (idle, running, error, offline)
    - agent_metric: Metric updates (success_rate, avg_duration, cost, etc.)
    - heartbeat: Connection keepalive

    Returns a text/event-stream response.
    """
    return StreamingResponse(
        event_stream(interval_seconds=interval),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


# ─────────────────────────────────────────────────────────────
# Metrics Endpoints
# ─────────────────────────────────────────────────────────────


def _parse_period(period: str) -> timedelta:
    """Parse period string like '1h', '6h', '24h' to timedelta."""
    period = period.strip().lower()
    if period.endswith("h"):
        try:
            hours = int(period[:-1])
            if hours <= 0:
                raise ValueError("Hours must be positive")
            return timedelta(hours=hours)
        except ValueError:
            pass
    if period.endswith("m"):
        try:
            minutes = int(period[:-1])
            if minutes <= 0:
                raise ValueError("Minutes must be positive")
            return timedelta(minutes=minutes)
        except ValueError:
            pass
    raise HTTPException(
        status_code=400,
        detail=f"Invalid period format: '{period}'. Use '1h', '6h', '24h', '30m', etc.",
    )


def _parse_bucket_size(bucket: str) -> timedelta:
    """Parse bucket size string like '5m', '15m', '1h' to timedelta."""
    bucket = bucket.strip().lower()
    if bucket.endswith("m"):
        try:
            minutes = int(bucket[:-1])
            if minutes <= 0:
                raise ValueError("Minutes must be positive")
            return timedelta(minutes=minutes)
        except ValueError:
            pass
    if bucket.endswith("h"):
        try:
            hours = int(bucket[:-1])
            if hours <= 0:
                raise ValueError("Hours must be positive")
            return timedelta(hours=hours)
        except ValueError:
            pass
    raise HTTPException(
        status_code=400,
        detail=f"Invalid bucket format: '{bucket}'. Use '5m', '15m', '1h', etc.",
    )


def _generate_metric_buckets(
    agent_id: str,
    period: timedelta,
    bucket_size: timedelta,
) -> list[MetricBucket]:
    """Generate time-bucketed metrics for an agent."""
    now = datetime.now(UTC)
    start = now - period
    bucket_count = max(1, int(period.total_seconds() / bucket_size.total_seconds()))

    agent = _agents.get(agent_id)
    base_success_rate = 0.9
    base_cost = 0.05
    base_duration = 300.0

    if agent:
        base_success_rate = (
            agent.successful_tasks / agent.total_tasks if agent.total_tasks > 0 else 0.9
        )
        base_cost = agent.total_cost / max(agent.total_tasks, 1)
        base_duration = agent.avg_duration_ms

    buckets: list[MetricBucket] = []
    for i in range(bucket_count):
        bucket_time = start + (bucket_size * i)
        # Deterministic variation based on index
        variation = ((i * 7 + 3) % 10) / 100.0
        task_count = 5 + (i % 7)

        buckets.append(
            MetricBucket(
                timestamp=bucket_time.isoformat(),
                success_rate=min(1.0, round(base_success_rate + variation - 0.05, 3)),
                avg_duration_ms=round(base_duration + (variation * 100), 1),
                total_cost=round(base_cost * task_count + variation, 4),
                task_count=task_count,
            )
        )

    return buckets


@router.get("/metrics", response_model=AgentMetricsResponse)
async def get_agent_metrics(
    agent_id: str = Query(..., description="Agent ID to get metrics for"),
    period: str = Query(default="1h", description="Time period (e.g. 1h, 6h, 24h)"),
    bucket: str = Query(default="5m", description="Bucket size (e.g. 5m, 15m, 1h)"),
) -> AgentMetricsResponse:
    """Get time-bucketed metrics for a specific agent.

    Returns success rate, average duration, cost, and task count
    aggregated into time buckets over the specified period.
    """
    _seed_agents()

    if agent_id not in _agents:
        raise HTTPException(
            status_code=404,
            detail=f"Agent '{agent_id}' not found",
        )

    period_td = _parse_period(period)
    bucket_td = _parse_bucket_size(bucket)

    if bucket_td > period_td:
        raise HTTPException(
            status_code=400,
            detail="Bucket size cannot be larger than the period",
        )

    buckets = _generate_metric_buckets(agent_id, period_td, bucket_td)

    return AgentMetricsResponse(
        agent_id=agent_id,
        buckets=buckets,
    )


@router.get("/metrics/summary", response_model=MetricsSummaryResponse)
async def get_metrics_summary() -> MetricsSummaryResponse:
    """Get a summary of metrics across all agents.

    Returns total agent count, active count, average success rate,
    total cost in last 24h, and tasks completed in last 24h.
    """
    _seed_agents()

    total_agents = len(_agents)
    active_agents = sum(
        1 for a in _agents.values() if a.status in (AgentStatus.running, AgentStatus.idle)
    )

    if total_agents == 0:
        return MetricsSummaryResponse(
            total_agents=0,
            active_agents=0,
            avg_success_rate=0.0,
            total_cost_24h=0.0,
            tasks_completed_24h=0,
        )

    total_tasks = sum(a.total_tasks for a in _agents.values())
    total_successful = sum(a.successful_tasks for a in _agents.values())
    avg_success_rate = total_successful / total_tasks if total_tasks > 0 else 0.0
    total_cost = sum(a.total_cost for a in _agents.values())

    return MetricsSummaryResponse(
        total_agents=total_agents,
        active_agents=active_agents,
        avg_success_rate=round(avg_success_rate, 3),
        total_cost_24h=round(total_cost, 2),
        tasks_completed_24h=total_tasks,
    )


# ─────────────────────────────────────────────────────────────
# Agent Status Update (for external triggers)
# ─────────────────────────────────────────────────────────────


class AgentStatusUpdateRequest(BaseModel):
    """Request body for updating an agent's status."""

    status: AgentStatus


@router.put("/monitor/{agent_id}/status")
async def update_agent_status(
    agent_id: str,
    request: AgentStatusUpdateRequest,
) -> AgentStatusEvent:
    """Update an agent's status and broadcast the change via SSE."""
    _seed_agents()

    if agent_id not in _agents:
        raise HTTPException(
            status_code=404,
            detail=f"Agent '{agent_id}' not found",
        )

    agent = _agents[agent_id]
    agent.status = request.status
    agent.last_active = _now_iso()

    event = AgentStatusEvent(
        agent_id=agent_id,
        status=request.status,
        timestamp=agent.last_active,
    )

    # Broadcast to SSE subscribers
    _broadcast_event("agent_status", event.model_dump_json())

    return event


@router.get("/monitor/agents")
async def list_monitored_agents() -> list[AgentRecord]:
    """List all agents being monitored."""
    _seed_agents()
    return list(_agents.values())
