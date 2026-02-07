"""Centralized quota enforcement service for organization limits."""

from pydantic import BaseModel

from models.organization import Organization


class QuotaCheckResult(BaseModel):
    """Result of a quota check."""

    allowed: bool
    current: int
    limit: int
    message: str = ""


class QuotaStatus(BaseModel):
    """Full quota status for an organization."""

    organization_id: str
    plan: str
    members: QuotaCheckResult
    projects: QuotaCheckResult
    sessions: QuotaCheckResult
    tokens: QuotaCheckResult


class QuotaService:
    """Central quota enforcement service.

    All quota checks go through this service to ensure consistent enforcement.
    A limit of -1 means unlimited (Enterprise plan).
    """

    @staticmethod
    def _is_unlimited(limit: int) -> bool:
        """Check if a limit is unlimited (-1)."""
        return limit < 0

    @staticmethod
    def check_member_quota(org: Organization) -> QuotaCheckResult:
        """Check if the organization can add another member."""
        if QuotaService._is_unlimited(org.max_members):
            return QuotaCheckResult(
                allowed=True,
                current=org.current_members,
                limit=org.max_members,
                message="Unlimited members (Enterprise)",
            )

        allowed = org.current_members < org.max_members
        return QuotaCheckResult(
            allowed=allowed,
            current=org.current_members,
            limit=org.max_members,
            message="" if allowed else f"Member limit reached ({org.max_members})",
        )

    @staticmethod
    def check_project_quota(org: Organization) -> QuotaCheckResult:
        """Check if the organization can add another project."""
        if QuotaService._is_unlimited(org.max_projects):
            return QuotaCheckResult(
                allowed=True,
                current=org.current_projects,
                limit=org.max_projects,
                message="Unlimited projects (Enterprise)",
            )

        allowed = org.current_projects < org.max_projects
        return QuotaCheckResult(
            allowed=allowed,
            current=org.current_projects,
            limit=org.max_projects,
            message="" if allowed else f"Project limit reached ({org.max_projects})",
        )

    @staticmethod
    def check_session_quota(org: Organization, sessions_today: int) -> QuotaCheckResult:
        """Check if the organization can create another session today.

        Args:
            org: The organization to check
            sessions_today: Number of sessions created today for this org
        """
        if QuotaService._is_unlimited(org.max_sessions_per_day):
            return QuotaCheckResult(
                allowed=True,
                current=sessions_today,
                limit=org.max_sessions_per_day,
                message="Unlimited sessions (Enterprise)",
            )

        allowed = sessions_today < org.max_sessions_per_day
        return QuotaCheckResult(
            allowed=allowed,
            current=sessions_today,
            limit=org.max_sessions_per_day,
            message="" if allowed else f"Daily session limit reached ({org.max_sessions_per_day})",
        )

    @staticmethod
    def check_token_quota(org: Organization, additional_tokens: int = 0) -> QuotaCheckResult:
        """Check if the organization can use more tokens this month.

        Args:
            org: The organization to check
            additional_tokens: Tokens about to be consumed
        """
        if QuotaService._is_unlimited(org.max_tokens_per_month):
            return QuotaCheckResult(
                allowed=True,
                current=org.tokens_used_this_month,
                limit=org.max_tokens_per_month,
                message="Unlimited tokens (Enterprise)",
            )

        projected = org.tokens_used_this_month + additional_tokens
        allowed = projected <= org.max_tokens_per_month
        return QuotaCheckResult(
            allowed=allowed,
            current=org.tokens_used_this_month,
            limit=org.max_tokens_per_month,
            message="" if allowed else f"Monthly token limit reached ({org.max_tokens_per_month})",
        )

    @staticmethod
    def get_quota_status(org: Organization, sessions_today: int = 0) -> QuotaStatus:
        """Get full quota status for an organization.

        Args:
            org: The organization to check
            sessions_today: Number of sessions created today
        """
        return QuotaStatus(
            organization_id=org.id,
            plan=org.plan.value if hasattr(org.plan, "value") else str(org.plan),
            members=QuotaService.check_member_quota(org),
            projects=QuotaService.check_project_quota(org),
            sessions=QuotaService.check_session_quota(org, sessions_today),
            tokens=QuotaService.check_token_quota(org),
        )
