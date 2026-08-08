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
