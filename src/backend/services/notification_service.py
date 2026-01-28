"""Notification service for sending alerts across multiple channels."""

import asyncio
import json
from abc import ABC, abstractmethod
from datetime import datetime, timedelta
from typing import Any

import httpx

from models.notification import (
    NotificationChannel,
    NotificationEventType,
    NotificationPriority,
    NotificationMessage,
    NotificationRule,
    NotificationRuleCreate,
    NotificationRuleUpdate,
    ChannelConfig,
    format_notification,
)


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
                    "timestamp": datetime.utcnow().isoformat(),
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
    """Email notification adapter (placeholder)."""

    async def send(
        self, message: NotificationMessage, config: ChannelConfig
    ) -> tuple[bool, str | None]:
        if not config.email_address:
            return False, "Email address not configured"

        # TODO: Implement actual email sending (e.g., via SendGrid, SES)
        print(f"[EMAIL] Would send to {config.email_address}: {message.title}")
        return True, None


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
            "timestamp": datetime.utcnow().isoformat(),
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


# In-memory storage
_rules: dict[str, NotificationRule] = {}
_channel_configs: dict[NotificationChannel, ChannelConfig] = {}
_notification_history: list[NotificationMessage] = []


class NotificationService:
    """Service for managing and sending notifications."""

    @staticmethod
    def get_rules() -> list[NotificationRule]:
        """Get all notification rules."""
        return list(_rules.values())

    @staticmethod
    def get_rule(rule_id: str) -> NotificationRule | None:
        """Get a specific rule by ID."""
        return _rules.get(rule_id)

    @staticmethod
    def create_rule(data: NotificationRuleCreate) -> NotificationRule:
        """Create a new notification rule."""
        rule = NotificationRule(
            name=data.name,
            description=data.description,
            event_type=data.event_type,
            conditions=data.conditions,
            channels=data.channels,
            priority=data.priority,
            message_template=data.message_template,
        )
        _rules[rule.id] = rule
        return rule

    @staticmethod
    def update_rule(rule_id: str, data: NotificationRuleUpdate) -> NotificationRule | None:
        """Update an existing rule."""
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
        if data.priority is not None:
            rule.priority = data.priority
        if data.message_template is not None:
            rule.message_template = data.message_template

        rule.updated_at = datetime.utcnow()
        return rule

    @staticmethod
    def delete_rule(rule_id: str) -> bool:
        """Delete a rule."""
        if rule_id in _rules:
            del _rules[rule_id]
            return True
        return False

    @staticmethod
    def get_channel_config(channel: NotificationChannel) -> ChannelConfig:
        """Get or create channel configuration."""
        if channel not in _channel_configs:
            _channel_configs[channel] = ChannelConfig(channel=channel)
        return _channel_configs[channel]

    @staticmethod
    def set_channel_config(channel: NotificationChannel, config: ChannelConfig) -> None:
        """Set channel configuration."""
        _channel_configs[channel] = config

    @staticmethod
    def _check_rate_limit(config: ChannelConfig) -> bool:
        """Check if sending is allowed under rate limit."""
        now = datetime.utcnow()

        # Reset counter if hour has passed
        if config.last_sent and (now - config.last_sent) > timedelta(hours=1):
            config.sent_this_hour = 0

        return config.sent_this_hour < config.rate_limit_per_hour

    @staticmethod
    def _check_conditions(
        rule: NotificationRule, data: dict[str, Any]
    ) -> bool:
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
    async def send_notification(
        event_type: NotificationEventType,
        data: dict[str, Any],
        title: str | None = None,
        force_channels: list[NotificationChannel] | None = None,
    ) -> NotificationMessage:
        """
        Send a notification based on rules or forced channels.

        Args:
            event_type: The type of event
            data: Event data for template formatting
            title: Optional custom title
            force_channels: If specified, send to these channels ignoring rules
        """
        # Find matching rules
        matching_rules = [
            rule
            for rule in _rules.values()
            if rule.enabled
            and rule.event_type == event_type
            and NotificationService._check_conditions(rule, data)
        ]

        # Determine channels and priority
        if force_channels:
            channels = force_channels
            priority = NotificationPriority.MEDIUM
            template = None
        elif matching_rules:
            # Use highest priority rule
            matching_rules.sort(key=lambda r: list(NotificationPriority).index(r.priority), reverse=True)
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
                config.last_sent = datetime.utcnow()
            else:
                message.delivery_status[channel.value] = f"failed: {error}"

        message.sent_at = datetime.utcnow()
        _notification_history.append(message)

        return message

    @staticmethod
    async def test_channel(
        channel: NotificationChannel,
    ) -> tuple[bool, str | None]:
        """Test a notification channel with a test message."""
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
        """Get notification history."""
        return _notification_history[-limit:]


# Convenience functions
async def notify_task_completed(session_id: str, task_id: str, task_title: str) -> None:
    """Send task completed notification."""
    await NotificationService.send_notification(
        NotificationEventType.TASK_COMPLETED,
        {"session_id": session_id, "task_id": task_id, "task_title": task_title},
    )


async def notify_task_failed(
    session_id: str, task_id: str, task_title: str, error: str
) -> None:
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


async def notify_approval_required(
    session_id: str, approval_id: str, tool_name: str
) -> None:
    """Send approval required notification."""
    await NotificationService.send_notification(
        NotificationEventType.APPROVAL_REQUIRED,
        {
            "session_id": session_id,
            "approval_id": approval_id,
            "tool_name": tool_name,
        },
    )
