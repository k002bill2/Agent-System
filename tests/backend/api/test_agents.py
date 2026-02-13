"""Agent CRUD API v1 tests.

Tests for all CRUD operations, pagination, filtering, validation,
and error handling for the /api/v1/agents endpoints.
"""

import pytest
import pytest_asyncio
from fastapi import FastAPI
from httpx import ASGITransport, AsyncClient

from api.v1.agents import (
    AgentCategory,
    AgentStatus,
    reset_agent_store,
    router,
    seed_default_agents,
)


# ─────────────────────────────────────────────────────────────
# Fixtures
# ─────────────────────────────────────────────────────────────


@pytest.fixture
def app() -> FastAPI:
    """Create test FastAPI app with agent CRUD router."""
    test_app = FastAPI()
    test_app.include_router(router)
    return test_app


@pytest_asyncio.fixture
async def client(app: FastAPI) -> AsyncClient:
    """Create async test client."""
    async with AsyncClient(
        transport=ASGITransport(app=app),
        base_url="http://test",
    ) as c:
        yield c


@pytest.fixture(autouse=True)
def reset_state():
    """Reset in-memory state before each test."""
    reset_agent_store()
    seed_default_agents()
    yield
    reset_agent_store()


# ─────────────────────────────────────────────────────────────
# Helper
# ─────────────────────────────────────────────────────────────


def _create_agent_payload(
    name: str = "Test Agent",
    category: str = "development",
    **kwargs,
) -> dict:
    """Build a valid agent creation payload."""
    payload = {
        "name": name,
        "category": category,
    }
    payload.update(kwargs)
    return payload


# ─────────────────────────────────────────────────────────────
# 1. List Agents (GET /api/v1/agents)
# ─────────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_list_agents_returns_seeded(client: AsyncClient):
    """List agents returns all seeded default agents."""
    response = await client.get("/api/v1/agents")

    assert response.status_code == 200
    data = response.json()
    assert data["total"] == 3
    assert len(data["items"]) == 3
    assert data["page"] == 1
    assert data["total_pages"] == 1
    assert data["has_more"] is False


@pytest.mark.asyncio
async def test_list_agents_pagination(client: AsyncClient):
    """Pagination returns correct page slices."""
    response = await client.get("/api/v1/agents?page=1&page_size=2")

    data = response.json()
    assert len(data["items"]) == 2
    assert data["total"] == 3
    assert data["page"] == 1
    assert data["page_size"] == 2
    assert data["total_pages"] == 2
    assert data["has_more"] is True

    # Second page
    response2 = await client.get("/api/v1/agents?page=2&page_size=2")
    data2 = response2.json()
    assert len(data2["items"]) == 1
    assert data2["has_more"] is False


@pytest.mark.asyncio
async def test_list_agents_filter_by_category(client: AsyncClient):
    """Filter agents by category."""
    response = await client.get("/api/v1/agents?category=development")

    data = response.json()
    assert data["total"] == 2
    for item in data["items"]:
        assert item["category"] == "development"


@pytest.mark.asyncio
async def test_list_agents_filter_by_status(client: AsyncClient):
    """Filter agents by status."""
    response = await client.get("/api/v1/agents?status=available")

    data = response.json()
    assert data["total"] == 2
    for item in data["items"]:
        assert item["status"] == "available"


@pytest.mark.asyncio
async def test_list_agents_filter_by_search(client: AsyncClient):
    """Search agents by name/description keyword."""
    response = await client.get("/api/v1/agents?search=backend")

    data = response.json()
    assert data["total"] == 1
    assert data["items"][0]["id"] == "agent-backend"


@pytest.mark.asyncio
async def test_list_agents_invalid_category_returns_400(client: AsyncClient):
    """Invalid category filter returns 400."""
    response = await client.get("/api/v1/agents?category=invalid_cat")

    assert response.status_code == 400
    assert "Invalid category" in response.json()["detail"]


@pytest.mark.asyncio
async def test_list_agents_invalid_status_returns_400(client: AsyncClient):
    """Invalid status filter returns 400."""
    response = await client.get("/api/v1/agents?status=invalid_status")

    assert response.status_code == 400
    assert "Invalid status" in response.json()["detail"]


