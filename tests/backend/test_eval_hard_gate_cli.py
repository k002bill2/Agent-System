"""Evaluation hard gate CLI — 결과 파일이 저장되기 전에 게이트를 강제하는 실행 경계.

`services.eval_hard_gate` 는 판정 로직을 이미 갖고 있었지만 호출하는 실행 경로가 없었다.
그래서 `.claude/evals/results/` 에 "테스트 실패 + passed: true" 가 실제로 기록됐다.
이 파일은 그 경계(CLI)를 잠근다 — 판정 로직을 복제하지 않고, 라이브러리를 호출하는
결정론적 진입점이 존재하고 올바르게 동작하는지만 검증한다.

정책(계약):
- **강등 전용(demote-only)**: CLI 는 `passed` 를 false/null → true 로 올리지 않는다.
- **기본 읽기 전용**: `--write` 없이는 입력 파일이 바이트 단위로 불변이다.
- **종료 코드**: 0=통과, 1=게이트 차단, 2=입력 무효(아무것도 쓰지 않음).
"""

import json
import os
import subprocess
import sys
from pathlib import Path

import pytest

import services.eval_hard_gate_cli as cli_mod
from services.eval_hard_gate_cli import main

REPO_ROOT = Path(__file__).resolve().parents[2]


def _write(path: Path, payload: dict) -> Path:
    path.write_text(json.dumps(payload, indent=2), encoding="utf-8")
    return path


def _failing_task_result() -> dict:
    """역사적 사고 형태: 테스트는 실패인데 가중 점수가 높아 passed: true 로 기록됐다."""
    return {
        "task_id": "task_ui_001",
        "passing_score": 0.7,
        "runs": [
            {
                "run_id": "run_001",
                "code_checks": {
                    "files_exist": True,
                    "type_check": "pass",
                    "tests_pass": "fail",
                    "lint": "pass",
                },
                "grades": {"final_score": 0.92, "grade": "A"},
                "passed": True,
            }
        ],
    }


# ------------------------------------------------ AC1: 실패 게이트는 통과일 수 없다


def test_failed_gate_run_is_demoted_and_reported(tmp_path, capsys):
    """tests_pass=fail 인 run 은 점수가 아무리 높아도 passed: true 로 남지 못한다."""
    target = _write(tmp_path / "task_ui_001.json", _failing_task_result())

    exit_code = main(["--task-result", str(target)])

    payload = json.loads(capsys.readouterr().out)
    run = payload["task_result"]["runs"][0]
    assert exit_code == 1
    assert run["passed"] is False
    assert run["veto"] is True
    assert "tests_pass" in run["veto_reason"]
    assert run["hard_gate"]["failed_gates"] == ["tests_pass"]


# ------------------------------------------- AC2: 깨끗한 결과는 통과로 남는다


def _clean_task_result() -> dict:
    """`eval-task-runner.md` 가 문서화한 정식 형태 — 점수·등급이 `grades` 아래에 중첩된다."""
    return {
        "task_id": "task_ui_002",
        "passing_score": 0.7,
        "runs": [
            {
                "run_id": "run_001",
                "code_checks": {
                    "files_exist": True,
                    "type_check": "pass",
                    "tests_pass": "pass",
                    "lint": "pass",
                },
                "grades": {"final_score": 0.90, "grade": "A"},
                "passed": True,
            }
        ],
    }


def test_clean_canonical_run_stays_passed(tmp_path, capsys):
    """정식 형태(`grades.final_score`)의 깨끗한 run 은 강등되지 않는다.

    회귀 방지: 점수를 최상위에서만 읽으면 정식 형태가 0.0 으로 읽혀 전부 불합격이 된다.
    """
    target = _write(tmp_path / "task_ui_002.json", _clean_task_result())

    exit_code = main(["--task-result", str(target)])

    payload = json.loads(capsys.readouterr().out)
    run = payload["task_result"]["runs"][0]
    assert exit_code == 0
    assert payload["ok"] is True
    assert run["passed"] is True
    assert run["veto"] is False


def test_diagnostic_score_and_grade_survive_a_veto(tmp_path, capsys):
    """veto 되어도 진단값(final_score·grade)은 보존된다 — 삭제가 아니라 강등이다."""
    target = _write(tmp_path / "task_ui_001.json", _failing_task_result())

    main(["--task-result", str(target)])

    run = json.loads(capsys.readouterr().out)["task_result"]["runs"][0]
    assert run["grades"]["final_score"] == 0.92
    assert run["grades"]["grade"] == "A"
    assert run["hard_gate"]["final_score"] == 0.92


