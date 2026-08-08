"""Memory 자산 라우트 (`/{project_id}/memories`).

프로젝트 메모리 파일과 그 인덱스(`MEMORY.md`)의 조회·생성·수정·삭제.

**이 모듈은 핸들러 선언 순서가 계약이다.** `PUT /{project_id}/memories/{memory_id}`
가 `PUT /{project_id}/memories/index` 를 삼킨다 — `{memory_id}` 자리에 리터럴
`index` 가 들어가면 모양이 같아지기 때문이다(실측 확인).

같은 모듈 안이라 `__init__.py` 의 include 순서로는 풀 수 없다. 아래 순서에서
`get_memory_index` · `update_memory_index` 를 `update_memory` 뒤로 옮기면
메모리 인덱스 갱신이 **영영 도달 불가**가 된다. 원본 선언 순서를 유지한다."""

import logging

from fastapi import APIRouter, HTTPException

from models.project_config import (
    MemoryConfig,
    MemoryContentResponse,
    MemoryCreateRequest,
    MemoryUpdateRequest,
)
from services.audit_service import AuditAction, audit_config_change
from services.project_config_monitor import get_project_config_monitor

logger = logging.getLogger(__name__)

router = APIRouter()


@router.get("/{project_id}/memories", response_model=list[MemoryConfig])
async def list_project_memories(project_id: str) -> list[MemoryConfig]:
    """Get all memory entries for a specific project.

    Args:
        project_id: Project identifier

    Returns:
        List of memory entries for the project
    """
    monitor = get_project_config_monitor()
    memories = monitor.get_project_memories(project_id)

    if not memories:
        summary = monitor.get_project_summary(project_id)
        if summary is None:
            raise HTTPException(status_code=404, detail=f"Project not found: {project_id}")

    return memories


@router.get("/{project_id}/memories/index")
async def get_memory_index(project_id: str) -> dict:
    """Get the MEMORY.md index content for a project.

    Args:
        project_id: Project identifier

    Returns:
        Dict with MEMORY.md content
    """
    monitor = get_project_config_monitor()
    content = monitor.get_memory_index(project_id)

    return {
        "project_id": project_id,
        "content": content,
    }


@router.put("/{project_id}/memories/index")
async def update_memory_index(project_id: str, request: MemoryUpdateRequest) -> dict:
    """Update the MEMORY.md index content for a project.

    Args:
        project_id: Project identifier
        request: Update request with new content

    Returns:
        Success status
    """
    monitor = get_project_config_monitor()

    if monitor.update_memory_index(project_id, request.content):
        audit_config_change(AuditAction.CONFIG_UPDATED, "memory", "MEMORY.md", project_id)
        return {
            "success": True,
            "message": "Updated MEMORY.md index",
            "project_id": project_id,
        }
    else:
        raise HTTPException(
            status_code=400,
            detail="Failed to update MEMORY.md. Check if project exists.",
        )


@router.get("/{project_id}/memories/{memory_id}/content", response_model=MemoryContentResponse)
async def get_memory_content(project_id: str, memory_id: str) -> MemoryContentResponse:
    """Get full content of a memory entry.

    Args:
        project_id: Project identifier
        memory_id: Memory identifier

    Returns:
        Memory configuration with full content
    """
    monitor = get_project_config_monitor()
    memory, content = monitor.get_memory_content(project_id, memory_id)

    if memory is None:
        raise HTTPException(
            status_code=404,
            detail=f"Memory not found: {memory_id} in project {project_id}",
        )

    return MemoryContentResponse(memory=memory, content=content)


@router.post("/{project_id}/memories", response_model=MemoryConfig)
async def create_memory(project_id: str, request: MemoryCreateRequest) -> MemoryConfig:
    """Create a new memory entry.

    Args:
        project_id: Project identifier
        request: Memory create request

    Returns:
        Created memory configuration
    """
    monitor = get_project_config_monitor()
    result = monitor.create_memory(project_id, request.memory_id, request.content)

    if result is None:
        raise HTTPException(
            status_code=400,
            detail=f"Failed to create memory: {request.memory_id}. Check if project exists and memory ID is unique.",
        )

    audit_config_change(AuditAction.CONFIG_CREATED, "memory", request.memory_id, project_id)
    return result


@router.put("/{project_id}/memories/{memory_id}")
async def update_memory(project_id: str, memory_id: str, request: MemoryUpdateRequest) -> dict:
    """Update memory content.

    Args:
        project_id: Project identifier
        memory_id: Memory identifier
        request: Update request with new content

    Returns:
        Success status
    """
    monitor = get_project_config_monitor()

    if monitor.update_memory_content(project_id, memory_id, request.content):
        audit_config_change(AuditAction.CONFIG_UPDATED, "memory", memory_id, project_id)
        return {
            "success": True,
            "message": f"Updated memory: {memory_id}",
            "project_id": project_id,
            "memory_id": memory_id,
        }
    else:
        raise HTTPException(
            status_code=400,
            detail=f"Failed to update memory: {memory_id}. Check if project and memory exist.",
        )


@router.delete("/{project_id}/memories/{memory_id}")
async def delete_memory(project_id: str, memory_id: str) -> dict:
    """Delete a memory entry.

    Args:
        project_id: Project identifier
        memory_id: Memory identifier

    Returns:
        Success status
    """
    monitor = get_project_config_monitor()

    if monitor.delete_memory(project_id, memory_id):
        audit_config_change(AuditAction.CONFIG_DELETED, "memory", memory_id, project_id)
        return {
            "success": True,
            "message": f"Deleted memory: {memory_id}",
            "project_id": project_id,
            "memory_id": memory_id,
        }
    else:
        raise HTTPException(
            status_code=400,
            detail=f"Failed to delete memory: {memory_id}. Check if project and memory exist.",
        )
