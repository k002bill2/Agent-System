"""분할 전 원본과 분할 결과 패키지가 **같은 코드**인지 이름별로 대조한다.

`route_table.py` 가 HTTP 표면(라우트 유실·개명·가림)을 지키는 반면, 이 도구는
**핸들러 본문**을 지킨다. 두 그물이 잡는 것이 다르다 — 라우트 테이블은
`return` 한 줄이 사라져도 통과한다.

## 왜 라인 범위 diff 로는 부족한가 (2026-08-08 실측)

`claude_sessions` 분할에서 `summaries.generate_batch_summaries` 의 마지막
`return results` 가 슬라이스 범위 밖으로 밀려 **사라졌다.** 그때 쓴 검증은

    diff <(원본 sed -n '272,411p') <(새 모듈 tail)

였는데, 추출과 검증이 **같은 잘못된 범위**를 썼으므로 IDENTICAL 이 나왔다.
자기 확인이라 그물이 아니었다. 잡은 것은 mypy 의 `Missing return statement`
하나뿐이고, 그 엔드포인트는 테스트가 0건이었다.

mypy 에 기대는 것은 우연이다 — 반환 애노테이션이 Optional 이거나 앞에서 이미
`return` 한 함수라면 마지막 줄이 사라져도 mypy 는 조용하다. `else:` 가지나
`raise` 한 줄이 사라지는 경우도 ruff·mypy·라우트 테이블을 전부 통과한다.

그래서 이 도구는 **라인 산술을 쓰지 않는다.** 양쪽을 독립적으로 AST 파싱해
정의를 이름으로 매칭하고 소스 텍스트를 비교한다.

## 사용법

    # CWD = repo 루트
    git show <분할전-ref>:src/backend/api/<name>.py > /tmp/orig.py
    python3 tests/backend/api/split_audit.py /tmp/orig.py src/backend/api/<name>/

`<분할전-ref>` 는 **패키지 승격 직전** 커밋이어야 한다 — 승격 커밋 이후를
쓰면 이미 옮겨진 상태와 비교하게 된다.

exit 0 = 유실·추가·본문 불일치·중복 정의 0건. 그 외는 1과 함께 진단을 낸다.
"""

from __future__ import annotations

import ast
import difflib
import sys
from pathlib import Path

# 모듈 최상단에서 정의를 감쌀 수 있는 노드. 이들 안의 def/class 도 원본의
# 일부이므로 재귀해야 한다 — `if TYPE_CHECKING:` · `try: ... except ImportError:`
# 안의 정의를 놓치면 "유실 0건" 이 거짓이 된다.
_CONTAINER_NODES = (ast.If, ast.Try, ast.With, ast.AsyncWith, ast.For, ast.While)

_DEF_NODES = (ast.FunctionDef, ast.AsyncFunctionDef, ast.ClassDef)


def _walk_body(body: list[ast.stmt]):
    """컨테이너 노드를 뚫고 정의·할당 노드를 낸다 (함수 **안**으로는 안 들어간다).

    함수 내부의 중첩 def(`event_generator` 같은)는 바깥 함수의 소스 텍스트에
    포함되므로 따로 낼 필요가 없다. 오히려 따로 내면 같은 코드를 두 번 비교해
    중복 정의로 오판한다.
    """
    for node in body:
        if isinstance(node, _DEF_NODES + (ast.Assign, ast.AnnAssign)):
            yield node
        elif isinstance(node, _CONTAINER_NODES):
            yield from _walk_body(node.body)
            yield from _walk_body(getattr(node, "orelse", []))
            yield from _walk_body(getattr(node, "finalbody", []))
            for handler in getattr(node, "handlers", []):
                yield from _walk_body(handler.body)


