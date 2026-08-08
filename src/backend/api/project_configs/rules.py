"""Rule 자산 라우트 (`/{project_id}/rules`).

프로젝트 `.claude/rules/` 의 조회·생성·수정·삭제·복사.

**이 모듈은 `__init__.py` 에서 전역 설정 모듈보다 뒤에 include 해야 한다.**
`{project_id}` 자리에 리터럴 `global` 이 들어가면 `/global/rules` 계열과 모양이
같아져 전역 규칙 라우트 4개를 통째로 삼킨다 (실측: GET·POST `/global/rules`,
PUT·DELETE `/global/rules/{rule_id}`, GET `/global/rules/{rule_id}/content`)."""

import logging

from fastapi import APIRouter, HTTPException

from models.project_config import (
    CopyRuleRequest,
    RuleConfig,
    RuleContentResponse,
    RuleCreateRequest,
    RuleUpdateRequest,
)
from services.audit_service import AuditAction, audit_config_change
from services.project_config_monitor import get_project_config_monitor

logger = logging.getLogger(__name__)

router = APIRouter()


@router.get("/{project_id}/rules", response_model=list[RuleConfig])
async def list_project_rules(project_id: str) -> list[RuleConfig]:
    """Get all rules for a specific project.

    Args:
        project_id: Project identifier

    Returns:
        List of rules for the project
    """
    monitor = get_project_config_monitor()
    rules = monitor.get_project_rules(project_id)

    if not rules:
        summary = monitor.get_project_summary(project_id)
        if summary is None:
            raise HTTPException(status_code=404, detail=f"Project not found: {project_id}")

    return rules


@router.get("/{project_id}/rules/{rule_id}/content", response_model=RuleContentResponse)
async def get_rule_content(project_id: str, rule_id: str) -> RuleContentResponse:
    """Get full content of a project rule.

    Args:
        project_id: Project identifier
        rule_id: Rule identifier

    Returns:
        Rule configuration with full content
    """
    monitor = get_project_config_monitor()
    rule, content = monitor.get_rule_content(project_id, rule_id, is_global=False)

    if rule is None:
        raise HTTPException(
            status_code=404,
            detail=f"Rule not found: {rule_id} in project {project_id}",
        )

    return RuleContentResponse(rule=rule, content=content)


@router.post("/{project_id}/rules", response_model=RuleConfig)
async def create_rule(project_id: str, request: RuleCreateRequest) -> RuleConfig:
    """Create a new project rule.

    Args:
        project_id: Project identifier
        request: Rule create request

    Returns:
        Created rule configuration
    """
    monitor = get_project_config_monitor()
    result = monitor.create_rule(project_id, request.rule_id, request.content, is_global=False)

    if result is None:
        raise HTTPException(
            status_code=400,
            detail=f"Failed to create rule: {request.rule_id}. Check if project exists and rule ID is unique.",
        )

    audit_config_change(AuditAction.CONFIG_CREATED, "rules", request.rule_id, project_id)
    return result


@router.put("/{project_id}/rules/{rule_id}")
async def update_rule(project_id: str, rule_id: str, request: RuleUpdateRequest) -> dict:
    """Update project rule content.

    Args:
        project_id: Project identifier
        rule_id: Rule identifier
        request: Update request with new content

    Returns:
        Success status
    """
    monitor = get_project_config_monitor()

    if monitor.update_rule_content(project_id, rule_id, request.content, is_global=False):
        audit_config_change(AuditAction.CONFIG_UPDATED, "rules", rule_id, project_id)
        return {
            "success": True,
            "message": f"Updated rule: {rule_id}",
            "project_id": project_id,
            "rule_id": rule_id,
        }
    else:
        raise HTTPException(
            status_code=400,
            detail=f"Failed to update rule: {rule_id}. Check if project and rule exist.",
        )


@router.delete("/{project_id}/rules/{rule_id}")
async def delete_rule(project_id: str, rule_id: str) -> dict:
    """Delete a project rule.

    Args:
        project_id: Project identifier
        rule_id: Rule identifier

    Returns:
        Success status
    """
    monitor = get_project_config_monitor()

    if monitor.delete_rule(project_id, rule_id, is_global=False):
        audit_config_change(AuditAction.CONFIG_DELETED, "rules", rule_id, project_id)
        return {
            "success": True,
            "message": f"Deleted rule: {rule_id}",
            "project_id": project_id,
            "rule_id": rule_id,
        }
    else:
        raise HTTPException(
            status_code=400,
            detail=f"Failed to delete rule: {rule_id}. Check if project and rule exist.",
        )


@router.post("/{project_id}/rules/{rule_id}/copy")
async def copy_rule(project_id: str, rule_id: str, request: CopyRuleRequest) -> dict:
    """Copy a rule to another project.

    Args:
        project_id: Source project identifier
        rule_id: Rule identifier to copy
        request: Copy request with target project

    Returns:
        Success status
    """
    monitor = get_project_config_monitor()

    result = monitor.copy_rule(project_id, rule_id, request.target_project_id)

    if result:
        return {
            "success": True,
            "message": f"Copied rule '{rule_id}' to project '{request.target_project_id}'",
            "source_project_id": project_id,
            "target_project_id": request.target_project_id,
            "rule_id": rule_id,
        }
    else:
        raise HTTPException(
            status_code=400,
            detail=f"Failed to copy rule '{rule_id}'. Check if source and target projects exist.",
        )
