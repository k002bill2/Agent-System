"""Warp Terminal agent integration tools."""

import asyncio
import subprocess
import os
import json
from typing import Optional

from langchain_core.tools import tool

# Warp CLI path
WARP_CLI = "/Applications/Warp.app/Contents/Resources/bin/warp"


def _check_warp_installed() -> bool:
    """Check if Warp CLI is installed."""
    return os.path.exists(WARP_CLI)


@tool
def warp_agent_run(
    prompt: str,
    cwd: Optional[str] = None,
    model: Optional[str] = None,
    timeout: int = 300,
) -> str:
    """
    Warp AI 에이전트를 실행하여 복잡한 작업을 수행합니다.

    Warp 에이전트는 자체적으로 파일 시스템 탐색, 코드 분석, 터미널 명령 실행 등을
    자율적으로 수행할 수 있습니다.

    Args:
        prompt: 에이전트에게 지시할 작업 설명
        cwd: 작업 디렉토리 (기본값: 현재 디렉토리)
        model: 사용할 모델 ID (기본값: Warp 기본 모델)
        timeout: 타임아웃 초 (기본값: 300초 = 5분)

    Returns:
        에이전트 실행 결과

    Examples:
        - "이 프로젝트의 구조를 분석해줘"
        - "테스트를 실행하고 실패한 테스트를 수정해줘"
        - "package.json의 의존성을 업데이트해줘"
    """
    if not _check_warp_installed():
        return "Error: Warp CLI not found. Please install Warp terminal."

    try:
        cwd = os.path.expanduser(cwd) if cwd else os.getcwd()

        if not os.path.isdir(cwd):
            return f"Error: Working directory does not exist: {cwd}"

        # Build command
        cmd = [WARP_CLI, "agent", "run", "-p", prompt, "-C", cwd]

        if model:
            cmd.extend(["--model", model])

        # Execute Warp agent
        result = subprocess.run(
            cmd,
            capture_output=True,
            text=True,
            timeout=timeout,
            env={**os.environ},
        )

        output_parts = []

        if result.stdout:
            output_parts.append(result.stdout)

        if result.stderr:
            output_parts.append(f"[stderr]\n{result.stderr}")

        if result.returncode != 0:
            output_parts.append(f"\n[exit code: {result.returncode}]")

        output = "\n".join(output_parts)

        # Truncate if too long
        max_length = 50000
        if len(output) > max_length:
            output = output[:max_length] + f"\n... (truncated, total {len(output)} chars)"

        return output if output else "(no output)"

    except subprocess.TimeoutExpired:
        return f"Error: Warp agent timed out after {timeout} seconds"
    except Exception as e:
        return f"Error running Warp agent: {str(e)}"


@tool
def warp_list_models() -> str:
    """
    Warp에서 사용 가능한 AI 모델 목록을 조회합니다.

    Returns:
        사용 가능한 모델 목록
    """
    if not _check_warp_installed():
        return "Error: Warp CLI not found. Please install Warp terminal."

    try:
        result = subprocess.run(
            [WARP_CLI, "model", "list"],
            capture_output=True,
            text=True,
            timeout=30,
        )

        if result.stdout:
            return result.stdout
        if result.stderr:
            return f"Error: {result.stderr}"
        return "(no output)"

    except Exception as e:
        return f"Error listing Warp models: {str(e)}"


@tool
def warp_agent_with_mcp(
    prompt: str,
    mcp_config: dict,
    cwd: Optional[str] = None,
    timeout: int = 300,
) -> str:
    """
    MCP 서버와 함께 Warp 에이전트를 실행합니다.

    MCP(Model Context Protocol) 서버를 연결하여 에이전트가 추가 도구를
    사용할 수 있게 합니다.

    Args:
        prompt: 에이전트에게 지시할 작업 설명
        mcp_config: MCP 서버 설정 (예: {"mcpServers": {"server-name": {"command": "...", "args": [...]}}})
        cwd: 작업 디렉토리
        timeout: 타임아웃 초

    Returns:
        에이전트 실행 결과
    """
    if not _check_warp_installed():
        return "Error: Warp CLI not found. Please install Warp terminal."

    try:
        cwd = os.path.expanduser(cwd) if cwd else os.getcwd()

        if not os.path.isdir(cwd):
            return f"Error: Working directory does not exist: {cwd}"

        # Convert MCP config to JSON string
        mcp_json = json.dumps(mcp_config)

        # Build command
        cmd = [
            WARP_CLI, "agent", "run",
            "-p", prompt,
            "-C", cwd,
            "--mcp", mcp_json,
        ]

        # Execute Warp agent with MCP
        result = subprocess.run(
            cmd,
            capture_output=True,
            text=True,
            timeout=timeout,
            env={**os.environ},
        )

        output_parts = []

        if result.stdout:
            output_parts.append(result.stdout)

        if result.stderr:
            output_parts.append(f"[stderr]\n{result.stderr}")

        output = "\n".join(output_parts)

        max_length = 50000
        if len(output) > max_length:
            output = output[:max_length] + f"\n... (truncated)"

        return output if output else "(no output)"

    except subprocess.TimeoutExpired:
        return f"Error: Warp agent timed out after {timeout} seconds"
    except Exception as e:
        return f"Error running Warp agent with MCP: {str(e)}"


async def warp_agent_run_async(
    prompt: str,
    cwd: Optional[str] = None,
    model: Optional[str] = None,
    timeout: int = 300,
) -> str:
    """
    Warp AI 에이전트를 비동기적으로 실행합니다.

    Args:
        prompt: 에이전트에게 지시할 작업 설명
        cwd: 작업 디렉토리
        model: 사용할 모델 ID
        timeout: 타임아웃 초

    Returns:
        에이전트 실행 결과
    """
    if not _check_warp_installed():
        return "Error: Warp CLI not found. Please install Warp terminal."

    try:
        cwd = os.path.expanduser(cwd) if cwd else os.getcwd()

        if not os.path.isdir(cwd):
            return f"Error: Working directory does not exist: {cwd}"

        # Build command
        cmd = [WARP_CLI, "agent", "run", "-p", prompt, "-C", cwd]

        if model:
            cmd.extend(["--model", model])

        process = await asyncio.create_subprocess_exec(
            *cmd,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
            env={**os.environ},
        )

        try:
            stdout, stderr = await asyncio.wait_for(
                process.communicate(),
                timeout=timeout,
            )
        except asyncio.TimeoutError:
            process.kill()
            return f"Error: Warp agent timed out after {timeout} seconds"

        output_parts = []

        stdout_str = stdout.decode("utf-8", errors="replace")
        stderr_str = stderr.decode("utf-8", errors="replace")

        if stdout_str:
            output_parts.append(stdout_str)

        if stderr_str:
            output_parts.append(f"[stderr]\n{stderr_str}")

        output = "\n".join(output_parts)

        max_length = 50000
        if len(output) > max_length:
            output = output[:max_length] + f"\n... (truncated)"

        return output if output else "(no output)"

    except Exception as e:
        return f"Error running Warp agent: {str(e)}"
