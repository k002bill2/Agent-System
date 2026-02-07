"""Notification API routes."""

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from db.database import get_db
from models.notification import (
    NotificationChannel,
    NotificationEventType,
    NotificationMessage,
    NotificationRule,
    NotificationRuleCreate,
    NotificationRuleUpdate,
)
from services.notification_service import USE_DATABASE, NotificationService

router = APIRouter(prefix="/notifications", tags=["notifications"])


# ─────────────────────────────────────────────────────────────
# Rules CRUD
# ─────────────────────────────────────────────────────────────


@router.get("/rules", response_model=list[NotificationRule])
async def list_rules(db: AsyncSession = Depends(get_db)):
    """Get all notification rules."""
    if USE_DATABASE:
        return await NotificationService.get_rules_async(db)
    return NotificationService.get_rules()


@router.get("/rules/{rule_id}", response_model=NotificationRule)
async def get_rule(rule_id: str, db: AsyncSession = Depends(get_db)):
    """Get a specific notification rule."""
    if USE_DATABASE:
        rule = await NotificationService.get_rule_async(db, rule_id)
    else:
        rule = NotificationService.get_rule(rule_id)
    if not rule:
        raise HTTPException(status_code=404, detail="Rule not found")
    return rule


@router.post("/rules", response_model=NotificationRule)
async def create_rule(data: NotificationRuleCreate, db: AsyncSession = Depends(get_db)):
    """Create a new notification rule."""
    if USE_DATABASE:
        return await NotificationService.create_rule_async(db, data)
    return NotificationService.create_rule(data)


@router.put("/rules/{rule_id}", response_model=NotificationRule)
async def update_rule(
    rule_id: str, data: NotificationRuleUpdate, db: AsyncSession = Depends(get_db)
):
    """Update an existing notification rule."""
    if USE_DATABASE:
        rule = await NotificationService.update_rule_async(db, rule_id, data)
    else:
        rule = NotificationService.update_rule(rule_id, data)
    if not rule:
        raise HTTPException(status_code=404, detail="Rule not found")
    return rule


@router.delete("/rules/{rule_id}")
async def delete_rule(rule_id: str, db: AsyncSession = Depends(get_db)):
    """Delete a notification rule."""
    if USE_DATABASE:
        success = await NotificationService.delete_rule_async(db, rule_id)
    else:
        success = NotificationService.delete_rule(rule_id)
    if not success:
        raise HTTPException(status_code=404, detail="Rule not found")
    return {"success": True, "message": "Rule deleted"}


@router.post("/rules/{rule_id}/toggle")
async def toggle_rule(rule_id: str, db: AsyncSession = Depends(get_db)):
    """Toggle a rule's enabled status."""
    if USE_DATABASE:
        rule = await NotificationService.get_rule_async(db, rule_id)
    else:
        rule = NotificationService.get_rule(rule_id)
    if not rule:
        raise HTTPException(status_code=404, detail="Rule not found")

    # Toggle and save
    if USE_DATABASE:
        from models.notification import NotificationRuleUpdate

        await NotificationService.update_rule_async(
            db, rule_id, NotificationRuleUpdate(enabled=not rule.enabled)
        )
    else:
        rule.enabled = not rule.enabled
    return {"success": True, "enabled": not rule.enabled}


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
    # SMTP settings for email
    smtp_host: str | None = None
    smtp_port: int | None = None
    smtp_username: str | None = None
    smtp_password: str | None = None
    smtp_use_tls: bool | None = None
    rate_limit_per_hour: int | None = None


@router.get("/channels")
async def list_channels(db: AsyncSession = Depends(get_db)):
    """Get all notification channels and their status."""
    channels = []
    for channel in NotificationChannel:
        if USE_DATABASE:
            config = await NotificationService.get_channel_config_async(db, channel)
        else:
            config = NotificationService.get_channel_config(channel)
        # Email requires SMTP settings, others require webhook/API key
        if channel == NotificationChannel.EMAIL:
            is_configured = bool(
                config.email_address
                and config.smtp_host
                and config.smtp_username
                and config.smtp_password
            )
        else:
            is_configured = bool(config.webhook_url or config.api_key)

        # Build config summary for display
        config_summary = {}
        if channel == NotificationChannel.EMAIL:
            if config.email_address:
                config_summary["email_address"] = config.email_address
            if config.smtp_host:
                config_summary["smtp_host"] = config.smtp_host
            if config.smtp_port:
                config_summary["smtp_port"] = config.smtp_port
            if config.smtp_username:
                config_summary["smtp_username"] = config.smtp_username
            config_summary["smtp_use_tls"] = config.smtp_use_tls
            # 비밀번호가 설정되어 있는지 여부
            config_summary["smtp_password_set"] = bool(config.smtp_password)
        else:
            if config.webhook_url:
                # Mask webhook URL but show domain
                try:
                    from urllib.parse import urlparse

                    parsed = urlparse(config.webhook_url)
                    config_summary["webhook_url"] = f"{parsed.scheme}://{parsed.netloc}/..."
                except Exception:
                    config_summary["webhook_url"] = "configured"

        channels.append(
            {
                "channel": channel.value,
                "enabled": config.enabled,
                "configured": is_configured,
                "rate_limit_per_hour": config.rate_limit_per_hour,
                "sent_this_hour": config.sent_this_hour,
                "config_summary": config_summary,
            }
        )
    return {"channels": channels}


