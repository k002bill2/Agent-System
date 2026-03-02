"""Feedback and Dataset models."""

from db.models.base import (
    JSONB,
    Base,
    Boolean,
    Column,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
    UniqueConstraint,
    datetime,
    timezone,
)


class FeedbackModel(Base):
    """Feedback model for storing RLHF feedback data."""

    __tablename__ = "feedbacks"

    id = Column(String(36), primary_key=True)
    session_id = Column(String(36), nullable=False, index=True)
    task_id = Column(String(36), nullable=True, index=True)
    message_id = Column(String(36), nullable=True)

    # Feedback details
    feedback_type = Column(String(50), nullable=False, index=True)
    reason = Column(String(50), nullable=True)
    reason_detail = Column(Text, nullable=True)

    # Content
    original_output = Column(Text, nullable=False)
    corrected_output = Column(Text, nullable=True)

    # Context
    context_json = Column(JSONB, nullable=True, default=dict)

    # Metadata
    agent_id = Column(String(100), nullable=True, index=True)
    project_name = Column(String(255), nullable=True)
    effort_level = Column(String(20), nullable=True)
    status = Column(String(20), default="pending", index=True)

    # Timestamps
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc), index=True)
    processed_at = Column(DateTime, nullable=True)

    __table_args__ = (
        Index("ix_feedbacks_session_type", "session_id", "feedback_type"),
        Index("ix_feedbacks_status_created", "status", "created_at"),
        Index("ix_feedbacks_agent_type", "agent_id", "feedback_type"),
    )


class DatasetEntryModel(Base):
    """Dataset entry model for Fine-tuning data."""

    __tablename__ = "dataset_entries"

    id = Column(String(36), primary_key=True)
    feedback_id = Column(
        String(36), ForeignKey("feedbacks.id", ondelete="CASCADE"), nullable=False, index=True
    )

    # Training data format
    system_prompt = Column(Text, nullable=False)
    user_input = Column(Text, nullable=False)
    assistant_output = Column(Text, nullable=False)

    # Classification
    is_positive = Column(Boolean, nullable=False, default=True)

    # Metadata
    metadata_json = Column(JSONB, nullable=True, default=dict)

    # Timestamps
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc), index=True)

    __table_args__ = (
        Index("ix_dataset_positive", "is_positive"),
        Index("ix_dataset_feedback", "feedback_id"),
    )


class TaskEvaluationModel(Base):
    """Task evaluation model for storing task-level RLHF evaluations."""

    __tablename__ = "task_evaluations"

    id = Column(String(36), primary_key=True)
    session_id = Column(String(36), nullable=False, index=True)
    task_id = Column(String(36), nullable=True, index=True)

    # Evaluation details
    rating = Column(Integer, nullable=False)
    result_accuracy = Column(Boolean, nullable=False, default=True)
    speed_satisfaction = Column(Boolean, nullable=False, default=True)
    comment = Column(Text, nullable=True)

    # Metadata
    agent_id = Column(String(100), nullable=True, index=True)
    context_summary = Column(Text, nullable=True)
    project_name = Column(String(255), nullable=True)
    effort_level = Column(String(20), nullable=True)

    # Timestamps
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc), index=True)

    __table_args__ = (
        UniqueConstraint("session_id", "task_id", name="uq_task_eval_session_task"),
        Index("ix_task_eval_agent_created", "agent_id", "created_at"),
        Index("ix_task_eval_rating", "rating"),
    )
