"""Tests for the Claude snapshot refresh used by External Usage /sync.

**패치 대상은 `api.claude_sessions` 패키지가 아니라 구현 모듈이다.**
`scan_and_sync_claude_snapshots` 는 `get_monitor` 와 `_sync_sessions_to_db` 를
자기 모듈 네임스페이스에 바인딩하므로, 패키지 `__init__` 의 재노출 속성을
패치해도 실제 호출은 원본을 탄다. 호출은 공개 경로(`claude_sessions.…`)로
그대로 두어 재노출 계약까지 함께 검증한다.

분할 진행에 따라 이 대상은 이동한다: `api/claude_sessions.py`(원본) →
`_legacy`(패키지 승격) → `sync`(도메인 추출, 현재). 대상을 패키지로 되돌리지 마라.
"""

from __future__ import annotations

from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

pytestmark = pytest.mark.asyncio


async def test_scan_and_sync_claude_snapshots_discovers_and_upserts() -> None:
    """Refresh must scan sessions from the monitor and upsert them, returning the count.

    This is what lets External Usage /sync pick up host Claude sessions without a
    prior visit to the Claude Sessions page (freshness follow-up).
    """
    from api import claude_sessions
    from api.claude_sessions import sync as impl

    fake_sessions = [MagicMock(), MagicMock(), MagicMock()]
    monitor = MagicMock()
    monitor.discover_sessions = MagicMock(return_value=fake_sessions)

    with (
        patch.object(impl, "get_monitor", return_value=monitor),
        patch.object(impl, "_sync_sessions_to_db", AsyncMock()) as sync_mock,
    ):
        count = await claude_sessions.scan_and_sync_claude_snapshots()

    monitor.discover_sessions.assert_called_once()
    sync_mock.assert_awaited_once_with(fake_sessions)
    assert count == 3


async def test_scan_and_sync_claude_snapshots_empty() -> None:
    """No discovered sessions → sync still runs with [] and count is 0."""
    from api import claude_sessions
    from api.claude_sessions import sync as impl

    monitor = MagicMock()
    monitor.discover_sessions = MagicMock(return_value=[])

    with (
        patch.object(impl, "get_monitor", return_value=monitor),
        patch.object(impl, "_sync_sessions_to_db", AsyncMock()) as sync_mock,
    ):
        count = await claude_sessions.scan_and_sync_claude_snapshots()

    sync_mock.assert_awaited_once_with([])
    assert count == 0


# ---------------------------------------------------------------------------
# 감사 §5: UPDATE 경로의 활동 시각 신선도 + 변경 감지 튜플 정합
#
# `_sync_sessions_to_db` 는 `USE_DATABASE=true` 게이트를 통과해야 코드가 실행된다.
# 실제 DB 쓰기는 하지 않는다 — `async_session_factory` 를 fake 로 패치해
# ORM 객체·commit 을 전부 메모리 안에서 관찰한다 (가드레일 2 준수).
# ---------------------------------------------------------------------------


def _fake_session(session_id: str = "sess-1", *, file_size: int = 100, last_activity=None):
    from datetime import UTC, datetime

    s = MagicMock()
    s.session_id = session_id
    s.file_path = f"/tmp/{session_id}.jsonl"
    s.file_size = file_size
    s.last_activity = last_activity or datetime(2026, 6, 1, tzinfo=UTC)
    s.created_at = datetime(2026, 5, 30, tzinfo=UTC)
    s.slug = "demo-slug"
    s.model = "claude-opus-4-8"
    s.project_path = "-Users-tester-Work-Demo"
    s.project_name = "Demo"
    s.git_branch = "main"
    s.cwd = "/Users/tester/Work/Demo"
    s.version = "2.0.0"
    s.status = MagicMock()
    s.status.value = "idle"
    s.source_user = "tester"
    s.source_path = "/Users/tester/.claude/projects"
    s.message_count = 5
    s.user_message_count = 2
    s.assistant_message_count = 3
    s.tool_call_count = 1
    s.total_input_tokens = 10
    s.total_output_tokens = 20
    s.estimated_cost = 0.5
    return s


class _FakeDB:
    """Minimal async-context DB stub: returns a preset row and records commits."""

    def __init__(self, existing=None) -> None:
        self.existing = existing
        self.added: list = []
        self.commits = 0

    async def execute(self, _stmt):
        result = MagicMock()
        result.scalar_one_or_none = MagicMock(return_value=self.existing)
        return result

    def add(self, obj) -> None:
        self.added.append(obj)

    async def commit(self) -> None:
        self.commits += 1

    async def __aenter__(self):
        return self

    async def __aexit__(self, *_exc):
        return False


@pytest.fixture(autouse=True)
def _clear_sync_cache():
    """모듈 전역 `_sync_cache` 는 테스트 간 누수된다 — 매번 비운다."""
    from api.claude_sessions import sync as impl

    impl._sync_cache.clear()
    yield
    impl._sync_cache.clear()


