"""MCP admission control — 외부 MCP 서버의 공급망 입장 게이트 (fail closed).

`MCPManager` 는 등록된 설정의 `command`/`args`/`env` 로 subprocess 를 띄운다.
즉 "등록" 은 곧 임의 코드 실행 권한이며, 등록 이전에 검증 가능한 승인 결정이
있어야 한다. 이 모듈은 그 결정을 **증빙(evidence)** 으로 모델링한다.

증빙이 묶는 것:
- 후보 신원: `candidate_fingerprint` — command·args·env·transport·id 전체의 digest.
  실행에 영향을 주는 값이 하나라도 바뀌면 이전 PASS 는 무효다.
- 스캐너 신원: `scanner_id` / `scanner_version` / `scan_status` / `scanned_at`
- 검토 신원: `reviewer` / `review_decision` / `reviewed_at`
- 수명: `expires_at` (없으면 `scanned_at + DEFAULT_EVIDENCE_MAX_AGE`)

**시크릿 취급**: fingerprint 입력에는 env 값을 포함하지만(`NODE_OPTIONS=--require …`
같은 주입이 digest 를 바꿔야 하므로), 저장·로그·예외 메시지에는 digest 만 남는다.
원본 값은 메모리를 벗어나지 않는다.

**스캐너 연결 경계**: 이 모듈은 어댑터 **계약**(`SupplyChainScanner`)만 정의한다.
실제 CLI 구현은 `services.skillspector_adapter` 가 SkillSpector v2.5.1 을 실측해 연결한다
(docs/mcp-admission.md 참조). 이 모듈은 어느 스캐너가 붙든 판정 계약만 본다.
"""

import hashlib
import json
import os
import stat
import tempfile
from collections.abc import Callable, Mapping
from datetime import datetime, timedelta
from enum import Enum
from pathlib import Path
from typing import Any, Protocol, runtime_checkable

from pydantic import BaseModel, Field, ValidationError, field_validator

from utils.time import to_aware_utc, utcnow

#: 명시적 만료가 없는 증빙의 기본 수명.
DEFAULT_EVIDENCE_MAX_AGE = timedelta(days=90)

#: 증빙 파일 권한 — 소유자 읽기/쓰기만.
EVIDENCE_FILE_MODE = 0o600

#: 이 비트가 하나라도 켜져 있으면 소유자 외 다른 사용자가 건드릴 수 있다는 뜻이다.
_UNSAFE_PERMISSION_BITS = 0o077


def _is_unsafe_mode(mode: int) -> bool:
    """그룹/기타 사용자 권한 비트가 켜져 있는가."""
    return bool(stat.S_IMODE(mode) & _UNSAFE_PERMISSION_BITS)


class EvidenceStoreError(RuntimeError):
    """증빙 저장소가 안전하게 기록할 수 없는 상태다.

    읽기와 달리 쓰기는 **조용히 실패하지 않는다** — 기록한 척하면 운영자는 증빙이
    등록됐다고 믿고, 그 믿음이 다음 심사에서 허용의 근거가 된다.
    """


class ScanStatus(str, Enum):
    """공급망 스캔 결과. PASS 만 통과다 — ERROR·SKIPPED 는 '모름' 이지 '안전' 이 아니다."""

    PASS = "pass"
    FAIL = "fail"
    ERROR = "error"
    SKIPPED = "skipped"


class ReviewDecision(str, Enum):
    """사람 검토 결정. PENDING 은 승인이 아니다."""

    APPROVED = "approved"
    DENIED = "denied"
    PENDING = "pending"


class AdmissionDenialCode(str, Enum):
    """거부 사유. 로그·API 에서 원인을 구분하기 위한 안정적인 코드."""

    NO_EVIDENCE = "no_evidence"
    FINGERPRINT_MISMATCH = "fingerprint_mismatch"
    SCAN_NOT_PASSED = "scan_not_passed"
    REVIEW_NOT_APPROVED = "review_not_approved"
    EVIDENCE_EXPIRED = "evidence_expired"


@runtime_checkable
class MCPCandidate(Protocol):
    """fingerprint 대상이 되는 최소 구조 (`MCPServerConfig` 가 이를 만족한다)."""

    id: str
    command: str
    args: list[str]
    env: dict[str, str]
    transport: str


