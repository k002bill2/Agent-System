"""엔진 세션 캐시 경계 회귀 테스트 (issue #284).

`OrchestrationEngine._sessions` 캐시가 서비스 계층을 우회하면서 세 가지 증상이
나온다 — 만료 검사를 건너뛰고, 외부에서 직접 순회되며, 서비스 영속화 없이
갱신된다. 셋 다 "캐시가 서비스 계층을 우회한다"는 한 원인에서 나온다.
"""

from datetime import timedelta

import pytest

from api.context import get_project_context
from models.project import Project
from orchestrator import OrchestrationEngine
from services.session_service import SessionService
from utils.time import utcnow


def _project(project_id: str = "p-cache") -> Project:
    return Project(
        id=project_id,
        name="Cache Project",
        path="/tmp/cache-project",
        description="fixture",
        claude_md=None,
    )


@pytest.fixture
def isolated_engine() -> OrchestrationEngine:
    """테스트마다 격리된 SessionService 를 가진 엔진.

    기본 생성자는 전역 싱글턴 서비스를 잡으므로, 앞선 테스트가 만든 세션이
    `list_sessions` 에 섞여 들어와 조회 테스트를 무력화한다.
    """
    return OrchestrationEngine(session_service=SessionService(use_database=False))


def _expire(engine: OrchestrationEngine, session_id: str) -> None:
    """세션 메타데이터를 만료 상태로 만든다.

    저장소에 적힌 `_metadata` 도 함께 바꾼다 — `get_session` 이 저장소 값으로
    재수화하므로(issue #289) 로컬 사본만 바꾸면 다음 읽기에서 되돌아간다.
    """
    service = engine.session_service
    metadata = service._session_metadata[session_id]
    metadata.expires_at = utcnow() - timedelta(seconds=1)
    service._memory_sessions[session_id]["_metadata"] = metadata.to_dict()


class TestCacheExpiryBoundary:
    """캐시 히트가 TTL 검사를 우회하면 안 된다."""

    @pytest.mark.asyncio
    async def test_expired_session_is_not_served_from_cache(self, isolated_engine):
        engine = isolated_engine
        session_id = await engine.create_session()
        assert session_id in engine._sessions, "생성 직후 캐시에 올라와 있다(전제)"

        _expire(engine, session_id)

        assert await engine.get_session(session_id) is None
        assert session_id not in engine._sessions, "만료된 항목은 캐시에서도 사라져야 한다"

    @pytest.mark.asyncio
    async def test_live_session_is_still_served_from_cache(self, isolated_engine):
        """만료 검사가 정상 세션까지 막으면 안 된다(경계선)."""
        engine = isolated_engine
        session_id = await engine.create_session()

        state = await engine.get_session(session_id)

        assert state is not None
        assert state["session_id"] == session_id

    @pytest.mark.asyncio
    async def test_service_reports_expiry_without_loading_state(self, isolated_engine):
        """만료 판정은 메타데이터만 보므로 state 로드가 필요 없다."""
        engine = isolated_engine
        session_id = await engine.create_session()
        service = engine.session_service

        assert service.is_session_expired(session_id) is False
        _expire(engine, session_id)
        assert service.is_session_expired(session_id) is True

    @pytest.mark.asyncio
    async def test_missing_metadata_is_treated_as_expired(self, isolated_engine):
        """메타데이터 부재는 만료로 본다 — 삭제된 세션이 그 상태이기 때문이다."""
        engine = isolated_engine

        assert engine.session_service.is_session_expired("no-such-session") is True

    @pytest.mark.asyncio
    async def test_deleted_session_is_not_served_from_cache(self, isolated_engine):
        """서비스에서 삭제된 세션을 엔진 캐시가 계속 내주면 안 된다.

        `delete_session` 은 메타데이터를 지운다. 부재를 "살아 있음"으로 보면
        캐시 히트가 성립해 이미 사라진 state 가 반환된다 — `refresh_session` 이
        만료 세션을 지우는 경로가 실제로 있다(api/sessions.py, api/websocket.py).
        """
        engine = isolated_engine
        session_id = await engine.create_session()
        assert session_id in engine._sessions

        await engine.session_service.delete_session(session_id)  # 엔진을 거치지 않은 삭제

        assert await engine.get_session(session_id) is None
        assert session_id not in engine._sessions


