"""Notification models: rules, history, and channel config."""

from db.models.base import (
    Base,
    Boolean,
    Column,
    DateTime,
    EncryptedString,
    ForeignKey,
    Index,
    Integer,
    JSONB,
    String,
    Text,
    datetime,
    timezone,
)


class NotificationRuleModel(Base):
    """Notification rule model."""

    __tablename__ = "notification_rules"

    id = Column(String(36), primary_key=True)
    name = Column(String(255), nullable=False)
    description = Column(Text, default="")
    enabled = Column(Boolean, default=True)

    # Trigger
    event_type = Column(String(50), nullable=False, index=True)
    conditions = Column(JSONB, default=list)

    # Channels
    channels = Column(JSONB, default=list)

    # Project filter
    project_ids = Column(JSONB, default=list)

    # Customization
    priority = Column(String(20), default="medium")
    message_template = Column(Text, nullable=True)

    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))
    updated_at = Column(DateTime, default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))


class NotificationHistoryModel(Base):
    """Notification history model."""

    __tablename__ = "notification_history"

    id = Column(String(36), primary_key=True)
    rule_id = Column(
        String(36), ForeignKey("notification_rules.id", ondelete="SET NULL"), nullable=True
    )
    event_type = Column(String(50), nullable=False, index=True)
    priority = Column(String(20), default="medium")

    # Content
    title = Column(String(500), nullable=False)
    body = Column(Text, nullable=False)
    data = Column(JSONB, default=dict)

    # Delivery
    channels = Column(JSONB, default=list)
    sent_at = Column(DateTime, nullable=True)
    delivery_status = Column(JSONB, default=dict)

    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))

    __table_args__ = (Index("ix_notification_history_sent", "sent_at"),)


class ChannelConfigModel(Base):
    """Channel configuration model."""

    __tablename__ = "channel_configs"

    id = Column(String(36), primary_key=True)
    channel = Column(String(20), nullable=False, unique=True)
    enabled = Column(Boolean, default=True)

    # Channel-specific settings
    webhook_url = Column(EncryptedString(500), nullable=True)
    api_key = Column(EncryptedString(500), nullable=True)
    bot_token = Column(EncryptedString(500), nullable=True)
    email_address = Column(String(255), nullable=True)

    # SMTP settings
    smtp_host = Column(String(255), nullable=True)
    smtp_port = Column(Integer, default=587)
    smtp_username = Column(String(255), nullable=True)
    smtp_password = Column(EncryptedString(500), nullable=True)
    smtp_use_tls = Column(Boolean, default=True)

    # Rate limiting
    rate_limit_per_hour = Column(Integer, default=60)
    last_sent = Column(DateTime, nullable=True)
    sent_this_hour = Column(Integer, default=0)

    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))
    updated_at = Column(DateTime, default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))
