"""projects/ 자동 등록이 느리거나 사라진 대상 때문에 기동을 막지 못하는지 검증.

배경(issue #410): `init_projects()` 는 lifespan 에서 동기 호출되고, 항목마다
`resolve()` / `is_dir()` / `CLAUDE.md` 읽기 같은 블로킹 I/O 를 상한 없이 수행한다.
iCloud 백업 경로(`projects/obsidian`)처럼 대상이 느리면 FastAPI readiness 가
그 시간만큼 통째로 막힌다. 등록 실패도 조용한 skip 이라 상태가 보고되지 않았다.

여기서 고정하는 계약:
- 항목 하나가 `entry_timeout` 이상 붙잡을 수 없다 (deferred 로 강등).
- deferred 항목도 레지스트리에 남는다 — 단, 대상을 건드리지 않고 readlink 로만.
- 대상이 없거나 예외가 나면 unavailable 로 **보고**된다 (조용한 skip 금지).
- projects/ 는 최상위 항목만 훑는다 — 자기참조 심링크로 재귀하지 않는다.
- 자동 등록 **전체**가 하나의 예산 안에서 끝난다 — 느린 링크 수에 비례해 늘지 않는다.
- 데드라인을 넘겨 버려진 daemon 워커 수에 상한이 있다.
- `PROJECT_INIT_TIMEOUT_SECONDS` 의 비유한·비양수 값은 기본값으로 강등된다.
"""

import os
import threading
import time
from pathlib import Path

import pytest

import models.project as project_module
from models.project import (
    DEFAULT_PROJECT_INIT_TIMEOUT,
    MAX_PROJECT_INIT_WORKERS,
    PROJECTS_REGISTRY,
    _project_init_timeout,
    get_project,
    get_project_init_issues,
    init_projects,
    list_projects,
)


@pytest.fixture(autouse=True)
def _isolate_registry(monkeypatch):
    """PROJECTS_REGISTRY / 이슈 맵은 모듈 전역이라 테스트마다 격리한다."""
    monkeypatch.setattr(
        project_module, "_schedule_project_init_retry", lambda *_args, **_kwargs: None
    )
    saved_registry = dict(PROJECTS_REGISTRY)
    saved_issues = dict(project_module.PROJECT_INIT_ISSUES)
    saved_deferred = dict(project_module.DEFERRED_PROJECTS)
    PROJECTS_REGISTRY.clear()
    project_module.PROJECT_INIT_ISSUES.clear()
    project_module.DEFERRED_PROJECTS.clear()
    yield
    PROJECTS_REGISTRY.clear()
    PROJECTS_REGISTRY.update(saved_registry)
    project_module.PROJECT_INIT_ISSUES.clear()
    project_module.PROJECT_INIT_ISSUES.update(saved_issues)
    project_module.DEFERRED_PROJECTS.clear()
    project_module.DEFERRED_PROJECTS.update(saved_deferred)


def _make_projects_dir(tmp_path: Path) -> Path:
    projects_dir = tmp_path / "projects"
    projects_dir.mkdir()
    return projects_dir


@pytest.fixture
def blocking_loader(monkeypatch):
    """대상이 응답하지 않는 상태를 모사하고, 테스트가 끝나면 워커를 반드시 깨운다.

    `time.sleep` 로 막으면 버려진 daemon 워커가 스위트 나머지까지 살아남아
    다른 스레드 단언을 오염시킨다 (그리고 테스트 잔여물 정리 규칙 위반).
    Event 는 teardown 에서 즉시 풀 수 있으면서도 대기는 유한하다 —
    수정 전 RED 가 행이 아니라 실패로 끝나는 성질은 그대로 유지된다.

    Returns:
        `install(block=...)` — block 이 None 이면 모든 항목을, 이름 집합이면
        그 항목만 막는다.
    """
    release = threading.Event()
    real_loader = project_module._load_project_entry

    def install(block: set[str] | None = None) -> None:
        def _loader(item: Path):
            if block is None or item.name in block:
                release.wait(10.0)
            return real_loader(item)

        monkeypatch.setattr(project_module, "_load_project_entry", _loader)

    yield install

    release.set()
    for thread in threading.enumerate():
        if thread.name.startswith("aos-project-init"):
            thread.join(5.0)


def _live_workers() -> int:
    """현재 살아 있는 자동 등록 워커 수 (`active_count()` 는 스위트 전체에 오염됨)."""
    return sum(1 for t in threading.enumerate() if t.name.startswith("aos-project-init"))