async def test_update_path_refreshes_session_activity_timestamps(monkeypatch) -> None:
    """기존 스냅샷 UPDATE 가 `session_last_activity`/`session_created_at` 를 갱신한다.

    수정 전에는 두 컬럼이 INSERT 경로에서만 세팅되어, 토큰만 최신이 되고
    기간 필터·일별 배치 날짜는 낡은 값으로 남았다 (감사 §5).
    """
    from datetime import UTC, datetime

    from api.claude_sessions import sync as impl

    monkeypatch.setenv("USE_DATABASE", "true")
    existing = SimpleNamespace(
        id="sess-1",
        session_last_activity=datetime(2026, 1, 1, tzinfo=UTC),
        session_created_at=datetime(2026, 1, 1, tzinfo=UTC),
    )
    fake_db = _FakeDB(existing=existing)
    session = _fake_session(last_activity=datetime(2026, 6, 5, tzinfo=UTC))

    with patch("db.database.async_session_factory", lambda: fake_db):
        await impl._sync_sessions_to_db([session])

    assert existing.session_last_activity == datetime(2026, 6, 5, tzinfo=UTC)
    assert existing.session_created_at == datetime(2026, 5, 30, tzinfo=UTC)
    assert existing.total_output_tokens == 20
    assert fake_db.commits == 1


async def test_insert_path_still_sets_activity_timestamps(monkeypatch) -> None:
    """INSERT 경로는 `**data` 와 명시 kwarg 가 충돌하지 않고 그대로 동작한다.

    실제 ORM 클래스를 그대로 쓴다 — `ClaudeSessionSnapshotModel` 은 생성자이자
    `select()` 의 질의 대상이라, 평범한 함수로 대체하면 SQLAlchemy 가 매핑된
    엔티티로 해석하지 못해 테스트가 결함과 무관하게 깨진다. 인스턴스 생성은
    DB 연결을 요구하지 않으므로 `db.add()` 로 넘어온 객체를 그대로 관찰한다.

    중복 kwarg 회귀는 여전히 잡힌다: `TypeError` 는 `_sync_sessions_to_db` 의
    광범위한 except 가 삼키므로 `fake_db.added` 가 비고 첫 단언이 실패한다.
    """
    from datetime import UTC, datetime

    from api.claude_sessions import sync as impl

    monkeypatch.setenv("USE_DATABASE", "true")
    fake_db = _FakeDB(existing=None)
    session = _fake_session(last_activity=datetime(2026, 6, 5, tzinfo=UTC))

    with patch("db.database.async_session_factory", lambda: fake_db):
        await impl._sync_sessions_to_db([session])

    assert len(fake_db.added) == 1
    inserted = fake_db.added[0]
    assert inserted.id == "sess-1"
    assert inserted.session_last_activity == datetime(2026, 6, 5, tzinfo=UTC)
    assert inserted.session_created_at == datetime(2026, 5, 30, tzinfo=UTC)


async def test_same_size_but_newer_activity_is_detected_as_changed(monkeypatch) -> None:
    """파일 크기가 같고 `last_activity` 만 바뀐 세션도 변경으로 감지된다.

    수정 전 비교 키는 사실상 `file_size` 단독이라(`_file_mtime` 은 어디에서도
    세팅되지 않는다) 같은 크기 편집이 영원히 재동기화되지 않았다.
    """
    from datetime import UTC, datetime

    from api.claude_sessions import sync as impl

    monkeypatch.setenv("USE_DATABASE", "true")
    existing = SimpleNamespace(id="sess-1")
    session_v1 = _fake_session(file_size=100, last_activity=datetime(2026, 6, 1, tzinfo=UTC))
    session_v2 = _fake_session(file_size=100, last_activity=datetime(2026, 6, 5, tzinfo=UTC))

    db1, db2 = _FakeDB(existing=existing), _FakeDB(existing=existing)
    with patch("db.database.async_session_factory", lambda: db1):
        await impl._sync_sessions_to_db([session_v1])
    with patch("db.database.async_session_factory", lambda: db2):
        await impl._sync_sessions_to_db([session_v2])

    assert db1.commits == 1
    assert db2.commits == 1, "same file_size but newer last_activity must resync"
    assert existing.session_last_activity == datetime(2026, 6, 5, tzinfo=UTC)


async def test_unchanged_session_is_a_no_op_on_repeat(monkeypatch) -> None:
    """저장 캐시 튜플과 비교 튜플의 모양이 같아야 재호출이 no-op 이 된다."""
    from api.claude_sessions import sync as impl

    monkeypatch.setenv("USE_DATABASE", "true")
    existing = SimpleNamespace(id="sess-1")
    session = _fake_session()

    db1, db2 = _FakeDB(existing=existing), _FakeDB(existing=existing)
    with patch("db.database.async_session_factory", lambda: db1):
        await impl._sync_sessions_to_db([session])
    with patch("db.database.async_session_factory", lambda: db2):
        await impl._sync_sessions_to_db([session])

    assert db1.commits == 1
    assert db2.commits == 0, "unchanged session must not trigger a second write"