# --------------------------------- AC3: 기본은 읽기 전용, 쓰기는 명시적·원자적


def test_write_mode_replaces_the_file_with_the_corrected_document(tmp_path):
    """`--write` 는 보정된 문서를 원본 경로에 되쓴다."""
    target = _write(tmp_path / "task_ui_001.json", _failing_task_result())

    exit_code = main(["--task-result", str(target), "--write"])

    stored = json.loads(target.read_text(encoding="utf-8"))
    assert exit_code == 1
    assert stored["runs"][0]["passed"] is False
    assert stored["runs"][0]["veto"] is True


def test_default_mode_leaves_the_source_bytes_identical(tmp_path, capsys):
    """기본 모드는 소스를 건드리지 않는다.

    mtime 이 아니라 바이트를 비교한다 — 같은 내용을 되쓰면 mtime 만 움직여
    "변경 없음" 으로 보이고, 반대로 mtime 이 같아도 내용이 바뀔 수 있다.
    """
    target = _write(tmp_path / "task_ui_001.json", _failing_task_result())
    before = target.read_bytes()

    main(["--task-result", str(target)])
    capsys.readouterr()

    assert target.read_bytes() == before


def test_malformed_json_exits_invalid_and_preserves_the_original(tmp_path, capsys):
    """깨진 입력은 종료 코드 2 로 거부하고 원본을 그대로 둔다 (쓰기 모드에서도)."""
    target = tmp_path / "task_ui_001.json"
    target.write_text("{not json", encoding="utf-8")
    before = target.read_bytes()

    exit_code = main(["--task-result", str(target), "--write"])

    assert exit_code == 2
    assert target.read_bytes() == before
    assert "invalid" in capsys.readouterr().err.lower()


def test_missing_file_exits_invalid(tmp_path, capsys):
    """존재하지 않는 경로도 트레이스백이 아니라 종료 코드 2 다."""
    exit_code = main(["--task-result", str(tmp_path / "absent.json"), "--write"])

    assert exit_code == 2
    assert "invalid" in capsys.readouterr().err.lower()


def test_non_object_json_exits_invalid(tmp_path, capsys):
    """JSON 이지만 객체가 아니면(리스트·문자열) 태스크 결과 문서가 아니다."""
    target = tmp_path / "task_ui_001.json"
    target.write_text("[1, 2, 3]", encoding="utf-8")

    exit_code = main(["--task-result", str(target), "--write"])

    assert exit_code == 2
    assert target.read_text(encoding="utf-8") == "[1, 2, 3]"
    assert "invalid" in capsys.readouterr().err.lower()


# ------------------------------------------------------- 강등 전용(demote-only)


def test_unrecorded_pass_is_never_promoted_to_true(tmp_path, capsys):
    """게이트가 깨끗하고 점수가 임계를 넘어도 `passed` 를 null → true 로 올리지 않는다.

    게이트의 일은 **차단**이지 **인증**이 아니다. 합격 기록은 runner 가 쓴다.
    이 테스트는 `run["passed"] = verdict.passed` 라는 '단순화' 를 잡아낸다 —
    그 변형은 판정이 참일 때 기록을 승격시킨다.
    """
    document = _clean_task_result()
    document["runs"][0]["passed"] = None
    target = _write(tmp_path / "task_ui_002.json", document)

    exit_code = main(["--task-result", str(target)])

    run = json.loads(capsys.readouterr().out)["task_result"]["runs"][0]
    assert exit_code == 0
    assert run["passed"] is None
    assert run["hard_gate"]["passed"] is True


def test_recorded_failure_is_never_upgraded(tmp_path, capsys):
    """기록된 `passed: false` 는 게이트가 깨끗하고 점수가 높아도 false 로 남는다."""
    document = _clean_task_result()
    document["runs"][0]["passed"] = False
    target = _write(tmp_path / "task_ui_002.json", document)

    exit_code = main(["--task-result", str(target)])

    run = json.loads(capsys.readouterr().out)["task_result"]["runs"][0]
    assert exit_code == 1
    assert run["passed"] is False


