"""Projects CRUD API for DB-managed project registry.

Replaces filesystem-based project discovery with explicit DB registration.
"""

import logging
import re
import uuid

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from api.deps import get_current_admin_user, get_current_user, get_db_session
from db.models import UserModel
from models.project import (
    DBProjectCreate,
    DBProjectListResponse,
    DBProjectResponse,
    DBProjectUpdate,
)
from utils.time import utcnow

from ._shared import _get_admin_org_ids

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/project-registry", tags=["project-registry"])


def _slugify(name: str) -> str:
    """Generate URL-friendly slug from project name."""
    slug = name.lower().strip()
    slug = re.sub(r"[^\w\s-]", "", slug)
    slug = re.sub(r"[\s_]+", "-", slug)
    slug = re.sub(r"-+", "-", slug)
    return slug.strip("-")


def _model_to_response(row) -> DBProjectResponse:
    """Convert DB row to response model."""
    return DBProjectResponse(
        id=row.id,
        name=row.name,
        slug=row.slug,
        description=row.description,
        path=row.path,
        is_active=row.is_active,
        settings=row.settings or {},
        organization_id=row.organization_id,
        created_at=row.created_at.isoformat() if row.created_at else None,
        updated_at=row.updated_at.isoformat() if row.updated_at else None,
        created_by=row.created_by,
    )


@router.post("", response_model=DBProjectResponse, status_code=201)
async def create_project(
    request: DBProjectCreate,
    current_user: UserModel = Depends(get_current_user),
) -> DBProjectResponse:
    """Create a new project. Only system admins or org admin/owners can create."""
    import os

    use_database = os.getenv("USE_DATABASE", "false").lower() == "true"
    if not use_database:
        raise HTTPException(status_code=503, detail="Database mode is not enabled")

    from db.database import async_session_factory
    from db.models import ProjectAccessModel, ProjectModel

    is_system_admin = current_user.role == "admin" or current_user.is_admin

    # 조직 admin 체크
    admin_org_ids = []
    if not is_system_admin:
        admin_org_ids = await _get_admin_org_ids(current_user)
        if not admin_org_ids:
            raise HTTPException(
                status_code=403,
                detail="프로젝트 등록 권한이 없습니다. 조직의 admin 또는 owner만 등록 가능합니다.",
            )

    # organization_id 결정
    org_id = request.organization_id
    if not is_system_admin:
        if org_id and org_id not in admin_org_ids:
            raise HTTPException(
                status_code=403,
                detail="해당 조직에 대한 admin 권한이 없습니다.",
            )
        if not org_id:
            if len(admin_org_ids) == 1:
                org_id = admin_org_ids[0]
            else:
                raise HTTPException(
                    status_code=400,
                    detail="여러 조직에 속해 있습니다. organization_id를 명시해 주세요.",
                )

    slug = _slugify(request.name)
    project_id = str(uuid.uuid4())

    async with async_session_factory() as session:
        existing = await session.execute(
            select(ProjectModel).where(ProjectModel.name == request.name)
        )
        if existing.scalar_one_or_none():
            raise HTTPException(status_code=409, detail=f"Project '{request.name}' already exists")

        existing_slug = await session.execute(select(ProjectModel).where(ProjectModel.slug == slug))
        if existing_slug.scalar_one_or_none():
            slug = f"{slug}-{project_id[:8]}"

        project = ProjectModel(
            id=project_id,
            name=request.name,
            slug=slug,
            description=request.description,
            path=request.path,
            is_active=True,
            settings=request.settings or {},
            organization_id=org_id,
            created_by=current_user.id,
        )
        session.add(project)
        await session.flush()

        access = ProjectAccessModel(
            id=str(uuid.uuid4()),
            project_id=project_id,
            user_id=current_user.id,
            role="owner",
            granted_by=current_user.id,
        )
        session.add(access)
        await session.commit()
        await session.refresh(project)

        return _model_to_response(project)


