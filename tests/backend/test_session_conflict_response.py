"""세션 쓰기 경합이 500 이 아니라 409 로 나가는지 (issue #292).

버전 충돌은 "다른 쓰기가 먼저 반영됐다" 는 뜻이라 클라이언트가 다시 시도하면
된다. 전역 예외 핸들러에 맡기면 500 이 나가 재시도 가능한 조건이 서버 오류처럼
보이고, 승인 API 에서는 #283 이 닫은 "승인이 가끔 실패" 가 재발한다.

핸들러 **등록 여부**만 보면 잘못된 상태 코드를 내도 통과한다. 실제로 예외를
던져 응답을 확인한다.
"""

import pytest
from fastapi import FastAPI
from httpx import ASGITransport, AsyncClient

from services.session_service import SessionVersionConflictError


def _app_with_handler() -> FastAPI:
    """`create_app` 이 등록하는 것과 같은 핸들러를 가진 최소 앱."""
    from api.app import create_app

    app = create_app()

    @app.get("/__conflict_probe")
    async def _probe():
        raise SessionVersionConflictError("s-292")

    return app


@pytest.mark.asyncio
async def test_version_conflict_returns_409_not_500():
    app = _app_with_handler()
    transport = ASGITransport(app=app, raise_app_exceptions=False)

    async with AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.get("/__conflict_probe")

    assert response.status_code == 409, (
        f"버전 충돌이 {response.status_code} 로 나갔다 — 재시도 가능한 조건은 500 이 아니다"
    )
    assert "retry" in response.json()["detail"].lower()
