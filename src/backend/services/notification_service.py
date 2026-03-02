"""Notification service for sending alerts across multiple channels."""

import json
import os
import ssl
import uuid
from abc import ABC, abstractmethod
from datetime import datetime, timedelta

from utils.time import utcnow
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from pathlib import Path
from typing import Any

import aiosmtplib
import httpx
from sqlalchemy import desc, select
from sqlalchemy.ext.asyncio import AsyncSession

from models.notification import (
    ChannelConfig,
    NotificationChannel,
    NotificationCondition,
    NotificationEventType,
    NotificationMessage,
    NotificationPriority,
    NotificationRule,
    NotificationRuleCreate,
    NotificationRuleUpdate,
    format_notification,
)

USE_DATABASE = os.getenv("USE_DATABASE", "false").lower() == "true"

# Data directory for persistent storage
DATA_DIR = Path(__file__).parent.parent / "data"
CHANNEL_CONFIGS_FILE = DATA_DIR / "notification_channel_configs.json"


def _load_channel_configs() -> dict[NotificationChannel, ChannelConfig]:
    """Load channel configs from JSON file."""
    if not CHANNEL_CONFIGS_FILE.exists():
        return {}
    try:
        with open(CHANNEL_CONFIGS_FILE) as f:
            data = json.load(f)
        configs = {}
        for channel_str, config_data in data.items():
            channel = NotificationChannel(channel_str)
            configs[channel] = ChannelConfig(
                channel=channel,
                enabled=config_data.get("enabled", True),
                webhook_url=config_data.get("webhook_url"),
                api_key=config_data.get("api_key"),
                bot_token=config_data.get("bot_token"),
                email_address=config_data.get("email_address"),
                smtp_host=config_data.get("smtp_host"),
                smtp_port=config_data.get("smtp_port", 587),
                smtp_username=config_data.get("smtp_username"),
                smtp_password=config_data.get("smtp_password"),
                smtp_use_tls=config_data.get("smtp_use_tls", True),
                rate_limit_per_hour=config_data.get("rate_limit_per_hour", 60),
            )
        return configs
    except Exception:
        return {}


def _save_channel_configs(configs: dict[NotificationChannel, ChannelConfig]) -> None:
    """Save channel configs to JSON file."""
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    data = {}
    for channel, config in configs.items():
        data[channel.value] = {
            "enabled": config.enabled,
            "webhook_url": config.webhook_url,
            "api_key": config.api_key,
            "bot_token": config.bot_token,
            "email_address": config.email_address,
            "smtp_host": config.smtp_host,
            "smtp_port": config.smtp_port,
            "smtp_username": config.smtp_username,
            "smtp_password": config.smtp_password,
            "smtp_use_tls": config.smtp_use_tls,
            "rate_limit_per_hour": config.rate_limit_per_hour,
        }
    with open(CHANNEL_CONFIGS_FILE, "w") as f:
        json.dump(data, f, indent=2)


class NotificationAdapter(ABC):
    """Base class for notification channel adapters."""

    @abstractmethod
    async def send(
        self, message: NotificationMessage, config: ChannelConfig
    ) -> tuple[bool, str | None]:
        """Send a notification. Returns (success, error_message)."""
        pass


class SlackAdapter(NotificationAdapter):
    """Slack webhook notification adapter."""

    async def send(
        self, message: NotificationMessage, config: ChannelConfig
    ) -> tuple[bool, str | None]:
        if not config.webhook_url:
            return False, "Slack webhook URL not configured"

        # Format message for Slack
        priority_emoji = {
            NotificationPriority.LOW: ":information_source:",
            NotificationPriority.MEDIUM: ":bell:",
            NotificationPriority.HIGH: ":warning:",
            NotificationPriority.URGENT: ":rotating_light:",
        }

        payload = {
            "text": f"{priority_emoji.get(message.priority, '')} {message.title}",
            "blocks": [
                {
                    "type": "header",
                    "text": {"type": "plain_text", "text": message.title},
                },
                {
                    "type": "section",
                    "text": {"type": "mrkdwn", "text": message.body},
                },
            ],
        }

        try:
            async with httpx.AsyncClient() as client:
                response = await client.post(
                    config.webhook_url,
                    json=payload,
                    timeout=10.0,
                )
                if response.status_code == 200:
                    return True, None
                return False, f"Slack API error: {response.status_code}"
        except Exception as e:
            return False, str(e)


