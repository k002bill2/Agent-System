"""MCP Manager - Model Context Protocol 서버 관리자.

외부 MCP 서버(파일시스템, GitHub, Playwright 등)를 연동하고
도구 호출을 라우팅합니다.
"""

import asyncio
import json
import subprocess
from collections.abc import Callable
from datetime import datetime

from utils.time import utcnow
from enum import Enum
from typing import Any

from pydantic import BaseModel, Field


class MCPServerType(str, Enum):
    """MCP 서버 타입."""

    FILESYSTEM = "filesystem"
    GITHUB = "github"
    PLAYWRIGHT = "playwright"
    SQLITE = "sqlite"
    CUSTOM = "custom"


class MCPServerStatus(str, Enum):
    """MCP 서버 상태."""

    STOPPED = "stopped"
    STARTING = "starting"
    RUNNING = "running"
    ERROR = "error"


class MCPToolSchema(BaseModel):
    """MCP 도구 스키마."""

    name: str
    description: str
    input_schema: dict[str, Any] = Field(default_factory=dict)


class MCPServerConfig(BaseModel):
    """MCP 서버 설정."""

    id: str
    type: MCPServerType
    name: str
    description: str = ""

    # 실행 설정
    command: str  # npx, uvx 등
    args: list[str] = Field(default_factory=list)
    env: dict[str, str] = Field(default_factory=dict)

    # 연결 설정
    transport: str = "stdio"  # stdio, sse, websocket

    # 권한
    allowed_tools: list[str] = Field(default_factory=list)  # 빈 리스트 = 모든 도구 허용

    # 메타
    auto_start: bool = False
    timeout_ms: int = 30000


class MCPServerInfo(BaseModel):
    """MCP 서버 정보."""

    config: MCPServerConfig
    status: MCPServerStatus = MCPServerStatus.STOPPED
    tools: list[MCPToolSchema] = Field(default_factory=list)
    pid: int | None = None
    started_at: datetime | None = None
    last_error: str | None = None


class MCPToolCall(BaseModel):
    """MCP 도구 호출 요청."""

    server_id: str
    tool_name: str
    arguments: dict[str, Any] = Field(default_factory=dict)
    timeout_ms: int = 30000


class MCPToolResult(BaseModel):
    """MCP 도구 호출 결과."""

    success: bool
    content: list[dict[str, Any]] = Field(default_factory=list)
    error: str | None = None
    execution_time_ms: int = 0


class MCPBatchToolCall(BaseModel):
    """MCP 배치 도구 호출 요청."""

    calls: list[MCPToolCall]
    max_concurrent: int = Field(default=3, ge=1, le=10, description="최대 동시 실행 수")


class MCPBatchToolResult(BaseModel):
    """MCP 배치 도구 호출 결과."""

    results: list[MCPToolResult] = Field(default_factory=list)
    total_execution_time_ms: int = 0
    success_count: int = 0
    failure_count: int = 0


# 기본 MCP 서버 설정
DEFAULT_MCP_SERVERS: list[MCPServerConfig] = [
    MCPServerConfig(
        id="filesystem",
        type=MCPServerType.FILESYSTEM,
        name="Filesystem MCP",
        description="파일 시스템 읽기/쓰기/검색",
        command="npx",
        args=["-y", "@modelcontextprotocol/server-filesystem", "."],
        allowed_tools=[
            "read_file",
            "read_multiple_files",
            "write_file",
            "list_directory",
            "search_files",
        ],
    ),
    MCPServerConfig(
        id="github",
        type=MCPServerType.GITHUB,
        name="GitHub MCP",
        description="GitHub 이슈, PR, 리포지토리 관리",
        command="npx",
        args=["-y", "@modelcontextprotocol/server-github"],
        env={"GITHUB_PERSONAL_ACCESS_TOKEN": "${GITHUB_TOKEN}"},
        allowed_tools=[
            "create_issue",
            "list_issues",
            "get_issue",
            "create_pull_request",
            "list_pull_requests",
            "search_repositories",
            "get_file_contents",
        ],
    ),
    MCPServerConfig(
        id="playwright",
        type=MCPServerType.PLAYWRIGHT,
        name="Playwright MCP",
        description="브라우저 자동화 및 스크린샷",
        command="npx",
        args=["-y", "@anthropic/mcp-server-playwright"],
        allowed_tools=[
            "browser_navigate",
            "browser_click",
            "browser_type",
            "browser_screenshot",
            "browser_evaluate",
        ],
    ),
]


