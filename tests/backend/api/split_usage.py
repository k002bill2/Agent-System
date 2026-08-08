"""api/usage.py(1,244줄)를 도메인 모듈 5종으로 분할한다. (B5 Task 2)

    # CWD = repo 루트. <원본> 은 패키지 승격 **직전** 커밋에서 꺼낸 스냅샷
    git show <승격직전ref>:src/backend/api/usage.py > /tmp/orig.py
    src/backend/.venv/bin/python tests/backend/api/split_usage.py /tmp/orig.py src/backend/api/usage/

`split_audit.py`(검증) 옆에 이 파일(실행)이 있는 이유: **같은 도구를 두 번
잃었다.** Task 1 스크립트가 세션 scratchpad 에서 휘발됐고(STATE.md 기록),
Task 2 에서도 세션 *도중* 같은 일이 반복돼 재작성했다. 도구가 휘발하면
다음 태스크가 커버리지 단언 없이 손으로 자르게 된다 — 그게 이 배치가
막으려는 실패 형태다.

**Task 3·4·5 재사용법: `ASSIGNMENT` 와 `DOCSTRINGS` 만 교체한다.** 나머지
(커버리지 단언 · import 역산 · AnnAssign 분기 · split_audit 과 동일한 텍스트
추출 규칙)는 대상과 무관하게 그대로 쓴다. 배정을 짜는 규칙은 아래 참조.

> **Task 3(`orchestrator/nodes.py`) 주의**: 최상위 순회만으로는 부족하다.
> `try/except ImportError` 블록 안에 정의 4종이 있어 `tree.body` 만 보는
> 이 스크립트에는 **존재하지 않는 것처럼 보인다**. 착수 시 `_walk_body`
> 형태(컨테이너 노드 재귀 — `split_audit.py` 가 이미 그렇게 한다)로
> 확장할 것.

원칙 (B5 Task 1에서 검증된 레시피):
- **AST 이름 기반**. 라인 슬라이스 금지 — 도메인별로 묶으면 정의가 흩어져
  범위가 불연속이 되고, 추출과 검증이 같은 잘못된 범위를 쓰면 자기확인이 된다.
- **커버리지 단언**. 배정 누락·중복이면 아무것도 쓰지 않고 즉시 실패.
- **import 역산**. 각 모듈이 실제 참조하는 이름에서 계산한다.
- **AnnAssign 처리**. `_usage_cache: dict[...] = {...}` 는 ast.Assign 이 아니다.
  이 분기를 빠뜨리면 하필 가장 위험한 두 이름이 배정표에서 조용히 사라진다.

정의 텍스트 추출 규칙은 tests/backend/api/split_audit.py 와 **동일**하다
(데코레이터 포함). 다르면 검증이 본문 불일치를 오보한다.
"""

from __future__ import annotations

import ast
import sys
from pathlib import Path

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

# `logger` 는 배정표에 넣지 않는다 — 여러 모듈이 각자 정의하는 것이 정상이며
# split_audit 이 tolerate 한다. 실제 사용 모듈에만 삽입한다.
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

_DEF_NODES = (ast.FunctionDef, ast.AsyncFunctionDef, ast.ClassDef)