def test_real_incomplete_run_is_blocked_as_unverified(tmp_path, capsys):
    """실제 저장된 미완료 결과(증빙 0·점수 null)는 fail-closed 로 차단된다."""
    source = REPO_ROOT / ".claude" / "evals" / "results" / "2026-02-13" / "task_ui_001.json"
    target = tmp_path / "task_ui_001.json"
    target.write_text(source.read_text(encoding="utf-8"), encoding="utf-8")

    exit_code = main(["--task-result", str(target)])

    run = json.loads(capsys.readouterr().out)["task_result"]["runs"][0]
    assert exit_code == 1
    assert run["passed"] is False
    assert run["hard_gate"]["unverified"] is True
    assert source.read_bytes() == target.read_bytes(), "원본 아티팩트를 건드리면 안 된다"


# --------------------------------------- AC4: 요약의 모순은 표면화되고 PASS 불가


def _contradictory_summary() -> dict:
    """기록된 합격률은 100% 인데 항목 하나는 tests_pass=false 인 요약.

    저장된 요약 4종과 같은 평면 항목 형태(`score`/`tests_pass` 가 항목 최상위)를 쓴다.
    """
    return {
        "date": "2026-02-13",
        "metrics": {"pass_rate": 1.0, "tasks_failed": 0},
        "results": {
            "completed": [
                {"task_id": "task_ui_001", "tests_pass": True, "score": 0.95, "passed": True},
                {"task_id": "task_ui_002", "tests_pass": False, "score": 0.90, "passed": True},
            ]
        },
    }


def test_contradictory_summary_cannot_report_pass(tmp_path, capsys):
    """모순된 요약은 재계산 결과와 함께 차단된다."""
    target = _write(tmp_path / "summary.json", _contradictory_summary())
    task = _write(tmp_path / "task.json", _clean_task_result())

    exit_code = main(["--task-result", str(task), "--summary", str(target)])

    gate = json.loads(capsys.readouterr().out)["summary"]["hard_gate"]
    assert exit_code == 1
    assert gate["passed"] is False
    assert gate["pass_rate"] == 0.5
    assert gate["failed_count"] == 1
    assert any("pass_rate" in message for message in gate["contradictions"])


def test_summary_recorded_aggregates_are_rejected_not_rewritten(tmp_path, capsys):
    """정책: 기록된 집계를 덮어쓰지 않는다 — 재계산값은 `hard_gate` 에만 적는다.

    사람이 쓴 서술 필드를 조용히 바꾸면 "게이트가 통과시킨 숫자" 와 "사람이 주장한
    숫자" 를 나중에 구분할 수 없다. 모순은 지우는 게 아니라 남겨서 차단한다.
    """
    target = _write(tmp_path / "summary.json", _contradictory_summary())
    task = _write(tmp_path / "task.json", _clean_task_result())

    main(["--task-result", str(task), "--summary", str(target), "--write"])

    stored = json.loads(target.read_text(encoding="utf-8"))
    assert stored["metrics"]["pass_rate"] == 1.0
    assert stored["hard_gate"]["pass_rate"] == 0.5


def test_consistent_summary_passes(tmp_path, capsys):
    """모순이 없고 전 항목이 통과면 요약도 통과한다."""
    document = _contradictory_summary()
    document["results"]["completed"][1]["tests_pass"] = True
    target = _write(tmp_path / "summary.json", document)
    task = _write(tmp_path / "task.json", _clean_task_result())

    exit_code = main(["--task-result", str(task), "--summary", str(target)])

    gate = json.loads(capsys.readouterr().out)["summary"]["hard_gate"]
    assert exit_code == 0
    assert gate["passed"] is True
    assert gate["contradictions"] == []


# ------------------------------------------- 필수 게이트 선언 / 임계값 해석 순서


def test_required_gate_without_evidence_fails_closed(tmp_path, capsys):
    """증빙이 없는 필수 게이트는 '통과' 가 아니라 차단이다 (fail-closed)."""
    document = _clean_task_result()
    del document["runs"][0]["code_checks"]["lint"]
    target = _write(tmp_path / "task_ui_002.json", document)

    exit_code = main(["--task-result", str(target), "--require-gate", "lint"])

    run = json.loads(capsys.readouterr().out)["task_result"]["runs"][0]
    assert exit_code == 1
    assert run["hard_gate"]["missing_gates"] == ["lint"]
    assert "lint" in run["veto_reason"]


def test_require_gate_is_repeatable(tmp_path, capsys):
    """필수 게이트는 여러 번 지정할 수 있다."""
    document = _clean_task_result()
    document["runs"][0]["code_checks"] = {"files_exist": True}
    target = _write(tmp_path / "task_ui_002.json", document)

    main(["--task-result", str(target), "--require-gate", "lint", "--require-gate", "tests_pass"])

    run = json.loads(capsys.readouterr().out)["task_result"]["runs"][0]
    assert run["hard_gate"]["missing_gates"] == ["tests_pass", "lint"]


