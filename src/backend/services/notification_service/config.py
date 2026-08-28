"""알림 설정 — 저장 모드 플래그와 채널 설정 파일 I/O.

`DATA_DIR` 은 패키지 승격으로 이 파일의 깊이가 한 단계 늘어난 만큼
`.parent` 를 하나 더 탄다. 원본(`services/notification_service.py`)이
가리키던 `src/backend/data` 를 그대로 가리켜야 한다 — 기존 설정 파일이
거기 있다.
"""

import json
import os
from pathlib import Path

from models.notification import ChannelConfig, NotificationChannel

USE_DATABASE = os.getenv("USE_DATABASE", "false").lower() == "true"


# 패키지 승격으로 이 파일이 한 단계 깊어졌다 — 원본
# `services/notification_service.py` 에서 `.parent.parent` 가 가리키던
# `src/backend/` 를 계속 가리키려면 `.parent` 를 하나 더 타야 한다.
# 기존 `notification_channel_configs.json` 이 거기 있으므로 경로가 바뀌면
# 설정이 통째로 사라진 것처럼 보인다.
DATA_DIR = Path(__file__).parent.parent.parent / "data"


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
