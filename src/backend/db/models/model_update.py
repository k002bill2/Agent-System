"""LLM model update log models."""

from sqlalchemy.dialects.postgresql import JSONB

from db.models.base import (
    Base,
    Boolean,
    Column,
    DateTime,
    Integer,
    String,
    Text,
    datetime,
    timezone,
    uuid,
)


class ModelUpdateLogModel(Base):
    """Log of periodic LLM model update checks.

    Each row represents one check cycle — what was discovered,
    what changed, and what was applied.
    """

    __tablename__ = "llm_model_update_logs"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    # Which provider was checked (anthropic, google, openai, or "all")
    provider = Column(String(50), nullable=False, index=True)
    # Check result status: success, partial, failed
    status = Column(String(20), nullable=False, default="success")
    # Number of models discovered from provider API
    models_discovered = Column(Integer, nullable=False, default=0)
    # Number of new models not in registry
    new_models_found = Column(Integer, nullable=False, default=0)
    # Number of existing models with metadata changes
    updates_found = Column(Integer, nullable=False, default=0)
    # Number of changes actually applied
    updates_applied = Column(Integer, nullable=False, default=0)
    # Whether this was a manual trigger or scheduled
    is_manual = Column(Boolean, default=False, nullable=False)
    # Detailed changes as JSON
    # Format: { "new": [...], "updated": [...], "errors": [...] }
    changes = Column(JSONB, nullable=True)
    # Error message if check failed
    error_message = Column(Text, nullable=True)
    # Who triggered (user_id for manual, "scheduler" for automatic)
    triggered_by = Column(String(255), nullable=True)

    checked_at = Column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        nullable=False,
    )
