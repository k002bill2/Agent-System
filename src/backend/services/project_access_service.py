"""Project-level access control (RBAC) service."""

import uuid

from sqlalchemy import and_, delete, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from db.models import ProjectAccessModel


class ProjectAccessService:
    """Service for managing project-level access control."""

    @staticmethod
    async def grant_access(
        db: AsyncSession,
        project_id: str,
        user_id: str,
        role: str,
        granted_by: str | None = None,
    ) -> ProjectAccessModel:
        """Grant a user access to a project with the specified role.

        Raises ValueError if the user already has access.
        """
        # Check existing access
        existing = await ProjectAccessService.check_access(db, project_id, user_id)
        if existing is not None:
            raise ValueError(
                f"User {user_id} already has '{existing}' access to project {project_id}"
            )

        access = ProjectAccessModel(
            id=str(uuid.uuid4()),
            project_id=project_id,
            user_id=user_id,
            role=role,
            granted_by=granted_by,
        )
        db.add(access)
        await db.flush()
        return access

    @staticmethod
    async def revoke_access(
        db: AsyncSession,
        project_id: str,
        user_id: str,
    ) -> bool:
        """Revoke a user's access to a project. Returns True if access was revoked."""
        result = await db.execute(
            delete(ProjectAccessModel).where(
                and_(
                    ProjectAccessModel.project_id == project_id,
                    ProjectAccessModel.user_id == user_id,
                )
            )
        )
        return result.rowcount > 0

    @staticmethod
    async def update_role(
        db: AsyncSession,
        project_id: str,
        user_id: str,
        new_role: str,
    ) -> ProjectAccessModel:
        """Update a user's role in a project. Raises ValueError if no access found."""
        result = await db.execute(
            select(ProjectAccessModel).where(
                and_(
                    ProjectAccessModel.project_id == project_id,
                    ProjectAccessModel.user_id == user_id,
                )
            )
        )
        access = result.scalar_one_or_none()
        if not access:
            raise ValueError(f"User {user_id} has no access to project {project_id}")

        access.role = new_role
        await db.flush()
        return access

    @staticmethod
    async def list_members(
        db: AsyncSession,
        project_id: str,
    ) -> list[ProjectAccessModel]:
        """List all members with access to a project."""
        result = await db.execute(
            select(ProjectAccessModel)
            .where(ProjectAccessModel.project_id == project_id)
            .order_by(ProjectAccessModel.created_at)
        )
        return list(result.scalars().all())

    @staticmethod
    async def check_access(
        db: AsyncSession,
        project_id: str,
        user_id: str,
    ) -> str | None:
        """Check a user's role in a project. Returns role string or None."""
        result = await db.execute(
            select(ProjectAccessModel.role).where(
                and_(
                    ProjectAccessModel.project_id == project_id,
                    ProjectAccessModel.user_id == user_id,
                )
            )
        )
        row = result.scalar_one_or_none()
        return row

    @staticmethod
    async def has_any_access_control(
        db: AsyncSession,
        project_id: str,
    ) -> bool:
        """Check if a project has any access control records.

        If False, the project is open to all authenticated users (backward compatible).
        """
        result = await db.execute(
            select(func.count())
            .select_from(ProjectAccessModel)
            .where(ProjectAccessModel.project_id == project_id)
        )
        count = result.scalar()
        return (count or 0) > 0

    @staticmethod
    async def get_accessible_project_ids(
        db: AsyncSession,
        user_id: str,
    ) -> list[str]:
        """Get list of project IDs the user has explicit access to.

        Returns list of project IDs the user has been explicitly granted access to.
        Returns an empty list if the user has no explicit access records.
        Projects with no ACL at all (public) are handled separately by the caller.
        """
        result = await db.execute(
            select(ProjectAccessModel.project_id).where(ProjectAccessModel.user_id == user_id)
        )
        project_ids = list(result.scalars().all())
        return project_ids