def test_slow_project_target_cannot_block_startup(tmp_path: Path, blocking_loader) -> None:
    """느린 대상 하나가 전체 자동 등록을 잡아두지 못한다 (issue #410 재현)."""
    projects_dir = _make_projects_dir(tmp_path)

    fast_target = tmp_path / "fast-target"
    fast_target.mkdir()
    (projects_dir / "fast").symlink_to(fast_target)

    slow_target = tmp_path / "slow-target"
    slow_target.mkdir()
    (projects_dir / "slow").symlink_to(slow_target)

    # iCloud dataless 대상의 stat/read 블로킹을 모사한다.
    blocking_loader(block={"slow"})

    started = time.monotonic()
    init_projects(str(tmp_path), entry_timeout=0.1)
    elapsed = time.monotonic() - started

    assert elapsed < 1.0, f"자동 등록이 {elapsed:.1f}s 동안 블로킹됨 — readiness 차단"

    # 정상 프로젝트는 그대로 등록된다.
    assert "fast" in PROJECTS_REGISTRY
    assert PROJECTS_REGISTRY["fast"].path == str(fast_target.resolve())
    assert "fast" not in get_project_init_issues()

    # 느린 프로젝트는 진단 전용 placeholder로 남고 deferred 로 보고된다.
    assert get_project_init_issues().get("slow") == "deferred"
    assert "slow" not in PROJECTS_REGISTRY
    # 대상을 건드리지 않고 readlink 값만 쓴다.
    assert project_module.DEFERRED_PROJECTS["slow"].path == os.readlink(projects_dir / "slow")
    assert project_module.DEFERRED_PROJECTS["slow"].git_enabled is False
    # Deferred placeholder는 경로 기반 작업에 전달되면 안 된다.
    assert get_project("slow") is None
    assert [project.id for project in list_projects()] == ["fast"]


def test_missing_target_is_reported_not_silently_skipped(tmp_path: Path) -> None:
    """대상이 사라진 심링크는 조용히 사라지지 않고 unavailable 로 보고된다."""
    projects_dir = _make_projects_dir(tmp_path)
    (projects_dir / "gone").symlink_to(tmp_path / "no-such-target")

    init_projects(str(tmp_path), entry_timeout=5.0)

    assert get_project_init_issues().get("gone") == "unavailable"
    assert "gone" not in PROJECTS_REGISTRY


def test_entry_error_does_not_abort_remaining_projects(tmp_path: Path, monkeypatch) -> None:
    """항목 하나가 OSError 를 던져도 lifespan 이 죽지 않고 나머지가 등록된다."""
    projects_dir = _make_projects_dir(tmp_path)

    ok_target = tmp_path / "ok-target"
    ok_target.mkdir()
    (projects_dir / "ok").symlink_to(ok_target)
    (projects_dir / "broken").symlink_to(tmp_path / "broken-target")

    real_loader = project_module._load_project_entry

    def _raising_loader(item: Path):
        if item.name == "broken":
            raise OSError("Resource temporarily unavailable")
        return real_loader(item)

    monkeypatch.setattr(project_module, "_load_project_entry", _raising_loader)

    init_projects(str(tmp_path), entry_timeout=5.0)

    assert get_project_init_issues().get("broken") == "unavailable"
    assert "ok" in PROJECTS_REGISTRY


def test_self_referential_symlink_is_not_traversed(tmp_path: Path, monkeypatch) -> None:
    """자기참조 심링크(projects/agent-orchestration → 루트)로 재귀하지 않는다."""
    projects_dir = _make_projects_dir(tmp_path)
    # projects/agent-orchestration -> tmp_path (자기 자신을 포함하는 루트)
    (projects_dir / "agent-orchestration").symlink_to(tmp_path)

    seen: list[str] = []
    real_loader = project_module._load_project_entry

    def _counting_loader(item: Path):
        seen.append(item.name)
        return real_loader(item)

    monkeypatch.setattr(project_module, "_load_project_entry", _counting_loader)

    init_projects(str(tmp_path), entry_timeout=5.0)

    # 최상위 항목 1개 → 정확히 1회. 재귀하면 같은 이름이 반복 등장한다.
    assert seen == ["agent-orchestration"]


def test_many_slow_targets_share_one_startup_budget(
    tmp_path: Path, blocking_loader, monkeypatch
) -> None:
    """느린 링크 수가 늘어도 readiness 지연·고아 워커 수는 일정하게 제한된다."""
    projects_dir = _make_projects_dir(tmp_path)
    project_names = {f"slow-{index}" for index in range(8)}
    for project_name in project_names:
        target = tmp_path / f"{project_name}-target"
        target.mkdir()
        (projects_dir / project_name).symlink_to(target)

    baseline_workers = _live_workers()
    blocking_loader()

    started = time.monotonic()
    init_projects(str(tmp_path), entry_timeout=0.1)
    elapsed = time.monotonic() - started

    assert elapsed < 0.5, f"항목별 timeout이 누적됨: {elapsed:.2f}s"
    assert _live_workers() <= baseline_workers + MAX_PROJECT_INIT_WORKERS
    assert set(get_project_init_issues()) == project_names


@pytest.mark.parametrize("invalid_timeout", ["nan", "inf", "-1", "0"])
def test_invalid_environment_timeout_falls_back_to_safe_default(
    monkeypatch, invalid_timeout: str
) -> None:
    """비유한·비양수 환경값은 join/timeout API로 전달하지 않는다."""
    monkeypatch.setenv("PROJECT_INIT_TIMEOUT_SECONDS", invalid_timeout)

    assert _project_init_timeout(None) == DEFAULT_PROJECT_INIT_TIMEOUT