class DiscordAdapter(NotificationAdapter):
    """Discord webhook notification adapter."""

    async def send(
        self, message: NotificationMessage, config: ChannelConfig
    ) -> tuple[bool, str | None]:
        if not config.webhook_url:
            return False, "Discord webhook URL not configured"

        # Format message for Discord
        color_map = {
            NotificationPriority.LOW: 0x3498DB,  # Blue
            NotificationPriority.MEDIUM: 0xF39C12,  # Orange
            NotificationPriority.HIGH: 0xE74C3C,  # Red
            NotificationPriority.URGENT: 0x9B59B6,  # Purple
        }

        payload = {
            "embeds": [
                {
                    "title": message.title,
                    "description": message.body,
                    "color": color_map.get(message.priority, 0x95A5A6),
                    "timestamp": utcnow().isoformat(),
                }
            ]
        }

        try:
            async with httpx.AsyncClient() as client:
                response = await client.post(
                    config.webhook_url,
                    json=payload,
                    timeout=10.0,
                )
                if response.status_code in (200, 204):
                    return True, None
                return False, f"Discord API error: {response.status_code}"
        except Exception as e:
            return False, str(e)


class EmailAdapter(NotificationAdapter):
    """Email notification adapter using SMTP."""

    async def send(
        self, message: NotificationMessage, config: ChannelConfig
    ) -> tuple[bool, str | None]:
        if not config.email_address:
            return False, "Email address not configured"

        if not config.smtp_host or not config.smtp_username or not config.smtp_password:
            return False, "SMTP settings not configured"

        # Build email message
        email_msg = MIMEMultipart("alternative")
        email_msg["Subject"] = f"[AOS] {message.title}"
        email_msg["From"] = config.smtp_username
        email_msg["To"] = config.email_address

        # Priority header
        priority_map = {
            NotificationPriority.LOW: "5",
            NotificationPriority.MEDIUM: "3",
            NotificationPriority.HIGH: "2",
            NotificationPriority.URGENT: "1",
        }
        email_msg["X-Priority"] = priority_map.get(message.priority, "3")

        # Plain text and HTML versions
        text_content = f"{message.title}\n\n{message.body}"
        html_content = f"""
        <html>
        <body style="font-family: Arial, sans-serif; padding: 20px;">
            <h2 style="color: #333;">{message.title}</h2>
            <p style="color: #666; line-height: 1.6;">{message.body}</p>
            <hr style="border: none; border-top: 1px solid #eee; margin: 20px 0;">
            <p style="color: #999; font-size: 12px;">
                Sent by Agent Orchestration Service
            </p>
        </body>
        </html>
        """

        email_msg.attach(MIMEText(text_content, "plain"))
        email_msg.attach(MIMEText(html_content, "html"))

        try:
            # Create SSL context for TLS
            if config.smtp_use_tls:
                tls_context = ssl.create_default_context()
            else:
                tls_context = None

            # Send email via SMTP
            await aiosmtplib.send(
                email_msg,
                hostname=config.smtp_host,
                port=config.smtp_port,
                username=config.smtp_username,
                password=config.smtp_password,
                start_tls=config.smtp_use_tls,
                tls_context=tls_context,
            )
            return True, None
        except aiosmtplib.SMTPAuthenticationError:
            return False, "SMTP authentication failed. Check username/app password"
        except aiosmtplib.SMTPConnectError:
            return False, f"Cannot connect to SMTP server {config.smtp_host}:{config.smtp_port}"
        except Exception as e:
            return False, f"Email send failed: {str(e)}"


class WebhookAdapter(NotificationAdapter):
    """Generic webhook notification adapter."""

    async def send(
        self, message: NotificationMessage, config: ChannelConfig
    ) -> tuple[bool, str | None]:
        if not config.webhook_url:
            return False, "Webhook URL not configured"

        payload = {
            "event": message.event_type.value,
            "priority": message.priority.value,
            "title": message.title,
            "body": message.body,
            "data": message.data,
            "timestamp": utcnow().isoformat(),
        }

        try:
            async with httpx.AsyncClient() as client:
                response = await client.post(
                    config.webhook_url,
                    json=payload,
                    timeout=10.0,
                )
                if response.status_code in (200, 201, 202, 204):
                    return True, None
                return False, f"Webhook error: {response.status_code}"
        except Exception as e:
            return False, str(e)


