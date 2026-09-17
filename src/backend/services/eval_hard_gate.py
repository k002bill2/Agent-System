"""Evaluation hard gate — 결정론적 게이트 실패를 가중 점수가 상쇄하지 못하게 한다.

계약의 SSOT 는 `.claude/agents/eval-grader.md` 의 "Deterministic Veto" 절이다.
그 절은 지금까지 산문으로만 존재했고 강제하는 코드가 없어서, 실제 결과 파일에
"테스트 실패 + PASS" 가 동시에 기록되는 일이 생겼다.

    passed = (final_score >= passing_score) AND (캡처된 게이트 키에 fail 없음)

`final_score`·`grade` 는 진단값으로 계속 계산되며 veto 시에도 보존된다.
합격 여부는 오직 `passed` 가 결정한다.

용어:
- **게이트(gate)**: 결정론적 실행 결과. `tests_pass`·`type_check`·`lint` 3종.
- **veto**: 게이트가 fail 이거나 required 게이트 증빙이 없을 때 발동. 점수보다 상위 규칙.
- **미검증(unverified)**: 게이트 증빙도 없고 `passed` 기록도 없는 항목. fail-closed 로
  불합격 처리하되 `unverified_count` 로 따로 보고한다 — "증거 없음" 과 "실패" 는 다른 신호다.
"""

import math
from collections.abc import Iterable, Mapping, Sequence
from dataclasses import dataclass, field
from typing import Any

GATE_TESTS_PASS = "tests_pass"
GATE_TYPE_CHECK = "type_check"
GATE_LINT = "lint"

#: veto 판정 순서 (보고 순서를 결정론적으로 만든다)
GATE_ORDER: tuple[str, ...] = (GATE_TESTS_PASS, GATE_TYPE_CHECK, GATE_LINT)

#: 동의어 → 게이트 (`eval-grader.md` 의 "키 정규화")
GATE_ALIASES: dict[str, str] = {
    "test": GATE_TESTS_PASS,
    "tests": GATE_TESTS_PASS,
    "tests_pass": GATE_TESTS_PASS,
    "tsc": GATE_TYPE_CHECK,
    "mypy": GATE_TYPE_CHECK,
    "type_check": GATE_TYPE_CHECK,
    "ruff": GATE_LINT,
    "eslint": GATE_LINT,
    "lint": GATE_LINT,
}

#: 점수에만 반영되고 veto 하지 않는 검사 (파일/패턴 존재 여부)
NON_VETO_CHECK_KEYS: frozenset[str] = frozenset(
    {"files_exist", "patterns_found", "forbidden_absent", "code_checks_score"}
)

DEFAULT_PASSING_SCORE = 0.7

#: 요약에서 읽는 기록된 합격률 필드 (최상위 또는 `metrics` 바로 아래에서만 찾는다 —
#: 중첩 집계(`by_agent_type.*.pass_rate`)는 분모가 달라 비교 대상이 아니다)
RECORDED_RATE_KEYS: tuple[str, ...] = (
    "pass_rate",
    "total_pass_rate",
    "overall_pass_at_1",
    "success_rate",
)
RECORDED_FAILURE_COUNT_KEYS: tuple[str, ...] = ("tasks_failed", "failed", "failed_count")

_TRUTHY_TOKENS = frozenset({"pass", "passed", "ok", "success", "true"})
_FALSEY_TOKENS = frozenset({"fail", "failed", "failure", "error", "false"})

_RATE_TOLERANCE = 0.005


def _coerce_gate_value(value: Any) -> bool | None:
    """게이트 값을 bool 로 접는다. 판정 불가면 None (= 미캡처)."""
    if isinstance(value, bool):
        return value
    if isinstance(value, str):
        token = value.strip().lower()
        if token in _TRUTHY_TOKENS:
            return True
        if token in _FALSEY_TOKENS:
            return False
    return None


def _legacy_gates(checks: Mapping[str, Any]) -> dict[str, bool]:
    """구형 표기를 게이트로 정규화하는 방어 계층.

    runner 가 `test_results.failed` / `typescript_errors` 로 넘겨도 동일하게 veto 된다.
    """
    gates: dict[str, bool] = {}

    test_results = checks.get("test_results")
    if isinstance(test_results, Mapping):
        failed = test_results.get("failed")
        if isinstance(failed, int) and not isinstance(failed, bool):
            gates[GATE_TESTS_PASS] = failed == 0

    errors = checks.get("typescript_errors")
    if isinstance(errors, int) and not isinstance(errors, bool):
        gates[GATE_TYPE_CHECK] = errors == 0

    return gates


