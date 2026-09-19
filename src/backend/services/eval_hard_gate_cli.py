"""Evaluation hard gate CLI — 결과가 저장되기 **전에** 게이트를 강제하는 실행 경계.

`services.eval_hard_gate` 는 판정 로직을 갖고 있었지만 그것을 호출하는 실행 경로가
없었다. 그래서 산문 계약(`.claude/agents/eval-grader.md`)이 강제되지 않았고, 실제로
`.claude/evals/results/` 에 "테스트 실패 + passed: true" 가 기록됐다.

이 모듈은 판정 로직을 복제하지 않는다 — 문서를 JSON 으로 읽어 라이브러리에 넘기고,
그 판정을 문서에 되써 넣는 얇은 경계일 뿐이다.

사용:
    python -m services.eval_hard_gate_cli --task-result <path> [--summary <path>] [--write]

종료 코드:
    0  게이트 통과
    1  게이트 차단 (결과가 강등됨 / 모순 발견)
    2  입력 무효 — 아무것도 쓰지 않는다. argparse 사용법 오류도 같은 코드를 쓴다.

정책:
- **강등 전용(demote-only)**: `passed` 를 false/null → true 로 올리지 않는다.
  이 성질은 `_apply_to_run` 이 `False` 만 쓰고 `True` 를 쓰지 않는 데서 나온다.
- **기본 읽기 전용**: `--write` 없이는 입력 파일이 바이트 단위로 불변이다.
- **집계는 재작성이 아니라 거부**: 기록된 수치를 덮어쓰지 않고, 재계산값과 모순을
  `hard_gate` 블록에 적어 종료 코드 1 로 차단한다.
"""

from __future__ import annotations

import argparse
import json
import math
import os
import sys
import tempfile
from collections.abc import Sequence
from pathlib import Path
from typing import Any

from services.eval_hard_gate import (
    _RATE_TOLERANCE,
    GATE_ORDER,
    evaluate_summary,
    evaluate_task_result,
)

EXIT_OK = 0
EXIT_BLOCKED = 1
EXIT_INVALID = 2

#: 재계산 합격률과 **직접 비교 가능한** 지표만 담는다. 이 값이 비율보다 높으면
#: 모순이므로 덮어쓰지 않고 표면화한다.
#:
#: `pass_at_k` 는 일부러 제외한다 — `pass@k = 1 - C(n-c,k)/C(n,k)` 는 성공 비율에
#: 묶이지 않는다(3회 중 1회 성공이면 pass@3 은 정당하게 1.0, 비율은 0.333). 넣으면
#: 정상 메타데이터에 거짓 모순 증거를 써 넣는다. 남은 세 키는 비교가 성립한다:
#: `pass_at_1`·`success_rate` 는 c/n 이고 `pass_power_k` 는 (c/n)^k ≤ c/n 이다.
TASK_RATE_KEYS: tuple[str, ...] = ("pass_at_1", "pass_power_k", "success_rate", "pass_rate")


class InvalidInputError(Exception):
    """입력 문서를 판정 대상으로 받아들일 수 없다 — 아무것도 쓰지 않고 중단한다."""


def _load_document(path: Path) -> dict[str, Any]:
    """JSON 객체 하나를 읽는다. 어떤 실패든 트레이스백이 아니라 `InvalidInputError` 이다.

    게이트가 깨진 입력에 트레이스백을 내면 호출자(에이전트)는 "게이트가 고장났다" 와
    "게이트가 거부했다" 를 구분할 수 없다. 거부는 종료 코드로 말해야 한다.
    """
    try:
        raw = path.read_text(encoding="utf-8")
    except OSError as exc:
        raise InvalidInputError(f"cannot read {path}: {exc}") from exc

    try:
        document = json.loads(raw)
    except json.JSONDecodeError as exc:
        raise InvalidInputError(f"{path} is not valid JSON: {exc}") from exc

    if not isinstance(document, dict):
        raise InvalidInputError(f"{path} must be a JSON object, got {type(document).__name__}")
    return document


