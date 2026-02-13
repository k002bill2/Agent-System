"""Agent Registry v1 API with JWT auth, RBAC, rate limiting, and caching.

Provides CRUD endpoints for managing agents in the registry with:
- JWT HS256 authentication (access: 30min, refresh: 7 days)
- Role-based access control (admin > manager > user)
- Sliding window rate limiting (anon: 10/min, auth: 100/min, admin: unlimited)
- In-memory caching with TTL (agent: 5min, stats: 1min)
- Complex filtering, multi-sort, and cursor/offset pagination
"""

import base64
import logging
import time
from datetime import UTC, datetime
from enum import Enum
from typing import Any
from uuid import uuid4

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from pydantic import BaseModel, Field

from api.v1.auth_middleware import (
    AuthenticatedUser,
    TokenPairResponse,
    UserRole,
    authenticate_user,
    create_token_pair,
    get_optional_user,
    get_user_store,
    require_admin,
    require_manager,
    verify_token,
)
from api.v1.rate_limiter import (
    RateLimitTier,
    check_rate_limit,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1", tags=["agent-registry-v1"])

# ─────────────────────────────────────────────────────────────
# TTL Cache Implementation
# ─────────────────────────────────────────────────────────────

CACHE_TTL_AGENT = 300  # 5 minutes for individual agents
CACHE_TTL_STATS = 60  # 1 minute for stats


class TTLCache:
    """In-memory cache with per-entry TTL expiration.

    Each entry stores a value and its expiration timestamp.
    Expired entries are lazily removed on access.
    """

    def __init__(self) -> None:
        self._store: dict[str, tuple[Any, float]] = {}

    def get(self, key: str) -> Any | None:
        """Get a cached value if it exists and hasn't expired.

        Args:
            key: Cache key to look up.

        Returns:
            Cached value or None if expired/missing.
        """
        entry = self._store.get(key)
        if entry is None:
            return None
        value, expires_at = entry
        if time.monotonic() > expires_at:
            del self._store[key]
            return None
        return value

    def set(self, key: str, value: Any, ttl_seconds: int) -> None:
        """Store a value in the cache with a TTL.

        Args:
            key: Cache key.
            value: Value to cache.
            ttl_seconds: Time-to-live in seconds.
        """
        expires_at = time.monotonic() + ttl_seconds
        self._store[key] = (value, expires_at)

    def invalidate(self, key: str) -> bool:
        """Remove a specific entry from the cache.

        Args:
            key: Cache key to remove.

        Returns:
            True if the key existed and was removed.
        """
        if key in self._store:
            del self._store[key]
            return True
        return False

    def invalidate_pattern(self, prefix: str) -> int:
        """Remove all entries matching a key prefix.

        Args:
            prefix: Key prefix to match.

        Returns:
            Number of entries removed.
        """
        keys_to_remove = [k for k in self._store if k.startswith(prefix)]
        for key in keys_to_remove:
            del self._store[key]
        return len(keys_to_remove)

    def clear(self) -> None:
        """Remove all entries from the cache."""
        self._store.clear()

    def size(self) -> int:
        """Return the number of entries in the cache."""
        return len(self._store)


# Global cache instance
_cache = TTLCache()


def get_cache() -> TTLCache:
    """Get the global cache instance."""
    return _cache


# ─────────────────────────────────────────────────────────────
# Request / Response Models
# ─────────────────────────────────────────────────────────────


class LoginRequest(BaseModel):
    """Login request body."""

    username: str = Field(..., min_length=1, description="Username")
    password: str = Field(..., min_length=1, description="Password")


class RefreshTokenRequest(BaseModel):
    """Token refresh request body."""

    refresh_token: str = Field(..., description="Valid refresh token")


class AgentStatus(str, Enum):
    """Agent availability status."""

    AVAILABLE = "available"
    BUSY = "busy"
    UNAVAILABLE = "unavailable"
    ERROR = "error"


class AgentCategory(str, Enum):
    """Agent functional category."""

    DEVELOPMENT = "development"
    ORCHESTRATION = "orchestration"
    QUALITY = "quality"
    RESEARCH = "research"
    TESTING = "testing"
    DEVOPS = "devops"


class CapabilitySchema(BaseModel):
    """Agent capability definition."""

    name: str = Field(..., description="Capability name")
    description: str = Field(default="", description="Capability description")
    keywords: list[str] = Field(default_factory=list, description="Search keywords")
    priority: int = Field(default=0, ge=0, le=100, description="Priority (0-100)")


class AgentCreateRequest(BaseModel):
    """Request body for creating a new agent."""

    name: str = Field(..., min_length=1, max_length=200, description="Agent name")
    description: str = Field(default="", max_length=2000, description="Agent description")
    category: AgentCategory = Field(..., description="Agent category")
    status: AgentStatus = Field(default=AgentStatus.AVAILABLE, description="Initial status")
    capabilities: list[CapabilitySchema] = Field(
        default_factory=list, description="Agent capabilities"
    )
    specializations: list[str] = Field(default_factory=list, description="Area specializations")
    estimated_cost_per_task: float = Field(default=0.0, ge=0.0, description="Estimated cost in USD")
    avg_execution_time_ms: int = Field(default=0, ge=0, description="Average execution time in ms")
    max_concurrent_tasks: int = Field(default=1, ge=1, le=100, description="Max concurrent tasks")
    success_rate: float = Field(default=1.0, ge=0.0, le=1.0, description="Success rate (0.0-1.0)")


class AgentUpdateRequest(BaseModel):
    """Request body for updating an agent (partial update)."""

    name: str | None = Field(None, min_length=1, max_length=200)
    description: str | None = Field(None, max_length=2000)
    category: AgentCategory | None = None
    status: AgentStatus | None = None
    capabilities: list[CapabilitySchema] | None = None
    specializations: list[str] | None = None
    estimated_cost_per_task: float | None = Field(None, ge=0.0)
    avg_execution_time_ms: int | None = Field(None, ge=0)
    max_concurrent_tasks: int | None = Field(None, ge=1, le=100)
    success_rate: float | None = Field(None, ge=0.0, le=1.0)


class AgentResponse(BaseModel):
    """Full agent response schema."""

    id: str
    name: str
    description: str
    category: str
    status: str
    capabilities: list[dict[str, Any]]
    specializations: list[str]
    estimated_cost_per_task: float
    avg_execution_time_ms: int
    max_concurrent_tasks: int
    total_tasks_completed: int
    success_rate: float
    created_at: str
    updated_at: str


class PaginatedAgentsResponse(BaseModel):
    """Paginated list response with cursor support."""

    items: list[AgentResponse]
    total: int
    page: int | None = None
    page_size: int | None = None
    total_pages: int | None = None
    next_cursor: str | None = None
    has_more: bool = False


class AgentStatsResponse(BaseModel):
    """Agent registry statistics."""

    total_agents: int
    available_agents: int
    busy_agents: int
    unavailable_agents: int
    error_agents: int
    by_category: dict[str, int]
    total_tasks_completed: int
    avg_success_rate: float
    avg_execution_time_ms: float


# ─────────────────────────────────────────────────────────────
# In-memory Agent Storage
# ─────────────────────────────────────────────────────────────

_agents: dict[str, dict[str, Any]] = {}


def get_agent_store() -> dict[str, dict[str, Any]]:
    """Get the in-memory agent store."""
    return _agents


def reset_agent_store() -> None:
    """Reset agent store and cache (for testing)."""
    _agents.clear()
    _cache.clear()


def _seed_default_agents() -> None:
    """Seed the store with default agents if empty."""
    if _agents:
        return
    now = datetime.now(UTC).isoformat()
    defaults = [
        {
            "id": "agent-web-ui",
            "name": "Web UI Specialist",
            "description": "React component design, responsive layouts, UX optimization.",
            "category": AgentCategory.DEVELOPMENT.value,
            "status": AgentStatus.AVAILABLE.value,
            "capabilities": [
                {
                    "name": "react-components",
                    "description": "React component design",
                    "keywords": ["react", "ui", "component"],
                    "priority": 10,
                },
                {
                    "name": "responsive-design",
                    "description": "Responsive layouts",
                    "keywords": ["responsive", "layout", "css"],
                    "priority": 8,
                },
            ],
            "specializations": ["React", "TypeScript", "Tailwind"],
            "estimated_cost_per_task": 0.05,
            "avg_execution_time_ms": 15000,
            "max_concurrent_tasks": 2,
            "total_tasks_completed": 150,
            "success_rate": 0.95,
            "created_at": now,
            "updated_at": now,
        },
        {
            "id": "agent-backend",
            "name": "Backend Integration Specialist",
            "description": "API integration, database management, authentication.",
            "category": AgentCategory.DEVELOPMENT.value,
            "status": AgentStatus.AVAILABLE.value,
            "capabilities": [
                {
                    "name": "api-integration",
                    "description": "REST/GraphQL APIs",
                    "keywords": ["api", "rest", "graphql"],
                    "priority": 10,
                },
                {
                    "name": "database",
                    "description": "Database management",
                    "keywords": ["database", "sql", "orm"],
                    "priority": 9,
                },
            ],
            "specializations": ["FastAPI", "PostgreSQL", "SQLAlchemy"],
            "estimated_cost_per_task": 0.06,
            "avg_execution_time_ms": 20000,
            "max_concurrent_tasks": 1,
            "total_tasks_completed": 120,
            "success_rate": 0.92,
            "created_at": now,
            "updated_at": now,
        },
        {
            "id": "agent-quality",
            "name": "Quality Validator",
            "description": "Code review, standards compliance, quality gates.",
            "category": AgentCategory.QUALITY.value,
            "status": AgentStatus.BUSY.value,
            "capabilities": [
                {
                    "name": "code-review",
                    "description": "Code review",
                    "keywords": ["review", "quality"],
                    "priority": 10,
                },
            ],
            "specializations": ["Code Review", "Testing"],
            "estimated_cost_per_task": 0.03,
            "avg_execution_time_ms": 8000,
            "max_concurrent_tasks": 3,
            "total_tasks_completed": 200,
            "success_rate": 0.98,
            "created_at": now,
            "updated_at": now,
        },
        {
            "id": "agent-devops",
            "name": "DevOps Engineer",
            "description": "CI/CD pipelines, infrastructure management, deployment.",
            "category": AgentCategory.DEVOPS.value,
            "status": AgentStatus.UNAVAILABLE.value,
            "capabilities": [
                {
                    "name": "cicd",
                    "description": "CI/CD pipeline management",
                    "keywords": ["ci", "cd", "pipeline", "deploy"],
                    "priority": 10,
                },
            ],
            "specializations": ["Docker", "Kubernetes", "GitHub Actions"],
            "estimated_cost_per_task": 0.08,
            "avg_execution_time_ms": 25000,
            "max_concurrent_tasks": 1,
            "total_tasks_completed": 80,
            "success_rate": 0.88,
            "created_at": now,
            "updated_at": now,
        },
    ]

    for agent in defaults:
        _agents[agent["id"]] = agent


# Seed on module load
_seed_default_agents()


# ─────────────────────────────────────────────────────────────
# Helper functions
# ─────────────────────────────────────────────────────────────


def _agent_to_response(agent: dict[str, Any]) -> AgentResponse:
    """Convert an agent dict to AgentResponse."""
    return AgentResponse(
        id=agent["id"],
        name=agent["name"],
        description=agent["description"],
        category=agent["category"],
        status=agent["status"],
        capabilities=agent.get("capabilities", []),
        specializations=agent.get("specializations", []),
        estimated_cost_per_task=agent.get("estimated_cost_per_task", 0.0),
        avg_execution_time_ms=agent.get("avg_execution_time_ms", 0),
        max_concurrent_tasks=agent.get("max_concurrent_tasks", 1),
        total_tasks_completed=agent.get("total_tasks_completed", 0),
        success_rate=agent.get("success_rate", 1.0),
        created_at=agent.get("created_at", ""),
        updated_at=agent.get("updated_at", ""),
    )


def _generate_cursor(agent_id: str) -> str:
    """Generate an opaque cursor from an agent ID."""
    return base64.urlsafe_b64encode(agent_id.encode()).decode()


def _decode_cursor(cursor: str) -> str | None:
    """Decode a cursor back to an agent ID."""
    try:
        return base64.urlsafe_b64decode(cursor.encode()).decode()
    except Exception:
        return None


async def _apply_rate_limit(request: Request, user: AuthenticatedUser | None) -> None:
    """Apply rate limiting based on user authentication status."""
    if user and user.role == UserRole.ADMIN:
        tier = RateLimitTier.ADMIN
    elif user:
        tier = RateLimitTier.AUTHENTICATED
    else:
        tier = RateLimitTier.ANONYMOUS

    user_id = user.user_id if user else None
    await check_rate_limit(request, tier=tier, user_id=user_id)


# ─────────────────────────────────────────────────────────────
# Auth Endpoints
# ─────────────────────────────────────────────────────────────


@router.post("/auth/login", response_model=TokenPairResponse)
async def login(request_body: LoginRequest, request: Request) -> TokenPairResponse:
    """Authenticate user and return JWT token pair.

    Returns HS256-signed access token (30min) and refresh token (7 days).
    """
    await check_rate_limit(request, tier=RateLimitTier.ANONYMOUS)

    user = authenticate_user(request_body.username, request_body.password)
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid username or password",
            headers={"WWW-Authenticate": "Bearer"},
        )

    token_pair = create_token_pair(user.user_id, user.username, user.role)
    logger.info("User logged in: %s (role=%s)", user.username, user.role.value)
    return token_pair


