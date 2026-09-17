"""SkillSpector CLI 어댑터 — 스캐너 출력이 증빙이 되는 경계 (fail closed).

이 파일이 잠그는 계약:
  1. 판정은 **exit code 가 아니라 리포트의 recommendation** 에서 온다.
     실측: `RISK_THRESHOLD=50` 이라 exit 0 은 LOW(SAFE) 와 MEDIUM(CAUTION) 을 함께 덮는다.
  2. exit code 는 리포트 **해석 이전에** 본다. 실측: `cli.py` 는 `execution_successful=False`
     일 때도 리포트를 먼저 쓰고 exit 2 를 낸다 — "유효한 SAFE 리포트 + 실패한 실행" 이 실재한다.
  3. 스캔 대상은 **fingerprint 로 색인**된다. id·표시 이름은 소스 무결성이 아니다.
  4. 실행 불가·타임아웃·깨진 리포트·낯선 스키마·소스 불일치는 전부 ERROR 이며 증빙을 만들지 않는다.
  5. 후보 env 값은 argv 에도 자식 env 에도 실리지 않는다.
"""

import json
from pathlib import Path

from services.mcp_admission import ScanStatus

FIXTURES = Path(__file__).parent / "fixtures" / "skillspector"


def _fixture_bytes(name: str) -> bytes:
    return (FIXTURES / name).read_bytes()


class FakeCandidate:
    """`MCPServerConfig` 와 구조만 같은 최소 후보."""

    def __init__(self, server_id="ext", command="npx", args=None, env=None, transport="stdio"):
        self.id = server_id
        self.command = command
        self.args = list(args) if args is not None else ["-y", "some-mcp"]
        self.env = dict(env) if env is not None else {}
        self.transport = transport


class TestGenuineReportSchema:
    """실제 CLI v2.5.1 출력(byte 단위 캡처)에 파서를 고정한다.

    합성 fixture 로만 만든 파서가 실데이터에서 전부 unknown 이 되는 사례가 있었으므로,
    이 층은 **실측 산출물** 로만 검증한다.
    """

    def test_genuine_safe_report_yields_pass_verdict(self):
        from services.skillspector_adapter import parse_scan_report

        verdict = parse_scan_report(_fixture_bytes("safe_low.json"), returncode=0)

        assert verdict.status is ScanStatus.PASS
        assert verdict.scanner_version == "2.5.1"
        assert verdict.source == "/private/tmp/ss_probe"

    def test_genuine_do_not_install_report_yields_fail_verdict(self):
        """DO_NOT_INSTALL 은 ERROR('모름') 가 아니라 FAIL('안전하지 않음') 이다."""
        from services.skillspector_adapter import parse_scan_report

        # 실측: risk_score 100 > RISK_THRESHOLD 50 → CLI 는 exit 1 을 낸다.
        verdict = parse_scan_report(_fixture_bytes("do_not_install.json"), returncode=1)

        assert verdict.status is ScanStatus.FAIL
        assert "DO_NOT_INSTALL" in verdict.detail

    def test_caution_report_at_exit_zero_is_not_a_pass(self):
        """실측 RISK_THRESHOLD=50 — score 21~50 은 CAUTION 인데도 exit 0 이다.

        exit code 를 판정 근거로 삼으면 여기서 조용히 열린다.
        """
        from services.skillspector_adapter import parse_scan_report

        raw = json.loads(_fixture_bytes("safe_low.json"))
        raw["risk_assessment"] = {"score": 30, "severity": "MEDIUM", "recommendation": "CAUTION"}

        verdict = parse_scan_report(json.dumps(raw).encode(), returncode=0)

        assert verdict.status is ScanStatus.FAIL

    def test_report_digest_is_sha256_of_raw_bytes(self):
        """증빙에 실리는 digest 는 재직렬화가 아니라 **원본 바이트** 기준이다."""
        import hashlib

        from services.skillspector_adapter import parse_scan_report

        raw = _fixture_bytes("safe_low.json")
        verdict = parse_scan_report(raw, returncode=0)

        assert verdict.report_sha256 == hashlib.sha256(raw).hexdigest()


