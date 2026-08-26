"""Agent 자산 라우트 (`/agents/all`, `/{project_id}/agents`).

프로젝트별 `.claude/agents/` 의 조회·생성·수정·삭제·복사. `skills` 모듈과 대칭
구조이며, 경로 가림 성질도 같다.

**주의**: 이 모듈은 `api/agents/` 패키지(에이전트 오케스트레이션 API)와 이름만
같고 무관하다. 여기는 프로젝트 설정 파일로서의 에이전트 정의를 다룬다."""

import logging

from fastapi import APIRouter, Depends, HTTPException

from api.deps import get_current_user, get_db_session
from api.project_configs.access import require_project_config_target_access
from models.project_config import (
    AgentConfig,
    AgentContentResponse,
    AgentCreateRequest,
    AgentUpdateRequest,
    CopyAgentRequest,
)
from services.audit_service import AuditAction, audit_config_change
from services.project_config_monitor import get_project_config_monitor

logger = logging.getLogger(__name__)

router = APIRouter()


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
    result = monitor.create_agent(project_id, request.agent_id, request.content, request.is_shared)

    if result is None:
        raise HTTPException(
            status_code=400,
            detail=f"Failed to create agent: {request.agent_id}. Check if project exists and agent ID is unique.",
        )

    audit_config_change(AuditAction.CONFIG_CREATED, "agent", request.agent_id, project_id)
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
        audit_config_change(AuditAction.CONFIG_UPDATED, "agent", agent_id, project_id)
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
        audit_config_change(AuditAction.CONFIG_DELETED, "agent", agent_id, project_id)
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


@router.post("/{project_id}/agents/{agent_id}/copy")
async def copy_agent(
    project_id: str,
    agent_id: str,
    request: CopyAgentRequest,
    current_user=Depends(get_current_user),
    db=Depends(get_db_session),
) -> dict:
    """Copy an agent to another project.

    Args:
        project_id: Source project identifier
        agent_id: Agent identifier to copy
        request: Copy request with target project

    Returns:
        Success status
    """
    await require_project_config_target_access(request.target_project_id, current_user, db)
    monitor = get_project_config_monitor()

    result = monitor.copy_agent(project_id, agent_id, request.target_project_id)

    if result:
        return {
            "success": True,
            "message": f"Copied agent '{agent_id}' to project '{request.target_project_id}'",
            "source_project_id": project_id,
            "target_project_id": request.target_project_id,
            "agent_id": agent_id,
        }
    else:
        raise HTTPException(
            status_code=400,
            detail=f"Failed to copy agent '{agent_id}'. Check if source and target projects exist.",
        )
