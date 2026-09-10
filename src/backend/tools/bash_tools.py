"""Bash/Shell execution tools."""

import asyncio
import os
import subprocess
import uuid

from langchain_core.tools import tool

from services.sandbox_manager import execute_sandboxed, get_sandbox_manager

# 호스트 쉘 실행 opt-in 스위치.
#
# `execute_bash` / `execute_bash_async` 는 샌드박스 없이 호스트에서 임의 명령을
# 돌린다. 아래의 위험 패턴 목록은 문자열 부분일치라 우회가 쉬워(`rm -r -f /`,
# 변수 치환, base64 디코드 등) 경계로 쓸 수 없는 완화책일 뿐이다.
# 실제 경계는 "명시적으로 켜지 않으면 subprocess 를 만들지 않는다"이며,
# 이 파일의 두 함수는 그 판정을 **첫 문장에서** 수행한다.
#
# 샌드박스 경로(`execute_bash_sandboxed`)는 이 스위치의 대상이 아니다 —
# Docker 격리·네트워크 차단·non-root 로 실행되어 위협 모델이 다르다.
HOST_SHELL_ENV_VAR = "AOS_ALLOW_HOST_SHELL"

# 화이트리스트로 판정한다. `if os.getenv(VAR):` 는 "false"·"0" 같은 비어 있지
# 않은 문자열도 참이라 조용히 fail-open 된다.
_HOST_SHELL_TRUTHY_VALUES = frozenset({"1", "true", "yes", "on"})

HOST_SHELL_DISABLED_MESSAGE = (
    "Error: host shell execution is disabled. "
    f"Set {HOST_SHELL_ENV_VAR}=true to opt in for approved local development, "
    "or use execute_bash_sandboxed for isolated execution."
)


def is_host_shell_execution_enabled() -> bool:
    """호스트 쉘 실행이 명시적으로 승인됐는가.

    호출 시점에 환경변수를 읽는다 — 모듈 로드 시점에 고정하면 런타임 토글도,
    테스트의 monkeypatch 도 반영되지 않는다.
    """
    return os.getenv(HOST_SHELL_ENV_VAR, "").strip().lower() in _HOST_SHELL_TRUTHY_VALUES