def normalize_code_checks(checks: Mapping[str, Any]) -> dict[str, bool]:
    """캡처된 검사 결과에서 게이트만 뽑아 정규화한다.

    - 동의어는 하나의 게이트로 접는다 (`tsc`/`mypy` → `type_check`).
    - `files_exist` 류 비-veto 키와 모르는 키는 버린다.
    - `skipped`/`None` 처럼 판정 불가한 값은 "미캡처" 로 둔다 (fail 이 아니다).
    - 정상 형식(게이트 키)이 구형 표기보다 우선한다.
    """
    gates = _legacy_gates(checks)

    for key, raw in checks.items():
        gate = GATE_ALIASES.get(key)
        if gate is None:
            continue
        value = _coerce_gate_value(raw)
        if value is not None:
            gates[gate] = value

    return gates


@dataclass(frozen=True)
class HardGateResult:
    """단일 태스크 채점 결과에 hard gate 를 적용한 판정."""

    task_id: str
    passed: bool
    veto: bool
    final_score: float
    failed_gates: tuple[str, ...] = ()
    missing_gates: tuple[str, ...] = ()
    veto_reason: str | None = None
    grade: str | None = None
    recorded_passed: bool | None = None
    contradicts_recorded: bool = False
    unverified: bool = False


def _extract_score(result: Mapping[str, Any]) -> float:
    for key in ("final_score", "score"):
        value = result.get(key)
        if isinstance(value, int | float) and not isinstance(value, bool):
            return float(value)
    return 0.0


def _collect_checks(result: Mapping[str, Any]) -> dict[str, bool]:
    """`code_checks` 를 우선 읽되, runner 가 항목 최상위에 흘린 게이트도 줍는다."""
    gates = normalize_code_checks(result)

    code_checks = result.get("code_checks")
    if isinstance(code_checks, Mapping):
        gates.update(normalize_code_checks(code_checks))

    return gates


def _describe_veto(failed: Sequence[str], missing: Sequence[str]) -> str | None:
    parts: list[str] = []
    if failed:
        parts.append(f"code_checks gate fail: {', '.join(failed)}")
    if missing:
        parts.append(f"required gate evidence missing: {', '.join(missing)}")
    return " / ".join(parts) if parts else None


def evaluate_task_result(
    result: Mapping[str, Any],
    *,
    required_gates: Iterable[str] = (),
    passing_score: float | None = None,
) -> HardGateResult:
    """채점 결과 하나에 hard gate 를 적용한다.

    Args:
        result: grader 가 기록한 결과 (`code_checks`·`final_score`·`passed` 등).
        required_gates: 태스크가 필수로 선언한 게이트. 증빙이 없으면 fail-closed.
        passing_score: 태스크 정의의 임계값. None 이면 `DEFAULT_PASSING_SCORE`.

    Returns:
        점수·게이트·기록된 주장을 함께 담은 판정.
    """
    threshold = DEFAULT_PASSING_SCORE if passing_score is None else passing_score
    gates = _collect_checks(result)

    failed = tuple(g for g in GATE_ORDER if gates.get(g) is False)
    missing = tuple(g for g in GATE_ORDER if g in set(required_gates) and g not in gates)

    recorded = result.get("passed")
    recorded_passed = recorded if isinstance(recorded, bool) else None
    unverified = not gates and recorded_passed is None

    veto = bool(failed or missing)
    score = _extract_score(result)
    passed = (
        not veto
        and not unverified
        and score >= threshold
        and recorded_passed is not False
        and result.get("veto") is not True
    )

    return HardGateResult(
        task_id=str(result.get("task_id", "unknown")),
        passed=passed,
        veto=veto,
        final_score=score,
        failed_gates=failed,
        missing_gates=missing,
        veto_reason=_describe_veto(failed, missing),
        grade=result.get("grade") if isinstance(result.get("grade"), str) else None,
        recorded_passed=recorded_passed,
        contradicts_recorded=recorded_passed is True and not passed,
        unverified=unverified,
    )


