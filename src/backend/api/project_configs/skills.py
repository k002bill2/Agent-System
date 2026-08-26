"""Skill 자산 라우트 (`/skills/all`, `/{project_id}/skills`).

프로젝트별 `.claude/skills/` 의 조회·생성·수정·삭제·복사와, 모든 프로젝트의
스킬을 한 번에 훑는 `/skills/all` 을 제공한다.

`GET /skills/all` 은 `GET /{project_id}/skills` 와 세그먼트 수가 같지만 두 번째
세그먼트가 각각 `all`·`skills` 로 갈려 서로를 가리지 않는다(실측). 그래도 원본
선언 순서(all 먼저)를 유지한다 — 순서 의존을 새로 만들지 않기 위해서다."""

import logging

from fastapi import APIRouter, Depends, HTTPException

from api.deps import get_current_user, get_db_session
from api.project_configs.access import require_project_config_target_access
from models.project_config import (
    CopySkillRequest,
    SkillConfig,
    SkillContentResponse,
    SkillCreateRequest,
    SkillUpdateRequest,
)
from services.audit_service import AuditAction, audit_config_change
from services.project_config_monitor import get_project_config_monitor

logger = logging.getLogger(__name__)

router = APIRouter()


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

    audit_config_change(AuditAction.CONFIG_CREATED, "skill", request.skill_id, project_id)
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
        audit_config_change(AuditAction.CONFIG_UPDATED, "skill", skill_id, project_id)
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
        audit_config_change(AuditAction.CONFIG_DELETED, "skill", skill_id, project_id)
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


@router.post("/{project_id}/skills/{skill_id}/copy")
async def copy_skill(
    project_id: str,
    skill_id: str,
    request: CopySkillRequest,
    current_user=Depends(get_current_user),
    db=Depends(get_db_session),
) -> dict:
    """Copy a skill to another project.

    Args:
        project_id: Source project identifier
        skill_id: Skill identifier to copy
        request: Copy request with target project

    Returns:
        Success status
    """
    await require_project_config_target_access(request.target_project_id, current_user, db)
    monitor = get_project_config_monitor()

    result = monitor.copy_skill(project_id, skill_id, request.target_project_id)

    if result:
        return {
            "success": True,
            "message": f"Copied skill '{skill_id}' to project '{request.target_project_id}'",
            "source_project_id": project_id,
            "target_project_id": request.target_project_id,
            "skill_id": skill_id,
        }
    else:
        raise HTTPException(
            status_code=400,
            detail=f"Failed to copy skill '{skill_id}'. Check if source and target projects exist.",
        )
