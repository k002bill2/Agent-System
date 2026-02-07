"""Alerting service for health check failures and system events.

Supports multiple notification channels:
- Slack webhooks
- Discord webhooks
- Generic HTTP webhooks
- Sentry (errors only)
"""

import asyncio
import os
from datetime import UTC, datetime
from enum import Enum
from typing import Any

import httpx
from pydantic import BaseModel

from services.logging_service import get_logger

logger = get_logger(__name__)


class AlertLevel(str, Enum):
    """Alert severity levels."""

    INFO = "info"
    WARNING = "warning"
    ERROR = "error"
    CRITICAL = "critical"


class Alert(BaseModel):
    """Alert data model."""

    level: AlertLevel
    title: str
    message: str
    source: str = "aos-backend"
    timestamp: datetime = datetime.now(UTC)
    metadata: dict[str, Any] = {}


class AlertingService:
    """Service for sending alerts to various channels."""

    def __init__(self) -> None:
        self.slack_webhook_url = os.getenv("SLACK_WEBHOOK_URL")
        self.discord_webhook_url = os.getenv("DISCORD_WEBHOOK_URL")
        self.sentry_dsn = os.getenv("SENTRY_DSN")

        # Health check failure tracking
        self._failure_counts: dict[str, int] = {}
        self._alert_threshold = int(os.getenv("ALERT_THRESHOLD", "3"))
        self._recovery_notified: set[str] = set()

        # Initialize Sentry if configured
        if self.sentry_dsn:
            self._init_sentry()

    def _init_sentry(self) -> None:
        """Initialize Sentry SDK."""
        try:
            import sentry_sdk
            from sentry_sdk.integrations.fastapi import FastApiIntegration
            from sentry_sdk.integrations.starlette import StarletteIntegration

            sentry_sdk.init(
                dsn=self.sentry_dsn,
                integrations=[
                    StarletteIntegration(),
                    FastApiIntegration(),
                ],
                traces_sample_rate=float(os.getenv("SENTRY_TRACES_SAMPLE_RATE", "0.1")),
                environment=os.getenv("ENV", "development"),
            )
            logger.info("sentry_initialized")
        except ImportError:
            logger.warning("sentry_sdk_not_installed")
        except Exception as e:
            logger.error("sentry_init_failed", error=str(e))

    async def send_alert(self, alert: Alert) -> None:
        """Send alert to all configured channels."""
        tasks = []

        if self.slack_webhook_url:
            tasks.append(self._send_slack(alert))

        if self.discord_webhook_url:
            tasks.append(self._send_discord(alert))

        if tasks:
            await asyncio.gather(*tasks, return_exceptions=True)

        # Log the alert
        log_method = getattr(logger, alert.level.value, logger.info)
        log_method(
            "alert_sent",
            title=alert.title,
            message=alert.message,
            source=alert.source,
            metadata=alert.metadata,
        )

    async def _send_slack(self, alert: Alert) -> None:
        """Send alert to Slack."""
        if not self.slack_webhook_url:
            return

        color_map = {
            AlertLevel.INFO: "#36a64f",
            AlertLevel.WARNING: "#ffcc00",
            AlertLevel.ERROR: "#ff6600",
            AlertLevel.CRITICAL: "#ff0000",
        }

        emoji_map = {
            AlertLevel.INFO: ":information_source:",
            AlertLevel.WARNING: ":warning:",
            AlertLevel.ERROR: ":x:",
            AlertLevel.CRITICAL: ":rotating_light:",
        }

        payload = {
            "attachments": [
                {
                    "color": color_map[alert.level],
                    "blocks": [
                        {
                            "type": "header",
                            "text": {
                                "type": "plain_text",
                                "text": f"{emoji_map[alert.level]} {alert.title}",
                            },
                        },
                        {
                            "type": "section",
                            "text": {
                                "type": "mrkdwn",
                                "text": alert.message,
                            },
                        },
                        {
                            "type": "context",
                            "elements": [
                                {
                                    "type": "mrkdwn",
                                    "text": f"Source: *{alert.source}* | Time: {alert.timestamp.isoformat()}",
                                },
                            ],
                        },
                    ],
                },
            ],
        }

        try:
            async with httpx.AsyncClient(timeout=10.0) as client:
                response = await client.post(self.slack_webhook_url, json=payload)
                response.raise_for_status()
        except Exception as e:
            logger.error("slack_alert_failed", error=str(e))

    async def _send_discord(self, alert: Alert) -> None:
        """Send alert to Discord."""
        if not self.discord_webhook_url:
            return

        color_map = {
            AlertLevel.INFO: 0x36A64F,
            AlertLevel.WARNING: 0xFFCC00,
            AlertLevel.ERROR: 0xFF6600,
            AlertLevel.CRITICAL: 0xFF0000,
        }

        payload = {
            "embeds": [
                {
                    "title": alert.title,
                    "description": alert.message,
                    "color": color_map[alert.level],
                    "footer": {
                        "text": f"Source: {alert.source}",
                    },
                    "timestamp": alert.timestamp.isoformat(),
                },
            ],
        }

        try:
            async with httpx.AsyncClient(timeout=10.0) as client:
                response = await client.post(self.discord_webhook_url, json=payload)
                response.raise_for_status()
        except Exception as e:
            logger.error("discord_alert_failed", error=str(e))

    async def on_health_check_failure(
        self,
        component: str,
        error: str | None = None,
    ) -> None:
        """Handle health check failure with threshold-based alerting."""
        self._failure_counts[component] = self._failure_counts.get(component, 0) + 1
        count = self._failure_counts[component]

        logger.warning(
            "health_check_failed",
            component=component,
            failure_count=count,
            error=error,
        )

        # Alert after threshold consecutive failures
        if count == self._alert_threshold:
            await self.send_alert(
                Alert(
                    level=AlertLevel.ERROR,
                    title=f"Health Check Failed: {component}",
                    message=f"Component `{component}` has failed {count} consecutive health checks.\n\nError: {error or 'Unknown'}",
                    metadata={"component": component, "failure_count": count},
                ),
            )
            self._recovery_notified.discard(component)

    async def on_health_check_recovery(self, component: str) -> None:
        """Handle health check recovery."""
        previous_failures = self._failure_counts.get(component, 0)
        self._failure_counts[component] = 0

        # Only notify recovery if we previously alerted
        if previous_failures >= self._alert_threshold and component not in self._recovery_notified:
            await self.send_alert(
                Alert(
                    level=AlertLevel.INFO,
                    title=f"Health Check Recovered: {component}",
                    message=f"Component `{component}` has recovered after {previous_failures} failures.",
                    metadata={"component": component, "previous_failures": previous_failures},
                ),
            )
            self._recovery_notified.add(component)
            logger.info(
                "health_check_recovered",
                component=component,
                previous_failures=previous_failures,
            )

    async def on_startup(self) -> None:
        """Send startup notification."""
        env = os.getenv("ENV", "development")
        version = os.getenv("APP_VERSION", "unknown")

        await self.send_alert(
            Alert(
                level=AlertLevel.INFO,
                title="Service Started",
                message=f"AOS Backend started successfully.\n\nEnvironment: `{env}`\nVersion: `{version}`",
                metadata={"env": env, "version": version},
            ),
        )

    async def on_shutdown(self) -> None:
        """Send shutdown notification."""
        await self.send_alert(
            Alert(
                level=AlertLevel.WARNING,
                title="Service Shutting Down",
                message="AOS Backend is shutting down.",
            ),
        )


# Singleton instance
_alerting_service: AlertingService | None = None


def get_alerting_service() -> AlertingService:
    """Get the alerting service singleton."""
    global _alerting_service
    if _alerting_service is None:
        _alerting_service = AlertingService()
    return _alerting_service