def definitions(path: Path) -> dict[str, str]:
    """이름 -> 소스 텍스트(데코레이터 포함). def·class 만."""
    lines = path.read_text(encoding="utf-8").splitlines()
    out: dict[str, str] = {}
    for node in _walk_body(ast.parse("\n".join(lines)).body):
        if not isinstance(node, _DEF_NODES):
            continue
        start = min([d.lineno for d in node.decorator_list] + [node.lineno]) - 1
        out[node.name] = "\n".join(lines[start : node.end_lineno])
    return out


def assignments(path: Path) -> dict[str, str]:
    """이름 -> 소스 텍스트. 모듈 레벨 할당만 (캐시 인스턴스·락·타입 별칭)."""
    lines = path.read_text(encoding="utf-8").splitlines()
    out: dict[str, str] = {}
    for node in _walk_body(ast.parse("\n".join(lines)).body):
        if not isinstance(node, ast.Assign | ast.AnnAssign):
            continue
        targets = node.targets if isinstance(node, ast.Assign) else [node.target]
        for target in targets:
            if isinstance(target, ast.Name):
                out[target.id] = "\n".join(lines[node.lineno - 1 : node.end_lineno])
    return out


def _collect_package(
    package: Path, extract, *, skip: frozenset[str] = frozenset({"__init__.py"})
) -> tuple[dict[str, str], dict[str, str], list[str]]:
    """패키지 전 모듈에서 수집. (이름->텍스트, 이름->소유모듈, 중복 목록)."""
    merged: dict[str, str] = {}
    owner: dict[str, str] = {}
    duplicates: list[str] = []
    for module in sorted(package.glob("*.py")):
        if module.name in skip:
            continue
        for name, text in extract(module).items():
            if name in merged:
                duplicates.append(f"{name} ({owner[name]} · {module.name})")
            merged[name] = text
            owner[name] = module.name
    return merged, owner, duplicates


def audit(original: Path, package: Path) -> int:
    """대조 결과를 출력하고 문제 건수를 반환한다."""
    problems = 0

    for label, extract, tolerate in (
        ("정의(def·class)", definitions, frozenset()),
        # `router` 는 분할 후 모듈마다 값이 다르다 — 집계 라우터만 prefix 를
        # 갖고 하위는 `APIRouter()` 다. 이는 설계이며 route_table 의
        # test_router_prefix_and_tags_unchanged 가 따로 지킨다.
        ("모듈레벨 할당", assignments, frozenset({"router", "logger"})),
    ):
        orig = extract(original)
        new, owner, all_duplicates = _collect_package(package, extract)

        # `router` · `logger` 는 모듈마다 하나씩 있는 것이 정상이다.
        duplicates = [d for d in all_duplicates if d.split(" ", 1)[0] not in tolerate]

        missing = sorted(set(orig) - set(new))
        added = sorted(set(new) - set(orig))
        differing = sorted(
            n for n in set(orig) & set(new) if n not in tolerate and orig[n] != new[n]
        )

        print(f"\n=== {label} — 원본 {len(orig)}개 / 분할 후 {len(new)}개 ===")
        print(f"  유실:      {missing or '없음'}")
        print(f"  추가:      {added or '없음'}")
        print(f"  중복 정의: {duplicates or '없음'}")
        print(f"  본문 불일치: {differing or '없음'}")

        for name in differing:
            print(f"\n--- {name} ({owner[name]}) ---")
            diff = difflib.unified_diff(
                orig[name].splitlines(), new[name].splitlines(), "원본", "분할후", lineterm=""
            )
            for line in list(diff)[:40]:
                print(line)

        problems += len(missing) + len(added) + len(duplicates) + len(differing)

    return problems


def main(argv: list[str]) -> int:
    if len(argv) != 3:
        print(__doc__)
        return 2
    problems = audit(Path(argv[1]), Path(argv[2]))
    print(f"\n{'✅ 문제 0건' if problems == 0 else f'❌ 문제 {problems}건'}")
    return 0 if problems == 0 else 1


if __name__ == "__main__":
    sys.exit(main(sys.argv))
