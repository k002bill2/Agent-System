"""모듈 → 패키지 분할 엔진. 배정표는 호출 측이 준다 (`split_usage.py` 참조).

B5 Task 1~2 에서 검증된 레시피를 코드로 굳힌 것이다. `split_audit.py`(검증)와
짝을 이루며, 이쪽이 **실행**을 맡는다.

## 왜 배정 단위가 '정의'가 아니라 '최상위 문장'인가 (Task 3 에서 드러났다)

Task 2(`api/usage.py`)는 최상위 정의가 서로 독립이라 정의 단위 배정으로 충분했다.
`orchestrator/nodes.py` 는 다르다:

    try:
        from services.rag_service import get_project_context
        RAG_AVAILABLE = True
    except ImportError:
        RAG_AVAILABLE = False
        def get_project_context(*args, **kwargs):
            return ""

이 블록은 **원자 단위**다. `RAG_AVAILABLE` 과 `get_project_context` 를 다른 모듈로
보내면 graceful degradation 구조 자체가 깨진다. 그래서 배정 단위를 최상위 문장으로
올리고, **한 문장이 정의하는 모든 이름은 같은 모듈로 가야 한다**고 단언한다 —
블록을 쪼개는 실수를 사람 눈이 아니라 기계가 잡는다.

같은 이유로 중복 판정도 문장 인지형이다. `RAG_AVAILABLE` 은 try 와 except 양쪽에
나오지만 **같은 문장 안**이므로 중복이 아니다. 서로 다른 최상위 문장에서 같은 이름이
나오면 그때가 진짜 중복이다.

## 불변식

- **AST 이름 기반**. 라인 슬라이스를 쓰지 않는다 — 도메인별로 묶으면 정의가 흩어져
  범위가 불연속이 되고, 추출과 검증이 같은 잘못된 범위를 쓰면 자기확인이 된다
  (B2 `claude_sessions` 에서 `return results` 유실이 IDENTICAL 로 통과했다).
- **커버리지 단언**. 배정 누락·초과·중복·문장 분할이면 **아무것도 쓰지 않고** 중단.
- **import 역산**. 각 모듈이 실제 참조하는 이름에서 계산한다. 눈으로 훑지 않는다.
- **AnnAssign 분기**. `_usage_cache: dict[...] = {...}` 는 `ast.Assign` 이 아니다.
  이 분기가 없으면 하필 가장 위험한 이름(모듈 레벨 캐시)이 조용히 누락된다.
- **정의 텍스트 추출 규칙은 `split_audit.py` 와 동일**(데코레이터 포함). 다르면
  검증이 본문 불일치를 오보한다.
"""

from __future__ import annotations

import ast
from pathlib import Path

_DEF_NODES = (ast.FunctionDef, ast.AsyncFunctionDef, ast.ClassDef)
# 최상단에서 정의를 감쌀 수 있는 노드. `split_audit.py` 의 목록과 같아야 한다.
_CONTAINER_NODES = (ast.If, ast.Try, ast.With, ast.AsyncWith, ast.For, ast.While)


def statement_names(node: ast.stmt) -> list[str]:
    """이 최상위 문장이 정의하는 이름 전부 (컨테이너 내부까지, 함수 안으로는 안 들어감)."""
    out: list[str] = []

    def walk(body: list[ast.stmt]) -> None:
        for n in body:
            if isinstance(n, _DEF_NODES):
                out.append(n.name)
            elif isinstance(n, ast.Assign):
                out.extend(t.id for t in n.targets if isinstance(t, ast.Name))
            elif isinstance(n, ast.AnnAssign):
                if isinstance(n.target, ast.Name):
                    out.append(n.target.id)
            elif isinstance(n, _CONTAINER_NODES):
                walk(n.body)
                walk(getattr(n, "orelse", []))
                walk(getattr(n, "finalbody", []))
                for handler in getattr(n, "handlers", []):
                    walk(handler.body)

    walk([node])
    return out


def _referenced(texts: list[str]) -> set[str]:
    """본문들이 실제 참조하는 이름. import 역산의 입력이다."""
    used: set[str] = set()
    for text in texts:
        for node in ast.walk(ast.parse(text)):
            if isinstance(node, ast.Name):
                used.add(node.id)
            elif isinstance(node, ast.Attribute) and isinstance(node.value, ast.Name):
                used.add(node.value.id)
    return used