@router.post("/auth/refresh", response_model=TokenPairResponse)
async def refresh_token(request_body: RefreshTokenRequest, request: Request) -> TokenPairResponse:
    """Refresh access token using a valid refresh token.

    Validates the refresh token (7-day expiry) and issues a new token pair.
    """
    await check_rate_limit(request, tier=RateLimitTier.ANONYMOUS)

    payload = verify_token(request_body.refresh_token, expected_type="refresh")

    user_id = payload.get("sub", "")
    username = payload.get("username", "")
    role_str = payload.get("role", "user")

    try:
        role = UserRole(role_str)
    except ValueError:
        role = UserRole.USER

    # Verify user still exists and is active
    users = get_user_store()
    user = users.get(username)
    if not user or not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User not found or inactive",
        )

    token_pair = create_token_pair(user_id, username, role)
    logger.info("Token refreshed for user: %s", username)
    return token_pair


# ─────────────────────────────────────────────────────────────
# Agent CRUD Endpoints
# ─────────────────────────────────────────────────────────────


@router.get("/agents", response_model=PaginatedAgentsResponse)
async def list_agents(
    request: Request,
    current_user: AuthenticatedUser | None = Depends(get_optional_user),
    # Filtering
    agent_status: str | None = Query(
        None, alias="status", description="Comma-separated statuses: available,busy"
    ),
    category: str | None = Query(None, description="Single category filter"),
    min_success_rate: float | None = Query(
        None, ge=0.0, le=1.0, description="Minimum success rate"
    ),
    search: str | None = Query(None, description="Search in name and description"),
    # Sorting
    sort: str | None = Query(None, description="Multi-sort: name:asc,success_rate:desc"),
    # Pagination - cursor-based
    cursor: str | None = Query(None, description="Cursor for cursor-based pagination"),
    # Pagination - offset-based
    page: int = Query(1, ge=1, description="Page number (offset-based)"),
    page_size: int = Query(20, ge=1, le=100, description="Items per page"),
) -> PaginatedAgentsResponse:
    """List agents with complex filtering, multi-sort, and pagination.

    Supports both cursor-based and offset-based pagination.
    Filtering by status (multi-value), category, min_success_rate, and search.
    Sorting by multiple fields with asc/desc direction.
    """
    await _apply_rate_limit(request, current_user)

    agents = list(_agents.values())

    # ── Filtering ──
    if agent_status:
        status_values = [s.strip().lower() for s in agent_status.split(",")]
        agents = [a for a in agents if a["status"].lower() in status_values]

    if category:
        agents = [a for a in agents if a["category"].lower() == category.lower()]

    if min_success_rate is not None:
        agents = [a for a in agents if a.get("success_rate", 0) >= min_success_rate]

    if search:
        search_lower = search.lower()
        agents = [
            a
            for a in agents
            if search_lower in a["name"].lower() or search_lower in a.get("description", "").lower()
        ]

    total = len(agents)

    # ── Sorting ──
    if sort:
        sort_fields = sort.split(",")
        for sort_field in reversed(sort_fields):
            parts = sort_field.strip().split(":")
            field_name = parts[0]
            direction = parts[1] if len(parts) > 1 else "asc"
            reverse = direction.lower() == "desc"

            agents.sort(
                key=lambda a, f=field_name: a.get(f, ""),
                reverse=reverse,
            )
    else:
        # Default: sort by created_at descending
        agents.sort(key=lambda a: a.get("created_at", ""), reverse=True)

    # ── Pagination ──
    if cursor:
        # Cursor-based pagination
        decoded_id = _decode_cursor(cursor)
        if decoded_id is None:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Invalid cursor format",
            )

        # Find the position after the cursor
        start_idx = 0
        for idx, agent in enumerate(agents):
            if agent["id"] == decoded_id:
                start_idx = idx + 1
                break

        page_items = agents[start_idx : start_idx + page_size]
        has_more = start_idx + page_size < total
        next_cursor = _generate_cursor(page_items[-1]["id"]) if page_items and has_more else None

        return PaginatedAgentsResponse(
            items=[_agent_to_response(a) for a in page_items],
            total=total,
            next_cursor=next_cursor,
            has_more=has_more,
            page_size=page_size,
        )
    else:
        # Offset-based pagination
        total_pages = max(1, (total + page_size - 1) // page_size)
        start = (page - 1) * page_size
        end = start + page_size
        page_items = agents[start:end]
        has_more = end < total

        return PaginatedAgentsResponse(
            items=[_agent_to_response(a) for a in page_items],
            total=total,
            page=page,
            page_size=page_size,
            total_pages=total_pages,
            has_more=has_more,
        )


@router.get("/agents/stats", response_model=AgentStatsResponse)
async def get_agent_stats(
    request: Request,
    current_user: AuthenticatedUser | None = Depends(get_optional_user),
) -> AgentStatsResponse:
    """Get agent registry statistics (cached 1min TTL)."""
    await _apply_rate_limit(request, current_user)

    cache = get_cache()
    cache_key = "stats:agents"

    cached = cache.get(cache_key)
    if cached is not None:
        return AgentStatsResponse(**cached)

    agents = list(_agents.values())

    stats_data = {
        "total_agents": len(agents),
        "available_agents": sum(1 for a in agents if a["status"] == AgentStatus.AVAILABLE.value),
        "busy_agents": sum(1 for a in agents if a["status"] == AgentStatus.BUSY.value),
        "unavailable_agents": sum(
            1 for a in agents if a["status"] == AgentStatus.UNAVAILABLE.value
        ),
        "error_agents": sum(1 for a in agents if a["status"] == AgentStatus.ERROR.value),
        "by_category": {},
        "total_tasks_completed": sum(a.get("total_tasks_completed", 0) for a in agents),
        "avg_success_rate": (
            sum(a.get("success_rate", 0) for a in agents) / len(agents) if agents else 0.0
        ),
        "avg_execution_time_ms": (
            sum(a.get("avg_execution_time_ms", 0) for a in agents) / len(agents) if agents else 0.0
        ),
    }

    # Category breakdown
    for cat in AgentCategory:
        stats_data["by_category"][cat.value] = sum(1 for a in agents if a["category"] == cat.value)

    cache.set(cache_key, stats_data, CACHE_TTL_STATS)
    return AgentStatsResponse(**stats_data)


@router.get("/agents/{agent_id}", response_model=AgentResponse)
async def get_agent(
    agent_id: str,
    request: Request,
    current_user: AuthenticatedUser | None = Depends(get_optional_user),
) -> AgentResponse:
    """Get a single agent by ID (cached 5min TTL)."""
    await _apply_rate_limit(request, current_user)

    cache = get_cache()
    cache_key = f"agent:{agent_id}"

    cached = cache.get(cache_key)
    if cached is not None:
        return AgentResponse(**cached)

    agent = _agents.get(agent_id)
    if not agent:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Agent not found: {agent_id}",
        )

    response = _agent_to_response(agent)
    cache.set(cache_key, response.model_dump(), CACHE_TTL_AGENT)
    return response