def _report_for(target: Path, **overrides) -> bytes:
    """실측 fixture 의 구조를 그대로 쓰되 `skill.source` 만 이 테스트의 대상으로 바꾼다.

    오버라이드는 **한 단계만** 병합한다 (`metadata`·`risk_assessment` 처럼 최상위 키).
    `skill=...` 를 넘기면 `source` 재작성이 통째로 덮여 결속 테스트가 엉뚱한 이유로
    통과하므로, 중첩 키를 바꿔야 하면 이 헬퍼를 고치지 말고 raw 를 직접 만든다.

    fixture 의 원본 source(`/private/tmp/ss_probe`)는 테스트 시점에 존재하지 않으므로,
    결속(binding)을 검증하는 층은 실제 `tmp_path` 로 다시 쓴 복사본을 쓴다.
    구조는 실측 산출물 그대로다 — 손으로 지어낸 스키마가 아니다.
    """
    raw = json.loads(_fixture_bytes("safe_low.json"))
    raw["skill"]["source"] = str(Path(target).resolve())
    for key, value in overrides.items():
        if isinstance(value, dict) and isinstance(raw.get(key), dict):
            raw[key] = {**raw[key], **value}
        else:
            raw[key] = value
    return json.dumps(raw).encode()


class FakeRunner:
    """`subprocess.run` 대역 — argv/env 를 기록하고 리포트 파일을 대신 써 준다.

    실패 경로는 손으로 status 를 세팅하지 않고 **진짜 트리거**(exit code, 깨진 바이트,
    TimeoutExpired)로 만든다. 가드를 손으로 세운 플래그로 테스트하면 신호가 실제로
    도달하는지를 못 본다.
    """

    def __init__(self, *, returncode=0, payload=None, raises=None, write_report=True):
        self.returncode = returncode
        self.payload = payload
        self.raises = raises
        self.write_report = write_report
        self.calls: list[dict] = []

    def __call__(self, argv, **kwargs):
        import subprocess

        self.calls.append({"argv": list(argv), **kwargs})
        if self.raises is not None:
            raise self.raises
        if self.write_report:
            output_path = Path(argv[argv.index("--output") + 1])
            payload = self.payload
            if payload is None:
                payload = _report_for(Path(argv[2]))
            output_path.write_bytes(payload)
        return subprocess.CompletedProcess(args=list(argv), returncode=self.returncode)


def _scanner(targets, runner=None, **kwargs):
    from services.skillspector_adapter import SkillSpectorScanner

    return SkillSpectorScanner(
        targets,
        runner=runner if runner is not None else FakeRunner(),
        which=kwargs.pop("which", lambda _name: "/usr/local/bin/skillspector"),
        **kwargs,
    )


def _targets(candidate, target):
    from services.mcp_admission import compute_candidate_fingerprint

    return {compute_candidate_fingerprint(candidate): Path(target)}


class TestScannerSubprocessBoundary:
    """자식 프로세스를 어떻게 부르는가 — argv·env·셸 사용 여부."""

    def test_argv_matches_the_documented_machine_readable_shape(self, tmp_path):
        candidate = FakeCandidate()
        runner = FakeRunner()

        _scanner(_targets(candidate, tmp_path), runner).scan(candidate)

        argv = runner.calls[0]["argv"]
        assert argv[0] == "/usr/local/bin/skillspector"
        assert argv[1] == "scan"
        assert argv[2] == str(tmp_path.resolve())
        assert "--no-llm" in argv
        assert argv[argv.index("--format") + 1] == "json"
        assert argv[argv.index("--output") + 1].endswith(".json")

    def test_scanner_never_uses_a_shell(self, tmp_path):
        candidate = FakeCandidate()
        runner = FakeRunner()

        _scanner(_targets(candidate, tmp_path), runner).scan(candidate)

        call = runner.calls[0]
        assert call.get("shell") is None
        assert isinstance(call["argv"], list)
        assert all(isinstance(part, str) for part in call["argv"])

    def test_candidate_env_values_reach_neither_argv_nor_child_env(self, tmp_path):
        """AC4 — 시크릿은 argv 에도, 자식 환경에도 실리지 않는다."""
        secret = "ghp_livetokenvalue000"
        candidate = FakeCandidate(env={"GITHUB_TOKEN": secret})
        runner = FakeRunner()

        _scanner(_targets(candidate, tmp_path), runner).scan(candidate)

        call = runner.calls[0]
        assert secret not in " ".join(call["argv"])
        assert secret not in json.dumps(call["env"])

    def test_child_env_is_minimal_and_carries_no_scanner_credentials(self, tmp_path, monkeypatch):
        """부모 환경을 통째로 물려주면 LLM 자격증명이 스캐너에 넘어간다 — 얻는 것 없이."""
        monkeypatch.setenv("ANTHROPIC_API_KEY", "sk-ant-parentvalue")
        monkeypatch.setenv("OPENAI_API_KEY", "sk-openai-parentvalue")
        candidate = FakeCandidate()
        runner = FakeRunner()

        _scanner(_targets(candidate, tmp_path), runner).scan(candidate)

        child_env = runner.calls[0]["env"]
        assert "ANTHROPIC_API_KEY" not in child_env
        assert "OPENAI_API_KEY" not in child_env
        assert "SKILLSPECTOR_PROVIDER" not in child_env

    def test_scan_target_is_keyed_by_fingerprint_not_server_id(self, tmp_path):
        """id 는 가변 표시값이다 — 같은 id 로 command 를 바꾼 후보는 남의 대상을 못 빌린다."""
        approved = FakeCandidate(command="npx")
        tampered = FakeCandidate(command="curl")
        runner = FakeRunner()

        report = _scanner(_targets(approved, tmp_path), runner).scan(tampered)

        assert report.status is ScanStatus.ERROR
        assert runner.calls == []


