"""services/tmux_service.py(920줄) → 도메인 모듈 3종 분할 배정표. (B5.5 Task 2)

    # CWD = repo 루트. <원본> 은 패키지 승격 **직전** 커밋에서 꺼낸 스냅샷
    git show <승격직전ref>:src/backend/services/tmux_service.py > /tmp/orig.py
    src/backend/.venv/bin/python tests/backend/api/split_tmux.py \
        /tmp/orig.py src/backend/services/tmux_service/

실행 로직은 `split_module.py` 에 있다. 이 파일은 **배정표와 그 근거**만 담는다.

이 파일이 B5.5 의 나머지(`merge_service` · `notification_service` ·
`playground_service`)와 다른 점은 **모듈 지역 패치 타깃 2 종**이다. 아래 참조.
"""

from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))

from split_module import split  # noqa: E402

# ── 배정표: 이름 -> 모듈 ────────────────────────────────────────────────
#
# 하중 지지대 규칙: **테스트가 `monkeypatch.setattr` 로 재바인딩하는 이름은,
# 그것을 읽는 함수 전부와 같은 모듈에 있어야 한다.**
#
# 이 파일의 패치 타깃 4 건은 전부 **모듈 지역 심볼 2 종**을 겨냥한다
# (`tests/backend/test_llm_usage_instrumentation.py:617·675·677·1193):
#
#     services.tmux_service.record_usage_best_effort                  (3건)
#     services.tmux_service.enforce_usage_quota_preflight_best_effort (1건)
#
# 둘 다 `services.llm_usage_ledger_service` 에서 tmux_service 네임스페이스로
# 가져온 이름이고, 읽는 쪽은 `_record_tmux_cli_usage` · `_enforce_tmux_quota_preflight`
# 뿐이다. 그래서 읽는 함수 둘을 같은 모듈(`usage`)에 두고, **배럴은 그 두 이름을
# 재노출하지 않는다.** 재노출하면 패치는 성공하되 서브모듈의 전역은 원본을 계속
# 봐서 조용히 무효가 된다. 재노출하지 않으면 낡은 패치 경로가 `setattr` 줄에서
# `AttributeError` 로 즉시 죽는다 — 실패가 자기 위치를 가리킨다.
#
# 모듈 레벨 상태 실측: `global` 재바인딩은 `get_tmux_service` 의 `_tmux_service`
# 하나뿐이고 외부 writer 는 0 건이다(`grep -rn '_tmux_service' src/ tests/`).
# 싱글턴과 그 접근자를 같은 모듈에 두면 분열하지 않는다 — 배럴은 접근자 **함수**만
# 재노출하고 `_tmux_service` 자체는 재노출하지 않는다(스냅샷 버그 회피).
ASSIGNMENT: dict[str, str] = {
    # ── models.py — Pydantic 스키마 2종 (모듈 지역 의존 0) ──
    "ClaudeAuthStatus": "models",
    "TmuxSessionInfo": "models",
    # ── usage.py — CLI usage 메타데이터 파서 + 원장 기록 브리지 ──
    #    패치 타깃 2 종을 읽는 함수가 전부 여기 있다(위 주석 참조).
    "_usage_context_value": "usage",
    "_usage_context_metadata": "usage",
    "_estimate_prompt_tokens": "usage",
    "_compact_text": "usage",
    "_as_int": "usage",
    "_as_float": "usage",
    "_first_int": "usage",
    "_first_float": "usage",
    "_merge_usage_dict": "usage",
    "_iter_usage_dicts": "usage",
    "_extract_labeled_usage": "usage",
    "parse_claude_cli_usage_metadata": "usage",
    "_enforce_tmux_quota_preflight": "usage",
    "_record_tmux_cli_usage": "usage",
    "_schedule_tmux_cli_usage": "usage",
    # ── service.py — tmux 세션 수명주기 + 싱글턴 ──
    "TmuxService": "service",
    "_tmux_service": "service",
    "get_tmux_service": "service",
}

MODULE_ORDER = ["models", "usage", "service"]

DOCSTRINGS = {
    "models": '"""tmux 세션 정보와 Claude CLI 인증 상태 스키마 (Pydantic)."""',
    "usage": (
        '"""Claude CLI usage 메타데이터 파싱과 LLM 원장 기록 브리지.\n\n'
        "`record_usage_best_effort` · `enforce_usage_quota_preflight_best_effort` 를\n"
        "읽는 함수가 전부 이 모듈에 있다. 테스트는 그 둘을\n"
        "`services.tmux_service.usage.<이름>` 으로 패치한다 — 읽는 쪽을 다른\n"
        '모듈로 가르면 패치가 조용히 무효가 된다.\n"""'
    ),
    "service": (
        '"""tmux 세션 기반 Claude Code CLI 실행 관리와 그 싱글턴.\n\n'
        "`_tmux_service` 는 `get_tmux_service` 안에서 `global` 로 재바인딩되므로\n"
        '반드시 그 접근자와 같은 모듈에 있어야 한다 — 가르면 싱글턴이 분열한다.\n"""'
    ),
}

BARREL = '''"""Tmux session management service for Claude Code CLI execution.

Manages tmux sessions that run Claude Code CLI in print mode (-p),
enabling real-time output capture via `tmux capture-pane`.

Usage:
- Task Analyzer produces an analysis → build_claude_prompt() converts to instructions
- execute_analysis() creates a tmux session and runs `claude -p "prompt"`
- Dashboard polls capture_output() for live terminal output

원래 단일 `services/tmux_service.py`(920줄)를 도메인별로 분할한 결과.
소비자의 `from services.tmux_service import get_tmux_service` 는 그대로 유효하다.

재노출은 **좁게** 한다 — 여기 있는 것은 실측된 import 사이트가 요구하는
이름(`get_tmux_service` · `TmuxService` · `TmuxSessionInfo` ·
`parse_claude_cli_usage_metadata`)과, 공개 메서드 `TmuxService.check_claude_auth`
의 반환 타입인 `ClaudeAuthStatus` 뿐이다.

**의도적으로 빠진 것**: `record_usage_best_effort` ·
`enforce_usage_quota_preflight_best_effort`. 원장 심볼이라 이 패키지의 공개
표면이 아니고, 재노출하면 낡은 패치 경로(`services.tmux_service.<이름>`)가
성공하되 무효가 된다. 빠져 있으면 `monkeypatch.setattr` 이 그 자리에서
`AttributeError` 로 죽어 실패가 자기 위치를 가리킨다.

**`_tmux_service` 도 빠져 있다** — 싱글턴은 `global` 로 재바인딩되므로 배럴이
값을 재노출하면 `None` 스냅샷이 영구히 남는다. 접근자 함수만 내보낸다.
"""

from .models import ClaudeAuthStatus, TmuxSessionInfo
from .service import TmuxService, get_tmux_service
from .usage import parse_claude_cli_usage_metadata

__all__ = [
    "ClaudeAuthStatus",
    "TmuxService",
    "TmuxSessionInfo",
    "get_tmux_service",
    "parse_claude_cli_usage_metadata",
]
'''


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