class MCPManager:
    """
    MCP 서버 관리자.

    외부 MCP 서버들을 관리하고 도구 호출을 라우팅합니다.
    """

    def __init__(self):
        self._servers: dict[str, MCPServerInfo] = {}
        self._processes: dict[str, subprocess.Popen] = {}
        self._tool_handlers: dict[str, Callable] = {}
        self._initialized = False

    async def initialize(self, configs: list[MCPServerConfig] | None = None) -> None:
        """
        MCP Manager 초기화.

        Args:
            configs: MCP 서버 설정 목록 (None이면 기본 서버 사용)
        """
        if self._initialized:
            return

        configs = configs or DEFAULT_MCP_SERVERS

        for config in configs:
            self._servers[config.id] = MCPServerInfo(config=config)

        # 자동 시작 서버 시작
        for server_id, info in self._servers.items():
            if info.config.auto_start:
                await self.start_server(server_id)

        self._initialized = True

    async def shutdown(self) -> None:
        """모든 서버 종료."""
        for server_id in list(self._processes.keys()):
            await self.stop_server(server_id)
        self._initialized = False

    def register_server(self, config: MCPServerConfig) -> None:
        """새 MCP 서버 등록."""
        self._servers[config.id] = MCPServerInfo(config=config)

    def unregister_server(self, server_id: str) -> bool:
        """MCP 서버 등록 해제."""
        if server_id in self._servers:
            # 실행 중이면 먼저 종료
            if server_id in self._processes:
                asyncio.create_task(self.stop_server(server_id))
            del self._servers[server_id]
            return True
        return False

    def get_server(self, server_id: str) -> MCPServerInfo | None:
        """서버 정보 조회."""
        return self._servers.get(server_id)

    def get_all_servers(self) -> list[MCPServerInfo]:
        """모든 서버 정보 조회."""
        return list(self._servers.values())

    def get_running_servers(self) -> list[MCPServerInfo]:
        """실행 중인 서버만 조회."""
        return [s for s in self._servers.values() if s.status == MCPServerStatus.RUNNING]

    async def start_server(self, server_id: str) -> bool:
        """
        MCP 서버 시작.

        Args:
            server_id: 서버 ID

        Returns:
            성공 여부
        """
        info = self._servers.get(server_id)
        if not info:
            return False

        if info.status == MCPServerStatus.RUNNING:
            return True

        info.status = MCPServerStatus.STARTING

        try:
            # 환경 변수 준비
            import os

            env = os.environ.copy()
            for key, value in info.config.env.items():
                # ${VAR} 형식 치환
                if value.startswith("${") and value.endswith("}"):
                    env_key = value[2:-1]
                    env[key] = os.environ.get(env_key, "")
                else:
                    env[key] = value

            # 프로세스 시작
            cmd = [info.config.command] + info.config.args
            process = subprocess.Popen(
                cmd,
                stdin=subprocess.PIPE,
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                env=env,
                text=True,
            )

            self._processes[server_id] = process
            info.pid = process.pid
            info.status = MCPServerStatus.RUNNING
            info.started_at = utcnow()

            # 도구 목록 가져오기
            await self._fetch_tools(server_id)

            return True

        except Exception as e:
            info.status = MCPServerStatus.ERROR
            info.last_error = str(e)
            return False

    async def stop_server(self, server_id: str) -> bool:
        """
        MCP 서버 종료.

        Args:
            server_id: 서버 ID

        Returns:
            성공 여부
        """
        info = self._servers.get(server_id)
        if not info:
            return False

        if server_id in self._processes:
            try:
                process = self._processes[server_id]
                process.terminate()
                await asyncio.sleep(0.5)
                if process.poll() is None:
                    process.kill()
                del self._processes[server_id]
            except Exception:
                pass

        info.status = MCPServerStatus.STOPPED
        info.pid = None
        return True

    async def restart_server(self, server_id: str) -> bool:
        """서버 재시작."""
        await self.stop_server(server_id)
        return await self.start_server(server_id)

    async def _fetch_tools(self, server_id: str) -> None:
        """서버에서 도구 목록 가져오기."""
        info = self._servers.get(server_id)
        if not info or server_id not in self._processes:
            return

        try:
            # tools/list 요청 전송
            request = {
                "jsonrpc": "2.0",
                "id": 1,
                "method": "tools/list",
                "params": {},
            }

            response = await self._send_request(server_id, request)

            if response and "result" in response:
                tools_data = response["result"].get("tools", [])
                info.tools = [
                    MCPToolSchema(
                        name=t["name"],
                        description=t.get("description", ""),
                        input_schema=t.get("inputSchema", {}),
                    )
                    for t in tools_data
                ]

        except Exception as e:
            info.last_error = f"Failed to fetch tools: {str(e)}"

    async def _send_request(
        self,
        server_id: str,
        request: dict[str, Any],
        timeout_ms: int = 30000,
    ) -> dict[str, Any] | None:
        """MCP 서버에 요청 전송."""
        if server_id not in self._processes:
            return None

        process = self._processes[server_id]

        try:
            # JSON-RPC 요청 전송
            request_str = json.dumps(request) + "\n"
            process.stdin.write(request_str)
            process.stdin.flush()

            # 응답 대기
            loop = asyncio.get_event_loop()
            response_str = await asyncio.wait_for(
                loop.run_in_executor(None, process.stdout.readline),
                timeout=timeout_ms / 1000,
            )

            if response_str:
                return json.loads(response_str.strip())
            return None

        except TimeoutError:
            return None
        except Exception:
            return None

    async def call_tool(self, call: MCPToolCall) -> MCPToolResult:
        """
        MCP 도구 호출.

        Args:
            call: 도구 호출 요청

        Returns:
            도구 호출 결과
        """
        import time

        start_time = time.time()

        info = self._servers.get(call.server_id)
        if not info:
            return MCPToolResult(
                success=False,
                error=f"Server not found: {call.server_id}",
            )

        # 서버 상태 확인
        if info.status != MCPServerStatus.RUNNING:
            # 자동 시작 시도
            started = await self.start_server(call.server_id)
            if not started:
                return MCPToolResult(
                    success=False,
                    error=f"Failed to start server: {call.server_id}",
                )

        # 도구 권한 확인
        if info.config.allowed_tools and call.tool_name not in info.config.allowed_tools:
            return MCPToolResult(
                success=False,
                error=f"Tool not allowed: {call.tool_name}",
            )

        try:
            # tools/call 요청
            request = {
                "jsonrpc": "2.0",
                "id": 2,
                "method": "tools/call",
                "params": {
                    "name": call.tool_name,
                    "arguments": call.arguments,
                },
            }

            response = await self._send_request(
                call.server_id,
                request,
                call.timeout_ms,
            )

            execution_time = int((time.time() - start_time) * 1000)

            if response and "result" in response:
                result = response["result"]
                return MCPToolResult(
                    success=not result.get("isError", False),
                    content=result.get("content", []),
                    error=result.get("error"),
                    execution_time_ms=execution_time,
                )
            elif response and "error" in response:
                return MCPToolResult(
                    success=False,
                    error=response["error"].get("message", "Unknown error"),
                    execution_time_ms=execution_time,
                )
            else:
                return MCPToolResult(
                    success=False,
                    error="No response from server",
                    execution_time_ms=execution_time,
                )

        except Exception as e:
            execution_time = int((time.time() - start_time) * 1000)
            return MCPToolResult(
                success=False,
                error=str(e),
                execution_time_ms=execution_time,
            )

    def get_available_tools(self) -> dict[str, list[MCPToolSchema]]:
        """모든 사용 가능한 도구 조회."""
        tools: dict[str, list[MCPToolSchema]] = {}
        for server_id, info in self._servers.items():
            if info.tools:
                tools[server_id] = info.tools
        return tools

    def find_tool(self, tool_name: str) -> tuple[str, MCPToolSchema] | None:
        """
        도구 이름으로 서버 및 도구 정보 찾기.

        Args:
            tool_name: 도구 이름

        Returns:
            (서버 ID, 도구 스키마) 또는 None
        """
        for server_id, info in self._servers.items():
            for tool in info.tools:
                if tool.name == tool_name:
                    return (server_id, tool)
        return None

    async def call_tool_by_name(
        self,
        tool_name: str,
        arguments: dict[str, Any],
        timeout_ms: int = 30000,
    ) -> MCPToolResult:
        """
        도구 이름으로 직접 호출 (서버 자동 선택).

        Args:
            tool_name: 도구 이름
            arguments: 도구 인자
            timeout_ms: 타임아웃

        Returns:
            도구 호출 결과
        """
        result = self.find_tool(tool_name)
        if not result:
            return MCPToolResult(
                success=False,
                error=f"Tool not found: {tool_name}",
            )

        server_id, _ = result
        return await self.call_tool(
            MCPToolCall(
                server_id=server_id,
                tool_name=tool_name,
                arguments=arguments,
                timeout_ms=timeout_ms,
            )
        )

    async def call_tools_batch(self, batch_call: MCPBatchToolCall) -> MCPBatchToolResult:
        """
        다중 MCP 도구 병렬 호출.

        Args:
            batch_call: 배치 호출 요청 (도구 호출 목록 + 동시 실행 수)

        Returns:
            배치 호출 결과 (개별 결과 + 통계)
        """
        import time

        start_time = time.time()

        if not batch_call.calls:
            return MCPBatchToolResult(
                results=[],
                total_execution_time_ms=0,
                success_count=0,
                failure_count=0,
            )

        semaphore = asyncio.Semaphore(batch_call.max_concurrent)

        async def execute_with_semaphore(call: MCPToolCall) -> MCPToolResult:
            async with semaphore:
                try:
                    return await self.call_tool(call)
                except Exception as e:
                    return MCPToolResult(
                        success=False,
                        error=str(e),
                        execution_time_ms=0,
                    )

        # 모든 호출을 병렬 실행
        results = await asyncio.gather(
            *[execute_with_semaphore(call) for call in batch_call.calls],
            return_exceptions=True,
        )

        # 예외 처리 및 결과 변환
        processed_results: list[MCPToolResult] = []
        for result in results:
            if isinstance(result, Exception):
                processed_results.append(
                    MCPToolResult(
                        success=False,
                        error=str(result),
                        execution_time_ms=0,
                    )
                )
            else:
                processed_results.append(result)

        # 통계 계산
        total_execution_time = int((time.time() - start_time) * 1000)
        success_count = sum(1 for r in processed_results if r.success)
        failure_count = len(processed_results) - success_count

        return MCPBatchToolResult(
            results=processed_results,
            total_execution_time_ms=total_execution_time,
            success_count=success_count,
            failure_count=failure_count,
        )

    def get_stats(self) -> dict[str, Any]:
        """매니저 통계 반환."""
        servers = list(self._servers.values())
        return {
            "total_servers": len(servers),
            "running_servers": sum(1 for s in servers if s.status == MCPServerStatus.RUNNING),
            "total_tools": sum(len(s.tools) for s in servers),
            "servers": {
                s.config.id: {
                    "name": s.config.name,
                    "status": s.status.value,
                    "tool_count": len(s.tools),
                }
                for s in servers
            },
        }


# 싱글톤 인스턴스
_mcp_manager: MCPManager | None = None


async def get_mcp_manager() -> MCPManager:
    """MCP Manager 싱글톤 반환."""
    global _mcp_manager
    if _mcp_manager is None:
        _mcp_manager = MCPManager()
        await _mcp_manager.initialize()
    return _mcp_manager


def get_mcp_manager_sync() -> MCPManager:
    """동기 MCP Manager 반환 (초기화 안 됨)."""
    global _mcp_manager
    if _mcp_manager is None:
        _mcp_manager = MCPManager()
    return _mcp_manager