@router.post(
    "/agents",
    response_model=AgentResponse,
    status_code=status.HTTP_201_CREATED,
)
async def create_agent(
    request_body: AgentCreateRequest,
    request: Request,
    current_user: AuthenticatedUser = Depends(require_admin),
) -> AgentResponse:
    """Create a new agent (admin only).

    Requires admin role. Invalidates stats cache on success.
    """
    await _apply_rate_limit(request, current_user)

    now = datetime.now(UTC).isoformat()
    agent_id = f"agent-{uuid4().hex[:12]}"

    agent_data: dict[str, Any] = {
        "id": agent_id,
        "name": request_body.name,
        "description": request_body.description,
        "category": request_body.category.value,
        "status": request_body.status.value,
        "capabilities": [cap.model_dump() for cap in request_body.capabilities],
        "specializations": request_body.specializations,
        "estimated_cost_per_task": request_body.estimated_cost_per_task,
        "avg_execution_time_ms": request_body.avg_execution_time_ms,
        "max_concurrent_tasks": request_body.max_concurrent_tasks,
        "total_tasks_completed": 0,
        "success_rate": request_body.success_rate,
        "created_at": now,
        "updated_at": now,
    }

    _agents[agent_id] = agent_data

    # Invalidate stats cache
    cache = get_cache()
    cache.invalidate("stats:agents")

    logger.info("Agent created: %s by %s", agent_id, current_user.username)
    return _agent_to_response(agent_data)


