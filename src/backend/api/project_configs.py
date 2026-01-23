"""Project configuration monitoring API.

Provides endpoints to monitor and control Claude Code project configurations
(skills, agents, MCP servers) across multiple projects.
"""

import asyncio
import json
import logging
from typing import AsyncGenerator

from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse

from models.project_config import (
    AgentConfig,
    ConfigChangeEvent,
    ExternalPathRequest,
    MCPServerConfig,
    MCPToggleRequest,
    ProjectConfigResponse,
    ProjectConfigSummary,
    ProjectInfo,
    SkillConfig,
    SkillContentResponse,
)
from services.project_config_monitor import get_project_config_monitor

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/project-configs", tags=["project-configs"])


# ========================================
# Project Discovery
# ========================================


@router.get("", response_model=ProjectConfigResponse)
async def list_projects() -> ProjectConfigResponse:
    """List all discovered projects with Claude Code configuration.

    Returns:
        List of projects with summary counts
    """
    monitor = get_project_config_monitor()
    projects = monitor.discover_projects()

    total_skills = sum(p.skill_count for p in projects)
    total_agents = sum(p.agent_count for p in projects)
    total_mcp_servers = sum(p.mcp_server_count for p in projects)

    return ProjectConfigResponse(
        projects=projects,
        total_count=len(projects),
        total_skills=total_skills,
        total_agents=total_agents,
        total_mcp_servers=total_mcp_servers,
    )


@router.get("/paths")
async def list_monitored_paths() -> dict:
    """List all monitored project paths.

    Returns:
        All paths being monitored and external paths
    """
    monitor = get_project_config_monitor()

    return {
        "monitored_paths": monitor.get_monitored_paths(),
        "external_paths": monitor.get_external_paths(),
    }


@router.post("/external-paths")
async def add_external_path(request: ExternalPathRequest) -> dict:
    """Add an external project path at runtime.

    The path must contain a .claude/ directory.

    Args:
        request: Path to add

    Returns:
        Success status and updated paths
    """
    monitor = get_project_config_monitor()

    if monitor.add_external_project(request.path):
        return {
            "success": True,
            "message": f"Added external path: {request.path}",
            "monitored_paths": monitor.get_monitored_paths(),
        }
    else:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid path or already added: {request.path}. Path must have .claude/ directory.",
        )


@router.delete("/external-paths/{path_encoded}")
async def remove_external_path(path_encoded: str) -> dict:
    """Remove an external project path.

    Note: Path should be URL-encoded (/ -> %2F)

    Args:
        path_encoded: URL-encoded path to remove

    Returns:
        Success status and updated paths
    """
    import urllib.parse

    monitor = get_project_config_monitor()
    path = urllib.parse.unquote(path_encoded)

    if monitor.remove_external_project(path):
        return {
            "success": True,
            "message": f"Removed external path: {path}",
            "monitored_paths": monitor.get_monitored_paths(),
        }
    else:
        raise HTTPException(
            status_code=400,
            detail=f"Path not found: {path}",
        )


# ========================================
# Project Summary
# ========================================


@router.get("/by-path")
async def get_project_by_path(path: str) -> ProjectConfigSummary:
    """Get project configuration by filesystem path.

    Resolves symlinks to find the actual project path.

    Args:
        path: Filesystem path to project (can be symlink)

    Returns:
        Complete project configuration summary
    """
    from pathlib import Path as PathLib

    monitor = get_project_config_monitor()

    # Resolve symlinks to get actual path
    try:
        resolved_path = PathLib(path).resolve()
    except (OSError, RuntimeError) as e:
        raise HTTPException(status_code=400, detail=f"Invalid path: {e}")

    # Check if .claude directory exists
    claude_dir = resolved_path / ".claude"
    if not claude_dir.exists():
        raise HTTPException(
            status_code=404,
            detail=f"No .claude directory found at {resolved_path}",
        )

    # Generate project_id from resolved path
    project_id = str(resolved_path).replace("/", "-").replace("\\", "-")

    # Try to get summary
    summary = monitor.get_project_summary(project_id)

    if summary is None:
        # Project not in monitor's list, try to add it temporarily
        monitor.add_external_project(str(resolved_path))
        summary = monitor.get_project_summary(project_id)

    if summary is None:
        raise HTTPException(status_code=404, detail=f"Project not found: {resolved_path}")

    return summary


