"""Tests for MCPService (MCP protocol handler)."""

import json
import pytest

from models.mcp import MCPRequest, MCPToolResult
from services.mcp_service import MCPService, get_mcp_service


@pytest.fixture
def mcp_service() -> MCPService:
    """Return a fresh MCPService instance for each test."""
    # Avoid using the global singleton to keep tests isolated
    return MCPService()


class TestToolDefinitions:
    """Tests for tool definition metadata."""

    def test_tool_definitions_basic_structure(self, mcp_service: MCPService) -> None:
        tools = mcp_service.get_tool_definitions()

        # We expect at least the core AOS tools to be present
        tool_names = {t.name for t in tools}
        assert {
            "aos_create_task",
            "aos_get_status",
            "aos_list_agents",
            "aos_run_check",
            "aos_list_projects",
        }.issubset(tool_names)

        # Each tool should have a non-empty description and input schema dict
        for tool in tools:
            assert isinstance(tool.description, str) and tool.description
            assert isinstance(tool.inputSchema, dict)


class TestHandleRequest:
    """Tests for high-level JSON-RPC request handling."""

    @pytest.mark.asyncio
    async def test_initialize_request_sets_initialized_flag(self, mcp_service: MCPService) -> None:
        req = MCPRequest(id=1, method="initialize", params={})

        resp = await mcp_service.handle_request(req)

        assert resp.error is None
        assert resp.result is not None
        assert mcp_service._initialized is True

    @pytest.mark.asyncio
    async def test_unknown_method_returns_method_not_found_error(self, mcp_service: MCPService) -> None:
        req = MCPRequest(id=2, method="unknown/method", params={})

        resp = await mcp_service.handle_request(req)

        assert resp.result is None
        assert resp.error is not None
        assert resp.error["code"] == -32601
        assert "Method not found" in resp.error["message"]

    @pytest.mark.asyncio
    async def test_internal_error_is_wrapped(self, mcp_service: MCPService, monkeypatch: pytest.MonkeyPatch) -> None:
        # Force _handle_initialize to raise to exercise the generic error handler
        def boom(_params: dict):  # type: ignore[override]
            raise RuntimeError("boom")

        monkeypatch.setattr(mcp_service, "_handle_initialize", boom)

        req = MCPRequest(id=3, method="initialize", params={})
        resp = await mcp_service.handle_request(req)

        assert resp.result is None
        assert resp.error is not None
        assert resp.error["code"] == -32603
        assert "Internal error" in resp.error["message"]

    @pytest.mark.asyncio
    async def test_tools_list_and_shutdown_roundtrip(self, mcp_service: MCPService) -> None:
        # tools/list
        tools_req = MCPRequest(id=4, method="tools/list", params={})
        tools_resp = await mcp_service.handle_request(tools_req)

        assert tools_resp.error is None
        assert tools_resp.result is not None
        assert "tools" in tools_resp.result
        assert isinstance(tools_resp.result["tools"], list)

        # shutdown
        shutdown_req = MCPRequest(id=5, method="shutdown", params={})
        shutdown_resp = await mcp_service.handle_request(shutdown_req)

        assert shutdown_resp.error is None
        assert shutdown_resp.result == {}
        assert mcp_service._initialized is False


class TestExecuteToolDispatch:
    """Tests for _execute_tool routing and error handling."""

    @pytest.mark.asyncio
    async def test_unknown_tool_returns_error_result(self, mcp_service: MCPService) -> None:
        result = await mcp_service._execute_tool("nonexistent_tool", {})

        assert isinstance(result, MCPToolResult)
        assert result.isError is True
        assert any("Unknown tool" in c.get("text", "") for c in result.content)

    @pytest.mark.asyncio
    async def test_execute_tool_wraps_exceptions(self, mcp_service: MCPService, monkeypatch: pytest.MonkeyPatch) -> None:
        async def boom(_args: dict):  # type: ignore[override]
            raise RuntimeError("tool failed")

        monkeypatch.setattr(mcp_service, "_tool_create_task", boom)

        result = await mcp_service._execute_tool("aos_create_task", {})

        assert result.isError is True
        assert any("Tool execution error" in c.get("text", "") for c in result.content)


