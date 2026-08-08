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
    OrgMemberForProject,
    OrgMemberListResponse,
    ProjectMemberAdd,
    ProjectMemberListResponse,
    ProjectMemberResponse,
    ProjectMemberUpdate,
)
from utils.time import utcnow

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/project-registry", tags=["project-registry"])


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


# ========================================
# Project Member Management
# ========================================

VALID_ROLES = {"owner", "editor", "viewer"}


async def _check_project_manage_permission(project_id: str, current_user, session) -> None:
    """Admin 또는 project owner만 멤버 관리 가능."""
    from db.models import ProjectAccessModel

    is_admin = current_user.role == "admin" or current_user.is_admin
    if is_admin:
        return

    result = await session.execute(
        select(ProjectAccessModel).where(
            ProjectAccessModel.project_id == project_id,
            ProjectAccessModel.user_id == current_user.id,
            ProjectAccessModel.role == "owner",
        )
    )
    if not result.scalar_one_or_none():
        raise HTTPException(status_code=403, detail="Project owner or admin required")


@router.get("/{project_id}/members", response_model=ProjectMemberListResponse)
async def list_project_members(
    project_id: str,
    current_user: UserModel = Depends(get_current_user),
) -> ProjectMemberListResponse:
    """프로젝트 멤버 목록 조회. Admin 또는 project owner만 가능."""
    import os

    if os.getenv("USE_DATABASE", "false").lower() != "true":
        raise HTTPException(status_code=503, detail="Database mode is not enabled")

    from db.database import async_session_factory
    from db.models import ProjectAccessModel, ProjectModel
    from db.models import UserModel as UserModelDB

    async with async_session_factory() as session:
        proj = await session.execute(select(ProjectModel).where(ProjectModel.id == project_id))
        if not proj.scalar_one_or_none():
            raise HTTPException(status_code=404, detail=f"Project not found: {project_id}")

        await _check_project_manage_permission(project_id, current_user, session)

        result = await session.execute(
            select(ProjectAccessModel, UserModelDB)
            .join(UserModelDB, ProjectAccessModel.user_id == UserModelDB.id, isouter=True)
            .where(ProjectAccessModel.project_id == project_id)
            .order_by(ProjectAccessModel.created_at)
        )
        rows = result.all()

        members = [
            ProjectMemberResponse(
                user_id=access.user_id,
                role=access.role,
                email=user.email if user else None,
                name=user.name if user else None,
                granted_by=access.granted_by,
                created_at=access.created_at.isoformat() if access.created_at else None,
            )
            for access, user in rows
        ]
        return ProjectMemberListResponse(members=members, total_count=len(members))


