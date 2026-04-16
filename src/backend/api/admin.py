"""
Admin API Router

관리자 전용 엔드포인트: 사용자 관리, 시스템 정보 조회, 메뉴 가시성 설정.
"""

from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy import func

from api.deps import get_current_admin_user, get_current_user
from db.models import MenuVisibilityModel, UserModel
from db.models.organization import OrganizationMemberModel, OrganizationModel

router = APIRouter(prefix="/admin", tags=["admin"])

# ============================================================================
# Constants
# ============================================================================

VALID_ROLES = ("user", "manager", "admin")

# 기본 메뉴 순서 (Sidebar 기본 배열 순서)
DEFAULT_MENU_ORDER: list[str] = [
    "dashboard",
    "projects",
    "sessions",
    "agents",
    "monitor",
    "claude-sessions",
    "project-configs",
    "project-management",
    "git",
    "organizations",
    "audit",
    "notifications",
    "analytics",
    "playground",
    "workflows",
    "external-usage",
]

# 기본 메뉴 가시성 설정
DEFAULT_MENU_VISIBILITY: dict[str, dict[str, bool]] = {
    "dashboard": {"user": True, "manager": True, "admin": True},
    "projects": {"user": True, "manager": True, "admin": True},
    "sessions": {"user": True, "manager": True, "admin": True},
    "agents": {"user": False, "manager": True, "admin": True},
    "claude-sessions": {"user": True, "manager": True, "admin": True},
    "monitor": {"user": False, "manager": True, "admin": True},
    "project-configs": {"user": False, "manager": True, "admin": True},
    "project-management": {"user": False, "manager": True, "admin": True},
    "git": {"user": False, "manager": True, "admin": True},
    "organizations": {"user": False, "manager": True, "admin": True},
    "audit": {"user": False, "manager": True, "admin": True},
    "notifications": {"user": True, "manager": True, "admin": True},
    "analytics": {"user": False, "manager": True, "admin": True},
    "playground": {"user": True, "manager": True, "admin": True},
    "workflows": {"user": False, "manager": True, "admin": True},
    "external-usage": {"user": False, "manager": True, "admin": True},
    "settings": {"user": True, "manager": True, "admin": True},
    "admin": {"user": False, "manager": False, "admin": True},
}

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
    role: str = "user"
    created_at: datetime | None = None
    last_login_at: datetime | None = None


class UserUpdateRequest(BaseModel):
    is_active: bool | None = None
    is_admin: bool | None = None
    role: str | None = None
    name: str | None = None


class UserListResponse(BaseModel):
    users: list[UserListItem]
    total: int


class RoleDistribution(BaseModel):
    user: int = 0
    manager: int = 0
    admin: int = 0


class SystemInfo(BaseModel):
    version: str = "1.0.0"
    user_count: int = 0
    active_user_count: int = 0
    admin_count: int = 0
    role_distribution: RoleDistribution | None = None


class MenuVisibilityResponse(BaseModel):
    """메뉴 가시성 설정 응답: { menuKey: { user: bool, manager: bool, admin: bool } }"""

    visibility: dict[str, dict[str, bool]]
    menu_order: list[str] = []


class MenuVisibilityUpdateRequest(BaseModel):
    """메뉴 가시성 일괄 업데이트 요청"""

    visibility: dict[str, dict[str, bool]]
    menu_order: list[str] | None = None


# ============================================================================
# User Endpoints
# ============================================================================


