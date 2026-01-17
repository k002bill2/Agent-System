"""SQLAlchemy models for database persistence."""

from datetime import datetime
from typing import Any

from sqlalchemy import (
    Column,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
    Float,
    Boolean,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import relationship

from db.database import Base


class SessionModel(Base):
    """Session model for storing orchestration sessions."""

    __tablename__ = "sessions"

    id = Column(String(36), primary_key=True)
    user_id = Column(String(255), nullable=True, index=True)
    project_id = Column(String(36), nullable=True, index=True)

    # Session state stored as JSON
    state_json = Column(JSONB, nullable=False, default=dict)

    # Metadata
    status = Column(String(50), default="active", index=True)
    created_at = Column(DateTime, default=datetime.utcnow, index=True)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    # Cost tracking
    total_tokens = Column(Integer, default=0)
    total_cost_usd = Column(Float, default=0.0)

    # Relationships
    tasks = relationship("TaskModel", back_populates="session", cascade="all, delete-orphan")
    messages = relationship("MessageModel", back_populates="session", cascade="all, delete-orphan")

    __table_args__ = (
        Index("ix_sessions_user_project", "user_id", "project_id"),
        Index("ix_sessions_status_created", "status", "created_at"),
    )


class TaskModel(Base):
    """Task model for storing task history."""

    __tablename__ = "tasks"

    id = Column(String(36), primary_key=True)
    session_id = Column(String(36), ForeignKey("sessions.id", ondelete="CASCADE"), nullable=False, index=True)
    parent_id = Column(String(36), ForeignKey("tasks.id", ondelete="SET NULL"), nullable=True, index=True)

    # Task content
    title = Column(String(500), nullable=False)
    description = Column(Text, nullable=True)
    status = Column(String(50), default="pending", index=True)

    # Execution details
    assigned_agent = Column(String(100), nullable=True)
    result_json = Column(JSONB, nullable=True)
    error = Column(Text, nullable=True)

    # Retry tracking
    retry_count = Column(Integer, default=0)
    max_retries = Column(Integer, default=3)

    # Dependencies stored as JSON array of task IDs
    dependencies = Column(JSONB, default=list)

    # Timestamps
    created_at = Column(DateTime, default=datetime.utcnow, index=True)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    started_at = Column(DateTime, nullable=True)
    completed_at = Column(DateTime, nullable=True)

    # Relationships
    session = relationship("SessionModel", back_populates="tasks")
    parent = relationship("TaskModel", remote_side=[id], backref="children")

    __table_args__ = (
        Index("ix_tasks_session_status", "session_id", "status"),
        Index("ix_tasks_session_parent", "session_id", "parent_id"),
    )


class MessageModel(Base):
    """Message model for storing conversation history."""

    __tablename__ = "messages"

    id = Column(String(36), primary_key=True)
    session_id = Column(String(36), ForeignKey("sessions.id", ondelete="CASCADE"), nullable=False, index=True)

    # Message content
    role = Column(String(50), nullable=False)  # user, assistant, system
    content = Column(Text, nullable=False)
    message_type = Column(String(50), nullable=True)  # thinking, action, error, etc.

    # Optional metadata
    agent_id = Column(String(100), nullable=True)
    tool_name = Column(String(100), nullable=True)
    tool_args = Column(JSONB, nullable=True)
    tool_result = Column(JSONB, nullable=True)

    # Token usage for this message
    input_tokens = Column(Integer, nullable=True)
    output_tokens = Column(Integer, nullable=True)

    # Timestamps
    timestamp = Column(DateTime, default=datetime.utcnow, index=True)

    # Relationships
    session = relationship("SessionModel", back_populates="messages")

    __table_args__ = (
        Index("ix_messages_session_timestamp", "session_id", "timestamp"),
    )


class ApprovalModel(Base):
    """Approval model for storing HITL approval history."""

    __tablename__ = "approvals"

    id = Column(String(36), primary_key=True)
    session_id = Column(String(36), ForeignKey("sessions.id", ondelete="CASCADE"), nullable=False, index=True)
    task_id = Column(String(36), ForeignKey("tasks.id", ondelete="SET NULL"), nullable=True)

    # Approval details
    tool_name = Column(String(100), nullable=False)
    tool_args = Column(JSONB, nullable=False)
    risk_level = Column(String(20), nullable=False)  # low, medium, high, critical
    risk_description = Column(Text, nullable=True)

    # Status
    status = Column(String(20), default="pending", index=True)  # pending, approved, denied
    approved_by = Column(String(255), nullable=True)
    denial_reason = Column(Text, nullable=True)

    # Timestamps
    created_at = Column(DateTime, default=datetime.utcnow, index=True)
    resolved_at = Column(DateTime, nullable=True)

    __table_args__ = (
        Index("ix_approvals_session_status", "session_id", "status"),
    )
