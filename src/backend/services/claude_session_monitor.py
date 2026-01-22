"""Claude Code session monitoring service.

Discovers and monitors external Claude Code sessions by scanning
~/.claude/projects/ directory for .jsonl transcript files.
"""

import json
import logging
import os

logger = logging.getLogger(__name__)
from dataclasses import dataclass
from datetime import datetime, timedelta
from pathlib import Path
from typing import AsyncIterator

import httpx

from models.claude_session import (
    ClaudeSessionInfo,
    ClaudeSessionDetail,
    SessionMessage,
    SessionStatus,
    MessageType,
    TokenUsage,
    calculate_cost,
)


@dataclass
class CacheEntry:
    """Cache entry for session file."""

    mtime: float
    file_size: int
    session_info: ClaudeSessionInfo


class SessionFileCache:
    """File-based cache for session parsing results.

    Uses mtime + file_size for cache invalidation.
    """

    def __init__(self):
        self._cache: dict[str, CacheEntry] = {}

    def get(self, file_path: Path) -> ClaudeSessionInfo | None:
        """Get cached session info if still valid.

        Args:
            file_path: Path to .jsonl file

        Returns:
            Cached ClaudeSessionInfo if valid, None if needs refresh
        """
        key = str(file_path)
        if key not in self._cache:
            return None

        entry = self._cache[key]
        try:
            stat = file_path.stat()
            # Check if file changed (mtime or size)
            if stat.st_mtime == entry.mtime and stat.st_size == entry.file_size:
                return entry.session_info
        except OSError:
            # File might have been deleted
            self._cache.pop(key, None)

        return None

    def set(
        self, file_path: Path, session_info: ClaudeSessionInfo, stat: os.stat_result
    ) -> None:
        """Store session info in cache.

        Args:
            file_path: Path to .jsonl file
            session_info: Parsed session info
            stat: File stat result (for mtime/size)
        """
        key = str(file_path)
        self._cache[key] = CacheEntry(
            mtime=stat.st_mtime,
            file_size=stat.st_size,
            session_info=session_info,
        )

    def invalidate(self, file_path: Path) -> None:
        """Remove entry from cache."""
        self._cache.pop(str(file_path), None)

    def clear(self) -> None:
        """Clear all cache entries."""
        self._cache.clear()


# Global cache instance
_session_cache = SessionFileCache()