def _canonicalize(entry: dict[str, Any]) -> dict[str, Any]:
    """판정용 평면 사본을 만든다 — 저장 형태는 점수·등급을 `grades` 아래에 중첩한다.

    라이브러리(`_extract_score`)는 최상위 `final_score`/`score` 만 읽으므로, 정식
    형태의 run 은 점수가 0.0 으로 읽힌다. 그 결함을 라이브러리가 아니라 여기서
    메우는 이유는 **범위**다: `_extract_score` 는 `evaluate_summary` 와 공유되는
    판정 경로라, 고치면 새 실행 경계뿐 아니라 기존 요약 판정 전체의 의미가 바뀐다.
    (실측 2026-09-17: 라이브러리 쪽 수정도 기존 52 테스트·저장된 요약 4종에서
    판정 델타가 0 이었다 — 위험이 드러나지 않았을 뿐, 그 경로를 고정하는 테스트가
    없다는 뜻이다. 그래서 검증된 모듈은 건드리지 않는 쪽을 택했다.)

    잔여 한계: `evaluate_summary` 는 중첩 점수를 여전히 못 읽어 요약 경로가 이
    CLI 보다 비관적으로 판정한다 — fail-closed 방향이라 안전 측 오차다.

    원본은 변경하지 않는다 (진단값 보존은 호출부가 아니라 이 불변성이 보장한다).
    """
    grades = entry.get("grades")
    if not isinstance(grades, dict):
        return dict(entry)

    flat = dict(entry)
    for key in ("final_score", "score", "grade"):
        if key not in flat and key in grades:
            flat[key] = grades[key]
    return flat


def _run_label(run: dict[str, Any], index: int) -> str:
    """보고용 run 식별자. 저장 형태가 `run_id` 와 `run` 두 가지를 모두 쓴다."""
    for key in ("run_id", "run"):
        value = run.get(key)
        if isinstance(value, str | int) and not isinstance(value, bool):
            return str(value)
    return f"#{index}"


def _apply_to_run(
    run: dict[str, Any], *, required_gates: Sequence[str], passing_score: float | None
) -> bool:
    """run 하나에 게이트를 적용하고 문서를 제자리에서 강등한다. 차단되면 True.

    `passed` 에는 `False` 만 쓴다 — 통과 판정을 되써 넣지 않는 것이 강등 전용
    계약을 지탱한다. `verdict.passed` 를 그대로 대입하면 기록되지 않은 run 이
    점수만으로 합격으로 승격된다. 게이트의 일은 차단이지 인증이 아니다.
    """
    verdict = evaluate_task_result(
        _canonicalize(run), required_gates=required_gates, passing_score=passing_score
    )

    # 기록된 veto 는 지우지 않는다. 라이브러리는 `veto: true` 를 불합격으로 존중하지만
    # 재계산 판정에는 게이트 fail 이 없어 `verdict.veto` 가 False 다 — 그 값을 그대로
    # 쓰면 grader 가 남긴 사유가 사라지고 `vetoed_runs` 가 과소 집계된다. veto 는
    # 누적이지 대체가 아니다.
    recorded_veto = run.get("veto") is True
    recorded_reason = run.get("veto_reason")

    run["veto"] = verdict.veto or recorded_veto
    run["veto_reason"] = verdict.veto_reason or (recorded_reason if recorded_veto else None)
    run["hard_gate"] = {
        "passed": verdict.passed,
        "final_score": verdict.final_score,
        "grade": verdict.grade,
        "failed_gates": list(verdict.failed_gates),
        "missing_gates": list(verdict.missing_gates),
        "unverified": verdict.unverified,
        "contradicts_recorded": verdict.contradicts_recorded,
    }
    if not verdict.passed:
        run["passed"] = False
    return not verdict.passed


def _resolve_passing_score(document: dict[str, Any], explicit: float | None) -> float | None:
    """임계 해석 순서: `--passing-score` → 결과 파일의 값 → 라이브러리 기본값.

    임계의 SSOT 는 태스크 정의(`evaluation.passing_score`)다. 결과 파일의
    `passing_score` 는 runner 가 써 넣은 **사본**이라 낡거나 틀릴 수 있으므로,
    호출자가 태스크 정의에서 읽어 명시한 값이 사본을 이긴다.

    반대로 두면(사본 우선) 플래그가 필요한 바로 그 경우에 무력해진다: 0.75 로
    선언된 태스크의 결과 파일에 0.7 이 복사돼 있으면 0.72 가 통과한다.
    """
    if explicit is not None:
        return explicit

    declared = document.get("passing_score")
    if isinstance(declared, int | float) and not isinstance(declared, bool):
        return float(declared)
    return None


