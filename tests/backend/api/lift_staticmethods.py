"""클래스의 `@staticmethod` 를 모듈 레벨 함수로 들어올린다 (분할 2 단계용).

파일 분할의 1 단계(정의 이동)로 한도에 못 들어가는 파일이 있다 — 최대 클래스
하나가 이미 800 줄을 넘는 경우다. 그때 필요한 것이 메서드 추출인데, 클래스 전체가
`@staticmethod` 라면 그것은 **네임스페이스**이므로 다음이 성립한다:

    class C:
        @staticmethod
        def f(x): ...          →      def f(x): ...          # 모듈 레벨
                                      class C:
                                          f = staticmethod(f)

`C.f(x)` 호출 형태가 완전히 보존되고, 함수 본문은 **디덴트와 한정 참조 제거를
빼면 바이트 그대로**다. 그 두 가지 외의 변경이 생기면 이 도구가 중단한다 —
"순수 이동" 이라고 말하면서 몰래 뭔가를 고치는 것이 이 단계의 실패 형태다.

    lift_staticmethods.py <src> <class> <method> [<method> ...] > <out>

`split_module.py`(정의 이동)의 **앞** 단계다. 여기서 나온 파일을 그 엔진에 넣는다.
"""

from __future__ import annotations

import ast
import re
import sys
import textwrap
from pathlib import Path


def _method_span(node: ast.stmt) -> tuple[int, int]:
    start = min([d.lineno for d in getattr(node, "decorator_list", [])] + [node.lineno])
    return start, node.end_lineno


def lift(source: str, class_name: str, names: list[str]) -> str:
    """`names` 를 `class_name` 밖으로 들어올린 소스를 반환한다."""
    lines = source.splitlines()
    tree = ast.parse(source)

    cls = next(
        (n for n in tree.body if isinstance(n, ast.ClassDef) and n.name == class_name),
        None,
    )
    if cls is None:
        raise SystemExit(f"❌ 클래스 {class_name} 를 찾지 못했다")

    methods = {
        m.name: m
        for m in cls.body
        if isinstance(m, (ast.FunctionDef, ast.AsyncFunctionDef)) and m.name in names
    }
    missing = sorted(set(names) - set(methods))
    if missing:
        raise SystemExit(f"❌ {class_name} 에 없는 메서드: {missing}")

    # 전부 @staticmethod 여야 한다 — 아니면 self/cls 를 쓰므로 들어올릴 수 없다.
    not_static = sorted(
        name
        for name, m in methods.items()
        if not any(isinstance(d, ast.Name) and d.id == "staticmethod" for d in m.decorator_list)
    )
    if not_static:
        raise SystemExit(f"❌ @staticmethod 가 아닌 메서드는 들어올릴 수 없다: {not_static}")

    # 들어올린 뒤에도 클래스 밖 이름으로 남는 참조 — `C.f` 는 `f` 가 된다.
    lifted: list[str] = []
    for name in names:
        m = methods[name]
        start, end = _method_span(m)
        block = "\n".join(lines[start - 1 : end])
        block = textwrap.dedent(block)
        # `@staticmethod` 줄 제거 (데코레이터가 그것 하나일 때만 — 그 외는 위에서 막힌다)
        block = re.sub(r"^@staticmethod\n", "", block)
        # 같은 모듈로 함께 내려오는 형제 참조를 한정 해제
        for sibling in names:
            block = re.sub(rf"\b{class_name}\.{sibling}\b", sibling, block)
        lifted.append(block)

    # 남은 `C.<something>` 참조가 있으면 순환 import 가 된다 — 여기서 멈춘다.
    for name, block in zip(names, lifted, strict=True):
        leftover = sorted(set(re.findall(rf"\b{class_name}\.(\w+)", block)))
        if leftover:
            raise SystemExit(
                f"❌ {name} 이 여전히 {class_name} 를 참조한다: {leftover}\n"
                f"   들어올릴 목록에 넣거나, 클래스에 남겨야 한다 "
                f"(그대로 두면 두 모듈이 서로를 import 한다)"
            )

    # 클래스 본문에서 메서드를 지우고 그 자리에 재부착 대입을 넣는다.
    spans = sorted((_method_span(methods[n]) for n in names), reverse=True)
    out = list(lines)
    for start, end in spans:
        del out[start - 1 : end]

    rebind = [
        "",
        "    # 모듈 레벨로 들어올린 뒤 같은 이름으로 재부착한다 —",
        "    # `C.f(...)` 호출 형태가 그대로 유지된다.",
    ]
    rebind += [f"    {n} = staticmethod({n})" for n in names]

    cls_end = cls.end_lineno - sum(e - s + 1 for s, e in spans)
    out[cls_end:cls_end] = rebind

    cls_start = min([d.lineno for d in cls.decorator_list] + [cls.lineno]) - 1
    out[cls_start:cls_start] = ["\n\n".join(lifted), "", ""]

    return "\n".join(out) + "\n"


def main(argv: list[str]) -> int:
    if len(argv) < 4:
        print(__doc__)
        return 2
    src = Path(argv[1]).read_text(encoding="utf-8")
    sys.stdout.write(lift(src, argv[2], argv[3:]))
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