class TestScannerFailsClosed:
    """판정을 얻지 못하는 모든 경로는 ERROR 이고, 자식 프로세스는 허용되지 않는다."""

    def test_missing_executable_yields_error_without_spawning(self, tmp_path):
        candidate = FakeCandidate()
        runner = FakeRunner()

        report = _scanner(_targets(candidate, tmp_path), runner, which=lambda _n: None).scan(
            candidate
        )

        assert report.status is ScanStatus.ERROR
        assert runner.calls == []

    def test_missing_scan_target_directory_yields_error_without_spawning(self, tmp_path):
        candidate = FakeCandidate()
        runner = FakeRunner()

        report = _scanner(_targets(candidate, tmp_path / "gone"), runner).scan(candidate)

        assert report.status is ScanStatus.ERROR
        assert runner.calls == []

    def test_timeout_yields_error(self, tmp_path):
        import subprocess

        candidate = FakeCandidate()
        runner = FakeRunner(raises=subprocess.TimeoutExpired(cmd="skillspector", timeout=1))

        report = _scanner(_targets(candidate, tmp_path), runner).scan(candidate)

        assert report.status is ScanStatus.ERROR
        assert "timed out" in report.raw_summary

    def test_execution_failure_exit_with_a_safe_report_is_error(self, tmp_path):
        """실측: cli.py 는 실행 실패 시에도 **리포트를 먼저 쓰고** exit 2 를 낸다.

        리포트를 먼저 해석하면 여기서 조용히 열린다 — 구조는 멀쩡하고 SAFE 라고 적혀 있다.
        """
        candidate = FakeCandidate()
        runner = FakeRunner(returncode=2, payload=_report_for(tmp_path))

        report = _scanner(_targets(candidate, tmp_path), runner).scan(candidate)

        assert report.status is ScanStatus.ERROR
        # 상태만 단언하면 다른 분기(예: 일반 fallthrough)로 ERROR 가 나도 통과한다 —
        # 사유까지 못 박아야 '리포트보다 exit code 를 먼저 본다' 는 기전이 잠긴다.
        assert "exited 2" in report.raw_summary

    def test_malformed_report_yields_error(self, tmp_path):
        candidate = FakeCandidate()
        runner = FakeRunner(payload=b"{not json at all")

        report = _scanner(_targets(candidate, tmp_path), runner).scan(candidate)

        assert report.status is ScanStatus.ERROR
        assert "not valid JSON" in report.raw_summary

    def test_unrecognized_schema_yields_error(self, tmp_path):
        """유효한 JSON 이지만 낯선 모양 — '지적 0건' 으로 읽으면 안 된다."""
        candidate = FakeCandidate()
        runner = FakeRunner(payload=json.dumps({"risk_score": 0, "findings": []}).encode())

        report = _scanner(_targets(candidate, tmp_path), runner).scan(candidate)

        assert report.status is ScanStatus.ERROR
        assert "schema" in report.raw_summary

    def test_absent_report_file_yields_error(self, tmp_path):
        candidate = FakeCandidate()
        runner = FakeRunner(write_report=False)

        report = _scanner(_targets(candidate, tmp_path), runner).scan(candidate)

        assert report.status is ScanStatus.ERROR
        assert "no report" in report.raw_summary

    def test_llm_enabled_report_is_rejected_even_when_safe(self, tmp_path):
        candidate = FakeCandidate()
        runner = FakeRunner(payload=_report_for(tmp_path, metadata={"llm_requested": True}))

        report = _scanner(_targets(candidate, tmp_path), runner).scan(candidate)

        assert report.status is ScanStatus.ERROR
        assert "static-only" in report.raw_summary

    def test_report_about_a_different_source_is_rejected(self, tmp_path):
        """스캐너가 우리가 지정한 대상이 아닌 곳을 봤다면 그 판정은 이 후보의 것이 아니다."""
        candidate = FakeCandidate()
        elsewhere = tmp_path / "elsewhere"
        elsewhere.mkdir()
        runner = FakeRunner(payload=_report_for(elsewhere))

        report = _scanner(_targets(candidate, tmp_path), runner).scan(candidate)

        assert report.status is ScanStatus.ERROR
        assert "source" in report.raw_summary


