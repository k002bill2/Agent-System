"""프로젝트 목록 라우트 + 패키지의 집계 라우터 소유 모듈.

`GET /project-configs` 하나뿐이다. 이 라우트는 **경로 문자열이 비어 있어**
이 모듈이 prefix 를 가진 집계 라우터를 소유해야 한다 — 하위 모듈처럼
`APIRouter()` 로 만들면 prefix 와 path 가 둘 다 비어 FastAPI 가
"Prefix and path cannot be both empty" 로 거부한다. 경로를 `"/"` 로 바꾸는
것은 HTTP 표면 변경이라 하지 않는다. `api/agents/core.py` ·
`api/claude_sessions/core.py` 도 같은 이유로 같은 구조다.

DB 기반 접근 제어 필터(`_get_db_filtered_projects`)는 `list_projects` 단독
소비자라 여기 둔다 — 소비자가 하나면 `_shared.py` 로 올리지 않는다.
"""

import logging
import os

from fastapi import APIRouter, Depends, HTTPException

from api.deps import get_current_user
from api.project_configs.access import require_project_config_access
from models.project_config import (
    ProjectConfigResponse,
)
from services.project_config_monitor import get_project_config_monitor

logger = logging.getLogger(__name__)

router = APIRouter(
    prefix="/project-configs",
    tags=["project-configs"],
    dependencies=[Depends(require_project_config_access)],
)


# ========================================
# Project Discovery
# ========================================


@router.get("", response_model=ProjectConfigResponse)
async def list_projects(
    current_user=Depends(get_current_user),
) -> ProjectConfigResponse:
    """List projects with Claude Code configuration (접근 제어 적용).

    접근 규칙:
        - 시스템 admin: 모든 활성 프로젝트
        - 조직 admin/owner: 자신의 조직 프로젝트 + 명시적 ProjectAccess
        - 일반 member: 명시적 ProjectAccess만
    """
    use_database = os.getenv("USE_DATABASE", "false").lower() == "true"

    if use_database:
        try:
            projects = await _get_db_filtered_projects(None, current_user)
        except Exception as exc:
            logger.exception("DB project filter failed")
            raise HTTPException(
                status_code=503,
                detail="Project access control is temporarily unavailable",
            ) from exc
    else:
        monitor = get_project_config_monitor()
        projects = monitor.discover_projects()

    total_skills = sum(p.skill_count for p in projects)
    total_agents = sum(p.agent_count for p in projects)
    total_mcp_servers = sum(p.mcp_server_count for p in projects)

    return ProjectConfigResponse(
        projects=projects,
        total_count=len(projects),
        total_skills=total_skills,
        total_agents=total_agents,
        total_mcp_servers=total_mcp_servers,
    )


async def _get_db_filtered_projects(monitor, current_user=None) -> list:
    """Get projects filtered by DB registration + 접근 제어.

    For each DB project with a path, scan its config.
    For DB projects without a path, include basic info from discovered projects
    matched by name.
    """
    from pathlib import Path as PathLib

    from sqlalchemy import or_, select

    from api.project_configs.identity import stamp_project_info
    from db.database import async_session_factory
    from db.models import ProjectAccessModel, ProjectModel
    from models.project_config import ProjectInfo
    from services.project_config_monitor import ProjectConfigMonitor
    from utils.time import utcnow

    if monitor is None:
        monitor = ProjectConfigMonitor(
            project_paths=[],
            include_current=False,
            include_env_paths=False,
            allow_auto_discovery=False,
        )

    # Whether the query below spans the whole registry or only what this user
    # may reach. An empty result means different things for the two, and the
    # 503 guard after the block depends on telling them apart.
    registry_wide = False

    async with async_session_factory() as session:
        is_admin = False
        if current_user:
            is_admin = current_user.role == "admin" or current_user.is_admin

        registry_wide = is_admin or not current_user
        if registry_wide:
            # 시스템 admin 또는 미인증: 전체 활성 프로젝트
            result = await session.execute(
                select(ProjectModel)
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
                    select(ProjectModel)
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
                    select(ProjectModel)
                    .where(
                        ProjectModel.is_active == True,  # noqa: E712
                        ProjectModel.id.in_(member_subq),
                    )
                    .order_by(ProjectModel.name)
                )

        db_projects = result.scalars().all()

    if not db_projects and registry_wide:
        # Registry-wide query came back empty: in database mode that is an
        # unprovisioned registry (startup sync incomplete), not a normal state.
        # Same reading as `api/routes.py`'s registry check.
        raise HTTPException(
            status_code=503,
            detail="Project access control is temporarily unavailable",
        )

    # An access-filtered query coming back empty is NOT an outage — it means
    # this user may reach no project. Returning [] is the correct answer and is
    # already fail-closed: the loop below never runs, and the monitor is built
    # with auto-discovery and env paths off, so nothing on the filesystem is
    # enumerated. Raising 503 here told legitimate users the service was broken
    # and made a permission outcome indistinguishable from a real outage.

    # Scan only explicitly registered DB project paths. Never enumerate the
    # monitor's machine-wide filesystem roots in database mode.
    filtered = []
    seen_paths = set()
    for db_proj in db_projects:
        if db_proj.path:
            if db_proj.path in seen_paths:
                continue
            path = PathLib(db_proj.path)
            if path.exists() and path.is_dir():
                monitor.add_external_project(str(path))
                # Re-scan this specific project. The monitor key must come from
                # the monitor's own normalization -- encoding the raw string
                # misses this project whenever the registered path is a symlink
                # (every `projects/` entry in this repo is one).
                project_id = monitor.encode_project_path(str(path))
                summary = monitor.get_project_summary(project_id)
                if summary and summary.project:
                    # The public identity is the DB id, not the monitor's
                    # path-derived key. The dashboard reuses whatever id this
                    # list hands out for every child request, so leaking the
                    # monitor key here is what split the two vocabularies.
                    filtered.append(stamp_project_info(summary.project, str(db_proj.id)))
                    seen_paths.add(summary.project.project_path)
                    continue

        # Fallback: DB project has no path or path scan failed
        # Include it as a basic ProjectInfo so it appears in the list.
        # Same canonical identity as the scanned branch above -- the guard
        # still accepts the legacy `db-` spelling on the way in.
        project_id = str(db_proj.id)
        filtered.append(
            ProjectInfo(
                project_id=project_id,
                project_name=db_proj.name,
                project_path=db_proj.path or "",
                claude_dir="",
                last_modified=db_proj.updated_at or db_proj.created_at or utcnow(),
            )
        )

    return filtered
