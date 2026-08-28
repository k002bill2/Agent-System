"""Central authorization guard for project configuration assets."""

import os

from fastapi import Depends, HTTPException, Request, status

from api.deps import get_current_user, get_db_session, require_project_role
from api.project_configs.identity import (
    CANONICAL_ID_SLOT,
)
from db.models import ProjectModel, UserModel
from services import project_config_monitor


def _bind_canonical_identity(request: Request, project: ProjectModel) -> None:
    """정규 DB id 를 요청 스코프에 남기고 `{project_id}` 를 모니터 키로 바꾼다.

    DB 모드에서 이 라우터로 들어오는 id 는 정규 UUID 인데, `.claude/` 자산을
    실제로 읽는 `ProjectConfigMonitor` 는 경로 파생 키밖에 모른다. 번역을 여기
    한 곳에서만 하고 핸들러는 평소대로 `{project_id}` 를 쓴다 — FastAPI 는
    라우터 의존성을 전부 푼 **뒤에** 핸들러의 path 파라미터를 뽑으므로 이
    제자리 변경이 핸들러까지 전달된다.

    호출은 **인가를 통과한 뒤에만** 한다. `monitor_id_for_registered_path` 가
    경로를 모니터에 등록하므로, 권한 없는 요청이 감시 대상을 늘리지 않게 한다.

    경로 없는 DB 프로젝트는 번역할 대상이 없다. 정규 id 만 남기고
    `{project_id}` 는 그대로 둬서 핸들러가 평소대로 404 를 내게 한다.
    """
    request.path_params[CANONICAL_ID_SLOT] = str(project.id)
    # Keep the handler's project_id canonical. ProjectConfigMonitor resolves
    # this public ID through the alias registered by the access guard; mutating
    # Starlette path_params here would make responses leak the internal path key.


async def require_project_config_access(
    request: Request,
    current_user: UserModel = Depends(get_current_user),
    db=Depends(get_db_session),
) -> UserModel:
    """Authorize every project-config asset route from one DB-aware guard.

    The aggregate project list is handled by its own DB access filter. Routes
    that enumerate global/machine-wide assets require a privileged operator.
    Project-scoped routes require an active DB-registered project in database
    mode and an explicit project/org grant for non-privileged users.
    """
    project_id = request.path_params.get("project_id")
    if request.url.path.rstrip("/") == "/api/project-configs":
        return current_user

    is_privileged = current_user.role in {"admin", "manager"} or current_user.is_admin
    if project_id is None:
        # Global / machine-wide asset routes (/global, /stream, /external-paths).
        # Operator-only, and that rule does not depend on the storage mode — the
        # assets live on the filesystem either way. A database-mode 503 used to
        # sit ahead of this check and blocked the routes outright, including for
        # operators who were authorized to reach them.
        if not is_privileged:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Admin or manager privileges required",
            )
        return current_user

    use_database = os.getenv("USE_DATABASE", "false").lower() == "true"
    if not use_database:
        if (
            project_config_monitor.get_project_config_monitor().get_project_summary(project_id)
            is None
        ):
            raise HTTPException(status_code=404, detail="Project not found")

        # Existence was the only check here, which made this the one
        # project-scoped path that never consulted the project ACL. Every other
        # project route goes through require_project_role; this brings the
        # filesystem branch in line. Reads need viewer, mutations need editor.
        min_role = "viewer" if request.method in {"GET", "HEAD", "OPTIONS"} else "editor"
        await require_project_role(project_id, current_user, db, min_role=min_role)
        return current_user

    try:
        from sqlalchemy import select

        result = await db.execute(select(ProjectModel).where(ProjectModel.is_active == True))  # noqa: E712
        projects = result.scalars().all()
        if not projects:
            raise HTTPException(
                status_code=503,
                detail="Project access control is temporarily unavailable",
            )

        def route_ids(project: ProjectModel) -> set[str]:
            ids = {str(project.id), f"db-{project.id}"}
            if project.path:
                monitor = project_config_monitor.get_project_config_monitor()
                ids.add(monitor.encode_project_path(str(project.path)))
            return ids

        project = next((item for item in projects if project_id in route_ids(item)), None)
        if project is None:
            raise HTTPException(status_code=404, detail="Project not found")
        if project.path:
            monitor = project_config_monitor.get_project_config_monitor()
            monitor.add_external_project(str(project.path))
            monitor.register_project_id_alias(str(project.id), str(project.path))
        if is_privileged:
            _bind_canonical_identity(request, project)
            return current_user

        from api.projects import _get_admin_org_ids

        admin_org_ids = await _get_admin_org_ids(current_user)
        if project.organization_id in admin_org_ids:
            _bind_canonical_identity(request, project)
            return current_user

        min_role = "viewer" if request.method in {"GET", "HEAD", "OPTIONS"} else "editor"
        await require_project_role(str(project.id), current_user, db, min_role=min_role)
        _bind_canonical_identity(request, project)
        return current_user
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(
            status_code=503,
            detail="Project access control is temporarily unavailable",
        ) from exc


async def require_project_config_target_access(
    target_project_id: str,
    current_user: UserModel,
    db,
) -> None:
    """Authorize the destination of a project-config copy operation."""
    if os.getenv("USE_DATABASE", "false").lower() != "true":
        if (
            project_config_monitor.get_project_config_monitor().get_project_summary(
                target_project_id
            )
            is None
        ):
            raise HTTPException(status_code=404, detail="Target project not found")

        # The route dependency authorizes the *source* project only, and a copy
        # writes into the target - so the destination needs its own editor
        # check. Returning here unconditionally let anyone with access to one
        # project push .claude assets into any other project they could name.
        await require_project_role(target_project_id, current_user, db, min_role="editor")
        return

    try:
        from sqlalchemy import select

        result = await db.execute(select(ProjectModel).where(ProjectModel.is_active == True))  # noqa: E712
        projects = result.scalars().all()

        def route_ids(project: ProjectModel) -> set[str]:
            ids = {str(project.id), f"db-{project.id}"}
            if project.path:
                ids.add(
                    project_config_monitor.get_project_config_monitor().encode_project_path(
                        str(project.path)
                    )
                )
            return ids

        project = next((item for item in projects if target_project_id in route_ids(item)), None)
        if project is None:
            raise HTTPException(status_code=404, detail="Target project not found")
        if project.path:
            monitor = project_config_monitor.get_project_config_monitor()
            monitor.add_external_project(str(project.path))
            monitor.register_project_id_alias(str(project.id), str(project.path))

        is_privileged = current_user.role in {"admin", "manager"} or current_user.is_admin
        if is_privileged:
            return

        from api.projects import _get_admin_org_ids

        admin_org_ids = await _get_admin_org_ids(current_user)
        if project.organization_id in admin_org_ids:
            return

        await require_project_role(str(project.id), current_user, db, min_role="editor")
        return
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(
            status_code=503,
            detail="Project access control is temporarily unavailable",
        ) from exc