def test_registering_recovered_project_clears_deferred_state(tmp_path: Path) -> None:
    """스토리지 복구 뒤 같은 ID를 다시 등록하면 placeholder 상태가 남지 않는다."""
    target = tmp_path / "recovered"
    target.mkdir()
    project_module.PROJECT_INIT_ISSUES["recovered"] = "deferred"

    project_module.register_project("recovered", str(target))

    assert "recovered" not in get_project_init_issues()
    assert get_project("recovered") is not None


def test_unavailable_rediscovery_evicts_stale_registry_project(tmp_path: Path) -> None:
    """깨진 링크를 다시 발견하면 이전 경로를 프로젝트 API에 남기지 않는다."""
    projects_dir = _make_projects_dir(tmp_path)
    stale_path = tmp_path / "previously-valid"
    stale_path.mkdir()
    project_module.register_project("gone", str(stale_path))
    (projects_dir / "gone").symlink_to(tmp_path / "missing-target")

    init_projects(str(tmp_path), entry_timeout=0.1)

    assert get_project_init_issues().get("gone") == "unavailable"
    assert get_project("gone") is None
    assert "gone" not in PROJECTS_REGISTRY


def test_repeated_initialization_cannot_exceed_global_worker_limit(
    tmp_path: Path, blocking_loader
) -> None:
    """lifespan 재시도도 이미 멈춘 I/O 워커 위에 새 워커를 무한히 쌓지 않는다."""
    projects_dir = _make_projects_dir(tmp_path)
    for index in range(MAX_PROJECT_INIT_WORKERS):
        target = tmp_path / f"slow-{index}-target"
        target.mkdir()
        (projects_dir / f"slow-{index}").symlink_to(target)

    baseline_workers = _live_workers()
    blocking_loader()
    for _ in range(3):
        init_projects(str(tmp_path), entry_timeout=0.05)

    assert _live_workers() <= baseline_workers + MAX_PROJECT_INIT_WORKERS


def test_worker_slot_exhaustion_does_not_hide_known_healthy_project(
    tmp_path: Path, blocking_loader
) -> None:
    """이전 시도의 hung worker 때문에 확인하지 못한 정상 프로젝트를 숨기지 않는다."""
    projects_dir = _make_projects_dir(tmp_path)
    for index in range(MAX_PROJECT_INIT_WORKERS):
        target = tmp_path / f"slow-{index}-target"
        target.mkdir()
        (projects_dir / f"slow-{index}").symlink_to(target)

    blocking_loader()
    init_projects(str(tmp_path), entry_timeout=0.05)

    healthy_target = tmp_path / "healthy-target"
    healthy_target.mkdir()
    (projects_dir / "healthy").symlink_to(healthy_target)
    project_module.register_project("healthy", str(healthy_target))

    init_projects(str(tmp_path), entry_timeout=0.05)

    assert get_project("healthy") is not None
    assert "healthy" not in get_project_init_issues()


def test_timed_out_entry_schedules_one_retry(tmp_path: Path, blocking_loader, monkeypatch) -> None:
    """완료가 늦은 I/O도 worker 반환 뒤 한 번은 다시 검사한다."""
    projects_dir = _make_projects_dir(tmp_path)
    target = tmp_path / "slow-target"
    target.mkdir()
    (projects_dir / "slow").symlink_to(target)
    scheduled: list[tuple[Path, float, bool]] = []

    def _capture_retry(root: Path, timeout: float, wait_for_worker_release: bool) -> None:
        scheduled.append((root, timeout, wait_for_worker_release))

    blocking_loader()
    monkeypatch.setattr(project_module, "_schedule_project_init_retry", _capture_retry)

    init_projects(str(tmp_path), entry_timeout=0.05)

    assert scheduled == [(tmp_path, 0.05, True)]


def test_regular_directory_probe_is_bounded(tmp_path: Path, monkeypatch) -> None:
    """심링크가 아닌 느린 디렉터리도 lifespan 스레드에서 직접 stat하지 않는다."""
    projects_dir = _make_projects_dir(tmp_path)
    regular = projects_dir / "regular"
    regular.mkdir()
    release = threading.Event()
    real_is_dir = Path.is_dir

    def _slow_is_dir(path: Path) -> bool:
        if path == regular:
            release.wait(1.0)
        return real_is_dir(path)

    monkeypatch.setattr(Path, "is_dir", _slow_is_dir)
    try:
        started = time.monotonic()
        init_projects(str(tmp_path), entry_timeout=0.05)
        elapsed = time.monotonic() - started
        assert elapsed < 0.5, f"regular directory probe blocked startup for {elapsed:.2f}s"
    finally:
        release.set()
        for thread in threading.enumerate():
            if thread.name.startswith("aos-project-init"):
                thread.join(2.0)
