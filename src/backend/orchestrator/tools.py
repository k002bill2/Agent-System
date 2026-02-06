"""MCP Tool Wrapper - MCP 도구를 LangChain Tool로 래핑.

MCP Manager의 도구들을 LangChain Tool 형식으로 변환하여
ExecutorNode가 일반 도구처럼 사용할 수 있게 합니다.
"""

import asyncio
import json
from typing import Any

from langchain_core.callbacks.manager import (
    AsyncCallbackManagerForToolRun,
    CallbackManagerForToolRun,
)
from langchain_core.tools import BaseTool
from pydantic import BaseModel, Field

from services.mcp_manager import (
    MCPManager,
    MCPServerStatus,
    MCPToolCall,
    MCPToolResult,
    MCPToolSchema,
    get_mcp_manager,
    get_mcp_manager_sync,
)


class MCPToolInput(BaseModel):
    """MCP 도구 입력 스키마."""

    arguments: dict[str, Any] = Field(
        default_factory=dict,
        description="도구에 전달할 인자들",
    )


class MCPToolWrapper(BaseTool):
    """
    MCP 도구를 LangChain Tool로 래핑.

    MCP 서버의 개별 도구를 LangChain의 BaseTool 형식으로 변환하여
    LLM의 tool_calls에서 직접 사용할 수 있게 합니다.
    """

    name: str = Field(description="도구 이름")
    description: str = Field(description="도구 설명")
    server_id: str = Field(description="MCP 서버 ID")
    mcp_tool_name: str = Field(description="MCP 원본 도구 이름")
    mcp_input_schema: dict[str, Any] = Field(
        default_factory=dict,
        description="MCP 도구의 입력 스키마",
    )

    # LangChain tool 설정
    return_direct: bool = False

    def _run(
        self,
        *args,
        run_manager: CallbackManagerForToolRun | None = None,
        **kwargs,
    ) -> str:
        """동기 실행 (비동기로 위임)."""
        loop = asyncio.get_event_loop()
        return loop.run_until_complete(self._arun(*args, **kwargs))

    async def _arun(
        self,
        *args,
        run_manager: AsyncCallbackManagerForToolRun | None = None,
        **kwargs,
    ) -> str:
        """
        MCP 도구 비동기 실행.

        Args:
            **kwargs: 도구 인자들

        Returns:
            JSON 문자열 형식의 결과
        """
        manager = await get_mcp_manager()

        # MCP 도구 호출 생성
        call = MCPToolCall(
            server_id=self.server_id,
            tool_name=self.mcp_tool_name,
            arguments=kwargs,
        )

        # 도구 실행
        result = await manager.call_tool(call)

        # 결과 포맷팅
        if result.success:
            # content 배열을 텍스트로 변환
            if result.content:
                content_texts = []
                for item in result.content:
                    if isinstance(item, dict):
                        if item.get("type") == "text":
                            content_texts.append(item.get("text", ""))
                        else:
                            content_texts.append(json.dumps(item, ensure_ascii=False))
                    else:
                        content_texts.append(str(item))
                return "\n".join(content_texts)
            return "Success (no content)"
        else:
            return f"Error: {result.error}"


def create_mcp_tool(
    server_id: str,
    tool_schema: MCPToolSchema,
) -> MCPToolWrapper:
    """
    MCP 도구 스키마로부터 LangChain Tool 생성.

    Args:
        server_id: MCP 서버 ID
        tool_schema: MCP 도구 스키마

    Returns:
        MCPToolWrapper 인스턴스
    """
    # 도구 이름 생성 (server_id + tool_name)
    tool_name = f"mcp_{server_id}_{tool_schema.name}"

    # 설명에 서버 정보 추가
    description = tool_schema.description or f"MCP tool from {server_id}"
    description = f"[MCP:{server_id}] {description}"

    # 입력 스키마가 있으면 설명에 추가
    if tool_schema.input_schema:
        properties = tool_schema.input_schema.get("properties", {})
        if properties:
            param_desc = ", ".join(
                f"{name}: {info.get('description', info.get('type', 'any'))}"
                for name, info in properties.items()
            )
            description += f"\nParameters: {param_desc}"

    return MCPToolWrapper(
        name=tool_name,
        description=description,
        server_id=server_id,
        mcp_tool_name=tool_schema.name,
        mcp_input_schema=tool_schema.input_schema,
    )


async def get_mcp_tools() -> list[BaseTool]:
    """
    실행 중인 MCP 서버들의 모든 도구를 LangChain Tool 리스트로 반환.

    Returns:
        MCP 도구들이 래핑된 BaseTool 리스트
    """
    manager = await get_mcp_manager()
    tools: list[BaseTool] = []

    for server_info in manager.get_running_servers():
        server_id = server_info.config.id
        for tool_schema in server_info.tools:
            tool = create_mcp_tool(server_id, tool_schema)
            tools.append(tool)

    return tools


