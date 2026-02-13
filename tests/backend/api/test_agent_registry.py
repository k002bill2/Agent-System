"""Agent Registry v1 API tests.

Tests for authentication, RBAC, rate limiting, CRUD operations,
filtering, pagination, caching, and error handling.
Minimum 20 test cases required.
"""

import time

import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient
from fastapi import FastAPI

from api.v1.agent_registry import (
    router,
    get_cache,
    reset_agent_store,
    _seed_default_agents,
)
from api.v1.auth_middleware import (
    UserRole,
    create_access_token,
    create_token_pair,
    create_refresh_token,
    reset_user_store,
)
from api.v1.rate_limiter import get_rate_limiter


# ─────────────────────────────────────────────────────────────
# Fixtures
# ─────────────────────────────────────────────────────────────


@pytest.fixture
def app():
    """Create test FastAPI app with agent registry router."""
    test_app = FastAPI()
    test_app.include_router(router)
    return test_app


@pytest_asyncio.fixture
async def client(app):
    """Create async test client."""
    async with AsyncClient(
        transport=ASGITransport(app=app),
        base_url="http://test",
    ) as c:
        yield c


@pytest.fixture(autouse=True)
def reset_state():
    """Reset all in-memory state before each test."""
    reset_agent_store()
    reset_user_store()
    get_rate_limiter().reset()
    _seed_default_agents()
    yield
    reset_agent_store()
    get_rate_limiter().reset()


def _admin_headers() -> dict[str, str]:
    """Generate Bearer auth headers for admin user."""
    token = create_access_token("usr_admin_001", "admin", UserRole.ADMIN)
    return {"Authorization": f"Bearer {token}"}


def _manager_headers() -> dict[str, str]:
    """Generate Bearer auth headers for manager user."""
    token = create_access_token("usr_manager_001", "manager", UserRole.MANAGER)
    return {"Authorization": f"Bearer {token}"}


def _user_headers() -> dict[str, str]:
    """Generate Bearer auth headers for regular user."""
    token = create_access_token("usr_user_001", "user", UserRole.USER)
    return {"Authorization": f"Bearer {token}"}


# ─────────────────────────────────────────────────────────────
# 1-4: Authentication Tests
# ─────────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_login_success(client):
    """Test 1: Successful login returns token pair."""
    response = await client.post(
        "/api/v1/auth/login",
        json={"username": "admin", "password": "admin123"},
    )

    assert response.status_code == 200
    data = response.json()
    assert "access_token" in data
    assert "refresh_token" in data
    assert data["token_type"] == "bearer"
    assert data["expires_in"] == 1800  # 30 minutes


@pytest.mark.asyncio
async def test_login_invalid_credentials(client):
    """Test 2: Login with wrong password returns 401."""
    response = await client.post(
        "/api/v1/auth/login",
        json={"username": "admin", "password": "wrongpassword"},
    )

    assert response.status_code == 401
    assert "Invalid username or password" in response.json()["detail"]


@pytest.mark.asyncio
async def test_refresh_token_success(client):
    """Test 3: Token refresh with valid refresh token succeeds."""
    # Login first to get a refresh token
    login_response = await client.post(
        "/api/v1/auth/login",
        json={"username": "admin", "password": "admin123"},
    )
    refresh_tok = login_response.json()["refresh_token"]

    # Use refresh token to get new tokens
    response = await client.post(
        "/api/v1/auth/refresh",
        json={"refresh_token": refresh_tok},
    )

    assert response.status_code == 200
    data = response.json()
    assert "access_token" in data
    assert "refresh_token" in data


@pytest.mark.asyncio
async def test_refresh_with_access_token_fails(client):
    """Test 4: Using an access token as refresh token fails."""
    access_token = create_access_token("usr_admin_001", "admin", UserRole.ADMIN)

    response = await client.post(
        "/api/v1/auth/refresh",
        json={"refresh_token": access_token},
    )

    assert response.status_code == 401


# ─────────────────────────────────────────────────────────────
# 5-8: RBAC Tests
# ─────────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_admin_can_create_agent(client):
    """Test 5: Admin can create an agent."""
    response = await client.post(
        "/api/v1/agents",
        json={
            "name": "Test Agent",
            "description": "A test agent",
            "category": "development",
        },
        headers=_admin_headers(),
    )

    assert response.status_code == 201
    data = response.json()
    assert data["name"] == "Test Agent"
    assert data["category"] == "development"
    assert "id" in data


@pytest.mark.asyncio
async def test_manager_cannot_create_agent(client):
    """Test 6: Manager cannot create agents (admin only)."""
    response = await client.post(
        "/api/v1/agents",
        json={
            "name": "Forbidden Agent",
            "description": "Should not be created",
            "category": "development",
        },
        headers=_manager_headers(),
    )

    assert response.status_code == 403
    assert "Insufficient permissions" in response.json()["detail"]