def split(
    src_path: Path,
    pkg: Path,
    *,
    assignment: dict[str, str],
    docstrings: dict[str, str],
    module_order: list[str],
    barrel: str,
    tolerate: frozenset[str] = frozenset({"logger"}),
) -> int:
    """분할을 실행한다. 0 = 성공, 1 = 커버리지 실패(아무것도 쓰지 않음).

    `tolerate` 의 이름은 배정표에서 제외한다 — `logger` 처럼 모듈마다 하나씩
    있는 것이 정상인 이름이다(`split_audit.py` 도 같은 이름을 tolerate 한다).
    """
    lines = src_path.read_text(encoding="utf-8").splitlines()
    tree = ast.parse("\n".join(lines))

    # ── 1. 최상위 문장 수집 ────────────────────────────────────────────
    stmts: list[tuple[list[str], str]] = []  # (정의하는 이름들, 소스 텍스트)
    binding: dict[str, str] = {}  # 컨테이너 **밖** 최상위 import 만

    for node in tree.body:
        if isinstance(node, ast.Import):
            for alias in node.names:
                bound = alias.asname or alias.name.split(".")[0]
                suffix = f" as {alias.asname}" if alias.asname else ""
                binding[bound] = f"import {alias.name}{suffix}"
            continue
        if isinstance(node, ast.ImportFrom):
            for alias in node.names:
                bound = alias.asname or alias.name
                suffix = f" as {alias.asname}" if alias.asname else ""
                binding[bound] = f"from {node.module} import {alias.name}{suffix}"
            continue
        names = [n for n in statement_names(node) if n not in tolerate]
        if not names:
            continue  # 모듈 docstring 등
        start = min([d.lineno for d in getattr(node, "decorator_list", [])] + [node.lineno]) - 1
        stmts.append((names, "\n".join(lines[start : node.end_lineno])))

    # ── 2. 커버리지 단언 ──────────────────────────────────────────────
    all_names = [n for names, _ in stmts for n in names]
    # 같은 문장 안의 반복은 중복이 아니다 (try/except 양쪽의 RAG_AVAILABLE).
    per_stmt_unique = [(n, i) for i, (names, _) in enumerate(stmts) for n in set(names)]
    cross_stmt_dupes = sorted(
        {n for n, _ in per_stmt_unique if [x for x, _ in per_stmt_unique].count(n) > 1}
    )

    missing = sorted(set(all_names) - set(assignment))
    extra = sorted(set(assignment) - set(all_names))
    # 한 문장의 이름들이 서로 다른 모듈로 갈리면 그 문장이 쪼개진다.
    torn = [
        (sorted(set(names)), sorted({assignment[n] for n in names if n in assignment}))
        for names, _ in stmts
        if len({assignment[n] for n in names if n in assignment}) > 1
    ]

    if missing or extra or cross_stmt_dupes or torn:
        print("❌ 배정표 커버리지 실패 — 아무것도 쓰지 않고 중단한다")
        print(f"  원본에 있는데 배정표에 없음: {missing or '없음'}")
        print(f"  배정표에 있는데 원본에 없음: {extra or '없음'}")
        print(f"  서로 다른 문장에서 중복 정의: {cross_stmt_dupes or '없음'}")
        for names, mods in torn:
            print(f"  ⚠️ 한 문장이 쪼개짐: {names} → {mods} (원자 단위를 가를 수 없다)")
        return 1

    unknown_module = sorted({m for m in assignment.values() if m not in module_order})
    if unknown_module:
        print(f"❌ 배정표가 module_order 에 없는 모듈을 가리킨다: {unknown_module}")
        return 1

    print(f"✅ 커버리지 — 최상위 이름 {len(set(all_names))}개 / 문장 {len(stmts)}개 전부 배정됨")

    # ── 3. 모듈별 본문 배치 + import 역산 ──────────────────────────────
    bodies: dict[str, list[str]] = {m: [] for m in module_order}
    for names, text in stmts:
        bodies[assignment[names[0]]].append(text)

    for module in module_order:
        texts = bodies[module]
        used = _referenced(texts)
        std_imports = sorted({binding[n] for n in used & set(binding)})

        cross: dict[str, list[str]] = {}
        for name in sorted(used & set(assignment)):
            if assignment[name] != module:
                cross.setdefault(assignment[name], []).append(name)

        needs_logger = "logger" in used
        if needs_logger:
            std_imports = sorted({*std_imports, "import logging"})

        parts = [docstrings[module], ""]
        parts += std_imports
        if cross:
            parts.append("")
            parts += [
                f"from .{owner} import {', '.join(cross[owner])}"
                for owner in module_order
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
        over = "" if n <= 800 else "  ⚠️ 800 초과"
        print(f"  {module + '.py':<18} {len(texts):>3}문장  {n:>4}줄{over}")

    # ── 4. 배럴 — 소비자가 실제 요구하는 것만 재노출 ────────────────────
    #   전체 재노출은 하지 않는다. `__init__` 이 이동한 이름의 별칭을 만들면
    #   `monkeypatch.setattr(pkg, "X", ...)` 가 별칭만 갈아끼우고, 정작 X 를
    #   읽는 서브모듈은 자기 전역의 원본을 계속 봐서 테스트가 조용히 통과한다.
    (pkg / "__init__.py").write_text(barrel, encoding="utf-8")
    print(f"  {'__init__.py':<18}   0문장  (소비자 요구분만 재노출)")
    return 0
