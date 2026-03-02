"""Workflow automation models."""

from db.models.base import (
    JSONB,
    Base,
    Boolean,
    Column,
    DateTime,
    EncryptedString,
    Float,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
    UniqueConstraint,
    datetime,
    relationship,
    timezone,
)


class WorkflowDefinitionModel(Base):
    """Workflow definition model for storing workflow configurations."""

    __tablename__ = "workflow_definitions"

    id = Column(String(36), primary_key=True)
    project_id = Column(String(36), nullable=True, index=True)
    name = Column(String(255), nullable=False)
    description = Column(Text, default="")
    status = Column(String(20), default="active", index=True)
    definition = Column(JSONB, nullable=False, default=dict)
    yaml_content = Column(Text, nullable=True)
    env = Column(JSONB, default=dict)
    version = Column(Integer, default=1)
    created_by = Column(String(36), nullable=True)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc), index=True)
    updated_at = Column(
        DateTime,
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
    )
    last_run_at = Column(DateTime, nullable=True)
    last_run_status = Column(String(20), nullable=True)

    runs = relationship("WorkflowRunModel", back_populates="workflow", cascade="all, delete-orphan")

    __table_args__ = (Index("ix_workflow_defs_project_status", "project_id", "status"),)


class WorkflowRunModel(Base):
    """Workflow run model for storing execution history."""

    __tablename__ = "workflow_runs"

    id = Column(String(36), primary_key=True)
    workflow_id = Column(
        String(36),
        ForeignKey("workflow_definitions.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    trigger_type = Column(String(20), nullable=False)
    trigger_payload = Column(JSONB, default=dict)
    status = Column(String(20), default="queued", index=True)
    started_at = Column(DateTime, default=lambda: datetime.now(timezone.utc), index=True)
    completed_at = Column(DateTime, nullable=True)
    duration_seconds = Column(Float, nullable=True)
    total_cost = Column(Float, default=0.0)
    error_summary = Column(Text, nullable=True)

    workflow = relationship("WorkflowDefinitionModel", back_populates="runs")
    jobs = relationship("WorkflowJobModel", back_populates="run", cascade="all, delete-orphan")

    __table_args__ = (
        Index("ix_workflow_runs_workflow_status", "workflow_id", "status"),
        Index("ix_workflow_runs_started", "started_at"),
    )


class WorkflowJobModel(Base):
    """Workflow job model for storing job execution details."""

    __tablename__ = "workflow_jobs"

    id = Column(String(36), primary_key=True)
    run_id = Column(
        String(36),
        ForeignKey("workflow_runs.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    name = Column(String(255), nullable=False)
    needs = Column(JSONB, default=list)
    runs_on = Column(String(20), default="local")
    status = Column(String(20), default="queued", index=True)
    matrix_values = Column(JSONB, nullable=True)
    environment = Column(String(100), nullable=True)
    outputs = Column(JSONB, default=dict)
    error = Column(Text, nullable=True)
    started_at = Column(DateTime, nullable=True)
    completed_at = Column(DateTime, nullable=True)
    duration_seconds = Column(Float, nullable=True)

    run = relationship("WorkflowRunModel", back_populates="jobs")
    steps = relationship("WorkflowStepModel", back_populates="job", cascade="all, delete-orphan")

    __table_args__ = (Index("ix_workflow_jobs_run_status", "run_id", "status"),)


class WorkflowStepModel(Base):
    """Workflow step model for storing step execution details."""

    __tablename__ = "workflow_steps"

    id = Column(String(36), primary_key=True)
    job_id = Column(
        String(36),
        ForeignKey("workflow_jobs.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    name = Column(String(255), nullable=False)
    step_order = Column(Integer, default=0)
    uses = Column(String(255), nullable=True)
    run_command = Column(Text, nullable=True)
    with_args = Column(JSONB, nullable=True)
    env = Column(JSONB, nullable=True)
    if_condition = Column(String(500), nullable=True)
    continue_on_error = Column(Boolean, default=False)
    status = Column(String(20), default="pending")
    output = Column(Text, nullable=True)
    error = Column(Text, nullable=True)
    exit_code = Column(Integer, nullable=True)
    duration_ms = Column(Integer, nullable=True)
    started_at = Column(DateTime, nullable=True)
    completed_at = Column(DateTime, nullable=True)

    job = relationship("WorkflowJobModel", back_populates="steps")

    __table_args__ = (Index("ix_workflow_steps_job_order", "job_id", "step_order"),)


class WorkflowSecretModel(Base):
    """Workflow secret model for encrypted secrets storage."""

    __tablename__ = "workflow_secrets"

    id = Column(String(36), primary_key=True)
    name = Column(String(255), nullable=False)
    encrypted_value = Column(EncryptedString(length=None), nullable=False)
    scope = Column(String(20), nullable=False, default="workflow")
    scope_id = Column(String(36), nullable=True, index=True)
    created_by = Column(String(36), ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))
    updated_at = Column(
        DateTime,
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
    )

    __table_args__ = (
        UniqueConstraint("name", "scope", "scope_id", name="uq_secret_name_scope"),
        Index("ix_workflow_secrets_scope", "scope", "scope_id"),
        Index("ix_workflow_secrets_name_scope", "name", "scope", "scope_id"),
    )


class WorkflowWebhookModel(Base):
    """Workflow webhook model for trigger endpoints."""

    __tablename__ = "workflow_webhooks"

    id = Column(String(36), primary_key=True)
    workflow_id = Column(
        String(36),
        ForeignKey("workflow_definitions.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    secret = Column(String(255), nullable=False)
    is_active = Column(Boolean, default=True)
    allowed_events = Column(JSONB, default=lambda: ["push", "pull_request"])
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))

    __table_args__ = (Index("ix_workflow_webhooks_workflow", "workflow_id"),)


class WorkflowArtifactModel(Base):
    """Workflow artifact model for run output storage."""

    __tablename__ = "workflow_artifacts"

    id = Column(String(36), primary_key=True)
    run_id = Column(
        String(36),
        ForeignKey("workflow_runs.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    job_id = Column(String(36), nullable=True)
    step_id = Column(String(36), nullable=True)
    name = Column(String(255), nullable=False)
    path = Column(Text, nullable=False)
    size_bytes = Column(Integer, default=0)
    content_type = Column(String(100), default="application/octet-stream")
    retention_days = Column(Integer, default=30)
    expires_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))

    __table_args__ = (
        Index("ix_workflow_artifacts_run", "run_id"),
        Index("ix_workflow_artifacts_expires", "expires_at"),
    )


class WorkflowTemplateModel(Base):
    """Workflow template model for reusable workflow definitions."""

    __tablename__ = "workflow_templates"

    id = Column(String(36), primary_key=True)
    name = Column(String(255), nullable=False)
    description = Column(Text, default="")
    category = Column(String(20), default="utility")
    tags = Column(JSONB, default=list)
    definition = Column(JSONB, nullable=True)
    yaml_content = Column(Text, nullable=True)
    icon = Column(String(50), default="zap")
    popularity = Column(Integer, default=0)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))
    updated_at = Column(
        DateTime,
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
    )

    __table_args__ = (
        Index("ix_workflow_templates_category", "category"),
        Index("ix_workflow_templates_popularity", "popularity"),
    )
