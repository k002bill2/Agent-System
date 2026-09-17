"""MCP admission — 증빙 없는 외부 MCP 는 등록·기동될 수 없다 (fail closed).

계약:
  1. candidate fingerprint 는 실행에 영향을 주는 모든 필드(command·args·env·transport)를 묶는다.
     env 값 하나만 바뀌어도 이전 PASS 는 재사용되지 않는다.
  2. 증빙은 fingerprint · 스캐너 신원/버전 · 스캔 결과/시각 · 검토자 신원/결정을 함께 묶는다.
  3. 없음 / 불일치 / 스캔 실패 / 미승인 / 만료 중 하나라도 해당하면 거부한다.
  4. built-in 신뢰는 **id 가 아니라 fingerprint** 에 걸린다 — id 도용으로 우회할 수 없다.
"""

import json
from datetime import timedelta

import pytest
from pydantic import ValidationError

from services.mcp_admission import (
    DEFAULT_EVIDENCE_MAX_AGE,
    AdmissionDenialCode,
    AdmissionEvidence,
    AdmissionGate,
    FileEvidenceStore,
    InMemoryEvidenceStore,
    MCPAdmissionError,
    ReviewDecision,
    ScanStatus,
    build_evidence,
    compute_candidate_fingerprint,
)
from utils.time import utcnow


class FakeCandidate:
    """`MCPServerConfig` 와 구조만 같은 최소 후보 (구조적 타이핑 계약을 잠근다)."""

    def __init__(self, server_id="ext", command="npx", args=None, env=None, transport="stdio"):
        self.id = server_id
        self.command = command
        self.args = list(args) if args is not None else ["-y", "some-mcp"]
        self.env = dict(env) if env is not None else {}
        self.transport = transport


NOW = utcnow()


def _evidence(candidate=None, **overrides):
    candidate = candidate or FakeCandidate()
    fields = {
        "server_id": candidate.id,
        "candidate_fingerprint": compute_candidate_fingerprint(candidate),
        "scanner_id": "skillspector",
        "scanner_version": "2.5.1",
        "scan_status": ScanStatus.PASS,
        "scanned_at": NOW - timedelta(days=1),
        "reviewer": "security@example.test",
        "review_decision": ReviewDecision.APPROVED,
        "reviewed_at": NOW - timedelta(hours=12),
    }
    fields.update(overrides)
    return AdmissionEvidence(**fields)


def _gate(evidence=None, *, trusted=frozenset(), now=None):
    store = InMemoryEvidenceStore()
    if evidence is not None:
        store.put(evidence)
    return AdmissionGate(
        store=store,
        trusted_fingerprints=trusted,
        clock=lambda: now or NOW,
    )


# ------------------------------------------------------------------ fingerprint


def test_fingerprint_is_stable_for_equal_candidates():
    assert compute_candidate_fingerprint(FakeCandidate()) == compute_candidate_fingerprint(
        FakeCandidate()
    )


def test_fingerprint_is_hex_sha256():
    digest = compute_candidate_fingerprint(FakeCandidate())

    assert len(digest) == 64
    assert set(digest) <= set("0123456789abcdef")


@pytest.mark.parametrize(
    "drift",
    [
        {"command": "curl"},
        {"args": ["-y", "some-other-mcp"]},
        {"args": ["some-mcp", "-y"]},
        {"server_id": "ext2"},
        {"transport": "sse"},
        {"env": {"NODE_OPTIONS": "--require /tmp/evil.js"}},
    ],
    ids=["command", "package", "arg-order", "id", "transport", "env-value"],
)
def test_any_execution_relevant_drift_changes_the_fingerprint(drift):
    """env 값 주입(NODE_OPTIONS 등)까지 포함해야 이전 PASS 재사용을 막는다."""
    baseline = compute_candidate_fingerprint(FakeCandidate())

    assert compute_candidate_fingerprint(FakeCandidate(**drift)) != baseline


def test_env_key_order_does_not_change_the_fingerprint():
    """정규화된 입력이라 선언 순서는 무의미하다 (거짓 drift 방지)."""
    a = FakeCandidate(env={"A": "1", "B": "2"})
    b = FakeCandidate(env={"B": "2", "A": "1"})

    assert compute_candidate_fingerprint(a) == compute_candidate_fingerprint(b)


def test_fingerprint_does_not_leak_env_values():
    """digest 만 남는다 — 원본 값은 저장·로그 어디에도 실리지 않는다."""
    secret = "super-secret-token-value"

    digest = compute_candidate_fingerprint(FakeCandidate(env={"TOKEN": secret}))

    assert secret not in digest


