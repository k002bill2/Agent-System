"""Project configuration monitoring API.

Provides endpoints to monitor and control Claude Code project configurations
(skills, agents, MCP servers) across multiple projects.
"""

import asyncio
import json
import logging
import os
from typing import AsyncGenerator

from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse

from models.project_config import (
    AgentConfig,
    AgentContentResponse,
    AgentCreateRequest,
    AgentUpdateRequest,
    ConfigChangeEvent,
    ExternalPathRequest,
    HookEntryRequest,
    HooksUpdateRequest,
    MCPServerConfig,
    MCPServerCreateRequest,
    MCPServerUpdateRequest,
    MCPToggleRequest,
    ProjectConfigResponse,
    ProjectConfigSummary,
    ProjectInfo,
    SkillConfig,
    SkillContentResponse,
    SkillCreateRequest,
    SkillUpdateRequest,
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

    The path does not need to contain a .claude/ directory.
    Projects without .claude/ will show empty configuration.

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
            detail=f"Invalid path or already added: {request.path}. Path must exist and be a directory.",
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


@router.delete("/{project_id}/remove")
async def remove_project_from_monitoring(project_id: str) -> dict:
    """Remove any project from monitoring (auto-discovered or external).

    This removes the project from the monitoring list but does NOT delete
    any source files.

    Args:
        project_id: Project identifier (encoded path)

    Returns:
        Success status
    """
    monitor = get_project_config_monitor()

    # Get the project info first
    summary = monitor.get_project_summary(project_id)
    if summary is None:
        raise HTTPException(status_code=404, detail=f"Project not found: {project_id}")

    path = summary.project.project_path

    if monitor.remove_project(path):
        return {
            "success": True,
            "message": f"Removed project from monitoring: {path}",
            "project_id": project_id,
        }
    else:
        raise HTTPException(
            status_code=400,
            detail=f"Failed to remove project: {project_id}",
        )


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


# ========================================
# Project Summary
# ========================================


@router.get("/by-path")
async def get_project_by_path(path: str) -> ProjectConfigSummary:
    """Get project configuration by filesystem path.

    Resolves symlinks to find the actual project path.
    Returns empty configuration if .claude/ directory doesn't exist.

    Args:
        path: Filesystem path to project (can be symlink)

    Returns:
        Complete project configuration summary
    """
    from pathlib import Path as PathLib

    monitor = get_project_config_monitor()
    is_docker = bool(os.getenv("CLAUDE_HOME"))

    # In Docker, host paths aren't accessible - don't resolve or validate
    if is_docker:
        resolved_path = PathLib(path)
    else:
        try:
            resolved_path = PathLib(path).resolve()
        except (OSError, RuntimeError) as e:
            raise HTTPException(status_code=400, detail=f"Invalid path: {e}")

        if not resolved_path.exists():
            raise HTTPException(status_code=404, detail=f"Path does not exist: {resolved_path}")

    # Generate project_id from path
    project_id = str(resolved_path).replace("/", "-").replace("\\", "-")

    # Try to get summary
    summary = monitor.get_project_summary(project_id)

    if summary is None:
        # Project not in monitor's list, try to add it
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


@router.post("/{project_id}/skills", response_model=SkillConfig)
async def create_skill(project_id: str, request: SkillCreateRequest) -> SkillConfig:
    """Create a new skill.

    Args:
        project_id: Project identifier
        request: Skill create request

    Returns:
        Created skill configuration
    """
    monitor = get_project_config_monitor()
    result = monitor.create_skill(project_id, request.skill_id, request.content)

    if result is None:
        raise HTTPException(
            status_code=400,
            detail=f"Failed to create skill: {request.skill_id}. Check if project exists and skill ID is unique.",
        )

    return result


@router.put("/{project_id}/skills/{skill_id}")
async def update_skill(project_id: str, skill_id: str, request: SkillUpdateRequest) -> dict:
    """Update skill content.

    Args:
        project_id: Project identifier
        skill_id: Skill identifier
        request: Update request with new content

    Returns:
        Success status
    """
    monitor = get_project_config_monitor()

    if monitor.update_skill_content(project_id, skill_id, request.content):
        return {
            "success": True,
            "message": f"Updated skill: {skill_id}",
            "project_id": project_id,
            "skill_id": skill_id,
        }
    else:
        raise HTTPException(
            status_code=400,
            detail=f"Failed to update skill: {skill_id}. Check if project and skill exist.",
        )


@router.delete("/{project_id}/skills/{skill_id}")
async def delete_skill(project_id: str, skill_id: str) -> dict:
    """Delete a skill.

    Args:
        project_id: Project identifier
        skill_id: Skill identifier

    Returns:
        Success status
    """
    monitor = get_project_config_monitor()

    if monitor.delete_skill(project_id, skill_id):
        return {
            "success": True,
            "message": f"Deleted skill: {skill_id}",
            "project_id": project_id,
            "skill_id": skill_id,
        }
    else:
        raise HTTPException(
            status_code=400,
            detail=f"Failed to delete skill: {skill_id}. Check if project and skill exist.",
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


@router.get("/{project_id}/agents/{agent_id}/content", response_model=AgentContentResponse)
async def get_agent_content(project_id: str, agent_id: str) -> AgentContentResponse:
    """Get full content of an agent.

    Args:
        project_id: Project identifier
        agent_id: Agent identifier

    Returns:
        Agent configuration with full content
    """
    monitor = get_project_config_monitor()
    agent, content = monitor.get_agent_content(project_id, agent_id)

    if agent is None:
        raise HTTPException(
            status_code=404,
            detail=f"Agent not found: {agent_id} in project {project_id}",
        )

    return AgentContentResponse(agent=agent, content=content)


@router.post("/{project_id}/agents", response_model=AgentConfig)
async def create_agent(project_id: str, request: AgentCreateRequest) -> AgentConfig:
    """Create a new agent.

    Args:
        project_id: Project identifier
        request: Agent create request

    Returns:
        Created agent configuration
    """
    monitor = get_project_config_monitor()
    result = monitor.create_agent(
        project_id, request.agent_id, request.content, request.is_shared
    )

    if result is None:
        raise HTTPException(
            status_code=400,
            detail=f"Failed to create agent: {request.agent_id}. Check if project exists and agent ID is unique.",
        )

    return result


@router.put("/{project_id}/agents/{agent_id}")
async def update_agent(project_id: str, agent_id: str, request: AgentUpdateRequest) -> dict:
    """Update agent content.

    Args:
        project_id: Project identifier
        agent_id: Agent identifier
        request: Update request with new content

    Returns:
        Success status
    """
    monitor = get_project_config_monitor()

    if monitor.update_agent_content(project_id, agent_id, request.content):
        return {
            "success": True,
            "message": f"Updated agent: {agent_id}",
            "project_id": project_id,
            "agent_id": agent_id,
        }
    else:
        raise HTTPException(
            status_code=400,
            detail=f"Failed to update agent: {agent_id}. Check if project and agent exist.",
        )


@router.delete("/{project_id}/agents/{agent_id}")
async def delete_agent(project_id: str, agent_id: str) -> dict:
    """Delete an agent.

    Args:
        project_id: Project identifier
        agent_id: Agent identifier

    Returns:
        Success status
    """
    monitor = get_project_config_monitor()

    if monitor.delete_agent(project_id, agent_id):
        return {
            "success": True,
            "message": f"Deleted agent: {agent_id}",
            "project_id": project_id,
            "agent_id": agent_id,
        }
    else:
        raise HTTPException(
            status_code=400,
            detail=f"Failed to delete agent: {agent_id}. Check if project and agent exist.",
        )


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

    return result


@router.post("/{project_id}/mcp", response_model=MCPServerConfig)
async def create_mcp_server(
    project_id: str, request: MCPServerCreateRequest
) -> MCPServerConfig:
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


@router.put("/{project_id}/hooks")
async def update_hooks(project_id: str, request: HooksUpdateRequest) -> dict:
    """Update entire hooks.json content.

    Args:
        project_id: Project identifier
        request: Complete hooks configuration

    Returns:
        Success status
    """
    monitor = get_project_config_monitor()

    if monitor.update_hooks(project_id, {"hooks": request.hooks}):
        return {
            "success": True,
            "message": "Updated hooks configuration",
            "project_id": project_id,
        }
    else:
        raise HTTPException(
            status_code=400,
            detail="Failed to update hooks. Check if project exists.",
        )


@router.post("/{project_id}/hooks/events/{event}")
async def add_hook_entry(project_id: str, event: str, request: HookEntryRequest) -> dict:
    """Add a hook entry to an event.

    Args:
        project_id: Project identifier
        event: Event name (PreToolUse, PostToolUse, etc.)
        request: Hook entry request

    Returns:
        Success status
    """
    monitor = get_project_config_monitor()

    if monitor.add_hook_entry(project_id, event, request.matcher, request.hooks):
        return {
            "success": True,
            "message": f"Added hook entry for event: {event}",
            "project_id": project_id,
            "event": event,
        }
    else:
        raise HTTPException(
            status_code=400,
            detail=f"Failed to add hook entry for event: {event}",
        )


@router.delete("/{project_id}/hooks/{event}/{index}")
async def delete_hook(project_id: str, event: str, index: int) -> dict:
    """Delete a hook entry by event and index.

    Args:
        project_id: Project identifier
        event: Event name
        index: Index of hook entry within the event

    Returns:
        Success status
    """
    monitor = get_project_config_monitor()

    if monitor.delete_hook(project_id, event, index):
        return {
            "success": True,
            "message": f"Deleted hook {event}[{index}]",
            "project_id": project_id,
            "event": event,
            "index": index,
        }
    else:
        raise HTTPException(
            status_code=400,
            detail=f"Failed to delete hook {event}[{index}]. Check if project and hook exist.",
        )
