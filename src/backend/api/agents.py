"""Agent API routes - Agent Registry, Lead Orchestrator, MCP Manager."""

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field
from typing import Any

from services.agent_registry import (
    AgentRegistry,
    AgentMetadata,
    AgentCategory,
    AgentStatus,
    AgentCapability,
    EffortLevel,
    get_agent_registry,
)
from agents.lead_orchestrator import (
    LeadOrchestratorAgent,
    TaskAnalysis,
    SubtaskPlan,
    ExecutionStrategy,
    get_lead_orchestrator,
)
from services.mcp_manager import (
    MCPServerConfig,
    MCPServerType,
    MCPServerStatus,
    MCPToolCall,
    MCPToolResult,
    MCPBatchToolCall,
    MCPBatchToolResult,
)


router = APIRouter(prefix="/agents", tags=["agents"])


# ─────────────────────────────────────────────────────────────
# Response Models
# ─────────────────────────────────────────────────────────────


class AgentResponse(BaseModel):
    """에이전트 정보 응답."""

    id: str
    name: str
    description: str
    category: str
    status: str
    capabilities: list[dict[str, Any]]
    specializations: list[str]
    estimated_cost_per_task: float
    avg_execution_time_ms: int
    total_tasks_completed: int
    success_rate: float
    is_available: bool


class AgentRegistryStatsResponse(BaseModel):
    """에이전트 레지스트리 통계 응답."""

    total_agents: int
    available_agents: int
    busy_agents: int
    by_category: dict[str, int]
    total_tasks_completed: int
    avg_success_rate: float


class TaskAnalysisRequest(BaseModel):
    """태스크 분석 요청."""

    task: str = Field(..., description="분석할 태스크 설명")
    context: dict[str, Any] | None = Field(None, description="추가 컨텍스트")


class TaskAnalysisResponse(BaseModel):
    """태스크 분석 응답."""

    success: bool
    analysis: dict[str, Any] | None = None
    error: str | None = None
    execution_time_ms: int = 0


class AgentSearchRequest(BaseModel):
    """에이전트 검색 요청."""

    query: str = Field(..., description="검색 쿼리 (태스크 설명)")
    category: str | None = Field(None, description="카테고리 필터")
    limit: int = Field(5, description="최대 결과 수")


class AgentSearchResult(BaseModel):
    """에이전트 검색 결과."""

    agent: AgentResponse
    score: int


class MCPToolSchemaResponse(BaseModel):
    """MCP 도구 스키마 응답."""

    name: str
    description: str
    input_schema: dict[str, Any] = {}


class MCPServerResponse(BaseModel):
    """MCP 서버 정보 응답."""

    id: str
    name: str
    type: str
    description: str
    status: str
    tool_count: int
    tools: list[MCPToolSchemaResponse] = []
    pid: int | None = None
    started_at: str | None = None
    last_error: str | None = None


class MCPToolCallRequest(BaseModel):
    """MCP 도구 호출 요청."""

    server_id: str = Field(..., description="MCP 서버 ID")
    tool_name: str = Field(..., description="도구 이름")
    arguments: dict[str, Any] = Field(default_factory=dict, description="도구 인자")
    timeout_ms: int = Field(30000, description="타임아웃 (ms)")


class MCPToolCallResponse(BaseModel):
    """MCP 도구 호출 응답."""

    success: bool
    content: list[dict[str, Any]] = []
    error: str | None = None
    execution_time_ms: int = 0


class MCPBatchToolCallRequest(BaseModel):
    """MCP 배치 도구 호출 요청."""

    calls: list[MCPToolCallRequest] = Field(..., description="도구 호출 목록")
    max_concurrent: int = Field(3, ge=1, le=10, description="최대 동시 실행 수")


class MCPBatchToolCallResponse(BaseModel):
    """MCP 배치 도구 호출 응답."""

    results: list[MCPToolCallResponse] = Field(default_factory=list, description="개별 결과 목록")
    total_execution_time_ms: int = Field(0, description="전체 실행 시간 (ms)")
    success_count: int = Field(0, description="성공한 호출 수")
    failure_count: int = Field(0, description="실패한 호출 수")


