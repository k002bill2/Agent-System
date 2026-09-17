"""Evaluation hard gate — 결정론적 게이트 실패는 가중 점수로 상쇄될 수 없다.

계약의 SSOT 는 `.claude/agents/eval-grader.md` 의 "Deterministic Veto" 절이다.
그 절은 산문으로만 존재했고 이를 강제하는 코드는 없었다 — 이 파일이 계약을 잠근다.

핵심 규칙:
  passed = (final_score >= passing_score) AND (캡처된 게이트 키에 fail 없음)

`grade`·`final_score` 는 진단값으로 계속 계산되지만 합격 여부는 `passed` 가 결정한다.
"""

import json
from pathlib import Path

import pytest

from services.eval_hard_gate import (
    DEFAULT_PASSING_SCORE,
    GATE_TESTS_PASS,
    GATE_TYPE_CHECK,
    NON_VETO_CHECK_KEYS,
    evaluate_summary,
    evaluate_task_result,
    normalize_code_checks,
)

REPO_ROOT = Path(__file__).resolve().parents[2]
RESULTS_DIR = REPO_ROOT / ".claude" / "evals" / "results"


# ---------------------------------------------------------------- 키 정규화


@pytest.mark.parametrize("alias", ["test", "tests", "tests_pass"])
def test_test_aliases_normalize_to_tests_pass(alias):
    """동의어는 tests_pass 게이트로 접힌다."""
    assert normalize_code_checks({alias: "fail"}) == {GATE_TESTS_PASS: False}


@pytest.mark.parametrize("alias", ["tsc", "mypy", "type_check"])
def test_type_aliases_normalize_to_type_check(alias):
    """tsc/mypy 는 type_check 게이트로 접힌다."""
    assert normalize_code_checks({alias: "fail"}) == {GATE_TYPE_CHECK: False}


@pytest.mark.parametrize("alias", ["ruff", "eslint", "lint"])
def test_lint_aliases_normalize_to_lint(alias):
    """ruff/eslint 는 lint 게이트로 접힌다."""
    assert normalize_code_checks({alias: "pass"}) == {"lint": True}


@pytest.mark.parametrize("value", [False, "fail", "FAIL", "failed"])
def test_falsey_gate_values_are_failures(value):
    """게이트 값은 bool 과 문자열 양쪽 표기를 받는다."""
    assert normalize_code_checks({"tests_pass": value}) == {GATE_TESTS_PASS: False}


@pytest.mark.parametrize("value", [True, "pass", "PASS", "passed"])
def test_truthy_gate_values_are_successes(value):
    assert normalize_code_checks({"tests_pass": value}) == {GATE_TESTS_PASS: True}


@pytest.mark.parametrize("key", sorted(NON_VETO_CHECK_KEYS))
def test_non_veto_keys_are_not_gates(key):
    """files_exist·patterns_found 류는 점수에만 반영되고 veto 하지 않는다."""
    assert normalize_code_checks({key: False}) == {}


def test_unknown_check_keys_are_ignored():
    """모르는 키는 게이트가 아니다 (veto 표면을 임의로 넓히지 않는다)."""
    assert normalize_code_checks({"vibes_good": "fail"}) == {}


def test_indeterminate_gate_values_are_not_captured():
    """skipped/None 은 'fail' 이 아니라 '미캡처' 다."""
    assert normalize_code_checks({"tests_pass": "skipped", "lint": None}) == {}


# ------------------------------------------------- 구형 표기 정규화(방어 계층)


def test_legacy_test_results_failed_normalizes_to_tests_pass_fail():
    """runner 가 구형 test_results.failed 로 넘겨도 동일하게 veto 된다."""
    assert normalize_code_checks({"test_results": {"failed": 6, "passed": 9}}) == {
        GATE_TESTS_PASS: False
    }


def test_legacy_test_results_zero_failures_is_a_pass():
    assert normalize_code_checks({"test_results": {"failed": 0, "passed": 15}}) == {
        GATE_TESTS_PASS: True
    }


def test_legacy_typescript_errors_normalizes_to_type_check_fail():
    assert normalize_code_checks({"typescript_errors": 3}) == {GATE_TYPE_CHECK: False}


def test_ssot_gate_key_wins_over_legacy_field():
    """정상 형식(code_checks 게이트 키)이 구형 표기보다 우선한다."""
    checks = {"tests_pass": "pass", "test_results": {"failed": 6}}

    assert normalize_code_checks(checks) == {GATE_TESTS_PASS: True}


# ------------------------------------------------------------- 태스크 hard gate


