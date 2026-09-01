"""2026-09-01 후속 정책 — Playground API 라우트 레벨 회귀 (plan §1).

서비스 레벨 게이트(생성/수정 시 unknown·disabled 모델 원자적 거부)는
``test_playground_service.py`` 가 커버한다. 이 파일은 그 위 계층을 고정한다:
라우트가 서비스의 ``ValueError`` 를 500 으로 흘리지 않고 HTTP 400 으로
번역하는 계약. 라우터 의존성(get_current_user 등)은 라우터 레벨이라 핸들러
직접 호출로 우회된다 — 여기서 검증하는 것은 핸들러의 오류 번역뿐이다.
"""

from __future__ import annotations

import pytest
from fastapi import BackgroundTasks, HTTPException

from api import playground as playground_api
from models.llm_models import LLMModelRegistry
from models.playground import PlaygroundSessionCreate
from services import playground_service
from services.playground_service import PlaygroundService


@pytest.fixture(autouse=True)
def _serve_code_registry():
    """다른 테스트가 남긴 DB 캐시 오염 방지 — code seed 기준으로 판정한다."""
    original_cache = LLMModelRegistry._db_cache
    original_index = LLMModelRegistry._db_index
    LLMModelRegistry._db_cache = None
    LLMModelRegistry._db_index = {}
    yield
    LLMModelRegistry._db_cache = original_cache
    LLMModelRegistry._db_index = original_index


@pytest.fixture(autouse=True)
def _isolated_sessions(monkeypatch):
    """파일/DB 영속화를 차단한다 (기존 테스트 패턴)."""
    playground_service._sessions.clear()
    monkeypatch.setattr(playground_service.service, "_load_sessions", lambda: None)
    monkeypatch.setattr(playground_service.service, "_save_sessions", lambda: None)
    monkeypatch.setattr(
        playground_service.service, "_fire_and_forget", lambda coro: coro.close()
    )
    yield
    playground_service._sessions.clear()


def _fake_user(user_id: str = "user-1"):
    return type("FakeUser", (), {"id": user_id})()


@pytest.mark.asyncio
async def test_create_route_maps_unknown_model_to_400() -> None:
    """unknown 모델의 세션 생성은 500 이 아니라 명확한 400 검증 오류다."""
    with pytest.raises(HTTPException) as exc_info:
        await playground_api.create_session(
            PlaygroundSessionCreate(name="x", model="no-such-model-xyz"),
            current_user=_fake_user(),
        )
    assert exc_info.value.status_code == 400
    assert "no-such-model-xyz" in str(exc_info.value.detail)
    # 원자성: 거부된 요청은 세션을 남기지 않는다.
    assert playground_service._sessions == {}


@pytest.mark.asyncio
async def test_create_route_maps_disabled_model_to_400() -> None:
    # gpt-5.4 는 code seed 에서 is_enabled=False 다.
    with pytest.raises(HTTPException) as exc_info:
        await playground_api.create_session(
            PlaygroundSessionCreate(name="x", model="gpt-5.4"),
            current_user=_fake_user(),
        )
    assert exc_info.value.status_code == 400
    assert "disabled" in str(exc_info.value.detail)


@pytest.mark.asyncio
async def test_create_route_still_creates_with_enabled_model() -> None:
    """오류 번역 try/except 가 정상 경로(owner 강제 포함)를 삼키지 않는다."""
    session = await playground_api.create_session(
        PlaygroundSessionCreate(name="ok", model="codex-cli"),
        current_user=_fake_user("owner-9"),
    )
    assert session.model == "codex-cli"
    assert session.user_id == "owner-9"


@pytest.mark.asyncio
async def test_update_route_maps_invalid_model_to_400() -> None:
    session = PlaygroundService.create_session(
        PlaygroundSessionCreate(name="s", model="codex-cli")
    )
    data = playground_api.SessionSettingsUpdate(model="gpt-5.4", name="renamed")

    with pytest.raises(HTTPException) as exc_info:
        await playground_api.update_session_settings(
            session.id, data, BackgroundTasks()
        )

    assert exc_info.value.status_code == 400
    # 원자성: 같은 요청의 다른 필드도 반영되지 않는다.
    assert session.name == "s"
    assert session.model == "codex-cli"


@pytest.mark.asyncio
async def test_update_route_still_updates_with_enabled_model() -> None:
    session = PlaygroundService.create_session(
        PlaygroundSessionCreate(name="s", model="codex-cli")
    )
    data = playground_api.SessionSettingsUpdate(model="claude-sonnet-5")

    updated = await playground_api.update_session_settings(
        session.id, data, BackgroundTasks()
    )

    assert updated.model == "claude-sonnet-5"
