"""LLM model configuration and user credential models."""

from db.models.base import (
    Base,
    Boolean,
    Column,
    DateTime,
    EncryptedString,
    Float,
    Index,
    Integer,
    String,
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
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc), nullable=False)
    updated_at = Column(DateTime, default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))

    __table_args__ = (Index("ix_llm_model_provider_enabled", "provider", "is_enabled"),)


class UserLLMCredentialModel(Base):
    """User's personal LLM API credentials (encrypted at rest)."""

    __tablename__ = "user_llm_credentials"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    user_id = Column(String(255), nullable=False, index=True)
    provider = Column(String(50), nullable=False)
    key_name = Column(String(255), nullable=False)
    api_key = Column(EncryptedString(1024), nullable=False)
    is_active = Column(Boolean, default=True, nullable=False)
    last_verified_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc), nullable=False)
    updated_at = Column(DateTime, default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))

    __table_args__ = (
        UniqueConstraint("user_id", "provider", "key_name", name="uq_user_provider_key_name"),
        Index("ix_user_llm_cred_user_provider", "user_id", "provider"),
    )
