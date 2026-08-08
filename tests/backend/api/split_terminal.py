"""services/terminal_service.py(867줄) → 모듈 4종 분할 배정표. (B5 Task 5)

    # CWD = repo 루트. <원본> 은 패키지 승격 **직전** 커밋에서 꺼낸 스냅샷
    git show <승격직전ref>:src/backend/services/terminal_service.py > /tmp/orig.py
    src/backend/.venv/bin/python tests/backend/api/split_terminal.py /tmp/orig.py src/backend/services/terminal_service/

실행 로직은 `split_module.py` 에 있다. 이 파일은 **배정표와 그 근거**만 담는다.

## 이 대상의 성질

- **B5 에서 안전망이 가장 얇다** (테스트 411줄, 그것도 Orca 어댑터 전용).
  레시피가 네 번 검증된 뒤 착수하는 이유다.
- **컨테이너 안 정의 0건.** Task 3 의 `try/except ImportError` 함정이 없다.
- **모듈 레벨 상태 1건**: `_terminal_service` 는 `get_terminal_service` 가 `global`
  로 재바인딩하므로 **같은 모듈에 남긴다**(service).
- `TERMINAL_INFO` 는 가변 dict 지만 **사용처 전수가 읽기뿐**이라 안전하다
  (import 시점에 확장·변이하는 코드가 없다). 단 `api/terminal.py:15` 와 테스트가
  직접 import 하므로 **재노출 대상**이다.

## 다섯 번째 패치 형태 — `f"{MODULE}.xxx"` 문자열 조립

`tests/backend/test_terminal_service_orca.py:25` 가 `MODULE = "services.terminal_service"`
를 두고 모든 패치 경로를 f-string 으로 만든다:

    with patch(f"{MODULE}.shutil.which", return_value=None): ...
    monkeypatch.setattr(f"{MODULE}.sys.platform", "linux")
    patch(f"{MODULE}._write_exec_script", ...)
    patch(f"{MODULE}.asyncio.create_subprocess_exec", ...)

**타깃 문자열 grep 으로도 안 잡힌다** — 소스에 완성된 경로가 존재하지 않는다.
B5 에서 확인된 패치 형태는 이제 다섯 가지다: ① `patch("...")` ②
`monkeypatch.setattr("...")` ③ 모듈 **객체** `setattr(mod, "X", ...)`
④ 여러 줄로 쪼갠 ①~③ ⑤ 상수 조립 `f"{MODULE}.X"`.
**모듈 경로 상수(`MODULE = "..."`)를 먼저 찾는 것이 유일하게 확실한 스캔이다.**

역설적으로 갱신은 가장 쉽다 — 패치 타깃 4종이 전부 Orca 경로에 모여 있어
**`MODULE` 한 줄만** `"services.terminal_service.orca"` 로 바꾸면 된다.
AST 실측으로 확인한 근거:

| 패치 타깃 | orca.py 가 갖는 이유 |
|---|---|
| `shutil` | `OrcaAdapter.is_available()` 이 `shutil.which` 를 호출 |
| `sys` | `_resolve_orca_command` 가 `sys.platform` 을 읽음 |
| `asyncio` | `_run_orca_json` · `_terminate_orca_process` |
| `_write_exec_script` | `OrcaAdapter` 가 `from .base import` 로 가져옴 (모듈 지역 바인딩) |

앞 셋은 **공유 모듈 객체** 패치라 관대하고(어느 서브모듈에서 쓰든 먹는다), 네 번째는
모듈 지역이라 비관대다 — 그래서 경로가 `orca` 여야 한다. 넷 다 orca 가 갖는 이름이므로
한 줄 교체로 충족된다.
"""

from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))

from split_module import split  # noqa: E402

# ── 배정표 (AST 의존 실측 2026-08-09) ──────────────────────────────────
ASSIGNMENT: dict[str, str] = {
    # ── base.py — 공유 타입·메타데이터·어댑터 베이스·명령 조립 헬퍼 ──
    #    헬퍼 4종을 여기 모은다. `_write_exec_script` 는 adapters 와 orca 양쪽이
    #    쓰므로 공유 위치가 필요하고, 나머지도 같은 성격이라 흩지 않는다.
    "IS_DOCKER": "base",
    "TerminalType": "base",
    "TERMINAL_INFO": "base",
    "TerminalAdapter": "base",
    "_save_prompt_and_build_cmd": "base",
    "_build_full_command": "base",
    "_write_exec_script": "base",
    "_run_osascript": "base",
    # ── adapters.py — 터미널 앱별 어댑터 9종 ──
    "WarpAdapter": "adapters",
    "TmuxAdapter": "adapters",
    "TerminalAppAdapter": "adapters",
    "ITermAdapter": "adapters",
    "KittyAdapter": "adapters",
    "AlacrittyAdapter": "adapters",
    "GhosttyAdapter": "adapters",
    "WezTermAdapter": "adapters",
    "CmuxAdapter": "adapters",
    # ── orca.py — Orca IDE 어댑터와 그 CLI 프로토콜 ──
    #    테스트의 MODULE 상수가 겨냥하는 모듈이다 (위 표 참조).
    "_ORCA_TIMEOUT_SECONDS": "orca",
    "_ORCA_UNREGISTERED_ERROR_CODES": "orca",
    "_resolve_orca_command": "orca",
    "_OrcaResult": "orca",
    "_is_unregistered_worktree_error": "orca",
    "_parse_orca_payload": "orca",
    "_terminate_orca_process": "orca",
    "_run_orca_json": "orca",
    "OrcaAdapter": "orca",
    # ── service.py — 어댑터 선택·실행 오케스트레이션 + 싱글턴 홀더 ──
    "TerminalService": "service",
    "_terminal_service": "service",
    "get_terminal_service": "service",
}