@router.put("/agents/{agent_id}", response_model=AgentResponse)
async def update_agent(
    agent_id: str,
    request_body: AgentUpdateRequest,
    request: Request,
    current_user: AuthenticatedUser = Depends(require_manager),
) -> AgentResponse:
    """Update an existing agent (admin or manager).

    Requires manager role or above. Invalidates both agent and stats caches.
    """
    await _apply_rate_limit(request, current_user)

    agent = _agents.get(agent_id)
    if not agent:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Agent not found: {agent_id}",
        )

    update_data = request_body.model_dump(exclude_unset=True)

    # Convert enum values to strings for storage
    if "category" in update_data and update_data["category"] is not None:
        update_data["category"] = update_data["category"].value
    if "status" in update_data and update_data["status"] is not None:
        update_data["status"] = update_data["status"].value
    if "capabilities" in update_data and update_data["capabilities"] is not None:
        update_data["capabilities"] = [
            cap.model_dump() if hasattr(cap, "model_dump") else cap
            for cap in update_data["capabilities"]
        ]

    agent.update(update_data)
    agent["updated_at"] = datetime.now(UTC).isoformat()

    # Invalidate caches
    cache = get_cache()
    cache.invalidate(f"agent:{agent_id}")
    cache.invalidate("stats:agents")

    logger.info("Agent updated: %s by %s", agent_id, current_user.username)
    return _agent_to_response(agent)


@router.delete("/agents/{agent_id}")
async def delete_agent(
    agent_id: str,
    request: Request,
    current_user: AuthenticatedUser = Depends(require_admin),
) -> dict[str, str]:
    """Delete an agent (admin only).

    Requires admin role. Invalidates both agent and stats caches.
    """
    await _apply_rate_limit(request, current_user)

    if agent_id not in _agents:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Agent not found: {agent_id}",
        )

    del _agents[agent_id]

    # Invalidate caches
    cache = get_cache()
    cache.invalidate(f"agent:{agent_id}")
    cache.invalidate("stats:agents")

    logger.info("Agent deleted: %s by %s", agent_id, current_user.username)
    return {"message": f"Agent '{agent_id}' deleted successfully"}