@router.get("", response_model=DBProjectListResponse)
async def list_active_projects(
    current_user: UserModel = Depends(get_current_user),
    db: AsyncSession = Depends(get_db_session),
) -> DBProjectListResponse:
    """List active projects filtered by org membership.

    - 시스템admin: 전체 활성 프로젝트
    - 조직admin/owner: 자신의 조직 소속 프로젝트
    - 일반 유저/member: ProjectAccess에 명시된 프로젝트만
    """
    import os

    from sqlalchemy import or_

    use_database = os.getenv("USE_DATABASE", "false").lower() == "true"
    if not use_database:
        raise HTTPException(status_code=503, detail="Database mode is not enabled")

    from db.database import async_session_factory
    from db.models import ProjectAccessModel, ProjectModel

    async with async_session_factory() as session:
        is_system_admin = current_user.role == "admin" or current_user.is_admin

        if is_system_admin:
            result = await session.execute(
                select(ProjectModel)
                .where(ProjectModel.is_active == True)  # noqa: E712
                .order_by(ProjectModel.name)
            )
        else:
            admin_org_ids = await _get_admin_org_ids(current_user)

            if admin_org_ids:
                member_subq = (
                    select(ProjectAccessModel.project_id)
                    .where(ProjectAccessModel.user_id == current_user.id)
                    .scalar_subquery()
                )
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
                member_subq = (
                    select(ProjectAccessModel.project_id)
                    .where(ProjectAccessModel.user_id == current_user.id)
                    .scalar_subquery()
                )
                result = await session.execute(
                    select(ProjectModel)
                    .where(
                        ProjectModel.is_active == True,  # noqa: E712
                        ProjectModel.id.in_(member_subq),
                    )
                    .order_by(ProjectModel.name)
                )

        projects = result.scalars().all()
        return DBProjectListResponse(
            projects=[_model_to_response(p) for p in projects],
            total_count=len(projects),
        )


@router.get("/all", response_model=DBProjectListResponse)
async def list_all_projects(
    current_user: UserModel = Depends(get_current_admin_user),
) -> DBProjectListResponse:
    """List all projects including inactive ones. Admin only.

    Returns:
        List of all projects
    """
    import os

    use_database = os.getenv("USE_DATABASE", "false").lower() == "true"
    if not use_database:
        raise HTTPException(status_code=503, detail="Database mode is not enabled")

    from db.database import async_session_factory
    from db.models import ProjectModel

    async with async_session_factory() as session:
        result = await session.execute(
            select(ProjectModel).order_by(ProjectModel.is_active.desc(), ProjectModel.name)
        )
        projects = result.scalars().all()

        return DBProjectListResponse(
            projects=[_model_to_response(p) for p in projects],
            total_count=len(projects),
        )


@router.get("/{project_id}", response_model=DBProjectResponse)
async def get_project(project_id: str) -> DBProjectResponse:
    """Get a specific project by ID.

    Args:
        project_id: Project UUID

    Returns:
        Project details
    """
    import os

    use_database = os.getenv("USE_DATABASE", "false").lower() == "true"
    if not use_database:
        raise HTTPException(status_code=503, detail="Database mode is not enabled")

    from db.database import async_session_factory
    from db.models import ProjectModel

    async with async_session_factory() as session:
        result = await session.execute(select(ProjectModel).where(ProjectModel.id == project_id))
        project = result.scalar_one_or_none()

        if not project:
            raise HTTPException(status_code=404, detail=f"Project not found: {project_id}")

        return _model_to_response(project)


@router.put("/{project_id}", response_model=DBProjectResponse)
async def update_project(project_id: str, request: DBProjectUpdate) -> DBProjectResponse:
    """Update a project.

    Args:
        project_id: Project UUID
        request: Update data

    Returns:
        Updated project
    """
    import os

    use_database = os.getenv("USE_DATABASE", "false").lower() == "true"
    if not use_database:
        raise HTTPException(status_code=503, detail="Database mode is not enabled")

    from db.database import async_session_factory
    from db.models import ProjectModel

    async with async_session_factory() as session:
        result = await session.execute(select(ProjectModel).where(ProjectModel.id == project_id))
        project = result.scalar_one_or_none()

        if not project:
            raise HTTPException(status_code=404, detail=f"Project not found: {project_id}")

        # Update fields
        if request.name is not None:
            # Check for duplicate name
            existing = await session.execute(
                select(ProjectModel).where(
                    ProjectModel.name == request.name,
                    ProjectModel.id != project_id,
                )
            )
            if existing.scalar_one_or_none():
                raise HTTPException(
                    status_code=409, detail=f"Project '{request.name}' already exists"
                )
            project.name = request.name
            project.slug = _slugify(request.name)

        if request.description is not None:
            project.description = request.description
        if request.path is not None:
            project.path = request.path
        if request.settings is not None:
            project.settings = request.settings

        project.updated_at = utcnow()

        await session.commit()
        await session.refresh(project)

        return _model_to_response(project)