def _rate_contradictions(
    document: dict[str, Any], pass_rate: float, blocked: Sequence[str]
) -> list[str]:
    """기록된 합격 지표가 재계산값보다 높으면 모순으로 적는다 (덮어쓰지 않는다).

    차단된 run 이 없어도 검사한다. 합격률이 1.0 인데 `pass_at_1` 이 1.0 을 넘게
    기록된 경우처럼, 수학적으로 불가능한 주장 자체가 모순이기 때문이다.
    (`blocked` 가 있을 때만 검사하면 `passed` 술어의 `not contradictions` 항이
    도달 불가능해져, 지워도 테스트가 전부 통과한다 — mutation 으로 확인.)
    """
    metrics = document.get("metrics")
    if not isinstance(metrics, dict):
        return []

    detail = f"{len(blocked)} run(s) blocked: {', '.join(blocked)}" if blocked else "no run blocked"
    messages: list[str] = []
    for key in TASK_RATE_KEYS:
        value = metrics.get(key)
        # 허용오차는 라이브러리(`_rate_contradiction`)와 같은 값을 쓴다. 비교식을 두 벌
        # 두면 한쪽만 반올림을 봐주는 발산이 생긴다 — 실제로 그렇게 어긋나 있었다.
        # 저장 관례가 `success_rate: 0.67`(2/3=0.6667)이라 엄격 비교는 정상 지표를
        # 모순으로 기록한다.
        if (
            isinstance(value, int | float)
            and not isinstance(value, bool)
            and value > pass_rate
            and not math.isclose(value, pass_rate, abs_tol=_RATE_TOLERANCE)
        ):
            messages.append(
                f"metrics.{key}={value} recorded, but hard gate recomputes "
                f"{pass_rate:.3f} ({detail})"
            )
    return messages


def _apply_to_task_result(
    document: dict[str, Any], *, required_gates: Sequence[str], passing_score: float | None
) -> bool:
    """태스크 결과 문서의 모든 run 에 게이트를 적용한다. 차단되면 True."""
    threshold = _resolve_passing_score(document, passing_score)
    raw_runs = document.get("runs")
    entries = raw_runs if isinstance(raw_runs, list) else []

    # 비-객체 항목(`null` 등)은 걸러내지 않고 **차단으로 센다**. 걸러내면 분모가
    # 줄어 "정상 run 1건 + null 1건" 이 100% 합격으로 보고된다 — 게이트가 증거
    # 부재를 통과로 바꾸는 형태다.
    blocked: list[str] = []
    for index, entry in enumerate(entries):
        if not isinstance(entry, dict):
            blocked.append(f"#{index} (malformed)")
        elif _apply_to_run(entry, required_gates=required_gates, passing_score=threshold):
            blocked.append(_run_label(entry, index))

    vetoed = sum(1 for e in entries if isinstance(e, dict) and e.get("veto") is True)
    pass_rate = (len(entries) - len(blocked)) / len(entries) if entries else 0.0
    contradictions = _rate_contradictions(document, pass_rate, blocked)

    # run 이 하나도 없으면 "전원 합격" 이 아니라 불합격이다 — 증거가 없으면
    # 통과시키지 않는다 (`evaluate_summary` 의 빈 요약 처리와 같은 규칙).
    passed = bool(entries) and not blocked and not contradictions

    document["hard_gate"] = {
        "passed": passed,
        "total_runs": len(entries),
        "blocked_runs": blocked,
        "vetoed_runs": vetoed,
        "pass_rate": pass_rate,
        "contradictions": contradictions,
    }
    metrics = document.get("metrics")
    if isinstance(metrics, dict):
        metrics["vetoed_runs"] = vetoed

    # 종료 코드는 기록된 판정에서 파생시킨다 — 조건을 두 벌로 쓰면 둘이 어긋난다.
    return not passed


def _apply_to_summary(document: dict[str, Any], *, required_gates: Sequence[str]) -> bool:
    """요약 문서의 합격률을 재계산하고 모순을 표면화한다. 차단되면 True.

    **정책: 거부하되 재작성하지 않는다.** 기록된 집계(`metrics.pass_rate` 등)는
    그대로 둔다 — 사람이 주장한 숫자를 조용히 고치면 모순이 있었다는 사실 자체가
    사라져 감사가 불가능해진다. 재계산값과 모순 목록은 `hard_gate` 에만 적고,
    차단은 종료 코드로 말한다.

    항목은 `_canonicalize` 를 거치지 않는다 — 저장된 요약의 항목은 점수가 평면
    (`score` 가 항목 최상위)이고, `evaluate_summary` 의 의미를 바꾸지 않기 위해서다.

    `--require-gate` 는 전파하지만 `--passing-score` 는 전파하지 않는다. 날짜 단위
    요약에는 서로 다른 `evaluation.passing_score` 를 가진 태스크가 섞이므로, 호출한
    태스크 하나의 임계값을 전 항목에 씌우면 항목마다 틀린 계약이 적용된다. 필수
    게이트는 그런 태스크별 모호성이 없어 전파해도 안전하다.

    잔여 한계: 그래서 요약 항목의 점수는 라이브러리 기본 임계(0.7)로 본다. 0.75
    태스크 항목은 요약 경로에서 임계 검사가 느슨하다 — 그 태스크의 **개별 결과
    파일** 검사가 올바른 임계를 받는 정본이고, 요약은 집계·모순 확인용이다.
    항목별 임계를 제대로 보려면 태스크 YAML 을 읽어야 하는데 범위 밖이다.
    """
    verdict = evaluate_summary(document, required_gates=required_gates)

    document["hard_gate"] = {
        "total": verdict.total,
        "passed_count": verdict.passed_count,
        "failed_count": verdict.failed_count,
        "pass_rate": verdict.pass_rate,
        "passed": verdict.passed,
        "unverified_count": verdict.unverified_count,
        "contradictions": list(verdict.contradictions),
        "blocked_tasks": [r.task_id for r in verdict.task_results if not r.passed],
    }
    return not verdict.passed or bool(verdict.contradictions)