def _documented_veto_fixture() -> dict:
    """`.claude/agents/eval-grader.md` 가 실증으로 인용한 모순 결과의 형태.

    그 문서가 가리키는 `.claude/evals/results/2026-04-07/task_ui_001.json` 은
    이 워크트리에 존재하지 않는다(문서만 남고 산출물은 없음). 그래서 fixture 는
    문서에 기록된 값(type_check pass / tests_pass fail / passed true / 0.839)을
    그대로 재현한 합성 입력이다.
    """
    return {
        "task_id": "task_ui_001",
        "run_id": "run_abc123",
        "code_checks": {
            "files_exist": True,
            "type_check": "pass",
            "tests_pass": "fail",
            "code_checks_score": 0.70,
        },
        "llm_evaluation": {"average": 0.90},
        "final_score": 0.839,
        "passed": True,
        "grade": "B",
    }


def test_failed_required_test_vetoes_a_passing_score():
    """0.839 > 0.7 이어도 tests_pass=fail 이면 passed=False (수용기준 5)."""
    result = evaluate_task_result(_documented_veto_fixture())

    assert result.passed is False
    assert result.veto is True
    assert GATE_TESTS_PASS in result.failed_gates
    assert "tests_pass" in (result.veto_reason or "")


def test_veto_keeps_final_score_and_grade_as_diagnostics():
    """veto 는 합격만 뒤집고 진단값은 보존한다."""
    result = evaluate_task_result(_documented_veto_fixture())

    assert result.final_score == pytest.approx(0.839)
    assert result.grade == "B"


def test_recorded_passed_true_is_reported_as_a_contradiction():
    """입력이 스스로 passed:true 라고 주장하면 모순으로 표면화한다."""
    result = evaluate_task_result(_documented_veto_fixture())

    assert result.contradicts_recorded is True


def test_clean_gates_above_threshold_pass():
    result = evaluate_task_result(
        {
            "task_id": "task_ui_002",
            "code_checks": {"type_check": "pass", "tests_pass": "pass", "lint": "pass"},
            "final_score": 0.84,
        }
    )

    assert result.passed is True
    assert result.veto is False
    assert result.failed_gates == ()


def test_score_below_threshold_fails_without_veto():
    """게이트가 모두 통과해도 임계 미만이면 불합격 — veto 와는 별개 축."""
    result = evaluate_task_result(
        {"task_id": "t", "code_checks": {"tests_pass": "pass"}, "final_score": 0.5}
    )

    assert result.passed is False
    assert result.veto is False


def test_task_passing_score_overrides_default():
    """임계의 SSOT 는 태스크 정의다."""
    payload = {"task_id": "t", "code_checks": {"tests_pass": "pass"}, "final_score": 0.75}

    assert evaluate_task_result(payload).passed is True
    assert evaluate_task_result(payload, passing_score=0.8).passed is False
    assert DEFAULT_PASSING_SCORE == 0.7


def test_missing_required_gate_evidence_fails_closed():
    """required criterion 의 증빙이 없으면 점수와 무관하게 불합격 (설계제약 4)."""
    result = evaluate_task_result(
        {"task_id": "t", "code_checks": {"type_check": "pass"}, "final_score": 0.99},
        required_gates=(GATE_TESTS_PASS,),
    )

    assert result.passed is False
    assert result.missing_gates == (GATE_TESTS_PASS,)
    assert "tests_pass" in (result.veto_reason or "")


def test_no_code_checks_at_all_with_required_gates_fails():
    result = evaluate_task_result(
        {"task_id": "t", "final_score": 1.0}, required_gates=(GATE_TESTS_PASS,)
    )

    assert result.passed is False
    assert result.missing_gates == (GATE_TESTS_PASS,)


def test_explicit_recorded_failure_is_never_upgraded_to_pass():
    """입력이 passed:false 면 게이트 증빙이 없어도 합격으로 승격되지 않는다."""
    result = evaluate_task_result({"task_id": "t", "passed": False, "final_score": 0.95})

    assert result.passed is False


def test_multiple_failed_gates_are_all_reported():
    result = evaluate_task_result(
        {
            "task_id": "t",
            "code_checks": {"tests_pass": "fail", "eslint": "fail", "type_check": "pass"},
            "final_score": 0.9,
        }
    )

    assert result.failed_gates == (GATE_TESTS_PASS, "lint")


# ----------------------------------------------------------- 요약(aggregation)


def _contradictory_summary() -> dict:
    """ "6 failed tests + pass_rate 1.0" 을 동시에 기록하는 2026-04-07 형 요약."""
    return {
        "date": "2026-04-07",
        "task_results": [
            {
                "task_id": "task_ui_001",
                "code_checks": {"type_check": "pass", "tests_pass": "fail"},
                "final_score": 0.839,
                "passed": True,
            },
            {
                "task_id": "task_ui_002",
                "code_checks": {"type_check": "pass", "tests_pass": "pass"},
                "final_score": 0.95,
                "passed": True,
            },
        ],
        "metrics": {"pass_rate": 1.0, "tests_failed": 6, "tasks_failed": 0},
    }


