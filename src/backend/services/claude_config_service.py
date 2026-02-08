"""Claude Code configuration service.

Manages Claude Code settings stored in ~/.claude/aos-claude-config.json.
Provides centralized access to OAuth token with priority chain:
1. aos-claude-config.json (dashboard-managed)
2. CLAUDE_OAUTH_TOKEN env var
3. macOS Keychain (local dev)
"""

import json
import os
import subprocess
import sys
from pathlib import Path
from typing import Any

CONFIG_PATH = Path.home() / ".claude" / "aos-claude-config.json"


def _load_config() -> dict[str, Any]:
    """Load config from file."""
    if not CONFIG_PATH.exists():
        return {}
    try:
        with open(CONFIG_PATH) as f:
            return json.load(f)
    except (OSError, json.JSONDecodeError):
        return {}


def _save_config(config: dict[str, Any]) -> None:
    """Save config to file."""
    CONFIG_PATH.parent.mkdir(parents=True, exist_ok=True)
    with open(CONFIG_PATH, "w") as f:
        json.dump(config, f, indent=2)
    # Restrict file permissions (owner only)
    CONFIG_PATH.chmod(0o600)


def get_claude_config() -> dict[str, Any]:
    """Get current Claude Code config (token masked)."""
    config = _load_config()
    result: dict[str, Any] = {
        "oauth_token_set": bool(config.get("oauth_token")),
        "oauth_token_masked": _mask_token(config.get("oauth_token", "")),
        "stats_cache_path": config.get("stats_cache_path", ""),
        "usage_cache_path": config.get("usage_cache_path", ""),
        "token_source": _detect_token_source(),
    }
    return result


def update_claude_config(
    oauth_token: str | None = None,
    stats_cache_path: str | None = None,
    usage_cache_path: str | None = None,
) -> dict[str, Any]:
    """Update Claude Code config. Only updates provided fields."""
    config = _load_config()

    if oauth_token is not None:
        if oauth_token == "":
            config.pop("oauth_token", None)
        else:
            config["oauth_token"] = oauth_token

    if stats_cache_path is not None:
        if stats_cache_path == "":
            config.pop("stats_cache_path", None)
        else:
            config["stats_cache_path"] = stats_cache_path

    if usage_cache_path is not None:
        if usage_cache_path == "":
            config.pop("usage_cache_path", None)
        else:
            config["usage_cache_path"] = usage_cache_path

    _save_config(config)
    return get_claude_config()


def get_oauth_token() -> str | None:
    """Get OAuth token with priority chain.

    Priority:
    1. aos-claude-config.json (dashboard-managed)
    2. CLAUDE_OAUTH_TOKEN env var
    3. macOS Keychain (local dev)
    """
    # 1. Config file (dashboard-managed)
    config = _load_config()
    config_token = config.get("oauth_token")
    if config_token:
        return config_token

    # 2. Environment variable
    env_token = os.getenv("CLAUDE_OAUTH_TOKEN")
    if env_token:
        return env_token

    # 3. macOS Keychain
    if sys.platform != "darwin":
        return None

    try:
        result = subprocess.run(
            ["security", "find-generic-password", "-s", "Claude Code-credentials", "-w"],
            capture_output=True,
            text=True,
            timeout=5,
        )
        if result.returncode != 0:
            return None

        creds_json = result.stdout.strip()
        if not creds_json:
            return None

        creds = json.loads(creds_json)
        claude_oauth = creds.get("claudeAiOauth", {})
        return claude_oauth.get("accessToken")

    except (subprocess.TimeoutExpired, json.JSONDecodeError, Exception):
        return None


def _detect_token_source() -> str:
    """Detect where the current OAuth token is coming from."""
    config = _load_config()
    if config.get("oauth_token"):
        return "config"

    if os.getenv("CLAUDE_OAUTH_TOKEN"):
        return "env"

    if sys.platform == "darwin":
        try:
            result = subprocess.run(
                ["security", "find-generic-password", "-s", "Claude Code-credentials", "-w"],
                capture_output=True,
                text=True,
                timeout=5,
            )
            if result.returncode == 0 and result.stdout.strip():
                return "keychain"
        except Exception:
            pass

    return "none"


def _mask_token(token: str) -> str:
    """Mask token for display, showing only first/last 4 chars."""
    if not token or len(token) < 12:
        return "***" if token else ""
    return f"{token[:4]}...{token[-4:]}"