class MCPManagerStatsResponse(BaseModel):
    """MCP 매니저 통계 응답."""

    total_servers: int
    running_servers: int
    total_tools: int
    servers: dict[str, dict[str, Any]]


# ─────────────────────────────────────────────────────────────
# Agent Registry API
# ─────────────────────────────────────────────────────────────


def _agent_to_response(agent: AgentMetadata) -> AgentResponse:
    """AgentMetadata를 AgentResponse로 변환."""
    return AgentResponse(
        id=agent.id,
        name=agent.name,
        description=agent.description,
        category=agent.category.value,
        status=agent.status.value,
        capabilities=[
            {
                "name": cap.name,
                "description": cap.description,
                "keywords": cap.keywords,
                "priority": cap.priority,
            }
            for cap in agent.capabilities
        ],
        specializations=agent.specializations,
        estimated_cost_per_task=agent.estimated_cost_per_task,
        avg_execution_time_ms=agent.avg_execution_time_ms,
        total_tasks_completed=agent.total_tasks_completed,
        success_rate=agent.success_rate,
        is_available=agent.is_available(),
    )


@router.get("", response_model=list[AgentResponse])
async def list_agents(
    category: str | None = None,
    available_only: bool = False,
):
    """
    모든 에이전트 목록 조회.

    Args:
        category: 카테고리 필터 (development, orchestration, quality, research)
        available_only: 사용 가능한 에이전트만 반환
    """
    registry = get_agent_registry()

    if category:
        try:
            cat = AgentCategory(category)
            agents = registry.get_by_category(cat)
        except ValueError:
            raise HTTPException(
                status_code=400,
                detail=f"Invalid category: {category}. Valid: {[c.value for c in AgentCategory]}"
            )
    elif available_only:
        agents = registry.get_available()
    else:
        agents = registry.get_all()

    return [_agent_to_response(a) for a in agents]


@router.get("/stats", response_model=AgentRegistryStatsResponse)
async def get_registry_stats():
    """에이전트 레지스트리 통계 조회."""
    registry = get_agent_registry()
    stats = registry.get_stats()
    return AgentRegistryStatsResponse(**stats)


@router.get("/{agent_id}", response_model=AgentResponse)
async def get_agent(agent_id: str):
    """특정 에이전트 조회."""
    registry = get_agent_registry()
    agent = registry.get(agent_id)

    if not agent:
        raise HTTPException(status_code=404, detail=f"Agent not found: {agent_id}")

    return _agent_to_response(agent)


@router.post("/search", response_model=list[AgentSearchResult])
async def search_agents(request: AgentSearchRequest):
    """
    능력 기반 에이전트 검색.

    태스크 설명을 기반으로 가장 적합한 에이전트를 찾습니다.
    """
    registry = get_agent_registry()

    category = None
    if request.category:
        try:
            category = AgentCategory(request.category)
        except ValueError:
            raise HTTPException(
                status_code=400,
                detail=f"Invalid category: {request.category}"
            )

    results = registry.find_by_capability(
        query=request.query,
        category=category,
        limit=request.limit,
    )

    return [
        AgentSearchResult(
            agent=_agent_to_response(agent),
            score=score,
        )
        for agent, score in results
    ]


@router.post("/{agent_id}/status")
async def update_agent_status(agent_id: str, status: str):
    """에이전트 상태 업데이트."""
    registry = get_agent_registry()

    try:
        new_status = AgentStatus(status)
    except ValueError:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid status: {status}. Valid: {[s.value for s in AgentStatus]}"
        )

    if not registry.update_status(agent_id, new_status):
        raise HTTPException(status_code=404, detail=f"Agent not found: {agent_id}")

    return {"message": f"Agent {agent_id} status updated to {status}"}


# ─────────────────────────────────────────────────────────────
# Lead Orchestrator API
# ─────────────────────────────────────────────────────────────