class ClaudeSessionMonitor:
    """Monitor for external Claude Code sessions."""

    def __init__(self, claude_projects_dir: str | None = None):
        """Initialize the monitor.

        Args:
            claude_projects_dir: Path to Claude projects directory.
                                Defaults to ~/.claude/projects/
        """
        if claude_projects_dir:
            self.projects_dir = Path(claude_projects_dir)
        else:
            self.projects_dir = Path.home() / ".claude" / "projects"

    def discover_sessions(self) -> list[ClaudeSessionInfo]:
        """Discover all sessions in the projects directory.

        Scans all subdirectories for .jsonl files and returns
        session information for each.

        Uses file cache to avoid re-parsing unchanged files.
        """
        sessions = []

        if not self.projects_dir.exists():
            return sessions

        # Iterate through project directories
        for project_dir in self.projects_dir.iterdir():
            if not project_dir.is_dir():
                continue

            # Find all .jsonl files in project directory
            for jsonl_file in project_dir.glob("*.jsonl"):
                try:
                    # Check cache first
                    cached = _session_cache.get(jsonl_file)
                    if cached is not None:
                        sessions.append(cached)
                        continue

                    # Cache miss - parse file
                    session_info = self._parse_session_file(jsonl_file, project_dir.name)
                    if session_info:
                        sessions.append(session_info)
                except Exception as e:
                    print(f"Error parsing {jsonl_file}: {e}")
                    continue

        # Sort by last activity (most recent first)
        # Normalize datetimes for comparison (strip timezone info for sorting)
        def get_sort_key(s):
            ts = s.last_activity
            if ts.tzinfo is not None:
                return ts.replace(tzinfo=None)
            return ts

        sessions.sort(key=get_sort_key, reverse=True)
        return sessions

    def _parse_session_file(
        self, file_path: Path, project_path: str
    ) -> ClaudeSessionInfo | None:
        """Parse a .jsonl session file and extract information.

        Args:
            file_path: Path to the .jsonl file
            project_path: Encoded project path (directory name)

        Returns:
            ClaudeSessionInfo or None if file is empty/invalid
        """
        session_id = file_path.stem  # UUID from filename
        stat = file_path.stat()
        file_size = stat.st_size

        if file_size == 0:
            return None

        # Initialize counters
        message_count = 0
        user_message_count = 0
        assistant_message_count = 0
        tool_call_count = 0
        total_input_tokens = 0
        total_output_tokens = 0

        # Session metadata
        slug = ""
        model = "unknown"
        git_branch = ""
        cwd = ""
        version = ""
        created_at = None
        last_activity = None
        last_message_type = None

        with open(file_path, "r", encoding="utf-8") as f:
            for line in f:
                line = line.strip()
                if not line:
                    continue

                try:
                    entry = json.loads(line)
                except json.JSONDecodeError:
                    continue

                message_count += 1

                # Extract metadata from first entries
                if slug == "" and "slug" in entry:
                    slug = entry.get("slug", "")
                if version == "" and "version" in entry:
                    version = entry.get("version", "")
                if git_branch == "" and "gitBranch" in entry:
                    git_branch = entry.get("gitBranch", "")
                if cwd == "" and "cwd" in entry:
                    cwd = entry.get("cwd", "")

                # Extract timestamp
                timestamp_str = entry.get("timestamp")
                if timestamp_str:
                    try:
                        timestamp = datetime.fromisoformat(
                            timestamp_str.replace("Z", "+00:00")
                        )
                        if created_at is None:
                            created_at = timestamp
                        last_activity = timestamp
                    except ValueError:
                        pass

                # Count by message type
                msg_type = entry.get("type", "")
                if msg_type == "user":
                    user_message_count += 1
                    last_message_type = "user"
                elif msg_type == "assistant":
                    assistant_message_count += 1
                    last_message_type = "assistant"

                    # Extract model and usage from assistant messages
                    message_data = entry.get("message", {})
                    if model == "unknown" and "model" in message_data:
                        model = message_data.get("model", "unknown")

                    usage = message_data.get("usage", {})
                    total_input_tokens += usage.get("input_tokens", 0)
                    total_output_tokens += usage.get("output_tokens", 0)

                    # Count tool uses
                    content = message_data.get("content", [])
                    if isinstance(content, list):
                        for item in content:
                            if isinstance(item, dict) and item.get("type") == "tool_use":
                                tool_call_count += 1

        if created_at is None:
            created_at = datetime.utcnow()
        if last_activity is None:
            last_activity = created_at

        # Determine status based on last activity and message type
        # Normalize to naive datetime for comparison
        last_activity_naive = last_activity.replace(tzinfo=None) if last_activity.tzinfo else last_activity
        time_since_activity = datetime.utcnow() - last_activity_naive
        if time_since_activity < timedelta(minutes=5):
            status = SessionStatus.ACTIVE
        elif time_since_activity < timedelta(hours=1):
            status = SessionStatus.IDLE
        else:
            status = SessionStatus.COMPLETED

        # Calculate cost
        estimated_cost = calculate_cost(model, total_input_tokens, total_output_tokens)

        # Extract human-readable project name
        project_name = self._decode_project_path(project_path)

        session_info = ClaudeSessionInfo(
            session_id=session_id,
            slug=slug,
            status=status,
            model=model,
            project_path=project_path,
            project_name=project_name,
            git_branch=git_branch,
            cwd=cwd,
            version=version,
            created_at=created_at,
            last_activity=last_activity,
            message_count=message_count,
            user_message_count=user_message_count,
            assistant_message_count=assistant_message_count,
            tool_call_count=tool_call_count,
            total_input_tokens=total_input_tokens,
            total_output_tokens=total_output_tokens,
            estimated_cost=estimated_cost,
            file_path=str(file_path),
            file_size=file_size,
        )

        # Store in cache for future requests
        _session_cache.set(file_path, session_info, stat)

        return session_info

    def _decode_project_path(self, encoded_path: str) -> str:
        """Decode project path like '-Users-younghwankang-Work-LiveMetro'.

        Returns the last component as the project name.
        """
        # Replace leading dash and convert dashes back to slashes
        # e.g., "-Users-younghwankang-Work-LiveMetro" -> "LiveMetro"
        parts = encoded_path.split("-")
        # Filter out empty parts and get the last non-empty part
        non_empty_parts = [p for p in parts if p]
        if non_empty_parts:
            return non_empty_parts[-1]
        return encoded_path

    def get_session_details(self, session_id: str) -> ClaudeSessionDetail | None:
        """Get detailed information for a specific session.

        Args:
            session_id: Session UUID

        Returns:
            ClaudeSessionDetail with recent messages or None if not found
        """
        # Find the session file
        session_file = None
        project_path = ""

        for project_dir in self.projects_dir.iterdir():
            if not project_dir.is_dir():
                continue

            candidate = project_dir / f"{session_id}.jsonl"
            if candidate.exists():
                session_file = candidate
                project_path = project_dir.name
                break

        if session_file is None:
            return None

        # Parse basic info
        basic_info = self._parse_session_file(session_file, project_path)
        if basic_info is None:
            return None

        # Read recent messages
        recent_messages = []
        current_task = None

        with open(session_file, "r", encoding="utf-8") as f:
            lines = f.readlines()

        # Parse last 50 lines for recent messages
        for line in lines[-50:]:
            line = line.strip()
            if not line:
                continue

            try:
                entry = json.loads(line)
            except json.JSONDecodeError:
                continue

            msg_type_str = entry.get("type", "")
            timestamp_str = entry.get("timestamp", "")

            try:
                timestamp = datetime.fromisoformat(
                    timestamp_str.replace("Z", "+00:00")
                )
            except ValueError:
                timestamp = datetime.utcnow()

            # Map to MessageType enum
            if msg_type_str == "user":
                msg_type = MessageType.USER
                message_data = entry.get("message", {})
                content = message_data.get("content", "")
                if isinstance(content, list) and len(content) > 0:
                    first_item = content[0]
                    if isinstance(first_item, dict):
                        content = first_item.get("text", "")
                    else:
                        content = str(first_item)

                recent_messages.append(
                    SessionMessage(
                        type=msg_type,
                        timestamp=timestamp,
                        content=content[:500] if content else None,  # Truncate long content
                    )
                )

                # Track current task from user messages
                if content:
                    current_task = content[:200]

            elif msg_type_str == "assistant":
                msg_type = MessageType.ASSISTANT
                message_data = entry.get("message", {})
                model = message_data.get("model")

                # Extract text content
                content = ""
                tool_name = None
                tool_id = None
                tool_input = None
                content_list = message_data.get("content", [])

                if isinstance(content_list, list):
                    for item in content_list:
                        if isinstance(item, dict):
                            if item.get("type") == "text":
                                content = item.get("text", "")[:500]
                            elif item.get("type") == "tool_use":
                                tool_name = item.get("name")
                                tool_id = item.get("id")
                                tool_input = item.get("input")

                # Extract usage
                usage_data = message_data.get("usage", {})
                usage = TokenUsage(
                    input_tokens=usage_data.get("input_tokens", 0),
                    output_tokens=usage_data.get("output_tokens", 0),
                    cache_read_tokens=usage_data.get("cache_read_input_tokens", 0),
                    cache_creation_tokens=usage_data.get("cache_creation_input_tokens", 0),
                )

                if tool_name:
                    recent_messages.append(
                        SessionMessage(
                            type=MessageType.TOOL_USE,
                            timestamp=timestamp,
                            model=model,
                            tool_name=tool_name,
                            tool_id=tool_id,
                            tool_input=tool_input,
                            usage=usage,
                        )
                    )
                else:
                    recent_messages.append(
                        SessionMessage(
                            type=msg_type,
                            timestamp=timestamp,
                            model=model,
                            content=content,
                            usage=usage,
                        )
                    )

            elif msg_type_str == "progress":
                # Progress messages indicate ongoing work
                message_data = entry.get("message", {})
                content = message_data.get("content", "")
                if content:
                    recent_messages.append(
                        SessionMessage(
                            type=MessageType.PROGRESS,
                            timestamp=timestamp,
                            content=content[:200],
                        )
                    )

        # Keep only last 20 messages for the response
        recent_messages = recent_messages[-20:]

        return ClaudeSessionDetail(
            **basic_info.model_dump(),
            recent_messages=recent_messages,
            current_task=current_task,
        )

    async def watch_session(
        self, session_id: str, interval_seconds: float = 1.0
    ) -> AsyncIterator[ClaudeSessionDetail]:
        """Watch a session for changes and yield updates.

        Args:
            session_id: Session UUID to watch
            interval_seconds: Polling interval

        Yields:
            ClaudeSessionDetail on each update
        """
        import asyncio

        last_size = 0

        while True:
            details = self.get_session_details(session_id)
            if details is None:
                break

            # Only yield if file size changed (new content)
            if details.file_size != last_size:
                last_size = details.file_size
                yield details

            await asyncio.sleep(interval_seconds)

    def _get_summary_cache_path(self, session_id: str) -> Path:
        """Get cache file path for session summary.

        Args:
            session_id: Session UUID

        Returns:
            Path to the summary cache file
        """
        return Path.home() / ".claude" / "session_summaries" / f"{session_id}.txt"

    def _get_first_messages(
        self, session_id: str, limit: int = 5
    ) -> list[dict]:
        """Get first N user/assistant messages from a session.

        Args:
            session_id: Session UUID
            limit: Maximum number of messages to return

        Returns:
            List of message dicts with type and content
        """
        # Find session file
        session_file = None
        for project_dir in self.projects_dir.iterdir():
            if not project_dir.is_dir():
                continue
            candidate = project_dir / f"{session_id}.jsonl"
            if candidate.exists():
                session_file = candidate
                break

        if session_file is None:
            return []

        messages = []
        with open(session_file, "r", encoding="utf-8") as f:
            for line in f:
                if len(messages) >= limit:
                    break

                line = line.strip()
                if not line:
                    continue

                try:
                    entry = json.loads(line)
                except json.JSONDecodeError:
                    continue

                msg_type = entry.get("type", "")
                if msg_type == "user":
                    message_data = entry.get("message", {})
                    content = message_data.get("content", "")
                    if isinstance(content, list) and len(content) > 0:
                        first_item = content[0]
                        if isinstance(first_item, dict):
                            content = first_item.get("text", "")
                        else:
                            content = str(first_item)
                    if content:
                        messages.append({"role": "user", "content": content[:500]})

                elif msg_type == "assistant":
                    message_data = entry.get("message", {})
                    content_list = message_data.get("content", [])
                    if isinstance(content_list, list):
                        for item in content_list:
                            if isinstance(item, dict) and item.get("type") == "text":
                                text = item.get("text", "")
                                if text:
                                    messages.append({"role": "assistant", "content": text[:500]})
                                    break

        return messages

    def _format_messages_for_prompt(self, messages: list[dict]) -> str:
        """Format messages for LLM prompt.

        Args:
            messages: List of message dicts

        Returns:
            Formatted string for prompt
        """
        formatted = []
        for msg in messages:
            role = "사용자" if msg["role"] == "user" else "어시스턴트"
            content = msg["content"][:200]  # Truncate for prompt
            formatted.append(f"{role}: {content}")
        return "\n".join(formatted)

    async def generate_summary(self, session_id: str) -> str:
        """Generate AI summary for a session.

        Uses Haiku model for cost efficiency. Caches result to file.

        Args:
            session_id: Session UUID

        Returns:
            Generated summary string
        """
        logger = logging.getLogger(__name__)

        # 1. Check cache
        cache_path = self._get_summary_cache_path(session_id)
        if cache_path.exists():
            logger.info(f"Using cached summary for session {session_id}")
            return cache_path.read_text().strip()

        # 2. Get first messages
        messages = self._get_first_messages(session_id, limit=5)
        if not messages:
            return "대화 내용 없음"

        # 3. Call Haiku for summary
        prompt = f"""다음 대화의 주제를 한 문장(30자 이내)으로 요약해주세요.
마침표 없이 간결하게 작성하세요.

대화:
{self._format_messages_for_prompt(messages)}

요약:"""

        try:
            ollama_base_url = os.getenv("OLLAMA_BASE_URL", "http://localhost:11434")
            ollama_model = os.getenv("OLLAMA_MODEL", "qwen2.5:7b")

            async with httpx.AsyncClient(timeout=60.0) as client:
                response = await client.post(
                    f"{ollama_base_url}/api/generate",
                    json={
                        "model": ollama_model,
                        "prompt": prompt,
                        "stream": False,
                        "options": {
                            "num_predict": 50,
                            "temperature": 0.3,
                        },
                    },
                )
                response.raise_for_status()
                data = response.json()
                summary = data.get("response", "").strip()

                # Clean up: take first line only
                if "\n" in summary:
                    summary = summary.split("\n")[0].strip()

            # 4. Save to cache
            cache_path.parent.mkdir(parents=True, exist_ok=True)
            cache_path.write_text(summary)

            logger.info(f"Generated summary for session {session_id}: {summary}")
            return summary

        except Exception as e:
            logger.error(f"Failed to generate summary for {session_id}: {e}")
            return "요약 생성 실패"

    def get_cached_summary(self, session_id: str) -> str | None:
        """Get cached summary if exists.

        Args:
            session_id: Session UUID

        Returns:
            Cached summary or None
        """
        cache_path = self._get_summary_cache_path(session_id)
        if cache_path.exists():
            return cache_path.read_text().strip()
        return None

    def delete_session(self, session_id: str) -> bool:
        """Delete a session file.

        Args:
            session_id: Session UUID

        Returns:
            True if deleted, False if not found
        """
        # Find session file
        for project_dir in self.projects_dir.iterdir():
            if not project_dir.is_dir():
                continue
            session_file = project_dir / f"{session_id}.jsonl"
            if session_file.exists():
                # Delete session file
                session_file.unlink()
                # Also delete summary cache if exists
                cache_path = self._get_summary_cache_path(session_id)
                if cache_path.exists():
                    cache_path.unlink()
                # Invalidate cache
                _session_cache.invalidate(session_file)
                logger.info(f"Deleted session {session_id}")
                return True
        return False

    def delete_empty_sessions(self) -> list[str]:
        """Delete all sessions with 0 messages.

        Returns:
            List of deleted session IDs
        """
        deleted = []
        sessions = self.discover_sessions()

        for session in sessions:
            if session.message_count == 0:
                if self.delete_session(session.session_id):
                    deleted.append(session.session_id)

        logger.info(f"Deleted {len(deleted)} empty sessions")
        return deleted

    def get_empty_sessions(self) -> list[ClaudeSessionInfo]:
        """Get all sessions with 0 messages.

        Returns:
            List of empty sessions
        """
        sessions = self.discover_sessions()
        return [s for s in sessions if s.message_count == 0]

    def get_ghost_sessions(self) -> list[ClaudeSessionInfo]:
        """Get all ghost sessions (message_count > 0 but no real user/assistant messages).

        These sessions have metadata entries but no actual conversation.

        Returns:
            List of ghost sessions
        """
        sessions = self.discover_sessions()
        return [
            s for s in sessions
            if s.message_count > 0
            and s.user_message_count == 0
            and s.assistant_message_count == 0
        ]

    def delete_ghost_sessions(self) -> list[str]:
        """Delete all ghost sessions.

        Returns:
            List of deleted session IDs
        """
        deleted = []
        ghost_sessions = self.get_ghost_sessions()

        for session in ghost_sessions:
            if self.delete_session(session.session_id):
                deleted.append(session.session_id)

        logger.info(f"Deleted {len(deleted)} ghost sessions")
        return deleted

    def is_ghost_session(self, session: ClaudeSessionInfo) -> bool:
        """Check if a session is a ghost session.

        Args:
            session: Session info to check

        Returns:
            True if session has entries but no real messages
        """
        return (
            session.message_count > 0
            and session.user_message_count == 0
            and session.assistant_message_count == 0
        )


# Global monitor instance
_monitor: ClaudeSessionMonitor | None = None


def get_monitor() -> ClaudeSessionMonitor:
    """Get or create the global monitor instance."""
    global _monitor
    if _monitor is None:
        _monitor = ClaudeSessionMonitor()
    return _monitor
