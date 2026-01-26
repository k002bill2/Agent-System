"""Notification API routes."""

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from models.notification import (
    NotificationChannel,
    NotificationEventType,
    NotificationRule,
    NotificationRuleCreate,
    NotificationRuleUpdate,
    NotificationMessage,
    ChannelConfig,
)
from services.notification_service import NotificationService


router = APIRouter(prefix="/notifications", tags=["notifications"])


# ─────────────────────────────────────────────────────────────
# Rules CRUD
# ─────────────────────────────────────────────────────────────


@router.get("/rules", response_model=list[NotificationRule])
async def list_rules():
    """Get all notification rules."""
    return NotificationService.get_rules()


@router.get("/rules/{rule_id}", response_model=NotificationRule)
async def get_rule(rule_id: str):
    """Get a specific notification rule."""
    rule = NotificationService.get_rule(rule_id)
    if not rule:
        raise HTTPException(status_code=404, detail="Rule not found")
    return rule


@router.post("/rules", response_model=NotificationRule)
async def create_rule(data: NotificationRuleCreate):
    """Create a new notification rule."""
    return NotificationService.create_rule(data)


@router.put("/rules/{rule_id}", response_model=NotificationRule)
async def update_rule(rule_id: str, data: NotificationRuleUpdate):
    """Update an existing notification rule."""
    rule = NotificationService.update_rule(rule_id, data)
    if not rule:
        raise HTTPException(status_code=404, detail="Rule not found")
    return rule


@router.delete("/rules/{rule_id}")
async def delete_rule(rule_id: str):
    """Delete a notification rule."""
    if not NotificationService.delete_rule(rule_id):
        raise HTTPException(status_code=404, detail="Rule not found")
    return {"success": True, "message": "Rule deleted"}


@router.post("/rules/{rule_id}/toggle")
async def toggle_rule(rule_id: str):
    """Toggle a rule's enabled status."""
    rule = NotificationService.get_rule(rule_id)
    if not rule:
        raise HTTPException(status_code=404, detail="Rule not found")

    rule.enabled = not rule.enabled
    return {"success": True, "enabled": rule.enabled}


# ─────────────────────────────────────────────────────────────
# Channel Configuration
# ─────────────────────────────────────────────────────────────


class ChannelConfigRequest(BaseModel):
    """Request body for updating channel config."""

    enabled: bool | None = None
    webhook_url: str | None = None
    api_key: str | None = None
    bot_token: str | None = None
    email_address: str | None = None
    rate_limit_per_hour: int | None = None


@router.get("/channels")
async def list_channels():
    """Get all notification channels and their status."""
    channels = []
    for channel in NotificationChannel:
        config = NotificationService.get_channel_config(channel)
        channels.append({
            "channel": channel.value,
            "enabled": config.enabled,
            "configured": bool(config.webhook_url or config.api_key or config.email_address),
            "rate_limit_per_hour": config.rate_limit_per_hour,
            "sent_this_hour": config.sent_this_hour,
        })
    return {"channels": channels}


@router.get("/channels/{channel}")
async def get_channel_config(channel: NotificationChannel):
    """Get configuration for a specific channel."""
    config = NotificationService.get_channel_config(channel)
    return {
        "channel": channel.value,
        "enabled": config.enabled,
        "webhook_url": "***" if config.webhook_url else None,  # Mask sensitive data
        "api_key": "***" if config.api_key else None,
        "email_address": config.email_address,
        "rate_limit_per_hour": config.rate_limit_per_hour,
        "sent_this_hour": config.sent_this_hour,
    }


@router.put("/channels/{channel}")
async def update_channel_config(channel: NotificationChannel, data: ChannelConfigRequest):
    """Update configuration for a notification channel."""
    config = NotificationService.get_channel_config(channel)

    if data.enabled is not None:
        config.enabled = data.enabled
    if data.webhook_url is not None:
        config.webhook_url = data.webhook_url
    if data.api_key is not None:
        config.api_key = data.api_key
    if data.bot_token is not None:
        config.bot_token = data.bot_token
    if data.email_address is not None:
        config.email_address = data.email_address
    if data.rate_limit_per_hour is not None:
        config.rate_limit_per_hour = data.rate_limit_per_hour

    NotificationService.set_channel_config(channel, config)

    return {"success": True, "message": f"Channel {channel.value} updated"}


@router.post("/channels/{channel}/test")
async def test_channel(channel: NotificationChannel):
    """Test a notification channel by sending a test message."""
    success, error = await NotificationService.test_channel(channel)

    if success:
        return {"success": True, "message": f"Test notification sent to {channel.value}"}
    else:
        return {"success": False, "error": error}


# ─────────────────────────────────────────────────────────────
# Send & History
# ─────────────────────────────────────────────────────────────


class SendNotificationRequest(BaseModel):
    """Request body for sending a notification."""

    event_type: NotificationEventType
    title: str | None = None
    data: dict = {}
    channels: list[NotificationChannel] | None = None  # Force specific channels


@router.post("/send", response_model=NotificationMessage)
async def send_notification(request: SendNotificationRequest):
    """Manually send a notification."""
    message = await NotificationService.send_notification(
        event_type=request.event_type,
        data=request.data,
        title=request.title,
        force_channels=request.channels,
    )
    return message


@router.get("/history")
async def get_notification_history(limit: int = 100):
    """Get notification history."""
    history = NotificationService.get_history(limit)
    return {
        "notifications": history,
        "total": len(history),
    }


# ─────────────────────────────────────────────────────────────
# Event Types & Options
# ─────────────────────────────────────────────────────────────


@router.get("/event-types")
async def list_event_types():
    """Get available notification event types."""
    return {
        "event_types": [
            {"value": et.value, "label": et.value.replace("_", " ").title()}
            for et in NotificationEventType
        ]
    }


@router.get("/priorities")
async def list_priorities():
    """Get available notification priorities."""
    from models.notification import NotificationPriority
    return {
        "priorities": [
            {"value": p.value, "label": p.value.title()}
            for p in NotificationPriority
        ]
    }
