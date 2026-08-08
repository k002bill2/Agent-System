"""Project configuration monitoring API.

Provides endpoints to monitor and control Claude Code project configurations
(skills, agents, MCP servers) across multiple projects.
"""

import logging
import os
from collections.abc import AsyncGenerator

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse

from api.deps import get_current_user_optional
from models.project_config import (
    ExternalPathRequest,
    GlobalConfigSummary,
    ProjectConfigResponse,
    ProjectConfigSummary,
    RuleConfig,
    RuleContentResponse,
    RuleCreateRequest,
    RuleUpdateRequest,
)
from services.audit_service import AuditAction, audit_config_change
from services.project_config_monitor import get_project_config_monitor

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/project-configs", tags=["project-configs"])


# ========================================
# Project Discovery
# ========================================


@router.get("", response_model=ProjectConfigResponse)
async def list_projects(
    current_user=Depends(get_current_user_optional),
) -> ProjectConfigResponse:
    """List projects with Claude Code configuration (접근 제어 적용).

    접근 규칙:
        - 시스템 admin: 모든 활성 프로젝트
        - 조직 admin/owner: 자신의 조직 프로젝트 + 명시적 ProjectAccess
        - 일반 member: 명시적 ProjectAccess만
    """
    monitor = get_project_config_monitor()

    use_database = os.getenv("USE_DATABASE", "false").lower() == "true"

    if use_database:
        try:
            projects = await _get_db_filtered_projects(monitor, current_user)
        except Exception as e:
            logger.warning(f"DB project filter failed, falling back to discovery: {e}")
            projects = monitor.discover_projects()
    else:
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


@router.get("/global", response_model=GlobalConfigSummary)
async def get_global_configs(
    current_user=Depends(get_current_user_optional),
) -> GlobalConfigSummary:
    """Get global configurations from ~/.claude/ directory.

    Returns global agents, skills, and hooks that apply across all projects.
    """
    monitor = get_project_config_monitor()
    return monitor.get_global_configs()


# ========================================
# Global Rules
# ========================================


@router.get("/global/rules", response_model=list[RuleConfig])
async def list_global_rules() -> list[RuleConfig]:
    """Get all global rules from ~/.claude/rules/.

    Returns:
        List of global rule configurations
    """
    monitor = get_project_config_monitor()
    return monitor.get_global_rules()


@router.get("/global/rules/{rule_id}/content", response_model=RuleContentResponse)
async def get_global_rule_content(rule_id: str) -> RuleContentResponse:
    """Get full content of a global rule.

    Args:
        rule_id: Rule identifier

    Returns:
        Rule configuration with full content
    """
    monitor = get_project_config_monitor()
    rule, content = monitor.get_rule_content("global", rule_id, is_global=True)

    if rule is None:
        raise HTTPException(
            status_code=404,
            detail=f"Global rule not found: {rule_id}",
        )

    return RuleContentResponse(rule=rule, content=content)


@router.post("/global/rules", response_model=RuleConfig)
async def create_global_rule(request: RuleCreateRequest) -> RuleConfig:
    """Create a new global rule.

    Args:
        request: Rule create request

    Returns:
        Created rule configuration
    """
    monitor = get_project_config_monitor()
    result = monitor.create_rule("global", request.rule_id, request.content, is_global=True)

    if result is None:
        raise HTTPException(
            status_code=400,
            detail=f"Failed to create global rule: {request.rule_id}. Check if rule ID is unique.",
        )

    audit_config_change(AuditAction.CONFIG_CREATED, "rules", request.rule_id, "global")
    return result


@router.put("/global/rules/{rule_id}")
async def update_global_rule(rule_id: str, request: RuleUpdateRequest) -> dict:
    """Update global rule content.

    Args:
        rule_id: Rule identifier
        request: Update request with new content

    Returns:
        Success status
    """
    monitor = get_project_config_monitor()

    if monitor.update_rule_content("global", rule_id, request.content, is_global=True):
        audit_config_change(AuditAction.CONFIG_UPDATED, "rules", rule_id, "global")
        return {
            "success": True,
            "message": f"Updated global rule: {rule_id}",
            "rule_id": rule_id,
        }
    else:
        raise HTTPException(
            status_code=400,
            detail=f"Failed to update global rule: {rule_id}. Check if rule exists.",
        )


