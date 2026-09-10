"""호스트 쉘 실행은 opt-in 이어야 한다 — 기본값은 차단.

`tools/bash_tools.py` 의 `execute_bash` / `execute_bash_async` 는 샌드박스 없이
호스트에서 임의 명령을 돌린다. 위험 패턴 블랙리스트는 우회 가능한 완화책일 뿐
경계가 아니다 — 경계는 "명시적으로 켜지 않으면 subprocess 자체를 만들지 않는다"다.

단언의 핵심은 **반환 문자열이 아니라 subprocess 미호출**이다. 에러 문자열만
확인하면 가드가 subprocess 호출 *뒤에* 있어도 통과한다(= 이미 실행된 뒤 거절).
그래서 `subprocess.run` 과 `asyncio.create_subprocess_shell` 을 감시하고
호출 횟수 0 을 단언한다.
"""

import asyncio
import subprocess

import pytest

from tools import bash_tools

HOST_SHELL_ENV_VAR = "AOS_ALLOW_HOST_SHELL"

# 켜졌다고 오해될 수 있으나 켜지면 안 되는 값들 — "false" 는 truthy 문자열이라
# `if os.getenv(...)` 형태의 순진한 가드에서 조용히 fail-open 된다.
FALSY_VALUES = ("", "false", "False", "0", "no", "off")


@pytest.fixture
def spies(monkeypatch):
    """subprocess 생성 경로 두 곳을 감시한다 (호출되면 즉시 실패)."""
    calls: list[str] = []

    def fake_run(*args, **kwargs):
        calls.append("subprocess.run")
        raise AssertionError("subprocess.run 이 호출됐다 — fail-closed 가 아니다")

    async def fake_create_subprocess_shell(*args, **kwargs):
        calls.append("asyncio.create_subprocess_shell")
        raise AssertionError("create_subprocess_shell 이 호출됐다 — fail-closed 가 아니다")

    monkeypatch.setattr(subprocess, "run", fake_run)
    monkeypatch.setattr(asyncio, "create_subprocess_shell", fake_create_subprocess_shell)
    return calls


def test_execute_bash_disabled_by_default(monkeypatch, spies):
    """환경변수 미설정이면 호스트 쉘은 실행되지 않는다."""
    monkeypatch.delenv(HOST_SHELL_ENV_VAR, raising=False)

    result = execute_bash_result("echo hello")

    assert spies == [], f"subprocess 가 호출됐다: {spies}"
    assert "disabled" in result.lower() or "비활성" in result


@pytest.mark.asyncio
async def test_execute_bash_async_disabled_by_default(monkeypatch, spies):
    """비동기 경로도 같은 계약을 따른다."""
    monkeypatch.delenv(HOST_SHELL_ENV_VAR, raising=False)

    result = await bash_tools.execute_bash_async("echo hello")

    assert spies == [], f"subprocess 가 호출됐다: {spies}"
    assert "disabled" in result.lower() or "비활성" in result


@pytest.mark.parametrize("value", FALSY_VALUES)
def test_falsy_env_values_do_not_enable(monkeypatch, spies, value):
    """'false'·'0' 같은 값으로는 절대 열리지 않는다 (truthy-string 함정)."""
    monkeypatch.setenv(HOST_SHELL_ENV_VAR, value)

    result = execute_bash_result("echo hello")

    assert spies == [], f"{value!r} 로 호스트 쉘이 열렸다: {spies}"
    assert "disabled" in result.lower() or "비활성" in result


@pytest.mark.parametrize("value", ("1", "true", "TRUE", "yes", "on"))
def test_escape_hatch_enables_execution(monkeypatch, value):
    """명시적 승인 값이면 실제로 실행된다 — 탈출구가 살아 있어야 한다."""
    monkeypatch.setenv(HOST_SHELL_ENV_VAR, value)

    result = execute_bash_result("echo aos-optin-marker")

    assert "aos-optin-marker" in result


@pytest.mark.asyncio
async def test_escape_hatch_enables_async_execution(monkeypatch):
    """비동기 경로 탈출구."""
    monkeypatch.setenv(HOST_SHELL_ENV_VAR, "true")

    result = await bash_tools.execute_bash_async("echo aos-optin-async-marker")

    assert "aos-optin-async-marker" in result


def execute_bash_result(command: str) -> str:
    """`@tool` 로 감싸인 execute_bash 를 호출한다."""
    return bash_tools.execute_bash.invoke({"command": command})