def test_passing_score_flag_applies_when_the_file_declares_none(tmp_path, capsys):
    """파일에 임계가 없으면 `--passing-score` 가 적용된다."""
    document = _clean_task_result()
    del document["passing_score"]
    target = _write(tmp_path / "task_ui_002.json", document)

    exit_code = main(["--task-result", str(target), "--passing-score", "0.95"])

    run = json.loads(capsys.readouterr().out)["task_result"]["runs"][0]
    assert exit_code == 1
    assert run["passed"] is False
    assert run["hard_gate"]["final_score"] == 0.90


def test_explicit_passing_score_overrides_the_value_copied_into_the_result(tmp_path, capsys):
    """명시된 임계가 결과 파일에 복사된 값을 이긴다.

    임계의 SSOT 는 태스크 정의(`evaluation.passing_score`)이고, 결과 파일의
    `passing_score` 는 runner 가 써 넣은 **사본**이다. 사본이 플래그를 이기게 두면
    0.75 로 선언된 태스크의 결과에 0.7 이 복사돼 있을 때 0.72 가 통과한다 —
    플래그가 필요한 바로 그 경우에 플래그가 무력해진다.
    """
    document = _clean_task_result()  # 파일 사본은 0.7, 점수는 0.90
    target = _write(tmp_path / "task_ui_002.json", document)

    exit_code = main(["--task-result", str(target), "--passing-score", "0.95"])

    run = json.loads(capsys.readouterr().out)["task_result"]["runs"][0]
    assert exit_code == 1
    assert run["passed"] is False


def test_result_file_score_is_used_when_no_flag_is_given(tmp_path, capsys):
    """플래그가 없으면 결과 파일에 복사된 임계를 쓴다 (기본값 0.7 보다 우선)."""
    document = _clean_task_result()
    document["passing_score"] = 0.95
    target = _write(tmp_path / "task_ui_002.json", document)

    exit_code = main(["--task-result", str(target)])

    assert exit_code == 1
    assert json.loads(capsys.readouterr().out)["task_result"]["runs"][0]["passed"] is False


# --------------------------------------- 실제 셸 계약 (에이전트 문서가 약속하는 형태)


def test_module_is_runnable_as_a_command_and_blocks_a_failed_gate(tmp_path):
    """`python -m services.eval_hard_gate_cli` 가 실제로 실행되고 차단한다.

    in-process `main()` 호출은 에이전트 문서가 약속하는 **셸** 계약을 증명하지 못한다.
    경로는 import 한 모듈에서 역산한다 — `sys.executable` 의 venv 에는 다른 체크아웃을
    가리키는 `.pth` 가 들어 있어서, 맨 `-m` 호출은 엉뚱한 트리를 검사하고도 통과한다.
    """
    backend = Path(cli_mod.__file__).resolve().parents[1]
    target = _write(tmp_path / "task_ui_001.json", _failing_task_result())

    proc = subprocess.run(
        [sys.executable, "-m", "services.eval_hard_gate_cli", "--task-result", str(target)],
        cwd=backend,
        env={**os.environ, "PYTHONPATH": str(backend)},
        capture_output=True,
        text=True,
    )

    # 종료 코드만으로는 판별되지 않는다: 잘못된 트리를 가리키면 "No module named"
    # 로도 1 이 나온다 (실측 2026-09-17). 실제 판별자는 stdout 산출 여부다.
    assert "No module named" not in proc.stderr, "CLI 모듈이 있는 트리를 실행하지 않았다"
    assert proc.returncode == 1, proc.stderr
    run = json.loads(proc.stdout)["task_result"]["runs"][0]
    assert run["passed"] is False
    assert run["hard_gate"]["failed_gates"] == ["tests_pass"]


def test_command_exits_zero_on_a_clean_result(tmp_path):
    """셸 계약의 통과 쪽 — 깨끗한 결과는 종료 코드 0."""
    backend = Path(cli_mod.__file__).resolve().parents[1]
    target = _write(tmp_path / "task_ui_002.json", _clean_task_result())

    proc = subprocess.run(
        [sys.executable, "-m", "services.eval_hard_gate_cli", "--task-result", str(target)],
        cwd=backend,
        env={**os.environ, "PYTHONPATH": str(backend)},
        capture_output=True,
        text=True,
    )

    assert "No module named" not in proc.stderr, "CLI 모듈이 있는 트리를 실행하지 않았다"
    assert proc.returncode == 0, proc.stderr


