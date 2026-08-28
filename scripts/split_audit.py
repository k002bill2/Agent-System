#!/usr/bin/env python3
"""Verify a behavior-preserving module split by definition name, not line range.

Slicing a file by line ranges and diffing the slices against the new modules is
self-confirming: the same ranges produced both sides, so a definition dropped by
the split is invisible to the check. This compares the *set of top-level
definition names* before and after, and then compares each body byte for byte —
so a lost, duplicated, or silently edited definition fails.

Imports are deliberately **not** compared. A split re-imports the same names in
several of the new modules, so requiring a one-to-one match would fail on every
correct split. A dropped import is a real risk, but it is covered statically by
``ruff``'s F821 (undefined name) and then by the suite — verified, not assumed:
deleting an import from one of the new modules makes ``ruff check`` fail.

Usage:
    split_audit.py <before-ref>:<path> <after-path> [<after-path> ...]

Example, before committing the promotion (the original file still exists):
    scripts/split_audit.py HEAD:src/backend/services/audit_service.py \\
        src/backend/services/audit_service/*.py

After committing, that path is gone from ``HEAD`` and ``git show`` exits 128.
``HEAD~1`` only works in the one commit right after the split, so find the
revision that still had the file instead — the parent of the commit that
deleted it:

    P=src/backend/services/audit_service.py
    scripts/split_audit.py "$(git log --diff-filter=D -1 --format=%H -- "$P")^:$P" \\
        src/backend/services/audit_service/*.py
"""

from __future__ import annotations

import ast
import subprocess
import sys
from pathlib import Path

# Names a barrel adds by existing rather than by holding a definition. Comparing
# them would report a correct split as a failure, which is worse than not
# comparing them: a check that cries wolf gets run with the barrel excluded, and
# then stops covering the barrel at all.
_BARREL_ONLY = frozenset({"__all__"})

# Names that are *correct* in every module of a package rather than owned by one.
# `logger = logging.getLogger(__name__)` is the case: the text is identical but
# `__name__` resolves per module, so a split that gives each module its own is
# right, and comparing them would abort with "두 모듈에 같은 정의". `split_module.py`
# already excludes the same name from its assignment table (`tolerate=`); this
# keeps the two tools' contracts aligned. Losing it everywhere is still caught —
# by ruff F821, the same backstop that covers dropped imports.
_PER_MODULE = frozenset({"logger"})


def _bound_names(target: ast.expr) -> list[str]:
    """Names an assignment target binds, unpacking tuples and lists."""
    if isinstance(target, ast.Name):
        return [target.id]
    if isinstance(target, (ast.Tuple, ast.List)):
        return [n for element in target.elts for n in _bound_names(element)]
    if isinstance(target, ast.Starred):
        return _bound_names(target.value)
    return []


def _definitions(source: str, origin: str) -> dict[str, tuple[str, str]]:
    """Map module-level definition name -> (kind, source text).

    Module-level assignments count as definitions too: a split that drops a
    constant or state variable is exactly the failure this guards against.
    """
    tree = ast.parse(source)
    lines = source.splitlines()
    found: dict[str, tuple[str, str]] = {}

    def record(name: str, node: ast.AST, kind: str) -> None:
        if name in _BARREL_ONLY or name in _PER_MODULE:
            return
        # Decorators sit above ``node.lineno``. Comparing from ``def``/``class``
        # would call a definition unchanged after its decorator was removed —
        # the one edit most likely to change behavior while looking like none.
        start = node.lineno
        for decorator in getattr(node, "decorator_list", []):
            start = min(start, decorator.lineno)
        body = "\n".join(lines[start - 1 : node.end_lineno])
        # One name may be bound more than once in a single file — the
        # ``try: X = a / except ImportError: X = b`` fallback is the common case.
        # That is not the duplication worth failing on; two *modules* claiming
        # the same definition is, and ``main`` checks for that. Keep every
        # occurrence in order so losing one branch still shows as a change.
        previous = found.get(name)
        if previous is None:
            found[name] = (kind, body)
        else:
            found[name] = (previous[0], previous[1] + "\n" + body)

    def walk(body: list[ast.stmt]) -> None:
        """Recurse into module-level containers.

        A definition guarded by ``if TYPE_CHECKING:``, wrapped in ``try:``, or
        built inside a module-level loop is still a definition the split has to
        carry. Only inspecting ``tree.body`` would let one be dropped without the
        audit noticing — a verifier that skips a suite reports success for a
        split that lost what was inside it.
        """
        for node in body:
            if isinstance(node, (ast.ClassDef, ast.FunctionDef, ast.AsyncFunctionDef)):
                record(node.name, node, type(node).__name__)
            elif isinstance(node, ast.Assign):
                # Unpacking (``A, B = ...``) binds names too. Recording only
                # ``ast.Name`` targets would let one of them vanish silently.
                for target in node.targets:
                    for bound in _bound_names(target):
                        record(bound, node, "Assign")
            elif isinstance(node, ast.AnnAssign) and isinstance(node.target, ast.Name):
                record(node.target.id, node, "AnnAssign")
            elif isinstance(node, ast.If):
                walk(node.body)
                walk(node.orelse)
            elif isinstance(node, ast.Try):
                walk(node.body)
                for handler in node.handlers:
                    walk(handler.body)
                walk(node.orelse)
                walk(node.finalbody)
            elif isinstance(node, (ast.With, ast.AsyncWith)):
                walk(node.body)
            elif isinstance(node, (ast.For, ast.AsyncFor, ast.While)):
                walk(node.body)
                walk(node.orelse)
            elif isinstance(node, ast.Match):
                for case in node.cases:
                    walk(case.body)

    walk(tree.body)
    return found


def _read_ref(spec: str) -> str:
    ref, _, path = spec.partition(":")
    if not path:
        return Path(spec).read_text(encoding="utf-8")
    out = subprocess.run(
        ["git", "show", f"{ref}:{path}"], capture_output=True, text=True, check=True
    )
    return out.stdout


def main(argv: list[str]) -> int:
    if len(argv) < 3:
        print(__doc__)
        return 2

    before = _definitions(_read_ref(argv[1]), argv[1])
    after: dict[str, tuple[str, str]] = {}
    owner: dict[str, str] = {}
    for path in argv[2:]:
        for name, entry in _definitions(Path(path).read_text(encoding="utf-8"), path).items():
            if name in after:
                raise SystemExit(f"두 모듈에 같은 정의: {name} ({owner[name]} · {path})")
            after[name] = entry
            owner[name] = path

    missing = sorted(set(before) - set(after))
    added = sorted(set(after) - set(before))
    changed = sorted(name for name in set(before) & set(after) if before[name][1] != after[name][1])

    print(f"이전 정의 {len(before)}종 -> 이후 {len(after)}종 ({len(argv) - 2}개 모듈)")
    for label, names in (("유실", missing), ("신규", added), ("본문 변경", changed)):
        if names:
            print(f"  {label} {len(names)}종:")
            for name in names:
                where = owner.get(name, "-")
                print(f"    {name}  ({where})")

    if missing or added or changed:
        print("\nFAIL — 이름 집합 또는 본문이 일치하지 않는다")
        return 1
    print("\nOK — 모든 정의가 이름과 본문 그대로 보존됐다")
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv))
