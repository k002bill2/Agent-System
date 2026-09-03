"""대시보드 기동에 필요한 사용자 범위 데이터를 한 번에 내려주는 엔드포인트.

인증된 대시보드는 기동 직후 `/api/auth/me`·`/api/projects`·`/api/llm/models`·
`/api/admin/menu-visibility` 를 각각 호출한다. 이 라우터는 그 네 가지를 한 응답으로
합쳐 왕복 횟수를 줄인다.

**인가 로직을 새로 쓰지 않는다.** 각 엔드포인트의 핸들러를 그대로 호출하므로
프로젝트 접근 필터·조직 admin 판정 같은 규칙이 두 벌이 될 일이 없다. 다만 FastAPI
핸들러는 평범한 함수가 아니라서, 재사용할 때는 **모든 인자를 명시적으로** 넘겨야
한다 — 기본값이 `None`/`False` 가 아니라 `Depends(...)`/`Query(...)` 객체이고,
그 객체는 truthy 라서 조용히 엉뚱한 분기를 탄다 (아래 `get_models` 주석 참조).
"""

import logging

from asyncpg import PostgresError
from fastapi import APIRouter, Depends, Response
from pydantic import BaseModel
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.ext.asyncio import AsyncSession

from api.admin import MenuVisibilityResponse, get_menu_visibility
from api.auth import UserResponse, get_current_user_info
from api.deps import get_current_user, get_db_session
from api.llm import ModelResponse, get_models
from api.routes import get_projects
from db.models import UserModel
from models.project import ProjectResponse

logger = logging.getLogger(__name__)

router = APIRouter(tags=["bootstrap"])

# 사용자 범위 응답이다. 공유 캐시(프록시·CDN)에 들어가면 다른 사용자에게
# 남의 프로젝트 목록이 나갈 수 있으므로 저장 자체를 금지한다.
_PRIVATE_CACHE_CONTROL = "private, no-store"


class BootstrapResponse(BaseModel):
    """기동 시점에 필요한 최소 데이터.

    각 필드는 대응 엔드포인트의 응답 모델을 그대로 재사용한다 — 계약이 갈라지지
    않게 하려는 것이고, 임의의 store 모양 딕셔너리를 내보내지 않으려는 것이다.
    """

    user: UserResponse
    projects: list[ProjectResponse]
    models: list[ModelResponse]
    # `None` 은 "메뉴 설정 없음"이 아니라 **"알 수 없음"** 이다. 조회에 실패하면
    # 클라이언트는 기존대로 `/api/admin/menu-visibility` 를 직접 호출해야 한다.
    menu: MenuVisibilityResponse | None = None


async def _load_menu(current_user: UserModel) -> MenuVisibilityResponse | None:
    """메뉴 가시성을 조회하되, 실패해도 기동 전체를 끌어내리지 않는다.

    `api.admin.get_menu_visibility` 는 `ImportError` 만 기본값으로 흡수하고 DB 접속
    실패는 그대로 올린다. 그 예외가 여기까지 올라오면 user·projects·models 까지 함께
    사라져 기동이 오늘보다 나빠지므로, DB 계열 실패만 좁게 잡아 `None` 을 돌려준다.
    범위를 넓히지 않는 것이 중요하다 — 그 핸들러의 인가 버그가 언젠가 예외로
    드러날 때 그것까지 삼키면 프런트가 "모든 메뉴 표시" 로 덮어버린다.
    """
    try:
        return await get_menu_visibility(current_user)
    except (SQLAlchemyError, PostgresError, OSError, ImportError) as exc:
        logger.warning(
            "bootstrap: menu visibility unavailable for user %s: %s", current_user.id, exc
        )
        return None


@router.get("/bootstrap", response_model=BootstrapResponse)
async def get_bootstrap(
    response: Response,
    current_user: UserModel = Depends(get_current_user),
    db: AsyncSession = Depends(get_db_session),
) -> BootstrapResponse:
    """기동에 필요한 사용자 범위 데이터를 한 번에 반환한다."""
    response.headers["Cache-Control"] = _PRIVATE_CACHE_CONTROL

    user = await get_current_user_info(current_user=current_user)
    projects = await get_projects(current_user=current_user, db=db)
    # 인자 3개를 모두 넘기는 것은 필수다. 생략하면 `provider` 가 `Query` 객체가 돼
    # truthy 분기를 타고 `LLMProvider(<Query>)` 가 터져 **빈 목록**이 조용히 나간다
    # (실측: 인자 없이 total 0, 명시하면 total 25).
    models = await get_models(provider=None, available_only=False, include_disabled=False)

    return BootstrapResponse(
        user=user,
        projects=projects,
        models=models.models,
        menu=await _load_menu(current_user),
    )