# ------------------------------------------------------------------- 증빙 모델


def test_evidence_requires_a_reviewer_identity():
    with pytest.raises(ValidationError):
        _evidence(reviewer="")


def test_evidence_rejects_unknown_scan_status():
    with pytest.raises(ValidationError):
        _evidence(scan_status="probably-fine")


def test_build_evidence_binds_the_candidate_fingerprint():
    """어댑터 출력으로 증빙을 만들 때 후보와의 결속은 자동이다."""
    candidate = FakeCandidate()

    evidence = build_evidence(
        candidate,
        scanner_id="skillspector",
        scanner_version="2.5.1",
        scan_status=ScanStatus.PASS,
        scanned_at=NOW,
        reviewer="security@example.test",
        review_decision=ReviewDecision.APPROVED,
        reviewed_at=NOW,
    )

    assert evidence.candidate_fingerprint == compute_candidate_fingerprint(candidate)
    assert evidence.server_id == candidate.id


# --------------------------------------------------------------- 게이트 판정


def test_missing_evidence_is_denied():
    decision = _gate().decide(FakeCandidate())

    assert decision.allowed is False
    assert decision.code is AdmissionDenialCode.NO_EVIDENCE


def test_matching_pass_evidence_is_allowed():
    candidate = FakeCandidate()

    decision = _gate(_evidence(candidate)).decide(candidate)

    assert decision.allowed is True
    assert decision.code is None


def test_candidate_drift_invalidates_a_previous_pass():
    """승인 후 command 가 바뀌면 이전 PASS 는 못 쓴다 (설계제약 2)."""
    approved = FakeCandidate()
    drifted = FakeCandidate(command="curl")

    decision = _gate(_evidence(approved)).decide(drifted)

    assert decision.allowed is False
    assert decision.code is AdmissionDenialCode.FINGERPRINT_MISMATCH


@pytest.mark.parametrize("status", [ScanStatus.FAIL, ScanStatus.ERROR, ScanStatus.SKIPPED])
def test_non_pass_scan_is_denied(status):
    """FAIL 뿐 아니라 ERROR·SKIPPED 도 통과가 아니다."""
    candidate = FakeCandidate()

    decision = _gate(_evidence(candidate, scan_status=status)).decide(candidate)

    assert decision.allowed is False
    assert decision.code is AdmissionDenialCode.SCAN_NOT_PASSED


@pytest.mark.parametrize("review", [ReviewDecision.DENIED, ReviewDecision.PENDING])
def test_review_not_approved_is_denied(review):
    candidate = FakeCandidate()

    decision = _gate(_evidence(candidate, review_decision=review)).decide(candidate)

    assert decision.allowed is False
    assert decision.code is AdmissionDenialCode.REVIEW_NOT_APPROVED


def test_expired_evidence_is_denied():
    candidate = FakeCandidate()
    evidence = _evidence(candidate, expires_at=NOW - timedelta(seconds=1))

    decision = _gate(evidence).decide(candidate)

    assert decision.allowed is False
    assert decision.code is AdmissionDenialCode.EVIDENCE_EXPIRED


def test_expiry_boundary_is_closed():
    """만료 시각 정각은 만료다 (경계에서 열리지 않는다)."""
    candidate = FakeCandidate()
    evidence = _evidence(candidate, expires_at=NOW)

    assert _gate(evidence).decide(candidate).code is AdmissionDenialCode.EVIDENCE_EXPIRED


def test_evidence_without_explicit_expiry_ages_out():
    """expires_at 이 없으면 스캔 시각 + 기본 수명으로 판정한다."""
    candidate = FakeCandidate()
    stale = _evidence(candidate, scanned_at=NOW - DEFAULT_EVIDENCE_MAX_AGE - timedelta(seconds=1))

    decision = _gate(stale).decide(candidate)

    assert decision.allowed is False
    assert decision.code is AdmissionDenialCode.EVIDENCE_EXPIRED


def test_fresh_evidence_within_default_age_is_allowed():
    candidate = FakeCandidate()
    fresh = _evidence(candidate, scanned_at=NOW - DEFAULT_EVIDENCE_MAX_AGE + timedelta(hours=1))

    assert _gate(fresh).decide(candidate).allowed is True


def test_evidence_filed_under_another_server_id_is_not_reused():
    """증빙은 server_id 로 색인된다 — 남의 증빙을 빌려올 수 없다."""
    candidate = FakeCandidate(server_id="ext")
    other = FakeCandidate(server_id="other")

    decision = _gate(_evidence(other)).decide(candidate)

    assert decision.allowed is False
    assert decision.code is AdmissionDenialCode.NO_EVIDENCE