@router.get("/users", response_model=UserListResponse)
async def list_users(
    is_active: bool | None = None,
    is_admin: bool | None = None,
    role: str | None = Query(None, description="역할 필터 (user, manager, admin)"),
    search: str | None = Query(None, description="이메일 또는 이름 검색"),
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
    _admin: UserModel = Depends(get_current_admin_user),
) -> UserListResponse:
    """사용자 목록 조회 (관리자 전용)"""
    try:
        from sqlalchemy import func, select

        from db.database import async_session_factory

        async with async_session_factory() as session:
            query = select(UserModel)

            if is_active is not None:
                query = query.where(UserModel.is_active == is_active)
            if is_admin is not None:
                query = query.where(UserModel.is_admin == is_admin)
            if role is not None:
                query = query.where(UserModel.role == role)
            if search:
                search_pattern = f"%{search}%"
                query = query.where(
                    (UserModel.email.ilike(search_pattern)) | (UserModel.name.ilike(search_pattern))
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
                        role=getattr(u, "role", None) or ("admin" if u.is_admin else "user"),
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

    is_active, is_admin, role, name 변경 가능.
    """
    # 자기 자신의 admin 권한은 해제 불가
    if user_id == admin.id and update.is_admin is False:
        raise HTTPException(
            status_code=400,
            detail="자기 자신의 관리자 권한을 해제할 수 없습니다.",
        )
    if user_id == admin.id and update.role is not None and update.role != "admin":
        raise HTTPException(
            status_code=400,
            detail="자기 자신의 역할을 admin에서 변경할 수 없습니다.",
        )

    # role 유효성 검증
    if update.role is not None and update.role not in VALID_ROLES:
        raise HTTPException(
            status_code=400,
            detail=f"유효하지 않은 역할입니다. 허용 값: {', '.join(VALID_ROLES)}",
        )

    try:
        from sqlalchemy import select

        from db.database import async_session_factory

        async with async_session_factory() as session:
            result = await session.execute(select(UserModel).where(UserModel.id == user_id))
            user = result.scalar_one_or_none()

            if not user:
                raise HTTPException(status_code=404, detail="User not found")

            if update.is_active is not None:
                user.is_active = update.is_active
                # organization_members 연동
                await _sync_member_active_status(session, user_id, update.is_active)
            if update.is_admin is not None:
                user.is_admin = update.is_admin
            if update.role is not None:
                user.role = update.role
                # role과 is_admin 동기화
                user.is_admin = update.role == "admin"
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
                role=getattr(user, "role", None) or ("admin" if user.is_admin else "user"),
                created_at=user.created_at,
                last_login_at=user.last_login_at,
            )
    except HTTPException:
        raise
    except ImportError:
        raise HTTPException(status_code=503, detail="Database not available")


async def _sync_member_active_status(
    session,
    user_id: str,
    is_active: bool,  # noqa: ANN001
) -> None:
    """사용자 활성화/비활성화 시 organization_members.is_active 연동."""
    from sqlalchemy import select, update

    # 해당 사용자의 모든 조직 멤버십 활성 상태 변경
    await session.execute(
        update(OrganizationMemberModel)
        .where(OrganizationMemberModel.user_id == user_id)
        .values(is_active=is_active)
    )

    # 각 조직의 current_members 카운터 재계산
    member_result = await session.execute(
        select(OrganizationMemberModel.organization_id).where(
            OrganizationMemberModel.user_id == user_id
        )
    )
    org_ids = [row[0] for row in member_result.all()]

    for org_id in org_ids:
        count_result = await session.execute(
            select(func.count(OrganizationMemberModel.id)).where(
                OrganizationMemberModel.organization_id == org_id,
                OrganizationMemberModel.is_active == True,  # noqa: E712
            )
        )
        active_count = count_result.scalar() or 0
        await session.execute(
            update(OrganizationModel)
            .where(OrganizationModel.id == org_id)
            .values(current_members=active_count)
        )


async def _decrement_org_member_counts(
    session,
    user_id: str,  # noqa: ANN001
) -> None:
    """사용자 삭제 전 소속 조직의 current_members 카운터 감소."""
    from sqlalchemy import select, update

    member_result = await session.execute(
        select(OrganizationMemberModel.organization_id).where(
            OrganizationMemberModel.user_id == user_id,
            OrganizationMemberModel.is_active == True,  # noqa: E712
        )
    )
    org_ids = [row[0] for row in member_result.all()]

    for org_id in org_ids:
        await session.execute(
            update(OrganizationModel)
            .where(OrganizationModel.id == org_id)
            .values(current_members=OrganizationModel.current_members - 1)
        )


@router.delete("/users/{user_id}")
async def delete_user(
    user_id: str,
    admin: UserModel = Depends(get_current_admin_user),
):
    """사용자 삭제 (관리자 전용, DB에서 완전 삭제)"""
    if user_id == admin.id:
        raise HTTPException(
            status_code=400,
            detail="자기 자신은 삭제할 수 없습니다.",
        )

    try:
        from sqlalchemy import select

        from db.database import async_session_factory

        async with async_session_factory() as session:
            result = await session.execute(select(UserModel).where(UserModel.id == user_id))
            user = result.scalar_one_or_none()

            if not user:
                raise HTTPException(status_code=404, detail="User not found")

            # CASCADE 전에 소속 조직의 current_members 카운터 감소
            await _decrement_org_member_counts(session, user_id)

            await session.delete(user)
            await session.commit()

            return {"success": True, "message": f"User {user.email} deleted"}
    except HTTPException:
        raise
    except ImportError:
        raise HTTPException(status_code=503, detail="Database not available")


# ============================================================================
# Menu Visibility Endpoints
# ============================================================================


@router.get("/menu-visibility", response_model=MenuVisibilityResponse)
async def get_menu_visibility(
    _user: UserModel = Depends(get_current_user),
) -> MenuVisibilityResponse:
    """메뉴 가시성 설정 조회 (인증 사용자)"""
    try:
        from sqlalchemy import select

        from db.database import async_session_factory

        async with async_session_factory() as session:
            result = await session.execute(select(MenuVisibilityModel))
            rows = result.scalars().all()

            if not rows:
                # DB에 설정 없으면 기본값 반환
                return MenuVisibilityResponse(
                    visibility=DEFAULT_MENU_VISIBILITY,
                    menu_order=DEFAULT_MENU_ORDER,
                )

            # DB 데이터를 딕셔너리로 변환
            visibility: dict[str, dict[str, bool]] = {}
            # sort_order 수집 (menu_key -> sort_order, 첫 번째 role의 값 사용)
            sort_orders: dict[str, int] = {}
            for row in rows:
                if row.menu_key not in visibility:
                    visibility[row.menu_key] = {}
                visibility[row.menu_key][row.role] = row.visible
                if row.sort_order is not None and row.menu_key not in sort_orders:
                    sort_orders[row.menu_key] = row.sort_order

            # DB에 없는 메뉴는 기본값으로 채움
            for menu_key, defaults in DEFAULT_MENU_VISIBILITY.items():
                if menu_key not in visibility:
                    visibility[menu_key] = defaults
                else:
                    for role in VALID_ROLES:
                        if role not in visibility[menu_key]:
                            visibility[menu_key][role] = defaults.get(role, False)

            # menu_order 구성: sort_order가 있으면 정렬, 없으면 기본값
            valid_keys = set(DEFAULT_MENU_ORDER)
            if sort_orders:
                # sort_order가 있는 유효 메뉴만 정렬 (DB에 남은 과거 키 제외)
                ordered = sorted(sort_orders.items(), key=lambda x: x[1])
                menu_order = [k for k, _ in ordered if k in valid_keys]
                # sort_order가 없지만 DEFAULT_MENU_ORDER에 있는 메뉴 추가
                for mk in DEFAULT_MENU_ORDER:
                    if mk not in menu_order:
                        menu_order.append(mk)
            else:
                menu_order = list(DEFAULT_MENU_ORDER)

            return MenuVisibilityResponse(visibility=visibility, menu_order=menu_order)
    except ImportError:
        return MenuVisibilityResponse(
            visibility=DEFAULT_MENU_VISIBILITY,
            menu_order=list(DEFAULT_MENU_ORDER),
        )


@router.put("/menu-visibility", response_model=MenuVisibilityResponse)
async def update_menu_visibility(
    request: MenuVisibilityUpdateRequest,
    _admin: UserModel = Depends(get_current_admin_user),
) -> MenuVisibilityResponse:
    """메뉴 가시성 일괄 업데이트 (관리자 전용)"""
    try:
        from sqlalchemy import select

        from db.database import async_session_factory

        async with async_session_factory() as session:
            # menu_order를 sort_order로 변환
            order_map: dict[str, int] = {}
            if request.menu_order:
                order_map = {mk: idx for idx, mk in enumerate(request.menu_order)}

            for menu_key, roles in request.visibility.items():
                sort_order_val = order_map.get(menu_key)
                for role, visible in roles.items():
                    if role not in VALID_ROLES:
                        continue

                    # admin은 항상 모든 메뉴 접근 가능
                    if role == "admin":
                        visible = True

                    # Upsert
                    result = await session.execute(
                        select(MenuVisibilityModel).where(
                            MenuVisibilityModel.menu_key == menu_key,
                            MenuVisibilityModel.role == role,
                        )
                    )
                    existing = result.scalar_one_or_none()

                    if existing:
                        existing.visible = visible
                        if sort_order_val is not None:
                            existing.sort_order = sort_order_val
                    else:
                        session.add(
                            MenuVisibilityModel(
                                menu_key=menu_key,
                                role=role,
                                visible=visible,
                                sort_order=sort_order_val,
                            )
                        )

            await session.commit()

            # 업데이트된 데이터 반환
            result = await session.execute(select(MenuVisibilityModel))
            rows = result.scalars().all()

            visibility: dict[str, dict[str, bool]] = {}
            sort_orders: dict[str, int] = {}
            for row in rows:
                if row.menu_key not in visibility:
                    visibility[row.menu_key] = {}
                visibility[row.menu_key][row.role] = row.visible
                if row.sort_order is not None and row.menu_key not in sort_orders:
                    sort_orders[row.menu_key] = row.sort_order

            # 기본값 채움
            for mk, defaults in DEFAULT_MENU_VISIBILITY.items():
                if mk not in visibility:
                    visibility[mk] = defaults
                else:
                    for r in VALID_ROLES:
                        if r not in visibility[mk]:
                            visibility[mk][r] = defaults.get(r, False)

            # menu_order 구성
            valid_keys = set(DEFAULT_MENU_ORDER)
            if sort_orders:
                ordered = sorted(sort_orders.items(), key=lambda x: x[1])
                menu_order = [k for k, _ in ordered if k in valid_keys]
                for mk in DEFAULT_MENU_ORDER:
                    if mk not in menu_order:
                        menu_order.append(mk)
            else:
                menu_order = request.menu_order or list(DEFAULT_MENU_ORDER)

            return MenuVisibilityResponse(visibility=visibility, menu_order=menu_order)
    except ImportError:
        raise HTTPException(status_code=503, detail="Database not available")


# ============================================================================
# System Info
# ============================================================================


@router.get("/system-info", response_model=SystemInfo)
async def get_system_info(
    _admin: UserModel = Depends(get_current_admin_user),
) -> SystemInfo:
    """시스템 정보 조회 (관리자 전용)"""
    try:
        from sqlalchemy import func, select

        from db.database import async_session_factory

        async with async_session_factory() as session:
            total = (await session.execute(select(func.count(UserModel.id)))).scalar() or 0
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

            # NOTE: role 동기화 로직은 별도 유지보수 태스크로 분리됨.
            # GET 엔드포인트에서 DB update를 수행하면 REST 원칙 위반이므로 제거.
            # 필요 시 POST /admin/sync-roles 또는 마이그레이션 스크립트 사용.

            # Role distribution based on role column
            role_counts = (
                await session.execute(
                    select(UserModel.role, func.count(UserModel.id)).group_by(UserModel.role)
                )
            ).all()
            role_dist = RoleDistribution()
            for role_val, count in role_counts:
                role_key = (role_val or "user").lower()
                if role_key == "user":
                    role_dist.user = count
                elif role_key == "manager":
                    role_dist.manager = count
                elif role_key == "admin":
                    role_dist.admin = count

            return SystemInfo(
                user_count=total,
                active_user_count=active,
                admin_count=admins,
                role_distribution=role_dist,
            )
    except ImportError:
        return SystemInfo()
