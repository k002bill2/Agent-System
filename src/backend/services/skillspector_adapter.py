"""SkillSpector CLI 어댑터 — 스캐너 출력을 admission 증빙으로 바꾸는 경계 (fail closed).

`services.mcp_admission` 은 어댑터 **계약**(`SupplyChainScanner`)만 정의했고 실제 도구는
붙어 있지 않았다. 이 모듈이 그 자리를 채운다. 연결 대상은 로컬에 설치된
NVIDIA SkillSpector CLI v2.5.1 이며, 아래 동작은 **추측이 아니라 실측**이다.

실측한 CLI 경계 (v2.5.1):

- 명령 형태: ``skillspector scan <target> --no-llm --format json --output <file>``
- exit code 의 의미 (`skillspector/cli.py`):
    - ``0`` — 스캔 성공, ``risk_score <= RISK_THRESHOLD``
    - ``1`` — 스캔 성공, ``risk_score > RISK_THRESHOLD``
    - ``2`` — 실행 실패(입력 오류·예외·``execution_successful=False``)
- ``RISK_THRESHOLD = 50`` (`skillspector/constants.py`). 위험도 밴드는
  LOW(0~20)=SAFE, MEDIUM(21~50)=CAUTION, HIGH/CRITICAL=DO_NOT_INSTALL 이다.
  **즉 exit 0 은 SAFE 와 CAUTION 을 함께 덮는다** — exit code 로 판정하면 CAUTION 이
  조용히 통과한다. 판정은 리포트의 ``risk_assessment.recommendation`` 에서만 온다.
- ``cli.py`` 는 ``execution_successful=False`` 인 경우에도 **리포트를 먼저 쓴 뒤** exit 2 를
  낸다. 따라서 "구조적으로 멀쩡한 SAFE 리포트 + 실패한 실행" 이 실재한다 —
  exit code 는 리포트 해석 **이전에** 본다.
- ``analysis_completeness.is_complete`` 는 ``--no-llm`` 정적 스캔에서 **항상 False** 다
  (실측: 깨끗한 스킬도 False). 이 값을 통과 조건에 넣으면 영원히 거부하는 게이트가 된다.
  대신 SkillSpector 자신이 degraded/fatal/미검사 파일이 있으면 SAFE 를 CAUTION 으로
  강등하므로(`nodes/report.py`), ``SAFE`` 검사가 완전성 검사를 이미 포함한다.
- ``metadata.skillspector_version`` 이 리포트 안에 실린다. 버전은 ``--version`` 을 따로
  실행해 얻지 않는다 — 다른 프로세스·다른 바이너리가 답할 수 있기 때문이다.

LLM 계층은 켜지 않는다(``--no-llm``). 자격증명이 필요하고, 그 자격증명을 스캐너
자식 프로세스에 넘기는 것 자체가 새로운 노출 경로다. 정적 분석만 쓰는 이 선택은
argv 뿐 아니라 **리포트의 ``metadata.llm_requested``** 로도 검증한다.
"""

import hashlib
import json
import os
import shutil
import subprocess
import tempfile
from collections.abc import Callable, Mapping, Sequence
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path
from typing import Protocol

from pydantic import BaseModel, ConfigDict, Field, ValidationError

from services.mcp_admission import (
    AdmissionEvidence,
    MCPCandidate,
    ReviewDecision,
    ScanReport,
    ScanStatus,
    build_evidence,
    compute_candidate_fingerprint,
)
from utils.time import to_aware_utc, utcnow

#: 증빙에 기록되는 스캐너 식별자.
SCANNER_ID = "skillspector"

#: 통과로 인정하는 유일한 권고. CAUTION·DO_NOT_INSTALL 은 전부 불합격이다.
SAFE_RECOMMENDATION = "SAFE"

#: 통과로 인정하는 유일한 위험 밴드.
SAFE_SEVERITY = "LOW"

