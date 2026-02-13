"""Agent CRUD API Endpoints.

Provides Create, Read, Update, Delete operations for agents
with pagination, validation, and proper error handling.

Endpoints:
    GET    /api/v1/agents          - List agents (paginated)
    GET    /api/v1/agents/{id}     - Get single agent
    POST   /api/v1/agents          - Create agent
    PUT    /api/v1/agents/{id}     - Update agent
    DELETE /api/v1/agents/{id}     - Delete agent
"""

import logging
from datetime import UTC, datetime
from enum import Enum
from typing import Any
from uuid import uuid4

from fastapi import APIRouter, HTTPException, Query, status
from pydantic import BaseModel, Field

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1/agents", tags=["agents-crud"])


# ─────────────────────────────────────────────────────────────
# Enums
# ─────────────────────────────────────────────────────────────


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


# ─────────────────────────────────────────────────────────────
# Pydantic Models
# ─────────────────────────────────────────────────────────────


class CapabilitySchema(BaseModel):
    """Agent capability definition."""

    name: str = Field(..., min_length=1, description="Capability name")
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
    estimated_cost_per_task: float = Field(default=0.0, ge=0.0, description="Estimated cost (USD)")
    avg_execution_time_ms: int = Field(default=0, ge=0, description="Avg execution time (ms)")
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
    """Paginated list response."""

    items: list[AgentResponse]
    total: int
    page: int
    page_size: int
    total_pages: int
    has_more: bool


class AgentDeleteResponse(BaseModel):
    """Delete operation response."""

    message: str
    deleted_id: str


# ─────────────────────────────────────────────────────────────
# In-memory Agent Storage
# ─────────────────────────────────────────────────────────────

_agents: dict[str, dict[str, Any]] = {}


def get_agent_store() -> dict[str, dict[str, Any]]:
    """Get the in-memory agent store."""
    return _agents


def reset_agent_store() -> None:
    """Reset agent store (for testing)."""
    _agents.clear()


def seed_default_agents() -> None:
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
                    "description": "Code review and quality validation",
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
    ]

    for agent in defaults:
        _agents[agent["id"]] = agent


# Seed on module load
seed_default_agents()


# ─────────────────────────────────────────────────────────────
# Helper Functions
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


# ─────────────────────────────────────────────────────────────
# CRUD Endpoints
# ─────────────────────────────────────────────────────────────


@router.get("", response_model=PaginatedAgentsResponse)
async def list_agents(
    page: int = Query(1, ge=1, description="Page number"),
    page_size: int = Query(20, ge=1, le=100, description="Items per page"),
    category: str | None = Query(None, description="Filter by category"),
    agent_status: str | None = Query(None, alias="status", description="Filter by status"),
    search: str | None = Query(None, description="Search in name and description"),
) -> PaginatedAgentsResponse:
    """List all agents with pagination and optional filtering.

    Supports filtering by category, status, and text search in name/description.

    Args:
        page: Page number (1-based).
        page_size: Number of items per page (1-100).
        category: Filter by agent category.
        agent_status: Filter by agent status.
        search: Search keyword in agent name and description.

    Returns:
        Paginated list of agents.
    """
    agents = list(_agents.values())

    # Apply filters
    if category:
        try:
            AgentCategory(category)
        except ValueError:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Invalid category: '{category}'. Valid values: {[c.value for c in AgentCategory]}",
            )
        agents = [a for a in agents if a["category"] == category]

    if agent_status:
        try:
            AgentStatus(agent_status)
        except ValueError:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Invalid status: '{agent_status}'. Valid values: {[s.value for s in AgentStatus]}",
            )
        agents = [a for a in agents if a["status"] == agent_status]

    if search:
        search_lower = search.lower()
        agents = [
            a
            for a in agents
            if search_lower in a["name"].lower() or search_lower in a.get("description", "").lower()
        ]

    total = len(agents)

    # Sort by created_at descending (newest first)
    agents.sort(key=lambda a: a.get("created_at", ""), reverse=True)

    # Paginate
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


@router.get("/{agent_id}", response_model=AgentResponse)
async def get_agent(agent_id: str) -> AgentResponse:
    """Get a single agent by ID.

    Args:
        agent_id: Unique agent identifier.

    Returns:
        Agent details.

    Raises:
        HTTPException: 404 if agent not found.
    """
    agent = _agents.get(agent_id)
    if not agent:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Agent not found: {agent_id}",
        )
    return _agent_to_response(agent)


@router.post("", response_model=AgentResponse, status_code=status.HTTP_201_CREATED)
async def create_agent(request_body: AgentCreateRequest) -> AgentResponse:
    """Create a new agent.

    Args:
        request_body: Agent creation data with name, category, and optional fields.

    Returns:
        Created agent details with generated ID and timestamps.
    """
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

    logger.info(
        "Agent created: %s (name=%s, category=%s)",
        agent_id,
        request_body.name,
        request_body.category.value,
    )
    return _agent_to_response(agent_data)


@router.put("/{agent_id}", response_model=AgentResponse)
async def update_agent(agent_id: str, request_body: AgentUpdateRequest) -> AgentResponse:
    """Update an existing agent (partial update).

    Only provided fields are updated; omitted fields remain unchanged.

    Args:
        agent_id: Unique agent identifier.
        request_body: Fields to update.

    Returns:
        Updated agent details.

    Raises:
        HTTPException: 404 if agent not found, 400 if no fields provided.
    """
    agent = _agents.get(agent_id)
    if not agent:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Agent not found: {agent_id}",
        )

    update_data = request_body.model_dump(exclude_unset=True)

    if not update_data:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No fields provided for update",
        )

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

    logger.info("Agent updated: %s", agent_id)
    return _agent_to_response(agent)


@router.delete("/{agent_id}", response_model=AgentDeleteResponse)
async def delete_agent(agent_id: str) -> AgentDeleteResponse:
    """Delete an agent.

    Args:
        agent_id: Unique agent identifier.

    Returns:
        Confirmation message with deleted agent ID.

    Raises:
        HTTPException: 404 if agent not found.
    """
    if agent_id not in _agents:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Agent not found: {agent_id}",
        )

    del _agents[agent_id]

    logger.info("Agent deleted: %s", agent_id)
    return AgentDeleteResponse(
        message=f"Agent '{agent_id}' deleted successfully",
        deleted_id=agent_id,
    )