def get_mcp_tools_sync() -> list[BaseTool]:
    """
    동기 버전: 현재 로드된 MCP 서버들의 도구를 LangChain Tool 리스트로 반환.

    주의: 이 함수는 MCP Manager가 이미 초기화되어 있어야 합니다.
    서버가 실행 중이 아니면 빈 리스트를 반환합니다.

    Returns:
        MCP 도구들이 래핑된 BaseTool 리스트
    """
    manager = get_mcp_manager_sync()
    tools: list[BaseTool] = []

    for server_info in manager.get_running_servers():
        server_id = server_info.config.id
        for tool_schema in server_info.tools:
            tool = create_mcp_tool(server_id, tool_schema)
            tools.append(tool)

    return tools


async def get_all_available_mcp_tools() -> list[BaseTool]:
    """
    등록된 모든 MCP 서버의 도구를 LangChain Tool 리스트로 반환.
    (서버가 실행 중이 아니어도 도구 스키마가 있으면 포함)

    Returns:
        MCP 도구들이 래핑된 BaseTool 리스트
    """
    manager = await get_mcp_manager()
    tools: list[BaseTool] = []

    for server_info in manager.get_all_servers():
        server_id = server_info.config.id
        for tool_schema in server_info.tools:
            tool = create_mcp_tool(server_id, tool_schema)
            tools.append(tool)

    return tools


class MCPToolExecutor:
    """
    MCP 도구 실행기.

    ExecutorNode에서 도구 실행 시 MCP 도구를 우선적으로 찾아 실행합니다.
    """

    def __init__(self, manager: MCPManager | None = None):
        """
        Args:
            manager: MCP Manager 인스턴스 (None이면 싱글톤 사용)
        """
        self._manager = manager
        self._initialized = False

    async def initialize(self) -> None:
        """MCP Manager 초기화."""
        if not self._initialized:
            if self._manager is None:
                self._manager = await get_mcp_manager()
            self._initialized = True

    @property
    def manager(self) -> MCPManager | None:
        return self._manager

    def find_mcp_tool(self, tool_name: str) -> tuple[str, MCPToolSchema] | None:
        """
        도구 이름으로 MCP 도구 찾기.

        Args:
            tool_name: 찾을 도구 이름 (mcp_xxx_yyy 형식 또는 원본 이름)

        Returns:
            (서버 ID, 도구 스키마) 또는 None
        """
        if not self._manager:
            return None

        # mcp_xxx_yyy 형식이면 파싱
        if tool_name.startswith("mcp_"):
            parts = tool_name.split("_", 2)
            if len(parts) >= 3:
                server_id, mcp_tool_name = parts[1], parts[2]
                server = self._manager.get_server(server_id)
                if server:
                    for tool in server.tools:
                        if tool.name == mcp_tool_name:
                            return (server_id, tool)

        # 원본 이름으로 검색
        return self._manager.find_tool(tool_name)

    async def execute(
        self,
        tool_name: str,
        arguments: dict[str, Any],
        timeout_ms: int = 30000,
    ) -> MCPToolResult:
        """
        MCP 도구 실행.

        Args:
            tool_name: 도구 이름
            arguments: 도구 인자
            timeout_ms: 타임아웃 (밀리초)

        Returns:
            MCPToolResult
        """
        await self.initialize()

        if not self._manager:
            return MCPToolResult(
                success=False,
                error="MCP Manager not initialized",
            )

        # 도구 찾기
        result = self.find_mcp_tool(tool_name)
        if not result:
            return MCPToolResult(
                success=False,
                error=f"MCP tool not found: {tool_name}",
            )

        server_id, tool_schema = result

        # 서버 상태 확인 및 자동 시작
        server = self._manager.get_server(server_id)
        if server and server.status != MCPServerStatus.RUNNING:
            started = await self._manager.start_server(server_id)
            if not started:
                return MCPToolResult(
                    success=False,
                    error=f"Failed to start MCP server: {server_id}",
                )

        # 도구 호출
        call = MCPToolCall(
            server_id=server_id,
            tool_name=tool_schema.name,
            arguments=arguments,
            timeout_ms=timeout_ms,
        )

        return await self._manager.call_tool(call)

    async def execute_or_fallback(
        self,
        tool_name: str,
        arguments: dict[str, Any],
        fallback_fn,
        timeout_ms: int = 30000,
    ) -> Any:
        """
        MCP 도구 실행 또는 폴백 함수 실행.

        MCP에서 도구를 찾지 못하면 fallback_fn을 실행합니다.

        Args:
            tool_name: 도구 이름
            arguments: 도구 인자
            fallback_fn: MCP 도구가 없을 때 실행할 함수 (async)
            timeout_ms: 타임아웃 (밀리초)

        Returns:
            도구 실행 결과 문자열
        """
        await self.initialize()

        # MCP 도구 찾기
        if self._manager and self.find_mcp_tool(tool_name):
            result = await self.execute(tool_name, arguments, timeout_ms)
            if result.success:
                # content를 문자열로 변환
                if result.content:
                    texts = []
                    for item in result.content:
                        if isinstance(item, dict) and item.get("type") == "text":
                            texts.append(item.get("text", ""))
                        else:
                            texts.append(json.dumps(item, ensure_ascii=False))
                    return "\n".join(texts)
                return "Success"
            else:
                return f"MCP Error: {result.error}"

        # MCP에 없으면 폴백
        return await fallback_fn(tool_name, arguments)