# ------------------------------------ AC5: 게이트 출력이 저장 결과에 기록된다


def test_task_document_records_a_gate_block(tmp_path, capsys):
    """문서 최상위에 게이트 결론이 남는다 — run 을 훑지 않아도 읽을 수 있어야 한다."""
    target = _write(tmp_path / "task_ui_001.json", _failing_task_result())

    main(["--task-result", str(target)])

    gate = json.loads(capsys.readouterr().out)["task_result"]["hard_gate"]
    assert gate["passed"] is False
    assert gate["blocked_runs"] == ["run_001"]
    assert gate["vetoed_runs"] == 1


def test_vetoed_runs_metric_is_recorded(tmp_path, capsys):
    """`eval-task-runner.md` 가 문서화한 `metrics.vetoed_runs` 를 채운다."""
    document = _failing_task_result()
    document["metrics"] = {"pass_at_1": 1.0}
    target = _write(tmp_path / "task_ui_001.json", document)

    main(["--task-result", str(target)])

    metrics = json.loads(capsys.readouterr().out)["task_result"]["metrics"]
    assert metrics["vetoed_runs"] == 1


def test_recorded_task_metrics_are_flagged_not_recomputed(tmp_path, capsys):
    """차단이 있는데 기록된 pass 지표가 1.0 이면 모순으로 표면화하되 덮어쓰지 않는다."""
    document = _failing_task_result()
    document["metrics"] = {"pass_at_1": 1.0, "success_rate": 1.0}
    target = _write(tmp_path / "task_ui_001.json", document)

    main(["--task-result", str(target)])

    stored = json.loads(capsys.readouterr().out)["task_result"]
    assert stored["metrics"]["pass_at_1"] == 1.0
    assert any("pass_at_1" in message for message in stored["hard_gate"]["contradictions"])


def test_clean_task_document_reports_no_contradictions(tmp_path, capsys):
    """깨끗한 결과에서는 모순 목록이 비어 있다 (모순 탐지가 항상 발화하지 않는다)."""
    document = _clean_task_result()
    document["metrics"] = {"pass_at_1": 1.0, "success_rate": 1.0}
    target = _write(tmp_path / "task_ui_002.json", document)

    exit_code = main(["--task-result", str(target)])

    gate = json.loads(capsys.readouterr().out)["task_result"]["hard_gate"]
    assert exit_code == 0
    assert gate["contradictions"] == []
    assert gate["vetoed_runs"] == 0


def test_task_result_without_runs_is_blocked(tmp_path, capsys):
    """run 이 하나도 없는 결과는 '전원 합격' 이 아니라 차단이다 (증거 없음 = 불합격).

    종료 코드와 `hard_gate.passed` 는 어긋나면 안 된다 — 문서는 불합격이라 적고
    종료 코드는 0 을 내면, 호출자가 어느 쪽을 믿느냐에 따라 게이트가 사라진다.
    """
    target = _write(tmp_path / "task_ui_001.json", {"task_id": "task_ui_001", "runs": []})

    exit_code = main(["--task-result", str(target)])

    gate = json.loads(capsys.readouterr().out)["task_result"]["hard_gate"]
    assert exit_code == 1
    assert gate["passed"] is False
    assert gate["total_runs"] == 0


# ---------------------------------- mutation 으로 드러난 미고정 항 (커버 ≠ 고정)


def test_impossible_recorded_rate_is_blocked_even_when_no_run_is_blocked(tmp_path, capsys):
    """차단이 하나도 없어도 수학적으로 불가능한 기록 지표는 모순이다.

    `passed` 술어의 `not contradictions` 항은 mutation 에서 살아남았다 —
    모순이 차단된 run 이 있을 때만 생기면 그 항은 도달 불가능이기 때문이다.
    합격률이 1.0 인데 `pass_at_1` 이 1.0 을 넘는다고 기록된 경우가 그 반례다.
    """
    document = _clean_task_result()
    document["metrics"] = {"pass_at_1": 1.5}
    target = _write(tmp_path / "task_ui_002.json", document)

    exit_code = main(["--task-result", str(target)])

    gate = json.loads(capsys.readouterr().out)["task_result"]["hard_gate"]
    assert exit_code == 1
    assert gate["blocked_runs"] == []
    assert gate["passed"] is False
    assert any("pass_at_1" in message for message in gate["contradictions"])


