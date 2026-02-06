"""MCP (Model Context Protocol) service for Warp terminal integration."""

import json
import uuid
from collections.abc import AsyncIterator
from typing import Any

from models.mcp import (
    MCPInitializeResult,
    MCPRequest,
    MCPResponse,
    MCPToolDefinition,
    MCPToolResult,
)
from models.monitoring import CheckType
from models.project import PROJECTS_REGISTRY, get_project, list_projects
from services.project_runner import get_runner


class MCPService:
    """MCP protocol handler service."""

    def __init__(self):
        """Initialize MCP service."""
        self._initialized = False
        self._session_tasks: dict[str, dict] = {}  # session_id -> task info

    def get_tool_definitions(self) -> list[MCPToolDefinition]:
        """Return available AOS tools for MCP clients."""
        return [
            MCPToolDefinition(
                name="aos_create_task",
                description="Create and execute a new task in AOS orchestration system",
                inputSchema={
                    "type": "object",
                    "properties": {
                        "project_id": {
                            "type": "string",
                            "description": "Project identifier (e.g., 'ppt-maker')"
                        },
                        "task": {
                            "type": "string",
                            "description": "Task description to execute"
                        },
                        "agent_type": {
                            "type": "string",
                            "description": "Specific agent type (optional)"
                        }
                    },
                    "required": ["project_id", "task"]
                }
            ),
            MCPToolDefinition(
                name="aos_get_status",
                description="Get status of an AOS session or task",
                inputSchema={
                    "type": "object",
                    "properties": {
                        "session_id": {
                            "type": "string",
                            "description": "Session ID to check"
                        }
                    },
                    "required": ["session_id"]
                }
            ),
            MCPToolDefinition(
                name="aos_list_agents",
                description="List available agents in AOS system",
                inputSchema={
                    "type": "object",
                    "properties": {
                        "category": {
                            "type": "string",
                            "description": "Filter by category (development, orchestration)"
                        }
                    }
                }
            ),
            MCPToolDefinition(
                name="aos_run_check",
                description="Run project verification checks (typecheck, lint, test, build)",
                inputSchema={
                    "type": "object",
                    "properties": {
                        "project_id": {
                            "type": "string",
                            "description": "Project identifier"
                        },
                        "check_type": {
                            "type": "string",
                            "enum": ["typecheck", "lint", "test", "build", "all"],
                            "description": "Type of check to run"
                        }
                    },
                    "required": ["project_id"]
                }
            ),
            MCPToolDefinition(
                name="aos_list_projects",
                description="List all registered projects in AOS",
                inputSchema={
                    "type": "object",
                    "properties": {}
                }
            ),
        ]

    async def handle_request(self, request: MCPRequest) -> MCPResponse:
        """Handle incoming MCP request and return response."""
        method = request.method
        params = request.params or {}

        try:
            if method == "initialize":
                result = self._handle_initialize(params)
            elif method == "tools/list":
                result = self._handle_tools_list()
            elif method == "tools/call":
                result = await self._handle_tools_call(params)
            elif method == "resources/list":
                result = self._handle_resources_list()
            elif method == "prompts/list":
                result = self._handle_prompts_list()
            elif method == "shutdown":
                result = self._handle_shutdown()
            else:
                return MCPResponse(
                    id=request.id,
                    error={
                        "code": -32601,
                        "message": f"Method not found: {method}"
                    }
                )

            return MCPResponse(id=request.id, result=result)

        except Exception as e:
            return MCPResponse(
                id=request.id,
                error={
                    "code": -32603,
                    "message": f"Internal error: {str(e)}"
                }
            )

    def _handle_initialize(self, params: dict[str, Any]) -> dict[str, Any]:
        """Handle initialize request."""
        self._initialized = True
        init_result = MCPInitializeResult()
        return init_result.model_dump()

    def _handle_tools_list(self) -> dict[str, Any]:
        """Handle tools/list request."""
        tools = self.get_tool_definitions()
        return {
            "tools": [tool.model_dump() for tool in tools]
        }

    async def _handle_tools_call(self, params: dict[str, Any]) -> dict[str, Any]:
        """Handle tools/call request."""
        name = params.get("name")
        arguments = params.get("arguments", {})

        result = await self._execute_tool(name, arguments)
        return result.model_dump()

    async def _execute_tool(self, name: str, arguments: dict[str, Any]) -> MCPToolResult:
        """Execute a tool and return result."""
        try:
            if name == "aos_create_task":
                return await self._tool_create_task(arguments)
            elif name == "aos_get_status":
                return await self._tool_get_status(arguments)
            elif name == "aos_list_agents":
                return await self._tool_list_agents(arguments)
            elif name == "aos_run_check":
                return await self._tool_run_check(arguments)
            elif name == "aos_list_projects":
                return await self._tool_list_projects(arguments)
            else:
                return MCPToolResult(
                    content=[{"type": "text", "text": f"Unknown tool: {name}"}],
                    isError=True
                )
        except Exception as e:
            return MCPToolResult(
                content=[{"type": "text", "text": f"Tool execution error: {str(e)}"}],
                isError=True
            )

    async def _tool_create_task(self, args: dict[str, Any]) -> MCPToolResult:
        """Create a new task in AOS."""
        project_id = args.get("project_id")
        task = args.get("task")
        agent_type = args.get("agent_type")

        # Validate project exists
        project = get_project(project_id)
        if not project:
            return MCPToolResult(
                content=[{
                    "type": "text",
                    "text": f"Project not found: {project_id}. Available: {list(PROJECTS_REGISTRY.keys())}"
                }],
                isError=True
            )

        # Generate session ID
        session_id = str(uuid.uuid4())[:8]

        # Store task info
        self._session_tasks[session_id] = {
            "project_id": project_id,
            "task": task,
            "agent_type": agent_type,
            "status": "created",
            "project_path": project.path,
        }

        result_text = f"""Task created successfully!
- Session ID: {session_id}
- Project: {project.name} ({project_id})
- Task: {task}
- Agent: {agent_type or 'auto-select'}

To track progress, use aos_get_status with session_id: {session_id}"""

        return MCPToolResult(
            content=[{"type": "text", "text": result_text}]
        )

    async def _tool_get_status(self, args: dict[str, Any]) -> MCPToolResult:
        """Get status of a session."""
        session_id = args.get("session_id")

        if session_id not in self._session_tasks:
            return MCPToolResult(
                content=[{
                    "type": "text",
                    "text": f"Session not found: {session_id}"
                }],
                isError=True
            )

        task_info = self._session_tasks[session_id]
        return MCPToolResult(
            content=[{
                "type": "text",
                "text": json.dumps(task_info, indent=2)
            }]
        )

    async def _tool_list_agents(self, args: dict[str, Any]) -> MCPToolResult:
        """List available agents."""
        category = args.get("category")

        agents = {
            "development": [
                {
                    "name": "web-ui-specialist",
                    "model": "sonnet",
                    "description": "Web UI/UX expert"
                },
                {
                    "name": "backend-integration-specialist",
                    "model": "sonnet",
                    "description": "Firebase, API integration"
                },
                {
                    "name": "performance-optimizer",
                    "model": "sonnet",
                    "description": "Performance optimization"
                },
                {
                    "name": "test-automation-specialist",
                    "model": "sonnet",
                    "description": "Test automation"
                },
            ],
            "orchestration": [
                {
                    "name": "lead-orchestrator",
                    "model": "sonnet",
                    "description": "Multi-agent workflow coordination"
                },
                {
                    "name": "code-simplifier",
                    "model": "sonnet",
                    "description": "Code complexity analysis"
                },
                {
                    "name": "quality-validator",
                    "model": "sonnet",
                    "description": "Quality verification"
                },
            ]
        }

        if category and category in agents:
            result = {category: agents[category]}
        else:
            result = agents

        return MCPToolResult(
            content=[{
                "type": "text",
                "text": json.dumps(result, indent=2)
            }]
        )

    async def _tool_run_check(self, args: dict[str, Any]) -> MCPToolResult:
        """Run project checks."""
        project_id = args.get("project_id")
        check_type_str = args.get("check_type", "all")

        # Validate project
        project = get_project(project_id)
        if not project:
            return MCPToolResult(
                content=[{
                    "type": "text",
                    "text": f"Project not found: {project_id}"
                }],
                isError=True
            )

        # Map check type string to enum
        check_type_map = {
            "typecheck": CheckType.TYPECHECK,
            "lint": CheckType.LINT,
            "test": CheckType.TEST,
            "build": CheckType.BUILD,
        }

        runner = get_runner(project.path)
        results = []

        if check_type_str == "all":
            check_types = list(check_type_map.values())
        else:
            if check_type_str not in check_type_map:
                return MCPToolResult(
                    content=[{
                        "type": "text",
                        "text": f"Invalid check type: {check_type_str}"
                    }],
                    isError=True
                )
            check_types = [check_type_map[check_type_str]]

        # Run checks
        all_success = True
        output_lines = [f"Running checks for {project.name}...\n"]

        for check_type in check_types:
            result = await runner.run_check(check_type)
            # CheckResult uses use_enum_values=True, so status is already a string
            status_str = str(result.status)
            is_success = status_str == "success"
            status_icon = "✅" if is_success else "❌"
            # Use .value for clean enum display
            check_name = check_type.value if hasattr(check_type, 'value') else str(check_type)
            output_lines.append(f"{status_icon} {check_name}: {status_str} ({result.duration_ms}ms)")

            if not is_success:
                all_success = False
                if result.stderr:
                    output_lines.append(f"   Error: {result.stderr[:500]}")

            results.append({
                "type": check_name,
                "status": status_str,
                "duration_ms": result.duration_ms,
            })

        output_lines.append(f"\nOverall: {'✅ All passed' if all_success else '❌ Some checks failed'}")

        return MCPToolResult(
            content=[{
                "type": "text",
                "text": "\n".join(output_lines)
            }],
            isError=not all_success
        )

    async def _tool_list_projects(self, args: dict[str, Any]) -> MCPToolResult:
        """List all registered projects."""
        projects = list_projects()

        if not projects:
            return MCPToolResult(
                content=[{
                    "type": "text",
                    "text": "No projects registered. Add projects to the projects/ directory."
                }]
            )

        result = []
        for p in projects:
            result.append({
                "id": p.id,
                "name": p.name,
                "path": p.path,
                "description": p.description,
                "has_claude_md": p.claude_md is not None,
            })

        return MCPToolResult(
            content=[{
                "type": "text",
                "text": json.dumps(result, indent=2)
            }]
        )

    def _handle_resources_list(self) -> dict[str, Any]:
        """Handle resources/list request."""
        return {"resources": []}

    def _handle_prompts_list(self) -> dict[str, Any]:
        """Handle prompts/list request."""
        return {"prompts": []}

    def _handle_shutdown(self) -> dict[str, Any]:
        """Handle shutdown request."""
        self._initialized = False
        return {}

    def create_sse_event(self, event_type: str, data: dict[str, Any]) -> str:
        """Create SSE formatted event."""
        return f"event: {event_type}\ndata: {json.dumps(data)}\n\n"

    async def generate_sse_stream(self) -> AsyncIterator[str]:
        """Generate SSE stream for MCP connection."""
        # Send endpoint info
        yield self.create_sse_event("endpoint", {
            "url": "/mcp/messages"
        })


# Global service instance
_mcp_service: MCPService | None = None


def get_mcp_service() -> MCPService:
    """Get or create MCP service instance."""
    global _mcp_service
    if _mcp_service is None:
        _mcp_service = MCPService()
    return _mcp_service
