"""Tests for MCP Manager."""

import pytest
from unittest.mock import AsyncMock, patch, MagicMock

from services.mcp_manager import (
    MCPManager,
    MCPServerConfig,
    MCPServerType,
    MCPServerStatus,
    MCPToolCall,
    MCPToolResult,
    MCPToolSchema,
    get_mcp_manager_sync,
)


class TestMCPManager:
    """MCP Manager 테스트."""

    def setup_method(self):
        """테스트 전 매니저 생성."""
        self.manager = MCPManager()

    def test_initialization(self):
        """초기화 테스트."""
        assert self.manager._initialized is False
        assert len(self.manager._servers) == 0

    @pytest.mark.asyncio
    async def test_initialize_with_default_servers(self):
        """기본 서버로 초기화."""
        await self.manager.initialize()

        assert self.manager._initialized is True
        assert len(self.manager._servers) >= 3  # filesystem, github, playwright

    @pytest.mark.asyncio
    async def test_register_custom_server(self):
        """커스텀 서버 등록."""
        config = MCPServerConfig(
            id="custom-server",
            type=MCPServerType.CUSTOM,
            name="Custom MCP Server",
            description="A custom MCP server",
            command="node",
            args=["custom-server.js"],
        )

        self.manager.register_server(config)

        server = self.manager.get_server("custom-server")
        assert server is not None
        assert server.config.name == "Custom MCP Server"

    def test_unregister_server(self):
        """서버 등록 해제."""
        config = MCPServerConfig(
            id="temp-server",
            type=MCPServerType.CUSTOM,
            name="Temp Server",
            command="node",
            args=["temp.js"],
        )

        self.manager.register_server(config)
        assert self.manager.get_server("temp-server") is not None

        result = self.manager.unregister_server("temp-server")
        assert result is True
        assert self.manager.get_server("temp-server") is None

    def test_get_all_servers(self):
        """모든 서버 조회."""
        config1 = MCPServerConfig(
            id="server1", type=MCPServerType.CUSTOM, name="Server 1", command="cmd"
        )
        config2 = MCPServerConfig(
            id="server2", type=MCPServerType.CUSTOM, name="Server 2", command="cmd"
        )

        self.manager.register_server(config1)
        self.manager.register_server(config2)

        servers = self.manager.get_all_servers()
        assert len(servers) == 2

    def test_get_running_servers(self):
        """실행 중인 서버만 조회."""
        config = MCPServerConfig(
            id="test-server",
            type=MCPServerType.CUSTOM,
            name="Test Server",
            command="cmd",
        )

        self.manager.register_server(config)

        # 초기에는 실행 중인 서버 없음
        running = self.manager.get_running_servers()
        assert len(running) == 0

    def test_find_tool(self):
        """도구 검색."""
        config = MCPServerConfig(
            id="tool-server",
            type=MCPServerType.CUSTOM,
            name="Tool Server",
            command="cmd",
        )

        self.manager.register_server(config)

        # 도구 추가 (수동으로 테스트용)
        server_info = self.manager.get_server("tool-server")
        server_info.tools = [
            MCPToolSchema(name="read_file", description="Read a file"),
            MCPToolSchema(name="write_file", description="Write a file"),
        ]

        result = self.manager.find_tool("read_file")
        assert result is not None
        assert result[0] == "tool-server"
        assert result[1].name == "read_file"

    def test_get_available_tools(self):
        """사용 가능한 도구 조회."""
        config = MCPServerConfig(
            id="tools-server",
            type=MCPServerType.CUSTOM,
            name="Tools Server",
            command="cmd",
        )

        self.manager.register_server(config)

        # 도구 추가
        server_info = self.manager.get_server("tools-server")
        server_info.tools = [
            MCPToolSchema(name="tool1", description="Tool 1"),
            MCPToolSchema(name="tool2", description="Tool 2"),
        ]

        tools = self.manager.get_available_tools()
        assert "tools-server" in tools
        assert len(tools["tools-server"]) == 2

    def test_get_stats(self):
        """매니저 통계 조회."""
        config = MCPServerConfig(
            id="stats-server",
            type=MCPServerType.CUSTOM,
            name="Stats Server",
            command="cmd",
        )

        self.manager.register_server(config)

        stats = self.manager.get_stats()
        assert "total_servers" in stats
        assert "running_servers" in stats
        assert "total_tools" in stats
        assert stats["total_servers"] == 1
        assert stats["running_servers"] == 0


class TestMCPServerConfig:
    """MCPServerConfig 모델 테스트."""

    def test_default_values(self):
        """기본값 테스트."""
        config = MCPServerConfig(
            id="test",
            type=MCPServerType.CUSTOM,
            name="Test",
            command="cmd",
        )

        assert config.transport == "stdio"
        assert config.auto_start is False
        assert config.timeout_ms == 30000
        assert config.env == {}
        assert config.args == []

    def test_with_all_options(self):
        """모든 옵션 설정."""
        config = MCPServerConfig(
            id="full-config",
            type=MCPServerType.GITHUB,
            name="Full Config",
            description="Fully configured server",
            command="npx",
            args=["-y", "server"],
            env={"API_KEY": "secret"},
            transport="stdio",
            allowed_tools=["tool1", "tool2"],
            auto_start=True,
            timeout_ms=60000,
        )

        assert config.auto_start is True
        assert config.timeout_ms == 60000
        assert len(config.allowed_tools) == 2


class TestMCPToolCall:
    """MCPToolCall 모델 테스트."""

    def test_creation(self):
        """생성 테스트."""
        call = MCPToolCall(
            server_id="test-server",
            tool_name="read_file",
            arguments={"path": "/test/file.txt"},
        )

        assert call.server_id == "test-server"
        assert call.tool_name == "read_file"
        assert call.arguments["path"] == "/test/file.txt"
        assert call.timeout_ms == 30000


class TestMCPToolResult:
    """MCPToolResult 모델 테스트."""

    def test_success_result(self):
        """성공 결과 테스트."""
        result = MCPToolResult(
            success=True,
            content=[{"type": "text", "text": "File content"}],
            execution_time_ms=100,
        )

        assert result.success is True
        assert len(result.content) == 1
        assert result.error is None

    def test_error_result(self):
        """실패 결과 테스트."""
        result = MCPToolResult(
            success=False,
            error="File not found",
            execution_time_ms=50,
        )

        assert result.success is False
        assert result.error == "File not found"
        assert len(result.content) == 0


class TestMCPServerType:
    """MCPServerType enum 테스트."""

    def test_server_types(self):
        """서버 타입 값 확인."""
        assert MCPServerType.FILESYSTEM.value == "filesystem"
        assert MCPServerType.GITHUB.value == "github"
        assert MCPServerType.PLAYWRIGHT.value == "playwright"
        assert MCPServerType.CUSTOM.value == "custom"


class TestMCPServerStatus:
    """MCPServerStatus enum 테스트."""

    def test_server_statuses(self):
        """서버 상태 값 확인."""
        assert MCPServerStatus.STOPPED.value == "stopped"
        assert MCPServerStatus.STARTING.value == "starting"
        assert MCPServerStatus.RUNNING.value == "running"
        assert MCPServerStatus.ERROR.value == "error"