def compute_candidate_fingerprint(candidate: MCPCandidate) -> str:
    """실행에 영향을 주는 필드 전체의 정규 digest (sha256 hex).

    args 는 **순서를 보존**한다 (순서가 바뀌면 다른 명령이다). env 는 키로 정렬해
    선언 순서 차이가 거짓 drift 를 만들지 않게 한다. 반환값은 digest 뿐이므로
    호출자가 이 값을 저장·로깅해도 원본 값은 드러나지 않는다.
    """
    payload = {
        "id": candidate.id,
        "command": candidate.command,
        "args": list(candidate.args),
        "env": dict(sorted(candidate.env.items())),
        "transport": candidate.transport,
    }
    canonical = json.dumps(payload, sort_keys=True, separators=(",", ":"), ensure_ascii=True)
    return hashlib.sha256(canonical.encode("utf-8")).hexdigest()


class AdmissionEvidence(BaseModel):
    """등록·기동을 정당화하는 저장 가능한 승인 증빙."""

    server_id: str = Field(min_length=1)
    candidate_fingerprint: str = Field(min_length=64, max_length=64)
    scanner_id: str = Field(min_length=1)
    scanner_version: str = Field(min_length=1)
    scan_status: ScanStatus
    scanned_at: datetime
    reviewer: str = Field(min_length=1)
    review_decision: ReviewDecision
    reviewed_at: datetime
    expires_at: datetime | None = None
    notes: str = ""

    # --- 스캐너 결속 (실제 CLI 어댑터가 발급한 증빙에만 있다) ---
    # 수동 검토 기록은 이 값들이 없다. 따라서 `None` 은 "검사에 실패했다" 가 아니라
    # "이 증빙은 소스 결속을 주장하지 않는다" 는 뜻이며, 소스 검증의 대상이 아니다.
    #: 스캐너 리포트 원본 바이트의 sha256 — 어떤 리포트가 근거였는가.
    report_sha256: str | None = None
    #: 실제로 스캔된 대상의 정규화 경로 — 표시 이름이 아니라 소스 신원.
    scan_target: str | None = None
    #: 스캔 시점 대상 내용의 digest — 승인 이후 변경(source drift)의 판정 기준.
    scan_target_digest: str | None = None

    @field_validator("scanned_at", "reviewed_at", "expires_at")
    @classmethod
    def _normalize_clock(cls, value: datetime | None) -> datetime | None:
        """저장된 JSON 이 offset 없이 돌아와도 aware 비교가 깨지지 않게 한다."""
        return to_aware_utc(value) if value is not None else None

    def expiry(self) -> datetime:
        """명시적 만료 또는 스캔 시각 + 기본 수명."""
        return self.expires_at or (self.scanned_at + DEFAULT_EVIDENCE_MAX_AGE)


def build_evidence(
    candidate: MCPCandidate,
    *,
    scanner_id: str,
    scanner_version: str,
    scan_status: ScanStatus,
    scanned_at: datetime,
    reviewer: str,
    review_decision: ReviewDecision,
    reviewed_at: datetime,
    expires_at: datetime | None = None,
    notes: str = "",
    report_sha256: str | None = None,
    scan_target: str | None = None,
    scan_target_digest: str | None = None,
) -> AdmissionEvidence:
    """후보와 결속된 증빙을 만든다 — fingerprint 를 손으로 옮겨 적지 않게 한다."""
    return AdmissionEvidence(
        server_id=candidate.id,
        candidate_fingerprint=compute_candidate_fingerprint(candidate),
        scanner_id=scanner_id,
        scanner_version=scanner_version,
        scan_status=scan_status,
        scanned_at=scanned_at,
        reviewer=reviewer,
        review_decision=review_decision,
        reviewed_at=reviewed_at,
        expires_at=expires_at,
        notes=notes,
        report_sha256=report_sha256,
        scan_target=scan_target,
        scan_target_digest=scan_target_digest,
    )