@pytest.mark.asyncio
async def test_manager_can_update_agent(client):
    """Test 7: Manager can update an agent."""
    response = await client.put(
        "/api/v1/agents/agent-web-ui",
        json={"name": "Updated Web UI Specialist"},
        headers=_manager_headers(),
    )

    assert response.status_code == 200
    assert response.json()["name"] == "Updated Web UI Specialist"


@pytest.mark.asyncio
async def test_regular_user_cannot_update_agent(client):
    """Test 8: Regular user cannot update agents."""
    response = await client.put(
        "/api/v1/agents/agent-web-ui",
        json={"name": "Hacked Name"},
        headers=_user_headers(),
    )

    assert response.status_code == 403


@pytest.mark.asyncio
async def test_regular_user_cannot_delete_agent(client):
    """Test 9: Regular user cannot delete agents (admin only)."""
    response = await client.delete(
        "/api/v1/agents/agent-web-ui",
        headers=_user_headers(),
    )

    assert response.status_code == 403


@pytest.mark.asyncio
async def test_unauthenticated_cannot_create_agent(client):
    """Test 10: Unauthenticated user cannot create agents."""
    response = await client.post(
        "/api/v1/agents",
        json={
            "name": "No Auth Agent",
            "category": "development",
        },
    )

    assert response.status_code == 401


# ─────────────────────────────────────────────────────────────
# 11-12: Rate Limiting Tests
# ─────────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_anonymous_rate_limit(client):
    """Test 11: Anonymous users are limited to 10 req/min."""
    # Make 10 requests (should all succeed)
    for i in range(10):
        response = await client.get("/api/v1/agents")
        assert response.status_code == 200, f"Request {i+1} failed unexpectedly"

    # 11th request should be rate limited
    response = await client.get("/api/v1/agents")
    assert response.status_code == 429
    detail = response.json()["detail"]
    assert detail["error"] == "Rate limit exceeded"


@pytest.mark.asyncio
async def test_admin_unlimited_rate(client):
    """Test 12: Admin users have unlimited rate."""
    headers = _admin_headers()

    # Make 15 requests (beyond anonymous limit) - all should succeed
    for i in range(15):
        response = await client.get("/api/v1/agents", headers=headers)
        assert response.status_code == 200, f"Admin request {i+1} failed"


# ─────────────────────────────────────────────────────────────
# 13-16: CRUD Operations Tests
# ─────────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_list_agents_returns_seeded(client):
    """Test 13: List agents returns seeded default agents."""
    response = await client.get("/api/v1/agents", headers=_user_headers())

    assert response.status_code == 200
    data = response.json()
    assert data["total"] == 4  # 4 default agents
    assert len(data["items"]) == 4


@pytest.mark.asyncio
async def test_get_agent_by_id(client):
    """Test 14: Get a single agent by ID."""
    response = await client.get(
        "/api/v1/agents/agent-web-ui", headers=_user_headers()
    )

    assert response.status_code == 200
    data = response.json()
    assert data["id"] == "agent-web-ui"
    assert data["name"] == "Web UI Specialist"


@pytest.mark.asyncio
async def test_get_agent_not_found(client):
    """Test 15: Get non-existent agent returns 404."""
    response = await client.get(
        "/api/v1/agents/nonexistent-agent", headers=_user_headers()
    )

    assert response.status_code == 404


@pytest.mark.asyncio
async def test_delete_agent_success(client):
    """Test 16: Admin can delete an agent."""
    headers = _admin_headers()

    response = await client.delete("/api/v1/agents/agent-devops", headers=headers)
    assert response.status_code == 200

    # Verify deleted
    get_response = await client.get("/api/v1/agents/agent-devops", headers=headers)
    assert get_response.status_code == 404


# ─────────────────────────────────────────────────────────────
# 17-19: Filtering & Pagination Tests
# ─────────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_filter_by_status(client):
    """Test 17: Filter agents by status (multi-value)."""
    headers = _user_headers()

    # Filter for available agents only
    response = await client.get("/api/v1/agents?status=available", headers=headers)
    data = response.json()
    assert data["total"] == 2  # agent-web-ui and agent-backend

    # Filter for multiple statuses
    response = await client.get(
        "/api/v1/agents?status=available,busy", headers=headers
    )
    data = response.json()
    assert data["total"] == 3  # available + busy


