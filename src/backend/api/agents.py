"""Agent API routes - Agent Registry, Lead Orchestrator, MCP Manager."""

from typing import Any

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from agents.lead_orchestrator import (
    ExecutionStrategy,
    get_lead_orchestrator,
)
from models.task_analysis import (
    TaskAnalysisQueryParams,
    TaskAnalysisSaveRequest,
)
from services.agent_registry import (
    AgentCategory,
    AgentMetadata,
    AgentStatus,
    EffortLevel,
    get_agent_registry,
)
from services.mcp_manager import (
    MCPBatchToolCall,
    MCPToolCall,
)
from services.task_analysis_service import (
    get_task_analysis_service,
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
    analysis_id: str | None = None  # 저장된 분석 ID


class TaskAnalysisHistoryResponse(BaseModel):
    """태스크 분석 히스토리 응답."""

    id: str
    project_id: str | None = None
    task_input: str
    success: bool
    analysis: dict[str, Any] | None = None
    error: str | None = None
    execution_time_ms: int = 0
    complexity_score: int | None = None
    effort_level: str | None = None
    subtask_count: int | None = None
    strategy: str | None = None
    created_at: str


class TaskAnalysisHistoryListResponse(BaseModel):
    """태스크 분석 히스토리 목록 응답."""

    items: list[TaskAnalysisHistoryResponse]
    total: int
    has_more: bool


class ExecuteAnalysisRequest(BaseModel):
    """분석 결과 실행 요청."""

    analysis_id: str = Field(..., description="실행할 분석 ID")
    project_id: str | None = Field(None, description="프로젝트 ID (선택)")


class ExecuteAnalysisResponse(BaseModel):
    """분석 결과 실행 응답."""

    success: bool
    session_id: str | None = None
    error: str | None = None


class ExecuteWithTmuxRequest(BaseModel):
    """tmux + Claude CLI 실행 요청."""

    analysis_id: str = Field(..., description="실행할 분석 ID")
    project_id: str | None = Field(None, description="프로젝트 ID (선택)")


class TmuxSessionResponse(BaseModel):
    """tmux 세션 응답."""

    session_name: str
    analysis_id: str
    active: bool
    output: str = ""
    started_at: str
    task_input: str = ""


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
                detail=f"Invalid category: {category}. Valid: {[c.value for c in AgentCategory]}",
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
            raise HTTPException(status_code=400, detail=f"Invalid category: {request.category}")

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
            detail=f"Invalid status: {status}. Valid: {[s.value for s in AgentStatus]}",
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

    분석 결과는 히스토리에 자동 저장됩니다.
    """
    orchestrator = get_lead_orchestrator()
    analysis_service = get_task_analysis_service()

    try:
        result = await orchestrator.execute(
            task=request.task,
            context=request.context,
        )

        # Extract project_id from context
        project_id = None
        if request.context:
            project_id = request.context.get("project_id")

        # Save analysis to history
        save_request = TaskAnalysisSaveRequest(
            task_input=request.task,
            context=request.context,
            project_id=project_id,
            success=result.success,
            analysis=result.output if result.success else None,
            error=result.error if not result.success else None,
            execution_time_ms=result.execution_time_ms,
        )
        saved_entry = await analysis_service.save_analysis(save_request)

        if result.success:
            return TaskAnalysisResponse(
                success=True,
                analysis=result.output,
                execution_time_ms=result.execution_time_ms,
                analysis_id=saved_entry.id,
            )
        else:
            return TaskAnalysisResponse(
                success=False,
                error=result.error,
                execution_time_ms=result.execution_time_ms,
                analysis_id=saved_entry.id,
            )
    except Exception as e:
        # Save failed analysis too
        try:
            save_request = TaskAnalysisSaveRequest(
                task_input=request.task,
                context=request.context,
                project_id=request.context.get("project_id") if request.context else None,
                success=False,
                error=str(e),
                execution_time_ms=0,
            )
            saved_entry = await analysis_service.save_analysis(save_request)
            return TaskAnalysisResponse(
                success=False,
                error=str(e),
                analysis_id=saved_entry.id,
            )
        except Exception:
            return TaskAnalysisResponse(
                success=False,
                error="Unknown error during task analysis",
            )


@router.get("/orchestrate/analyses", response_model=TaskAnalysisHistoryListResponse)
async def get_analysis_history(
    project_id: str | None = None,
    limit: int = 20,
    offset: int = 0,
):
    """
    태스크 분석 히스토리 조회.

    Args:
        project_id: 프로젝트 ID로 필터링 (선택)
        limit: 조회할 항목 수 (기본: 20, 최대: 100)
        offset: 오프셋 (페이지네이션)
    """
    analysis_service = get_task_analysis_service()

    params = TaskAnalysisQueryParams(
        project_id=project_id,
        limit=min(limit, 100),
        offset=offset,
    )

    result = await analysis_service.get_analyses(params)

    return TaskAnalysisHistoryListResponse(
        items=[
            TaskAnalysisHistoryResponse(
                id=item.id,
                project_id=item.project_id,
                task_input=item.task_input,
                success=item.success,
                analysis=item.analysis,
                error=item.error,
                execution_time_ms=item.execution_time_ms,
                complexity_score=item.complexity_score,
                effort_level=item.effort_level,
                subtask_count=item.subtask_count,
                strategy=item.strategy,
                created_at=item.created_at.isoformat(),
            )
            for item in result.items
        ],
        total=result.total,
        has_more=result.has_more,
    )


@router.get("/orchestrate/analyses/{analysis_id}")
async def get_analysis(analysis_id: str):
    """단일 태스크 분석 조회."""
    analysis_service = get_task_analysis_service()
    entry = await analysis_service.get_analysis(analysis_id)

    if not entry:
        raise HTTPException(status_code=404, detail=f"Analysis not found: {analysis_id}")

    return TaskAnalysisHistoryResponse(
        id=entry.id,
        project_id=entry.project_id,
        task_input=entry.task_input,
        success=entry.success,
        analysis=entry.analysis,
        error=entry.error,
        execution_time_ms=entry.execution_time_ms,
        complexity_score=entry.complexity_score,
        effort_level=entry.effort_level,
        subtask_count=entry.subtask_count,
        strategy=entry.strategy,
        created_at=entry.created_at.isoformat(),
    )


@router.delete("/orchestrate/analyses/{analysis_id}")
async def delete_analysis(analysis_id: str):
    """태스크 분석 삭제."""
    analysis_service = get_task_analysis_service()
    success = await analysis_service.delete_analysis(analysis_id)

    if not success:
        raise HTTPException(status_code=404, detail=f"Analysis not found: {analysis_id}")

    return {"message": f"Analysis {analysis_id} deleted", "success": True}


@router.post("/orchestrate/execute-analysis", response_model=ExecuteAnalysisResponse)
async def execute_analysis(request: ExecuteAnalysisRequest):
    """
    분석 결과를 기반으로 오케스트레이션 실행.

    1. 저장된 분석 결과 조회
    2. OrchestrationEngine 세션 생성
    3. 분석의 execution_plan을 plan_metadata에 주입
    4. 원본 태스크로 engine.stream() 시작
    5. session_id 반환
    """
    from orchestrator.engine import OrchestrationEngine

    analysis_service = get_task_analysis_service()

    # 1. 분석 결과 조회
    entry = await analysis_service.get_analysis(request.analysis_id)
    if not entry:
        raise HTTPException(status_code=404, detail=f"Analysis not found: {request.analysis_id}")

    if not entry.success or not entry.analysis:
        return ExecuteAnalysisResponse(
            success=False,
            error="Cannot execute a failed analysis",
        )

    # 2. 엔진 및 세션 생성
    engine = OrchestrationEngine()

    # 프로젝트 컨텍스트 설정
    project = None
    project_id = request.project_id or entry.project_id
    if project_id:
        from models.project import Project

        # 프로젝트 DB 조회 시도, 없으면 최소한의 정보로 생성
        try:
            from services.project_service import get_project_service

            project_service = get_project_service()
            project = await project_service.get_project(project_id)
        except Exception:
            pass

    session_id = await engine.create_session(
        project=project,
    )

    # 3. 세션 state에 사전 분석 계획 주입
    state = await engine.get_session(session_id)
    if state:
        state["plan_metadata"] = {
            "pre_analyzed_execution_plan": entry.analysis.get("execution_plan", {}),
            "analysis_id": request.analysis_id,
        }
        # 세션 업데이트
        engine._sessions[session_id] = state

    return ExecuteAnalysisResponse(
        success=True,
        session_id=session_id,
    )


# ─────────────────────────────────────────────────────────────
# Tmux + Claude Code CLI Execution API
# ─────────────────────────────────────────────────────────────


@router.get("/orchestrate/claude-auth-status")
async def check_claude_auth_status():
    """Claude CLI 인증 상태 및 크레딧 사전 체크.

    tmux 실행 전에 호출하여 인증/크레딧 문제를 미리 확인.
    """
    from services.tmux_service import get_tmux_service

    tmux = get_tmux_service()

    if not tmux.is_available():
        return {"authenticated": False, "has_credits": False, "error": "tmux_not_installed",
                "message": "tmux가 설치되어 있지 않습니다."}

    auth_status = await tmux.check_claude_auth()
    return auth_status.model_dump()


@router.post("/orchestrate/execute-with-tmux", response_model=TmuxSessionResponse)
async def execute_with_tmux(request: ExecuteWithTmuxRequest):
    """
    분석 결과를 tmux + Claude Code CLI로 실행.

    1. 저장된 분석 결과 조회
    2. 프로젝트 경로 결정
    3. Claude Code 프롬프트 생성
    4. tmux 세션에서 claude -p 실행
    5. session_name 반환
    """
    from services.tmux_service import get_tmux_service

    tmux = get_tmux_service()

    if not tmux.is_available():
        raise HTTPException(status_code=503, detail="tmux is not installed on the server")

    if not tmux.is_claude_available():
        raise HTTPException(status_code=503, detail="Claude CLI is not installed on the server")

    # NOTE: 인증/크레딧 사전 체크를 제거함.
    # 백엔드 프로세스 환경에서 claude를 실행하면 macOS 키체인 접근이 달라
    # 실제로는 정상인데도 인증 실패로 오판할 수 있음.
    # tmux 세션은 사용자의 login shell 환경을 상속하므로 정상 동작하며,
    # 인증/크레딧 문제가 있으면 tmux 출력에서 자연스럽게 확인 가능.

    # 분석 결과 조회
    analysis_service = get_task_analysis_service()
    entry = await analysis_service.get_analysis(request.analysis_id)
    if not entry:
        raise HTTPException(status_code=404, detail=f"Analysis not found: {request.analysis_id}")

    if not entry.success or not entry.analysis:
        raise HTTPException(status_code=400, detail="Cannot execute a failed analysis")

    # 프로젝트 경로 결정
    project_path = "."
    project_id = request.project_id or entry.project_id
    if project_id:
        try:
            from services.project_service import get_project_service
            project_service = get_project_service()
            project = await project_service.get_project(project_id)
            if project and project.path:
                project_path = project.path
        except Exception:
            pass

    # 컨텍스트에서 project_path 추출 시도
    if project_path == "." and entry.context:
        ctx_path = entry.context.get("project_path")
        if ctx_path:
            project_path = ctx_path

    # tmux + Claude CLI 실행
    info = await tmux.execute_analysis(
        analysis_id=request.analysis_id,
        project_path=project_path,
        analysis=entry.analysis,
        task_input=entry.task_input,
    )

    if not info:
        raise HTTPException(status_code=500, detail="Failed to create tmux session")

    return TmuxSessionResponse(
        session_name=info.session_name,
        analysis_id=info.analysis_id,
        active=info.active,
        output="",
        started_at=info.started_at.isoformat(),
        task_input=info.task_input,
    )


@router.get("/orchestrate/tmux-sessions/{session_name}/status", response_model=TmuxSessionResponse)
async def get_tmux_session_status(session_name: str):
    """tmux 세션 상태 + 최근 출력 조회."""
    from services.tmux_service import get_tmux_service

    tmux = get_tmux_service()
    info = tmux.get_session(session_name)

    if not info:
        raise HTTPException(status_code=404, detail=f"Tmux session not found: {session_name}")

    # 출력 캡처
    output = ""
    if info.active:
        captured = tmux.capture_output(session_name)
        if captured is not None:
            output = captured
    else:
        # 세션이 종료된 경우에도 마지막 캡처 시도
        captured = tmux.capture_output(session_name)
        if captured is not None:
            output = captured

    return TmuxSessionResponse(
        session_name=info.session_name,
        analysis_id=info.analysis_id,
        active=info.active,
        output=output,
        started_at=info.started_at.isoformat(),
        task_input=info.task_input,
    )


@router.get("/orchestrate/tmux-sessions/{session_name}/stream")
async def stream_tmux_session(session_name: str):
    """SSE 스트리밍으로 tmux 세션 출력 전달 (2초 폴링)."""
    import asyncio

    from starlette.responses import StreamingResponse

    from services.tmux_service import get_tmux_service

    tmux = get_tmux_service()
    info = tmux.get_session(session_name)

    if not info:
        raise HTTPException(status_code=404, detail=f"Tmux session not found: {session_name}")

    async def event_generator():
        last_output = ""
        inactive_count = 0

        while True:
            current_info = tmux.get_session(session_name)
            if not current_info:
                yield f"data: {{'event': 'session_ended', 'active': false}}\n\n"
                break

            captured = tmux.capture_output(session_name)
            output = captured if captured is not None else ""

            # 새로운 출력이 있으면 전송
            if output != last_output:
                import json
                data = json.dumps({
                    "event": "output",
                    "output": output,
                    "active": current_info.active,
                })
                yield f"data: {data}\n\n"
                last_output = output
                inactive_count = 0
            else:
                inactive_count += 1

            # 세션이 종료되면 마지막 상태 전송 후 종료
            if not current_info.active:
                import json
                data = json.dumps({
                    "event": "session_ended",
                    "output": output,
                    "active": False,
                })
                yield f"data: {data}\n\n"
                break

            # 5분 동안 변화 없으면 종료 (150 * 2초)
            if inactive_count > 150:
                yield f"data: {{'event': 'timeout'}}\n\n"
                break

            await asyncio.sleep(2)

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


@router.post("/orchestrate/tmux-sessions/{session_name}/stop")
async def stop_tmux_session(session_name: str):
    """tmux 세션 강제 종료."""
    from services.tmux_service import get_tmux_service

    tmux = get_tmux_service()
    info = tmux.get_session(session_name)

    if not info:
        raise HTTPException(status_code=404, detail=f"Tmux session not found: {session_name}")

    success = tmux.kill_session(session_name)

    if not success:
        raise HTTPException(status_code=500, detail=f"Failed to kill tmux session: {session_name}")

    return {"message": f"Tmux session {session_name} stopped", "success": True}


@router.get("/orchestrate/tmux-sessions")
async def list_tmux_sessions():
    """모든 AOS tmux 세션 목록."""
    from services.tmux_service import get_tmux_service

    tmux = get_tmux_service()
    sessions = tmux.list_aos_sessions()

    return {
        "sessions": [
            TmuxSessionResponse(
                session_name=s.session_name,
                analysis_id=s.analysis_id,
                active=s.active,
                output="",
                started_at=s.started_at.isoformat(),
                task_input=s.task_input,
            ).model_dump()
            for s in sessions
        ],
        "total": len(sessions),
    }


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
                }[s.value],
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
                }[e.value],
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