class TestScannerBindsSource:
    def test_symlinked_target_binds_through_the_real_path(self, tmp_path):
        """macOS 는 /tmp→/private/tmp 로 정규화한다 — 양쪽 다 resolve 하지 않으면
        로컬에서만 통과하고 CI 에서 깨진다."""
        real = tmp_path / "real"
        real.mkdir()
        (real / "SKILL.md").write_text("# probe\n")
        link = tmp_path / "link"
        link.symlink_to(real, target_is_directory=True)
        candidate = FakeCandidate()
        runner = FakeRunner(payload=_report_for(real))

        report = _scanner(_targets(candidate, link), runner).scan(candidate)

        assert report.status is ScanStatus.PASS

    def test_pass_report_carries_version_digest_and_target(self, tmp_path):
        import hashlib

        candidate = FakeCandidate()
        payload = _report_for(tmp_path)
        runner = FakeRunner(payload=payload)

        report = _scanner(_targets(candidate, tmp_path), runner).scan(candidate)

        assert report.status is ScanStatus.PASS
        assert report.scanner_id == "skillspector"
        assert report.scanner_version == "2.5.1"
        assert report.report_sha256 == hashlib.sha256(payload).hexdigest()
        assert report.scan_target == str(tmp_path.resolve())
        assert report.scan_target_digest


def _target_tree(tmp_path: Path) -> Path:
    target = tmp_path / "vendored-mcp"
    target.mkdir()
    (target / "SKILL.md").write_text("# vendored mcp\n")
    return target


def _scan(candidate, target, **runner_kwargs):
    runner = FakeRunner(payload=_report_for(target), **runner_kwargs)
    return _scanner(_targets(candidate, target), runner).scan(candidate)