MODULE_ORDER = ["base", "adapters", "orca", "service"]

DOCSTRINGS = {
    "base": (
        '"""터미널 어댑터 공유 기반 — 타입·메타데이터·베이스 클래스·명령 조립.\n\n'
        "`TERMINAL_INFO` 는 가변 dict 지만 사용처 전수가 **읽기뿐**이라 모듈을 갈라도\n"
        "안전하다(import 시점에 확장·변이하는 코드가 없다).\n\n"
        "`_write_exec_script` 는 adapters 와 orca 양쪽이 쓰는 공유 헬퍼다. orca 쪽\n"
        "테스트가 `services.terminal_service.orca._write_exec_script` 로 패치하는데,\n"
        "그것은 orca 모듈이 이 이름을 import 해 자기 전역에 바인딩하기 때문이다 —\n"
        '여기(base) 경로로 패치하면 orca 의 조회에는 먹지 않는다.\n"""'
    ),
    "adapters": (
        '"""터미널 앱별 어댑터 (Warp · tmux · Terminal.app · iTerm · Kitty ·\n'
        'Alacritty · Ghostty · WezTerm · cmux)."""'
    ),
    "orca": (
        '"""Orca IDE 어댑터와 그 CLI 프로토콜 (JSON 실행·타임아웃·에러 분류).\n\n'
        "테스트(`test_terminal_service_orca.py`)의 `MODULE` 상수가 겨냥하는 모듈이다.\n"
        "`shutil` · `sys` · `asyncio` · `_write_exec_script` 네 패치 타깃이 모두 여기\n"
        "모여 있어, 분할 후 그 상수 한 줄만 이 경로로 바꾸면 7회 이상의 패치가 한꺼번에\n"
        '유효해진다.\n"""'
    ),
    "service": (
        '"""TerminalService — 어댑터 선택·실행 오케스트레이션과 싱글턴 홀더.\n\n'
        "`_terminal_service` 는 `get_terminal_service` 가 `global` 로 재바인딩하므로\n"
        '반드시 같은 모듈에 있어야 한다 — 가르면 인스턴스 사본이 분열된다.\n"""'
    ),
}

# 소비자 실측: api/terminal.py:15 가 TERMINAL_INFO·TerminalType·get_terminal_service 를,
# tests/backend/test_terminal_service_orca.py:17 이 OrcaAdapter·TERMINAL_INFO·
# TerminalService·TerminalType·_resolve_orca_command 를 import 한다. 합집합 6종.
BARREL = (
    '"""터미널 서비스 패키지.\n\n'
    "원래 단일 `services/terminal_service.py`(867줄)를 분할한 결과.\n"
    "소비자의 `from services.terminal_service import TERMINAL_INFO` 는 그대로 유효하다.\n\n"
    "재노출은 **좁게** 한다 — 소비자가 실제로 요구하는 6종뿐이다.\n"
    "`shutil`·`sys`·`asyncio`·`_write_exec_script` 를 여기 두지 않는 것은 의도다:\n"
    "테스트의 패치는 그 이름들을 실제로 쓰는 `orca` 경로를 겨냥한다.\n"
    '"""\n\n'
    "from .base import TERMINAL_INFO, TerminalType\n"
    "from .orca import OrcaAdapter, _resolve_orca_command\n"
    "from .service import TerminalService, get_terminal_service\n\n"
    "__all__ = [\n"
    '    "TERMINAL_INFO",\n'
    '    "OrcaAdapter",\n'
    '    "TerminalService",\n'
    '    "TerminalType",\n'
    '    "_resolve_orca_command",\n'
    '    "get_terminal_service",\n'
    "]\n"
)


def main(argv: list[str]) -> int:
    if len(argv) != 3:
        print(__doc__)
        return 2
    return split(
        Path(argv[1]),
        Path(argv[2]),
        assignment=ASSIGNMENT,
        docstrings=DOCSTRINGS,
        module_order=MODULE_ORDER,
        barrel=BARREL,
    )


if __name__ == "__main__":
    sys.exit(main(sys.argv))