# ------------------------------------------------------- built-in 신뢰 경계


def test_trusted_builtin_fingerprint_is_allowed_without_evidence():
    builtin = FakeCandidate(server_id="filesystem", command="npx", args=["-y", "fs-mcp"])

    decision = _gate(trusted={compute_candidate_fingerprint(builtin)}).decide(builtin)

    assert decision.allowed is True
    assert decision.builtin_trusted is True


def test_builtin_id_with_drifted_command_is_not_trusted():
    """id 만 같고 실행 내용이 다르면 신뢰 대상이 아니다 (id 도용 차단)."""
    builtin = FakeCandidate(server_id="filesystem", command="npx", args=["-y", "fs-mcp"])
    impostor = FakeCandidate(server_id="filesystem", command="curl", args=["evil.example"])

    decision = _gate(trusted={compute_candidate_fingerprint(builtin)}).decide(impostor)

    assert decision.allowed is False
    assert decision.code is AdmissionDenialCode.NO_EVIDENCE


# ----------------------------------------------------------------- authorize


def test_authorize_raises_with_the_denial_code():
    with pytest.raises(MCPAdmissionError) as exc_info:
        _gate().authorize(FakeCandidate())

    assert exc_info.value.decision.code is AdmissionDenialCode.NO_EVIDENCE
    assert "ext" in str(exc_info.value)


def test_authorize_error_does_not_leak_env_values():
    """거부 메시지는 로그로 흘러간다 — 시크릿을 싣지 않는다."""
    secret = "super-secret-token-value"
    candidate = FakeCandidate(env={"TOKEN": secret})

    with pytest.raises(MCPAdmissionError) as exc_info:
        _gate().authorize(candidate)

    assert secret not in str(exc_info.value)
    assert secret not in repr(exc_info.value.decision)


def test_authorize_returns_the_decision_when_allowed():
    candidate = FakeCandidate()

    decision = _gate(_evidence(candidate)).authorize(candidate)

    assert decision.allowed is True


# ------------------------------------------------------------------ 증빙 저장소


def test_in_memory_store_roundtrip():
    store = InMemoryEvidenceStore()
    evidence = _evidence()

    store.put(evidence)

    assert store.get("ext") == evidence


def test_in_memory_store_revoke():
    store = InMemoryEvidenceStore()
    store.put(_evidence())

    assert store.revoke("ext") is True
    assert store.get("ext") is None
    assert store.revoke("ext") is False


def test_file_store_persists_across_instances(tmp_path):
    path = tmp_path / "admission.json"
    FileEvidenceStore(path).put(_evidence())

    reloaded = FileEvidenceStore(path).get("ext")

    assert reloaded is not None
    assert reloaded.candidate_fingerprint == compute_candidate_fingerprint(FakeCandidate())


def test_file_store_does_not_persist_raw_env_values(tmp_path):
    """영속화되는 것은 digest 뿐이다."""
    secret = "super-secret-token-value"
    candidate = FakeCandidate(env={"TOKEN": secret})
    path = tmp_path / "admission.json"

    FileEvidenceStore(path).put(_evidence(candidate))

    assert secret not in path.read_text(encoding="utf-8")


def test_file_store_treats_corrupt_file_as_no_evidence(tmp_path):
    """읽을 수 없는 증빙 파일은 '증빙 없음' 이다 — 열어주지 않는다."""
    path = tmp_path / "admission.json"
    path.write_text("{not json", encoding="utf-8")

    assert FileEvidenceStore(path).get("ext") is None


def test_file_store_treats_schema_drift_as_no_evidence(tmp_path):
    """스키마가 어긋난 항목도 통과시키지 않는다."""
    path = tmp_path / "admission.json"
    path.write_text(json.dumps({"ext": {"server_id": "ext"}}), encoding="utf-8")

    assert FileEvidenceStore(path).get("ext") is None


def test_missing_file_is_no_evidence(tmp_path):
    assert FileEvidenceStore(tmp_path / "nope.json").get("ext") is None


def test_file_store_gate_denies_when_file_is_corrupt(tmp_path):
    """저장소 고장은 fail-open 이 아니다."""
    path = tmp_path / "admission.json"
    path.write_text("{not json", encoding="utf-8")
    gate = AdmissionGate(store=FileEvidenceStore(path), clock=lambda: NOW)

    assert gate.decide(FakeCandidate()).allowed is False
