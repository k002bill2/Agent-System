"""api/usage.py(1,244줄) → 도메인 모듈 5종 분할 배정표. (B5 Task 2)

    # CWD = repo 루트. <원본> 은 패키지 승격 **직전** 커밋에서 꺼낸 스냅샷
    git show <승격직전ref>:src/backend/api/usage.py > /tmp/orig.py
    src/backend/.venv/bin/python tests/backend/api/split_usage.py /tmp/orig.py src/backend/api/usage/

실행 로직은 `split_module.py` 에 있다. 이 파일은 **배정표와 그 근거**만 담는다 —
Task 3·4·5 는 이 파일을 본떠 배정표만 새로 쓴다.

`split_audit.py`(검증) 옆에 이 파일들이 있는 이유: **같은 도구를 두 번 잃었다.**
Task 1 스크립트가 세션 scratchpad 에서 휘발됐고(STATE.md 기록), Task 2 에서도
세션 *도중* 반복돼 재작성했다. 도구가 휘발하면 다음 태스크가 커버리지 단언 없이
손으로 자르게 된다 — 그게 이 배치가 막으려는 실패 형태다.
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
# 소스의 mutation 패턴만 보면 판정을 그르친다 — `_codex_plan_cache` 는 소스에서
# 첨자 대입만 하지만(모듈에 `global` 문 없음) 테스트는 dict 를 통째로 갈아끼운다
# (test_usage_jsonl.py:412·480·501). 재바인딩이 개입하는 순간 읽는 쪽이 갈리면
# 한쪽은 옛 dict 를 계속 본다. 그래서 캐시·헬퍼·라우트를 routes 로 모은다.
ASSIGNMENT: dict[str, str] = {
    # ── models.py — Pydantic 응답 스키마 ──
    "DailyActivity": "models",
    "DailyModelTokens": "models",
    "ModelUsage": "models",
    "PlanLimitInfo": "models",
    "UsageResponse": "models",
    "CodexUsageBreakdown": "models",
    "CodexCliUsageResponse": "models",
    "CodexPlanWindow": "models",
    "CodexPlanLimitSnapshot": "models",
    "CodexPlanUsageResponse": "models",
    "ClaudeConfigUpdate": "models",
    # ── jsonl.py — 로컬 세션 파일 집계 ──
    "STATS_CACHE_PATH": "jsonl",
    "CLAUDE_PROJECTS_DIR": "jsonl",
    "JSONL_TOKEN_CACHE_PATH": "jsonl",
    "JSONL_TOKEN_CACHE_TTL_SECONDS": "jsonl",
    "load_stats_cache": "jsonl",
    "_read_jsonl_token_cache": "jsonl",
    "_write_jsonl_token_cache": "jsonl",
    "aggregate_model_tokens_from_jsonl": "jsonl",
    # ── anthropic.py — OAuth·원격 usage API·응답 캐시 ──
    #    `_usage_cache` 는 `global` 재바인딩 + 테스트 재바인딩 양쪽이지만
    #    읽는 함수 둘(_load/_save)이 여기 함께 있어 분열하지 않는다.
    "ANTHROPIC_USAGE_API": "anthropic",
    "USAGE_CACHE_PATH": "anthropic",
    "_usage_cache": "anthropic",
    "CACHE_TTL_SECONDS": "anthropic",
    "CACHE_STALE_SECONDS": "anthropic",
    "USAGE_FETCH_MAX_ATTEMPTS": "anthropic",
    "USAGE_FETCH_TIMEOUT_SECONDS": "anthropic",
    "USAGE_FETCH_BACKOFF_SECONDS": "anthropic",
    "_load_usage_cache": "anthropic",
    "_save_usage_cache": "anthropic",
    "_is_cache_valid": "anthropic",
    "_is_cache_usable": "anthropic",
    "_get_cache_age_minutes": "anthropic",
    "get_oauth_token": "anthropic",
    "fetch_usage_from_anthropic": "anthropic",
    "parse_reset_time": "anthropic",
    "calculate_weekly_tokens": "anthropic",
    # ── codex.py — Codex CLI 상태 DB·app-server rate limit 파싱 (순수 파서) ──
    "CODEX_STATE_DB_PATH": "codex",
    "CODEX_APP_SERVER_BIN": "codex",
    "CODEX_APP_SERVER_TIMEOUT_SECONDS": "codex",
    "_codex_source_name": "codex",
    "_codex_usage_totals": "codex",
    "_codex_usage_by_model": "codex",
    "_codex_usage_by_source": "codex",
    "_coerce_percent": "codex",
    "_parse_codex_rate_limit_window": "codex",
    "_parse_codex_limit_snapshot": "codex",
    "_select_codex_limit_snapshot": "codex",
    "_parse_codex_rate_limits_response": "codex",
    "_read_codex_app_server_rate_limits": "codex",
    "_extract_codex_rate_limit_response_line": "codex",
    # ── routes.py — HTTP 표면 7개 + codex plan 캐시 ──
    #    라우트는 원본 선언 순서를 한 모듈에 그대로 유지해 등록 순서가 완전히
    #    보존된다(include_router 조립 불필요).
    #    `_codex_plan_cache` 3종이 여기 있는 이유는 위 배정표 주석 참조.
    "CODEX_PLAN_CACHE_TTL_SECONDS": "routes",
    "_codex_plan_cache": "routes",
    "_cached_codex_plan_response": "routes",
    "router": "routes",
    "get_usage": "routes",
    "get_codex_cli_usage": "routes",
    "get_codex_plan_usage": "routes",
    "get_raw_stats": "routes",
    "test_oauth": "routes",
    "get_config": "routes",
    "put_config": "routes",
}

MODULE_ORDER = ["models", "jsonl", "anthropic", "codex", "routes"]

DOCSTRINGS = {
    "models": '"""Usage API 응답 스키마 (Pydantic)."""',
    "jsonl": '"""Claude 로컬 세션 JSONL 집계와 그 디스크 캐시."""',
    "anthropic": (
        '"""Anthropic OAuth usage API 연동과 응답 캐시.\n\n'
        "`_usage_cache` 는 `global` 로 재바인딩되므로 `_load_usage_cache` ·\n"
        "`_save_usage_cache` 와 반드시 같은 모듈에 있어야 한다 — 가르면 캐시\n"
        '사본이 분열된다(ruff·mypy·테스트를 모두 통과한 채로).\n"""'
    ),
    "codex": (
        '"""Codex CLI 사용량 — 상태 DB 조회와 app-server rate limit 파싱.\n\n'
        "순수 파서만 둔다. plan 응답 캐시(`_codex_plan_cache`)는 그것을 읽는\n"
        '라우트와 갈리지 않도록 routes.py 에 있다.\n"""'
    ),
    "routes": (
        '"""Usage API 라우트 7개.\n\n'
        "원본 선언 순서를 한 모듈에 그대로 유지한다 — `include_router` 조립을\n"
        "피해 라우트 등록 순서가 완전히 보존된다.\n\n"
        "`_codex_plan_cache` 와 `_cached_codex_plan_response` 가 여기 있는 것은\n"
        "설계다. 테스트가 그 dict 를 통째로 갈아끼우므로(재바인딩), 읽는 쪽이\n"
        '`get_codex_plan_usage` 와 갈리면 한쪽이 옛 dict 를 계속 본다.\n"""'
    ),
}

BARREL = (
    '"""Usage API 패키지.\n\n'
    "원래 단일 `api/usage.py`(1,244줄)를 도메인별로 분할한 결과.\n"
    "소비자의 `from api.usage import router` 는 그대로 유효하다.\n\n"
    "재노출은 **좁게** 한다 — 실측상 외부 소비자는 `api/app.py:89` 의\n"
    "`router` 하나뿐이다. 이동한 이름까지 별칭으로 재노출하면\n"
    "`monkeypatch.setattr(usage_mod, ...)` 가 별칭만 갈아끼우고 정작 그\n"
    "이름을 읽는 서브모듈은 원본을 계속 봐서 테스트가 조용히 통과한다.\n"
    '"""\n\n'
    "from .routes import router\n\n"
    '__all__ = ["router"]\n'
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
