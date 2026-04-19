"""Playground session model for database persistence."""

from db.models.base import (
    JSONB,
    Base,
    Boolean,
    Column,
    DateTime,
    Float,
    Integer,
    String,
    Text,
    datetime,
    timezone,
)


class PlaygroundSessionModel(Base):
    """Playground session stored in database."""

    __tablename__ = "playground_sessions"

    id = Column(String(36), primary_key=True)
    name = Column(String(255), default="Untitled Session")
    description = Column(Text, default="")

    # Owner
    user_id = Column(String(36), nullable=True, index=True)

    # Project context
    project_id = Column(String(36), nullable=True)
    working_directory = Column(String(1000), nullable=True)

    # Settings
    agent_id = Column(String(255), nullable=True)
    model = Column(String(100), default="")
    temperature = Column(Float, default=0.7)
    max_tokens = Column(Integer, default=4096)
    system_prompt = Column(Text, nullable=True)
    rag_enabled = Column(Boolean, default=False)
    # How many chunks to retrieve per RAG query (UI slider 1-20)
    rag_k = Column(Integer, default=5, nullable=False, server_default="5")
    # Per-session overrides for env flags (NULL = follow env)
    rag_hybrid_override = Column(Boolean, nullable=True)
    rag_rerank_override = Column(Boolean, nullable=True)
    # Include results from OTHER project collections (cross-project RAG)
    rag_include_shared = Column(Boolean, default=False, nullable=False, server_default="false")

    # Tools
    available_tools = Column(JSONB, default=list)
    enabled_tools = Column(JSONB, default=list)

    # Conversation data (stored as JSONB arrays)
    messages = Column(JSONB, default=list)
    executions = Column(JSONB, default=list)

    # Metrics
    total_executions = Column(Integer, default=0)
    total_tokens = Column(Integer, default=0)
    total_cost = Column(Float, default=0.0)

    # Timestamps
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    updated_at = Column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
    )