@dataclass(frozen=True)
class HardGateSummary:
    """요약 문서 전체에 hard gate 를 적용한 판정."""

    total: int
    passed_count: int
    failed_count: int
    pass_rate: float
    passed: bool
    unverified_count: int = 0
    contradictions: tuple[str, ...] = ()
    task_results: tuple[HardGateResult, ...] = field(default=())


def _iter_task_entries(node: Any) -> Iterable[Mapping[str, Any]]:
    """중첩 구조를 훑어 `task_id` 를 가진 리스트 원소만 모은다.

    저장된 요약 4종이 서로 다른 스키마(`task_results`, `results.completed`,
    `results.completed_and_graded`, `tasks_rerun`)를 써서 경로를 고정할 수 없다.
    키로 색인된 매핑(`breakdown.task_ui_001`)은 항목이 아니라 집계이므로 제외한다.
    """
    if isinstance(node, Mapping):
        for value in node.values():
            yield from _iter_task_entries(value)
    elif isinstance(node, list):
        for item in node:
            if isinstance(item, Mapping) and "task_id" in item:
                yield item
            else:
                yield from _iter_task_entries(item)


def _recorded_metric(summary: Mapping[str, Any], keys: Sequence[str]) -> tuple[str, float] | None:
    """최상위와 `metrics` 바로 아래에서만 기록값을 찾는다."""
    scopes: list[tuple[str, Mapping[str, Any]]] = [("", summary)]
    metrics = summary.get("metrics")
    if isinstance(metrics, Mapping):
        scopes.append(("metrics.", metrics))

    for prefix, scope in scopes:
        for key in keys:
            value = scope.get(key)
            if isinstance(value, int | float) and not isinstance(value, bool):
                return f"{prefix}{key}", float(value)
    return None


def _rate_contradiction(
    summary: Mapping[str, Any], pass_rate: float, failures: Sequence[HardGateResult]
) -> str | None:
    recorded = _recorded_metric(summary, RECORDED_RATE_KEYS)
    if recorded is None:
        return None

    name, value = recorded
    if math.isclose(value, pass_rate, abs_tol=_RATE_TOLERANCE):
        return None
    if value <= pass_rate:
        return None

    names = ", ".join(r.task_id for r in failures) or "none"
    return (
        f"{name}={value} recorded, but hard gate recomputes {pass_rate:.3f} "
        f"({len(failures)} task(s) blocked: {names})"
    )


def _failure_count_contradiction(
    summary: Mapping[str, Any], failures: Sequence[HardGateResult]
) -> str | None:
    recorded = _recorded_metric(summary, RECORDED_FAILURE_COUNT_KEYS)
    if recorded is None or not failures:
        return None

    name, value = recorded
    if value >= len(failures):
        return None

    names = ", ".join(r.task_id for r in failures)
    return f"{name}={int(value)} recorded, but hard gate blocked {len(failures)}: {names}"


def evaluate_summary(
    summary: Mapping[str, Any],
    *,
    required_gates: Iterable[str] = (),
    passing_score: float | None = None,
) -> HardGateSummary:
    """요약 문서의 합격률을 재계산하고 기록값과의 모순을 표면화한다.

    비어 있거나 항목을 하나도 찾지 못한 요약은 "전원 합격" 이 아니라 불합격이다 —
    증거가 없으면 통과시키지 않는다.
    """
    required = tuple(required_gates)
    results = tuple(
        evaluate_task_result(entry, required_gates=required, passing_score=passing_score)
        for entry in _iter_task_entries(summary)
    )

    total = len(results)
    failures = tuple(r for r in results if not r.passed)
    passed_count = total - len(failures)
    pass_rate = passed_count / total if total else 0.0

    contradictions = tuple(
        message
        for message in (
            _rate_contradiction(summary, pass_rate, failures),
            _failure_count_contradiction(summary, failures),
        )
        if message
    )

    return HardGateSummary(
        total=total,
        passed_count=passed_count,
        failed_count=len(failures),
        pass_rate=pass_rate,
        passed=total > 0 and not failures,
        unverified_count=sum(1 for r in results if r.unverified),
        contradictions=contradictions,
        task_results=results,
    )
