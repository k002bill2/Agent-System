"""Read-only discovery of Codex CLI rollout sessions.

Codex stores one append-only JSONL rollout per thread below ``~/.codex/sessions``.
This adapter deliberately normalizes only the stable metadata/message shapes and
ignores event types that are not useful to the session UI.
"""

from __future__ import annotations

import json
import logging
import os
from collections import deque
from collections.abc import Iterator
from dataclasses import dataclass, field
from datetime import UTC, datetime, timedelta
from pathlib import Path
from typing import Any, NamedTuple

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
from services.session_file_cache import SessionFileCache
from utils.time import to_aware_utc, utcnow

logger = logging.getLogger(__name__)

# Bound what is held in memory, not what the file weighs on disk. A rollout is
# usually large because a handful of tool outputs are huge, not because it holds
# many records — the observed 63.5MB session retains only 22MB once oversized
# lines are skipped, so gating on file size hid whole sessions for no benefit.
MAX_RETAINED_BYTES = 48 * 1024 * 1024
MAX_ROLLOUT_LINE_BYTES = 2 * 1024 * 1024
MAX_ROLLOUT_RECORDS = 100_000
# Even the streaming pass must terminate on a pathological file, since the list
# view scans every rollout on each refresh.
MAX_SCAN_BYTES = 256 * 1024 * 1024
READ_CHUNK_BYTES = 1024 * 1024
# How many trailing messages a session detail shows.
DETAIL_WINDOW = 20


class RolloutScan(NamedTuple):
    """Result of one pass over a rollout file.

    Aggregates are always computed; ``records``/``messages`` are retained only
    when the caller needs the conversation itself. The polled list view uses the
    aggregates alone so its memory cost does not grow with session length.
    """

    metadata: dict[str, Any]
    messages: list[SessionMessage]
    records: list[dict[str, Any]]
    truncated: bool = False
    record_count: int = 0
    first_timestamp: datetime | None = None
    last_timestamp: datetime | None = None
    user_count: int = 0
    assistant_count: int = 0
    tool_count: int = 0
    turn_context_model: str | None = None
    message_model: str | None = None
    cumulative_usage: TokenUsage | None = None
    message_input_tokens: int = 0
    message_output_tokens: int = 0
    tail_messages: tuple[SessionMessage, ...] = ()

    @property
    def message_count(self) -> int:
        """Parsed conversation messages, not raw records."""
        return self.user_count + self.assistant_count + self.tool_count

    @property
    def model(self) -> str:
        """Real rollouts carry the model only in ``turn_context``."""
        return self.turn_context_model or self.message_model or "unknown"

    @property
    def tokens(self) -> tuple[int, int]:
        """A cumulative ``token_count`` supersedes summed per-message usage."""
        if self.cumulative_usage is not None:
            return self.cumulative_usage.input_tokens, self.cumulative_usage.output_tokens
        return self.message_input_tokens, self.message_output_tokens


@dataclass
class _Aggregate:
    """Running totals folded in during a single pass over a rollout."""

    truncated: bool = False
    count: int = 0
    first_timestamp: datetime | None = None
    last_timestamp: datetime | None = None
    user_count: int = 0
    assistant_count: int = 0
    tool_count: int = 0
    turn_context_model: str | None = None
    message_model: str | None = None
    cumulative_usage: TokenUsage | None = None
    message_input_tokens: int = 0
    message_output_tokens: int = 0
    # Kept during the pass so a detail view shows the true tail even when the
    # scan stops early — slicing a retained prefix would show the oldest instead.
    tail_messages: deque[SessionMessage] = field(
        default_factory=lambda: deque(maxlen=DETAIL_WINDOW)
    )

    def absorb(
        self,
        monitor: CodexSessionMonitor,
        record: dict[str, Any],
        message: SessionMessage | None,
    ) -> None:
        timestamp = monitor._timestamp(record.get("timestamp"))
        if timestamp is not None:
            if self.first_timestamp is None or timestamp < self.first_timestamp:
                self.first_timestamp = timestamp
            if self.last_timestamp is None or timestamp > self.last_timestamp:
                self.last_timestamp = timestamp

        payload = record.get("payload")
        record_type = record.get("type")
        if record_type == "turn_context" and isinstance(payload, dict) and payload.get("model"):
            # Later turns win: the model shown is the one most recently used.
            self.turn_context_model = str(payload["model"])
        elif record_type == "event_msg" and isinstance(payload, dict):
            self._absorb_token_count(monitor, payload)

        if message is None:
            return
        if message.type == MessageType.USER:
            self.user_count += 1
        elif message.type == MessageType.ASSISTANT:
            self.assistant_count += 1
        elif message.type == MessageType.TOOL_USE:
            self.tool_count += 1
        if message.model and self.message_model is None:
            self.message_model = message.model
        if message.usage is not None:
            self.message_input_tokens += message.usage.input_tokens
            self.message_output_tokens += message.usage.output_tokens
        self.tail_messages.append(message)

    def _absorb_token_count(self, monitor: CodexSessionMonitor, payload: dict[str, Any]) -> None:
        """Take the latest cumulative total, which supersedes earlier ones."""
        if payload.get("type") != "token_count":
            return
        info = payload.get("info")
        if not isinstance(info, dict):
            return
        totals = info.get("total_token_usage")
        if not isinstance(totals, dict):
            return
        self.cumulative_usage = TokenUsage(
            input_tokens=monitor._token_count(totals.get("input_tokens")),
            output_tokens=monitor._token_count(totals.get("output_tokens")),
            cache_read_tokens=monitor._token_count(totals.get("cached_input_tokens")),
        )

    def to_scan(
        self,
        metadata: dict[str, Any],
        messages: list[SessionMessage],
        records: list[dict[str, Any]],
    ) -> RolloutScan:
        return RolloutScan(
            metadata=metadata,
            messages=messages,
            records=records,
            truncated=self.truncated,
            record_count=self.count,
            first_timestamp=self.first_timestamp,
            last_timestamp=self.last_timestamp,
            user_count=self.user_count,
            assistant_count=self.assistant_count,
            tool_count=self.tool_count,
            turn_context_model=self.turn_context_model,
            message_model=self.message_model,
            cumulative_usage=self.cumulative_usage,
            message_input_tokens=self.message_input_tokens,
            message_output_tokens=self.message_output_tokens,
            tail_messages=tuple(self.tail_messages),
        )