@pytest.mark.asyncio
async def test_list_agents_empty_search_returns_empty(client: AsyncClient):
    """Search with no matches returns empty list."""
    response = await client.get("/api/v1/agents?search=nonexistent_keyword_xyz")

    data = response.json()
    assert data["total"] == 0
    assert len(data["items"]) == 0


# ─────────────────────────────────────────────────────────────
# 2. Get Single Agent (GET /api/v1/agents/{id})
# ─────────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_get_agent_by_id(client: AsyncClient):
    """Get a single agent by ID returns correct data."""
    response = await client.get("/api/v1/agents/agent-web-ui")

    assert response.status_code == 200
    data = response.json()
    assert data["id"] == "agent-web-ui"
    assert data["name"] == "Web UI Specialist"
    assert data["category"] == "development"
    assert data["status"] == "available"
    assert "created_at" in data
    assert "updated_at" in data


@pytest.mark.asyncio
async def test_get_agent_not_found(client: AsyncClient):
    """Get non-existent agent returns 404."""
    response = await client.get("/api/v1/agents/nonexistent-agent")

    assert response.status_code == 404
    assert "Agent not found" in response.json()["detail"]


# ─────────────────────────────────────────────────────────────
# 3. Create Agent (POST /api/v1/agents)
# ─────────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_create_agent_minimal(client: AsyncClient):
    """Create agent with only required fields."""
    payload = _create_agent_payload(name="New Agent", category="testing")
    response = await client.post("/api/v1/agents", json=payload)

    assert response.status_code == 201
    data = response.json()
    assert data["name"] == "New Agent"
    assert data["category"] == "testing"
    assert data["status"] == "available"  # default
    assert data["id"].startswith("agent-")
    assert data["total_tasks_completed"] == 0
    assert data["success_rate"] == 1.0  # default
    assert data["created_at"] != ""
    assert data["updated_at"] != ""


@pytest.mark.asyncio
async def test_create_agent_full(client: AsyncClient):
    """Create agent with all optional fields."""
    payload = _create_agent_payload(
        name="Full Agent",
        category="devops",
        description="A complete agent with all fields",
        status="busy",
        capabilities=[
            {
                "name": "docker",
                "description": "Docker management",
                "keywords": ["docker", "container"],
                "priority": 10,
            }
        ],
        specializations=["Docker", "Kubernetes"],
        estimated_cost_per_task=0.1,
        avg_execution_time_ms=5000,
        max_concurrent_tasks=3,
        success_rate=0.85,
    )
    response = await client.post("/api/v1/agents", json=payload)

    assert response.status_code == 201
    data = response.json()
    assert data["name"] == "Full Agent"
    assert data["category"] == "devops"
    assert data["description"] == "A complete agent with all fields"
    assert data["status"] == "busy"
    assert len(data["capabilities"]) == 1
    assert data["capabilities"][0]["name"] == "docker"
    assert data["specializations"] == ["Docker", "Kubernetes"]
    assert data["estimated_cost_per_task"] == 0.1
    assert data["avg_execution_time_ms"] == 5000
    assert data["max_concurrent_tasks"] == 3
    assert data["success_rate"] == 0.85


@pytest.mark.asyncio
async def test_create_agent_appears_in_list(client: AsyncClient):
    """Created agent appears in the list endpoint."""
    payload = _create_agent_payload(name="Listed Agent", category="research")
    create_response = await client.post("/api/v1/agents", json=payload)
    assert create_response.status_code == 201

    agent_id = create_response.json()["id"]

    list_response = await client.get("/api/v1/agents")
    data = list_response.json()
    ids = [item["id"] for item in data["items"]]
    assert agent_id in ids


@pytest.mark.asyncio
async def test_create_agent_missing_name_returns_422(client: AsyncClient):
    """Missing required field 'name' returns 422 validation error."""
    response = await client.post("/api/v1/agents", json={"category": "development"})

    assert response.status_code == 422


@pytest.mark.asyncio
async def test_create_agent_missing_category_returns_422(client: AsyncClient):
    """Missing required field 'category' returns 422 validation error."""
    response = await client.post("/api/v1/agents", json={"name": "No Category"})

    assert response.status_code == 422