@router.get("/channels/{channel}")
async def get_channel_config(channel: NotificationChannel, db: AsyncSession = Depends(get_db)):
    """Get configuration for a specific channel."""
    if USE_DATABASE:
        config = await NotificationService.get_channel_config_async(db, channel)
    else:
        config = NotificationService.get_channel_config(channel)
    return {
        "channel": channel.value,
        "enabled": config.enabled,
        "webhook_url": "***" if config.webhook_url else None,  # Mask sensitive data
        "api_key": "***" if config.api_key else None,
        "email_address": config.email_address,
        # SMTP settings (password masked)
        "smtp_host": config.smtp_host,
        "smtp_port": config.smtp_port,
        "smtp_username": config.smtp_username,
        "smtp_password": "***" if config.smtp_password else None,
        "smtp_use_tls": config.smtp_use_tls,
        "rate_limit_per_hour": config.rate_limit_per_hour,
        "sent_this_hour": config.sent_this_hour,
    }


@router.put("/channels/{channel}")
async def update_channel_config(
    channel: NotificationChannel, data: ChannelConfigRequest, db: AsyncSession = Depends(get_db)
):
    """Update configuration for a notification channel."""
    if USE_DATABASE:
        config = await NotificationService.get_channel_config_async(db, channel)
    else:
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
    # SMTP settings
    if data.smtp_host is not None:
        config.smtp_host = data.smtp_host
    if data.smtp_port is not None:
        config.smtp_port = data.smtp_port
    if data.smtp_username is not None:
        config.smtp_username = data.smtp_username
    if data.smtp_password is not None:
        config.smtp_password = data.smtp_password
    if data.smtp_use_tls is not None:
        config.smtp_use_tls = data.smtp_use_tls
    if data.rate_limit_per_hour is not None:
        config.rate_limit_per_hour = data.rate_limit_per_hour

    if USE_DATABASE:
        await NotificationService.set_channel_config_async(db, channel, config)
    else:
        NotificationService.set_channel_config(channel, config)

    return {"success": True, "message": f"Channel {channel.value} updated"}


@router.post("/channels/{channel}/test")
async def test_channel(channel: NotificationChannel, db: AsyncSession = Depends(get_db)):
    """Test a notification channel by sending a test message."""
    if USE_DATABASE:
        success, error = await NotificationService.test_channel(channel, db)
    else:
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
async def send_notification(request: SendNotificationRequest, db: AsyncSession = Depends(get_db)):
    """Manually send a notification."""
    if USE_DATABASE:
        message = await NotificationService.send_notification_async(
            db=db,
            event_type=request.event_type,
            data=request.data,
            title=request.title,
            force_channels=request.channels,
        )
    else:
        message = await NotificationService.send_notification(
            event_type=request.event_type,
            data=request.data,
            title=request.title,
            force_channels=request.channels,
        )
    return message


@router.get("/history")
async def get_notification_history(limit: int = 100, db: AsyncSession = Depends(get_db)):
    """Get notification history."""
    if USE_DATABASE:
        history = await NotificationService.get_history_async(db, limit)
    else:
        history = NotificationService.get_history(limit)
    return {
        "notifications": history,
        "total": len(history),
    }


@router.delete("/history")
async def clear_notification_history(db: AsyncSession = Depends(get_db)):
    """Clear all notification history."""
    if USE_DATABASE:
        count = await NotificationService.clear_history_async(db)
    else:
        count = NotificationService.clear_history()
    return {"success": True, "deleted": count}


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
        "priorities": [{"value": p.value, "label": p.value.title()} for p in NotificationPriority]
    }
