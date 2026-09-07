"""Project Registry API 모듈들이 공유하는 의존성.

`_legacy.py` 분할 과정에서 여러 모듈이 함께 쓰게 된 이름을 여기로 승격한다.
순환 import 를 막기 위해 이 모듈은 형제 모듈(`._legacy` 포함)을 import 하지
않는다 — 의존은 항상 한 방향(형제 → `_shared`)이다.

`_get_admin_org_ids` 는 패키지 **밖에서도** 쓰인다: `api/project_configs.py:258`,
`api/claude_sessions.py:430`, `api/routes.py:213`. 따라서 `__init__.py` 가 이
이름을 재노출한다.
"""


async def _get_admin_org_ids(user) -> list[str]:
    """유저가 admin/owner인 조직 ID 목록을 반환한다.

    시스템 admin은 특별 처리하지 않음 (호출자가 별도 처리).
    JSON fallback(in-memory)도 지원.
    """
    import os

    if os.getenv("USE_DATABASE", "false").lower() != "true":
        return []

    from sqlalchemy import and_, select

    from db.database import async_session_factory
    from db.models import OrganizationMemberModel

    admin_roles = {"owner", "admin"}

    async with async_session_factory() as session:
        result = await session.execute(
            select(OrganizationMemberModel.organization_id).where(
                and_(
                    OrganizationMemberModel.user_id == user.id,
                    OrganizationMemberModel.role.in_(admin_roles),
                    OrganizationMemberModel.is_active == True,  # noqa: E712
                )
            )
        )
        db_org_ids = [row[0] for row in result.all()]

    return db_org_ids


def _roles_at_or_above(min_role: str) -> list[str]:
    """`min_role` 이상 등급의 프로젝트 역할 이름들.

    등급표는 `api/deps.py` 가 소유한다 — 여기 숫자를 복제하면 한쪽만 새 역할을
    알게 되고, 모르는 쪽이 인가라 조용히 헐거워진다.
    """
    from api.deps import _PROJECT_ROLE_HIERARCHY

    if min_role not in _PROJECT_ROLE_HIERARCHY:
        raise ValueError(f"Unknown project role requirement: {min_role!r}")

    threshold = _PROJECT_ROLE_HIERARCHY[min_role]
    return [role for role, rank in _PROJECT_ROLE_HIERARCHY.items() if rank >= threshold]


async def authorize_db_projects(
    project_ids: list[str] | None, user, session, min_role: str = "viewer"
) -> list:
    """유저가 접근 가능한 **활성** DB 레지스트리 프로젝트를 돌려준다.

    `api/routes.py` 의 `GET /projects` 와 같은 규칙이다:
        - 시스템 admin: 전체
        - 조직 admin/owner: 자기 조직 프로젝트
        - 일반 member: 명시적 `ProjectAccess` 만

    규칙을 두 벌로 두면 인가 검사가 조용히 갈라지고, 갈라진 쪽이 인가라 티가
    나지 않는다. 단건·다건 소비자(`api/rag.py`)가 모두 이 하나를 재사용한다.

    `project_ids=None` 은 "접근 가능한 전부" 를 뜻한다.

    `min_role` 은 명시적 `ProjectAccess` 경로에만 적용된다. viewer 권한으로
    재인덱싱·컬렉션 삭제가 되면 안 되므로, 변경 라우트는 `editor` 를 요구한다.
    조직 admin/owner 와 시스템 admin 은 이 하한 위에 있으므로 그대로 통과한다.
    """
    import os

    if os.getenv("USE_DATABASE", "false").lower() != "true":
        return []

    from sqlalchemy import or_, select

    from db.models import ProjectAccessModel, ProjectModel

    query = select(ProjectModel).where(
        ProjectModel.is_active == True,  # noqa: E712
    )
    if project_ids is not None:
        if not project_ids:
            return []
        query = query.where(ProjectModel.id.in_(project_ids))

    is_admin = getattr(user, "role", None) == "admin" or bool(getattr(user, "is_admin", False))
    if not is_admin:
        admin_org_ids = await _get_admin_org_ids(user)
        member_subquery = select(ProjectAccessModel.project_id).where(
            ProjectAccessModel.user_id == user.id,
            ProjectAccessModel.role.in_(_roles_at_or_above(min_role)),
        )
        query = query.where(
            or_(
                ProjectModel.organization_id.in_(admin_org_ids),
                ProjectModel.id.in_(member_subquery),
            )
        )

    result = await session.execute(query)
    return list(result.scalars().all())


async def authorize_db_project(project_id: str, user, session, min_role: str = "viewer"):
    """`authorize_db_projects` 의 단건 판. 접근 불가와 미존재를 구분하지 않는다.

    둘 다 `None` 이라, 호출자가 404 를 내면 존재 자체가 새어나가지 않는다.
    """
    rows = await authorize_db_projects([project_id], user, session, min_role=min_role)
    return rows[0] if rows else None
