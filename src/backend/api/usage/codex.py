"""Codex CLI 사용량 — 상태 DB 조회와 app-server rate limit 파싱.

순수 파서만 둔다. plan 응답 캐시(`_codex_plan_cache`)는 그것을 읽는
라우트와 갈리지 않도록 routes.py 에 있다.
"""

import json
import os
import select
import sqlite3
import subprocess
import time
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

from .models import (
    CodexPlanLimitSnapshot,
    CodexPlanUsageResponse,
    CodexPlanWindow,
    CodexUsageBreakdown,
)

CODEX_STATE_DB_PATH = Path(
    os.getenv(
        "CODEX_STATE_DB_PATH",
        str(Path.home() / ".codex" / "state_5.sqlite"),
    )
)


CODEX_APP_SERVER_BIN = os.getenv("CODEX_APP_SERVER_BIN", "codex")


CODEX_APP_SERVER_TIMEOUT_SECONDS = float(os.getenv("CODEX_APP_SERVER_TIMEOUT_SECONDS", "8"))


def _codex_source_name(source: str | None) -> str:
    """Convert Codex thread source values into dashboard-friendly labels."""
    if not source:
        return "unknown"
    trimmed = source.strip()
    if not trimmed:
        return "unknown"
    try:
        parsed = json.loads(trimmed)
    except json.JSONDecodeError:
        return trimmed
    if isinstance(parsed, dict) and "subagent" in parsed:
        return "subagent"
    return trimmed


def _codex_usage_totals(
    conn: sqlite3.Connection, cutoff_ts: int | None = None
) -> tuple[int, int, int | None]:
    """Return (threads, tokens, latest_updated_at) for Codex/OpenAI threads."""
    where = "WHERE lower(coalesce(model_provider, '')) = 'openai'"
    params: tuple[int, ...] = ()
    if cutoff_ts is not None:
        where += " AND updated_at >= ?"
        params = (cutoff_ts,)

    row = conn.execute(
        f"""
        SELECT
            COUNT(*) AS threads,
            COALESCE(SUM(COALESCE(tokens_used, 0)), 0) AS tokens,
            MAX(updated_at) AS updated_at
        FROM threads
        {where}
        """,
        params,
    ).fetchone()
    if not row:
        return (0, 0, None)
    return (int(row[0] or 0), int(row[1] or 0), int(row[2]) if row[2] else None)


def _codex_usage_by_model(conn: sqlite3.Connection) -> list[CodexUsageBreakdown]:
    rows = conn.execute(
        """
        SELECT
            COALESCE(NULLIF(TRIM(model), ''), 'unspecified model') AS model_name,
            COUNT(*) AS threads,
            COALESCE(SUM(COALESCE(tokens_used, 0)), 0) AS tokens
        FROM threads
        WHERE lower(coalesce(model_provider, '')) = 'openai'
        GROUP BY model_name
        ORDER BY tokens DESC, threads DESC
        LIMIT 10
        """
    ).fetchall()
    return [
        CodexUsageBreakdown(name=str(row[0]), threads=int(row[1] or 0), tokens=int(row[2] or 0))
        for row in rows
    ]


def _codex_usage_by_source(conn: sqlite3.Connection) -> list[CodexUsageBreakdown]:
    rows = conn.execute(
        """
        SELECT
            source,
            COUNT(*) AS threads,
            COALESCE(SUM(COALESCE(tokens_used, 0)), 0) AS tokens
        FROM threads
        WHERE lower(coalesce(model_provider, '')) = 'openai'
        GROUP BY source
        ORDER BY tokens DESC, threads DESC
        """
    ).fetchall()

    grouped: dict[str, CodexUsageBreakdown] = {}
    for row in rows:
        name = _codex_source_name(row[0])
        item = grouped.setdefault(name, CodexUsageBreakdown(name=name))
        item.threads += int(row[1] or 0)
        item.tokens += int(row[2] or 0)

    return sorted(grouped.values(), key=lambda item: (-item.tokens, -item.threads))[:10]


def _coerce_percent(value: Any, default: float = 0) -> float:
    """Return a percent clamped to [0, 100]."""
    try:
        percent = float(value)
    except (TypeError, ValueError):
        percent = default
    return max(0, min(100, percent))


def _parse_codex_rate_limit_window(raw: Any) -> CodexPlanWindow | None:
    """Normalize a Codex app-server RateLimitWindow object."""
    if not isinstance(raw, dict):
        return None

    used_percent = _coerce_percent(raw.get("usedPercent"))
    remaining_percent = max(0, 100 - used_percent)

    resets_at_raw = raw.get("resetsAt")
    resets_at: int | None = None
    resets_at_iso: str | None = None
    resets_in_minutes: float | None = None
    if resets_at_raw is not None:
        try:
            resets_at = int(resets_at_raw)
            resets_at_dt = datetime.fromtimestamp(resets_at, UTC)
            resets_at_iso = resets_at_dt.isoformat()
            resets_in_minutes = max(
                0,
                (resets_at_dt - datetime.now(UTC)).total_seconds() / 60,
            )
        except (TypeError, ValueError, OSError):
            resets_at = None

    window_duration_raw = raw.get("windowDurationMins")
    try:
        window_duration = int(window_duration_raw) if window_duration_raw is not None else None
    except (TypeError, ValueError):
        window_duration = None

    return CodexPlanWindow(
        usedPercent=used_percent,
        remainingPercent=remaining_percent,
        windowDurationMins=window_duration,
        resetsAt=resets_at,
        resetsAtIso=resets_at_iso,
        resetsInMinutes=resets_in_minutes,
    )


