"""Read-only discovery of Codex CLI rollout sessions.

Codex stores one append-only JSONL rollout per thread below ``~/.codex/sessions``.
This adapter deliberately normalizes only the stable metadata/message shapes and
ignores event types that are not useful to the session UI.
"""

from __future__ import annotations

import json
import logging
from collections.abc import Iterator
from datetime import UTC, datetime, timedelta
from pathlib import Path
from typing import Any

from models.claude_session import (
    ActivityEvent,
    ActivityEventType,
    ClaudeCodeTask,
    ClaudeSessionDetail,
    ClaudeSessionInfo,
    MessageType,
    SessionMessage,
    SessionStatus,
    TokenUsage,
)
from utils.time import to_aware_utc, utcnow

logger = logging.getLogger(__name__)

MAX_ROLLOUT_BYTES = 16 * 1024 * 1024
MAX_ROLLOUT_LINE_BYTES = 2 * 1024 * 1024
MAX_ROLLOUT_RECORDS = 100_000


class CodexSessionMonitor:
    """Discover Codex rollout files without accepting caller-controlled paths."""

    def __init__(self, sessions_dir: str | Path | None = None) -> None:
        self.sessions_dir = (
            Path(sessions_dir) if sessions_dir else Path.home() / ".codex" / "sessions"
        )
        self._files_by_id: dict[str, Path] = {}

    def _iter_files(self) -> Iterator[Path]:
        if not self.sessions_dir.is_dir():
            return
        for path in sorted(
            self.sessions_dir.glob("[0-9][0-9][0-9][0-9]/[0-9][0-9]/[0-9][0-9]/rollout-*.jsonl")
        ):
            if self._is_safe_rollout(path):
                yield path

    def _is_safe_rollout(self, path: Path) -> bool:
        """Accept only regular, non-symlink files below the configured root."""
        if path.is_symlink() or not path.is_file():
            return False
        try:
            path.resolve().relative_to(self.sessions_dir.resolve())
        except ValueError:
            return False
        return True

    @staticmethod
    def _timestamp(value: Any) -> datetime | None:
        if not isinstance(value, str):
            return None
        try:
            return to_aware_utc(datetime.fromisoformat(value.replace("Z", "+00:00")))
        except ValueError:
            return None

    @staticmethod
    def _text_content(content: Any) -> str:
        if isinstance(content, str):
            return content
        if not isinstance(content, list):
            return ""
        texts: list[str] = []
        for item in content:
            if not isinstance(item, dict):
                continue
            if item.get("type") in {"input_text", "output_text", "text"} and isinstance(
                item.get("text"), str
            ):
                texts.append(item["text"])
        return "\n".join(texts)

    @staticmethod
    def _token_count(value: Any) -> int:
        try:
            return max(int(value), 0)
        except (TypeError, ValueError, OverflowError):
            return 0

    @classmethod
    def _message_from_record(cls, record: dict[str, Any]) -> SessionMessage | None:
        timestamp = cls._timestamp(record.get("timestamp")) or utcnow()
        if record.get("type") != "response_item":
            return None
        payload = record.get("payload")
        if not isinstance(payload, dict):
            return None

        payload_type = payload.get("type")
        if not isinstance(payload_type, str):
            return None
        if payload_type in {"function_call", "custom_tool_call"}:
            # Freeform tools such as apply_patch arrive as custom_tool_call and
            # carry their payload in ``input`` rather than ``arguments``.
            arguments = payload.get("arguments")
            tool_input = (
                {"arguments": arguments}
                if arguments is not None
                else {"input": payload.get("input")}
                if payload.get("input") is not None
                else None
            )
            return SessionMessage(
                type=MessageType.TOOL_USE,
                timestamp=timestamp,
                tool_name=str(payload.get("name") or payload_type),
                tool_id=str(payload.get("call_id")) if payload.get("call_id") else None,
                tool_input=tool_input,
            )
        if payload_type != "message":
            return None

        role = payload.get("role")
        if not isinstance(role, str):
            return None
        content = cls._text_content(payload.get("content"))
        if role == "user":
            return SessionMessage(
                type=MessageType.USER, timestamp=timestamp, content=content or None
            )
        if role in {"assistant", "model"}:
            usage_data = payload.get("usage")
            usage = None
            if isinstance(usage_data, dict):
                usage = TokenUsage(
                    input_tokens=cls._token_count(usage_data.get("input_tokens")),
                    output_tokens=cls._token_count(usage_data.get("output_tokens")),
                    cache_read_tokens=cls._token_count(usage_data.get("cache_read_tokens")),
                    cache_creation_tokens=cls._token_count(usage_data.get("cache_creation_tokens")),
                )
            return SessionMessage(
                type=MessageType.ASSISTANT,
                timestamp=timestamp,
                model=str(payload.get("model")) if payload.get("model") else None,
                content=content or None,
                usage=usage,
            )
        return None

    def _read_file(
        self, path: Path
    ) -> tuple[dict[str, Any], list[SessionMessage], list[dict[str, Any]]]:
        metadata: dict[str, Any] = {}
        messages: list[SessionMessage] = []
        records: list[dict[str, Any]] = []
        if not self._is_safe_rollout(path):
            return metadata, messages, records
        try:
            if path.stat().st_size > MAX_ROLLOUT_BYTES:
                return metadata, messages, records
            with path.open(encoding="utf-8", errors="replace") as stream:
                for line in stream:
                    if len(line.encode("utf-8")) > MAX_ROLLOUT_LINE_BYTES:
                        continue
                    try:
                        record = json.loads(line)
                    except (json.JSONDecodeError, UnicodeDecodeError):
                        continue
                    if not isinstance(record, dict):
                        continue
                    records.append(record)
                    if len(records) > MAX_ROLLOUT_RECORDS:
                        records.pop()
                        break
                    if record.get("type") == "session_meta" and not metadata:
                        payload = record.get("payload")
                        if isinstance(payload, dict):
                            metadata = payload
                    message = self._message_from_record(record)
                    if message is not None:
                        messages.append(message)
        except OSError as exc:
            logger.warning("Unable to read Codex rollout: %s", type(exc).__name__)
        return metadata, messages, records

    @staticmethod
    def _turn_context_model(records: list[dict[str, Any]]) -> str | None:
        """Return the most recent model recorded in ``turn_context``.

        Real rollouts never put a model on ``response_item`` messages; it only
        appears here, once per turn.
        """
        model: str | None = None
        for record in records:
            if record.get("type") != "turn_context":
                continue
            payload = record.get("payload")
            if isinstance(payload, dict) and payload.get("model"):
                model = str(payload["model"])
        return model

    @classmethod
    def _cumulative_usage(cls, records: list[dict[str, Any]]) -> TokenUsage | None:
        """Return the last ``token_count`` total, or None when absent.

        ``total_token_usage`` is cumulative per session, so the final record
        supersedes earlier ones instead of adding to them. ``cached_input_tokens``
        is a subset of ``input_tokens`` and is reported separately, not added.
        """
        usage: TokenUsage | None = None
        for record in records:
            if record.get("type") != "event_msg":
                continue
            payload = record.get("payload")
            if not isinstance(payload, dict) or payload.get("type") != "token_count":
                continue
            info = payload.get("info")
            if not isinstance(info, dict):
                continue
            totals = info.get("total_token_usage")
            if not isinstance(totals, dict):
                continue
            usage = TokenUsage(
                input_tokens=cls._token_count(totals.get("input_tokens")),
                output_tokens=cls._token_count(totals.get("output_tokens")),
                cache_read_tokens=cls._token_count(totals.get("cached_input_tokens")),
            )
        return usage

    @staticmethod
    def _session_id(metadata: dict[str, Any], path: Path) -> str:
        value = metadata.get("id") or metadata.get("session_id")
        return str(value)[:255] if value else path.stem.removeprefix("rollout-")[:255]

    def _parse(self, path: Path) -> ClaudeSessionInfo | None:
        if not self._is_safe_rollout(path):
            return None
        try:
            stat = path.stat()
        except OSError:
            return None
        if stat.st_size > MAX_ROLLOUT_BYTES:
            return None
        metadata, messages, records = self._read_file(path)
        session_id = self._session_id(metadata, path)
        if not session_id:
            return None
        timestamps = [self._timestamp(record.get("timestamp")) for record in records]
        timestamps = [value for value in timestamps if value is not None]
        created_at = min(timestamps) if timestamps else datetime.fromtimestamp(stat.st_ctime, UTC)
        last_activity = (
            max(timestamps) if timestamps else datetime.fromtimestamp(stat.st_mtime, UTC)
        )
        model = (
            self._turn_context_model(records)
            or next((message.model for message in messages if message.model), None)
            or "unknown"
        )
        cwd = str(metadata.get("cwd") or "")
        user_count = sum(message.type == MessageType.USER for message in messages)
        assistant_count = sum(message.type == MessageType.ASSISTANT for message in messages)
        tool_count = sum(message.type == MessageType.TOOL_USE for message in messages)
        # A cumulative token_count supersedes per-message usage; only sum the
        # per-message values when the rollout carries no token_count record.
        cumulative = self._cumulative_usage(records)
        if cumulative is not None:
            input_tokens = cumulative.input_tokens
            output_tokens = cumulative.output_tokens
        else:
            input_tokens = sum(message.usage.input_tokens for message in messages if message.usage)
            output_tokens = sum(
                message.usage.output_tokens for message in messages if message.usage
            )
        age = utcnow() - to_aware_utc(last_activity)
        status = (
            SessionStatus.ACTIVE
            if age < timedelta(minutes=5)
            else SessionStatus.IDLE
            if age < timedelta(hours=1)
            else SessionStatus.COMPLETED
        )
        info = ClaudeSessionInfo(
            provider="codex",
            parent_thread_id=str(metadata.get("parent_thread_id"))
            if metadata.get("parent_thread_id")
            else None,
            session_id=session_id,
            slug=path.stem.removeprefix("rollout-")[:255],
            status=status,
            model=model,
            project_path=cwd,
            project_name=Path(cwd).name if cwd else "",
            git_branch="",
            cwd=cwd,
            version=str(metadata.get("cli_version") or ""),
            created_at=created_at,
            last_activity=last_activity,
            message_count=len(messages),
            user_message_count=user_count,
            assistant_message_count=assistant_count,
            tool_call_count=tool_count,
            total_input_tokens=input_tokens,
            total_output_tokens=output_tokens,
            estimated_cost=0.0,
            file_path=str(path),
            file_size=stat.st_size,
            source_user=Path.home().name,
            source_path=str(self.sessions_dir),
        )
        self._files_by_id[session_id] = path
        return info

    def discover_sessions(self) -> list[ClaudeSessionInfo]:
        self._files_by_id.clear()
        sessions: list[ClaudeSessionInfo] = []
        for path in self._iter_files():
            info = self._parse(path)
            if info is not None:
                sessions.append(info)
        return sorted(
            sessions, key=lambda session: to_aware_utc(session.last_activity), reverse=True
        )

    def _find_file(self, session_id: str) -> Path | None:
        if session_id in self._files_by_id:
            return self._files_by_id[session_id]
        for path in self._iter_files():
            metadata, _, _ = self._read_file(path)
            if self._session_id(metadata, path) == session_id:
                self._files_by_id[session_id] = path
                return path
        return None

    def get_session_details(self, session_id: str) -> ClaudeSessionDetail | None:
        path = self._find_file(session_id)
        if path is None:
            return None
        info = self._parse(path)
        if info is None:
            return None
        _, messages, _ = self._read_file(path)
        return ClaudeSessionDetail(
            **info.model_dump(),
            recent_messages=messages[-20:],
            messages_truncated=len(messages) > 20,
        )

    def get_session_transcript(
        self, session_id: str, offset: int = 0, limit: int = 100
    ) -> tuple[list[dict[str, Any]], int]:
        path = self._find_file(session_id)
        if path is None:
            return [], 0
        _, _, records = self._read_file(path)
        return records[offset : offset + limit], len(records)

    def get_session_activity(
        self, session_id: str, offset: int = 0, limit: int = 100
    ) -> tuple[list[ActivityEvent], int]:
        """Return normalized activity events for a Codex rollout."""
        path = self._find_file(session_id)
        if path is None:
            return [], 0
        _, messages, _ = self._read_file(path)
        events: list[ActivityEvent] = []
        for index, message in enumerate(messages):
            event_type = {
                MessageType.USER: ActivityEventType.USER,
                MessageType.ASSISTANT: ActivityEventType.ASSISTANT,
                MessageType.TOOL_USE: ActivityEventType.TOOL_USE,
            }.get(message.type)
            if event_type is None:
                continue
            events.append(
                ActivityEvent(
                    id=f"{session_id}:{index}",
                    type=event_type,
                    timestamp=message.timestamp,
                    content=message.content,
                    tool_name=message.tool_name,
                    tool_input=message.tool_input,
                    session_id=session_id,
                )
            )
        return events[offset : offset + limit], len(events)

    def get_new_activity_since_size(
        self, session_id: str, last_size: int
    ) -> tuple[list[ActivityEvent], int]:
        """Compatibility surface for the Claude activity stream contract."""
        details = self.get_session_details(session_id)
        if details is None or details.file_size <= last_size:
            return [], details.file_size if details else last_size
        events, _ = self.get_session_activity(session_id, offset=0, limit=100)
        return events, details.file_size

    def get_session_tasks(self, session_id: str) -> tuple[dict[str, ClaudeCodeTask], list[str]]:
        """Codex task extraction is not exposed until its event semantics stabilize."""
        return {}, []


def get_codex_monitor() -> CodexSessionMonitor:
    """Create a Codex monitor using the configured local sessions root."""
    import os

    return CodexSessionMonitor(os.getenv("CODEX_SESSIONS_DIR") or None)