@tool
def execute_bash(
    command: str,
    cwd: str | None = None,
    timeout: int = 120,
) -> str:
    """
    Shell 명령어를 실행합니다.

    Args:
        command: 실행할 명령어
        cwd: 작업 디렉토리 (기본값: 현재 디렉토리)
        timeout: 타임아웃 초 (기본값: 120초)

    Returns:
        명령어 출력 또는 오류 메시지
    """
    # Fail closed before anything else: 켜져 있지 않으면 subprocess 를 만들지 않는다.
    if not is_host_shell_execution_enabled():
        return HOST_SHELL_DISABLED_MESSAGE

    # Security check - block dangerous commands
    dangerous_patterns = [
        "rm -rf /",
        "rm -rf ~",
        ":(){ :|:& };:",  # fork bomb
        "mkfs.",
        "dd if=",
        "> /dev/sd",
        "chmod -R 777 /",
    ]

    for pattern in dangerous_patterns:
        if pattern in command:
            return f"Error: Potentially dangerous command blocked: {pattern}"

    try:
        cwd = os.path.expanduser(cwd) if cwd else os.getcwd()

        if not os.path.isdir(cwd):
            return f"Error: Working directory does not exist: {cwd}"

        # Execute command
        result = subprocess.run(
            command,
            shell=True,
            cwd=cwd,
            capture_output=True,
            text=True,
            timeout=timeout,
            env={**os.environ, "PYTHONUNBUFFERED": "1"},
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
        max_length = 30000
        if len(output) > max_length:
            output = output[:max_length] + f"\n... (truncated, total {len(output)} chars)"

        return output if output else "(no output)"

    except subprocess.TimeoutExpired:
        return f"Error: Command timed out after {timeout} seconds"
    except Exception as e:
        return f"Error executing command: {str(e)}"


async def execute_bash_async(
    command: str,
    cwd: str | None = None,
    timeout: int = 120,
) -> str:
    """
    Shell 명령어를 비동기적으로 실행합니다.

    Args:
        command: 실행할 명령어
        cwd: 작업 디렉토리
        timeout: 타임아웃 초

    Returns:
        명령어 출력 또는 오류 메시지
    """
    # Fail closed before anything else: 켜져 있지 않으면 subprocess 를 만들지 않는다.
    if not is_host_shell_execution_enabled():
        return HOST_SHELL_DISABLED_MESSAGE

    # Security check
    dangerous_patterns = [
        "rm -rf /",
        "rm -rf ~",
        ":(){ :|:& };:",
        "mkfs.",
        "dd if=",
        "> /dev/sd",
        "chmod -R 777 /",
    ]

    for pattern in dangerous_patterns:
        if pattern in command:
            return f"Error: Potentially dangerous command blocked: {pattern}"

    try:
        cwd = os.path.expanduser(cwd) if cwd else os.getcwd()

        if not os.path.isdir(cwd):
            return f"Error: Working directory does not exist: {cwd}"

        process = await asyncio.create_subprocess_shell(
            command,
            cwd=cwd,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
            env={**os.environ, "PYTHONUNBUFFERED": "1"},
        )

        try:
            stdout, stderr = await asyncio.wait_for(
                process.communicate(),
                timeout=timeout,
            )
        except TimeoutError:
            process.kill()
            return f"Error: Command timed out after {timeout} seconds"

        output_parts = []

        stdout_str = stdout.decode("utf-8", errors="replace")
        stderr_str = stderr.decode("utf-8", errors="replace")

        if stdout_str:
            output_parts.append(stdout_str)

        if stderr_str:
            output_parts.append(f"[stderr]\n{stderr_str}")

        if process.returncode != 0:
            output_parts.append(f"\n[exit code: {process.returncode}]")

        output = "\n".join(output_parts)

        # Truncate if too long
        max_length = 30000
        if len(output) > max_length:
            output = output[:max_length] + f"\n... (truncated, total {len(output)} chars)"

        return output if output else "(no output)"

    except Exception as e:
        return f"Error executing command: {str(e)}"


@tool
async def execute_bash_sandboxed(
    command: str,
    project_path: str | None = None,
    timeout: int = 120,
) -> str:
    """
    Docker 샌드박스에서 Shell 명령어를 안전하게 실행합니다.

    네트워크 차단, 메모리 제한, non-root 사용자로 실행됩니다.
    위험한 명령어 실행 시 이 함수를 사용하세요.

    Args:
        command: 실행할 명령어
        project_path: 프로젝트 경로 (읽기 전용으로 마운트됨)
        timeout: 타임아웃 초 (기본값: 120초)

    Returns:
        명령어 출력 또는 오류 메시지
    """
    # Generate a unique task ID
    task_id = str(uuid.uuid4())

    # Expand project path if provided
    if project_path:
        project_path = os.path.expanduser(project_path)
        if not os.path.isdir(project_path):
            return f"Error: Project directory does not exist: {project_path}"

    # Execute in sandbox
    result = await execute_sandboxed(
        command=command,
        task_id=task_id,
        project_path=project_path,
        timeout=timeout,
    )

    if result.success:
        output = result.output
        # Truncate if too long
        max_length = 30000
        if len(output) > max_length:
            output = output[:max_length] + f"\n... (truncated, total {len(output)} chars)"
        return output if output else "(no output)"
    else:
        error_msg = f"Sandbox execution failed: {result.error}"
        if result.output:
            error_msg += f"\nOutput:\n{result.output}"
        return error_msg


def is_sandbox_available() -> bool:
    """Check if sandbox execution is available."""
    manager = get_sandbox_manager()
    return manager.available