class TestCreateTaskAndStatusTools:
    """Tests for aos_create_task and aos_get_status tools."""

    @pytest.mark.asyncio
    async def test_create_task_with_unknown_project_returns_error(
        self,
        mcp_service: MCPService,
        monkeypatch: pytest.MonkeyPatch,
    ) -> None:
        # Force get_project to return None
        monkeypatch.setattr("services.mcp_service.get_project", lambda _pid: None)
        monkeypatch.setattr("services.mcp_service.PROJECTS_REGISTRY", {}, raising=False)

        result = await mcp_service._tool_create_task(
            {"project_id": "missing", "task": "Do something"}
        )

        assert result.isError is True
        text = "\n".join(c.get("text", "") for c in result.content)
        assert "Project not found" in text

    @pytest.mark.asyncio
    async def test_create_task_stores_session_and_get_status_returns_json(
        self,
        mcp_service: MCPService,
        monkeypatch: pytest.MonkeyPatch,
    ) -> None:
        class DummyProject:
            def __init__(self) -> None:
                self.id = "demo"
                self.name = "Demo Project"
                self.path = "/tmp/demo-project"
                self.description = "Demo"
                self.claude_md = None

        dummy_project = DummyProject()

        # Patch project lookup/registry
        monkeypatch.setattr("services.mcp_service.get_project", lambda _pid: dummy_project)
        monkeypatch.setattr("services.mcp_service.PROJECTS_REGISTRY", {"demo": dummy_project}, raising=False)

        # Create task
        create_result = await mcp_service._tool_create_task(
            {"project_id": "demo", "task": "Run checks", "agent_type": "lead-orchestrator"}
        )

        assert create_result.isError is False
        text = "\n".join(c.get("text", "") for c in create_result.content)
        assert "Task created successfully" in text

        # Extract session id from stored tasks (there should be exactly one)
        assert len(mcp_service._session_tasks) == 1
        session_id = next(iter(mcp_service._session_tasks.keys()))
        assert len(session_id) == 8  # short id boundary condition

        # Now query status
        status_result = await mcp_service._tool_get_status({"session_id": session_id})
        assert status_result.isError is False

        # Stored JSON should be parseable and contain the same fields
        status_text = "\n".join(c.get("text", "") for c in status_result.content)
        payload = json.loads(status_text)
        assert payload["project_id"] == "demo"
        assert payload["task"] == "Run checks"
        assert payload["agent_type"] == "lead-orchestrator"
        assert payload["status"] == "created"
        assert payload["project_path"] == dummy_project.path

    @pytest.mark.asyncio
    async def test_get_status_for_unknown_session_returns_error(
        self, mcp_service: MCPService
    ) -> None:
        result = await mcp_service._tool_get_status({"session_id": "nope"})

        assert result.isError is True
        text = "\n".join(c.get("text", "") for c in result.content)
        assert "Session not found" in text


class TestListAgentsTool:
    """Tests for aos_list_agents tool behaviour."""

    @pytest.mark.asyncio
    async def test_list_agents_without_category_returns_all(self, mcp_service: MCPService) -> None:
        result = await mcp_service._tool_list_agents({})

        assert result.isError is False
        text = "\n".join(c.get("text", "") for c in result.content)
        data = json.loads(text)

        # We should have both categories by default
        assert "development" in data
        assert "orchestration" in data
        assert len(data["development"]) >= 1
        assert len(data["orchestration"]) >= 1

    @pytest.mark.asyncio
    async def test_list_agents_with_category_filters_result(self, mcp_service: MCPService) -> None:
        result = await mcp_service._tool_list_agents({"category": "development"})

        assert result.isError is False
        text = "\n".join(c.get("text", "") for c in result.content)
        data = json.loads(text)

        assert list(data.keys()) == ["development"]
        assert len(data["development"]) >= 1