def test_failing_summary_without_recorded_metrics_is_still_blocked(tmp_path, capsys):
    """기록된 집계가 아예 없어도 항목이 불합격이면 요약은 차단된다.

    모순 목록이 비어 있을 때 `not verdict.passed` 항만이 차단을 만든다.
    """
    document = {
        "results": {
            "completed": [
                {"task_id": "task_ui_001", "tests_pass": False, "score": 0.9, "passed": True}
            ]
        }
    }
    target = _write(tmp_path / "summary.json", document)
    task = _write(tmp_path / "task.json", _clean_task_result())

    exit_code = main(["--task-result", str(task), "--summary", str(target)])

    gate = json.loads(capsys.readouterr().out)["summary"]["hard_gate"]
    assert exit_code == 1
    assert gate["contradictions"] == []
    assert gate["passed"] is False


def test_summary_contradiction_blocks_even_when_every_task_passes(tmp_path, capsys):
    """전 항목이 통과여도 기록된 합격률이 재계산값을 넘으면 차단한다.

    `not verdict.passed` 는 False 이므로 `contradictions` 항만이 차단을 만든다.
    """
    document = _contradictory_summary()
    document["results"]["completed"][1]["tests_pass"] = True
    document["metrics"] = {"pass_rate": 1.5}
    target = _write(tmp_path / "summary.json", document)
    task = _write(tmp_path / "task.json", _clean_task_result())

    exit_code = main(["--task-result", str(task), "--summary", str(target)])

    gate = json.loads(capsys.readouterr().out)["summary"]["hard_gate"]
    assert exit_code == 1
    assert gate["pass_rate"] == 1.0
    assert gate["passed"] is True, "라이브러리 판정 자체는 통과 — 차단은 모순 항이 만든다"
    assert any("pass_rate" in message for message in gate["contradictions"])


# ------------------------------------------------ 원자적 교체가 권한을 보존한다


@pytest.mark.parametrize("mode", [0o644, 0o600, 0o664])
def test_write_preserves_the_original_file_mode(tmp_path, capsys, mode):
    """`--write` 는 내용만 바꾸고 권한 비트는 그대로 둔다.

    `NamedTemporaryFile` 은 0600 으로 만들어지고 `os.replace` 는 그 권한을 그대로
    옮긴다. 그래서 아무 것도 선언하지 않으면 644 파일이 조용히 600 이 된다 —
    git 은 읽기 비트를 추적하지 않아 diff 에도 안 보인다. 증빙 파일(0600 이 의도된
    `mcp_admission`)과 달리 평가 결과는 비밀이 아니므로 원본 모드를 보존한다.
    """
    target = _write(tmp_path / "task_ui_001.json", _failing_task_result())
    target.chmod(mode)

    main(["--task-result", str(target), "--write"])
    capsys.readouterr()

    assert target.stat().st_mode & 0o777 == mode


def test_atomic_write_refuses_a_vanished_target_and_leaves_no_temp_file(tmp_path):
    """읽을 때 있던 파일이 쓸 때 없으면 추측한 권한으로 새로 만들지 않고 실패한다.

    `main()` 은 항상 먼저 읽으므로 이 경로는 CLI 로 도달할 수 없다 — 그래서
    `_atomic_write` 를 직접 부른다. 권한 폴백을 두면 이 테스트가 통과해버린다.
    """
    missing = tmp_path / "gone.json"

    with pytest.raises(OSError):
        cli_mod._atomic_write(missing, '{"a": 1}\n')

    assert list(tmp_path.iterdir()) == [], "임시 파일이 남으면 안 된다"


# ------------------------------------------------- Codex 리뷰 반영 (P1/P2)


def test_malformed_run_entry_is_counted_and_blocked(tmp_path, capsys):
    """runs 안의 비-객체 항목을 조용히 버리지 않는다 (fail-open 차단).

    걸러내면 `total_runs`·`pass_rate` 가 줄어들어, 정상 run 1건 + null 1건이
    "100% 합격" 으로 보고된다 — 게이트가 증거 부재를 통과로 바꾸는 형태다.
    """
    document = _clean_task_result()
    document["runs"].append(None)
    target = _write(tmp_path / "task_ui_002.json", document)

    exit_code = main(["--task-result", str(target)])

    gate = json.loads(capsys.readouterr().out)["task_result"]["hard_gate"]
    assert exit_code == 1
    assert gate["total_runs"] == 2
    assert gate["pass_rate"] == 0.5
    assert gate["passed"] is False
    assert any("malformed" in label for label in gate["blocked_runs"])


