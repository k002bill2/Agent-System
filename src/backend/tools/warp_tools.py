"""Warp Terminal agent integration tools."""

import asyncio
import json
import os
import subprocess
import threading
from datetime import UTC, datetime
from typing import Any

from langchain_core.tools import tool

from models.llm_usage import (
    LLMRuntimeMode,
    LLMUsageMeasurementMethod,
    LLMUsageRecordCreate,
    LLMUsageSource,
    LLMUsageStatus,
)
from services.llm_usage_ledger_service import (
    LLMUsageQuotaExceededError,
    enforce_usage_quota_preflight_best_effort,
    record_usage_best_effort,
)

# Warp CLI path
WARP_CLI = "/Applications/Warp.app/Contents/Resources/bin/warp"


def _check_warp_installed() -> bool:
    """Check if Warp CLI is installed."""
    return os.path.exists(WARP_CLI)


def _estimate_prompt_tokens(prompt: str) -> int:
    return max(1, len(prompt.split()) * 2)


def _run_async_blocking(coro):
    """Run a coroutine from sync tool functions, even if a loop is active."""
    try:
        asyncio.get_running_loop()
    except RuntimeError:
        return asyncio.run(coro)

    result: dict[str, Any] = {}

    def runner() -> None:
        try:
            result["value"] = asyncio.run(coro)
        except Exception as exc:
            result["error"] = exc

    thread = threading.Thread(target=runner)
    thread.start()
    thread.join()
    if "error" in result:
        raise result["error"]
    return result.get("value")


def _usage_context_value(usage_context: dict[str, Any] | None, key: str) -> Any:
    if not usage_context:
        return None
    value = usage_context.get(key)
    if hasattr(value, "value"):
        return value.value
    return value


def _usage_context_metadata(usage_context: dict[str, Any] | None) -> dict[str, Any]:
    if not usage_context:
        return {}
    metadata = usage_context.get("metadata")
    return dict(metadata) if isinstance(metadata, dict) else {}


async def _enforce_warp_agent_preflight(
    prompt: str,
    usage_context: dict[str, Any] | None = None,
) -> int:
    estimated_tokens = _estimate_prompt_tokens(prompt)
    await enforce_usage_quota_preflight_best_effort(
        user_id=_usage_context_value(usage_context, "user_id"),
        organization_id=_usage_context_value(usage_context, "organization_id"),
        estimated_tokens=estimated_tokens,
    )
    return estimated_tokens


async def _record_warp_agent_usage(
    *,
    prompt: str,
    cwd: str,
    model: str | None,
    timeout: int,
    started_at: datetime,
    status: LLMUsageStatus,
    has_mcp: bool,
    exit_code: int | None = None,
    error_message: str | None = None,
    usage_context: dict[str, Any] | None = None,
) -> None:
    completed_at = datetime.now(tz=UTC)
    metadata = _usage_context_metadata(usage_context)
    parent_source = _usage_context_value(usage_context, "source")
    if parent_source:
        metadata["parent_source"] = parent_source
    metadata.update(
        {
            "event": (
                "warp_agent_completed" if status == LLMUsageStatus.SUCCESS else "warp_agent_failed"
            ),
            "cwd": cwd,
            "timeout_seconds": timeout,
            "has_mcp": has_mcp,
            "exit_code": exit_code,
        }
    )
    await record_usage_best_effort(
        LLMUsageRecordCreate(
            user_id=_usage_context_value(usage_context, "user_id"),
            organization_id=_usage_context_value(usage_context, "organization_id"),
            provider="warp_ai",
            mode=LLMRuntimeMode.CLI,
            source=LLMUsageSource.WARP_AGENT,
            model=model or "warp-default",
            input_tokens=_estimate_prompt_tokens(prompt),
            output_tokens=None,
            measurement_method=LLMUsageMeasurementMethod.ESTIMATED,
            status=status,
            latency_ms=int((completed_at - started_at).total_seconds() * 1000),
            error_message=error_message,
            session_id=_usage_context_value(usage_context, "session_id"),
            task_id=_usage_context_value(usage_context, "task_id"),
            analysis_id=_usage_context_value(usage_context, "analysis_id"),
            project_id=_usage_context_value(usage_context, "project_id"),
            metadata=metadata,
            started_at=started_at,
            completed_at=completed_at,
        )
    )