def _serialize(document: dict[str, Any]) -> str:
    return json.dumps(document, indent=2, ensure_ascii=False) + "\n"


def _atomic_write(path: Path, payload: str) -> None:
    """직렬화를 모두 끝낸 뒤에만 파일을 교체한다.

    같은 디렉토리에 임시 파일을 만들고 `os.replace` 로 바꾼다 — 다른 파일시스템으로
    건너뛰면 원자성이 깨지기 때문이다.

    권한은 원본에서 가져와 **교체 전에** 입힌다. `NamedTemporaryFile` 은 0600 이고
    `os.replace` 가 그 비트를 그대로 옮기므로, 아무 것도 하지 않으면 644 결과
    파일이 조용히 600 이 된다 (git 은 읽기 비트를 추적하지 않아 diff 에도 안 보인다).
    교체 **후** chmod 는 그 사이에 파일이 0600 인 창을 남긴다. 다만 두 순서는
    최종 상태가 같아 단위 테스트로 구분되지 않는다(mutation 으로 확인 — 뒤로
    옮겨도 32건 전부 통과). 이 순서를 지키는 것은 테스트가 아니라 이 주석이다.

    원본 stat 실패는 삼키지 않는다 — 읽을 때 있던 파일이 쓸 때 없다는 뜻이라,
    추측한 권한으로 새 파일을 만드는 것보다 쓰지 않고 실패하는 쪽이 옳다.
    """
    original_mode = path.stat().st_mode & 0o777

    handle = tempfile.NamedTemporaryFile(
        mode="w", encoding="utf-8", dir=path.parent, prefix=f".{path.name}.", delete=False
    )
    try:
        with handle:
            handle.write(payload)
        os.chmod(handle.name, original_mode)
        os.replace(handle.name, path)
    except BaseException:
        Path(handle.name).unlink(missing_ok=True)
        raise


def _build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog="eval-hard-gate",
        description="평가 결과를 저장하기 전에 결정론적 게이트를 강제한다.",
    )
    parser.add_argument("--task-result", required=True, type=Path)
    parser.add_argument("--summary", type=Path, default=None)
    parser.add_argument(
        "--require-gate",
        action="append",
        default=[],
        choices=GATE_ORDER,
        dest="required_gates",
        help="증빙이 없으면 차단할 필수 게이트 (반복 지정 가능).",
    )
    parser.add_argument(
        "--passing-score",
        type=float,
        default=None,
        help="태스크 정의(SSOT)의 임계값. 결과 파일에 복사된 값보다 우선한다.",
    )
    parser.add_argument(
        "--write",
        action="store_true",
        help="보정된 문서를 원본 경로에 원자적으로 되쓴다 (기본은 읽기 전용).",
    )
    return parser


def main(argv: Sequence[str] | None = None) -> int:
    """CLI 진입점. stdout 에 보정된 문서를 담은 봉투(envelope) JSON 을 낸다."""
    args = _build_parser().parse_args(argv)

    try:
        document = _load_document(args.task_result)
        summary = _load_document(args.summary) if args.summary is not None else None
    except InvalidInputError as exc:
        print(f"eval-hard-gate: invalid input: {exc}", file=sys.stderr)
        return EXIT_INVALID

    blocked = _apply_to_task_result(
        document, required_gates=args.required_gates, passing_score=args.passing_score
    )
    if summary is not None:
        blocked |= _apply_to_summary(summary, required_gates=args.required_gates)

    if args.write:
        # 두 문서를 먼저 전부 직렬화한 뒤에 교체한다. 파일 2개에 걸친 원자성은
        # 저널 없이는 불가능하므로(잔여 한계), 최소한 직렬화 실패가 어느 파일도
        # 건드리지 않도록 창을 좁힌다.
        pending = [(args.task_result, _serialize(document))]
        if summary is not None:
            pending.append((args.summary, _serialize(summary)))
        for path, payload in pending:
            _atomic_write(path, payload)

    envelope: dict[str, Any] = {"ok": not blocked, "task_result": document}
    if summary is not None:
        envelope["summary"] = summary
    print(json.dumps(envelope, indent=2, ensure_ascii=False))
    return EXIT_BLOCKED if blocked else EXIT_OK


if __name__ == "__main__":  # pragma: no cover - 실행 진입점
    raise SystemExit(main())
