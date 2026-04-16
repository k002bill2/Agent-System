"""Config version model for database persistence."""

from db.models.base import (
    JSONB,
    Base,
    Column,
    DateTime,
    Index,
    Integer,
    String,
    Text,
    UniqueConstraint,
    datetime,
    timezone,
)


class ConfigVersionModel(Base):
    """Configuration version snapshot stored in database."""

    __tablename__ = "config_versions"

    id = Column(String(36), primary_key=True)

    # Version identity
    config_type = Column(String(50), nullable=False, index=True)
    config_id = Column(String(36), nullable=False, index=True)
    version = Column(Integer, nullable=False)
    label = Column(String(255), nullable=True)

    # Content
    data = Column(JSONB, nullable=False)
    diff_from_previous = Column(JSONB, nullable=True)

    # Metadata
    status = Column(String(20), nullable=False, default="active")
    changes_summary = Column(Text, nullable=True)
    created_by = Column(String(36), nullable=True)
    description = Column(Text, nullable=True)

    # Rollback tracking
    rolled_back_from = Column(String(36), nullable=True)
    rolled_back_at = Column(DateTime, nullable=True)

    # Timestamps
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc).replace(tzinfo=None))

    __table_args__ = (
        UniqueConstraint("config_type", "config_id", "version", name="uq_config_version"),
        Index("ix_config_versions_type_id", "config_type", "config_id"),
        Index("ix_config_versions_created", "created_at"),
    )
