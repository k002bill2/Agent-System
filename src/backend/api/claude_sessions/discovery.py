"""세션 탐색·위생 라우트 (`/projects`, `/empty/list`, `/ghost/list`, `/ghost`).

세션 필터링용 프로젝트 목록(접근 제어 적용)과, 대화 실체가 없는 세션
—빈 세션·유령 세션—의 조회·삭제를 제공한다.

`GET /projects` 와 `DELETE /ghost` 는 2세그먼트 구체 경로다 — `sessions` 의
`GET/DELETE /{session_id}` 가 이들을 가리므로 `__init__.py` 에서
**`sessions` 보다 먼저** include 해야 한다.
"""

import logging

from fastapi import APIRouter, Depends, HTTPException

from api.deps import get_current_admin_or_manager_user, get_current_user
from services.claude_session_monitor import get_monitor
from services.codex_session_monitor import get_codex_monitor

logger = logging.getLogger(__name__)

router = APIRouter(dependencies=[Depends(get_current_admin_or_manager_user)])


@router.get("/projects")
async def list_projects(
    current_user=Depends(get_current_user),
) -> dict:
    """List project names for session filtering (접근 제어 적용).

    접근 규칙:
        - 시스템 admin: 모든 활성 프로젝트
        - 조직 admin/owner: 자신의 조직 프로젝트 + 명시적 ProjectAccess
        - 일반 member: 명시적 ProjectAccess만
    """
    import os

    use_database = os.getenv("USE_DATABASE", "false").lower() == "true"

    if use_database:
        try:
            from sqlalchemy import or_, select

            from db.database import async_session_factory
            from db.models import ProjectAccessModel, ProjectModel

            is_admin = current_user.role == "admin" or current_user.is_admin

            async with async_session_factory() as session:
                if is_admin:
                    result = await session.execute(
                        select(ProjectModel.name)
                        .where(ProjectModel.is_active == True)  # noqa: E712
                        .order_by(ProjectModel.name)
                    )
                else:
                    from api.projects import _get_admin_org_ids

                    admin_org_ids = await _get_admin_org_ids(current_user)

                    member_subq = (
                        select(ProjectAccessModel.project_id)
                        .where(ProjectAccessModel.user_id == current_user.id)
                        .scalar_subquery()
                    )

                    if admin_org_ids:
                        result = await session.execute(
                            select(ProjectModel.name)
                            .where(
                                ProjectModel.is_active == True,  # noqa: E712
                                or_(
                                    ProjectModel.organization_id.in_(admin_org_ids),
                                    ProjectModel.id.in_(member_subq),
                                ),
                            )
                            .order_by(ProjectModel.name)
                        )
                    else:
                        result = await session.execute(
                            select(ProjectModel.name)
                            .where(
                                ProjectModel.is_active == True,  # noqa: E712
                                ProjectModel.id.in_(member_subq),
                            )
                            .order_by(ProjectModel.name)
                        )

                project_names = [row[0] for row in result.fetchall() if row[0]]
                if not project_names:
                    raise HTTPException(
                        status_code=503,
                        detail="Project access control is temporarily unavailable",
                    )
                return {"projects": project_names}
        except Exception as exc:
            logger.exception("DB project lookup failed")
            raise HTTPException(
                status_code=503,
                detail="Project access control is temporarily unavailable",
            ) from exc

    # Filesystem discovery is only valid when the database registry is disabled.
    monitor = get_monitor()
    projects = set(monitor.get_unique_projects())
    projects.update(
        session.project_name
        for session in get_codex_monitor().discover_sessions()
        if session.project_name
    )

    return {
        "projects": sorted(projects),
    }


@router.get("/empty/list")
async def list_empty_sessions() -> dict:
    """List all sessions with 0 messages.

    Returns:
        List of empty sessions
    """
    monitor = get_monitor()
    empty_sessions = monitor.get_empty_sessions()

    return {
        "empty_count": len(empty_sessions),
        "sessions": [s.model_dump() for s in empty_sessions],
    }


@router.get("/ghost/list")
async def list_ghost_sessions() -> dict:
    """List all ghost sessions (message_count > 0 but no real user/assistant messages).

    These sessions have metadata entries but no actual conversation.

    Returns:
        List of ghost sessions
    """
    monitor = get_monitor()
    ghost_sessions = monitor.get_ghost_sessions()

    return {
        "ghost_count": len(ghost_sessions),
        "sessions": [s.model_dump() for s in ghost_sessions],
    }


@router.delete("/ghost")
async def delete_ghost_sessions(
    _admin=Depends(get_current_admin_or_manager_user),
) -> dict:
    """Delete all ghost sessions.

    Returns:
        List of deleted session IDs and count
    """
    monitor = get_monitor()
    deleted_ids = monitor.delete_ghost_sessions()

    return {
        "success": True,
        "deleted_count": len(deleted_ids),
        "deleted_ids": deleted_ids,
    }