def test_required_gates_apply_to_the_summary_too(tmp_path, capsys):
    """`--require-gate` 는 태스크 결과뿐 아니라 요약 항목에도 적용된다.

    한쪽에만 걸면 "lint 증빙 없는 항목" 이 요약에서는 통과로 남아, 같은 실행에서
    두 문서가 서로 다른 계약으로 채점된다.
    """
    document = {
        "results": {
            "completed": [
                {"task_id": "task_ui_001", "tests_pass": True, "score": 0.95, "passed": True}
            ]
        }
    }
    target = _write(tmp_path / "summary.json", document)
    task = _write(tmp_path / "task.json", _clean_task_result())

    exit_code = main(
        ["--task-result", str(task), "--summary", str(target), "--require-gate", "lint"]
    )

    gate = json.loads(capsys.readouterr().out)["summary"]["hard_gate"]
    assert exit_code == 1
    assert gate["passed"] is False
    assert gate["blocked_tasks"] == ["task_ui_001"]


def test_recorded_veto_provenance_survives_reprocessing(tmp_path, capsys):
    """grader 가 기록한 veto 와 사유를 게이트가 덮어써 지우지 않는다.

    라이브러리는 기록된 `veto: true` 를 불합격으로 존중하지만, 재계산 판정에는
    게이트 fail 이 없으므로 `verdict.veto` 가 False 다. 그 값을 그대로 쓰면
    감사 증거가 사라지고 `vetoed_runs` 가 과소 집계된다.
    """
    document = _clean_task_result()
    document["runs"][0]["veto"] = True
    document["runs"][0]["veto_reason"] = "grader: fabricated test evidence"
    target = _write(tmp_path / "task_ui_002.json", document)

    exit_code = main(["--task-result", str(target)])

    payload = json.loads(capsys.readouterr().out)["task_result"]
    run = payload["runs"][0]
    assert exit_code == 1
    assert run["passed"] is False
    assert run["veto"] is True, "기록된 veto 가 false 로 지워졌다"
    assert run["veto_reason"] == "grader: fabricated test evidence"
    assert payload["hard_gate"]["vetoed_runs"] == 1


# ----------------------------------------- Codex 라운드 2 반영


def test_pass_at_k_is_not_compared_to_the_per_run_rate(tmp_path, capsys):
    """`pass_at_k` 는 성공 비율에 묶이지 않으므로 모순 비교 대상이 아니다.

    3회 중 1회 성공이면 `pass@3` 은 정당하게 1.0 이고 run 비율은 0.333 이다.
    그 둘을 비교하면 정상 메타데이터에 거짓 모순 증거를 써 넣는다.
    `pass_at_1`·`success_rate`(= c/n)와 `pass_power_k`((c/n)^k ≤ 비율)는 유효하다.
    """
    document = {
        "task_id": "task_ui_001",
        "passing_score": 0.7,
        "runs": [
            {
                "run_id": "run_001",
                "code_checks": {"tests_pass": "pass"},
                "grades": {"final_score": 0.9},
                "passed": True,
            },
            {
                "run_id": "run_002",
                "code_checks": {"tests_pass": "fail"},
                "grades": {"final_score": 0.4},
                "passed": False,
            },
        ],
        "metrics": {"pass_at_1": 0.5, "pass_at_k": 1.0},
    }
    target = _write(tmp_path / "task_ui_001.json", document)

    main(["--task-result", str(target)])

    gate = json.loads(capsys.readouterr().out)["task_result"]["hard_gate"]
    assert gate["pass_rate"] == 0.5
    assert gate["contradictions"] == [], "pass_at_k=1.0 은 비율 0.5 와 모순이 아니다"


def test_task_threshold_does_not_leak_onto_summary_entries(tmp_path, capsys):
    """태스크 하나의 임계값을 날짜 단위 요약의 모든 항목에 씌우지 않는다.

    날짜 요약에는 서로 다른 `evaluation.passing_score` 를 가진 태스크가 섞인다.
    0.75 태스크에서 호출했다고 0.7 태스크 항목을 0.75 로 채점하면(또는 반대로)
    항목마다 틀린 계약이 적용된다. 항목별 임계값은 태스크 YAML 을 읽어야 알 수
    있고 그건 이 CLI 의 범위 밖이라, 요약에는 임계값을 전파하지 않는다.
    """
    summary = {
        "results": {
            "completed": [
                {"task_id": "task_other", "tests_pass": True, "score": 0.72, "passed": True}
            ]
        }
    }
    target = _write(tmp_path / "summary.json", summary)
    task = _write(tmp_path / "task.json", _clean_task_result())

    main(
        [
            "--task-result",
            str(task),
            "--summary",
            str(target),
            "--passing-score",
            "0.75",
        ]
    )

    gate = json.loads(capsys.readouterr().out)["summary"]["hard_gate"]
    assert gate["blocked_tasks"] == [], "태스크의 0.75 가 요약 항목에 새어 들어갔다"


