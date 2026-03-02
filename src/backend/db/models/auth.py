"""User, Token, and SAML authentication models."""

from db.models.base import (
    Base,
    Boolean,
    Column,
    DateTime,
    EncryptedString,
    Index,
    Integer,
    JSONB,
    String,
    Text,
    datetime,
)


class UserModel(Base):
    """User model for OAuth and email/password authentication."""

    __tablename__ = "users"

    id = Column(String(36), primary_key=True)
    email = Column(String(255), unique=True, nullable=False, index=True)
    name = Column(String(255), nullable=True)
    avatar_url = Column(String(500), nullable=True)

    # Password
    password_hash = Column(String(255), nullable=True)

    # OAuth provider info
    oauth_provider = Column(String(50), nullable=True)
    oauth_provider_id = Column(String(255), nullable=True)

    # Status flags
    is_active = Column(Boolean, default=True)
    is_admin = Column(Boolean, default=False)

    # Role
    role = Column(String(20), default="user")

    # Timestamps
    created_at = Column(DateTime, default=datetime.utcnow, index=True)
    last_login_at = Column(DateTime, nullable=True)

    __table_args__ = (Index("ix_users_provider_id", "oauth_provider", "oauth_provider_id"),)


class TokenBlacklistModel(Base):
    """Token blacklist model for JWT revocation."""

    __tablename__ = "token_blacklist"

    id = Column(String(36), primary_key=True)
    jti = Column(String(36), nullable=False, unique=True, index=True)
    user_id = Column(String(36), nullable=True, index=True)
    token_type = Column(String(20), nullable=False)
    expires_at = Column(DateTime, nullable=False, index=True)
    revoked_at = Column(DateTime, default=datetime.utcnow)
    reason = Column(String(100), nullable=True)

    __table_args__ = (Index("ix_token_blacklist_expires", "expires_at"),)


class SAMLConfigModel(Base):
    """SAML IdP configuration model."""

    __tablename__ = "saml_configs"

    id = Column(String(36), primary_key=True)
    organization_id = Column(String(36), nullable=False, unique=True, index=True)
    name = Column(String(255), nullable=False)

    # IdP settings
    idp_entity_id = Column(String(500), nullable=False)
    idp_sso_url = Column(String(500), nullable=False)
    idp_slo_url = Column(String(500), nullable=True)
    idp_certificate = Column(EncryptedString(length=None), nullable=False)

    # SP settings
    sp_entity_id = Column(String(500), nullable=True)
    sp_acs_url = Column(String(500), nullable=True)

    # Attribute mapping
    attribute_mapping = Column(JSONB, default=dict)

    # Status
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    __table_args__ = (Index("ix_saml_configs_active", "is_active"),)
