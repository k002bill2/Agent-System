"""Agent permissions model for controlling tool execution."""

from enum import Enum

from pydantic import BaseModel, Field


class AgentPermission(str, Enum):
    """Available agent permissions."""

    # Tool execution permissions
    EXECUTE_BASH = "execute_bash"
    WRITE_FILE = "write_file"
    READ_FILE = "read_file"
    DELETE_FILE = "delete_file"
    NETWORK_ACCESS = "network_access"
    MCP_TOOL_CALL = "mcp_tool_call"

    # Operation permissions
    CREATE_SESSION = "create_session"
    MODIFY_TASKS = "modify_tasks"
    APPROVE_OPERATIONS = "approve_operations"


# Default permission descriptions for UI
PERMISSION_DESCRIPTIONS: dict[AgentPermission, dict[str, str]] = {
    AgentPermission.EXECUTE_BASH: {
        "title": "Execute Bash Commands",
        "description": "Allow agents to execute shell commands",
        "risk": "high",
    },
    AgentPermission.WRITE_FILE: {
        "title": "Write Files",
        "description": "Allow agents to create or modify files",
        "risk": "medium",
    },
    AgentPermission.READ_FILE: {
        "title": "Read Files",
        "description": "Allow agents to read file contents",
        "risk": "low",
    },
    AgentPermission.DELETE_FILE: {
        "title": "Delete Files",
        "description": "Allow agents to delete files",
        "risk": "high",
    },
    AgentPermission.NETWORK_ACCESS: {
        "title": "Network Access",
        "description": "Allow agents to make network requests",
        "risk": "medium",
    },
    AgentPermission.MCP_TOOL_CALL: {
        "title": "MCP Tool Calls",
        "description": "Allow agents to call external MCP tools",
        "risk": "medium",
    },
    AgentPermission.CREATE_SESSION: {
        "title": "Create Sessions",
        "description": "Allow creating new orchestration sessions",
        "risk": "low",
    },
    AgentPermission.MODIFY_TASKS: {
        "title": "Modify Tasks",
        "description": "Allow agents to create, update, or delete tasks",
        "risk": "low",
    },
    AgentPermission.APPROVE_OPERATIONS: {
        "title": "Auto-Approve Operations",
        "description": "Skip HITL approval for this permission type",
        "risk": "high",
    },
}

# Default enabled permissions
DEFAULT_PERMISSIONS: set[AgentPermission] = {
    AgentPermission.READ_FILE,
    AgentPermission.WRITE_FILE,
    AgentPermission.CREATE_SESSION,
    AgentPermission.MODIFY_TASKS,
    AgentPermission.MCP_TOOL_CALL,
}

# High-risk permissions that require explicit enable
HIGH_RISK_PERMISSIONS: set[AgentPermission] = {
    AgentPermission.EXECUTE_BASH,
    AgentPermission.DELETE_FILE,
    AgentPermission.APPROVE_OPERATIONS,
}


class SessionPermissions(BaseModel):
    """Session-level permission configuration."""

    enabled_permissions: set[AgentPermission] = Field(
        default_factory=lambda: DEFAULT_PERMISSIONS.copy(),
        description="Set of enabled permissions for this session",
    )
    disabled_agents: set[str] = Field(
        default_factory=set,
        description="Set of agent IDs that are disabled",
    )
    permission_overrides: dict[str, set[AgentPermission]] = Field(
        default_factory=dict,
        description="Per-agent permission overrides (agent_id -> permissions)",
    )

    def is_permission_enabled(
        self, permission: AgentPermission, agent_id: str | None = None
    ) -> bool:
        """Check if a permission is enabled, considering agent overrides."""
        # Check if agent is disabled
        if agent_id and agent_id in self.disabled_agents:
            return False

        # Check agent-specific override
        if agent_id and agent_id in self.permission_overrides:
            return permission in self.permission_overrides[agent_id]

        # Fall back to session-level permission
        return permission in self.enabled_permissions

    def enable_permission(self, permission: AgentPermission) -> None:
        """Enable a permission."""
        self.enabled_permissions.add(permission)

    def disable_permission(self, permission: AgentPermission) -> None:
        """Disable a permission."""
        self.enabled_permissions.discard(permission)

    def disable_agent(self, agent_id: str) -> None:
        """Disable an agent entirely."""
        self.disabled_agents.add(agent_id)

    def enable_agent(self, agent_id: str) -> None:
        """Re-enable a disabled agent."""
        self.disabled_agents.discard(agent_id)

    def set_agent_permissions(
        self, agent_id: str, permissions: set[AgentPermission]
    ) -> None:
        """Set specific permissions for an agent."""
        self.permission_overrides[agent_id] = permissions

    def clear_agent_override(self, agent_id: str) -> None:
        """Clear agent-specific permission override."""
        self.permission_overrides.pop(agent_id, None)


class PermissionInfo(BaseModel):
    """Permission information for API response."""

    permission: AgentPermission
    enabled: bool
    title: str
    description: str
    risk: str


class SessionPermissionsResponse(BaseModel):
    """API response for session permissions."""

    session_id: str
    permissions: list[PermissionInfo]
    disabled_agents: list[str]
    agent_overrides: dict[str, list[AgentPermission]]


class UpdatePermissionsRequest(BaseModel):
    """Request body for updating permissions."""

    enabled_permissions: list[AgentPermission] | None = None
    disabled_agents: list[str] | None = None
    agent_overrides: dict[str, list[AgentPermission]] | None = None


def get_permission_info(
    permission: AgentPermission, enabled: bool
) -> PermissionInfo:
    """Get permission info for API response."""
    info = PERMISSION_DESCRIPTIONS.get(
        permission,
        {"title": permission.value, "description": "", "risk": "unknown"},
    )
    return PermissionInfo(
        permission=permission,
        enabled=enabled,
        title=info["title"],
        description=info["description"],
        risk=info["risk"],
    )


# Tool to permission mapping
TOOL_PERMISSION_MAP: dict[str, AgentPermission] = {
    "execute_bash": AgentPermission.EXECUTE_BASH,
    "bash": AgentPermission.EXECUTE_BASH,
    "shell": AgentPermission.EXECUTE_BASH,
    "write_file": AgentPermission.WRITE_FILE,
    "create_file": AgentPermission.WRITE_FILE,
    "read_file": AgentPermission.READ_FILE,
    "delete_file": AgentPermission.DELETE_FILE,
    "remove_file": AgentPermission.DELETE_FILE,
    "http_request": AgentPermission.NETWORK_ACCESS,
    "fetch": AgentPermission.NETWORK_ACCESS,
    "mcp_call": AgentPermission.MCP_TOOL_CALL,
}


def get_required_permission(tool_name: str) -> AgentPermission | None:
    """Get the required permission for a tool."""
    # Direct mapping
    if tool_name in TOOL_PERMISSION_MAP:
        return TOOL_PERMISSION_MAP[tool_name]

    # Pattern matching
    tool_lower = tool_name.lower()
    if "bash" in tool_lower or "shell" in tool_lower or "exec" in tool_lower:
        return AgentPermission.EXECUTE_BASH
    if "write" in tool_lower or "create" in tool_lower:
        return AgentPermission.WRITE_FILE
    if "read" in tool_lower:
        return AgentPermission.READ_FILE
    if "delete" in tool_lower or "remove" in tool_lower:
        return AgentPermission.DELETE_FILE
    if "http" in tool_lower or "fetch" in tool_lower or "request" in tool_lower:
        return AgentPermission.NETWORK_ACCESS
    if "mcp" in tool_lower:
        return AgentPermission.MCP_TOOL_CALL

    return None