@router.post("/{project_id}/members", response_model=ProjectMemberResponse, status_code=201)
async def add_project_member(
    project_id: str,
    request: ProjectMemberAdd,
    current_user: UserModel = Depends(get_current_user),
) -> ProjectMemberResponse:
    """프로젝트에 멤버 추가. Admin 또는 project owner만 가능."""
    import os

    if os.getenv("USE_DATABASE", "false").lower() != "true":
        raise HTTPException(status_code=503, detail="Database mode is not enabled")

    if request.role not in VALID_ROLES:
        raise HTTPException(
            status_code=400, detail=f"Invalid role. Must be one of: {', '.join(VALID_ROLES)}"
        )

    from db.database import async_session_factory
    from db.models import ProjectAccessModel, ProjectModel
    from db.models import UserModel as UserModelDB

    async with async_session_factory() as session:
        proj = await session.execute(select(ProjectModel).where(ProjectModel.id == project_id))
        if not proj.scalar_one_or_none():
            raise HTTPException(status_code=404, detail=f"Project not found: {project_id}")

        await _check_project_manage_permission(project_id, current_user, session)

        user_result = await session.execute(
            select(UserModelDB).where(UserModelDB.id == request.user_id)
        )
        target_user = user_result.scalar_one_or_none()
        if not target_user:
            raise HTTPException(status_code=404, detail=f"User not found: {request.user_id}")

        # 프로젝트에 org_id가 있으면, 추가할 유저도 같은 org 멤버인지 검증
        proj_org_result = await session.execute(
            select(ProjectModel).where(ProjectModel.id == project_id)
        )
        proj_org = proj_org_result.scalar_one_or_none()
        if proj_org and proj_org.organization_id:
            from sqlalchemy import and_

            from db.models import OrganizationMemberModel

            org_mem_result = await session.execute(
                select(OrganizationMemberModel).where(
                    and_(
                        OrganizationMemberModel.organization_id == proj_org.organization_id,
                        OrganizationMemberModel.user_id == request.user_id,
                        OrganizationMemberModel.is_active == True,  # noqa: E712
                    )
                )
            )
            is_org_member = org_mem_result.scalar_one_or_none() is not None

            if not is_org_member:
                raise HTTPException(
                    status_code=400,
                    detail="해당 유저는 프로젝트의 조직에 속하지 않습니다. 먼저 조직에 초대해 주세요.",
                )

        existing = await session.execute(
            select(ProjectAccessModel).where(
                ProjectAccessModel.project_id == project_id,
                ProjectAccessModel.user_id == request.user_id,
            )
        )
        if existing.scalar_one_or_none():
            raise HTTPException(status_code=409, detail="User is already a member of this project")

        access = ProjectAccessModel(
            id=str(uuid.uuid4()),
            project_id=project_id,
            user_id=request.user_id,
            role=request.role,
            granted_by=current_user.id,
        )
        session.add(access)
        await session.commit()
        await session.refresh(access)

        return ProjectMemberResponse(
            user_id=access.user_id,
            role=access.role,
            email=target_user.email,
            name=target_user.name,
            granted_by=access.granted_by,
            created_at=access.created_at.isoformat() if access.created_at else None,
        )


@router.patch("/{project_id}/members/{user_id}", response_model=ProjectMemberResponse)
async def update_project_member_role(
    project_id: str,
    user_id: str,
    request: ProjectMemberUpdate,
    current_user: UserModel = Depends(get_current_user),
) -> ProjectMemberResponse:
    """멤버 역할 변경. Admin 또는 project owner만 가능."""
    import os

    if os.getenv("USE_DATABASE", "false").lower() != "true":
        raise HTTPException(status_code=503, detail="Database mode is not enabled")

    if request.role not in VALID_ROLES:
        raise HTTPException(
            status_code=400, detail=f"Invalid role. Must be one of: {', '.join(VALID_ROLES)}"
        )

    from db.database import async_session_factory
    from db.models import ProjectAccessModel
    from db.models import UserModel as UserModelDB

    async with async_session_factory() as session:
        await _check_project_manage_permission(project_id, current_user, session)

        result = await session.execute(
            select(ProjectAccessModel).where(
                ProjectAccessModel.project_id == project_id,
                ProjectAccessModel.user_id == user_id,
            )
        )
        access = result.scalar_one_or_none()
        if not access:
            raise HTTPException(status_code=404, detail="Member not found in this project")

        access.role = request.role
        await session.commit()
        await session.refresh(access)

        user_result = await session.execute(select(UserModelDB).where(UserModelDB.id == user_id))
        user = user_result.scalar_one_or_none()

        return ProjectMemberResponse(
            user_id=access.user_id,
            role=access.role,
            email=user.email if user else None,
            name=user.name if user else None,
            granted_by=access.granted_by,
            created_at=access.created_at.isoformat() if access.created_at else None,
        )