@pytest.mark.asyncio
async def test_create_agent_invalid_category_returns_422(client: AsyncClient):
    """Invalid category value returns 422 validation error."""
    payload = _create_agent_payload(category="invalid_category")
    response = await client.post("/api/v1/agents", json=payload)

    assert response.status_code == 422


@pytest.mark.asyncio
async def test_create_agent_empty_name_returns_422(client: AsyncClient):
    """Empty name string returns 422 validation error."""
    payload = _create_agent_payload(name="")
    response = await client.post("/api/v1/agents", json=payload)

    assert response.status_code == 422


@pytest.mark.asyncio
async def test_create_agent_invalid_success_rate_returns_422(client: AsyncClient):
    """Success rate > 1.0 returns 422 validation error."""
    payload = _create_agent_payload(success_rate=1.5)
    response = await client.post("/api/v1/agents", json=payload)

    assert response.status_code == 422


@pytest.mark.asyncio
async def test_create_agent_negative_cost_returns_422(client: AsyncClient):
    """Negative cost returns 422 validation error."""
    payload = _create_agent_payload(estimated_cost_per_task=-1.0)
    response = await client.post("/api/v1/agents", json=payload)

    assert response.status_code == 422


# ─────────────────────────────────────────────────────────────
# 4. Update Agent (PUT /api/v1/agents/{id})
# ─────────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_update_agent_name(client: AsyncClient):
    """Update only the agent name."""
    response = await client.put(
        "/api/v1/agents/agent-web-ui",
        json={"name": "Updated Web UI"},
    )

    assert response.status_code == 200
    data = response.json()
    assert data["name"] == "Updated Web UI"
    assert data["id"] == "agent-web-ui"
    # Other fields remain unchanged
    assert data["category"] == "development"


@pytest.mark.asyncio
async def test_update_agent_multiple_fields(client: AsyncClient):
    """Update multiple fields at once."""
    response = await client.put(
        "/api/v1/agents/agent-backend",
        json={
            "name": "Updated Backend",
            "description": "New description",
            "status": "busy",
            "success_rate": 0.99,
        },
    )

    assert response.status_code == 200
    data = response.json()
    assert data["name"] == "Updated Backend"
    assert data["description"] == "New description"
    assert data["status"] == "busy"
    assert data["success_rate"] == 0.99


@pytest.mark.asyncio
async def test_update_agent_updates_timestamp(client: AsyncClient):
    """Update agent refreshes the updated_at timestamp."""
    # Get original
    original = await client.get("/api/v1/agents/agent-web-ui")
    original_updated_at = original.json()["updated_at"]

    # Update
    response = await client.put(
        "/api/v1/agents/agent-web-ui",
        json={"name": "Timestamp Test"},
    )

    assert response.status_code == 200
    new_updated_at = response.json()["updated_at"]
    assert new_updated_at >= original_updated_at


@pytest.mark.asyncio
async def test_update_agent_not_found(client: AsyncClient):
    """Update non-existent agent returns 404."""
    response = await client.put(
        "/api/v1/agents/nonexistent-agent",
        json={"name": "Ghost"},
    )

    assert response.status_code == 404
    assert "Agent not found" in response.json()["detail"]


@pytest.mark.asyncio
async def test_update_agent_no_fields_returns_400(client: AsyncClient):
    """Update with empty body returns 400."""
    response = await client.put(
        "/api/v1/agents/agent-web-ui",
        json={},
    )

    assert response.status_code == 400
    assert "No fields provided" in response.json()["detail"]


@pytest.mark.asyncio
async def test_update_agent_capabilities(client: AsyncClient):
    """Update agent capabilities list."""
    new_capabilities = [
        {
            "name": "graphql",
            "description": "GraphQL API design",
            "keywords": ["graphql", "api"],
            "priority": 8,
        }
    ]
    response = await client.put(
        "/api/v1/agents/agent-backend",
        json={"capabilities": new_capabilities},
    )

    assert response.status_code == 200
    data = response.json()
    assert len(data["capabilities"]) == 1
    assert data["capabilities"][0]["name"] == "graphql"