#: 스캔이 성공적으로 끝났다고 CLI 가 주장하는 exit code 집합.
#: 2 이상은 실행 실패이므로 리포트를 해석하지 않는다.
_SCAN_COMPLETED_EXIT_CODES = frozenset({0, 1})

#: 버전을 읽어내지 못한 ERROR 리포트의 자리표시자 (증빙은 어차피 만들어지지 않는다).
_UNKNOWN_VERSION = "unknown"

#: 리포트 바이트가 아예 없을 때의 digest 자리표시자.
_EMPTY_DIGEST = hashlib.sha256(b"").hexdigest()

#: 리포트가 "안전하지 않다" 고 **판정**한 경우 (모름이 아니라 불합격).
_UNSAFE_RECOMMENDATIONS = frozenset({"CAUTION", "DO_NOT_INSTALL"})


class _RiskAssessment(BaseModel):
    """`risk_assessment` 블록. README 의 `risk_score`/`findings` 가 아니라 이 모양이다."""

    model_config = ConfigDict(extra="ignore")

    score: int
    severity: str = Field(min_length=1)
    recommendation: str = Field(min_length=1)


class _ScannedSkill(BaseModel):
    """`skill` 블록 — `source` 는 CLI 가 정규화한 실경로다."""

    model_config = ConfigDict(extra="ignore")

    name: str = ""
    source: str = Field(min_length=1)
    scanned_at: datetime


class _ReportMetadata(BaseModel):
    """`metadata` 블록 — 스캐너 버전과 LLM 사용 여부가 여기 실린다."""

    model_config = ConfigDict(extra="ignore")

    skillspector_version: str = Field(min_length=1)
    llm_requested: bool


class SkillSpectorReport(BaseModel):
    """실측한 v2.5.1 JSON 리포트의 필수 골격.

    낯선 스키마(키 부재·타입 불일치)는 `ValidationError` 로 드러나고 ERROR 로 접힌다 —
    모르는 출력을 "지적 0건" 으로 읽는 것이 가장 위험한 실패 모드다.
    """

    model_config = ConfigDict(extra="ignore")

    skill: _ScannedSkill
    risk_assessment: _RiskAssessment
    metadata: _ReportMetadata
    execution_successful: bool


@dataclass(frozen=True)
class ScanVerdict:
    """리포트 1건에 대한 판정 + 증빙에 실을 결속 재료.

    `status` 세 갈래의 뜻:
        PASS  — 스캐너가 SAFE/LOW 로 판정했고 실행도 성공했다.
        FAIL  — 스캐너가 안전하지 않다고 **판정**했다 (CAUTION/DO_NOT_INSTALL).
        ERROR — 판정을 얻지 못했다 (실행 실패·타임아웃·깨진 리포트·낯선 스키마).
                '모름' 이지 '안전' 이 아니므로 증빙을 만들지 않는다.
    """

    status: ScanStatus
    detail: str
    report_sha256: str
    scanner_version: str | None = None
    source: str | None = None
    scanned_at: datetime | None = None


def _error(detail: str, digest: str) -> ScanVerdict:
    return ScanVerdict(status=ScanStatus.ERROR, detail=detail, report_sha256=digest)


