"""Permission Toggles API routes.

Session-level permission management: get, update, toggle permissions and agents.
"""

from collections.abc import Mapping

from fastapi import APIRouter, Depends, HTTPException

from api.deps import authorize_session_state, get_current_user, get_engine
from db.models import UserModel
from models.permissions import (
    AgentPermission,
    SessionPermissions,
    SessionPermissionsResponse,
    UpdatePermissionsRequest,
    get_permission_info,
)
from orchestrator import OrchestrationEngine
from services.audit_service import AuditAction, AuditService, ResourceType

router = APIRouter(
    tags=["orchestration"],
    dependencies=[Depends(get_current_user)],
)

# In-memory storage for session permissions
_session_permissions: dict[str, SessionPermissions] = {}


def _get_session_permissions(session_id: str) -> SessionPermissions:
    """Get or create session permissions."""
    if session_id not in _session_permissions:
        _session_permissions[session_id] = SessionPermissions()
    return _session_permissions[session_id]


def _authorize_session_access(state: Mapping[str, object], current_user: UserModel) -> None:
    """Allow session owners and privileged operators to manage permissions."""
    authorize_session_state(state, current_user)


def _permission_snapshot(perms: SessionPermissions) -> dict:
    """Return a JSON-safe snapshot for permission change auditing."""
    return {
        "enabled_permissions": sorted(permission.value for permission in perms.enabled_permissions),
        "disabled_agents": sorted(perms.disabled_agents),
        "agent_overrides": {
            agent_id: sorted(permission.value for permission in permissions)
            for agent_id, permissions in sorted(perms.permission_overrides.items())
        },
    }


def _audit_permission_change(
    session_id: str,
    user_id: str,
    old_value: dict,
    new_value: dict,
) -> None:
    """Record a session permission mutation with before/after state."""
    AuditService.log(
        action=AuditAction.PERMISSION_CHANGED,
        resource_type=ResourceType.PERMISSION,
        resource_id=session_id,
        session_id=session_id,
        user_id=user_id,
        old_value=old_value,
        new_value=new_value,
    )


@router.get("/sessions/{session_id}/permissions", response_model=SessionPermissionsResponse)
async def get_session_permissions(
    session_id: str,
    engine: OrchestrationEngine = Depends(get_engine),
    current_user: UserModel = Depends(get_current_user),
):
    """
    Get current permission settings for a session.

    Returns all available permissions with their enabled/disabled state.
    """
    state = await engine.get_session(session_id)
    if not state:
        raise HTTPException(status_code=404, detail="Session not found")

    _authorize_session_access(state, current_user)
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
    current_user: UserModel = Depends(get_current_user),
):
    """
    Update permission settings for a session.

    Allows enabling/disabling specific permissions and agents.
    """
    state = await engine.get_session(session_id)
    if not state:
        raise HTTPException(status_code=404, detail="Session not found")

    _authorize_session_access(state, current_user)
    perms = _get_session_permissions(session_id)
    old_value = _permission_snapshot(perms)

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

    _audit_permission_change(
        session_id,
        current_user.id,
        old_value,
        _permission_snapshot(perms),
    )

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
    current_user: UserModel = Depends(get_current_user),
):
    """
    Toggle a specific permission on/off.
    """
    state = await engine.get_session(session_id)
    if not state:
        raise HTTPException(status_code=404, detail="Session not found")

    _authorize_session_access(state, current_user)
    perms = _get_session_permissions(session_id)
    old_value = _permission_snapshot(perms)

    if permission in perms.enabled_permissions:
        perms.disable_permission(permission)
        enabled = False
    else:
        perms.enable_permission(permission)
        enabled = True

    _audit_permission_change(
        session_id,
        current_user.id,
        old_value,
        _permission_snapshot(perms),
    )

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
    current_user: UserModel = Depends(get_current_user),
):
    """
    Enable/disable a specific agent.
    """
    state = await engine.get_session(session_id)
    if not state:
        raise HTTPException(status_code=404, detail="Session not found")

    _authorize_session_access(state, current_user)
    perms = _get_session_permissions(session_id)
    old_value = _permission_snapshot(perms)

    if agent_id in perms.disabled_agents:
        perms.enable_agent(agent_id)
        enabled = True
    else:
        perms.disable_agent(agent_id)
        enabled = False

    _audit_permission_change(
        session_id,
        current_user.id,
        old_value,
        _permission_snapshot(perms),
    )

    return {
        "success": True,
        "agent_id": agent_id,
        "enabled": enabled,
    }