class TestSaveSessionPersists:
    """캐시 갱신과 영속화를 함께 수행하는 공개 경로."""

    @pytest.mark.asyncio
    async def test_save_session_writes_through_to_service(self, isolated_engine):
        engine = isolated_engine
        session_id = await engine.create_session()
        state = await engine.get_session(session_id)
        state["plan_metadata"] = {"pre_analyzed_execution_plan": {"subtasks": {"t1": {}}}}

        await engine.save_session(session_id, state)

        engine._sessions.clear()  # 캐시를 비워 저장소에서 다시 읽게 한다
        reloaded = await engine.get_session(session_id)

        assert reloaded["plan_metadata"]["pre_analyzed_execution_plan"]["subtasks"] == {"t1": {}}


class TestProjectContextSessionLookup:
    """`/projects/{id}/context` 의 세션 조회는 서비스 계층을 거쳐야 한다."""

    @pytest.mark.asyncio
    async def test_live_session_for_project_is_found(self, monkeypatch, tmp_path, isolated_engine):
        """활성 세션이 응답에 실린다 — state 의 project id 키를 올바르게 읽는지."""
        project = _project()
        project.path = str(tmp_path)
        monkeypatch.setattr("api.context.get_project", lambda pid: project)

        engine = isolated_engine
        session_id = await engine.create_session(project=project)

        response = await get_project_context(project.id, engine)

        assert response.session_info is not None
        assert response.session_info["session_id"] == session_id

    @pytest.mark.asyncio
    async def test_expired_session_is_omitted(self, monkeypatch, tmp_path, isolated_engine):
        """만료된 세션은 응답에 나타나지 않는다 — 캐시 직접 순회로는 걸러지지 않는다."""
        project = _project()
        project.path = str(tmp_path)
        monkeypatch.setattr("api.context.get_project", lambda pid: project)

        engine = isolated_engine
        session_id = await engine.create_session(project=project)
        _expire(engine, session_id)

        response = await get_project_context(project.id, engine)

        assert response.session_info is None

    @pytest.mark.asyncio
    async def test_live_session_found_when_earlier_one_expired(
        self, monkeypatch, tmp_path, isolated_engine
    ):
        """같은 프로젝트에 세션이 여럿이고 앞선 것이 만료면 살아 있는 쪽을 찾는다."""
        project = _project()
        project.path = str(tmp_path)
        monkeypatch.setattr("api.context.get_project", lambda pid: project)

        engine = isolated_engine
        stale_id = await engine.create_session(project=project)
        live_id = await engine.create_session(project=project)
        _expire(engine, stale_id)

        response = await get_project_context(project.id, engine)

        assert response.session_info is not None
        assert response.session_info["session_id"] == live_id

    @pytest.mark.asyncio
    async def test_project_session_found_beyond_default_list_limit(
        self, monkeypatch, tmp_path, isolated_engine
    ):
        """다른 프로젝트 세션이 기본 limit 을 채워도 대상 프로젝트 세션을 찾는다.

        `list_sessions()` 의 기본 `limit=50` 이 프로젝트 필터보다 먼저 적용되면
        대상 세션이 잘려 나간다. 필터는 저장소 질의에 있어야 한다.
        """
        project = _project()
        project.path = str(tmp_path)
        monkeypatch.setattr("api.context.get_project", lambda pid: project)

        engine = isolated_engine
        for index in range(50):
            await engine.create_session(project=_project(f"p-other-{index}"))
        session_id = await engine.create_session(project=project)

        response = await get_project_context(project.id, engine)

        assert response.session_info is not None
        assert response.session_info["session_id"] == session_id