@router.post("/orchestrate/analyze", response_model=TaskAnalysisResponse)
async def analyze_task(request: TaskAnalysisRequest):
    """
    태스크 분석 및 실행 계획 생성.

    Lead Orchestrator가 태스크를 분석하고:
    1. 복잡도 평가
    2. 서브태스크 분해
    3. 에이전트 할당
    4. 실행 전략 결정
    """
    orchestrator = get_lead_orchestrator()

    try:
        result = await orchestrator.execute(
            task=request.task,
            context=request.context,
        )

        if result.success:
            return TaskAnalysisResponse(
                success=True,
                analysis=result.output,
                execution_time_ms=result.execution_time_ms,
            )
        else:
            return TaskAnalysisResponse(
                success=False,
                error=result.error,
                execution_time_ms=result.execution_time_ms,
            )
    except Exception as e:
        return TaskAnalysisResponse(
            success=False,
            error=str(e),
        )


@router.get("/orchestrate/strategies")
async def get_execution_strategies():
    """사용 가능한 실행 전략 목록."""
    return {
        "strategies": [
            {
                "value": s.value,
                "description": {
                    "sequential": "순차 실행 - 태스크를 하나씩 순서대로 실행",
                    "parallel": "병렬 실행 - 독립적인 태스크를 동시에 실행",
                    "mixed": "혼합 실행 - 일부 병렬, 일부 순차",
                }[s.value]
            }
            for s in ExecutionStrategy
        ],
        "effort_levels": [
            {
                "value": e.value,
                "description": {
                    "quick": "빠른 작업 (< 5분)",
                    "medium": "중간 복잡도 (5-30분)",
                    "thorough": "복잡한 작업 (30분+)",
                }[e.value]
            }
            for e in EffortLevel
        ],
    }


# ─────────────────────────────────────────────────────────────
# MCP Manager API
# ─────────────────────────────────────────────────────────────


def _server_to_response(info) -> MCPServerResponse:
    """MCPServerInfo를 MCPServerResponse로 변환."""
    return MCPServerResponse(
        id=info.config.id,
        name=info.config.name,
        type=info.config.type.value,
        description=info.config.description,
        status=info.status.value,
        tool_count=len(info.tools),
        tools=[
            MCPToolSchemaResponse(
                name=tool.name,
                description=tool.description,
                input_schema=tool.input_schema,
            )
            for tool in info.tools
        ],
        pid=info.pid,
        started_at=info.started_at.isoformat() if info.started_at else None,
        last_error=info.last_error,
    )


@router.get("/mcp/servers", response_model=list[MCPServerResponse])
async def list_mcp_servers(running_only: bool = False):
    """
    MCP 서버 목록 조회.

    Args:
        running_only: 실행 중인 서버만 반환
    """
    from services.mcp_manager import get_mcp_manager

    manager = await get_mcp_manager()

    if running_only:
        servers = manager.get_running_servers()
    else:
        servers = manager.get_all_servers()

    return [_server_to_response(s) for s in servers]


@router.get("/mcp/servers/{server_id}", response_model=MCPServerResponse)
async def get_mcp_server(server_id: str):
    """특정 MCP 서버 정보 조회."""
    from services.mcp_manager import get_mcp_manager

    manager = await get_mcp_manager()
    info = manager.get_server(server_id)

    if not info:
        raise HTTPException(status_code=404, detail=f"MCP server not found: {server_id}")

    return _server_to_response(info)


@router.post("/mcp/servers/{server_id}/start")
async def start_mcp_server(server_id: str):
    """MCP 서버 시작."""
    from services.mcp_manager import get_mcp_manager

    manager = await get_mcp_manager()
    success = await manager.start_server(server_id)

    if not success:
        info = manager.get_server(server_id)
        error = info.last_error if info else "Server not found"
        raise HTTPException(status_code=500, detail=f"Failed to start server: {error}")

    return {"message": f"MCP server {server_id} started", "success": True}


@router.post("/mcp/servers/{server_id}/stop")
async def stop_mcp_server(server_id: str):
    """MCP 서버 중지."""
    from services.mcp_manager import get_mcp_manager

    manager = await get_mcp_manager()
    success = await manager.stop_server(server_id)

    if not success:
        raise HTTPException(status_code=404, detail=f"MCP server not found: {server_id}")

    return {"message": f"MCP server {server_id} stopped", "success": True}


