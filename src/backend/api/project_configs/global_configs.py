"""전역(사용자 홈) Claude 설정 라우트 (`/global`, `/global/rules`).

프로젝트가 아니라 `~/.claude/` 의 설정 요약과 전역 규칙 파일을 다룬다.

**이 모듈은 `__init__.py` 에서 가장 먼저 include 해야 한다.** 두 가지가 걸린다:

  - `GET /{project_id}`(monitoring)가 `GET /global` 을 삼킨다
  - `{project_id}/rules`(rules) 계열이 `global/rules` 계열 5개를 전부 삼킨다
    — `{project_id}` 자리에 리터럴 `global` 이 들어가면 모양이 같아진다

즉 이 모듈이 뒤로 밀리면 전역 설정 라우트 6개가 **통째로 도달 불가**가 된다.
실측(2026-08-08)으로 6쌍 재현했다."""

import logging

from fastapi import APIRouter, Depends, HTTPException

from api.deps import get_current_user_optional
from models.project_config import (
    GlobalConfigSummary,
    RuleConfig,
    RuleContentResponse,
    RuleCreateRequest,
    RuleUpdateRequest,
)
from services.audit_service import AuditAction, audit_config_change
from services.project_config_monitor import get_project_config_monitor

logger = logging.getLogger(__name__)

router = APIRouter()


@router.get("/global", response_model=GlobalConfigSummary)
async def get_global_configs(
    current_user=Depends(get_current_user_optional),
) -> GlobalConfigSummary:
    """Get global configurations from ~/.claude/ directory.

    Returns global agents, skills, and hooks that apply across all projects.
    """
    monitor = get_project_config_monitor()
    return monitor.get_global_configs()


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
