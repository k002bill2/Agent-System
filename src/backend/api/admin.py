"""
Admin API Router

관리자 전용 엔드포인트: 사용자 관리, 시스템 정보 조회.
"""

from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel

from api.deps import get_current_admin_user
from db.models import UserModel

router = APIRouter(prefix="/admin", tags=["admin"])


# ============================================================================
# Models
# ============================================================================


class UserListItem(BaseModel):
    id: str
    email: str
    name: str | None = None
    avatar_url: str | None = None
    oauth_provider: str | None = None
    is_active: bool = True
    is_admin: bool = False
    created_at: datetime | None = None
    last_login_at: datetime | None = None


class UserUpdateRequest(BaseModel):
    is_active: bool | None = None
    is_admin: bool | None = None
    name: str | None = None


class UserListResponse(BaseModel):
    users: list[UserListItem]
    total: int


class SystemInfo(BaseModel):
    version: str = "1.0.0"
    user_count: int = 0
    active_user_count: int = 0
    admin_count: int = 0


# ============================================================================
# Endpoints
# ============================================================================


@router.get("/users", response_model=UserListResponse)
async def list_users(
    is_active: bool | None = None,
    is_admin: bool | None = None,
    search: str | None = Query(None, description="이메일 또는 이름 검색"),
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
    _admin: UserModel = Depends(get_current_admin_user),
) -> UserListResponse:
    """사용자 목록 조회 (관리자 전용)"""
    try:
        from db.database import async_session_factory
        from sqlalchemy import func, select

        async with async_session_factory() as session:
            query = select(UserModel)

            if is_active is not None:
                query = query.where(UserModel.is_active == is_active)
            if is_admin is not None:
                query = query.where(UserModel.is_admin == is_admin)
            if search:
                search_pattern = f"%{search}%"
                query = query.where(
                    (UserModel.email.ilike(search_pattern))
                    | (UserModel.name.ilike(search_pattern))
                )

            # Count total
            count_query = select(func.count()).select_from(query.subquery())
            total_result = await session.execute(count_query)
            total = total_result.scalar() or 0

            # Fetch paginated
            query = query.order_by(UserModel.created_at.desc())
            query = query.offset(offset).limit(limit)
            result = await session.execute(query)
            users = result.scalars().all()

            return UserListResponse(
                users=[
                    UserListItem(
                        id=u.id,
                        email=u.email,
                        name=u.name,
                        avatar_url=u.avatar_url,
                        oauth_provider=u.oauth_provider,
                        is_active=u.is_active,
                        is_admin=u.is_admin,
                        created_at=u.created_at,
                        last_login_at=u.last_login_at,
                    )
                    for u in users
                ],
                total=total,
            )
    except ImportError:
        # DB not available, return empty
        return UserListResponse(users=[], total=0)


@router.patch("/users/{user_id}", response_model=UserListItem)
async def update_user(
    user_id: str,
    update: UserUpdateRequest,
    admin: UserModel = Depends(get_current_admin_user),
) -> UserListItem:
    """사용자 정보 수정 (관리자 전용)

    is_active, is_admin, name 변경 가능.
    """
    # 자기 자신의 admin 권한은 해제 불가
    if user_id == admin.id and update.is_admin is False:
        raise HTTPException(
            status_code=400,
            detail="자기 자신의 관리자 권한을 해제할 수 없습니다.",
        )

    try:
        from db.database import async_session_factory
        from sqlalchemy import select

        async with async_session_factory() as session:
            result = await session.execute(
                select(UserModel).where(UserModel.id == user_id)
            )
            user = result.scalar_one_or_none()

            if not user:
                raise HTTPException(status_code=404, detail="User not found")

            if update.is_active is not None:
                user.is_active = update.is_active
            if update.is_admin is not None:
                user.is_admin = update.is_admin
            if update.name is not None:
                user.name = update.name

            await session.commit()
            await session.refresh(user)

            return UserListItem(
                id=user.id,
                email=user.email,
                name=user.name,
                avatar_url=user.avatar_url,
                oauth_provider=user.oauth_provider,
                is_active=user.is_active,
                is_admin=user.is_admin,
                created_at=user.created_at,
                last_login_at=user.last_login_at,
            )
    except HTTPException:
        raise
    except ImportError:
        raise HTTPException(status_code=503, detail="Database not available")


@router.get("/system-info", response_model=SystemInfo)
async def get_system_info(
    _admin: UserModel = Depends(get_current_admin_user),
) -> SystemInfo:
    """시스템 정보 조회 (관리자 전용)"""
    try:
        from db.database import async_session_factory
        from sqlalchemy import func, select

        async with async_session_factory() as session:
            total = (
                await session.execute(select(func.count(UserModel.id)))
            ).scalar() or 0
            active = (
                await session.execute(
                    select(func.count(UserModel.id)).where(
                        UserModel.is_active == True  # noqa: E712
                    )
                )
            ).scalar() or 0
            admins = (
                await session.execute(
                    select(func.count(UserModel.id)).where(
                        UserModel.is_admin == True  # noqa: E712
                    )
                )
            ).scalar() or 0

            return SystemInfo(
                user_count=total,
                active_user_count=active,
                admin_count=admins,
            )
    except ImportError:
        return SystemInfo()