class ScanReport(BaseModel):
    """스캐너 어댑터의 출력 계약.

    구현체는 `services.skillspector_adapter.SkillSpectorScanner` 이며, 결속 필드
    (`report_sha256`·`scan_target`·`scan_target_digest`)는 실제 CLI 를 거친 판정에만
    채워진다. 수동 검토 기록은 그 자리를 비워 두므로 소스 결속을 주장하지 않는다.
    """

    scanner_id: str = Field(min_length=1)
    scanner_version: str = Field(min_length=1)
    status: ScanStatus
    scanned_at: datetime
    findings: list[dict[str, Any]] = Field(default_factory=list)
    raw_summary: str = ""

    # --- 결속(binding) 재료 — 실제 CLI 어댑터가 채운다 (수동 검토 기록은 비워 둔다) ---
    #: 스캐너가 내놓은 리포트 **원본 바이트** 의 sha256.
    report_sha256: str | None = None
    #: 실제로 스캔된 대상의 정규화된 경로 (표시 이름이 아니라 소스 신원).
    scan_target: str | None = None
    #: 스캔 시점의 대상 내용 digest — 이후 변경(source drift)을 탐지하는 근거.
    scan_target_digest: str | None = None


class SupplyChainScanner(Protocol):
    """어댑터 계약. 구현체는 후보를 받아 `ScanReport` 를 돌려준다.

    구현: `services.skillspector_adapter.SkillSpectorScanner` (SkillSpector CLI v2.5.1).
    판정을 얻지 못한 경우는 전부 `ScanStatus.ERROR` 여야 한다 — 구현체가 실패를
    PASS 로 접으면 이 계약 위에 쌓인 게이트 전체가 무의미해진다.
    """

    def scan(self, candidate: MCPCandidate) -> ScanReport: ...


class EvidenceStore(Protocol):
    """증빙 영속화 인터페이스 (server_id 로 색인).

    `get` 은 어떤 실패든 `None`(증빙 없음)으로 접는다. `put` 은 반대로 실패를 드러낼
    수 있다 — 구현체는 무결성을 지킬 수 없으면 `EvidenceStoreError` 를 던진다
    (`InMemoryEvidenceStore` 는 던질 일이 없다).
    """

    def get(self, server_id: str) -> AdmissionEvidence | None: ...

    def put(self, evidence: AdmissionEvidence) -> None: ...

    def revoke(self, server_id: str) -> bool: ...


class InMemoryEvidenceStore:
    """프로세스 수명 저장소 — 테스트와 단일 프로세스 배포용."""

    def __init__(self) -> None:
        self._evidence: dict[str, AdmissionEvidence] = {}

    def get(self, server_id: str) -> AdmissionEvidence | None:
        return self._evidence.get(server_id)

    def put(self, evidence: AdmissionEvidence) -> None:
        self._evidence[evidence.server_id] = evidence

    def revoke(self, server_id: str) -> bool:
        return self._evidence.pop(server_id, None) is not None