def _warp_agent_run_impl(
    prompt: str,
    cwd: str | None = None,
    model: str | None = None,
    timeout: int = 300,
    usage_context: dict[str, Any] | None = None,
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

        try:
            _run_async_blocking(_enforce_warp_agent_preflight(prompt, usage_context))
        except LLMUsageQuotaExceededError as e:
            return f"Error: {str(e)}"

        # Build command
        cmd = [WARP_CLI, "agent", "run", "-p", prompt, "-C", cwd]

        if model:
            cmd.extend(["--model", model])

        started_at = datetime.now(tz=UTC)

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
        _run_async_blocking(
            _record_warp_agent_usage(
                prompt=prompt,
                cwd=cwd,
                model=model,
                timeout=timeout,
                started_at=started_at,
                status=(LLMUsageStatus.SUCCESS if result.returncode == 0 else LLMUsageStatus.ERROR),
                has_mcp=False,
                exit_code=result.returncode,
                error_message=result.stderr if result.returncode != 0 else None,
                usage_context=usage_context,
            )
        )

        # Truncate if too long
        max_length = 50000
        if len(output) > max_length:
            output = output[:max_length] + f"\n... (truncated, total {len(output)} chars)"

        return output if output else "(no output)"

    except subprocess.TimeoutExpired:
        _run_async_blocking(
            _record_warp_agent_usage(
                prompt=prompt,
                cwd=cwd,
                model=model,
                timeout=timeout,
                started_at=started_at,
                status=LLMUsageStatus.TIMEOUT,
                has_mcp=False,
                error_message=f"Warp agent timed out after {timeout} seconds",
                usage_context=usage_context,
            )
        )
        return f"Error: Warp agent timed out after {timeout} seconds"
    except Exception as e:
        return f"Error running Warp agent: {str(e)}"


@tool
def warp_agent_run(
    prompt: str,
    cwd: str | None = None,
    model: str | None = None,
    timeout: int = 300,
) -> str:
    """
    Warp AI 에이전트를 실행하여 복잡한 작업을 수행합니다.

    Warp 에이전트는 자체적으로 파일 시스템 탐색, 코드 분석, 터미널 명령 실행 등을
    자율적으로 수행할 수 있습니다.
    """
    return _warp_agent_run_impl(
        prompt=prompt,
        cwd=cwd,
        model=model,
        timeout=timeout,
    )


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


def _warp_agent_with_mcp_impl(
    prompt: str,
    mcp_config: dict,
    cwd: str | None = None,
    timeout: int = 300,
    usage_context: dict[str, Any] | None = None,
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

        try:
            _run_async_blocking(_enforce_warp_agent_preflight(prompt, usage_context))
        except LLMUsageQuotaExceededError as e:
            return f"Error: {str(e)}"

        # Convert MCP config to JSON string
        mcp_json = json.dumps(mcp_config)

        # Build command
        cmd = [
            WARP_CLI,
            "agent",
            "run",
            "-p",
            prompt,
            "-C",
            cwd,
            "--mcp",
            mcp_json,
        ]

        started_at = datetime.now(tz=UTC)

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
        _run_async_blocking(
            _record_warp_agent_usage(
                prompt=prompt,
                cwd=cwd,
                model=None,
                timeout=timeout,
                started_at=started_at,
                status=(LLMUsageStatus.SUCCESS if result.returncode == 0 else LLMUsageStatus.ERROR),
                has_mcp=True,
                exit_code=result.returncode,
                error_message=result.stderr if result.returncode != 0 else None,
                usage_context=usage_context,
            )
        )

        max_length = 50000
        if len(output) > max_length:
            output = output[:max_length] + "\n... (truncated)"

        return output if output else "(no output)"

    except subprocess.TimeoutExpired:
        _run_async_blocking(
            _record_warp_agent_usage(
                prompt=prompt,
                cwd=cwd,
                model=None,
                timeout=timeout,
                started_at=started_at,
                status=LLMUsageStatus.TIMEOUT,
                has_mcp=True,
                error_message=f"Warp agent timed out after {timeout} seconds",
                usage_context=usage_context,
            )
        )
        return f"Error: Warp agent timed out after {timeout} seconds"
    except Exception as e:
        return f"Error running Warp agent with MCP: {str(e)}"


@tool
def warp_agent_with_mcp(
    prompt: str,
    mcp_config: dict,
    cwd: str | None = None,
    timeout: int = 300,
) -> str:
    """
    MCP 서버와 함께 Warp 에이전트를 실행합니다.

    MCP(Model Context Protocol) 서버를 연결하여 에이전트가 추가 도구를
    사용할 수 있게 합니다.
    """
    return _warp_agent_with_mcp_impl(
        prompt=prompt,
        mcp_config=mcp_config,
        cwd=cwd,
        timeout=timeout,
    )


async def warp_agent_run_async(
    prompt: str,
    cwd: str | None = None,
    model: str | None = None,
    timeout: int = 300,
    usage_context: dict[str, Any] | None = None,
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

        try:
            await _enforce_warp_agent_preflight(prompt, usage_context)
        except LLMUsageQuotaExceededError as e:
            return f"Error: {str(e)}"

        # Build command
        cmd = [WARP_CLI, "agent", "run", "-p", prompt, "-C", cwd]

        if model:
            cmd.extend(["--model", model])

        started_at = datetime.now(tz=UTC)

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
        except TimeoutError:
            process.kill()
            await _record_warp_agent_usage(
                prompt=prompt,
                cwd=cwd,
                model=model,
                timeout=timeout,
                started_at=started_at,
                status=LLMUsageStatus.TIMEOUT,
                has_mcp=False,
                error_message=f"Warp agent timed out after {timeout} seconds",
                usage_context=usage_context,
            )
            return f"Error: Warp agent timed out after {timeout} seconds"

        output_parts = []

        stdout_str = stdout.decode("utf-8", errors="replace")
        stderr_str = stderr.decode("utf-8", errors="replace")

        if stdout_str:
            output_parts.append(stdout_str)

        if stderr_str:
            output_parts.append(f"[stderr]\n{stderr_str}")

        output = "\n".join(output_parts)
        await _record_warp_agent_usage(
            prompt=prompt,
            cwd=cwd,
            model=model,
            timeout=timeout,
            started_at=started_at,
            status=(LLMUsageStatus.SUCCESS if process.returncode == 0 else LLMUsageStatus.ERROR),
            has_mcp=False,
            exit_code=process.returncode,
            error_message=stderr_str if process.returncode != 0 else None,
            usage_context=usage_context,
        )

        max_length = 50000
        if len(output) > max_length:
            output = output[:max_length] + "\n... (truncated)"

        return output if output else "(no output)"

    except Exception as e:
        return f"Error running Warp agent: {str(e)}"
