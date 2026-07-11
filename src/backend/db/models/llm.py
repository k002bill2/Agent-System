"""LLM model configuration and user credential models."""

from db.models.base import (
    JSONB,
    Base,
    Boolean,
    Column,
    DateTime,
    EncryptedString,
    Float,
    Index,
    Integer,
    String,
    Text,
    UniqueConstraint,
    datetime,
    timezone,
    uuid,
)


class LLMModelConfigModel(Base):
    """LLM Model configuration stored in database."""

    __tablename__ = "llm_model_configs"

    id = Column(String(100), primary_key=True)
    display_name = Column(String(255), nullable=False)
    provider = Column(String(50), nullable=False, index=True)
    context_window = Column(Integer, nullable=False, default=128000)
    input_price = Column(Float, nullable=False, default=0.001)
    output_price = Column(Float, nullable=False, default=0.002)
    is_default = Column(Boolean, default=False, nullable=False)
    is_enabled = Column(Boolean, default=True, nullable=False, index=True)
    supports_tools = Column(Boolean, default=True, nullable=False)
    supports_vision = Column(Boolean, default=False, nullable=False)
    created_at = Column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), nullable=False
    )
    updated_at = Column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
    )

    __table_args__ = (Index("ix_llm_model_provider_enabled", "provider", "is_enabled"),)


class LLMModelSuppressionModel(Base):
    """Suppressed LLM model ids that must never be (re-)registered in the DB.

    A model id present here is skipped by BOTH re-registration paths — startup
    ``sync_to_db`` and the 24h ``model_update_service`` discovery — implementing
    a durable "hard delete". The code ``_MODELS`` list (settlement/pricing source
    of truth) is intentionally left intact; suppression acts only at the DB layer.
    """

    __tablename__ = "llm_model_suppressions"

    # PK is the model id: it is already globally unique in llm_model_configs.
    # ``provider`` is kept for lookup/reporting only (not a foreign key).
    model_id = Column(String(100), primary_key=True)
    provider = Column(String(50), nullable=False, index=True)
    reason = Column(String(500), nullable=True)
    suppressed_at = Column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        nullable=False,
    )


class UserLLMCredentialModel(Base):
    """User's personal LLM API credentials (encrypted at rest)."""

    __tablename__ = "user_llm_credentials"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    user_id = Column(String(255), nullable=False, index=True)
    provider = Column(String(50), nullable=False)
    key_name = Column(String(255), nullable=False)
    api_key = Column(EncryptedString(1024), nullable=False)
    is_active = Column(Boolean, default=True, nullable=False)
    last_verified_at = Column(DateTime(timezone=True), nullable=True)
    created_at = Column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), nullable=False
    )
    updated_at = Column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
    )

    __table_args__ = (
        UniqueConstraint("user_id", "provider", "key_name", name="uq_user_provider_key_name"),
        Index("ix_user_llm_cred_user_provider", "user_id", "provider"),
    )


class DeploymentUsageCredentialModel(Base):
    """Deployment-wide usage API credentials (encrypted at rest).

    Distinct from :class:`UserLLMCredentialModel`: these are admin/manager-managed
    org-level keys used solely to read External Usage (org usage / metrics) APIs.
    One row per provider (``uq_deployment_usage_provider``).
    """

    __tablename__ = "deployment_usage_credentials"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    provider = Column(String(50), nullable=False)
    api_key = Column(EncryptedString(1024), nullable=False)
    label = Column(String(255), nullable=True)
    is_active = Column(Boolean, default=True, nullable=False)
    last_verified_at = Column(DateTime(timezone=True), nullable=True)
    created_at = Column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), nullable=False
    )
    updated_at = Column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
    )

    __table_args__ = (UniqueConstraint("provider", name="uq_deployment_usage_provider"),)


class UserLLMEntitlementModel(Base):
    """User/org permission to use an LLM runtime mode and source scope."""

    __tablename__ = "user_llm_entitlements"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    user_id = Column(String(255), nullable=False, index=True)
    organization_id = Column(String(36), nullable=True, index=True)
    provider = Column(String(50), nullable=False, index=True)
    mode = Column(String(20), nullable=False, default="cli", index=True)
    source_scope = Column(String(100), nullable=False, default="all")
    enabled = Column(Boolean, default=True, nullable=False, index=True)
    cli_profile_id = Column(String(36), nullable=True, index=True)
    allow_api_fallback = Column(Boolean, default=False, nullable=False)
    quota_policy_id = Column(String(36), nullable=True)
    created_at = Column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), nullable=False
    )
    updated_at = Column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
    )

    __table_args__ = (
        Index(
            "ix_user_llm_entitlement_user_provider_mode",
            "user_id",
            "provider",
            "mode",
        ),
        Index(
            "ix_user_llm_entitlement_org_provider",
            "organization_id",
            "provider",
        ),
    )


class LLMCLIProfileModel(Base):
    """CLI profile used to execute subscription-backed LLM runtimes."""

    __tablename__ = "llm_cli_profiles"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    owner_user_id = Column(String(255), nullable=True, index=True)
    organization_id = Column(String(36), nullable=True, index=True)
    provider = Column(String(50), nullable=False, index=True)
    profile_name = Column(String(255), nullable=False)
    command = Column(String(255), nullable=False)
    args_json = Column(JSONB, default=list, nullable=False)
    working_directory = Column(String(1024), nullable=True)
    auth_status = Column(String(50), nullable=False, default="unknown", index=True)
    metadata_json = Column(JSONB, default=dict, nullable=False)
    created_at = Column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), nullable=False
    )
    updated_at = Column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
    )

    __table_args__ = (
        Index("ix_llm_cli_profile_owner_provider", "owner_user_id", "provider"),
        Index("ix_llm_cli_profile_org_provider", "organization_id", "provider"),
    )


class LLMUsageLedgerModel(Base):
    """Authoritative internal ledger for AOS-triggered LLM usage."""

    __tablename__ = "llm_usage_ledger"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    user_id = Column(String(255), nullable=True, index=True)
    organization_id = Column(String(36), nullable=True, index=True)
    provider = Column(String(50), nullable=False, index=True)
    mode = Column(String(20), nullable=False, index=True)
    source = Column(String(100), nullable=False, index=True)
    model = Column(String(255), nullable=True, index=True)
    input_tokens = Column(Integer, nullable=True)
    output_tokens = Column(Integer, nullable=True)
    total_tokens = Column(Integer, nullable=True)
    measurement_method = Column(String(50), nullable=False, default="unknown")
    estimated_cost_usd = Column(Float, nullable=True)
    status = Column(String(50), nullable=False, default="success", index=True)
    session_id = Column(String(36), nullable=True, index=True)
    task_id = Column(String(36), nullable=True, index=True)
    analysis_id = Column(String(36), nullable=True, index=True)
    project_id = Column(String(100), nullable=True, index=True)
    latency_ms = Column(Integer, nullable=True)
    error_message = Column(Text, nullable=True)
    metadata_json = Column(JSONB, default=dict, nullable=False)
    started_at = Column(DateTime(timezone=True), nullable=False, index=True)
    completed_at = Column(DateTime(timezone=True), nullable=True)
    created_at = Column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), nullable=False
    )

    __table_args__ = (
        Index("ix_llm_usage_user_started", "user_id", "started_at"),
        Index("ix_llm_usage_org_started", "organization_id", "started_at"),
        Index("ix_llm_usage_source_started", "source", "started_at"),
        Index("ix_llm_usage_provider_mode", "provider", "mode"),
        Index("ix_llm_usage_status_started", "status", "started_at"),
    )
