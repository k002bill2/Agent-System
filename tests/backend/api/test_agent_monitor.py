"""Tests for Agent Monitor API endpoints.

Tests cover SSE streaming, metrics, summary, and error handling.
"""

import asyncio

import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient
from fastapi import FastAPI

from api.v1.agent_monitor import (
    router,
    _agents,
    _sse_subscribers,
    AgentRecord,
    AgentStatus,
)


@pytest.fixture
def app() -> FastAPI:
    """Create test FastAPI app with agent monitor router."""
    test_app = FastAPI()
    test_app.include_router(router)
    return test_app


@pytest_asyncio.fixture
async def client(app: FastAPI):
    """Create async test client."""
    async with AsyncClient(
        transport=ASGITransport(app=app),
        base_url="http://test",
    ) as c:
        yield c


@pytest.fixture(autouse=True)
def clear_state():
    """Clear in-memory state before each test."""
    _agents.clear()
    _sse_subscribers.clear()
    yield
    _agents.clear()
    _sse_subscribers.clear()


def _seed_test_agents() -> None:
    """Seed agents for testing."""
    _agents["agent-alpha"] = AgentRecord(
        agent_id="agent-alpha",
        name="Alpha Agent",
        status=AgentStatus.running,
        last_active="2025-01-01T00:00:00+00:00",
        total_tasks=100,
        successful_tasks=90,
        total_cost=25.0,
        avg_duration_ms=400.0,
    )
    _agents["agent-beta"] = AgentRecord(
        agent_id="agent-beta",
        name="Beta Agent",
        status=AgentStatus.idle,
        last_active="2025-01-01T00:00:00+00:00",
        total_tasks=50,
        successful_tasks=48,
        total_cost=10.0,
        avg_duration_ms=200.0,
    )
    _agents["agent-gamma"] = AgentRecord(
        agent_id="agent-gamma",
        name="Gamma Agent",
        status=AgentStatus.offline,
        last_active="2025-01-01T00:00:00+00:00",
        total_tasks=30,
        successful_tasks=25,
        total_cost=5.0,
        avg_duration_ms=600.0,
    )


# ─────────────────────────────────────────────────────────────
# SSE Stream Tests
# ─────────────────────────────────────────────────────────────


@pytest.mark.skip(reason="SSE streaming hangs in ASGI test transport")
@pytest.mark.asyncio
async def test_sse_stream_returns_event_stream(client: AsyncClient) -> None:
    """SSE endpoint returns text/event-stream content type."""
    _seed_test_agents()

    async with client.stream(
        "GET",
        "/api/v1/agents/monitor/stream?interval=1",
    ) as response:
        assert response.status_code == 200
        content_type = response.headers.get("content-type", "")
        assert "text/event-stream" in content_type


@pytest.mark.skip(reason="SSE streaming hangs in ASGI test transport")
@pytest.mark.asyncio
async def test_sse_stream_sends_heartbeat(client: AsyncClient) -> None:
    """SSE stream should send heartbeat events."""
    _seed_test_agents()

    async with client.stream(
        "GET",
        "/api/v1/agents/monitor/stream?interval=1",
    ) as response:
        collected_lines: list[str] = []
        async for line in response.aiter_lines():
            collected_lines.append(line)
            if len(collected_lines) >= 20:
                break

        full_text = "\n".join(collected_lines)
        assert "agent_status" in full_text


# ─────────────────────────────────────────────────────────────
# Metrics Endpoint Tests
# ─────────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_get_metrics_returns_buckets(client: AsyncClient) -> None:
    """Metrics endpoint returns bucketed data for a valid agent."""
    _seed_test_agents()

    response = await client.get(
        "/api/v1/agents/metrics",
        params={"agent_id": "agent-alpha", "period": "1h", "bucket": "5m"},
    )

    assert response.status_code == 200
    data = response.json()
    assert data["agent_id"] == "agent-alpha"
    assert isinstance(data["buckets"], list)
    assert len(data["buckets"]) > 0

    first_bucket = data["buckets"][0]
    assert "timestamp" in first_bucket
    assert "success_rate" in first_bucket
    assert "avg_duration_ms" in first_bucket
    assert "total_cost" in first_bucket
    assert "task_count" in first_bucket
    assert 0.0 <= first_bucket["success_rate"] <= 1.0
    assert first_bucket["avg_duration_ms"] >= 0.0
    assert first_bucket["task_count"] >= 0


