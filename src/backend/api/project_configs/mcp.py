"""MCP 서버 설정 라우트 (`/{project_id}/mcp`).

프로젝트별 `.mcp.json` 서버 항목의 조회·생성·수정·삭제·복사와 enable/disable/
toggle 을 제공한다. 전부 3세그먼트 이상이라 다른 모듈의 경로를 가리지 않는다.

**주의**: `api/mcp.py`(MCP 런타임 API)와 이름만 같고 무관하다."""

import logging

from fastapi import APIRouter, Depends, HTTPException

from api.deps import get_current_user, get_db_session
from api.project_configs.access import require_project_config_target_access
from models.project_config import (
    CopyMCPRequest,
    MCPServerConfig,
    MCPServerCreateRequest,
    MCPServerUpdateRequest,
    MCPToggleRequest,
)
from services.audit_service import AuditAction, audit_config_change
from services.project_config_monitor import get_project_config_monitor

logger = logging.getLogger(__name__)

router = APIRouter()


@router.get("/{project_id}/mcp", response_model=list[MCPServerConfig])
async def list_project_mcp_servers(project_id: str) -> list[MCPServerConfig]:
    """Get MCP server configuration for a project.

    Args:
        project_id: Project identifier

    Returns:
        List of MCP server configurations
    """
    monitor = get_project_config_monitor()
    servers = monitor.get_project_mcp_config(project_id)

    if not servers:
        # Check if project exists
        summary = monitor.get_project_summary(project_id)
        if summary is None:
            raise HTTPException(status_code=404, detail=f"Project not found: {project_id}")

    return servers


@router.post("/{project_id}/mcp/{server_id}/enable")
async def enable_mcp_server(project_id: str, server_id: str) -> dict:
    """Enable an MCP server in a project.

    Updates the mcp.json file to set disabled: false.

    Args:
        project_id: Project identifier
        server_id: MCP server identifier

    Returns:
        Success status
    """
    monitor = get_project_config_monitor()

    if monitor.enable_mcp_server(project_id, server_id):
        return {
            "success": True,
            "message": f"Enabled MCP server: {server_id}",
            "project_id": project_id,
            "server_id": server_id,
            "disabled": False,
        }
    else:
        raise HTTPException(
            status_code=400,
            detail=f"Failed to enable MCP server: {server_id}. Check if project and server exist.",
        )


@router.post("/{project_id}/mcp/{server_id}/disable")
async def disable_mcp_server(project_id: str, server_id: str) -> dict:
    """Disable an MCP server in a project.

    Updates the mcp.json file to set disabled: true.

    Args:
        project_id: Project identifier
        server_id: MCP server identifier

    Returns:
        Success status
    """
    monitor = get_project_config_monitor()

    if monitor.disable_mcp_server(project_id, server_id):
        return {
            "success": True,
            "message": f"Disabled MCP server: {server_id}",
            "project_id": project_id,
            "server_id": server_id,
            "disabled": True,
        }
    else:
        raise HTTPException(
            status_code=400,
            detail=f"Failed to disable MCP server: {server_id}. Check if project and server exist.",
        )


@router.post("/{project_id}/mcp/{server_id}/toggle")
async def toggle_mcp_server(project_id: str, server_id: str, request: MCPToggleRequest) -> dict:
    """Toggle MCP server enabled/disabled state.

    Args:
        project_id: Project identifier
        server_id: MCP server identifier
        request: Toggle request with enabled state

    Returns:
        Success status with new state
    """
    monitor = get_project_config_monitor()

    if request.enabled:
        success = monitor.enable_mcp_server(project_id, server_id)
    else:
        success = monitor.disable_mcp_server(project_id, server_id)

    if success:
        return {
            "success": True,
            "message": f"{'Enabled' if request.enabled else 'Disabled'} MCP server: {server_id}",
            "project_id": project_id,
            "server_id": server_id,
            "disabled": not request.enabled,
        }
    else:
        raise HTTPException(
            status_code=400,
            detail=f"Failed to toggle MCP server: {server_id}",
        )


@router.put("/{project_id}/mcp/{server_id}", response_model=MCPServerConfig)
async def update_mcp_server(
    project_id: str, server_id: str, request: MCPServerUpdateRequest
) -> MCPServerConfig:
    """Update an MCP server configuration.

    Args:
        project_id: Project identifier
        server_id: MCP server identifier
        request: Update request with new values

    Returns:
        Updated MCP server configuration
    """
    monitor = get_project_config_monitor()

    result = monitor.update_mcp_server(
        project_id=project_id,
        server_id=server_id,
        command=request.command,
        args=request.args,
        env=request.env,
        disabled=request.disabled,
        note=request.note,
    )

    if result is None:
        raise HTTPException(
            status_code=400,
            detail=f"Failed to update MCP server: {server_id}. Check if project and server exist.",
        )

    audit_config_change(AuditAction.CONFIG_UPDATED, "mcp_server", server_id, project_id)
    return result


@router.post("/{project_id}/mcp", response_model=MCPServerConfig)
async def create_mcp_server(project_id: str, request: MCPServerCreateRequest) -> MCPServerConfig:
    """Create a new MCP server configuration.

    Args:
        project_id: Project identifier
        request: Create request with server details

    Returns:
        Created MCP server configuration
    """
    monitor = get_project_config_monitor()

    result = monitor.create_mcp_server(
        project_id=project_id,
        server_id=request.server_id,
        command=request.command,
        args=request.args,
        env=request.env,
        disabled=request.disabled,
        note=request.note,
    )

    if result is None:
        raise HTTPException(
            status_code=400,
            detail=f"Failed to create MCP server: {request.server_id}. "
            "Check if project exists and server ID is unique.",
        )

    audit_config_change(AuditAction.CONFIG_CREATED, "mcp_server", request.server_id, project_id)
    return result


@router.delete("/{project_id}/mcp/{server_id}")
async def delete_mcp_server(project_id: str, server_id: str) -> dict:
    """Delete an MCP server configuration.

    Args:
        project_id: Project identifier
        server_id: MCP server identifier

    Returns:
        Success status
    """
    monitor = get_project_config_monitor()

    if monitor.delete_mcp_server(project_id, server_id):
        audit_config_change(AuditAction.CONFIG_DELETED, "mcp_server", server_id, project_id)
        return {
            "success": True,
            "message": f"Deleted MCP server: {server_id}",
            "project_id": project_id,
            "server_id": server_id,
        }
    else:
        raise HTTPException(
            status_code=400,
            detail=f"Failed to delete MCP server: {server_id}. Check if project and server exist.",
        )


@router.post("/{project_id}/mcp/{server_id}/copy")
async def copy_mcp_server(
    project_id: str,
    server_id: str,
    request: CopyMCPRequest,
    current_user=Depends(get_current_user),
    db=Depends(get_db_session),
) -> dict:
    """Copy an MCP server to another project.

    Args:
        project_id: Source project identifier
        server_id: MCP server identifier to copy
        request: Copy request with target project

    Returns:
        Success status
    """
    await require_project_config_target_access(request.target_project_id, current_user, db)
    monitor = get_project_config_monitor()

    result = monitor.copy_mcp_server(project_id, server_id, request.target_project_id)

    if result:
        return {
            "success": True,
            "message": f"Copied MCP server '{server_id}' to project '{request.target_project_id}'",
            "source_project_id": project_id,
            "target_project_id": request.target_project_id,
            "server_id": server_id,
        }
    else:
        raise HTTPException(
            status_code=400,
            detail=f"Failed to copy MCP server '{server_id}'. Check if source and target projects exist.",
        )