# Adapter registry
ADAPTERS: dict[NotificationChannel, NotificationAdapter] = {
    NotificationChannel.SLACK: SlackAdapter(),
    NotificationChannel.DISCORD: DiscordAdapter(),
    NotificationChannel.EMAIL: EmailAdapter(),
    NotificationChannel.WEBHOOK: WebhookAdapter(),
}


# In-memory storage (fallback when USE_DATABASE=false)
_rules: dict[str, NotificationRule] = {}
_channel_configs: dict[NotificationChannel, ChannelConfig] = _load_channel_configs()
_notification_history: list[NotificationMessage] = []


class NotificationService:
    """Service for managing and sending notifications."""

    def __init__(self, use_database: bool = USE_DATABASE):
        self.use_database = use_database

    # ─────────────────────────────────────────────────────────────
    # Rule CRUD - In-memory (sync)
    # ─────────────────────────────────────────────────────────────

    @staticmethod
    def get_rules() -> list[NotificationRule]:
        """Get all notification rules (in-memory)."""
        return list(_rules.values())

    @staticmethod
    def get_rule(rule_id: str) -> NotificationRule | None:
        """Get a specific rule by ID (in-memory)."""
        return _rules.get(rule_id)

    @staticmethod
    def create_rule(data: NotificationRuleCreate) -> NotificationRule:
        """Create a new notification rule (in-memory)."""
        rule = NotificationRule(
            name=data.name,
            description=data.description,
            event_type=data.event_type,
            conditions=data.conditions,
            channels=data.channels,
            project_ids=data.project_ids,
            priority=data.priority,
            message_template=data.message_template,
        )
        _rules[rule.id] = rule
        return rule

    @staticmethod
    def update_rule(rule_id: str, data: NotificationRuleUpdate) -> NotificationRule | None:
        """Update an existing rule (in-memory)."""
        rule = _rules.get(rule_id)
        if not rule:
            return None

        if data.name is not None:
            rule.name = data.name
        if data.description is not None:
            rule.description = data.description
        if data.enabled is not None:
            rule.enabled = data.enabled
        if data.event_type is not None:
            rule.event_type = data.event_type
        if data.conditions is not None:
            rule.conditions = data.conditions
        if data.channels is not None:
            rule.channels = data.channels
        if data.project_ids is not None:
            rule.project_ids = data.project_ids
        if data.priority is not None:
            rule.priority = data.priority
        if data.message_template is not None:
            rule.message_template = data.message_template

        rule.updated_at = utcnow()
        return rule

    @staticmethod
    def delete_rule(rule_id: str) -> bool:
        """Delete a rule (in-memory)."""
        if rule_id in _rules:
            del _rules[rule_id]
            return True
        return False

    # ─────────────────────────────────────────────────────────────
    # Rule CRUD - Database (async)
    # ─────────────────────────────────────────────────────────────

    @staticmethod
    async def get_rules_async(db: AsyncSession) -> list[NotificationRule]:
        """Get all notification rules from database."""
        from db.models import NotificationRuleModel

        result = await db.execute(select(NotificationRuleModel))
        rows = result.scalars().all()

        return [
            NotificationRule(
                id=row.id,
                name=row.name,
                description=row.description or "",
                enabled=row.enabled,
                event_type=NotificationEventType(row.event_type),
                conditions=[NotificationCondition(**c) for c in (row.conditions or [])],
                channels=[NotificationChannel(ch) for ch in (row.channels or [])],
                project_ids=row.project_ids or [],
                priority=NotificationPriority(row.priority),
                message_template=row.message_template,
                created_at=row.created_at,
                updated_at=row.updated_at,
            )
            for row in rows
        ]

    @staticmethod
    async def get_rule_async(db: AsyncSession, rule_id: str) -> NotificationRule | None:
        """Get a specific rule by ID from database."""
        from db.models import NotificationRuleModel

        result = await db.execute(
            select(NotificationRuleModel).where(NotificationRuleModel.id == rule_id)
        )
        row = result.scalar_one_or_none()

        if not row:
            return None

        return NotificationRule(
            id=row.id,
            name=row.name,
            description=row.description or "",
            enabled=row.enabled,
            event_type=NotificationEventType(row.event_type),
            conditions=[NotificationCondition(**c) for c in (row.conditions or [])],
            channels=[NotificationChannel(ch) for ch in (row.channels or [])],
            project_ids=row.project_ids or [],
            priority=NotificationPriority(row.priority),
            message_template=row.message_template,
            created_at=row.created_at,
            updated_at=row.updated_at,
        )

    @staticmethod
    async def create_rule_async(db: AsyncSession, data: NotificationRuleCreate) -> NotificationRule:
        """Create a new notification rule in database."""
        from db.models import NotificationRuleModel

        rule_id = str(uuid.uuid4())
        now = utcnow()

        db_rule = NotificationRuleModel(
            id=rule_id,
            name=data.name,
            description=data.description,
            enabled=True,
            event_type=data.event_type.value,
            conditions=[c.model_dump() for c in data.conditions],
            channels=[ch.value for ch in data.channels],
            project_ids=data.project_ids,
            priority=data.priority.value,
            message_template=data.message_template,
            created_at=now,
            updated_at=now,
        )

        db.add(db_rule)
        await db.commit()

        return NotificationRule(
            id=rule_id,
            name=data.name,
            description=data.description,
            enabled=True,
            event_type=data.event_type,
            conditions=data.conditions,
            channels=data.channels,
            project_ids=data.project_ids,
            priority=data.priority,
            message_template=data.message_template,
            created_at=now,
            updated_at=now,
        )

    @staticmethod
    async def update_rule_async(
        db: AsyncSession, rule_id: str, data: NotificationRuleUpdate
    ) -> NotificationRule | None:
        """Update an existing rule in database."""
        from db.models import NotificationRuleModel

        result = await db.execute(
            select(NotificationRuleModel).where(NotificationRuleModel.id == rule_id)
        )
        row = result.scalar_one_or_none()

        if not row:
            return None

        if data.name is not None:
            row.name = data.name
        if data.description is not None:
            row.description = data.description
        if data.enabled is not None:
            row.enabled = data.enabled
        if data.event_type is not None:
            row.event_type = data.event_type.value
        if data.conditions is not None:
            row.conditions = [c.model_dump() for c in data.conditions]
        if data.channels is not None:
            row.channels = [ch.value for ch in data.channels]
        if data.project_ids is not None:
            row.project_ids = data.project_ids
        if data.priority is not None:
            row.priority = data.priority.value
        if data.message_template is not None:
            row.message_template = data.message_template

        row.updated_at = utcnow()
        await db.commit()

        return await NotificationService.get_rule_async(db, rule_id)

    @staticmethod
    async def delete_rule_async(db: AsyncSession, rule_id: str) -> bool:
        """Delete a rule from database."""
        from sqlalchemy import delete

        from db.models import NotificationRuleModel

        result = await db.execute(
            delete(NotificationRuleModel).where(NotificationRuleModel.id == rule_id)
        )
        await db.commit()
        return result.rowcount > 0

    # ─────────────────────────────────────────────────────────────
    # Channel Config
    # ─────────────────────────────────────────────────────────────

    @staticmethod
    def get_channel_config(channel: NotificationChannel) -> ChannelConfig:
        """Get or create channel configuration (in-memory + file)."""
        global _channel_configs
        # Always reload from file to get latest config
        _channel_configs = _load_channel_configs()
        if channel not in _channel_configs:
            _channel_configs[channel] = ChannelConfig(channel=channel)
        return _channel_configs[channel]

    @staticmethod
    def set_channel_config(channel: NotificationChannel, config: ChannelConfig) -> None:
        """Set channel configuration (in-memory + file)."""
        _channel_configs[channel] = config
        _save_channel_configs(_channel_configs)

    @staticmethod
    async def get_channel_config_async(
        db: AsyncSession, channel: NotificationChannel
    ) -> ChannelConfig:
        """Get or create channel configuration from database."""
        from db.models import ChannelConfigModel

        result = await db.execute(
            select(ChannelConfigModel).where(ChannelConfigModel.channel == channel.value)
        )
        row = result.scalar_one_or_none()

        if not row:
            # Create default config
            config_id = str(uuid.uuid4())
            row = ChannelConfigModel(
                id=config_id,
                channel=channel.value,
                enabled=True,
            )
            db.add(row)
            await db.commit()

        return ChannelConfig(
            channel=channel,
            enabled=row.enabled,
            webhook_url=row.webhook_url,
            api_key=row.api_key,
            bot_token=row.bot_token,
            email_address=row.email_address,
            smtp_host=row.smtp_host,
            smtp_port=row.smtp_port or 587,
            smtp_username=row.smtp_username,
            smtp_password=row.smtp_password,
            smtp_use_tls=row.smtp_use_tls if row.smtp_use_tls is not None else True,
            rate_limit_per_hour=row.rate_limit_per_hour,
            last_sent=row.last_sent,
            sent_this_hour=row.sent_this_hour,
        )

    @staticmethod
    async def set_channel_config_async(
        db: AsyncSession, channel: NotificationChannel, config: ChannelConfig
    ) -> None:
        """Set channel configuration in database."""
        from db.models import ChannelConfigModel

        result = await db.execute(
            select(ChannelConfigModel).where(ChannelConfigModel.channel == channel.value)
        )
        row = result.scalar_one_or_none()

        if row:
            row.enabled = config.enabled
            row.webhook_url = config.webhook_url
            row.api_key = config.api_key
            row.bot_token = config.bot_token
            row.email_address = config.email_address
            row.smtp_host = config.smtp_host
            row.smtp_port = config.smtp_port
            row.smtp_username = config.smtp_username
            row.smtp_password = config.smtp_password
            row.smtp_use_tls = config.smtp_use_tls
            row.rate_limit_per_hour = config.rate_limit_per_hour
            row.last_sent = config.last_sent
            row.sent_this_hour = config.sent_this_hour
            row.updated_at = utcnow()
        else:
            config_id = str(uuid.uuid4())
            row = ChannelConfigModel(
                id=config_id,
                channel=channel.value,
                enabled=config.enabled,
                webhook_url=config.webhook_url,
                api_key=config.api_key,
                bot_token=config.bot_token,
                email_address=config.email_address,
                smtp_host=config.smtp_host,
                smtp_port=config.smtp_port,
                smtp_username=config.smtp_username,
                smtp_password=config.smtp_password,
                smtp_use_tls=config.smtp_use_tls,
                rate_limit_per_hour=config.rate_limit_per_hour,
                last_sent=config.last_sent,
                sent_this_hour=config.sent_this_hour,
            )
            db.add(row)

        await db.commit()

    # ─────────────────────────────────────────────────────────────
    # Notification Sending
    # ─────────────────────────────────────────────────────────────

    @staticmethod
    def _check_rate_limit(config: ChannelConfig) -> bool:
        """Check if sending is allowed under rate limit."""
        now = utcnow()

        # Reset counter if hour has passed
        if config.last_sent and (now - config.last_sent) > timedelta(hours=1):
            config.sent_this_hour = 0

        return config.sent_this_hour < config.rate_limit_per_hour

    @staticmethod
    def _check_conditions(rule: NotificationRule, data: dict[str, Any]) -> bool:
        """Check if all conditions are met."""
        for condition in rule.conditions:
            value = data.get(condition.field)
            if value is None:
                return False

            if condition.operator == "equals":
                if value != condition.value:
                    return False
            elif condition.operator == "contains":
                if condition.value not in str(value):
                    return False
            elif condition.operator == "greater_than":
                if not (isinstance(value, (int, float)) and value > condition.value):
                    return False
            elif condition.operator == "less_than":
                if not (isinstance(value, (int, float)) and value < condition.value):
                    return False

        return True

    @staticmethod
    def _check_project_filter(rule: NotificationRule, project_id: str | None) -> bool:
        """Check project filter. Empty project_ids = all projects allowed."""
        if not rule.project_ids:
            return True  # Empty list = all projects
        if not project_id:
            return True  # Events without project_id always pass
        return project_id in rule.project_ids

    @staticmethod
    async def send_notification(
        event_type: NotificationEventType,
        data: dict[str, Any],
        title: str | None = None,
        force_channels: list[NotificationChannel] | None = None,
        project_id: str | None = None,
    ) -> NotificationMessage:
        """Send a notification based on rules or forced channels (in-memory rules)."""
        # Find matching rules
        matching_rules = [
            rule
            for rule in _rules.values()
            if rule.enabled
            and rule.event_type == event_type
            and NotificationService._check_conditions(rule, data)
            and NotificationService._check_project_filter(rule, project_id)
        ]

        # Determine channels and priority
        if force_channels:
            channels = force_channels
            priority = NotificationPriority.MEDIUM
            template = None
        elif matching_rules:
            # Use highest priority rule
            matching_rules.sort(
                key=lambda r: list(NotificationPriority).index(r.priority), reverse=True
            )
            top_rule = matching_rules[0]
            channels = list(set(ch for rule in matching_rules for ch in rule.channels))
            priority = top_rule.priority
            template = top_rule.message_template
        else:
            # No matching rules and no forced channels
            return NotificationMessage(
                event_type=event_type,
                title=title or str(event_type.value),
                body="",
                channels=[],
                data=data,
            )

        # Format message
        body = format_notification(event_type, data, template)

        message = NotificationMessage(
            event_type=event_type,
            priority=priority,
            title=title or event_type.value.replace("_", " ").title(),
            body=body,
            channels=channels,
            data=data,
        )

        # Send to each channel
        for channel in channels:
            config = NotificationService.get_channel_config(channel)

            if not config.enabled:
                message.delivery_status[channel.value] = "disabled"
                continue

            if not NotificationService._check_rate_limit(config):
                message.delivery_status[channel.value] = "rate_limited"
                continue

            adapter = ADAPTERS.get(channel)
            if not adapter:
                message.delivery_status[channel.value] = "no_adapter"
                continue

            success, error = await adapter.send(message, config)
            if success:
                message.delivery_status[channel.value] = "sent"
                config.sent_this_hour += 1
                config.last_sent = utcnow()
            else:
                message.delivery_status[channel.value] = f"failed: {error}"

        message.sent_at = utcnow()
        _notification_history.append(message)

        return message

    @staticmethod
    async def send_notification_async(
        db: AsyncSession,
        event_type: NotificationEventType,
        data: dict[str, Any],
        title: str | None = None,
        force_channels: list[NotificationChannel] | None = None,
        project_id: str | None = None,
    ) -> NotificationMessage:
        """Send a notification based on rules from database."""
        from db.models import NotificationHistoryModel, NotificationRuleModel

        # Find matching rules from database
        result = await db.execute(
            select(NotificationRuleModel).where(
                NotificationRuleModel.enabled == True,  # noqa: E712
                NotificationRuleModel.event_type == event_type.value,
            )
        )
        db_rules = result.scalars().all()

        matching_rules = []
        for row in db_rules:
            rule = NotificationRule(
                id=row.id,
                name=row.name,
                event_type=NotificationEventType(row.event_type),
                conditions=[NotificationCondition(**c) for c in (row.conditions or [])],
                channels=[NotificationChannel(ch) for ch in (row.channels or [])],
                project_ids=row.project_ids or [],
                priority=NotificationPriority(row.priority),
                message_template=row.message_template,
            )
            if NotificationService._check_conditions(
                rule, data
            ) and NotificationService._check_project_filter(rule, project_id):
                matching_rules.append(rule)

        # Determine channels and priority
        if force_channels:
            channels = force_channels
            priority = NotificationPriority.MEDIUM
            template = None
            rule_id = None
        elif matching_rules:
            matching_rules.sort(
                key=lambda r: list(NotificationPriority).index(r.priority), reverse=True
            )
            top_rule = matching_rules[0]
            channels = list(set(ch for rule in matching_rules for ch in rule.channels))
            priority = top_rule.priority
            template = top_rule.message_template
            rule_id = top_rule.id
        else:
            return NotificationMessage(
                event_type=event_type,
                title=title or str(event_type.value),
                body="",
                channels=[],
                data=data,
            )

        # Format message
        body = format_notification(event_type, data, template)

        message = NotificationMessage(
            event_type=event_type,
            priority=priority,
            title=title or event_type.value.replace("_", " ").title(),
            body=body,
            channels=channels,
            data=data,
            rule_id=rule_id,
        )

        # Send to each channel
        for channel in channels:
            config = await NotificationService.get_channel_config_async(db, channel)

            if not config.enabled:
                message.delivery_status[channel.value] = "disabled"
                continue

            if not NotificationService._check_rate_limit(config):
                message.delivery_status[channel.value] = "rate_limited"
                continue

            adapter = ADAPTERS.get(channel)
            if not adapter:
                message.delivery_status[channel.value] = "no_adapter"
                continue

            success, error = await adapter.send(message, config)
            if success:
                message.delivery_status[channel.value] = "sent"
                config.sent_this_hour += 1
                config.last_sent = utcnow()
                await NotificationService.set_channel_config_async(db, channel, config)
            else:
                message.delivery_status[channel.value] = f"failed: {error}"

        message.sent_at = utcnow()

        # Save to history
        history_entry = NotificationHistoryModel(
            id=message.id,
            rule_id=rule_id,
            event_type=event_type.value,
            priority=priority.value,
            title=message.title,
            body=message.body,
            data=message.data,
            channels=[ch.value for ch in channels],
            sent_at=message.sent_at,
            delivery_status=message.delivery_status,
        )
        db.add(history_entry)
        await db.commit()

        return message

    @staticmethod
    async def test_channel(
        channel: NotificationChannel,
        db: AsyncSession | None = None,
    ) -> tuple[bool, str | None]:
        """Test a notification channel with a test message."""
        if db and USE_DATABASE:
            config = await NotificationService.get_channel_config_async(db, channel)
        else:
            config = NotificationService.get_channel_config(channel)

        if not config.enabled:
            return False, "Channel is disabled"

        adapter = ADAPTERS.get(channel)
        if not adapter:
            return False, "No adapter for channel"

        test_message = NotificationMessage(
            event_type=NotificationEventType.SESSION_STARTED,
            priority=NotificationPriority.LOW,
            title="AOS Test Notification",
            body="This is a test notification from Agent Orchestration Service.",
            channels=[channel],
            data={},
        )

        return await adapter.send(test_message, config)

    @staticmethod
    def get_history(limit: int = 100) -> list[NotificationMessage]:
        """Get notification history (in-memory)."""
        return _notification_history[-limit:]

    @staticmethod
    def clear_history() -> int:
        """Clear notification history (in-memory)."""
        count = len(_notification_history)
        _notification_history.clear()
        return count

    @staticmethod
    async def get_history_async(db: AsyncSession, limit: int = 100) -> list[NotificationMessage]:
        """Get notification history from database."""
        from db.models import NotificationHistoryModel

        result = await db.execute(
            select(NotificationHistoryModel)
            .order_by(desc(NotificationHistoryModel.created_at))
            .limit(limit)
        )
        rows = result.scalars().all()

        return [
            NotificationMessage(
                id=row.id,
                rule_id=row.rule_id,
                event_type=NotificationEventType(row.event_type),
                priority=NotificationPriority(row.priority),
                title=row.title,
                body=row.body,
                data=row.data or {},
                channels=[NotificationChannel(ch) for ch in (row.channels or [])],
                sent_at=row.sent_at,
                delivery_status=row.delivery_status or {},
            )
            for row in rows
        ]

    @staticmethod
    async def clear_history_async(db: AsyncSession) -> int:
        """Clear notification history from database."""
        from sqlalchemy import delete

        from db.models import NotificationHistoryModel

        result = await db.execute(delete(NotificationHistoryModel))
        await db.commit()
        return result.rowcount


# Convenience functions
async def notify_task_completed(session_id: str, task_id: str, task_title: str) -> None:
    """Send task completed notification."""
    await NotificationService.send_notification(
        NotificationEventType.TASK_COMPLETED,
        {"session_id": session_id, "task_id": task_id, "task_title": task_title},
    )


async def notify_task_failed(session_id: str, task_id: str, task_title: str, error: str) -> None:
    """Send task failed notification."""
    await NotificationService.send_notification(
        NotificationEventType.TASK_FAILED,
        {
            "session_id": session_id,
            "task_id": task_id,
            "task_title": task_title,
            "error": error,
        },
    )


async def notify_approval_required(session_id: str, approval_id: str, tool_name: str) -> None:
    """Send approval required notification."""
    await NotificationService.send_notification(
        NotificationEventType.APPROVAL_REQUIRED,
        {
            "session_id": session_id,
            "approval_id": approval_id,
            "tool_name": tool_name,
        },
    )
