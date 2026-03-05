"""Claude Code external session snapshot model for database persistence."""

from db.models.base import (
    Base,
    Column,
    DateTime,
    Float,
    Index,
    Integer,
    String,
    Text,
    datetime,
    timezone,
)


class ClaudeSessionSnapshotModel(Base):
    """Snapshot of a Claude Code external session saved to database.

    This stores metadata from filesystem-based Claude Code sessions
    for long-term storage and analysis. Unlike SessionModel (for internal
    orchestration), this captures external Claude Code session monitoring data.
    """

    __tablename__ = "claude_session_snapshots"

    # Primary key: uses the Claude Code session UUID
    id = Column(String(36), primary_key=True)

    # Session identity
    slug = Column(String(255), nullable=True)
    model = Column(String(100), nullable=True)
    project_path = Column(String(1000), nullable=True)
    project_name = Column(String(255), nullable=True, index=True)
    git_branch = Column(String(200), nullable=True)
    cwd = Column(String(1000), nullable=True)
    version = Column(String(50), nullable=True)
    status = Column(String(20), nullable=True, index=True)

    # Source tracking
    source_user = Column(String(255), nullable=True, index=True)
    source_path = Column(String(1000), nullable=True)

    # Message counts
    message_count = Column(Integer, default=0)
    user_message_count = Column(Integer, default=0)
    assistant_message_count = Column(Integer, default=0)
    tool_call_count = Column(Integer, default=0)

    # Token/Cost tracking
    total_input_tokens = Column(Integer, default=0)
    total_output_tokens = Column(Integer, default=0)
    estimated_cost = Column(Float, default=0.0)

    # File metadata
    file_path = Column(String(1000), nullable=True)
    file_size = Column(Integer, default=0)

    # AI-generated summary
    summary = Column(Text, nullable=True)

    # User notes (from save request)
    notes = Column(Text, nullable=True)

    # Original timestamps from the Claude Code session
    session_created_at = Column(DateTime(timezone=True), nullable=True)
    session_last_activity = Column(DateTime(timezone=True), nullable=True)

    # Snapshot timestamps
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), index=True)
    updated_at = Column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
    )

    __table_args__ = (
        Index("ix_claude_snapshots_project_created", "project_name", "created_at"),
        Index("ix_claude_snapshots_source_user", "source_user", "created_at"),
    )