def _parse_codex_limit_snapshot(raw: Any) -> CodexPlanLimitSnapshot | None:
    """Normalize a Codex app-server RateLimitSnapshot object."""
    if not isinstance(raw, dict):
        return None

    return CodexPlanLimitSnapshot(
        limitId=raw.get("limitId"),
        limitName=raw.get("limitName"),
        primary=_parse_codex_rate_limit_window(raw.get("primary")),
        secondary=_parse_codex_rate_limit_window(raw.get("secondary")),
        credits=raw.get("credits") if isinstance(raw.get("credits"), dict) else None,
        individualLimit=(
            raw.get("individualLimit") if isinstance(raw.get("individualLimit"), dict) else None
        ),
        planType=raw.get("planType"),
        rateLimitReachedType=raw.get("rateLimitReachedType"),
    )


def _select_codex_limit_snapshot(
    default_limit: CodexPlanLimitSnapshot | None,
    limits_by_id: dict[str, CodexPlanLimitSnapshot],
) -> CodexPlanLimitSnapshot | None:
    """Pick the Codex bucket from a multi-bucket response."""
    if "codex" in limits_by_id:
        return limits_by_id["codex"]

    for limit in limits_by_id.values():
        if (limit.limitId or "").lower() == "codex":
            return limit

    return default_limit


def _parse_codex_rate_limits_response(raw: dict[str, Any]) -> CodexPlanUsageResponse:
    """Convert `account/rateLimits/read` into the dashboard API shape."""
    default_limit = _parse_codex_limit_snapshot(raw.get("rateLimits"))
    raw_limits_by_id = raw.get("rateLimitsByLimitId") or {}
    limits_by_id: dict[str, CodexPlanLimitSnapshot] = {}

    if isinstance(raw_limits_by_id, dict):
        for key, value in raw_limits_by_id.items():
            parsed = _parse_codex_limit_snapshot(value)
            if parsed:
                limits_by_id[str(key)] = parsed

    codex_limit = _select_codex_limit_snapshot(default_limit, limits_by_id)

    return CodexPlanUsageResponse(
        available=codex_limit is not None,
        codexLimit=codex_limit,
        limitsById=limits_by_id,
        rateLimitResetCredits=(
            raw.get("rateLimitResetCredits")
            if isinstance(raw.get("rateLimitResetCredits"), dict)
            else None
        ),
        updatedAt=datetime.now(UTC).isoformat(),
        message=None if codex_limit else "Codex rate-limit bucket was not present.",
    )


def _read_codex_app_server_rate_limits() -> dict[str, Any]:
    """Read ChatGPT Codex rate limits from the local Codex app-server."""
    payload_messages = [
        {
            "id": 1,
            "method": "initialize",
            "params": {
                "clientInfo": {"name": "aos-dashboard", "version": "0.1.0"},
                "capabilities": {
                    "experimentalApi": True,
                    "requestAttestation": False,
                },
            },
        },
        {"method": "initialized"},
        {"id": 2, "method": "account/rateLimits/read"},
    ]

    process = subprocess.Popen(
        [CODEX_APP_SERVER_BIN, "app-server", "--listen", "stdio://"],
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        stdin=subprocess.PIPE,
    )
    stdout_buffer = ""
    stderr_buffer = b""
    try:
        if process.stdin is None or process.stdout is None or process.stderr is None:
            raise RuntimeError("Codex app-server pipes were not available")

        for message in payload_messages:
            process.stdin.write((json.dumps(message) + "\n").encode())
            process.stdin.flush()

        deadline = time.monotonic() + CODEX_APP_SERVER_TIMEOUT_SECONDS
        streams = [process.stdout, process.stderr]
        while time.monotonic() < deadline:
            timeout = max(0, min(0.2, deadline - time.monotonic()))
            readable, _, _ = select.select(streams, [], [], timeout)
            if not readable and process.poll() is not None:
                break

            for stream in readable:
                chunk = os.read(stream.fileno(), 65536)
                if not chunk:
                    continue
                if stream is process.stderr:
                    stderr_buffer += chunk
                    continue

                stdout_buffer += chunk.decode(errors="replace")
                while "\n" in stdout_buffer:
                    line, stdout_buffer = stdout_buffer.split("\n", 1)
                    response = _extract_codex_rate_limit_response_line(line)
                    if response is not None:
                        return response

        if stdout_buffer.strip():
            response = _extract_codex_rate_limit_response_line(stdout_buffer)
            if response is not None:
                return response

        if process.poll() not in (None, 0):
            raise RuntimeError(f"Codex app-server exited with {process.returncode}")
        raise subprocess.TimeoutExpired(
            [CODEX_APP_SERVER_BIN, "app-server", "--listen", "stdio://"],
            CODEX_APP_SERVER_TIMEOUT_SECONDS,
            output=stdout_buffer,
            stderr=stderr_buffer,
        )
    finally:
        try:
            if process.stdin:
                process.stdin.close()
        except OSError:
            pass
        if process.poll() is None:
            process.terminate()
            try:
                process.wait(timeout=1)
            except subprocess.TimeoutExpired:
                process.kill()


def _extract_codex_rate_limit_response_line(line: str) -> dict[str, Any] | None:
    """Return the id=2 rate-limit result from one app-server JSON line."""
    if not line.strip():
        return None
    try:
        message = json.loads(line)
    except json.JSONDecodeError:
        return None
    if message.get("id") != 2:
        return None
    if "error" in message:
        error = message.get("error") or {}
        raise RuntimeError(str(error.get("message") or "Codex app-server returned an error"))
    response = message.get("result")
    if not isinstance(response, dict):
        raise RuntimeError("Codex app-server returned an invalid rate-limit response")
    return response
