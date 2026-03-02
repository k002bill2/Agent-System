"""Project configuration models for Claude Code settings monitoring."""

from datetime import datetime
from enum import Enum
from typing import Any

from pydantic import BaseModel, Field

from utils.time import utcnow


class ConfigChangeType(str, Enum):
    """Type of configuration change event."""

    CREATED = "created"
    MODIFIED = "modified"
    DELETED = "deleted"


class MCPServerType(str, Enum):
    """Type of MCP server."""

    NPX = "npx"
    UVX = "uvx"
    COMMAND = "command"


class MCPServerSource(str, Enum):
    """Source of MCP server configuration."""

    USER = "user"  # From ~/.claude.json
    PROJECT = "project"  # From .claude/mcp.json


class ProjectInfo(BaseModel):
    """Project information discovered from filesystem."""

    project_id: str = Field(..., description="Unique project identifier (encoded path)")
    project_name: str = Field(..., description="Human-readable project name")
    project_path: str = Field(..., description="Absolute path to project root")
    claude_dir: str = Field(..., description="Path to .claude directory")
    has_skills: bool = Field(default=False, description="Whether project has skills")
    has_agents: bool = Field(default=False, description="Whether project has agents")
    has_mcp: bool = Field(default=False, description="Whether project has MCP config")
    has_hooks: bool = Field(default=False, description="Whether project has hooks")
    has_commands: bool = Field(default=False, description="Whether project has commands")
    skill_count: int = Field(default=0, description="Number of skills")
    agent_count: int = Field(default=0, description="Number of agents")
    mcp_server_count: int = Field(default=0, description="Number of MCP servers")
    hook_count: int = Field(default=0, description="Number of hooks")
    command_count: int = Field(default=0, description="Number of commands")
    last_modified: datetime = Field(default_factory=utcnow)


class SkillConfig(BaseModel):
    """Parsed skill configuration from SKILL.md."""

    skill_id: str = Field(..., description="Skill identifier (directory name)")
    project_id: str = Field(..., description="Parent project ID")
    name: str = Field(..., description="Skill name from frontmatter")
    description: str = Field(default="", description="Skill description from frontmatter")
    file_path: str = Field(..., description="Path to SKILL.md file")

    # Optional frontmatter fields
    tools: list[str] = Field(default_factory=list, description="Available tools")
    model: str | None = Field(default=None, description="Preferred model")
    version: str | int | float | None = Field(default=None, description="Skill version")
    author: str | None = Field(default=None, description="Skill author")

    # Additional metadata
    has_references: bool = Field(default=False, description="Has references/ folder")
    has_scripts: bool = Field(default=False, description="Has scripts/ folder")
    has_assets: bool = Field(default=False, description="Has assets/ folder")

    # Timestamps
    created_at: datetime | None = Field(default=None)
    modified_at: datetime | None = Field(default=None)


class AgentConfig(BaseModel):
    """Parsed agent configuration from .md file."""

    agent_id: str = Field(..., description="Agent identifier (filename without .md)")
    project_id: str = Field(..., description="Parent project ID")
    name: str = Field(..., description="Agent name from frontmatter")
    description: str = Field(default="", description="Agent description")
    file_path: str = Field(..., description="Path to agent .md file")

    # Frontmatter fields
    tools: list[str] = Field(default_factory=list, description="Available tools")
    model: str | None = Field(default=None, description="Preferred model (opus/sonnet/haiku)")
    role: str | None = Field(default=None, description="Agent role")

    # ACE capabilities (if present)
    ace_capabilities: dict[str, Any] | None = Field(
        default=None, description="ACE framework capabilities"
    )

    # Metadata
    is_shared: bool = Field(default=False, description="Is in shared/ directory")
    modified_at: datetime | None = Field(default=None)


class MCPServerConfig(BaseModel):
    """MCP server configuration from mcp.json or ~/.claude.json."""

    server_id: str = Field(..., description="Server identifier (key in mcpServers)")
    project_id: str = Field(..., description="Parent project ID")
    command: str = Field(default="", description="Command to run (npx, uvx, etc.)")
    args: list[str] = Field(default_factory=list, description="Command arguments")
    env: dict[str, str] = Field(default_factory=dict, description="Environment variables")
    disabled: bool = Field(default=False, description="Whether server is disabled")
    note: str = Field(default="", description="Note about the server")

    # Derived fields
    server_type: MCPServerType = Field(default=MCPServerType.COMMAND)
    package_name: str = Field(default="", description="NPM/Python package name")

    # Source of configuration
    source: MCPServerSource = Field(
        default=MCPServerSource.PROJECT,
        description="Source: 'user' (~/.claude.json) or 'project' (.claude/mcp.json)",
    )


class HookConfig(BaseModel):
    """Hook configuration from hooks.json or settings.json."""

    hook_id: str = Field(..., description="Hook identifier")
    project_id: str = Field(..., description="Parent project ID")
    event: str = Field(..., description="Hook event (PreToolUse, PostToolUse, etc.)")
    matcher: str = Field(default="*", description="Tool/event matcher pattern")
    command: str = Field(default="", description="Shell command to execute")
    hook_type: str = Field(default="command", description="Hook type")
    file_path: str = Field(default="", description="Path to hook script if external")


class CommandConfig(BaseModel):
    """Parsed command configuration from .md file in .claude/commands/."""

    command_id: str = Field(..., description="Command identifier (filename without .md)")
    project_id: str = Field(..., description="Parent project ID")
    name: str = Field(..., description="Command name from frontmatter or command_id")
    description: str = Field(default="", description="Command description from frontmatter")
    file_path: str = Field(..., description="Path to command .md file")

    # Optional frontmatter fields
    allowed_tools: str | None = Field(default=None, description="Allowed tools specification")
    argument_hint: str | None = Field(default=None, description="Argument hint for the command")

    # Timestamps
    modified_at: datetime | None = Field(default=None)