def test_contradictory_summary_fails_the_hard_gate():
    """수용기준 6: 모순 요약을 넣으면 hard-gate 실패를 돌려준다."""
    summary = evaluate_summary(_contradictory_summary())

    assert summary.passed is False
    assert summary.failed_count == 1
    assert summary.pass_rate == pytest.approx(0.5)


def test_contradictory_summary_names_the_recorded_pass_rate():
    summary = evaluate_summary(_contradictory_summary())

    joined = " ".join(summary.contradictions)
    assert "pass_rate" in joined
    assert "task_ui_001" in joined


def test_consistent_summary_reports_no_contradiction():
    summary = evaluate_summary(
        {
            "task_results": [
                {"task_id": "a", "code_checks": {"tests_pass": "pass"}, "final_score": 0.9},
                {"task_id": "b", "code_checks": {"tests_pass": "pass"}, "final_score": 0.8},
            ],
            "metrics": {"pass_rate": 1.0},
        }
    )

    assert summary.passed is True
    assert summary.contradictions == ()


def test_recorded_zero_failures_while_a_task_fails_is_a_contradiction():
    summary = evaluate_summary(
        {
            "task_results": [
                {"task_id": "a", "code_checks": {"tests_pass": "fail"}, "final_score": 0.9}
            ],
            "metrics": {"tasks_failed": 0},
        }
    )

    assert summary.passed is False
    assert any("tasks_failed" in c for c in summary.contradictions)


def test_empty_summary_is_not_a_pass():
    """태스크가 하나도 없는 요약을 '전원 합격' 으로 읽지 않는다."""
    summary = evaluate_summary({})

    assert summary.total == 0
    assert summary.passed is False


# ------------------------------------------- 실제 저장된 요약에 대한 스키마 내성


def _real_summaries() -> list[tuple[str, dict]]:
    paths = sorted(RESULTS_DIR.glob("*/summary.json"))
    return [(p.parent.name, json.loads(p.read_text(encoding="utf-8"))) for p in paths]


def test_real_summaries_exist_to_exercise():
    """합성 fixture 만으로 통과하는 파서를 만들지 않기 위한 전제 조건."""
    assert len(_real_summaries()) >= 4


@pytest.mark.parametrize(
    "name,payload", _real_summaries(), ids=lambda v: v if isinstance(v, str) else ""
)
def test_real_summaries_do_not_crash_the_gate(name, payload):
    """네 요약이 서로 다른 스키마라 관용적으로 읽어야 한다."""
    summary = evaluate_summary(payload)

    assert summary.total >= 0


@pytest.mark.parametrize("name", ["2026-02-13", "2026-02-13-r2"])
def test_summaries_with_failed_tasks_do_not_pass(name):
    """실패 태스크를 담은 실제 요약은 통과로 읽히면 안 된다."""
    payload = dict(_real_summaries())[name]

    summary = evaluate_summary(payload)

    assert summary.failed_count > 0
    assert summary.passed is False


def test_r2_summary_recomputes_its_own_recorded_pass_rate():
    """실데이터 정합성: r2 의 total_pass_rate 0.60 은 10건 중 6건 합격과 일치한다."""
    payload = dict(_real_summaries())["2026-02-13-r2"]

    summary = evaluate_summary(payload)

    assert summary.total == 10
    assert summary.pass_rate == pytest.approx(0.6)
    assert summary.contradictions == ()


def test_summary_without_deterministic_evidence_is_not_a_pass():
    """2025-01-28 요약은 게이트 증빙이 0건이다 — success_rate 1.0 을 그대로 믿지 않는다."""
    payload = dict(_real_summaries())["2025-01-28"]

    summary = evaluate_summary(payload)

    assert summary.total == 5
    assert summary.unverified_count == 5
    assert summary.passed is False

    joined = " ".join(summary.contradictions)
    assert "metrics.overall_pass_at_1=1.0" in joined
    assert "metrics.tasks_failed=0" in joined


def test_r3_summary_breakdown_map_is_not_counted_as_tasks():
    """키로 색인된 집계(breakdown)는 태스크 항목이 아니다 — 이중 계수 방지."""
    payload = dict(_real_summaries())["2026-02-13-r3"]

    summary = evaluate_summary(payload)

    assert summary.total == 4
    assert [r.task_id for r in summary.task_results] == [
        "task_service_001",
        "task_service_002",
        "task_refactor_001",
        "task_refactor_002",
    ]