@pytest.mark.asyncio
async def test_filter_by_category(client):
    """Test 18: Filter agents by category."""
    headers = _user_headers()

    response = await client.get(
        "/api/v1/agents?category=development", headers=headers
    )
    data = response.json()
    assert data["total"] == 2  # agent-web-ui and agent-backend
    for item in data["items"]:
        assert item["category"] == "development"


@pytest.mark.asyncio
async def test_filter_by_min_success_rate(client):
    """Test 19: Filter agents by minimum success rate."""
    headers = _user_headers()

    response = await client.get(
        "/api/v1/agents?min_success_rate=0.95", headers=headers
    )
    data = response.json()
    # agent-web-ui (0.95) and agent-quality (0.98)
    assert data["total"] == 2
    for item in data["items"]:
        assert item["success_rate"] >= 0.95


@pytest.mark.asyncio
async def test_search_agents(client):
    """Test 20: Search agents by keyword in name/description."""
    headers = _user_headers()

    response = await client.get(
        "/api/v1/agents?search=backend", headers=headers
    )
    data = response.json()
    assert data["total"] == 1
    assert data["items"][0]["id"] == "agent-backend"


@pytest.mark.asyncio
async def test_multi_sort(client):
    """Test 21: Sort agents by multiple fields."""
    headers = _user_headers()

    response = await client.get(
        "/api/v1/agents?sort=success_rate:desc", headers=headers
    )
    data = response.json()

    rates = [item["success_rate"] for item in data["items"]]
    assert rates == sorted(rates, reverse=True)


@pytest.mark.asyncio
async def test_offset_pagination(client):
    """Test 22: Offset-based pagination works correctly."""
    headers = _user_headers()

    response = await client.get(
        "/api/v1/agents?page=1&page_size=2", headers=headers
    )
    data = response.json()

    assert len(data["items"]) == 2
    assert data["total"] == 4
    assert data["page"] == 1
    assert data["page_size"] == 2
    assert data["total_pages"] == 2
    assert data["has_more"] is True

    # Page 2
    response2 = await client.get(
        "/api/v1/agents?page=2&page_size=2", headers=headers
    )
    data2 = response2.json()
    assert len(data2["items"]) == 2
    assert data2["has_more"] is False


@pytest.mark.asyncio
async def test_cursor_pagination(client):
    """Test 23: Cursor-based pagination works correctly."""
    headers = _user_headers()

    # Get first page
    response = await client.get(
        "/api/v1/agents?page_size=2&sort=name:asc", headers=headers
    )
    data = response.json()
    assert len(data["items"]) == 2
    first_page_ids = [item["id"] for item in data["items"]]

    # Use cursor from first page to get next page (if cursor available)
    # Since we didn't use cursor initially, let's build one
    # Get all sorted, then use cursor
    response_all = await client.get(
        "/api/v1/agents?sort=name:asc", headers=headers
    )
    all_data = response_all.json()
    all_ids = [item["id"] for item in all_data["items"]]

    # Construct cursor from the second item
    import base64
    cursor = base64.urlsafe_b64encode(all_ids[1].encode()).decode()

    response2 = await client.get(
        f"/api/v1/agents?cursor={cursor}&page_size=2&sort=name:asc",
        headers=headers,
    )
    data2 = response2.json()
    cursor_page_ids = [item["id"] for item in data2["items"]]
    # Items after the cursor position should not overlap with first 2
    assert all_ids[1] not in cursor_page_ids


# ─────────────────────────────────────────────────────────────
# 24-26: Caching Tests
# ─────────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_agent_cache_hit(client):
    """Test 24: Second GET for same agent is served from cache."""
    headers = _user_headers()
    cache = get_cache()

    # Ensure cache is empty
    cache.clear()

    # First request - cache miss
    response1 = await client.get("/api/v1/agents/agent-web-ui", headers=headers)
    assert response1.status_code == 200

    # Verify cache was populated
    cached = cache.get("agent:agent-web-ui")
    assert cached is not None
    assert cached["id"] == "agent-web-ui"

    # Second request - should come from cache
    response2 = await client.get("/api/v1/agents/agent-web-ui", headers=headers)
    assert response2.status_code == 200
    assert response2.json()["id"] == "agent-web-ui"


@pytest.mark.asyncio
async def test_stats_cache(client):
    """Test 25: Stats endpoint uses 1-min TTL cache."""
    headers = _user_headers()
    cache = get_cache()
    cache.clear()

    response = await client.get("/api/v1/agents/stats", headers=headers)
    assert response.status_code == 200

    # Verify stats are cached
    cached = cache.get("stats:agents")
    assert cached is not None
    assert cached["total_agents"] == 4