def main(argv: list[str]) -> int:
    if len(argv) != 3:
        print(__doc__)
        return 2
    src_path, pkg = Path(argv[1]), Path(argv[2])
    lines = src_path.read_text(encoding="utf-8").splitlines()
    tree = ast.parse("\n".join(lines))

    # ── 1. 원본 최상위 이름 수집 (AnnAssign 포함) ──────────────────────
    order: list[tuple[str, str]] = []
    seen: list[str] = []
    import_nodes: list[ast.Import | ast.ImportFrom] = []

    for node in tree.body:
        if isinstance(node, (ast.Import, ast.ImportFrom)):
            import_nodes.append(node)
            continue
        if isinstance(node, _DEF_NODES):
            start = min([d.lineno for d in node.decorator_list] + [node.lineno]) - 1
            names = [node.name]
        elif isinstance(node, ast.Assign):
            start = node.lineno - 1
            names = [t.id for t in node.targets if isinstance(t, ast.Name)]
        elif isinstance(node, ast.AnnAssign):  # ← 눈멀기 쉬운 분기
            start = node.lineno - 1
            names = [node.target.id] if isinstance(node.target, ast.Name) else []
        else:
            continue
        text = "\n".join(lines[start : node.end_lineno])
        for name in names:
            order.append((name, text))
            seen.append(name)

    # ── 2. 커버리지 단언 ──────────────────────────────────────────────
    src_names = {n for n in seen if n != "logger"}
    missing = sorted(src_names - set(ASSIGNMENT))
    extra = sorted(set(ASSIGNMENT) - src_names)
    dupes = sorted({n for n in seen if seen.count(n) > 1})
    if missing or extra or dupes:
        print("❌ 배정표 커버리지 실패 — 아무것도 쓰지 않고 중단한다")
        print(f"  원본에 있는데 배정표에 없음: {missing or '없음'}")
        print(f"  배정표에 있는데 원본에 없음: {extra or '없음'}")
        print(f"  원본 내 중복 정의:          {dupes or '없음'}")
        return 1
    print(f"✅ 커버리지 — 원본 최상위 이름 {len(src_names)}개 전부 배정됨 (중복 0)")

    # ── 3. import 바인딩 맵 ────────────────────────────────────────────
    binding: dict[str, str] = {}
    for node in import_nodes:
        if isinstance(node, ast.Import):
            for alias in node.names:
                bound = alias.asname or alias.name.split(".")[0]
                binding[bound] = f"import {alias.name}" + (
                    f" as {alias.asname}" if alias.asname else ""
                )
        else:
            for alias in node.names:
                bound = alias.asname or alias.name
                imported = alias.name + (f" as {alias.asname}" if alias.asname else "")
                binding[bound] = f"from {node.module} import {imported}"

    # ── 4. 모듈별 본문 배치 + import 역산 ──────────────────────────────
    bodies: dict[str, list[str]] = {m: [] for m in MODULE_ORDER}
    for name, text in order:
        if name == "logger":
            continue
        bodies[ASSIGNMENT[name]].append(text)

    def referenced(texts: list[str]) -> set[str]:
        """정의들이 실제 참조하는 이름. 눈으로 훑지 않는다."""
        used: set[str] = set()
        for text in texts:
            for node in ast.walk(ast.parse(text)):
                if isinstance(node, ast.Name):
                    used.add(node.id)
                elif isinstance(node, ast.Attribute) and isinstance(node.value, ast.Name):
                    used.add(node.value.id)
        return used

    for module in MODULE_ORDER:
        texts = bodies[module]
        used = referenced(texts)
        std_imports = sorted({binding[n] for n in used & set(binding)})

        cross: dict[str, list[str]] = {}
        for name in sorted(used & set(ASSIGNMENT)):
            if ASSIGNMENT[name] != module:
                cross.setdefault(ASSIGNMENT[name], []).append(name)

        needs_logger = "logger" in used
        if needs_logger:
            std_imports = sorted({*std_imports, "import logging"})

        parts = [DOCSTRINGS[module], ""]
        parts += std_imports
        if cross:
            parts.append("")
            parts += [
                f"from .{owner} import {', '.join(cross[owner])}"
                for owner in MODULE_ORDER
                if owner in cross
            ]
        parts.append("")
        if needs_logger:
            parts += ["logger = logging.getLogger(__name__)", ""]
        parts.append("")
        parts.append("\n\n\n".join(texts))
        parts.append("")

        target = pkg / f"{module}.py"
        target.write_text("\n".join(parts), encoding="utf-8")
        n = len(target.read_text(encoding="utf-8").splitlines())
        print(
            f"  {module + '.py':<14} {len(texts):>3}개 정의  {n:>4}줄{'' if n <= 800 else '  ⚠️ 800 초과'}"
        )

    # ── 5. __init__.py — 소비자가 실제 요구하는 것만 재노출 ─────────────
    (pkg / "__init__.py").write_text(
        '"""Usage API 패키지.\n\n'
        "원래 단일 `api/usage.py`(1,244줄)를 도메인별로 분할한 결과.\n"
        "소비자의 `from api.usage import router` 는 그대로 유효하다.\n\n"
        "재노출은 **좁게** 한다 — 실측상 외부 소비자는 `api/app.py:89` 의\n"
        "`router` 하나뿐이다. 이동한 이름까지 별칭으로 재노출하면\n"
        "`monkeypatch.setattr(usage_mod, ...)` 가 별칭만 갈아끼우고 정작 그\n"
        "이름을 읽는 서브모듈은 원본을 계속 봐서 테스트가 조용히 통과한다.\n"
        '"""\n\n'
        "from .routes import router\n\n"
        '__all__ = ["router"]\n',
        encoding="utf-8",
    )
    print(f"  {'__init__.py':<14}   0개 정의   (router 재노출만)")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
