"""Tmux session management service for Claude Code CLI execution.

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
