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
실제 CLI 연결은 인자·출력 스키마를 실측한 뒤의 후속 Security 작업이다
(docs/mcp-admission.md 참조).
"""

import hashlib
import json
from collections.abc import Callable, Mapping
from datetime import datetime, timedelta
from enum import Enum
from pathlib import Path
from typing import Any, Protocol, runtime_checkable

from pydantic import BaseModel, Field, ValidationError, field_validator

from utils.time import to_aware_utc, utcnow

#: 명시적 만료가 없는 증빙의 기본 수명.
DEFAULT_EVIDENCE_MAX_AGE = timedelta(days=90)


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
    )


class ScanReport(BaseModel):
    """스캐너 어댑터의 출력 계약 (실제 CLI 연결 전 fixture 로 대체되는 지점)."""

    scanner_id: str = Field(min_length=1)
    scanner_version: str = Field(min_length=1)
    status: ScanStatus
    scanned_at: datetime
    findings: list[dict[str, Any]] = Field(default_factory=list)
    raw_summary: str = ""


class SupplyChainScanner(Protocol):
    """어댑터 계약. 구현체는 후보를 받아 `ScanReport` 를 돌려준다.

    실제 도구(SkillSpector 등)의 인자·출력은 아직 실측하지 않았으므로
    추측 실행 대신 이 계약과 fixture 구현만 둔다.
    """

    def scan(self, candidate: MCPCandidate) -> ScanReport: ...


class EvidenceStore(Protocol):
    """증빙 영속화 인터페이스 (server_id 로 색인)."""

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
    """JSON 파일 저장소.

    읽기 실패(파일 없음·깨진 JSON·스키마 불일치)는 모두 **증빙 없음** 으로 접힌다.
    저장소가 고장 났을 때 열어주는 것이 가장 위험한 실패 모드이기 때문이다.
    """

    def __init__(self, path: Path | str) -> None:
        self._path = Path(path)

    def _load(self) -> dict[str, Any]:
        try:
            raw = json.loads(self._path.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError):
            return {}
        return raw if isinstance(raw, dict) else {}

    def get(self, server_id: str) -> AdmissionEvidence | None:
        entry = self._load().get(server_id)
        if not isinstance(entry, Mapping):
            return None
        try:
            return AdmissionEvidence.model_validate(dict(entry))
        except ValidationError:
            return None

    def put(self, evidence: AdmissionEvidence) -> None:
        data = self._load()
        data[evidence.server_id] = json.loads(evidence.model_dump_json())
        self._path.parent.mkdir(parents=True, exist_ok=True)
        self._path.write_text(
            json.dumps(data, indent=2, ensure_ascii=False, sort_keys=True) + "\n",
            encoding="utf-8",
        )

    def revoke(self, server_id: str) -> bool:
        data = self._load()
        if server_id not in data:
            return False
        del data[server_id]
        self._path.write_text(
            json.dumps(data, indent=2, ensure_ascii=False, sort_keys=True) + "\n",
            encoding="utf-8",
        )
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