@router.delete("/global/rules/{rule_id}")
async def delete_global_rule(rule_id: str) -> dict:
    """Delete a global rule.

    Args:
        rule_id: Rule identifier

    Returns:
        Success status
    """
    monitor = get_project_config_monitor()

    if monitor.delete_rule("global", rule_id, is_global=True):
        audit_config_change(AuditAction.CONFIG_DELETED, "rules", rule_id, "global")
        return {
            "success": True,
            "message": f"Deleted global rule: {rule_id}",
            "rule_id": rule_id,
        }
    else:
        raise HTTPException(
            status_code=400,
            detail=f"Failed to delete global rule: {rule_id}. Check if rule exists.",
        )


async def _get_db_filtered_projects(monitor, current_user=None) -> list:
    """Get projects filtered by DB registration + 접근 제어.

    For each DB project with a path, scan its config.
    For DB projects without a path, include basic info from discovered projects
    matched by name.
    """
    from pathlib import Path as PathLib

    from sqlalchemy import or_, select

    from db.database import async_session_factory
    from db.models import ProjectAccessModel, ProjectModel
    from models.project_config import ProjectInfo
    from utils.time import utcnow

    async with async_session_factory() as session:
        is_admin = False
        if current_user:
            is_admin = current_user.role == "admin" or current_user.is_admin

        if is_admin or not current_user:
            # 시스템 admin 또는 미인증: 전체 활성 프로젝트
            result = await session.execute(
                select(ProjectModel)
                .where(ProjectModel.is_active == True)  # noqa: E712
                .order_by(ProjectModel.name)
            )
        else:
            from api.projects import _get_admin_org_ids

            admin_org_ids = await _get_admin_org_ids(current_user)

            member_subq = (
                select(ProjectAccessModel.project_id)
                .where(ProjectAccessModel.user_id == current_user.id)
                .scalar_subquery()
            )

            if admin_org_ids:
                result = await session.execute(
                    select(ProjectModel)
                    .where(
                        ProjectModel.is_active == True,  # noqa: E712
                        or_(
                            ProjectModel.organization_id.in_(admin_org_ids),
                            ProjectModel.id.in_(member_subq),
                        ),
                    )
                    .order_by(ProjectModel.name)
                )
            else:
                result = await session.execute(
                    select(ProjectModel)
                    .where(
                        ProjectModel.is_active == True,  # noqa: E712
                        ProjectModel.id.in_(member_subq),
                    )
                    .order_by(ProjectModel.name)
                )

        db_projects = result.scalars().all()

    if not db_projects:
        return []

    # Build set of DB project names for matching
    db_project_names = {p.name for p in db_projects}
    db_project_paths = {p.path for p in db_projects if p.path}

    # Get all discovered projects from filesystem
    all_discovered = monitor.discover_projects()

    # Filter: only keep projects whose name or path matches a DB project
    # Use seen_paths to prevent duplicates when DB name != filesystem name
    filtered = []
    seen_paths = set()
    for discovered in all_discovered:
        if (
            discovered.project_name in db_project_names
            or discovered.project_path in db_project_paths
        ):
            if discovered.project_path not in seen_paths:
                filtered.append(discovered)
                seen_paths.add(discovered.project_path)

    # Also ensure DB projects with paths not yet in monitor get added
    discovered_names = {p.project_name for p in filtered}
    for db_proj in db_projects:
        if db_proj.name in discovered_names:
            continue

        if db_proj.path:
            # Skip if this path was already added (matched by path in first loop)
            if db_proj.path in seen_paths:
                continue
            # Try to add the path and scan
            path = PathLib(db_proj.path)
            if path.exists() and path.is_dir():
                monitor.add_external_project(str(path))
                # Re-scan this specific project
                project_id = str(path).replace("/", "-").replace("\\", "-")
                summary = monitor.get_project_summary(project_id)
                if summary and summary.project:
                    filtered.append(summary.project)
                    seen_paths.add(summary.project.project_path)
                    continue

        # Fallback: DB project has no path or path scan failed
        # Include it as a basic ProjectInfo so it appears in the list
        project_id = f"db-{db_proj.id}"
        filtered.append(
            ProjectInfo(
                project_id=project_id,
                project_name=db_proj.name,
                project_path=db_proj.path or "",
                claude_dir="",
                last_modified=db_proj.updated_at or db_proj.created_at or utcnow(),
            )
        )

    return filtered


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


# ========================================
# Agents
# ========================================


# ========================================
# MCP Servers
# ========================================


# ========================================
# Hooks
# ========================================


# ========================================
# Commands
# ========================================


# ========================================
# Memories
# ========================================


# ========================================
# Rules
# ========================================


# ========================================
# Copy Operations
# ========================================
