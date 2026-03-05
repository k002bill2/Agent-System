"""Cost center and allocation models."""

from db.models.base import (
    JSONB,
    Base,
    Boolean,
    Column,
    DateTime,
    Float,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
    datetime,
    timezone,
)


class CostCenterModel(Base):
    """Cost center model for enterprise billing."""

    __tablename__ = "cost_centers"

    id = Column(String(36), primary_key=True)
    organization_id = Column(String(36), nullable=False, index=True)
    name = Column(String(255), nullable=False)
    code = Column(String(50), nullable=False, unique=True)
    description = Column(Text, nullable=True)

    # Budget settings
    budget_usd = Column(Float, nullable=True)
    budget_period = Column(String(20), default="monthly")
    alert_threshold_percent = Column(Float, default=80.0)

    # Metadata
    tags = Column(JSONB, default=dict)
    owner_id = Column(String(36), nullable=True)
    parent_id = Column(
        String(36), ForeignKey("cost_centers.id", ondelete="SET NULL"), nullable=True
    )

    # Status
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    updated_at = Column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
    )

    __table_args__ = (
        Index("ix_cost_centers_org", "organization_id"),
        Index("ix_cost_centers_active", "is_active"),
    )


class CostAllocationModel(Base):
    """Cost allocation model for session cost tracking."""

    __tablename__ = "cost_allocations"

    id = Column(String(36), primary_key=True)
    session_id = Column(
        String(36), ForeignKey("sessions.id", ondelete="CASCADE"), nullable=False, index=True
    )
    project_id = Column(String(36), nullable=True, index=True)
    cost_center_id = Column(
        String(36), ForeignKey("cost_centers.id", ondelete="SET NULL"), nullable=True, index=True
    )
    user_id = Column(
        String(36), ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True
    )

    # Cost breakdown
    total_cost_usd = Column(Float, default=0.0)
    input_tokens = Column(Integer, default=0)
    output_tokens = Column(Integer, default=0)
    model_costs = Column(JSONB, default=dict)

    # Allocation metadata
    allocation_tags = Column(JSONB, default=dict)
    allocation_percent = Column(Float, default=100.0)

    # Timestamps
    period_start = Column(DateTime(timezone=True), nullable=True)
    period_end = Column(DateTime(timezone=True), nullable=True)
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), index=True)

    __table_args__ = (
        Index("ix_cost_allocations_center", "cost_center_id", "created_at"),
        Index("ix_cost_allocations_project", "project_id", "created_at"),
        Index("ix_cost_allocations_user", "user_id", "created_at"),
    )
