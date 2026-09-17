"""MCP Manager - Model Context Protocol 서버 관리자.

외부 MCP 서버(파일시스템, GitHub, Playwright 등)를 연동하고
도구 호출을 라우팅합니다.

**Admission 게이트**: `start_server()` 는 설정의 command/args/env 로 subprocess 를
띄우므로, 외부 MCP 를 등록하는 것은 곧 임의 코드 실행을 허용하는 일이다. 그래서
`_servers` 로 들어가는 두 경로(`register_server`·`initialize`)와 프로세스를 띄우는
경로(`start_server`)가 모두 `services.mcp_admission` 의 fail-closed 게이트를 지난다.
built-in 기본 서버는 **fingerprint** 로 신뢰 앵커에 등록돼 기존 동작이 보존된다
(id 만 같은 가짜는 통과하지 못한다). 운영 절차는 docs/mcp-admission.md 참조.
"""

import asyncio
import json
import logging
import os
import subprocess
from collections.abc import Callable, Mapping
from datetime import datetime
from enum import Enum
from types import MappingProxyType
from typing import Any

from pydantic import BaseModel, Field

from services.mcp_admission import (
    AdmissionDecision,
    AdmissionGate,
    FileEvidenceStore,
    InMemoryEvidenceStore,
    MCPAdmissionError,
)
from services.skillspector_adapter import verify_evidence_binding
from utils.time import utcnow

logger = logging.getLogger(__name__)

#: 증빙 저장 파일 경로. 미설정이면 in-memory 저장소 = 외부 MCP 전부 거부(fail closed).
EVIDENCE_PATH_ENV = "AOS_MCP_ADMISSION_EVIDENCE"


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
        args=["-y", "@playwright/mcp@latest"],
        allowed_tools=[
            "browser_navigate",
            "browser_click",
            "browser_type",
            "browser_screenshot",
            "browser_evaluate",
        ],
    ),
]


#: 검토를 거쳐 **소스에 못 박은** built-in 신뢰 앵커 (id → fingerprint).
#:
#: `DEFAULT_MCP_SERVERS` 에서 파생하지 않는다. 파생하면 목록에 한 줄 추가하는 것이
#: 곧 무증빙 실행 권한 부여가 되고, 커버리지 테스트는 양변이 같은 소스를 읽어
#: 영원히 통과한다(자기 갱신). 여기 없는 후보는 기본 서버와 모양이 같아도 증빙을
#: 요구받는다.
#:
#: 기본 서버의 패키지·인자·env 를 바꾸면 이 값도 **의도적으로** 갱신해야 한다:
#:   cd src/backend && uv run python -c "from services.mcp_manager import \
#:     DEFAULT_MCP_SERVERS as D; from services.mcp_admission import \
#:     compute_candidate_fingerprint as f; print({c.id: f(c) for c in D})"
#: 갱신하지 않으면 test_pinned_trust_anchors_match_the_current_default_servers 가
#: RED 가 된다 — 그 diff 가 곧 리뷰 지점이다.
BUILTIN_TRUST_ANCHORS: Mapping[str, str] = MappingProxyType(
    {
        "filesystem": "a549f64b79fa212874648b9db9f683a3bb0b1d4db3ffe8e5dbb36b42b1700230",
        "github": "1951b72a109cb8373902bf75ef825e6998ff00a75cc01da29aa21cf7ef0c3d67",
        "playwright": "2a9c1c8979679cc970c4b769b63369321dc75cc4838cc85c8682610437335f9d",
    }
)


def builtin_trusted_fingerprints() -> frozenset[str]:
    """검토되어 못 박힌 신뢰 앵커의 fingerprint 집합.

    id 가 아니라 fingerprint 를 신뢰한다 — `id="filesystem"` 을 달고 `command="curl"`
    로 바꾼 후보는 앵커에 걸리지 않아 증빙 없이는 등록되지 않는다. 마찬가지로
    `DEFAULT_MCP_SERVERS` 에 항목이 늘거나 바뀌어도 앵커는 따라 늘지 않는다.
    """
    return frozenset(BUILTIN_TRUST_ANCHORS.values())