class ProjectConfigSummary(BaseModel):
    """Summary of project configuration."""

    project: ProjectInfo
    skills: list[SkillConfig] = Field(default_factory=list)
    agents: list[AgentConfig] = Field(default_factory=list)
    mcp_servers: list[MCPServerConfig] = Field(default_factory=list)
    user_mcp_servers: list[MCPServerConfig] = Field(
        default_factory=list, description="User-level MCP servers from ~/.claude.json"
    )
    hooks: list[HookConfig] = Field(default_factory=list)
    commands: list[CommandConfig] = Field(default_factory=list)


class ConfigChangeEvent(BaseModel):
    """Event emitted when configuration changes."""

    event_type: ConfigChangeType
    project_id: str
    config_type: str = Field(..., description="skills|agents|mcp|hooks")
    item_id: str | None = Field(default=None, description="Changed item ID")
    timestamp: datetime = Field(default_factory=utcnow)
    details: dict[str, Any] = Field(default_factory=dict)


class ExternalPathRequest(BaseModel):
    """Request to add external project path."""

    path: str = Field(..., description="Path to project root (does not require .claude/)")


class MCPToggleRequest(BaseModel):
    """Request to toggle MCP server state."""

    enabled: bool = Field(..., description="Whether to enable the server")


class ProjectConfigResponse(BaseModel):
    """Response for project configs list."""

    projects: list[ProjectInfo]
    total_count: int
    total_skills: int
    total_agents: int
    total_mcp_servers: int


class SkillContentResponse(BaseModel):
    """Response for skill content."""

    skill: SkillConfig
    content: str = Field(..., description="Full SKILL.md content")
    references: list[str] = Field(default_factory=list, description="Reference file paths")


class AgentContentResponse(BaseModel):
    """Response for agent content."""

    agent: AgentConfig
    content: str = Field(..., description="Full agent.md content")


class CommandContentResponse(BaseModel):
    """Response for command content."""

    command: CommandConfig
    content: str = Field(..., description="Full command .md content")


# ========================================
# CRUD Request Models
# ========================================


class MCPServerUpdateRequest(BaseModel):
    """Request to update MCP server configuration."""

    command: str | None = Field(default=None, description="Command to run")
    args: list[str] | None = Field(default=None, description="Command arguments")
    env: dict[str, str] | None = Field(default=None, description="Environment variables")
    disabled: bool | None = Field(default=None, description="Whether server is disabled")
    note: str | None = Field(default=None, description="Note about the server")


class MCPServerCreateRequest(BaseModel):
    """Request to create a new MCP server."""

    server_id: str = Field(..., description="Server identifier (key in mcpServers)")
    command: str = Field(default="npx", description="Command to run")
    args: list[str] = Field(default_factory=list, description="Command arguments")
    env: dict[str, str] = Field(default_factory=dict, description="Environment variables")
    disabled: bool = Field(default=False, description="Whether server is disabled")
    note: str = Field(default="", description="Note about the server")


class SkillUpdateRequest(BaseModel):
    """Request to update skill content."""

    content: str = Field(..., description="Full SKILL.md content")


class SkillCreateRequest(BaseModel):
    """Request to create a new skill."""

    skill_id: str = Field(..., description="Skill identifier (directory name)")
    content: str = Field(..., description="SKILL.md content")


class AgentUpdateRequest(BaseModel):
    """Request to update agent content."""

    content: str = Field(..., description="Full agent.md content")


class AgentCreateRequest(BaseModel):
    """Request to create a new agent."""

    agent_id: str = Field(..., description="Agent identifier (filename without .md)")
    content: str = Field(..., description="Agent .md content")
    is_shared: bool = Field(default=False, description="Whether to create in shared/ directory")


class CommandUpdateRequest(BaseModel):
    """Request to update command content."""

    content: str = Field(..., description="Full command .md content")


class CommandCreateRequest(BaseModel):
    """Request to create a new command."""

    command_id: str = Field(..., description="Command identifier (filename without .md)")
    content: str = Field(..., description="Command .md content")


class HookEntryRequest(BaseModel):
    """Request to add a hook entry."""

    matcher: str = Field(default="*", description="Tool/event matcher pattern")
    hooks: list[dict[str, str]] = Field(..., description="List of hook definitions")


class HooksUpdateRequest(BaseModel):
    """Request to update entire hooks.json."""

    hooks: dict[str, list[dict]] = Field(..., description="Complete hooks configuration")


# ========================================
# Copy Request Models
# ========================================


class CopySkillRequest(BaseModel):
    """Request to copy skill to another project."""

    skill_id: str = Field(..., description="Skill identifier to copy")
    target_project_id: str = Field(..., description="Target project ID")


class CopyAgentRequest(BaseModel):
    """Request to copy agent to another project."""

    agent_id: str = Field(..., description="Agent identifier to copy")
    target_project_id: str = Field(..., description="Target project ID")


class CopyMCPRequest(BaseModel):
    """Request to copy MCP server to another project."""

    server_id: str = Field(..., description="MCP server identifier to copy")
    target_project_id: str = Field(..., description="Target project ID")


class CopyHookRequest(BaseModel):
    """Request to copy hook to another project."""

    event: str = Field(..., description="Hook event name")
    index: int = Field(..., description="Hook entry index")
    target_project_id: str = Field(..., description="Target project ID")


class CopyCommandRequest(BaseModel):
    """Request to copy command to another project."""

    command_id: str = Field(..., description="Command identifier to copy")
    target_project_id: str = Field(..., description="Target project ID")