class TestEvidenceMinting:
    """스캔 결과 + 사람 승인이 **둘 다** 있어야 증빙이 생긴다 (AC1)."""

    def test_safe_scan_with_explicit_approval_mints_admissible_evidence(self, tmp_path):
        from services.mcp_admission import (
            AdmissionGate,
            InMemoryEvidenceStore,
            ReviewDecision,
        )
        from services.skillspector_adapter import mint_admission_evidence
        from utils.time import utcnow

        candidate = FakeCandidate()
        target = _target_tree(tmp_path)

        evidence = mint_admission_evidence(
            candidate,
            _scan(candidate, target),
            reviewer="security@example.test",
            review_decision=ReviewDecision.APPROVED,
            reviewed_at=utcnow(),
        )

        assert evidence is not None
        store = InMemoryEvidenceStore()
        store.put(evidence)
        assert AdmissionGate(store=store).decide(candidate).allowed is True

    def test_safe_scan_without_explicit_approval_mints_nothing(self, tmp_path):
        """스캔 통과는 승인이 아니다 — PENDING 은 '아직 아무도 보지 않았다' 는 뜻이다."""
        from services.mcp_admission import ReviewDecision
        from services.skillspector_adapter import mint_admission_evidence
        from utils.time import utcnow

        candidate = FakeCandidate()
        target = _target_tree(tmp_path)

        for decision in (ReviewDecision.PENDING, ReviewDecision.DENIED):
            assert (
                mint_admission_evidence(
                    candidate,
                    _scan(candidate, target),
                    reviewer="security@example.test",
                    review_decision=decision,
                    reviewed_at=utcnow(),
                )
                is None
            )

    def test_unsafe_scan_mints_nothing_even_with_approval(self, tmp_path):
        """사람이 승인해도 스캐너가 불합격시킨 것은 증빙이 되지 않는다 (AC2)."""
        from services.mcp_admission import ReviewDecision
        from services.skillspector_adapter import mint_admission_evidence
        from utils.time import utcnow

        candidate = FakeCandidate()
        target = _target_tree(tmp_path)
        runner = FakeRunner(returncode=1, payload=_fixture_bytes("do_not_install.json"))
        report = _scanner(_targets(candidate, target), runner).scan(candidate)

        assert report.status is not ScanStatus.PASS
        assert (
            mint_admission_evidence(
                candidate,
                report,
                reviewer="security@example.test",
                review_decision=ReviewDecision.APPROVED,
                reviewed_at=utcnow(),
            )
            is None
        )

    def test_errored_scan_mints_nothing(self, tmp_path):
        from services.mcp_admission import ReviewDecision
        from services.skillspector_adapter import mint_admission_evidence
        from utils.time import utcnow

        candidate = FakeCandidate()
        target = _target_tree(tmp_path)
        report = _scan(candidate, target, returncode=2)

        assert report.status is ScanStatus.ERROR
        assert (
            mint_admission_evidence(
                candidate,
                report,
                reviewer="security@example.test",
                review_decision=ReviewDecision.APPROVED,
                reviewed_at=utcnow(),
            )
            is None
        )

    def test_evidence_binds_version_report_digest_target_and_fingerprint(self, tmp_path):
        """AC3 — 증빙 하나만 보고도 '무엇이 무엇을 검사했는가' 를 재확인할 수 있어야 한다."""
        from services.mcp_admission import ReviewDecision, compute_candidate_fingerprint
        from services.skillspector_adapter import mint_admission_evidence
        from utils.time import utcnow

        candidate = FakeCandidate()
        target = _target_tree(tmp_path)
        report = _scan(candidate, target)

        evidence = mint_admission_evidence(
            candidate,
            report,
            reviewer="security@example.test",
            review_decision=ReviewDecision.APPROVED,
            reviewed_at=utcnow(),
        )

        assert evidence.scanner_id == "skillspector"
        assert evidence.scanner_version == "2.5.1"
        assert evidence.report_sha256 == report.report_sha256
        assert evidence.scan_target == str(target.resolve())
        assert evidence.scan_target_digest == report.scan_target_digest
        assert evidence.candidate_fingerprint == compute_candidate_fingerprint(candidate)

    def test_evidence_never_carries_raw_env_values(self, tmp_path):
        from services.mcp_admission import ReviewDecision
        from services.skillspector_adapter import mint_admission_evidence
        from utils.time import utcnow

        secret = "ghp_livetokenvalue000"
        candidate = FakeCandidate(env={"GITHUB_TOKEN": secret})
        target = _target_tree(tmp_path)

        evidence = mint_admission_evidence(
            candidate,
            _scan(candidate, target),
            reviewer="security@example.test",
            review_decision=ReviewDecision.APPROVED,
            reviewed_at=utcnow(),
        )

        assert secret not in evidence.model_dump_json()


class TestSourceDriftInvalidatesEvidence:
    """AC3 — 승인 이후 **스캔된 소스가 바뀌면** 그 증빙은 더 이상 그 아티팩트를 가리키지 않는다."""

    def _approved(self, candidate, target):
        from services.mcp_admission import ReviewDecision
        from services.skillspector_adapter import mint_admission_evidence
        from utils.time import utcnow

        return mint_admission_evidence(
            candidate,
            _scan(candidate, target),
            reviewer="security@example.test",
            review_decision=ReviewDecision.APPROVED,
            reviewed_at=utcnow(),
        )

    def test_unchanged_source_verifies(self, tmp_path):
        from services.skillspector_adapter import verify_evidence_binding

        candidate = FakeCandidate()
        target = _target_tree(tmp_path)

        assert verify_evidence_binding(self._approved(candidate, target)) is None

    def test_modified_source_fails_verification(self, tmp_path):
        from services.skillspector_adapter import verify_evidence_binding

        candidate = FakeCandidate()
        target = _target_tree(tmp_path)
        evidence = self._approved(candidate, target)

        (target / "postinstall.js").write_text("// added after approval\n")

        assert verify_evidence_binding(evidence) is not None

    def test_vanished_source_fails_verification(self, tmp_path):
        import shutil

        from services.skillspector_adapter import verify_evidence_binding

        candidate = FakeCandidate()
        target = _target_tree(tmp_path)
        evidence = self._approved(candidate, target)

        shutil.rmtree(target)

        assert verify_evidence_binding(evidence) is not None

    def test_evidence_without_a_recorded_target_is_not_source_checked(self):
        """수동 검토 증빙(대상 digest 없음)은 이 검사의 대상이 아니다 — 없던 검사를
        '실패' 로 바꾸면 기존 증빙이 통째로 죽는다."""
        from services.mcp_admission import ReviewDecision, ScanStatus, build_evidence
        from services.skillspector_adapter import verify_evidence_binding
        from utils.time import utcnow

        manual = build_evidence(
            FakeCandidate(),
            scanner_id="manual-review",
            scanner_version="1",
            scan_status=ScanStatus.PASS,
            scanned_at=utcnow(),
            reviewer="security@example.test",
            review_decision=ReviewDecision.APPROVED,
            reviewed_at=utcnow(),
        )

        assert verify_evidence_binding(manual) is None