# ─────────────────────────────────────────────────────────────
# 5. Delete Agent (DELETE /api/v1/agents/{id})
# ─────────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_delete_agent_success(client: AsyncClient):
    """Delete existing agent succeeds."""
    response = await client.delete("/api/v1/agents/agent-quality")

    assert response.status_code == 200
    data = response.json()
    assert data["deleted_id"] == "agent-quality"
    assert "deleted successfully" in data["message"]


@pytest.mark.asyncio
async def test_delete_agent_removes_from_store(client: AsyncClient):
    """Deleted agent is no longer in the list."""
    await client.delete("/api/v1/agents/agent-quality")

    # Verify deleted from list
    list_response = await client.get("/api/v1/agents")
    ids = [item["id"] for item in list_response.json()["items"]]
    assert "agent-quality" not in ids

    # Verify get returns 404
    get_response = await client.get("/api/v1/agents/agent-quality")
    assert get_response.status_code == 404


@pytest.mark.asyncio
async def test_delete_agent_not_found(client: AsyncClient):
    """Delete non-existent agent returns 404."""
    response = await client.delete("/api/v1/agents/nonexistent-agent")

    assert response.status_code == 404
    assert "Agent not found" in response.json()["detail"]


@pytest.mark.asyncio
async def test_delete_agent_twice_returns_404(client: AsyncClient):
    """Deleting the same agent twice returns 404 on second attempt."""
    await client.delete("/api/v1/agents/agent-quality")

    response = await client.delete("/api/v1/agents/agent-quality")
    assert response.status_code == 404


# ─────────────────────────────────────────────────────────────
# 6. End-to-End Workflow
# ─────────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_full_crud_workflow(client: AsyncClient):
    """Complete CRUD lifecycle: create -> read -> update -> delete."""
    # Create
    create_response = await client.post(
        "/api/v1/agents",
        json=_create_agent_payload(
            name="Lifecycle Agent",
            category="orchestration",
            description="Testing full lifecycle",
        ),
    )
    assert create_response.status_code == 201
    agent_id = create_response.json()["id"]

    # Read
    get_response = await client.get(f"/api/v1/agents/{agent_id}")
    assert get_response.status_code == 200
    assert get_response.json()["name"] == "Lifecycle Agent"

    # Update
    update_response = await client.put(
        f"/api/v1/agents/{agent_id}",
        json={"name": "Updated Lifecycle Agent", "status": "busy"},
    )
    assert update_response.status_code == 200
    assert update_response.json()["name"] == "Updated Lifecycle Agent"
    assert update_response.json()["status"] == "busy"

    # Verify update persisted
    verify_response = await client.get(f"/api/v1/agents/{agent_id}")
    assert verify_response.json()["name"] == "Updated Lifecycle Agent"

    # Delete
    delete_response = await client.delete(f"/api/v1/agents/{agent_id}")
    assert delete_response.status_code == 200

    # Verify deleted
    final_response = await client.get(f"/api/v1/agents/{agent_id}")
    assert final_response.status_code == 404


@pytest.mark.asyncio
async def test_response_has_all_fields(client: AsyncClient):
    """Response model contains all expected fields."""
    response = await client.get("/api/v1/agents/agent-web-ui")

    assert response.status_code == 200
    data = response.json()

    expected_fields = [
        "id",
        "name",
        "description",
        "category",
        "status",
        "capabilities",
        "specializations",
        "estimated_cost_per_task",
        "avg_execution_time_ms",
        "max_concurrent_tasks",
        "total_tasks_completed",
        "success_rate",
        "created_at",
        "updated_at",
    ]
    for field in expected_fields:
        assert field in data, f"Missing field: {field}"


@pytest.mark.asyncio
async def test_pagination_beyond_total_returns_empty(client: AsyncClient):
    """Requesting a page beyond total pages returns empty items."""
    response = await client.get("/api/v1/agents?page=100&page_size=20")

    assert response.status_code == 200
    data = response.json()
    assert len(data["items"]) == 0
    assert data["total"] == 3
    assert data["has_more"] is False
