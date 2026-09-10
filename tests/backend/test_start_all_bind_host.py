"""`infra/scripts/start-all.sh` 의 백엔드 바인드 주소 회귀 테스트.

이 스크립트는 uvicorn 에 `--host` 를 CLI 인자로 직접 넘긴다 — 즉
`config.Settings.host` 의 안전한 기본값(127.0.0.1)을 **거치지 않는다**.
로컬 기동 경로에서 와일드카드 바인드가 되살아나도 파이썬 쪽 테스트는 전부
초록이므로, 그 구멍은 여기서만 잡을 수 있다.

grep 으로 문자열을 확인하지 않는다. 스크립트에서 uvicorn 호출 블록을 **그대로
꺼내 bash 로 실행**하고, `uvicorn` 을 argv 기록 함수로 바꿔치기해 실제로 어떤
`--host` 가 만들어지는지 관측한다. 프로세스도 네트워크도 뜨지 않는다:
`nohup`·`uvicorn` 둘 다 셸 함수로 가려지고, 표준 출력 리다이렉트는 임시
디렉토리로 향한다.
"""

import subprocess
from pathlib import Path

import pytest

REPO_ROOT = Path(__file__).resolve().parents[2]
START_ALL = REPO_ROOT / "infra" / "scripts" / "start-all.sh"

LOOPBACK = "127.0.0.1"
WILDCARD = "0.0.0.0"

# uvicorn 호출 블록을 감싼 bash 하네스.
#   - nohup: 그대로 통과시켜 뒤따르는 명령이 실행되게 한다
#   - uvicorn: 실행 대신 argv 를 파일에 기록한다 (스텁)
# 스크립트가 `> "$PROJECT_ROOT/logs/backend.log"` 로 stdout 을 돌리므로
# 스텁은 stdout 이 아니라 $ARGV_OUT 경로에 직접 쓴다.
HARNESS = """
set -e
nohup() { "$@"; }
uvicorn() { printf '%s\\n' "$@" >> "$ARGV_OUT"; }
. "$BLOCK"
wait
"""


def _extract_uvicorn_block() -> str:
    """`BACKEND_HOST=` 부터 백그라운드 실행(`2>&1 &`)까지를 원문 그대로 꺼낸다."""
    lines = START_ALL.read_text(encoding="utf-8").splitlines()

    starts = [i for i, line in enumerate(lines) if line.startswith("BACKEND_HOST=")]
    assert len(starts) == 1, f"BACKEND_HOST 할당이 {len(starts)}건 — 1건이어야 한다"
    start = starts[0]

    end = next(
        (i for i in range(start, len(lines)) if lines[i].rstrip().endswith("2>&1 &")),
        None,
    )
    assert end is not None, "uvicorn 백그라운드 실행 라인을 찾지 못했다"

    return "\n".join(lines[start : end + 1]) + "\n"


def _uvicorn_argv(tmp_path: Path, host_env: str | None) -> list[str]:
    """스크립트 블록을 실행해 uvicorn 이 받았을 argv 를 돌려준다."""
    project_root = tmp_path / "root"
    (project_root / "logs").mkdir(parents=True)

    block = tmp_path / "block.sh"
    block.write_text(_extract_uvicorn_block(), encoding="utf-8")

    argv_out = tmp_path / "argv.txt"

    # 상속 환경을 쓰지 않는다 — 실행 환경의 HOST 가 판정을 오염시키면 안 된다.
    env = {
        "PATH": "/usr/bin:/bin",
        "PROJECT_ROOT": str(project_root),
        "ARGV_OUT": str(argv_out),
        "BLOCK": str(block),
    }
    if host_env is not None:
        env["HOST"] = host_env

    result = subprocess.run(
        ["bash", "-c", HARNESS],
        env=env,
        capture_output=True,
        text=True,
        timeout=30,
    )
    assert result.returncode == 0, f"하네스 실패: {result.stderr}"

    return argv_out.read_text(encoding="utf-8").split()


def _host_arg(argv: list[str]) -> str:
    assert "--host" in argv, f"--host 가 없다: {argv}"
    return argv[argv.index("--host") + 1]


def test_script_is_syntactically_valid():
    """수정된 스크립트가 bash 문법 검사를 통과한다."""
    result = subprocess.run(
        ["bash", "-n", str(START_ALL)],
        capture_output=True,
        text=True,
        timeout=30,
    )

    assert result.returncode == 0, result.stderr


def test_default_bind_is_loopback(tmp_path):
    """HOST 미설정이면 루프백으로 바인드한다."""
    argv = _uvicorn_argv(tmp_path, host_env=None)

    assert _host_arg(argv) == LOOPBACK


def test_explicit_wildcard_override_is_honored(tmp_path):
    """배포용 와일드카드 바인드는 HOST 로 여전히 가능하다."""
    argv = _uvicorn_argv(tmp_path, host_env=WILDCARD)

    assert _host_arg(argv) == WILDCARD


@pytest.mark.parametrize("host_env", ["10.0.0.5", "192.168.1.20", "::1"])
def test_arbitrary_interface_override_is_honored(tmp_path, host_env):
    """특정 인터페이스 지정도 그대로 전달된다."""
    argv = _uvicorn_argv(tmp_path, host_env=host_env)

    assert _host_arg(argv) == host_env


def test_empty_host_falls_back_to_loopback(tmp_path):
    """HOST="" 는 미설정과 같게 취급한다 (`:-` 이므로 빈 값도 폴백)."""
    argv = _uvicorn_argv(tmp_path, host_env="")

    assert _host_arg(argv) == LOOPBACK


def test_other_uvicorn_arguments_are_unchanged(tmp_path):
    """--host 외 인자는 건드리지 않았다."""
    argv = _uvicorn_argv(tmp_path, host_env=None)

    assert argv[0] == "api.app:app"
    assert "--port" in argv and argv[argv.index("--port") + 1] == "8000"
    assert "--reload" in argv
    assert argv.count("--reload-exclude") == 5


def test_block_does_not_hardcode_a_bind_address():
    """호출 블록에 리터럴 주소가 되살아나지 않았다 (재도입 방지 핀)."""
    block = _extract_uvicorn_block()

    assert f"--host {WILDCARD}" not in block
    assert f"--host {LOOPBACK}" not in block