class TestRunCheckTool:
    """Tests for aos_run_check tool including edge cases."""

    @pytest.mark.asyncio
    async def test_run_check_unknown_project_returns_error(
        self, mcp_service: MCPService, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        monkeypatch.setattr("services.mcp_service.get_project", lambda _pid: None)

        result = await mcp_service._tool_run_check({"project_id": "missing", "check_type": "all"})

        assert result.isError is True
        text = "\n".join(c.get("text", "") for c in result.content)
        assert "Project not found" in text

    @pytest.mark.asyncio
    async def test_run_check_invalid_check_type_returns_error(
        self, mcp_service: MCPService, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        class DummyProject:
            def __init__(self) -> None:
                self.id = "demo"
                self.name = "Demo"
                self.path = "/tmp/demo"
                self.description = "Demo"
                self.claude_md = None

        dummy_project = DummyProject()
        monkeypatch.setattr("services.mcp_service.get_project", lambda _pid: dummy_project)

        class DummyRunner:
            async def run_check(self, check_type):  # type: ignore[no-untyped-def]
                raise AssertionError("run_check should not be called for invalid check type")

        # Patch get_runner so we don't touch the real filesystem when constructing ProjectRunner
        monkeypatch.setattr("services.mcp_service.get_runner", lambda _path: DummyRunner())

        result = await mcp_service._tool_run_check({"project_id": "demo", "check_type": "not-a-check"})

        assert result.isError is True
        text = "\n".join(c.get("text", "") for c in result.content)
        assert "Invalid check type" in text

    @pytest.mark.asyncio
    async def test_run_check_all_types_aggregates_results(
        self, mcp_service: MCPService, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        class DummyProject:
            def __init__(self) -> None:
                self.id = "demo"
                self.name = "Demo"
                self.path = "/tmp/demo"
                self.description = "Demo"
                self.claude_md = None

        dummy_project = DummyProject()
        monkeypatch.setattr("services.mcp_service.get_project", lambda _pid: dummy_project)

        class DummyRunner:
            async def run_check(self, check_type):  # type: ignore[no-untyped-def]
                # status is already a string because CheckResult uses use_enum_values=True
                return type(
                    "R",
                    (),
                    {"status": "success", "duration_ms": 123, "stderr": ""},
                )()

        monkeypatch.setattr("services.mcp_service.get_runner", lambda _path: DummyRunner())

        result = await mcp_service._tool_run_check({"project_id": "demo", "check_type": "all"})

        assert result.isError is False
        text = "\n".join(c.get("text", "") for c in result.content)
        # We should see all four check types mentioned in the summary
        assert "typecheck" in text
        assert "lint" in text
        assert "test" in text
        assert "build" in text
        assert "Overall: ✅ All passed" in text

    @pytest.mark.asyncio
    async def test_run_check_marks_failure_when_any_check_fails(
        self, mcp_service: MCPService, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        class DummyProject:
            def __init__(self) -> None:
                self.id = "demo"
                self.name = "Demo"
                self.path = "/tmp/demo"
                self.description = "Demo"
                self.claude_md = None

        dummy_project = DummyProject()
        monkeypatch.setattr("services.mcp_service.get_project", lambda _pid: dummy_project)

        statuses = ["success", "failure", "success", "success"]

        class DummyRunner:
            def __init__(self) -> None:
                self._idx = 0

            async def run_check(self, check_type):  # type: ignore[no-untyped-def]
                status = statuses[self._idx]
                self._idx += 1
                return type(
                    "R",
                    (),
                    {"status": status, "duration_ms": 50, "stderr": "boom" if status != "success" else ""},
                )()

        monkeypatch.setattr("services.mcp_service.get_runner", lambda _path: DummyRunner())

        result = await mcp_service._tool_run_check({"project_id": "demo", "check_type": "all"})

        assert result.isError is True
        text = "\n".join(c.get("text", "") for c in result.content)
        assert "Some checks failed" in text
        assert "Error: boom" in text


class TestListProjectsTool:
    """Tests for aos_list_projects tool."""

    @pytest.mark.asyncio
    async def test_list_projects_when_empty_returns_message(
        self, mcp_service: MCPService, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        monkeypatch.setattr("services.mcp_service.list_projects", lambda: [])

        result = await mcp_service._tool_list_projects({})

        assert result.isError is False
        text = "\n".join(c.get("text", "") for c in result.content)
        assert "No projects registered" in text

    @pytest.mark.asyncio
    async def test_list_projects_returns_serialized_projects(
        self, mcp_service: MCPService, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        class DummyProject:
            def __init__(self, pid: str, name: str) -> None:
                self.id = pid
                self.name = name
                self.path = f"/projects/{pid}"
                self.description = f"Desc {pid}"
                self.claude_md = "README.md"

        projects = [DummyProject("p1", "Proj1"), DummyProject("p2", "Proj2")]
        monkeypatch.setattr("services.mcp_service.list_projects", lambda: projects)

        result = await mcp_service._tool_list_projects({})

        assert result.isError is False
        text = "\n".join(c.get("text", "") for c in result.content)
        data = json.loads(text)

        assert isinstance(data, list)
        assert {p["id"] for p in data} == {"p1", "p2"}
        assert all(isinstance(p["has_claude_md"], bool) for p in data)


class TestSSEHelpers:
    """Tests for SSE helper methods."""

    def test_create_sse_event_formats_correctly(self, mcp_service: MCPService) -> None:
        payload = {"url": "/mcp/messages"}
        event = mcp_service.create_sse_event("endpoint", payload)

        # Basic structure: event line, data line, blank line
        assert event.startswith("event: endpoint\n")
        assert "data: " in event
        assert event.endswith("\n\n")

        # JSON must be parseable
        data_part = event.split("data: ", 1)[1].strip()
        json.loads(data_part)

    @pytest.mark.asyncio
    async def test_generate_sse_stream_yields_endpoint_event(self, mcp_service: MCPService) -> None:
        events = [e async for e in mcp_service.generate_sse_stream()]

        assert len(events) == 1
        assert "event: endpoint" in events[0]
        assert "/mcp/messages" in events[0]
