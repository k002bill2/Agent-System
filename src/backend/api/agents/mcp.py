"""mcp 관련 Agents API 라우트.

MCP(Model Context Protocol) 서버 관리와 도구 호출. 응답 모델 7종이 이 모듈
안에서만 쓰이고 서로만 참조하므로(MCPServerResponse.tools →
MCPToolSchemaResponse 등) 라우트와 함께 옮겼다.
"""

from typing import Any

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from api.deps import get_current_user
from db.models import UserModel
from services.mcp_manager import MCPBatchToolCall, MCPToolCall

router = APIRouter()


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
async def list_mcp_servers(
    running_only: bool = False, _user: UserModel = Depends(get_current_user)
):
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
async def get_mcp_server(server_id: str, _user: UserModel = Depends(get_current_user)):
    """특정 MCP 서버 정보 조회."""
    from services.mcp_manager import get_mcp_manager

    manager = await get_mcp_manager()
    info = manager.get_server(server_id)

    if not info:
        raise HTTPException(status_code=404, detail=f"MCP server not found: {server_id}")

    return _server_to_response(info)


@router.post("/mcp/servers/{server_id}/start")
async def start_mcp_server(server_id: str, _user: UserModel = Depends(get_current_user)):
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
async def stop_mcp_server(server_id: str, _user: UserModel = Depends(get_current_user)):
    """MCP 서버 중지."""
    from services.mcp_manager import get_mcp_manager

    manager = await get_mcp_manager()
    success = await manager.stop_server(server_id)

    if not success:
        raise HTTPException(status_code=404, detail=f"MCP server not found: {server_id}")

    return {"message": f"MCP server {server_id} stopped", "success": True}


@router.post("/mcp/servers/{server_id}/restart")
async def restart_mcp_server(server_id: str, _user: UserModel = Depends(get_current_user)):
    """MCP 서버 재시작."""
    from services.mcp_manager import get_mcp_manager

    manager = await get_mcp_manager()
    success = await manager.restart_server(server_id)

    if not success:
        raise HTTPException(status_code=500, detail=f"Failed to restart server: {server_id}")

    return {"message": f"MCP server {server_id} restarted", "success": True}


@router.get("/mcp/servers/{server_id}/tools")
async def get_mcp_server_tools(server_id: str, _user: UserModel = Depends(get_current_user)):
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
async def call_mcp_tool(request: MCPToolCallRequest, _user: UserModel = Depends(get_current_user)):
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
async def batch_call_mcp_tools(
    request: MCPBatchToolCallRequest, _user: UserModel = Depends(get_current_user)
):
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
async def list_all_mcp_tools(_user: UserModel = Depends(get_current_user)):
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
async def get_mcp_stats(_user: UserModel = Depends(get_current_user)):
    """MCP 매니저 통계 조회."""
    from services.mcp_manager import get_mcp_manager

    manager = await get_mcp_manager()
    stats = manager.get_stats()
    return MCPManagerStatsResponse(**stats)