@router.get("/{project_id}", response_model=ProjectConfigSummary)
async def get_project_summary(project_id: str) -> ProjectConfigSummary:
    """Get full configuration summary for a project.

    Args:
        project_id: Project identifier (encoded path)

    Returns:
        Complete project configuration summary
    """
    monitor = get_project_config_monitor()
    summary = monitor.get_project_summary(project_id)

    if summary is None:
        raise HTTPException(status_code=404, detail=f"Project not found: {project_id}")

    return summary


# ========================================
# Skills
# ========================================


@router.get("/skills/all", response_model=list[SkillConfig])
async def list_all_skills() -> list[SkillConfig]:
    """Get all skills from all monitored projects.

    Returns:
        List of all skills across all projects
    """
    monitor = get_project_config_monitor()
    return monitor.get_all_skills()


@router.get("/{project_id}/skills", response_model=list[SkillConfig])
async def list_project_skills(project_id: str) -> list[SkillConfig]:
    """Get all skills for a specific project.

    Args:
        project_id: Project identifier

    Returns:
        List of skills for the project
    """
    monitor = get_project_config_monitor()
    skills = monitor.get_project_skills(project_id)

    if not skills:
        # Check if project exists
        summary = monitor.get_project_summary(project_id)
        if summary is None:
            raise HTTPException(status_code=404, detail=f"Project not found: {project_id}")

    return skills


@router.get("/{project_id}/skills/{skill_id}/content", response_model=SkillContentResponse)
async def get_skill_content(project_id: str, skill_id: str) -> SkillContentResponse:
    """Get full content of a skill including SKILL.md and references.

    Args:
        project_id: Project identifier
        skill_id: Skill identifier (directory name)

    Returns:
        Skill configuration with full content and reference paths
    """
    monitor = get_project_config_monitor()
    skill, content, references = monitor.get_skill_content(project_id, skill_id)

    if skill is None:
        raise HTTPException(
            status_code=404,
            detail=f"Skill not found: {skill_id} in project {project_id}",
        )

    return SkillContentResponse(
        skill=skill,
        content=content,
        references=references,
    )


# ========================================
# Agents
# ========================================


@router.get("/agents/all", response_model=list[AgentConfig])
async def list_all_agents() -> list[AgentConfig]:
    """Get all agents from all monitored projects.

    Returns:
        List of all agents across all projects
    """
    monitor = get_project_config_monitor()
    return monitor.get_all_agents()


@router.get("/{project_id}/agents", response_model=list[AgentConfig])
async def list_project_agents(project_id: str) -> list[AgentConfig]:
    """Get all agents for a specific project.

    Args:
        project_id: Project identifier

    Returns:
        List of agents for the project
    """
    monitor = get_project_config_monitor()
    agents = monitor.get_project_agents(project_id)

    if not agents:
        # Check if project exists
        summary = monitor.get_project_summary(project_id)
        if summary is None:
            raise HTTPException(status_code=404, detail=f"Project not found: {project_id}")

    return agents


# ========================================
# MCP Servers
# ========================================


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
async def toggle_mcp_server(
    project_id: str, server_id: str, request: MCPToggleRequest
) -> dict:
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


# ========================================
# Hooks
# ========================================


@router.get("/{project_id}/hooks")
async def list_project_hooks(project_id: str) -> dict:
    """Get hooks configuration for a project.

    Args:
        project_id: Project identifier

    Returns:
        List of hook configurations
    """
    monitor = get_project_config_monitor()
    hooks = monitor.get_project_hooks(project_id)

    return {
        "project_id": project_id,
        "hooks": [h.model_dump() for h in hooks],
        "hook_count": len(hooks),
    }


# ========================================
# Real-time Streaming
# ========================================


@router.get("/stream")
async def stream_config_changes():
    """Stream real-time configuration changes via SSE.

    Watches all monitored projects for changes to:
    - mcp.json
    - hooks.json
    - skills/*/SKILL.md
    - agents/*.md

    Returns:
        Server-Sent Events stream with ConfigChangeEvent
    """
    monitor = get_project_config_monitor()

    async def event_generator() -> AsyncGenerator[str, None]:
        """Generate SSE events for config changes."""
        # Send initial connection confirmation
        yield 'event: connected\ndata: {"message": "Connected to config stream"}\n\n'

        # Watch for changes
        async for change in monitor.watch_configs(interval_seconds=2.0):
            event_data = change.model_dump_json()
            yield f"event: config_change\ndata: {event_data}\n\n"

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )
