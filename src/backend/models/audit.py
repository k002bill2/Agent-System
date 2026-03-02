"""Enhanced audit models for compliance and integrity."""

from datetime import datetime

from utils.time import utcnow
from enum import Enum
from typing import Any

from pydantic import BaseModel, Field


class DataClassification(str, Enum):
    """Data classification levels for compliance."""

    PUBLIC = "public"
    INTERNAL = "internal"
    CONFIDENTIAL = "confidential"
    RESTRICTED = "restricted"


class RetentionPolicy(str, Enum):
    """Retention policy types."""

    STANDARD = "standard"  # 7 years (2555 days)
    EXTENDED = "extended"  # 10 years
    PERMANENT = "permanent"  # Never delete
    MINIMAL = "minimal"  # 1 year (for non-sensitive)


RETENTION_DAYS = {
    RetentionPolicy.STANDARD: 2555,  # 7 years
    RetentionPolicy.EXTENDED: 3650,  # 10 years
    RetentionPolicy.PERMANENT: -1,  # Never
    RetentionPolicy.MINIMAL: 365,  # 1 year
}


class ComplianceAuditEntry(BaseModel):
    """Extended audit entry with compliance fields."""

    # Base fields
    id: str
    session_id: str | None = None
    user_id: str | None = None
    action: str
    resource_type: str
    resource_id: str | None = None

    # Change tracking
    old_value: dict[str, Any] | None = None
    new_value: dict[str, Any] | None = None
    changes: dict[str, Any] | None = None

    # Context
    agent_id: str | None = None
    ip_address: str | None = None
    user_agent: str | None = None
    metadata: dict[str, Any] = Field(default_factory=dict)

    # Status
    status: str = "success"
    error_message: str | None = None

    # Compliance fields
    data_classification: DataClassification = DataClassification.INTERNAL
    change_reason: str | None = None
    compliance_flags: list[str] = Field(default_factory=list)  # PCI, HIPAA, GDPR, etc.

    # Hash chain for integrity
    previous_hash: str | None = None
    hash: str = ""
    signature: str | None = None  # Optional digital signature

    # Retention
    retention_days: int = 2555
    retention_policy: RetentionPolicy = RetentionPolicy.STANDARD
    expires_at: datetime | None = None

    # Timestamps
    created_at: datetime = Field(default_factory=utcnow)


class IntegrityVerificationResult(BaseModel):
    """Result of integrity verification."""

    verified: bool
    total_entries: int
    verified_entries: int
    failed_entries: list[str] = Field(default_factory=list)
    first_failure_id: str | None = None
    chain_start: datetime | None = None
    chain_end: datetime | None = None
    verification_time_ms: float = 0


class ComplianceReport(BaseModel):
    """Compliance report for audit logs."""

    generated_at: datetime = Field(default_factory=utcnow)
    report_period_start: datetime
    report_period_end: datetime

    # Statistics
    total_entries: int = 0
    entries_by_action: dict[str, int] = Field(default_factory=dict)
    entries_by_classification: dict[str, int] = Field(default_factory=dict)
    entries_by_compliance_flag: dict[str, int] = Field(default_factory=dict)

    # Integrity
    chain_integrity: IntegrityVerificationResult | None = None

    # Retention
    entries_approaching_expiry: int = 0
    entries_expired: int = 0

    # Access patterns
    unique_users: int = 0
    unique_sessions: int = 0
    high_risk_actions: list[dict] = Field(default_factory=list)


class RetentionApplyResult(BaseModel):
    """Result of applying retention policy."""

    success: bool
    policy: RetentionPolicy
    affected_entries: int = 0
    entries_marked_for_deletion: int = 0
    entries_extended: int = 0
    errors: list[str] = Field(default_factory=list)