@router.delete("/{project_id}/members/{user_id}")
async def remove_project_member(
    project_id: str,
    user_id: str,
    current_user: UserModel = Depends(get_current_user),
) -> dict:
    """멤버 제거. Admin 또는 project owner만 가능. 마지막 owner는 제거 불가."""
    import os

    if os.getenv("USE_DATABASE", "false").lower() != "true":
        raise HTTPException(status_code=503, detail="Database mode is not enabled")

    from db.database import async_session_factory
    from db.models import ProjectAccessModel

    async with async_session_factory() as session:
        await _check_project_manage_permission(project_id, current_user, session)

        result = await session.execute(
            select(ProjectAccessModel).where(
                ProjectAccessModel.project_id == project_id,
                ProjectAccessModel.user_id == user_id,
            )
        )
        access = result.scalar_one_or_none()
        if not access:
            raise HTTPException(status_code=404, detail="Member not found in this project")

        # 마지막 owner 제거 방지
        if access.role == "owner":
            owner_count_result = await session.execute(
                select(ProjectAccessModel).where(
                    ProjectAccessModel.project_id == project_id,
                    ProjectAccessModel.role == "owner",
                )
            )
            owners = owner_count_result.scalars().all()
            if len(owners) <= 1:
                raise HTTPException(
                    status_code=400, detail="Cannot remove the last owner of a project"
                )

        await session.delete(access)
        await session.commit()

        return {"success": True, "message": f"Member {user_id} removed from project {project_id}"}


@router.get("/{project_id}/available-members", response_model=OrgMemberListResponse)
async def list_available_org_members(
    project_id: str,
    current_user: UserModel = Depends(get_current_user),
) -> OrgMemberListResponse:
    """프로젝트에 추가 가능한 조직 멤버 목록 반환.

    프로젝트의 organization_id로 org 멤버를 조회하되,
    이미 ProjectAccess에 있는 유저는 제외한다.
    Admin/owner만 호출 가능.
    """
    import os

    if os.getenv("USE_DATABASE", "false").lower() != "true":
        raise HTTPException(status_code=503, detail="Database mode is not enabled")

    from sqlalchemy import and_, select

    from db.database import async_session_factory
    from db.models import OrganizationMemberModel, ProjectAccessModel, ProjectModel
    from db.models import UserModel as UserModelDB

    is_system_admin = current_user.role == "admin" or current_user.is_admin

    async with async_session_factory() as session:
        # 프로젝트 존재 확인
        proj_result = await session.execute(
            select(ProjectModel).where(ProjectModel.id == project_id)
        )
        project = proj_result.scalar_one_or_none()
        if not project:
            raise HTTPException(status_code=404, detail=f"Project not found: {project_id}")

        # 권한 확인: system admin 또는 프로젝트 org의 admin/owner
        if not is_system_admin:
            admin_org_ids = await _get_admin_org_ids(current_user)
            if project.organization_id not in admin_org_ids:
                raise HTTPException(status_code=403, detail="Project owner or admin required")

        # 이미 프로젝트에 속한 user_id 집합
        existing_result = await session.execute(
            select(ProjectAccessModel.user_id).where(ProjectAccessModel.project_id == project_id)
        )
        existing_user_ids = {row[0] for row in existing_result.all()}

        org_id = project.organization_id
        if not org_id:
            return OrgMemberListResponse(members=[], total_count=0)

        # DB org 멤버 조회 (UserModel과 join)
        members_result = await session.execute(
            select(OrganizationMemberModel, UserModelDB)
            .join(UserModelDB, OrganizationMemberModel.user_id == UserModelDB.id, isouter=True)
            .where(
                and_(
                    OrganizationMemberModel.organization_id == org_id,
                    OrganizationMemberModel.is_active == True,  # noqa: E712
                )
            )
        )
        rows = members_result.all()

        available = []
        seen_user_ids = set()

        for mem, user in rows:
            if mem.user_id in existing_user_ids:
                continue
            if mem.user_id in seen_user_ids:
                continue
            seen_user_ids.add(mem.user_id)
            available.append(
                OrgMemberForProject(
                    user_id=mem.user_id,
                    email=mem.email,
                    name=user.name if user else mem.name,
                    org_role=mem.role,
                )
            )

        return OrgMemberListResponse(members=available, total_count=len(available))
