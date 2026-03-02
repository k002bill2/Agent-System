"""Permission Toggles API routes.

Session-level permission management: get, update, toggle permissions and agents.
"""

from fastapi import APIRouter, Depends, HTTPException

from api.deps import get_engine
from models.permissions import (
    AgentPermission,
    SessionPermissions,
    SessionPermissionsResponse,
    UpdatePermissionsRequest,
    get_permission_info,
)
from orchestrator import OrchestrationEngine

router = APIRouter(tags=["orchestration"])

# In-memory storage for session permissions
_session_permissions: dict[str, SessionPermissions] = {}


def _get_session_permissions(session_id: str) -> SessionPermissions:
    """Get or create session permissions."""
    if session_id not in _session_permissions:
        _session_permissions[session_id] = SessionPermissions()
    return _session_permissions[session_id]


@router.get("/sessions/{session_id}/permissions", response_model=SessionPermissionsResponse)
async def get_session_permissions(
    session_id: str,
    engine: OrchestrationEngine = Depends(get_engine),
):
    """
    Get current permission settings for a session.

    Returns all available permissions with their enabled/disabled state.
    """
    state = await engine.get_session(session_id)
    if not state:
        raise HTTPException(status_code=404, detail="Session not found")

    perms = _get_session_permissions(session_id)

    # Build permission info list
    permission_infos = []
    for perm in AgentPermission:
        enabled = perm in perms.enabled_permissions
        permission_infos.append(get_permission_info(perm, enabled))

    return SessionPermissionsResponse(
        session_id=session_id,
        permissions=permission_infos,
        disabled_agents=list(perms.disabled_agents),
        agent_overrides={
            agent_id: list(perms_set) for agent_id, perms_set in perms.permission_overrides.items()
        },
    )


@router.put("/sessions/{session_id}/permissions", response_model=SessionPermissionsResponse)
async def update_session_permissions(
    session_id: str,
    request: UpdatePermissionsRequest,
    engine: OrchestrationEngine = Depends(get_engine),
):
    """
    Update permission settings for a session.

    Allows enabling/disabling specific permissions and agents.
    """
    state = await engine.get_session(session_id)
    if not state:
        raise HTTPException(status_code=404, detail="Session not found")

    perms = _get_session_permissions(session_id)

    # Update enabled permissions
    if request.enabled_permissions is not None:
        perms.enabled_permissions = set(request.enabled_permissions)

    # Update disabled agents
    if request.disabled_agents is not None:
        perms.disabled_agents = set(request.disabled_agents)

    # Update agent overrides
    if request.agent_overrides is not None:
        perms.permission_overrides = {
            agent_id: set(perms_list) for agent_id, perms_list in request.agent_overrides.items()
        }

    # Build response
    permission_infos = []
    for perm in AgentPermission:
        enabled = perm in perms.enabled_permissions
        permission_infos.append(get_permission_info(perm, enabled))

    return SessionPermissionsResponse(
        session_id=session_id,
        permissions=permission_infos,
        disabled_agents=list(perms.disabled_agents),
        agent_overrides={
            agent_id: list(perms_set) for agent_id, perms_set in perms.permission_overrides.items()
        },
    )


@router.post("/sessions/{session_id}/permissions/toggle/{permission}")
async def toggle_permission(
    session_id: str,
    permission: AgentPermission,
    engine: OrchestrationEngine = Depends(get_engine),
):
    """
    Toggle a specific permission on/off.
    """
    state = await engine.get_session(session_id)
    if not state:
        raise HTTPException(status_code=404, detail="Session not found")

    perms = _get_session_permissions(session_id)

    if permission in perms.enabled_permissions:
        perms.disable_permission(permission)
        enabled = False
    else:
        perms.enable_permission(permission)
        enabled = True

    return {
        "success": True,
        "permission": permission.value,
        "enabled": enabled,
    }


@router.post("/sessions/{session_id}/permissions/agents/{agent_id}/toggle")
async def toggle_agent(
    session_id: str,
    agent_id: str,
    engine: OrchestrationEngine = Depends(get_engine),
):
    """
    Enable/disable a specific agent.
    """
    state = await engine.get_session(session_id)
    if not state:
        raise HTTPException(status_code=404, detail="Session not found")

    perms = _get_session_permissions(session_id)

    if agent_id in perms.disabled_agents:
        perms.enable_agent(agent_id)
        enabled = True
    else:
        perms.disable_agent(agent_id)
        enabled = False

    return {
        "success": True,
        "agent_id": agent_id,
        "enabled": enabled,
    }
