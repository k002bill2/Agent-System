"""members 관련 Project Registry API 라우트.

프로젝트 멤버 관리(목록·추가·역할 변경·제거)와 조직 멤버 후보 조회.
"""

import uuid

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select

from api.deps import get_current_user
from db.models import UserModel
from models.project import (
    OrgMemberForProject,
    OrgMemberListResponse,
    ProjectMemberAdd,
    ProjectMemberListResponse,
    ProjectMemberResponse,
    ProjectMemberUpdate,
)

from ._shared import _get_admin_org_ids

router = APIRouter()


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
