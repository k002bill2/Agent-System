"""Projects CRUD API for DB-managed project registry.

Replaces filesystem-based project discovery with explicit DB registration.
"""

import logging
import re
import uuid
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from api.deps import get_current_admin_user, get_current_user, get_db_session
from db.models import UserModel
from models.project import (
    DBProjectCreate,
    DBProjectListResponse,
    DBProjectResponse,
    DBProjectUpdate,
)

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
        created_at=row.created_at.isoformat() if row.created_at else None,
        updated_at=row.updated_at.isoformat() if row.updated_at else None,
        created_by=row.created_by,
    )


@router.post("", response_model=DBProjectResponse, status_code=201)
async def create_project(
    request: DBProjectCreate,
    current_user: UserModel = Depends(get_current_user),
) -> DBProjectResponse:
    """Create a new project.

    Args:
        request: Project creation data
        current_user: Authenticated user (becomes project owner)

    Returns:
        Created project
    """
    import os

    use_database = os.getenv("USE_DATABASE", "false").lower() == "true"
    if not use_database:
        raise HTTPException(status_code=503, detail="Database mode is not enabled")

    from db.database import async_session_factory
    from db.models import ProjectAccessModel, ProjectModel

    slug = _slugify(request.name)
    project_id = str(uuid.uuid4())

    async with async_session_factory() as session:
        # Check for duplicate name
        existing = await session.execute(
            select(ProjectModel).where(ProjectModel.name == request.name)
        )
        if existing.scalar_one_or_none():
            raise HTTPException(status_code=409, detail=f"Project '{request.name}' already exists")

        # Check for duplicate slug
        existing_slug = await session.execute(select(ProjectModel).where(ProjectModel.slug == slug))
        if existing_slug.scalar_one_or_none():
            # Append a suffix
            slug = f"{slug}-{project_id[:8]}"

        project = ProjectModel(
            id=project_id,
            name=request.name,
            slug=slug,
            description=request.description,
            path=request.path,
            is_active=True,
            settings=request.settings or {},
        )

        project.created_by = current_user.id
        session.add(project)
        await session.flush()  # ID 확정

        # owner로 project_access 등록
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
    """List all active projects.

    Admins see all active projects.
    Regular users see projects they are members of, plus projects with no ACL (public).

    Returns:
        List of active projects
    """
    import os

    use_database = os.getenv("USE_DATABASE", "false").lower() == "true"
    if not use_database:
        raise HTTPException(status_code=503, detail="Database mode is not enabled")

    from sqlalchemy import or_

    from db.database import async_session_factory
    from db.models import ProjectAccessModel, ProjectModel

    async with async_session_factory() as session:
        is_admin = current_user.role == "admin" or current_user.is_admin
        if is_admin:
            result = await session.execute(
                select(ProjectModel)
                .where(ProjectModel.is_active == True)  # noqa: E712
                .order_by(ProjectModel.name)
            )
        else:
            # 유저가 멤버인 프로젝트
            member_subq = (
                select(ProjectAccessModel.project_id)
                .where(ProjectAccessModel.user_id == current_user.id)
                .scalar_subquery()
            )
            # ACL이 전혀 없는 프로젝트 (공개)
            acl_subq = (
                select(ProjectAccessModel.project_id)
                .scalar_subquery()
            )
            result = await session.execute(
                select(ProjectModel)
                .where(
                    ProjectModel.is_active == True,  # noqa: E712
                    or_(
                        ProjectModel.id.in_(member_subq),
                        ProjectModel.id.notin_(acl_subq),
                    )
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

        project.updated_at = datetime.utcnow()

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
        project.updated_at = datetime.utcnow()

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
        project.updated_at = datetime.utcnow()

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
        project.updated_at = datetime.utcnow()

        await session.commit()
        await session.refresh(project)

        return _model_to_response(project)
