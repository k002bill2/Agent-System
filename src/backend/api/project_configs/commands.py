"""Slash command 자산 라우트 (`/{project_id}/commands`).

프로젝트 `.claude/commands/` 의 조회·생성·수정·삭제·복사. 전부 3세그먼트
이상이라 순서 제약이 없다."""

import logging

from fastapi import APIRouter, HTTPException

from models.project_config import (
    CommandConfig,
    CommandContentResponse,
    CommandCreateRequest,
    CommandUpdateRequest,
    CopyCommandRequest,
)
from services.audit_service import AuditAction, audit_config_change
from services.project_config_monitor import get_project_config_monitor

logger = logging.getLogger(__name__)

router = APIRouter()


@router.get("/{project_id}/commands", response_model=list[CommandConfig])
async def list_project_commands(project_id: str) -> list[CommandConfig]:
    """Get all commands for a specific project.

    Args:
        project_id: Project identifier

    Returns:
        List of commands for the project
    """
    monitor = get_project_config_monitor()
    commands = monitor.get_project_commands(project_id)

    if not commands:
        # Check if project exists
        summary = monitor.get_project_summary(project_id)
        if summary is None:
            raise HTTPException(status_code=404, detail=f"Project not found: {project_id}")

    return commands


@router.get("/{project_id}/commands/{command_id}/content", response_model=CommandContentResponse)
async def get_command_content(project_id: str, command_id: str) -> CommandContentResponse:
    """Get full content of a command.

    Args:
        project_id: Project identifier
        command_id: Command identifier

    Returns:
        Command configuration with full content
    """
    monitor = get_project_config_monitor()
    command, content = monitor.get_command_content(project_id, command_id)

    if command is None:
        raise HTTPException(
            status_code=404,
            detail=f"Command not found: {command_id} in project {project_id}",
        )

    return CommandContentResponse(command=command, content=content)


@router.post("/{project_id}/commands", response_model=CommandConfig)
async def create_command(project_id: str, request: CommandCreateRequest) -> CommandConfig:
    """Create a new command.

    Args:
        project_id: Project identifier
        request: Command create request

    Returns:
        Created command configuration
    """
    monitor = get_project_config_monitor()
    result = monitor.create_command(project_id, request.command_id, request.content)

    if result is None:
        raise HTTPException(
            status_code=400,
            detail=f"Failed to create command: {request.command_id}. Check if project exists and command ID is unique.",
        )

    audit_config_change(AuditAction.CONFIG_CREATED, "command", request.command_id, project_id)
    return result


@router.put("/{project_id}/commands/{command_id}")
async def update_command(project_id: str, command_id: str, request: CommandUpdateRequest) -> dict:
    """Update command content.

    Args:
        project_id: Project identifier
        command_id: Command identifier
        request: Update request with new content

    Returns:
        Success status
    """
    monitor = get_project_config_monitor()

    if monitor.update_command_content(project_id, command_id, request.content):
        audit_config_change(AuditAction.CONFIG_UPDATED, "command", command_id, project_id)
        return {
            "success": True,
            "message": f"Updated command: {command_id}",
            "project_id": project_id,
            "command_id": command_id,
        }
    else:
        raise HTTPException(
            status_code=400,
            detail=f"Failed to update command: {command_id}. Check if project and command exist.",
        )


@router.delete("/{project_id}/commands/{command_id}")
async def delete_command(project_id: str, command_id: str) -> dict:
    """Delete a command.

    Args:
        project_id: Project identifier
        command_id: Command identifier

    Returns:
        Success status
    """
    monitor = get_project_config_monitor()

    if monitor.delete_command(project_id, command_id):
        audit_config_change(AuditAction.CONFIG_DELETED, "command", command_id, project_id)
        return {
            "success": True,
            "message": f"Deleted command: {command_id}",
            "project_id": project_id,
            "command_id": command_id,
        }
    else:
        raise HTTPException(
            status_code=400,
            detail=f"Failed to delete command: {command_id}. Check if project and command exist.",
        )


@router.post("/{project_id}/commands/{command_id}/copy")
async def copy_command(project_id: str, command_id: str, request: CopyCommandRequest) -> dict:
    """Copy a command to another project.

    Args:
        project_id: Source project identifier
        command_id: Command identifier to copy
        request: Copy request with target project

    Returns:
        Success status
    """
    monitor = get_project_config_monitor()

    result = monitor.copy_command(project_id, command_id, request.target_project_id)

    if result:
        return {
            "success": True,
            "message": f"Copied command '{command_id}' to project '{request.target_project_id}'",
            "source_project_id": project_id,
            "target_project_id": request.target_project_id,
            "command_id": command_id,
        }
    else:
        raise HTTPException(
            status_code=400,
            detail=f"Failed to copy command '{command_id}'. Check if source and target projects exist.",
        )