class FileEvidenceStore:
    """JSON 파일 저장소 — 소유자 전용 권한 · 심링크 미추종 · 원자적 교체.

    읽기 실패(파일 없음·깨진 바이트·깨진 JSON·스키마 불일치·권한 이완·심링크)는 모두
    **증빙 없음** 으로 접힌다. 저장소가 고장 났을 때 열어주는 것이 가장 위험한 실패
    모드이기 때문이다.

    쓰기는 방향이 반대다 — 안전하게 기록할 수 없으면 `EvidenceStoreError` 를 던진다.

    **경계**: 같은 OS 사용자 권한의 변조는 이 계층이 막지 못한다(암호학적 승인
    무결성이 아니다). 여기서 막는 것은 다른 사용자의 접근, 심링크 유도, 그리고
    제자리 truncate 로 인한 부분 기록이다.
    """

    def __init__(self, path: Path | str) -> None:
        self._path = Path(path)

    def _integrity_problem(self) -> str | None:
        """경로를 그대로 읽거나 덮어써도 되는가 — 문제가 있으면 사유, 없으면 None.

        파일이 아직 없으면 문제 없음이다(새로 만들면 된다). 내용은 보지 않는다.
        """
        try:
            info = os.lstat(self._path)
        except OSError:
            return None
        if stat.S_ISLNK(info.st_mode):
            return "evidence path is a symlink"
        if not stat.S_ISREG(info.st_mode):
            return "evidence path is not a regular file"
        if _is_unsafe_mode(info.st_mode):
            return "evidence file is group/world accessible"
        return None

    def _read_text(self) -> str | None:
        """심링크를 따라가지 않고 읽는다. 권한 판정은 **열린 기술자** 기준이다.

        경로를 stat 한 뒤 다시 open 하면 그 사이에 바뀔 수 있으므로(TOCTOU),
        `O_NOFOLLOW` 로 연 fd 를 `fstat` 해 같은 객체를 검사한다.
        """
        try:
            fd = os.open(self._path, os.O_RDONLY | os.O_NOFOLLOW)
        except OSError:
            return None
        with os.fdopen(fd, "rb") as handle:
            try:
                info = os.fstat(handle.fileno())
                if not stat.S_ISREG(info.st_mode) or _is_unsafe_mode(info.st_mode):
                    return None
                return handle.read().decode("utf-8")
            except (OSError, ValueError):
                # ValueError 가 UnicodeDecodeError 를 덮는다 — 깨진 바이트도 '증빙 없음'.
                return None

    def _load(self) -> dict[str, Any]:
        text = self._read_text()
        if text is None:
            return {}
        try:
            raw = json.loads(text)
        except ValueError:
            return {}
        return raw if isinstance(raw, dict) else {}

    def _atomic_write(self, data: dict[str, Any]) -> None:
        """같은 디렉터리에 0600 임시 파일로 쓰고 `os.replace` 로 갈아끼운다.

        제자리 truncate 를 하지 않으므로 도중에 실패해도 기존 증빙은 온전하다.
        교체는 같은 파일시스템 안에서 일어나야 원자적이라 임시 파일도 같은 곳에 둔다.
        """
        payload = json.dumps(data, indent=2, ensure_ascii=False, sort_keys=True) + "\n"
        directory = self._path.parent
        directory.mkdir(parents=True, exist_ok=True)
        fd, tmp_name = tempfile.mkstemp(prefix=f".{self._path.name}.", suffix=".tmp", dir=directory)
        try:
            with os.fdopen(fd, "w", encoding="utf-8") as handle:
                # mkstemp 도 0600 으로 만들지만 umask 와 무관하게 명시적으로 고정한다.
                os.fchmod(handle.fileno(), EVIDENCE_FILE_MODE)
                handle.write(payload)
                handle.flush()
                os.fsync(handle.fileno())
            os.replace(tmp_name, self._path)
        except OSError as exc:
            Path(tmp_name).unlink(missing_ok=True)
            # 사유만 남긴다 — 파일 내용·env 원본은 예외 메시지에 싣지 않는다.
            raise EvidenceStoreError(
                f"could not write evidence to {self._path}: {exc.strerror or type(exc).__name__}"
            ) from exc

    def get(self, server_id: str) -> AdmissionEvidence | None:
        entry = self._load().get(server_id)
        if not isinstance(entry, Mapping):
            return None
        try:
            return AdmissionEvidence.model_validate(dict(entry))
        except ValidationError:
            return None

    def put(self, evidence: AdmissionEvidence) -> None:
        """증빙을 기록한다 (0600 · 원자적 교체).

        Raises:
            EvidenceStoreError: 경로가 심링크이거나 권한이 이완돼 있거나 기록이 실패한
                경우. 조용한 no-op 은 운영자가 증빙이 등록됐다고 믿게 만든다.
        """
        problem = self._integrity_problem()
        if problem is not None:
            raise EvidenceStoreError(f"{problem}: {self._path}")
        data = self._load()
        data[evidence.server_id] = json.loads(evidence.model_dump_json())
        self._atomic_write(data)

    def revoke(self, server_id: str) -> bool:
        """증빙을 제거한다.

        안전하지 않은 파일(심링크·권한 이완)에는 **쓰지 않고** False 를 돌려준다.
        그 파일은 `get` 이 이미 '증빙 없음' 으로 접으므로 해당 서버는 이미 차단
        상태다. 여기서 False 는 "항목이 없었다" 가 아니라 "제거하지 않았다" 는 뜻이다.
        """
        if self._integrity_problem() is not None:
            return False
        data = self._load()
        if server_id not in data:
            return False
        del data[server_id]
        self._atomic_write(data)
        return True


class AdmissionDecision(BaseModel):
    """게이트 판정. 거부 시 원인 코드와 사람이 읽을 사유를 함께 싣는다."""

    allowed: bool
    server_id: str
    fingerprint: str
    code: AdmissionDenialCode | None = None
    reason: str = ""
    builtin_trusted: bool = False