class TestInternallyInconsistentReportIsNotAPass:
    """리포트가 스스로 모순인 경우 — 정상 CLI 는 내지 않는 조합이므로 **변조 표면**이다.

    같은 OS 사용자 권한의 공격자는 리포트 파일을 고칠 수 있다. 판정이 단일 필드 하나에만
    걸려 있으면 그 필드 하나만 고치면 통과한다. 통과 조건을 이루는 필드들이 서로를
    검산하게 두면, 하나만 고친 리포트는 모순으로 드러난다.
    """

    def test_safe_recommendation_with_failed_execution_is_not_a_pass(self, tmp_path):
        """`execution_successful=false` 인데 SAFE — 실행되지 않은 검사는 판정이 아니다."""
        candidate = FakeCandidate()
        runner = FakeRunner(payload=_report_for(tmp_path, execution_successful=False))

        report = _scanner(_targets(candidate, tmp_path), runner).scan(candidate)

        assert report.status is ScanStatus.ERROR
        assert "execution_successful" in report.raw_summary

    def test_safe_recommendation_with_non_low_severity_is_not_a_pass(self, tmp_path):
        """recommendation 만 SAFE 로 바꾸고 severity 는 두고 온 리포트."""
        candidate = FakeCandidate()
        runner = FakeRunner(
            payload=_report_for(
                tmp_path,
                risk_assessment={"score": 90, "severity": "CRITICAL", "recommendation": "SAFE"},
            )
        )

        report = _scanner(_targets(candidate, tmp_path), runner).scan(candidate)

        assert report.status is not ScanStatus.PASS
        assert "contradicts itself" in report.raw_summary


class TestUndigestableTargetFailsClosed:
    """대상을 digest 할 수 없으면 PASS 도 ERROR 다.

    두 가지가 걸려 있다:
      1. `SupplyChainScanner` 계약 — 판정을 못 얻은 경우는 **예외가 아니라** ERROR 다.
      2. digest 없는 PASS 증빙은 `verify_evidence_binding` 이 '소스 결속을 주장하지 않는
         증빙'(수동 검토 기록)으로 보고 건너뛴다 — 스캐너를 거치고도 드리프트 검사를
         통째로 빠져나가는 경로가 된다.
    """

    def test_unreadable_file_in_target_yields_error_not_exception(self, tmp_path):
        target = tmp_path / "vendored"
        target.mkdir()
        (target / "SKILL.md").write_text("# probe\n")
        (target / "broken.js").symlink_to(tmp_path / "nonexistent")
        candidate = FakeCandidate()
        runner = FakeRunner(payload=_report_for(target))

        report = _scanner(_targets(candidate, target), runner).scan(candidate)

        assert report.status is ScanStatus.ERROR
        assert "digest" in report.raw_summary

    def test_a_scanner_pass_never_mints_evidence_without_a_target_digest(self, tmp_path):
        """digest 가 비어 있으면 증빙이 되지 않는다 — 드리프트 검사를 못 받는 증빙 금지."""
        from services.mcp_admission import ReviewDecision
        from services.skillspector_adapter import mint_admission_evidence
        from utils.time import utcnow

        target = tmp_path / "vendored"
        target.mkdir()
        (target / "broken.js").symlink_to(tmp_path / "nonexistent")
        candidate = FakeCandidate()
        runner = FakeRunner(payload=_report_for(target))
        report = _scanner(_targets(candidate, target), runner).scan(candidate)

        assert (
            mint_admission_evidence(
                candidate,
                report,
                reviewer="security@example.test",
                review_decision=ReviewDecision.APPROVED,
                reviewed_at=utcnow(),
            )
            is None
        )
