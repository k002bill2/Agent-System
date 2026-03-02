"""Audit log model."""

from db.models.base import (
    Base,
    Column,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    JSONB,
    String,
    Text,
    datetime,
    timezone,
)


class AuditLogModel(Base):
    """Audit log model for tracking all system actions."""

    __tablename__ = "audit_logs"

    id = Column(String(36), primary_key=True)
    session_id = Column(
        String(36), ForeignKey("sessions.id", ondelete="SET NULL"), nullable=True, index=True
    )
    user_id = Column(
        String(36), ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True
    )

    # Action details
    action = Column(String(100), nullable=False, index=True)
    resource_type = Column(String(50), nullable=False, index=True)
    resource_id = Column(String(36), nullable=True, index=True)

    # Change tracking
    old_value = Column(JSONB, nullable=True)
    new_value = Column(JSONB, nullable=True)
    changes = Column(JSONB, nullable=True)

    # Project scope
    project_id = Column(String(36), nullable=True, index=True)

    # Context
    agent_id = Column(String(100), nullable=True, index=True)
    ip_address = Column(String(45), nullable=True)
    user_agent = Column(String(500), nullable=True)

    # Additional metadata
    metadata_json = Column(JSONB, nullable=True, default=dict)

    # Result
    status = Column(String(20), default="success", index=True)
    error_message = Column(Text, nullable=True)

    # Compliance fields
    data_classification = Column(String(20), default="internal")
    change_reason = Column(Text, nullable=True)
    compliance_flags = Column(JSONB, default=list)

    # Hash chain for integrity
    previous_hash = Column(String(64), nullable=True)
    hash = Column(String(64), nullable=True)
    signature = Column(Text, nullable=True)

    # Retention
    retention_days = Column(Integer, default=2555)
    retention_policy = Column(String(20), default="standard")
    expires_at = Column(DateTime, nullable=True)

    # Timestamps
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc), index=True)

    __table_args__ = (
        Index("ix_audit_session_action", "session_id", "action"),
        Index("ix_audit_user_action", "user_id", "action"),
        Index("ix_audit_resource", "resource_type", "resource_id"),
        Index("ix_audit_created_action", "created_at", "action"),
        Index("ix_audit_project_action", "project_id", "action"),
        Index("ix_audit_classification", "data_classification"),
        Index("ix_audit_expires", "expires_at"),
    )