def parse_scan_report(raw: bytes, *, returncode: int) -> ScanVerdict:
    """스캐너 리포트 원본 바이트를 판정으로 바꾼다.

    Args:
        raw: `--output` 파일에서 읽은 **원본 바이트**. digest 는 재직렬화가 아니라 이
            바이트에서 계산된다 — 증빙이 가리키는 것은 우리가 다시 쓴 JSON 이 아니라
            스캐너가 내놓은 그 파일이어야 한다.
        returncode: CLI 프로세스의 종료 코드.

    Returns:
        `ScanVerdict`. PASS 는 아래를 **모두** 만족할 때만 나온다.
        exit 0 · `execution_successful` · recommendation SAFE · severity LOW · LLM 미사용.
    """
    digest = hashlib.sha256(raw).hexdigest()

    # exit code 를 리포트보다 **먼저** 본다. cli.py 는 실행 실패 시에도 리포트를 쓰므로,
    # 리포트를 먼저 해석하면 "SAFE 로 보이는 실패한 스캔" 을 통과시키게 된다.
    if returncode not in _SCAN_COMPLETED_EXIT_CODES:
        return _error(f"scanner exited {returncode} (execution failed)", digest)

    try:
        payload = json.loads(raw)
    except ValueError:
        return _error("scanner report is not valid JSON", digest)

    try:
        report = SkillSpectorReport.model_validate(payload)
    except ValidationError:
        return _error("scanner report does not match the known SkillSpector schema", digest)

    return _judge(report, returncode=returncode, digest=digest)


def _judge(report: SkillSpectorReport, *, returncode: int, digest: str) -> ScanVerdict:
    """스키마 검증을 통과한 리포트에 판정을 매긴다.

    분기 순서가 곧 정책이다 — 실행 성공 여부, 정적 전용 정책, 통과 조건, 불합격 판정,
    그리고 어느 쪽으로도 읽히지 않는 나머지(전부 ERROR)의 순이다.
    """
    common = {
        "report_sha256": digest,
        "scanner_version": report.metadata.skillspector_version,
        "source": report.skill.source,
        "scanned_at": to_aware_utc(report.skill.scanned_at),
    }
    risk = report.risk_assessment
    recommendation = risk.recommendation.upper()

    if not report.execution_successful:
        detail = "scanner reported execution_successful=false"
    elif report.metadata.llm_requested:
        # 정적 전용 정책. argv 에서 --no-llm 이 빠지면 여기서 걸린다.
        detail = "scanner report came from an LLM-enabled run (static-only policy)"
    elif (
        returncode == 0
        and recommendation == SAFE_RECOMMENDATION
        and risk.severity.upper() == SAFE_SEVERITY
    ):
        return ScanVerdict(
            status=ScanStatus.PASS,
            detail=f"{SAFE_RECOMMENDATION} (score {risk.score})",
            **common,
        )
    elif recommendation in _UNSAFE_RECOMMENDATIONS:
        return ScanVerdict(
            status=ScanStatus.FAIL,
            detail=f"{recommendation} — severity {risk.severity}, score {risk.score}",
            **common,
        )
    elif recommendation == SAFE_RECOMMENDATION:
        # SAFE 인데 PASS 가 아니다 = 리포트 내부가 서로 모순이다 (정상 CLI 는 내지 않는 조합).
        detail = (
            f"report claims {SAFE_RECOMMENDATION} but contradicts itself "
            f"(exit {returncode}, severity {risk.severity})"
        )
    else:
        detail = f"unrecognized recommendation {recommendation!r}"

    return ScanVerdict(status=ScanStatus.ERROR, detail=detail, **common)


#: 스캔 1회의 상한 (초). 스캐너가 매달리면 판정은 ERROR 이지 통과가 아니다.
DEFAULT_SCAN_TIMEOUT = 300.0

#: CLI 실행 파일 이름.
EXECUTABLE_NAME = "skillspector"

#: 자식 프로세스에 넘기는 환경변수 화이트리스트.
#: 부모 환경을 통째로 물려주면 `ANTHROPIC_API_KEY`·`OPENAI_API_KEY`·`NVIDIA_INFERENCE_KEY`
#: 가 스캐너로 넘어간다 — `--no-llm` 으로 쓰지도 않을 자격증명을 노출할 이유가 없다.
_CHILD_ENV_ALLOWLIST = ("PATH", "HOME", "LANG", "LC_ALL", "TMPDIR")


