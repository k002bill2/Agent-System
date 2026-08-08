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

from fastapi import APIRouter, Depends

from api.deps import get_current_user_optional
from models.project_config import (
    ProjectConfigResponse,
)
from services.project_config_monitor import get_project_config_monitor

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/project-configs", tags=["project-configs"])


# ========================================
# Project Discovery
# ========================================


@router.get("", response_model=ProjectConfigResponse)
async def list_projects(
    current_user=Depends(get_current_user_optional),
) -> ProjectConfigResponse:
    """List projects with Claude Code configuration (접근 제어 적용).

    접근 규칙:
        - 시스템 admin: 모든 활성 프로젝트
        - 조직 admin/owner: 자신의 조직 프로젝트 + 명시적 ProjectAccess
        - 일반 member: 명시적 ProjectAccess만
    """
    monitor = get_project_config_monitor()

    use_database = os.getenv("USE_DATABASE", "false").lower() == "true"

    if use_database:
        try:
            projects = await _get_db_filtered_projects(monitor, current_user)
        except Exception as e:
            logger.warning(f"DB project filter failed, falling back to discovery: {e}")
            projects = monitor.discover_projects()
    else:
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

    from db.database import async_session_factory
    from db.models import ProjectAccessModel, ProjectModel
    from models.project_config import ProjectInfo
    from utils.time import utcnow

    async with async_session_factory() as session:
        is_admin = False
        if current_user:
            is_admin = current_user.role == "admin" or current_user.is_admin

        if is_admin or not current_user:
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

    if not db_projects:
        return []

    # Build set of DB project names for matching
    db_project_names = {p.name for p in db_projects}
    db_project_paths = {p.path for p in db_projects if p.path}

    # Get all discovered projects from filesystem
    all_discovered = monitor.discover_projects()

    # Filter: only keep projects whose name or path matches a DB project
    # Use seen_paths to prevent duplicates when DB name != filesystem name
    filtered = []
    seen_paths = set()
    for discovered in all_discovered:
        if (
            discovered.project_name in db_project_names
            or discovered.project_path in db_project_paths
        ):
            if discovered.project_path not in seen_paths:
                filtered.append(discovered)
                seen_paths.add(discovered.project_path)

    # Also ensure DB projects with paths not yet in monitor get added
    discovered_names = {p.project_name for p in filtered}
    for db_proj in db_projects:
        if db_proj.name in discovered_names:
            continue

        if db_proj.path:
            # Skip if this path was already added (matched by path in first loop)
            if db_proj.path in seen_paths:
                continue
            # Try to add the path and scan
            path = PathLib(db_proj.path)
            if path.exists() and path.is_dir():
                monitor.add_external_project(str(path))
                # Re-scan this specific project
                project_id = str(path).replace("/", "-").replace("\\", "-")
                summary = monitor.get_project_summary(project_id)
                if summary and summary.project:
                    filtered.append(summary.project)
                    seen_paths.add(summary.project.project_path)
                    continue

        # Fallback: DB project has no path or path scan failed
        # Include it as a basic ProjectInfo so it appears in the list
        project_id = f"db-{db_proj.id}"
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