@router.post("/mcp/servers/{server_id}/restart")
async def restart_mcp_server(server_id: str):
    """MCP 서버 재시작."""
    from services.mcp_manager import get_mcp_manager

    manager = await get_mcp_manager()
    success = await manager.restart_server(server_id)

    if not success:
        raise HTTPException(status_code=500, detail=f"Failed to restart server: {server_id}")

    return {"message": f"MCP server {server_id} restarted", "success": True}


@router.get("/mcp/servers/{server_id}/tools")
async def get_mcp_server_tools(server_id: str):
    """MCP 서버의 도구 목록 조회."""
    from services.mcp_manager import get_mcp_manager

    manager = await get_mcp_manager()
    info = manager.get_server(server_id)

    if not info:
        raise HTTPException(status_code=404, detail=f"MCP server not found: {server_id}")

    return {
        "server_id": server_id,
        "tools": [
            {
                "name": tool.name,
                "description": tool.description,
                "input_schema": tool.input_schema,
            }
            for tool in info.tools
        ],
    }


@router.post("/mcp/tools/call", response_model=MCPToolCallResponse)
async def call_mcp_tool(request: MCPToolCallRequest):
    """
    MCP 도구 호출.

    특정 MCP 서버의 도구를 실행합니다.
    """
    from services.mcp_manager import get_mcp_manager

    manager = await get_mcp_manager()

    call = MCPToolCall(
        server_id=request.server_id,
        tool_name=request.tool_name,
        arguments=request.arguments,
        timeout_ms=request.timeout_ms,
    )

    result = await manager.call_tool(call)

    return MCPToolCallResponse(
        success=result.success,
        content=result.content,
        error=result.error,
        execution_time_ms=result.execution_time_ms,
    )


@router.post("/mcp/tools/batch-call", response_model=MCPBatchToolCallResponse)
async def batch_call_mcp_tools(request: MCPBatchToolCallRequest):
    """
    MCP 다중 도구 병렬 호출.

    여러 도구를 동시에 실행하고 모든 결과를 반환합니다.
    max_concurrent로 동시 실행 수를 제한할 수 있습니다.
    """
    from services.mcp_manager import get_mcp_manager

    manager = await get_mcp_manager()

    # Request를 내부 모델로 변환
    batch_call = MCPBatchToolCall(
        calls=[
            MCPToolCall(
                server_id=call.server_id,
                tool_name=call.tool_name,
                arguments=call.arguments,
                timeout_ms=call.timeout_ms,
            )
            for call in request.calls
        ],
        max_concurrent=request.max_concurrent,
    )

    result = await manager.call_tools_batch(batch_call)

    return MCPBatchToolCallResponse(
        results=[
            MCPToolCallResponse(
                success=r.success,
                content=r.content,
                error=r.error,
                execution_time_ms=r.execution_time_ms,
            )
            for r in result.results
        ],
        total_execution_time_ms=result.total_execution_time_ms,
        success_count=result.success_count,
        failure_count=result.failure_count,
    )


@router.get("/mcp/tools")
async def list_all_mcp_tools():
    """모든 MCP 서버의 도구 목록 조회."""
    from services.mcp_manager import get_mcp_manager

    manager = await get_mcp_manager()
    tools = manager.get_available_tools()

    return {
        "total_tools": sum(len(t) for t in tools.values()),
        "by_server": {
            server_id: [
                {
                    "name": tool.name,
                    "description": tool.description,
                }
                for tool in server_tools
            ]
            for server_id, server_tools in tools.items()
        },
    }


@router.get("/mcp/stats", response_model=MCPManagerStatsResponse)
async def get_mcp_stats():
    """MCP 매니저 통계 조회."""
    from services.mcp_manager import get_mcp_manager

    manager = await get_mcp_manager()
    stats = manager.get_stats()
    return MCPManagerStatsResponse(**stats)