class _ProcessRunner(Protocol):
    """`subprocess.run` 중 이 어댑터가 쓰는 만큼의 표면 (테스트에서 대역으로 갈아끼운다)."""

    def __call__(
        self,
        argv: Sequence[str],
        *,
        timeout: float,
        env: Mapping[str, str],
        cwd: str,
        capture_output: bool,
        text: bool,
        check: bool,
    ) -> subprocess.CompletedProcess[str]: ...


def digest_scan_target(target: Path) -> str:
    """스캔 대상 트리의 내용 digest (sha256 hex).

    경로 이름·실행 비트·파일 내용을 정렬된 순서로 먹인다. 경로만 기록하면 "같은 자리의
    다른 내용" 을 구분하지 못하므로, 승인 이후의 소스 변경(source drift)을 탐지하려면
    내용까지 묶어야 한다. 디렉터리 심링크는 따라가지 않는다(`os.walk` 기본값) — 트리
    밖을 끌어들이거나 순환에 빠지지 않기 위해서다.

    **파일 심링크는 내용을 따라가 읽는다.** 링크 자체가 아니라 가리키는 대상의 바이트가
    digest 에 들어가므로, 링크가 가리키는 곳의 내용이 바뀌면 드리프트로 잡힌다.
    끊어진 링크·읽을 수 없는 파일은 `OSError` 로 드러난다 — 호출자가 그것을 ERROR 로
    접는다(조용히 건너뛰면 "검사하지 않은 파일" 이 digest 에서 사라져 드리프트를 놓친다).

    Raises:
        OSError: 대상 안에 읽을 수 없는 파일이 있는 경우.
    """
    resolved = Path(target).resolve()
    hasher = hashlib.sha256()

    if resolved.is_file():
        files = [resolved]
        base = resolved.parent
    else:
        files = []
        for directory, dirnames, filenames in os.walk(resolved):
            dirnames.sort()
            for name in sorted(filenames):
                files.append(Path(directory) / name)
        base = resolved

    for path in files:
        hasher.update(path.relative_to(base).as_posix().encode("utf-8"))
        hasher.update(b"\0")
        hasher.update(b"x" if path.stat().st_mode & 0o111 else b"-")
        hasher.update(b"\0")
        hasher.update(path.read_bytes())
        hasher.update(b"\0")
    return hasher.hexdigest()


