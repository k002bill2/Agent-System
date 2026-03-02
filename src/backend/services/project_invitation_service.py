"""Project invitation service for email-based membership."""

import secrets
import uuid
from datetime import timedelta

from sqlalchemy import and_, select
from sqlalchemy.ext.asyncio import AsyncSession

from db.models import ProjectAccessModel, ProjectInvitationModel
from utils.time import utcnow

INVITATION_EXPIRE_DAYS = 7


class ProjectInvitationService:
    """Service for managing project invitations."""

    @staticmethod
    async def create_invitation(
        db: AsyncSession,
        project_id: str,
        invited_by: str,
        email: str,
        role: str,
    ) -> ProjectInvitationModel:
        """이메일로 프로젝트 초대 생성. 기존 pending 초대가 있으면 갱신."""
        result = await db.execute(
            select(ProjectInvitationModel).where(
                and_(
                    ProjectInvitationModel.project_id == project_id,
                    ProjectInvitationModel.email == email,
                    ProjectInvitationModel.status == "pending",
                )
            )
        )
        existing = result.scalar_one_or_none()
        if existing:
            existing.token = secrets.token_urlsafe(48)
            existing.role = role
            existing.expires_at = utcnow() + timedelta(days=INVITATION_EXPIRE_DAYS)
            existing.updated_at = utcnow()
            await db.flush()
            return existing

        invitation = ProjectInvitationModel(
            id=str(uuid.uuid4()),
            project_id=project_id,
            invited_by=invited_by,
            email=email,
            role=role,
            token=secrets.token_urlsafe(48),
            status="pending",
            expires_at=utcnow() + timedelta(days=INVITATION_EXPIRE_DAYS),
        )
        db.add(invitation)
        await db.flush()
        return invitation

    @staticmethod
    async def get_by_token(
        db: AsyncSession,
        token: str,
    ) -> ProjectInvitationModel | None:
        """토큰으로 초대 조회."""
        result = await db.execute(
            select(ProjectInvitationModel).where(ProjectInvitationModel.token == token)
        )
        return result.scalar_one_or_none()

    @staticmethod
    async def accept_invitation(
        db: AsyncSession,
        token: str,
        user_id: str,
        user_email: str,
    ) -> ProjectAccessModel:
        """초대 수락: project_access 등록 + status → accepted."""
        inv = await ProjectInvitationService.get_by_token(db, token)
        if not inv:
            raise ValueError("유효하지 않은 초대 토큰입니다")
        if inv.status != "pending":
            raise ValueError(f"이미 처리된 초대입니다: {inv.status}")
        if inv.expires_at < utcnow():
            inv.status = "expired"
            await db.flush()
            raise ValueError("만료된 초대입니다")
        if inv.email.lower() != user_email.lower():
            raise ValueError("이메일이 일치하지 않습니다")

        from services.project_access_service import ProjectAccessService

        try:
            access = await ProjectAccessService.grant_access(
                db=db,
                project_id=inv.project_id,
                user_id=user_id,
                role=inv.role,
                granted_by=inv.invited_by,
            )
        except ValueError:
            result = await db.execute(
                select(ProjectAccessModel).where(
                    and_(
                        ProjectAccessModel.project_id == inv.project_id,
                        ProjectAccessModel.user_id == user_id,
                    )
                )
            )
            access = result.scalar_one()

        inv.status = "accepted"
        await db.flush()
        return access

    @staticmethod
    async def list_pending(
        db: AsyncSession,
        project_id: str,
    ) -> list[ProjectInvitationModel]:
        """프로젝트의 pending 초대 목록 조회."""
        result = await db.execute(
            select(ProjectInvitationModel)
            .where(
                and_(
                    ProjectInvitationModel.project_id == project_id,
                    ProjectInvitationModel.status == "pending",
                )
            )
            .order_by(ProjectInvitationModel.created_at.desc())
        )
        return list(result.scalars().all())

    @staticmethod
    async def cancel_invitation(
        db: AsyncSession,
        invitation_id: str,
        project_id: str,
    ) -> bool:
        """초대 취소 (status → expired)."""
        result = await db.execute(
            select(ProjectInvitationModel).where(
                and_(
                    ProjectInvitationModel.id == invitation_id,
                    ProjectInvitationModel.project_id == project_id,
                    ProjectInvitationModel.status == "pending",
                )
            )
        )
        inv = result.scalar_one_or_none()
        if not inv:
            return False
        inv.status = "expired"
        await db.flush()
        return True