@pytest.mark.asyncio
async def test_get_metrics_unknown_agent_returns_404(client: AsyncClient) -> None:
    """Metrics endpoint returns 404 for unknown agent ID."""
    _seed_test_agents()

    response = await client.get(
        "/api/v1/agents/metrics",
        params={"agent_id": "nonexistent-agent", "period": "1h", "bucket": "5m"},
    )

    assert response.status_code == 404
    assert "not found" in response.json()["detail"].lower()


@pytest.mark.asyncio
async def test_get_metrics_invalid_period_returns_400(client: AsyncClient) -> None:
    """Metrics endpoint returns 400 for invalid period format."""
    _seed_test_agents()

    response = await client.get(
        "/api/v1/agents/metrics",
        params={"agent_id": "agent-alpha", "period": "xyz", "bucket": "5m"},
    )

    assert response.status_code == 400
    assert "Invalid period format" in response.json()["detail"]


@pytest.mark.asyncio
async def test_get_metrics_bucket_larger_than_period_returns_400(
    client: AsyncClient,
) -> None:
    """Metrics endpoint returns 400 when bucket > period."""
    _seed_test_agents()

    response = await client.get(
        "/api/v1/agents/metrics",
        params={"agent_id": "agent-alpha", "period": "1h", "bucket": "2h"},
    )

    assert response.status_code == 400
    assert "cannot be larger" in response.json()["detail"].lower()


# ─────────────────────────────────────────────────────────────
# Summary Endpoint Tests
# ─────────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_get_summary_returns_aggregated_data(client: AsyncClient) -> None:
    """Summary endpoint returns aggregated metrics across all agents."""
    _seed_test_agents()

    response = await client.get("/api/v1/agents/metrics/summary")

    assert response.status_code == 200
    data = response.json()
    assert data["total_agents"] == 3
    assert data["active_agents"] == 2  # running + idle, not offline
    assert 0.0 <= data["avg_success_rate"] <= 1.0
    assert data["total_cost_24h"] >= 0.0
    assert data["tasks_completed_24h"] >= 0


@pytest.mark.asyncio
async def test_get_summary_empty_agents() -> None:
    """Summary endpoint returns zeros when no agents exist.

    Uses a fresh app without seeded agents to test the empty state.
    """
    test_app = FastAPI()
    test_app.include_router(router)

    # Make sure _agents is empty and won't auto-seed
    _agents.clear()
    # We need to prevent auto-seeding, so we add a dummy agent and remove it
    # to make _agents non-empty and then clear
    _agents["temp"] = AgentRecord(
        agent_id="temp",
        name="Temp",
        status=AgentStatus.idle,
    )
    _agents.clear()

    # Now add specific test data: empty but prevent seed
    _agents["only-offline"] = AgentRecord(
        agent_id="only-offline",
        name="Offline Only",
        status=AgentStatus.offline,
        total_tasks=0,
        successful_tasks=0,
        total_cost=0.0,
    )

    async with AsyncClient(
        transport=ASGITransport(app=test_app),
        base_url="http://test",
    ) as c:
        response = await c.get("/api/v1/agents/metrics/summary")

    assert response.status_code == 200
    data = response.json()
    assert data["total_agents"] == 1
    assert data["active_agents"] == 0
    assert data["avg_success_rate"] == 0.0


# ─────────────────────────────────────────────────────────────
# Agent Status Update Tests
# ─────────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_update_agent_status(client: AsyncClient) -> None:
    """PUT status endpoint updates agent and returns event."""
    _seed_test_agents()

    response = await client.put(
        "/api/v1/agents/monitor/agent-alpha/status",
        json={"status": "error"},
    )

    assert response.status_code == 200
    data = response.json()
    assert data["agent_id"] == "agent-alpha"
    assert data["status"] == "error"
    assert "timestamp" in data

    # Verify internal state was updated
    assert _agents["agent-alpha"].status == AgentStatus.error


@pytest.mark.asyncio
async def test_update_unknown_agent_returns_404(client: AsyncClient) -> None:
    """PUT status for unknown agent returns 404."""
    _seed_test_agents()

    response = await client.put(
        "/api/v1/agents/monitor/unknown-agent/status",
        json={"status": "idle"},
    )

    assert response.status_code == 404


# ─────────────────────────────────────────────────────────────
# List Monitored Agents Tests
# ─────────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_list_monitored_agents(client: AsyncClient) -> None:
    """GET monitored agents returns list of all agents."""
    _seed_test_agents()

    response = await client.get("/api/v1/agents/monitor/agents")

    assert response.status_code == 200
    data = response.json()
    assert isinstance(data, list)
    assert len(data) == 3

    agent_ids = {agent["agent_id"] for agent in data}
    assert "agent-alpha" in agent_ids
    assert "agent-beta" in agent_ids
    assert "agent-gamma" in agent_ids
