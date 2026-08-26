"""Claude Code 훅 설정 라우트 (`/{project_id}/hooks`).

프로젝트 `.claude/settings.json` 의 훅 배선을 조회·일괄 교체하고, 이벤트별
항목을 추가·삭제·복사한다.

`POST /{project_id}/hooks/events/{event}`(추가)와
`DELETE·POST /{project_id}/hooks/{event}/{index}[/copy]`(삭제·복사)는
두 번째 세그먼트가 `events` 리터럴이냐 `{event}` 파라미터냐로 갈린다 —
세그먼트 수가 달라 서로를 가리지 않는다(추가 4 · 삭제 4 · 복사 5)."""

import logging

from fastapi import APIRouter, Depends, HTTPException

from api.deps import get_current_user, get_db_session
from api.project_configs.access import require_project_config_target_access
from models.project_config import (
    CopyHookRequest,
    HookEntryRequest,
    HooksUpdateRequest,
)
from services.audit_service import AuditAction, audit_config_change
from services.project_config_monitor import get_project_config_monitor

logger = logging.getLogger(__name__)

router = APIRouter()


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
        audit_config_change(AuditAction.CONFIG_UPDATED, "hooks", "hooks.json", project_id)
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
        audit_config_change(AuditAction.CONFIG_CREATED, "hook", event, project_id)
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
        audit_config_change(AuditAction.CONFIG_DELETED, "hook", f"{event}[{index}]", project_id)
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


@router.post("/{project_id}/hooks/{event}/{index}/copy")
async def copy_hook(
    project_id: str,
    event: str,
    index: int,
    request: CopyHookRequest,
    current_user=Depends(get_current_user),
    db=Depends(get_db_session),
) -> dict:
    """Copy a hook to another project.

    Args:
        project_id: Source project identifier
        event: Hook event name
        index: Hook entry index
        request: Copy request with target project

    Returns:
        Success status
    """
    await require_project_config_target_access(request.target_project_id, current_user, db)
    monitor = get_project_config_monitor()

    result = monitor.copy_hook(project_id, event, index, request.target_project_id)

    if result:
        return {
            "success": True,
            "message": f"Copied hook '{event}[{index}]' to project '{request.target_project_id}'",
            "source_project_id": project_id,
            "target_project_id": request.target_project_id,
            "event": event,
            "index": index,
        }
    else:
        raise HTTPException(
            status_code=400,
            detail=f"Failed to copy hook '{event}[{index}]'. Check if source and target projects exist.",
        )
