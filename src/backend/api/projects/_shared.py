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


async def authorize_db_project(project_id: str, user, session):
    """유저가 접근 가능한 **활성** DB 레지스트리 프로젝트만 돌려준다.

    `api/routes.py` 의 `GET /projects` 와 같은 규칙이다:
        - 시스템 admin: 전체
        - 조직 admin/owner: 자기 조직 프로젝트
        - 일반 member: 명시적 `ProjectAccess` 만

    규칙을 두 벌로 두면 인가 검사가 조용히 갈라지므로, 단건 조회가 필요한
    소비자(`api/rag.py`)는 이 헬퍼를 재사용한다.

    접근 불가·미존재를 구분하지 않고 둘 다 `None` 으로 낸다 — 호출자가 404 를
    내면 존재 자체가 새어나가지 않는다.
    """
    import os

    if os.getenv("USE_DATABASE", "false").lower() != "true":
        return None

    from sqlalchemy import or_, select

    from db.models import ProjectAccessModel, ProjectModel

    query = select(ProjectModel).where(
        ProjectModel.id == project_id,
        ProjectModel.is_active == True,  # noqa: E712
    )

    is_admin = getattr(user, "role", None) == "admin" or bool(getattr(user, "is_admin", False))
    if not is_admin:
        admin_org_ids = await _get_admin_org_ids(user)
        member_subquery = select(ProjectAccessModel.project_id).where(
            ProjectAccessModel.user_id == user.id
        )
        query = query.where(
            or_(
                ProjectModel.organization_id.in_(admin_org_ids),
                ProjectModel.id.in_(member_subquery),
            )
        )

    result = await session.execute(query)
    return result.scalar_one_or_none()