class SkillSpectorScanner:
    """로컬 `skillspector` CLI 를 호출해 후보의 스캔 판정을 만든다 (fail closed).

    Args:
        targets: **fingerprint → 스캔 대상 경로** 매핑. 색인 키가 `id` 가 아닌 이유는
            id 가 가변 표시값이기 때문이다 — id 만 같고 command 를 바꾼 후보가 남의
            승인된 스캔 대상을 빌려 쓰는 것을 막는다. 등록되지 않은 후보는 스캔하지
            않고 ERROR 다(추측으로 아무 경로나 스캔하지 않는다).
        runner: 프로세스 실행기 (테스트 주입).
        which: 실행 파일 탐색기 (테스트 주입).
        timeout: 스캔 1회 상한.
        clock: 판정 시각 시계 (테스트 주입).

    **경계**: 스캔 대상은 운영자가 지정한 **로컬 사본**이다. `npx -y some-mcp` 처럼
    실행 시점에 원격에서 내려받는 후보라면, 여기서 스캔한 사본이 런타임에 실제로 실행될
    아티팩트와 같다는 보장은 이 계층에 없다 (docs/mcp-admission.md 의 잔여 위험 참조).
    """

    def __init__(
        self,
        targets: Mapping[str, Path | str],
        *,
        runner: _ProcessRunner | None = None,
        which: Callable[[str], str | None] = shutil.which,
        timeout: float = DEFAULT_SCAN_TIMEOUT,
        clock: Callable[[], datetime] = utcnow,
    ) -> None:
        self._targets = {key: Path(value) for key, value in targets.items()}
        self._runner: _ProcessRunner = runner if runner is not None else subprocess.run
        self._which = which
        self._timeout = timeout
        self._clock = clock

    def scan(self, candidate: MCPCandidate) -> ScanReport:
        """후보를 스캔해 `ScanReport` 를 돌려준다 (`SupplyChainScanner` 계약).

        판정을 얻지 못한 모든 경우는 `ScanStatus.ERROR` 다 — '모름' 은 '안전' 이 아니다.
        """
        fingerprint = compute_candidate_fingerprint(candidate)

        target = self._targets.get(fingerprint)
        if target is None:
            return self._failed("no scan target registered for this candidate fingerprint")

        resolved_target = Path(target).resolve()
        if not resolved_target.exists():
            return self._failed("scan target does not exist")

        executable = self._which(EXECUTABLE_NAME)
        if executable is None:
            return self._failed(f"{EXECUTABLE_NAME} executable not found on PATH")

        verdict = self._run(executable, resolved_target)
        if verdict.status is not ScanStatus.ERROR and not self._source_matches(
            verdict, resolved_target
        ):
            # 스캐너가 우리가 지정한 곳이 아닌 대상을 봤다면 그 판정은 이 후보의 것이 아니다.
            return self._failed("scanner report source does not match the requested scan target")

        return self._to_report(verdict, resolved_target)

    def _run(self, executable: str, target: Path) -> ScanVerdict:
        """CLI 를 한 번 실행하고 리포트 바이트를 판정으로 바꾼다."""
        with tempfile.TemporaryDirectory(prefix="skillspector-") as workdir:
            report_path = Path(workdir) / "report.json"
            argv = [
                executable,
                "scan",
                str(target),
                "--no-llm",
                "--format",
                "json",
                "--output",
                str(report_path),
            ]
            try:
                completed = self._runner(
                    argv,
                    timeout=self._timeout,
                    env=_child_env(),
                    cwd=workdir,
                    capture_output=True,
                    text=True,
                    check=False,
                )
            except subprocess.TimeoutExpired:
                return _error(f"scanner timed out after {self._timeout:g}s", _EMPTY_DIGEST)
            except OSError as exc:
                return _error(
                    f"scanner could not be executed: {exc.strerror or type(exc).__name__}",
                    _EMPTY_DIGEST,
                )

            try:
                raw = report_path.read_bytes()
            except OSError:
                return _error("scanner wrote no report", _EMPTY_DIGEST)

        return parse_scan_report(raw, returncode=completed.returncode)

    @staticmethod
    def _source_matches(verdict: ScanVerdict, target: Path) -> bool:
        """리포트가 말하는 소스와 우리가 지정한 대상이 같은 실경로인가.

        양쪽 모두 `resolve()` 한다 — macOS 는 `/tmp` 를 `/private/tmp` 로 정규화하지만
        Linux 는 하지 않으므로, 문자열 비교는 로컬에서만 통과하고 CI 에서 깨진다.
        """
        if verdict.source is None:
            return False
        try:
            return Path(verdict.source).resolve() == target.resolve()
        except OSError:
            return False

    def _failed(self, detail: str) -> ScanReport:
        """스캔을 시작하지도 못했거나 판정을 쓸 수 없는 경우의 ERROR 리포트."""
        return ScanReport(
            scanner_id=SCANNER_ID,
            scanner_version=_UNKNOWN_VERSION,
            status=ScanStatus.ERROR,
            scanned_at=self._clock(),
            raw_summary=detail,
        )

    def _to_report(self, verdict: ScanVerdict, target: Path) -> ScanReport:
        """판정을 계약 타입으로 옮긴다. 결속 재료는 PASS 가 아니어도 그대로 싣는다."""
        try:
            target_digest = digest_scan_target(target)
        except OSError as exc:
            # 대상을 읽을 수 없으면 결속 digest 가 없다. 그대로 PASS 를 내보내면
            # digest 없는 증빙이 만들어지고, 그 증빙은 `verify_evidence_binding` 이
            # '소스 결속을 주장하지 않는' 수동 검토 기록으로 보고 건너뛴다 —
            # 스캐너를 거치고도 드리프트 검사를 빠져나가는 경로가 된다. 여기서 닫는다.
            return self._failed(
                f"could not digest scan target: {exc.strerror or type(exc).__name__}"
            )

        return ScanReport(
            scanner_id=SCANNER_ID,
            scanner_version=verdict.scanner_version or _UNKNOWN_VERSION,
            status=verdict.status,
            scanned_at=verdict.scanned_at or self._clock(),
            raw_summary=verdict.detail,
            report_sha256=verdict.report_sha256,
            scan_target=str(target),
            scan_target_digest=target_digest,
        )