class MCPAdmissionError(RuntimeError):
    """admission 이 거부됐다. 등록·기동 경로는 이 예외를 삼키지 않는다."""

    def __init__(self, decision: AdmissionDecision) -> None:
        super().__init__(
            f"MCP admission denied for '{decision.server_id}' "
            f"[{decision.code.value if decision.code else 'unknown'}]: {decision.reason}"
        )
        self.decision = decision


class AdmissionGate:
    """등록·기동 직전에 증빙을 확인하는 fail-closed 게이트.

    Args:
        store: 증빙 저장소. 없으면 in-memory (증빙 0건 = 전부 거부).
        trusted_fingerprints: built-in 신뢰 앵커. **id 가 아니라 fingerprint** 라
            id 를 도용한 후보는 걸러진다.
        clock: 만료 판정용 시계 (테스트 주입).
    """

    def __init__(
        self,
        store: EvidenceStore | None = None,
        trusted_fingerprints: frozenset[str] | set[str] | None = None,
        clock: Callable[[], datetime] = utcnow,
    ) -> None:
        self._store = store if store is not None else InMemoryEvidenceStore()
        self._trusted = frozenset(trusted_fingerprints or ())
        self._clock = clock

    @property
    def store(self) -> EvidenceStore:
        return self._store

    def decide(self, candidate: MCPCandidate) -> AdmissionDecision:
        """후보의 입장 가능 여부를 판정한다 (예외 없음)."""
        fingerprint = compute_candidate_fingerprint(candidate)

        if fingerprint in self._trusted:
            return AdmissionDecision(
                allowed=True,
                server_id=candidate.id,
                fingerprint=fingerprint,
                reason="built-in trusted fingerprint",
                builtin_trusted=True,
            )

        evidence = self._store.get(candidate.id)
        if evidence is None:
            return self._deny(
                candidate,
                fingerprint,
                AdmissionDenialCode.NO_EVIDENCE,
                "no admission evidence on file",
            )

        return self._check_evidence(candidate, fingerprint, evidence)

    def _check_evidence(
        self, candidate: MCPCandidate, fingerprint: str, evidence: AdmissionEvidence
    ) -> AdmissionDecision:
        if evidence.candidate_fingerprint != fingerprint:
            return self._deny(
                candidate,
                fingerprint,
                AdmissionDenialCode.FINGERPRINT_MISMATCH,
                f"evidence binds {evidence.candidate_fingerprint[:12]}…, candidate is "
                f"{fingerprint[:12]}… (candidate changed since approval)",
            )

        if evidence.scan_status is not ScanStatus.PASS:
            return self._deny(
                candidate,
                fingerprint,
                AdmissionDenialCode.SCAN_NOT_PASSED,
                f"scan status is {evidence.scan_status.value} "
                f"({evidence.scanner_id} {evidence.scanner_version})",
            )

        if evidence.review_decision is not ReviewDecision.APPROVED:
            return self._deny(
                candidate,
                fingerprint,
                AdmissionDenialCode.REVIEW_NOT_APPROVED,
                f"review decision is {evidence.review_decision.value}",
            )

        if self._clock() >= evidence.expiry():
            return self._deny(
                candidate,
                fingerprint,
                AdmissionDenialCode.EVIDENCE_EXPIRED,
                f"evidence expired at {evidence.expiry().isoformat()}",
            )

        return AdmissionDecision(
            allowed=True,
            server_id=candidate.id,
            fingerprint=fingerprint,
            reason=(
                f"scan pass by {evidence.scanner_id} {evidence.scanner_version}, "
                f"approved by {evidence.reviewer}"
            ),
        )

    @staticmethod
    def _deny(
        candidate: MCPCandidate,
        fingerprint: str,
        code: AdmissionDenialCode,
        reason: str,
    ) -> AdmissionDecision:
        return AdmissionDecision(
            allowed=False,
            server_id=candidate.id,
            fingerprint=fingerprint,
            code=code,
            reason=reason,
        )

    def authorize(self, candidate: MCPCandidate) -> AdmissionDecision:
        """거부되면 `MCPAdmissionError` 를 던진다."""
        decision = self.decide(candidate)
        if not decision.allowed:
            raise MCPAdmissionError(decision)
        return decision