class CodexSessionMonitor:
    """Discover Codex rollout files without accepting caller-controlled paths."""

    def __init__(self, sessions_dir: str | Path | None = None) -> None:
        self.sessions_dir = (
            Path(sessions_dir) if sessions_dir else Path.home() / ".codex" / "sessions"
        )
        self._files_by_id: dict[str, Path] = {}
        self._cache = SessionFileCache()

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

    @staticmethod
    def _iter_lines(stream: Any, agg: _Aggregate) -> Iterator[bytes]:
        """Yield lines that fit the per-line cap, never holding a bigger one.

        Iterating a file object would materialize a whole line before its size
        could be checked, so a single multi-hundred-megabyte tool output could
        exhaust memory. Reading fixed chunks lets an oversized line be discarded
        as it streams past.
        """
        buffer = bytearray()
        dropping = False
        scanned = 0
        while chunk := stream.read(READ_CHUNK_BYTES):
            scanned += len(chunk)
            if scanned > MAX_SCAN_BYTES:
                agg.truncated = True
                return
            start = 0
            while (newline := chunk.find(b"\n", start)) != -1:
                if dropping:
                    dropping = False
                    agg.truncated = True
                else:
                    buffer += chunk[start:newline]
                    if len(buffer) > MAX_ROLLOUT_LINE_BYTES:
                        agg.truncated = True
                    else:
                        yield bytes(buffer)
                buffer.clear()
                start = newline + 1
            if dropping:
                continue
            buffer += chunk[start:]
            if len(buffer) > MAX_ROLLOUT_LINE_BYTES:
                buffer.clear()
                dropping = True
        if dropping:
            agg.truncated = True
        elif buffer:
            if len(buffer) > MAX_ROLLOUT_LINE_BYTES:
                agg.truncated = True
            else:
                yield bytes(buffer)

    def _read_file(self, path: Path, *, retain: bool = True) -> RolloutScan:
        """Scan a rollout once.

        ``retain=False`` keeps memory flat for the polled list view; the record
        and message lists come back empty while the aggregates stay accurate.
        """
        agg = _Aggregate()
        metadata: dict[str, Any] = {}
        messages: list[SessionMessage] = []
        records: list[dict[str, Any]] = []
        if not self._is_safe_rollout(path):
            return RolloutScan(metadata, messages, records)
        retained = 0
        try:
            # Read bytes: an oversized line is skipped without ever being decoded
            # into a str, so the huge tool outputs that make these files large
            # never become Python objects.
            with path.open("rb") as stream:
                for line in self._iter_lines(stream, agg):
                    if retain:
                        retained += len(line)
                        if retained > MAX_RETAINED_BYTES:
                            agg.truncated = True
                            break
                    try:
                        record = json.loads(line)
                    except (json.JSONDecodeError, UnicodeDecodeError):
                        continue
                    if not isinstance(record, dict):
                        continue
                    agg.count += 1
                    if agg.count > MAX_ROLLOUT_RECORDS:
                        agg.count -= 1
                        agg.truncated = True
                        break
                    if record.get("type") == "session_meta" and not metadata:
                        payload = record.get("payload")
                        if isinstance(payload, dict):
                            metadata = payload
                    message = self._message_from_record(record)
                    agg.absorb(self, record, message)
                    if retain:
                        records.append(record)
                        if message is not None:
                            messages.append(message)
        except OSError as exc:
            logger.warning("Unable to read Codex rollout: %s", type(exc).__name__)
        if agg.truncated:
            logger.info("Codex rollout partially parsed; counts are a lower bound: %s", path.name)
        return agg.to_scan(metadata, messages, records)

    @staticmethod
    def _session_id(metadata: dict[str, Any], path: Path) -> str:
        value = metadata.get("id") or metadata.get("session_id")
        return str(value)[:255] if value else path.stem.removeprefix("rollout-")[:255]

    @staticmethod
    def _status_for(last_activity: datetime) -> SessionStatus:
        """Derive status from the clock.

        This depends on ``utcnow()``, not on file contents, so it must be
        recomputed whenever a cached record is reused — a rollout that stops
        changing is exactly a session that goes idle and then completes.
        """
        age = utcnow() - to_aware_utc(last_activity)
        if age < timedelta(minutes=5):
            return SessionStatus.ACTIVE
        if age < timedelta(hours=1):
            return SessionStatus.IDLE
        return SessionStatus.COMPLETED

    def _parse(self, path: Path) -> ClaudeSessionInfo | None:
        if not self._is_safe_rollout(path):
            return None
        try:
            stat = path.stat()
        except OSError:
            return None
        cached = self._cache.get(path)
        if cached is not None:
            # Still register the file so detail lookups resolve without a rescan.
            self._files_by_id[cached.session_id] = path
            # Status is clock-derived, so it cannot be served from the cache.
            return cached.model_copy(update={"status": self._status_for(cached.last_activity)})
        # The list view is polled continuously, so it streams: no record or
        # message list is retained regardless of how long the session is.
        scan = self._read_file(path, retain=False)
        metadata = scan.metadata
        session_id = self._session_id(metadata, path)
        if not session_id:
            return None
        created_at = scan.first_timestamp or datetime.fromtimestamp(stat.st_ctime, UTC)
        mtime = datetime.fromtimestamp(stat.st_mtime, UTC)
        # A truncated scan stops before the end of the file, so its last record
        # is not the last activity — the file's mtime is, and using the prefix
        # would show an active session as idle.
        last_activity = (
            mtime if scan.truncated or scan.last_timestamp is None else scan.last_timestamp
        )
        model = scan.model
        cwd = str(metadata.get("cwd") or "")
        input_tokens, output_tokens = scan.tokens
        status = self._status_for(last_activity)
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
            message_count=scan.message_count,
            user_message_count=scan.user_count,
            assistant_message_count=scan.assistant_count,
            tool_call_count=scan.tool_count,
            total_input_tokens=input_tokens,
            total_output_tokens=output_tokens,
            estimated_cost=0.0,
            file_path=str(path),
            file_size=stat.st_size,
            records_truncated=scan.truncated,
            source_user=Path.home().name,
            source_path=str(self.sessions_dir),
        )
        self._files_by_id[session_id] = path
        self._cache.set(path, info, stat)
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
            metadata = self._read_file(path).metadata
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
        # The tail is collected during the pass, so it stays the genuine last
        # window even if the scan stopped early — and nothing is retained.
        scan = self._read_file(path, retain=False)
        return ClaudeSessionDetail(
            **info.model_dump(),
            recent_messages=list(scan.tail_messages),
            messages_truncated=scan.message_count > DETAIL_WINDOW or scan.truncated,
        )

    def get_session_transcript(
        self, session_id: str, offset: int = 0, limit: int = 100
    ) -> tuple[list[dict[str, Any]], int]:
        path = self._find_file(session_id)
        if path is None:
            return [], 0
        records = self._read_file(path).records
        return records[offset : offset + limit], len(records)

    def get_session_activity(
        self, session_id: str, offset: int = 0, limit: int = 100
    ) -> tuple[list[ActivityEvent], int]:
        """Return normalized activity events for a Codex rollout."""
        path = self._find_file(session_id)
        if path is None:
            return [], 0
        messages = self._read_file(path).messages
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


_monitor: CodexSessionMonitor | None = None


def get_codex_monitor() -> CodexSessionMonitor:
    """Get or create the global monitor instance.

    One list request reaches this from several routes, and the dashboard polls
    it continuously — a fresh instance each time would throw away the parse
    cache and rescan every rollout.
    """
    global _monitor
    if _monitor is None:
        _monitor = CodexSessionMonitor(os.getenv("CODEX_SESSIONS_DIR") or None)
    return _monitor