def _child_env() -> dict[str, str]:
    """자식 프로세스 환경 — 화이트리스트만. 후보의 env 는 **한 값도** 넘기지 않는다.

    후보 env 는 fingerprint 입력이지 스캐너 입력이 아니다. 스캐너가 그 값을 볼 이유가
    없고, 넘기면 로그·크래시 덤프를 통해 새어 나갈 표면만 늘어난다.
    """
    env = {key: os.environ[key] for key in _CHILD_ENV_ALLOWLIST if os.environ.get(key)}
    env.setdefault("PATH", os.defpath)
    return env


def mint_admission_evidence(
    candidate: MCPCandidate,
    report: ScanReport,
    *,
    reviewer: str,
    review_decision: ReviewDecision,
    reviewed_at: datetime,
    expires_at: datetime | None = None,
    notes: str = "",
) -> AdmissionEvidence | None:
    """스캔 판정 + 사람 승인이 **둘 다** 성립할 때만 증빙을 만든다.

    Returns:
        `AdmissionEvidence`, 또는 자격이 없으면 `None`.

    `None` 을 돌려주는 것은 의도적이다 — 자격 없는 결과에 대해 저장 가능한 객체를
    내주지 않으면, 호출자가 실수로 저장할 **대상 자체가 없다**. 스캔이 PASS 가 아니거나
    검토가 APPROVED 가 아니면 여기서 끝난다.

    스캔 결과 해석과 승인 결정은 분리된 행위다. 스캐너의 PASS 는 "자동 승인" 이 아니며
    `review_decision` 은 호출자가 사람의 판단으로 채운다.
    """
    if report.status is not ScanStatus.PASS:
        return None
    if review_decision is not ReviewDecision.APPROVED:
        return None

    return build_evidence(
        candidate,
        scanner_id=report.scanner_id,
        scanner_version=report.scanner_version,
        scan_status=report.status,
        scanned_at=report.scanned_at,
        reviewer=reviewer,
        review_decision=review_decision,
        reviewed_at=reviewed_at,
        expires_at=expires_at,
        notes=notes,
        report_sha256=report.report_sha256,
        scan_target=report.scan_target,
        scan_target_digest=report.scan_target_digest,
    )


def verify_evidence_binding(evidence: AdmissionEvidence) -> str | None:
    """증빙이 가리키는 소스가 **지금도 그때 그 내용인가**.

    Returns:
        문제가 있으면 사유 문자열, 없으면 `None`.

    `scan_target`/`scan_target_digest` 가 없는 증빙(수동 검토 기록)은 소스 결속을
    주장하지 않으므로 검사 대상이 아니다 — 없던 검사를 실패로 바꾸면 기존 증빙이
    통째로 죽는다. 주장이 있는 증빙만, 그 주장에 대해 검사한다.
    """
    if not evidence.scan_target or not evidence.scan_target_digest:
        return None

    target = Path(evidence.scan_target)
    if not target.exists():
        return "scanned source no longer exists"

    try:
        current = digest_scan_target(target)
    except OSError as exc:
        return f"scanned source could not be re-read: {exc.strerror or type(exc).__name__}"

    if current != evidence.scan_target_digest:
        return "scanned source changed since approval (source drift)"
    return None
