"""Session activity and task analysis models."""

from db.models.base import (
    Base,
    Boolean,
    Column,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    JSONB,
    String,
    Text,
    UniqueConstraint,
    datetime,
)


class TaskAnalysisModel(Base):
    """Task analysis model for storing task analysis history."""

    __tablename__ = "task_analyses"

    id = Column(String(36), primary_key=True)
    project_id = Column(String(36), nullable=True, index=True)
    user_id = Column(String(36), nullable=True, index=True)

    # Task input
    task_input = Column(Text, nullable=False)
    context_json = Column(JSONB, nullable=True, default=dict)

    # Analysis result
    success = Column(Boolean, nullable=False)
    analysis_json = Column(JSONB, nullable=True)
    error = Column(Text, nullable=True)

    # Summary fields
    execution_time_ms = Column(Integer, default=0)
    complexity_score = Column(Integer, nullable=True)
    effort_level = Column(String(20), nullable=True)
    subtask_count = Column(Integer, nullable=True)
    strategy = Column(String(20), nullable=True)

    # Timestamps
    created_at = Column(DateTime, default=datetime.utcnow, index=True)

    __table_args__ = (
        Index("ix_task_analyses_project_created", "project_id", "created_at"),
        Index("ix_task_analyses_user_created", "user_id", "created_at"),
    )


class SessionActivityModel(Base):
    """Session activity model for tracking user/agent activities."""

    __tablename__ = "session_activities"

    id = Column(String(36), primary_key=True)
    session_id = Column(
        String(36), ForeignKey("sessions.id", ondelete="CASCADE"), nullable=False, index=True
    )

    # Activity details
    activity_type = Column(String(50), nullable=False, index=True)
    actor_type = Column(String(20), default="user")
    actor_id = Column(String(100), nullable=True)

    # Activity data
    data = Column(JSONB, default=dict)

    # Timestamps
    created_at = Column(DateTime, default=datetime.utcnow, index=True)

    __table_args__ = (
        Index("ix_session_activity_session", "session_id", "created_at"),
        Index("ix_session_activity_type", "activity_type", "created_at"),
    )


class MenuVisibilityModel(Base):
    """Menu visibility settings per role."""

    __tablename__ = "menu_visibility"

    id = Column(Integer, primary_key=True, autoincrement=True)
    menu_key = Column(String(50), nullable=False)
    role = Column(String(20), nullable=False)
    visible = Column(Boolean, default=True)
    sort_order = Column(Integer, nullable=True)

    __table_args__ = (UniqueConstraint("menu_key", "role", name="uq_menu_role"),)