def default_admission_gate() -> AdmissionGate:
    """기본 게이트: built-in 신뢰 + `EVIDENCE_PATH_ENV` 파일 저장소(없으면 in-memory)."""
    path = os.getenv(EVIDENCE_PATH_ENV, "").strip()
    store = FileEvidenceStore(path) if path else InMemoryEvidenceStore()
    return AdmissionGate(store=store, trusted_fingerprints=builtin_trusted_fingerprints())


class MCPManager:
    """
    MCP 서버 관리자.

    외부 MCP 서버들을 관리하고 도구 호출을 라우팅합니다.

    Args:
        admission_gate: 등록·기동 전에 증빙을 확인하는 게이트. None 이면
            `default_admission_gate()` — built-in 만 통과하고 외부는 전부 거부한다.
    """

    def __init__(self, admission_gate: AdmissionGate | None = None):
        self._servers: dict[str, MCPServerInfo] = {}
        self._processes: dict[str, subprocess.Popen] = {}
        self._tool_handlers: dict[str, Callable] = {}
        self._initialized = False
        self._admission = admission_gate if admission_gate is not None else default_admission_gate()
        self._rejected: dict[str, AdmissionDecision] = {}

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
            decision = self._admission.decide(config)
            if not decision.allowed:
                # 조용히 건너뛰지 않는다 — 사유는 get_rejected_candidates() 로 조회된다.
                self._rejected[config.id] = decision
                logger.warning(
                    "MCP admission denied at initialize: %s [%s] %s",
                    config.id,
                    decision.code.value if decision.code else "unknown",
                    decision.reason,
                )
                continue
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
        """새 MCP 서버 등록.

        Raises:
            MCPAdmissionError: 승인 증빙이 없거나 후보와 불일치/만료/실패인 경우.
                거부된 후보는 `_servers` 에 남지 않는다 — 나중에 start 로 되살릴 수 없다.
        """
        self._admission.authorize(config)
        self._rejected.pop(config.id, None)
        self._servers[config.id] = MCPServerInfo(config=config)

    def _scanned_source_problem(self, server_id: str) -> str | None:
        """스캐너 증빙이 가리키는 소스가 지금도 그때 그 내용인가 (아니면 사유).

        증빙이 없거나(built-in 신뢰 앵커) 소스 결속을 주장하지 않는 증빙(수동 검토
        기록)은 `None` — 없던 검사를 만들지 않는다.
        """
        evidence = self._admission.store.get(server_id)
        if evidence is None:
            return None
        return verify_evidence_binding(evidence)

    @property
    def admission(self) -> AdmissionGate:
        """등록·기동을 지키는 게이트 (증빙 등록/회수의 진입점)."""
        return self._admission

    def get_rejected_candidates(self) -> dict[str, AdmissionDecision]:
        """admission 에서 거부된 후보와 사유 (initialize 경로의 가시성)."""
        return dict(self._rejected)

    def revoke_admission(self, server_id: str) -> bool:
        """증빙을 회수한다. 이후 기동 시도는 다시 차단된다 (운영 롤백 절차)."""
        return self._admission.store.revoke(server_id)

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

        # 등록 이후 설정이 바뀌었을 수 있으므로 기동 시점에 다시 판정한다.
        # 여기서 막히면 subprocess 는 만들어지지 않는다.
        try:
            self._admission.authorize(info.config)
        except MCPAdmissionError as e:
            info.status = MCPServerStatus.ERROR
            info.last_error = str(e)
            logger.warning("MCP admission denied at start: %s", e)
            return False

        # fingerprint 는 "무엇을 실행하는가"(command/args/env) 만 묶는다. 같은 명령이
        # 실행할 **내용**이 승인 이후 바뀐 경우는 fingerprint 가 그대로이므로 위 판정을
        # 통과한다. 스캐너 증빙이 소스 결속을 주장할 때만, 기동 직전에 그 주장을 재확인한다.
        # 이 검사를 `AdmissionGate.decide()` 가 아니라 여기 두는 이유: decide 는 등록 루프에서
        # 후보마다 호출되는 순수 판정이고, 파일시스템 순회는 subprocess 를 띄우기 직전인
        # 이 지점에서만 값을 한다.
        drift = self._scanned_source_problem(server_id)
        if drift is not None:
            info.status = MCPServerStatus.ERROR
            info.last_error = f"MCP admission denied for '{server_id}' [source_drift]: {drift}"
            logger.warning("MCP source drift denied at start: %s — %s", server_id, drift)
            return False

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
