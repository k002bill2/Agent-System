"""`monitoring-capabilities` 는 DB 장애를 조용히 'disabled' 로 덮지 않는다.

DB 모드의 capability 는 이제 `ProjectModel` 조회 결과로 결정된다
(`test_monitoring_db_health.py` 가 라우트 전체의 available/disabled 계약을 고정).
그래서 이 파일은 남은 한 가지 위험만 본다: **조회가 실패했을 때**.

조회 실패를 `disabled` 로 보고하면 화면에는 "이 프로젝트는 헬스 기능이 없다"
라는 영구 상태처럼 보인다 — 실제로는 일시 장애다. 진단이 엉뚱한 곳을 향하게
되므로 503 으로 드러내야 한다.
"""

import pytest
from fastapi import HTTPException


async def _allow_project_role(*_args, **_kwargs):
    return "viewer"


class _BrokenDatabase:
    async def execute(self, *_args, **_kwargs):
        raise RuntimeError("database connection lost")


@pytest.mark.asyncio
async def test_capabilities_surface_database_failure_as_unavailable(monkeypatch):
    monkeypatch.setenv("USE_DATABASE", "true")
    monkeypatch.setattr("api.monitoring.require_project_role", _allow_project_role)

    from api.monitoring import get_monitoring_capabilities

    with pytest.raises(HTTPException) as excinfo:
        await get_monitoring_capabilities(
            "3f9c1b74-6d20-4a8e-9c31-5b7e0d2a8f61",
            current_user=object(),
            db=_BrokenDatabase(),
        )

    assert excinfo.value.status_code == 503
    assert "temporarily unavailable" in excinfo.value.detail.lower()


@pytest.mark.asyncio
async def test_filesystem_mode_capabilities_do_not_touch_the_database(monkeypatch):
    """파일시스템 모드는 DB 를 보지 않는다 — 새 실패 모드를 만들지 않았다."""
    monkeypatch.setenv("USE_DATABASE", "false")
    monkeypatch.setattr("api.monitoring.require_project_role", _allow_project_role)

    from api.monitoring import get_monitoring_capabilities

    result = await get_monitoring_capabilities(
        "fs-project", current_user=object(), db=_BrokenDatabase()
    )

    assert result.mode == "filesystem"
    assert result.health == "available"
