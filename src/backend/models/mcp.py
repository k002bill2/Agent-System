"""MCP (Model Context Protocol) message models for Warp terminal integration."""

from enum import Enum
from typing import Any, Literal

from pydantic import BaseModel, Field


class MCPMessageType(str, Enum):
    """MCP message types."""

    # Lifecycle
    INITIALIZE = "initialize"
    INITIALIZED = "initialized"
    SHUTDOWN = "shutdown"

    # Tools
    TOOLS_LIST = "tools/list"
    TOOLS_CALL = "tools/call"

    # Resources
    RESOURCES_LIST = "resources/list"
    RESOURCES_READ = "resources/read"

    # Prompts
    PROMPTS_LIST = "prompts/list"
    PROMPTS_GET = "prompts/get"


class MCPToolDefinition(BaseModel):
    """MCP tool definition schema."""

    name: str
    description: str
    inputSchema: dict[str, Any] = Field(default_factory=dict)


class MCPToolCall(BaseModel):
    """MCP tool call request."""

    name: str
    arguments: dict[str, Any] = Field(default_factory=dict)


class MCPToolResult(BaseModel):
    """MCP tool call result."""

    content: list[dict[str, Any]]
    isError: bool = False


class MCPRequest(BaseModel):
    """MCP JSON-RPC request."""

    jsonrpc: Literal["2.0"] = "2.0"
    id: str | int
    method: str
    params: dict[str, Any] | None = None


class MCPResponse(BaseModel):
    """MCP JSON-RPC response."""

    jsonrpc: Literal["2.0"] = "2.0"
    id: str | int | None = None
    result: dict[str, Any] | None = None
    error: dict[str, Any] | None = None


class MCPNotification(BaseModel):
    """MCP JSON-RPC notification (no id, no response expected)."""

    jsonrpc: Literal["2.0"] = "2.0"
    method: str
    params: dict[str, Any] | None = None


class MCPServerInfo(BaseModel):
    """MCP server information."""

    name: str = "aos"
    version: str = "0.1.0"


class MCPCapabilities(BaseModel):
    """MCP server capabilities."""

    tools: dict[str, Any] | None = Field(default_factory=lambda: {"listChanged": True})
    resources: dict[str, Any] | None = None
    prompts: dict[str, Any] | None = None
    logging: dict[str, Any] | None = None


class MCPInitializeResult(BaseModel):
    """MCP initialize response result."""

    protocolVersion: str = "2024-11-05"
    serverInfo: MCPServerInfo = Field(default_factory=MCPServerInfo)
    capabilities: MCPCapabilities = Field(default_factory=MCPCapabilities)


# AOS-specific tool argument schemas
class CreateTaskArgs(BaseModel):
    """Arguments for aos_create_task tool."""

    project_id: str = Field(description="Project identifier (e.g., 'ppt-maker')")
    task: str = Field(description="Task description to execute")
    agent_type: str | None = Field(
        default=None, description="Specific agent type to use (e.g., 'web-ui-specialist')"
    )


class GetStatusArgs(BaseModel):
    """Arguments for aos_get_status tool."""

    session_id: str = Field(description="Session ID to check status")


class RunCheckArgs(BaseModel):
    """Arguments for aos_run_check tool."""

    project_id: str = Field(description="Project identifier")
    check_type: str = Field(
        default="all", description="Check type ID (project-specific, e.g. 'test', 'links') or 'all'"
    )


class ListAgentsArgs(BaseModel):
    """Arguments for aos_list_agents tool."""

    category: str | None = Field(
        default=None, description="Filter agents by category (e.g., 'development', 'orchestration')"
    )
