"""채널별 전송 어댑터.

`httpx` 를 읽는 곳이 전부 여기다. 테스트는
`services.notification_service.adapters.httpx.AsyncClient` 를 패치한다 —
읽는 쪽을 다른 모듈로 가르면 패치가 조용히 무효가 된다.
"""

import re
import ssl
from abc import ABC, abstractmethod
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText

import aiosmtplib
import httpx

from models.notification import ChannelConfig, NotificationMessage, NotificationPriority
from utils.time import utcnow


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

        # Convert URLs in body to clickable <a> tags for HTML version
        html_body = re.sub(
            r'(https?://[^\s<>"]+)',
            r'<a href="\1" style="color: #2563eb;">\1</a>',
            message.body,
        )
        # Preserve line breaks in HTML
        html_body = html_body.replace("\n", "<br>")

        html_content = f"""
        <html>
        <body style="font-family: Arial, sans-serif; padding: 20px;">
            <h2 style="color: #333;">{message.title}</h2>
            <p style="color: #666; line-height: 1.6;">{html_body}</p>
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