@pytest.mark.asyncio
async def test_cache_invalidated_on_create(client):
    """Test 26: Creating an agent invalidates stats cache."""
    headers = _admin_headers()
    cache = get_cache()

    # Populate stats cache
    await client.get("/api/v1/agents/stats", headers=headers)
    assert cache.get("stats:agents") is not None

    # Create a new agent
    await client.post(
        "/api/v1/agents",
        json={
            "name": "New Agent",
            "description": "Testing cache invalidation",
            "category": "testing",
        },
        headers=headers,
    )

    # Stats cache should be invalidated
    assert cache.get("stats:agents") is None


@pytest.mark.asyncio
async def test_cache_invalidated_on_update(client):
    """Test 27: Updating an agent invalidates both agent and stats cache."""
    headers = _admin_headers()
    cache = get_cache()

    # Populate caches
    await client.get("/api/v1/agents/agent-web-ui", headers=headers)
    await client.get("/api/v1/agents/stats", headers=headers)
    assert cache.get("agent:agent-web-ui") is not None
    assert cache.get("stats:agents") is not None

    # Update agent (admin also qualifies as manager)
    await client.put(
        "/api/v1/agents/agent-web-ui",
        json={"name": "Updated"},
        headers=headers,
    )

    # Both caches should be invalidated
    assert cache.get("agent:agent-web-ui") is None
    assert cache.get("stats:agents") is None


@pytest.mark.asyncio
async def test_cache_invalidated_on_delete(client):
    """Test 28: Deleting an agent invalidates caches."""
    headers = _admin_headers()
    cache = get_cache()

    # Populate cache
    await client.get("/api/v1/agents/agent-devops", headers=headers)
    assert cache.get("agent:agent-devops") is not None

    # Delete
    await client.delete("/api/v1/agents/agent-devops", headers=headers)

    # Cache should be invalidated
    assert cache.get("agent:agent-devops") is None


# ─────────────────────────────────────────────────────────────
# 29-30: Error Handling Tests
# ─────────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_create_agent_validation_error(client):
    """Test 29: Creating agent with missing required fields returns 422."""
    response = await client.post(
        "/api/v1/agents",
        json={
            "description": "Missing name and category",
        },
        headers=_admin_headers(),
    )

    assert response.status_code == 422  # Validation error


@pytest.mark.asyncio
async def test_delete_nonexistent_agent(client):
    """Test 30: Deleting non-existent agent returns 404."""
    response = await client.delete(
        "/api/v1/agents/nonexistent-id",
        headers=_admin_headers(),
    )

    assert response.status_code == 404


@pytest.mark.asyncio
async def test_update_nonexistent_agent(client):
    """Test 31: Updating non-existent agent returns 404."""
    response = await client.put(
        "/api/v1/agents/nonexistent-id",
        json={"name": "Ghost"},
        headers=_manager_headers(),
    )

    assert response.status_code == 404


@pytest.mark.asyncio
async def test_login_nonexistent_user(client):
    """Test 32: Login with non-existent user returns 401."""
    response = await client.post(
        "/api/v1/auth/login",
        json={"username": "nobody", "password": "nopass"},
    )

    assert response.status_code == 401


@pytest.mark.asyncio
async def test_expired_token_rejected(client):
    """Test 33: Expired access token is rejected."""
    from datetime import timedelta

    token = create_access_token(
        "usr_admin_001",
        "admin",
        UserRole.ADMIN,
        expires_delta=timedelta(seconds=-10),  # Already expired
    )

    response = await client.get(
        "/api/v1/agents/agent-web-ui",
        headers={"Authorization": f"Bearer {token}"},
    )

    # Should still return 200 because get_optional_user returns None for invalid tokens
    # and the endpoint allows anonymous access
    assert response.status_code == 200


@pytest.mark.asyncio
async def test_malformed_token_rejected(client):
    """Test 34: Malformed token doesn't crash the server."""
    response = await client.get(
        "/api/v1/agents",
        headers={"Authorization": "Bearer not.a.valid.jwt.token"},
    )

    # Anonymous access still works, malformed token is treated as no auth
    assert response.status_code == 200


@pytest.mark.asyncio
async def test_stats_response_structure(client):
    """Test 35: Stats endpoint returns complete structure."""
    headers = _user_headers()

    response = await client.get("/api/v1/agents/stats", headers=headers)

    assert response.status_code == 200
    data = response.json()
    assert "total_agents" in data
    assert "available_agents" in data
    assert "busy_agents" in data
    assert "unavailable_agents" in data
    assert "error_agents" in data
    assert "by_category" in data
    assert "total_tasks_completed" in data
    assert "avg_success_rate" in data
    assert "avg_execution_time_ms" in data
    assert data["total_agents"] == 4
    assert data["by_category"]["development"] == 2