# ----------------------------------------- Codex 라운드 3 반영


def test_rounded_metrics_are_not_reported_as_contradictions(tmp_path, capsys):
    """반올림된 지표를 모순으로 적지 않는다 (허용오차는 라이브러리와 공유).

    2/3 성공의 재계산 비율은 0.6667 인데 저장 관례는 `0.67` 로 반올림한다 —
    `eval-task-runner.md` 의 Result Format 예시가 실제로 `success_rate: 0.67` 이다.
    엄격 비교(`>`)로는 그 반올림이 모순으로 기록돼 저장물에 틀린 감사 텍스트가
    남는다. 차단 자체는 `blocked_runs` 가 만들므로 거짓 차단은 아니지만,
    거짓 증거도 남기지 않는다.
    """
    passing = {"code_checks": {"tests_pass": "pass"}, "grades": {"final_score": 0.9}}
    document = {
        "task_id": "task_ui_001",
        "passing_score": 0.7,
        "runs": [
            {"run_id": "r1", **passing, "passed": True},
            {"run_id": "r2", **passing, "passed": True},
            {
                "run_id": "r3",
                "code_checks": {"tests_pass": "fail"},
                "grades": {"final_score": 0.4},
                "passed": False,
            },
        ],
        "metrics": {"success_rate": 0.67, "pass_at_1": 0.67},
    }
    target = _write(tmp_path / "task_ui_001.json", document)

    exit_code = main(["--task-result", str(target)])

    gate = json.loads(capsys.readouterr().out)["task_result"]["hard_gate"]
    assert gate["contradictions"] == []
    assert gate["blocked_runs"] == ["r3"], "차단은 그대로 유지된다"
    assert exit_code == 1


def test_overstated_metrics_beyond_the_tolerance_are_still_flagged(tmp_path, capsys):
    """허용오차가 실제 과대 주장을 덮지 않는다 (가드가 무력화되지 않았다)."""
    document = _failing_task_result()
    document["metrics"] = {"success_rate": 1.0}
    target = _write(tmp_path / "task_ui_001.json", document)

    main(["--task-result", str(target)])

    gate = json.loads(capsys.readouterr().out)["task_result"]["hard_gate"]
    assert any("success_rate" in message for message in gate["contradictions"])


def test_understated_metrics_are_not_contradictions(tmp_path, capsys):
    """재계산값보다 **낮게** 기록된 지표는 모순이 아니다.

    과소 기록은 거짓 합격 위험이 없다(보수적). 그걸 모순으로 잡으면 정상 결과가
    차단된다. `value > pass_rate` 항이 그 방향을 지키는데, 빼도 테스트가 전부
    통과했다(mutation 확인) — 그래서 이 테스트로 고정한다.
    """
    document = _clean_task_result()
    document["metrics"] = {"success_rate": 0.5, "pass_at_1": 0.0}
    target = _write(tmp_path / "task_ui_002.json", document)

    exit_code = main(["--task-result", str(target)])

    gate = json.loads(capsys.readouterr().out)["task_result"]["hard_gate"]
    assert gate["pass_rate"] == 1.0
    assert gate["contradictions"] == []
    assert exit_code == 0


def test_overstated_pass_power_k_is_a_contradiction(tmp_path, capsys):
    """`pass_power_k` 과대 기록도 모순이다 — `(c/n)^k` 는 언제나 `c/n` 이하다.

    라운드 2 에서 이 키를 비교 대상에 넣었는데 테스트가 없어, 키를 빼도 전부
    통과했다(mutation 확인).
    """
    document = _failing_task_result()
    document["metrics"] = {"pass_power_k": 0.9}
    target = _write(tmp_path / "task_ui_001.json", document)

    main(["--task-result", str(target)])

    gate = json.loads(capsys.readouterr().out)["task_result"]["hard_gate"]
    assert any("pass_power_k" in message for message in gate["contradictions"])