@router.patch("/{project_id}/toggle-active", response_model=DBProjectResponse)
async def toggle_project_active(project_id: str) -> DBProjectResponse:
    """Toggle a project's is_active status.

    Args:
        project_id: Project UUID

    Returns:
        Updated project with toggled is_active
    """
    import os

    use_database = os.getenv("USE_DATABASE", "false").lower() == "true"
    if not use_database:
        raise HTTPException(status_code=503, detail="Database mode is not enabled")

    from db.database import async_session_factory
    from db.models import ProjectModel

    async with async_session_factory() as session:
        result = await session.execute(select(ProjectModel).where(ProjectModel.id == project_id))
        project = result.scalar_one_or_none()

        if not project:
            raise HTTPException(status_code=404, detail=f"Project not found: {project_id}")

        project.is_active = not project.is_active
        project.updated_at = utcnow()

        await session.commit()
        await session.refresh(project)

        return _model_to_response(project)


@router.delete("/{project_id}")
async def delete_project(project_id: str) -> dict:
    """Soft-delete a project (set is_active=False).

    Args:
        project_id: Project UUID

    Returns:
        Success status
    """
    import os

    use_database = os.getenv("USE_DATABASE", "false").lower() == "true"
    if not use_database:
        raise HTTPException(status_code=503, detail="Database mode is not enabled")

    from db.database import async_session_factory
    from db.models import ProjectModel

    async with async_session_factory() as session:
        result = await session.execute(select(ProjectModel).where(ProjectModel.id == project_id))
        project = result.scalar_one_or_none()

        if not project:
            raise HTTPException(status_code=404, detail=f"Project not found: {project_id}")

        project.is_active = False
        project.updated_at = utcnow()

        await session.commit()

        return {
            "success": True,
            "message": f"Project '{project.name}' deactivated",
            "project_id": project_id,
        }


@router.post("/{project_id}/restore")
async def restore_project(project_id: str) -> DBProjectResponse:
    """Restore a soft-deleted project.

    Args:
        project_id: Project UUID

    Returns:
        Restored project
    """
    import os

    use_database = os.getenv("USE_DATABASE", "false").lower() == "true"
    if not use_database:
        raise HTTPException(status_code=503, detail="Database mode is not enabled")

    from db.database import async_session_factory
    from db.models import ProjectModel

    async with async_session_factory() as session:
        result = await session.execute(select(ProjectModel).where(ProjectModel.id == project_id))
        project = result.scalar_one_or_none()

        if not project:
            raise HTTPException(status_code=404, detail=f"Project not found: {project_id}")

        project.is_active = True
        project.updated_at = utcnow()

        await session.commit()
        await session.refresh(project)

        return _model_to_response(project)


@router.delete("/{project_id}/permanent")
async def permanent_delete_project(
    project_id: str,
    current_user: UserModel = Depends(get_current_admin_user),
) -> dict:
    """Permanently delete a project (hard delete). Admin only.

    Removes the project row plus its access/invitation rows. Leaves orphaned
    references in sessions/activities/audit intentionally for historical record.
    """
    import os

    use_database = os.getenv("USE_DATABASE", "false").lower() == "true"
    if not use_database:
        raise HTTPException(status_code=503, detail="Database mode is not enabled")

    from db.database import async_session_factory
    from db.models import ProjectAccessModel, ProjectInvitationModel, ProjectModel

    async with async_session_factory() as session:
        result = await session.execute(select(ProjectModel).where(ProjectModel.id == project_id))
        project = result.scalar_one_or_none()

        if not project:
            raise HTTPException(status_code=404, detail=f"Project not found: {project_id}")

        project_name = project.name

        await session.execute(
            delete(ProjectAccessModel).where(ProjectAccessModel.project_id == project_id)
        )
        await session.execute(
            delete(ProjectInvitationModel).where(ProjectInvitationModel.project_id == project_id)
        )
        await session.delete(project)
        await session.commit()

        logger.info(
            "Project permanently deleted",
            extra={
                "project_id": project_id,
                "project_name": project_name,
                "admin_user_id": current_user.id,
            },
        )

        return {
            "success": True,
            "message": f"Project '{project_name}' permanently deleted",
            "project_id": project_id,
        }
