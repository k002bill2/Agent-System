"""Claude Code session monitoring service.

Discovers and monitors external Claude Code sessions by scanning
~/.claude/projects/ directory for .jsonl transcript files.
"""

import json
import logging
import os

logger = logging.getLogger(__name__)
from collections.abc import AsyncIterator
from dataclasses import dataclass
from datetime import datetime, timedelta
from pathlib import Path

import httpx

from models.claude_session import (
    ActivityEvent,
    ActivityEventType,
    ClaudeCodeTask,
    ClaudeCodeTaskStatus,
    ClaudeSessionDetail,
    ClaudeSessionInfo,
    MessageType,
    SessionMessage,
    SessionStatus,
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

    def set(self, file_path: Path, session_info: ClaudeSessionInfo, stat: os.stat_result) -> None:
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

    def __init__(
        self,
        claude_projects_dirs: list[str] | None = None,
        include_external: bool = True,
    ):
        """Initialize the monitor.

        Args:
            claude_projects_dirs: List of paths to Claude projects directories.
                                  Defaults to ~/.claude/projects/
            include_external: Whether to include paths from CLAUDE_EXTERNAL_PROJECTS env var.
        """
        self.projects_dirs: list[Path] = []
        self._external_paths: list[str] = []  # Runtime added paths

        # Default path (current user)
        default_path = Path.home() / ".claude" / "projects"
        if default_path.exists():
            self.projects_dirs.append(default_path)

        # Custom paths from constructor
        if claude_projects_dirs:
            for p in claude_projects_dirs:
                path = Path(p)
                if path.exists() and path not in self.projects_dirs:
                    self.projects_dirs.append(path)

        # External paths from environment variable
        if include_external:
            external_env = os.getenv("CLAUDE_EXTERNAL_PROJECTS", "")
            if external_env:
                for p in external_env.split(","):
                    p = p.strip()
                    if p:
                        path = Path(p)
                        if path.exists() and path not in self.projects_dirs:
                            self.projects_dirs.append(path)
                            logger.info(f"Added external projects path: {path}")

        # Legacy support: single dir
        self.projects_dir = self.projects_dirs[0] if self.projects_dirs else default_path

    def add_external_path(self, path: str) -> bool:
        """Add an external projects path at runtime.

        Args:
            path: Path to Claude projects directory

        Returns:
            True if added, False if path doesn't exist or already added
        """
        p = Path(path)
        if not p.exists():
            return False
        if p in self.projects_dirs:
            return False

        self.projects_dirs.append(p)
        self._external_paths.append(path)
        logger.info(f"Added external path at runtime: {path}")
        return True

    def remove_external_path(self, path: str) -> bool:
        """Remove an external projects path.

        Args:
            path: Path to remove

        Returns:
            True if removed, False if not found
        """
        p = Path(path)
        if p not in self.projects_dirs:
            return False

        # Don't remove the default path
        default_path = Path.home() / ".claude" / "projects"
        if p == default_path:
            return False

        self.projects_dirs.remove(p)
        if path in self._external_paths:
            self._external_paths.remove(path)
        logger.info(f"Removed external path: {path}")
        return True

    def get_external_paths(self) -> list[str]:
        """Get list of external paths (non-default paths)."""
        default_path = Path.home() / ".claude" / "projects"
        return [str(p) for p in self.projects_dirs if p != default_path]

    def _extract_user_from_path(self, path: Path) -> str:
        """Extract username from a projects path.

        Args:
            path: Path like /Users/username/.claude/projects

        Returns:
            Username or empty string if not extractable
        """
        # Pattern: /Users/<username>/.claude/projects
        # or /home/<username>/.claude/projects
        parts = path.parts
        try:
            if "Users" in parts:
                idx = parts.index("Users")
                if idx + 1 < len(parts):
                    return parts[idx + 1]
            elif "home" in parts:
                idx = parts.index("home")
                if idx + 1 < len(parts):
                    return parts[idx + 1]
        except (ValueError, IndexError):
            pass

        return ""

    def _get_current_user(self) -> str:
        """Get current system username."""
        return Path.home().name

    def discover_sessions(self, source_user: str | None = None) -> list[ClaudeSessionInfo]:
        """Discover all sessions in all projects directories.

        Scans all subdirectories for .jsonl files and returns
        session information for each.

        Uses file cache to avoid re-parsing unchanged files.

        Args:
            source_user: Optional filter for specific user's sessions only

        Returns:
            List of session info sorted by last activity
        """
        sessions = []

        # Iterate through all projects directories
        for projects_dir in self.projects_dirs:
            if not projects_dir.exists():
                continue

            user = self._extract_user_from_path(projects_dir)
            source_path = str(projects_dir)

            # Skip if filtering by user and this isn't the target
            if source_user and user != source_user:
                continue

            # Iterate through project directories
            for project_dir in projects_dir.iterdir():
                if not project_dir.is_dir():
                    continue

                # Find all .jsonl files in project directory (including subagents)
                for jsonl_file in project_dir.glob("**/*.jsonl"):
                    try:
                        # Check cache first
                        cached = _session_cache.get(jsonl_file)
                        if cached is not None:
                            # Update source info from cache (may have changed)
                            cached.source_user = user
                            cached.source_path = source_path
                            sessions.append(cached)
                            continue

                        # Cache miss - parse file
                        session_info = self._parse_session_file(
                            jsonl_file,
                            project_dir.name,
                            source_user=user,
                            source_path=source_path,
                        )
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

    def get_unique_source_users(self) -> list[str]:
        """Get list of unique source users from all discovered sessions.

        Returns:
            List of unique usernames
        """
        sessions = self.discover_sessions()
        users = set()
        for s in sessions:
            if s.source_user:
                users.add(s.source_user)
        return sorted(users)

    def get_unique_projects(self) -> list[str]:
        """Get list of unique project names from all discovered sessions.

        Returns:
            List of unique project names
        """
        sessions = self.discover_sessions()
        projects = set()
        for s in sessions:
            if s.project_name:
                projects.add(s.project_name)
        return sorted(projects)

    def _parse_session_file(
        self,
        file_path: Path,
        project_path: str,
        source_user: str = "",
        source_path: str = "",
    ) -> ClaudeSessionInfo | None:
        """Parse a .jsonl session file and extract information.

        Args:
            file_path: Path to the .jsonl file
            project_path: Encoded project path (directory name)
            source_user: Username who owns this session
            source_path: Base path where session was found

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

        with open(file_path, encoding="utf-8") as f:
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
                        timestamp = datetime.fromisoformat(timestamp_str.replace("Z", "+00:00"))
                        if created_at is None:
                            created_at = timestamp
                        last_activity = timestamp
                    except ValueError:
                        pass

                # Count by message type
                msg_type = entry.get("type", "")
                if msg_type == "user":
                    user_message_count += 1
                elif msg_type == "assistant":
                    assistant_message_count += 1

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
        last_activity_naive = (
            last_activity.replace(tzinfo=None) if last_activity.tzinfo else last_activity
        )
        time_since_activity = datetime.utcnow() - last_activity_naive
        if time_since_activity < timedelta(minutes=5):
            status = SessionStatus.ACTIVE
        elif time_since_activity < timedelta(hours=1):
            status = SessionStatus.IDLE
        else:
            status = SessionStatus.COMPLETED

        # Calculate cost
        estimated_cost = calculate_cost(model, total_input_tokens, total_output_tokens)

        # Extract human-readable project name from cwd (preferred) or encoded path (fallback)
        project_name = self._extract_project_name(cwd, project_path)

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
            source_user=source_user,
            source_path=source_path,
        )

        # Store in cache for future requests
        _session_cache.set(file_path, session_info, stat)

        return session_info

    def _extract_project_name(self, cwd: str, encoded_path: str) -> str:
        """Extract human-readable project name.

        Prefers cwd (original path from jsonl) over encoded path,
        as cwd preserves spaces and special characters correctly.

        Args:
            cwd: Original working directory from session (e.g., "/Users/.../My Project")
            encoded_path: Encoded folder name (e.g., "-Users-...-My-Project")

        Returns:
            Last directory component as project name
        """
        # Prefer cwd as it preserves original path with spaces/special chars
        if cwd:
            # Extract last directory component from cwd
            # e.g., "/Users/user/Library/Mobile Documents/iCloud~md~obsidian/Documents/My Vault"
            # -> "My Vault"
            from pathlib import PurePath

            name = PurePath(cwd).name
            if name:
                return name

        # Fallback: decode from encoded path (lossy - spaces become dashes)
        return self._decode_project_path(encoded_path)

    def _decode_project_path(self, encoded_path: str) -> str:
        """Decode project path like '-Users-username-Work-MyProject'.

        Note: This is a lossy operation as spaces, tildes, and slashes all become dashes.
        Prefer using cwd from session data when available.

        Returns the last component as the project name.
        """
        # e.g., "-Users-username-Work-MyProject" -> "MyProject"
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
        # Find the session file across all projects directories (including subagent dirs)
        session_file = None
        project_path = ""
        source_user = ""
        source_path = ""

        for projects_dir in self.projects_dirs:
            if not projects_dir.exists():
                continue

            for project_dir in projects_dir.iterdir():
                if not project_dir.is_dir():
                    continue

                # Search recursively for session file (supports subagent directories)
                for candidate in project_dir.glob(f"**/{session_id}.jsonl"):
                    if candidate.exists():
                        session_file = candidate
                        project_path = project_dir.name
                        source_user = self._extract_user_from_path(projects_dir)
                        source_path = str(projects_dir)
                        break

                if session_file:
                    break

            if session_file:
                break

        if session_file is None:
            return None

        # Parse basic info
        basic_info = self._parse_session_file(
            session_file,
            project_path,
            source_user=source_user,
            source_path=source_path,
        )
        if basic_info is None:
            return None

        # Read recent messages
        recent_messages = []
        current_task = None

        with open(session_file, encoding="utf-8") as f:
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
                timestamp = datetime.fromisoformat(timestamp_str.replace("Z", "+00:00"))
            except ValueError:
                timestamp = datetime.utcnow()

            # Map to MessageType enum
            if msg_type_str == "user":
                message_data = entry.get("message", {})
                content = message_data.get("content", "")

                # Check if this is a tool_result (Claude API sends tool results as "user" type)
                if isinstance(content, list) and len(content) > 0:
                    first_item = content[0]
                    if isinstance(first_item, dict) and first_item.get("type") == "tool_result":
                        # This is a tool_result, not a real user message
                        tool_use_id = first_item.get("tool_use_id", "")
                        result_content = first_item.get("content", "")
                        if isinstance(result_content, list):
                            # Extract text from content blocks
                            texts = [
                                c.get("text", "")
                                for c in result_content
                                if isinstance(c, dict) and c.get("type") == "text"
                            ]
                            result_content = "\n".join(texts) if texts else ""
                        elif not isinstance(result_content, str):
                            result_content = str(result_content) if result_content else ""

                        recent_messages.append(
                            SessionMessage(
                                type=MessageType.TOOL_RESULT,
                                timestamp=timestamp,
                                tool_id=tool_use_id,
                                content=result_content[:500] if result_content else None,
                            )
                        )
                        continue

                    # Normal user message with content blocks
                    if isinstance(first_item, dict):
                        content = first_item.get("text", "")
                    else:
                        content = str(first_item)

                # Skip empty user messages (system-generated, not real user input)
                if not content or (isinstance(content, str) and not content.strip()):
                    continue

                recent_messages.append(
                    SessionMessage(
                        type=MessageType.USER,
                        timestamp=timestamp,
                        content=content[:500] if content else None,
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
                elif content and content.strip():
                    # Skip assistant messages with empty content (e.g., thinking-only blocks)
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

        Uses SUMMARY_CACHE_DIR env var if set, otherwise falls back to
        ~/.claude/session_summaries/. In Docker, ~/.claude is read-only,
        so we use /app/data/summaries instead.

        Args:
            session_id: Session UUID

        Returns:
            Path to the summary cache file
        """
        cache_dir = os.getenv("SUMMARY_CACHE_DIR", "")
        if cache_dir:
            return Path(cache_dir) / f"{session_id}.txt"

        # In Docker (CLAUDE_HOME is set), use /app/data/summaries to avoid read-only mount
        claude_home = os.getenv("CLAUDE_HOME", "")
        if claude_home:
            return Path("/app/data/summaries") / f"{session_id}.txt"

        return Path.home() / ".claude" / "session_summaries" / f"{session_id}.txt"

    def _get_first_messages(self, session_id: str, limit: int = 5) -> list[dict]:
        """Get first N user/assistant messages from a session.

        Args:
            session_id: Session UUID
            limit: Maximum number of messages to return

        Returns:
            List of message dicts with type and content
        """
        # Find session file across all projects directories (including subagent dirs)
        session_file = None
        for projects_dir in self.projects_dirs:
            if not projects_dir.exists():
                continue
            for project_dir in projects_dir.iterdir():
                if not project_dir.is_dir():
                    continue
                # Search recursively for session file
                for candidate in project_dir.glob(f"**/{session_id}.jsonl"):
                    if candidate.exists():
                        session_file = candidate
                        break
                if session_file:
                    break
            if session_file:
                break

        if session_file is None:
            return []

        messages = []
        with open(session_file, encoding="utf-8") as f:
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

            async with httpx.AsyncClient(timeout=120.0) as client:
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
        # Find session file across all projects directories (including subagent dirs)
        for projects_dir in self.projects_dirs:
            if not projects_dir.exists():
                continue
            for project_dir in projects_dir.iterdir():
                if not project_dir.is_dir():
                    continue
                # Search recursively for session file
                for session_file in project_dir.glob(f"**/{session_id}.jsonl"):
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
            s
            for s in sessions
            if s.message_count > 0 and s.user_message_count == 0 and s.assistant_message_count == 0
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

    def _find_session_file(self, session_id: str) -> Path | None:
        """Find session file by ID across all projects directories.

        Args:
            session_id: Session UUID

        Returns:
            Path to session file or None if not found
        """
        for projects_dir in self.projects_dirs:
            if not projects_dir.exists():
                continue
            for project_dir in projects_dir.iterdir():
                if not project_dir.is_dir():
                    continue
                for candidate in project_dir.glob(f"**/{session_id}.jsonl"):
                    if candidate.exists():
                        return candidate
        return None

    def get_session_activity(
        self,
        session_id: str,
        offset: int = 0,
        limit: int = 100,
        since: datetime | None = None,
    ) -> tuple[list[ActivityEvent], int]:
        """Get activity events from a session.

        Extracts user messages, assistant messages, tool uses, and tool results
        as activity events for Dashboard display.

        Args:
            session_id: Session UUID
            offset: Starting offset for pagination
            limit: Maximum events to return
            since: Only return events after this timestamp

        Returns:
            Tuple of (events list, total count)
        """
        session_file = self._find_session_file(session_id)
        if session_file is None:
            return [], 0

        events: list[ActivityEvent] = []
        total_count = 0

        with open(session_file, encoding="utf-8") as f:
            for line_num, line in enumerate(f):
                line = line.strip()
                if not line:
                    continue

                try:
                    entry = json.loads(line)
                except json.JSONDecodeError:
                    continue

                # Extract timestamp
                timestamp_str = entry.get("timestamp", "")
                try:
                    timestamp = datetime.fromisoformat(timestamp_str.replace("Z", "+00:00"))
                except ValueError:
                    timestamp = datetime.utcnow()

                # Filter by since timestamp
                if since is not None:
                    since_naive = since.replace(tzinfo=None) if since.tzinfo else since
                    ts_naive = timestamp.replace(tzinfo=None) if timestamp.tzinfo else timestamp
                    if ts_naive <= since_naive:
                        continue

                msg_type = entry.get("type", "")
                event_id = f"{session_id}_{line_num}"

                if msg_type == "user":
                    message_data = entry.get("message", {})
                    content = message_data.get("content", "")

                    # Check if this is a tool_result (Claude API sends tool results as "user" type)
                    if isinstance(content, list) and len(content) > 0:
                        first_item = content[0]
                        if isinstance(first_item, dict) and first_item.get("type") == "tool_result":
                            # This is a tool_result, not a real user message
                            total_count += 1
                            if total_count > offset and len(events) < limit:
                                result_content = first_item.get("content", "")
                                if isinstance(result_content, list):
                                    texts = [
                                        c.get("text", "")
                                        for c in result_content
                                        if isinstance(c, dict) and c.get("type") == "text"
                                    ]
                                    result_content = "\n".join(texts) if texts else ""
                                elif not isinstance(result_content, str):
                                    result_content = str(result_content) if result_content else ""

                                events.append(
                                    ActivityEvent(
                                        id=event_id,
                                        type=ActivityEventType.TOOL_RESULT,
                                        timestamp=timestamp,
                                        tool_result=result_content[:500] if result_content else None,
                                        session_id=session_id,
                                    )
                                )
                            continue

                        # Normal user message with content blocks
                        if isinstance(first_item, dict):
                            content = first_item.get("text", "")
                        else:
                            content = str(first_item)

                    # Skip empty user messages (system-generated, not real user input)
                    if not content or (isinstance(content, str) and not content.strip()):
                        continue

                    total_count += 1
                    if total_count > offset and len(events) < limit:
                        events.append(
                            ActivityEvent(
                                id=event_id,
                                type=ActivityEventType.USER,
                                timestamp=timestamp,
                                content=content[:1000] if content else None,
                                session_id=session_id,
                            )
                        )

                elif msg_type == "assistant":
                    message_data = entry.get("message", {})
                    content_list = message_data.get("content", [])

                    if isinstance(content_list, list):
                        for item in content_list:
                            if isinstance(item, dict):
                                item_type = item.get("type", "")

                                if item_type == "text":
                                    text_content = item.get("text", "")
                                    # Skip empty text blocks (e.g., thinking-only responses)
                                    if text_content and text_content.strip():
                                        total_count += 1
                                        if total_count > offset and len(events) < limit:
                                            events.append(
                                                ActivityEvent(
                                                    id=f"{event_id}_text",
                                                    type=ActivityEventType.ASSISTANT,
                                                    timestamp=timestamp,
                                                    content=text_content[:1000],
                                                    session_id=session_id,
                                                )
                                            )

                                elif item_type == "tool_use":
                                    total_count += 1
                                    if total_count > offset and len(events) < limit:
                                        events.append(
                                            ActivityEvent(
                                                id=f"{event_id}_{item.get('id', 'tool')}",
                                                type=ActivityEventType.TOOL_USE,
                                                timestamp=timestamp,
                                                tool_name=item.get("name"),
                                                tool_input=item.get("input"),
                                                session_id=session_id,
                                            )
                                        )

                elif msg_type == "result":
                    total_count += 1
                    if total_count > offset and len(events) < limit:
                        result_data = entry.get("result", {})
                        tool_result = str(result_data)[:500] if result_data else None

                        events.append(
                            ActivityEvent(
                                id=event_id,
                                type=ActivityEventType.TOOL_RESULT,
                                timestamp=timestamp,
                                tool_result=tool_result,
                                session_id=session_id,
                            )
                        )

        return events, total_count

    def get_session_tasks(self, session_id: str) -> tuple[dict[str, ClaudeCodeTask], list[str]]:
        """Extract tasks from TaskCreate/TaskUpdate/TaskList tool calls.

        Parses session transcript for task-related tool calls and reconstructs
        the task tree structure.

        Args:
            session_id: Session UUID

        Returns:
            Tuple of (tasks dict by ID, root task IDs list)
        """
        session_file = self._find_session_file(session_id)
        if session_file is None:
            return {}, []

        tasks: dict[str, ClaudeCodeTask] = {}
        task_counter = 0

        with open(session_file, encoding="utf-8") as f:
            for line in f:
                line = line.strip()
                if not line:
                    continue

                try:
                    entry = json.loads(line)
                except json.JSONDecodeError:
                    continue

                # Extract timestamp
                timestamp_str = entry.get("timestamp", "")
                try:
                    timestamp = datetime.fromisoformat(timestamp_str.replace("Z", "+00:00"))
                except ValueError:
                    timestamp = datetime.utcnow()

                msg_type = entry.get("type", "")

                if msg_type == "assistant":
                    message_data = entry.get("message", {})
                    content_list = message_data.get("content", [])

                    if isinstance(content_list, list):
                        for item in content_list:
                            if not isinstance(item, dict) or item.get("type") != "tool_use":
                                continue

                            tool_name = item.get("name", "")
                            tool_input = item.get("input", {})

                            if tool_name == "TaskCreate":
                                task_counter += 1
                                task_id = str(task_counter)
                                subject = tool_input.get("subject", "Untitled Task")
                                description = tool_input.get("description")
                                active_form = tool_input.get("activeForm")

                                tasks[task_id] = ClaudeCodeTask(
                                    id=task_id,
                                    title=subject,
                                    description=description,
                                    status=ClaudeCodeTaskStatus.PENDING,
                                    created_at=timestamp,
                                    updated_at=timestamp,
                                    active_form=active_form,
                                )

                            elif tool_name == "TaskUpdate":
                                task_id = tool_input.get("taskId", "")
                                if task_id in tasks:
                                    task = tasks[task_id]

                                    # Update status
                                    new_status = tool_input.get("status")
                                    if new_status:
                                        try:
                                            task.status = ClaudeCodeTaskStatus(new_status)
                                        except ValueError:
                                            pass

                                    # Update subject
                                    new_subject = tool_input.get("subject")
                                    if new_subject:
                                        task.title = new_subject

                                    # Update description
                                    new_description = tool_input.get("description")
                                    if new_description:
                                        task.description = new_description

                                    # Update active form
                                    new_active_form = tool_input.get("activeForm")
                                    if new_active_form:
                                        task.active_form = new_active_form

                                    # Handle parent relationships
                                    blocked_by = tool_input.get("addBlockedBy", [])
                                    if blocked_by and len(blocked_by) > 0:
                                        task.parent_id = blocked_by[0]
                                        # Add to parent's children
                                        parent_id = blocked_by[0]
                                        if parent_id in tasks:
                                            if task_id not in tasks[parent_id].children:
                                                tasks[parent_id].children.append(task_id)

                                    task.updated_at = timestamp

        # Identify root tasks (no parent)
        root_task_ids = [tid for tid, task in tasks.items() if task.parent_id is None]

        return tasks, root_task_ids

    def get_new_activity_since_size(
        self,
        session_id: str,
        last_size: int,
    ) -> tuple[list[ActivityEvent], int]:
        """Get new activity events since last file size.

        Used for SSE streaming - only reads new content appended to file.

        Args:
            session_id: Session UUID
            last_size: Last known file size in bytes

        Returns:
            Tuple of (new events, current file size)
        """
        session_file = self._find_session_file(session_id)
        if session_file is None:
            return [], 0

        current_size = session_file.stat().st_size
        if current_size <= last_size:
            return [], current_size

        events: list[ActivityEvent] = []

        # Read only new content
        with open(session_file, encoding="utf-8") as f:
            f.seek(last_size)
            new_content = f.read()

        # Process new lines
        for line_num, line in enumerate(new_content.strip().split("\n")):
            line = line.strip()
            if not line:
                continue

            try:
                entry = json.loads(line)
            except json.JSONDecodeError:
                continue

            # Extract timestamp
            timestamp_str = entry.get("timestamp", "")
            try:
                timestamp = datetime.fromisoformat(timestamp_str.replace("Z", "+00:00"))
            except ValueError:
                timestamp = datetime.utcnow()

            msg_type = entry.get("type", "")
            event_id = f"{session_id}_{last_size}_{line_num}"

            if msg_type == "user":
                message_data = entry.get("message", {})
                content = message_data.get("content", "")

                # Check if this is a tool_result (Claude API sends tool results as "user" type)
                if isinstance(content, list) and len(content) > 0:
                    first_item = content[0]
                    if isinstance(first_item, dict) and first_item.get("type") == "tool_result":
                        # This is a tool_result, not a real user message
                        result_content = first_item.get("content", "")
                        if isinstance(result_content, list):
                            texts = [
                                c.get("text", "")
                                for c in result_content
                                if isinstance(c, dict) and c.get("type") == "text"
                            ]
                            result_content = "\n".join(texts) if texts else ""
                        elif not isinstance(result_content, str):
                            result_content = str(result_content) if result_content else ""

                        events.append(
                            ActivityEvent(
                                id=event_id,
                                type=ActivityEventType.TOOL_RESULT,
                                timestamp=timestamp,
                                tool_result=result_content[:500] if result_content else None,
                                session_id=session_id,
                            )
                        )
                        continue

                    # Normal user message with content blocks
                    if isinstance(first_item, dict):
                        content = first_item.get("text", "")
                    else:
                        content = str(first_item)

                # Skip empty user messages (system-generated, not real user input)
                if not content or (isinstance(content, str) and not content.strip()):
                    continue

                events.append(
                    ActivityEvent(
                        id=event_id,
                        type=ActivityEventType.USER,
                        timestamp=timestamp,
                        content=content[:1000] if content else None,
                        session_id=session_id,
                    )
                )

            elif msg_type == "assistant":
                message_data = entry.get("message", {})
                content_list = message_data.get("content", [])

                if isinstance(content_list, list):
                    for item in content_list:
                        if isinstance(item, dict):
                            item_type = item.get("type", "")

                            if item_type == "text":
                                text_content = item.get("text", "")
                                # Skip empty text blocks (e.g., thinking-only responses)
                                if text_content and text_content.strip():
                                    events.append(
                                        ActivityEvent(
                                            id=f"{event_id}_text",
                                            type=ActivityEventType.ASSISTANT,
                                            timestamp=timestamp,
                                            content=text_content[:1000],
                                            session_id=session_id,
                                        )
                                    )

                            elif item_type == "tool_use":
                                events.append(
                                    ActivityEvent(
                                        id=f"{event_id}_{item.get('id', 'tool')}",
                                        type=ActivityEventType.TOOL_USE,
                                        timestamp=timestamp,
                                        tool_name=item.get("name"),
                                        tool_input=item.get("input"),
                                        session_id=session_id,
                                    )
                                )

            elif msg_type == "result":
                result_data = entry.get("result", {})
                tool_result = str(result_data)[:500] if result_data else None

                events.append(
                    ActivityEvent(
                        id=event_id,
                        type=ActivityEventType.TOOL_RESULT,
                        timestamp=timestamp,
                        tool_result=tool_result,
                        session_id=session_id,
                    )
                )

        return events, current_size


# ========================================
# Process Management
# ========================================


@dataclass
class ClaudeProcess:
    """Represents a running Claude Code process."""

    pid: int
    version: str
    terminal: str  # e.g., "s022", "??" for background
    state: str  # e.g., "S+", "S", "R+"
    started: str  # Human-readable start time
    cpu_time: str  # Accumulated CPU time
    memory_mb: float  # Memory usage in MB
    is_foreground: bool  # True if active in terminal (S+, R+)
    is_current: bool  # True if this is the current session
    command: str  # Full command line


@dataclass
class ProcessCleanupResult:
    """Result of process cleanup operation."""

    killed: list[int]  # PIDs that were killed
    failed: list[tuple[int, str]]  # PIDs that failed with error message
    protected: list[int]  # PIDs that were skipped (foreground sessions)


def list_claude_processes() -> list[ClaudeProcess]:
    """List all running Claude Code processes.

    Uses `ps aux` to find Claude processes and parses the output
    to extract process information.

    Returns:
        List of ClaudeProcess objects sorted by CPU time (descending)
    """
    import os
    import subprocess

    try:
        # Run ps command to get Claude processes
        result = subprocess.run(
            ["ps", "aux"],
            capture_output=True,
            text=True,
            timeout=10,
        )

        if result.returncode != 0:
            logger.error(f"ps command failed: {result.stderr}")
            return []

        processes = []
        current_pid = os.getpid()
        parent_pid = os.getppid()

        for line in result.stdout.strip().split("\n")[1:]:  # Skip header
            # Skip non-Claude processes
            if "claude" not in line.lower():
                continue

            # Skip helper processes (ShipIt, MCP, etc.)
            if "ShipIt" in line or "--claude-in-chrome-mcp" in line:
                continue

            # Parse ps output: USER PID %CPU %MEM VSZ RSS TTY STAT START TIME COMMAND
            parts = line.split(None, 10)
            if len(parts) < 11:
                continue

            try:
                pid = int(parts[1])
                _mem_percent = float(parts[3])
                terminal = parts[6]
                state = parts[7]
                started = parts[8]
                cpu_time = parts[9]
                command = parts[10]

                # Skip if not a main Claude process
                if "claude" not in command or "/claude" not in command:
                    continue

                # Estimate memory in MB (RSS is in KB on macOS)
                try:
                    rss_kb = int(parts[5])
                    memory_mb = rss_kb / 1024
                except (ValueError, IndexError):
                    memory_mb = 0.0

                # Extract version from command or path
                version = "unknown"
                if "/versions/" in command:
                    # e.g., /Users/.../.local/share/claude/versions/2.1.19
                    import re

                    match = re.search(r"/versions/(\d+\.\d+\.\d+)", command)
                    if match:
                        version = match.group(1)

                # Determine if foreground (S+, R+ indicate foreground in terminal)
                is_foreground = state.endswith("+")

                # Check if this is the current process or its parent
                is_current = pid == current_pid or pid == parent_pid

                processes.append(
                    ClaudeProcess(
                        pid=pid,
                        version=version,
                        terminal=terminal,
                        state=state,
                        started=started,
                        cpu_time=cpu_time,
                        memory_mb=round(memory_mb, 1),
                        is_foreground=is_foreground,
                        is_current=is_current,
                        command=command[:200],  # Truncate long commands
                    )
                )
            except (ValueError, IndexError) as e:
                logger.debug(f"Failed to parse process line: {e}")
                continue

        # Sort by CPU time (parse MM:SS.ss format)
        def parse_cpu_time(cpu_str: str) -> float:
            """Parse CPU time string like '23:35.63' to seconds."""
            try:
                if ":" in cpu_str:
                    parts = cpu_str.split(":")
                    minutes = int(parts[0])
                    seconds = float(parts[1])
                    return minutes * 60 + seconds
                return float(cpu_str)
            except (ValueError, IndexError):
                return 0.0

        processes.sort(key=lambda p: parse_cpu_time(p.cpu_time), reverse=True)
        return processes

    except subprocess.TimeoutExpired:
        logger.error("ps command timed out")
        return []
    except Exception as e:
        logger.error(f"Error listing processes: {e}")
        return []


def kill_process(pid: int, force: bool = False) -> tuple[bool, str]:
    """Kill a specific Claude Code process.

    Args:
        pid: Process ID to kill
        force: If True, use SIGKILL instead of SIGTERM

    Returns:
        Tuple of (success, message)
    """
    import os
    import signal

    try:
        # Safety check: don't kill current process
        if pid == os.getpid() or pid == os.getppid():
            return False, "Cannot kill current session"

        # Send signal
        sig = signal.SIGKILL if force else signal.SIGTERM
        os.kill(pid, sig)

        logger.info(f"Killed process {pid} with signal {sig.name}")
        return True, f"Process {pid} terminated"

    except ProcessLookupError:
        return False, f"Process {pid} not found"
    except PermissionError:
        return False, f"Permission denied to kill process {pid}"
    except Exception as e:
        return False, f"Error killing process {pid}: {e}"


def cleanup_stale_processes(
    protect_foreground: bool = True,
    protect_current: bool = True,
) -> ProcessCleanupResult:
    """Kill all stale (background) Claude Code processes.

    Args:
        protect_foreground: Don't kill processes in foreground terminals
        protect_current: Don't kill the current process

    Returns:
        ProcessCleanupResult with killed/failed/protected PIDs
    """
    processes = list_claude_processes()

    killed = []
    failed = []
    protected = []

    for proc in processes:
        # Skip current session
        if protect_current and proc.is_current:
            protected.append(proc.pid)
            continue

        # Skip foreground processes (active in terminal)
        if protect_foreground and proc.is_foreground:
            protected.append(proc.pid)
            continue

        # Kill this process
        success, message = kill_process(proc.pid)
        if success:
            killed.append(proc.pid)
        else:
            failed.append((proc.pid, message))

    logger.info(
        f"Process cleanup: killed={len(killed)}, failed={len(failed)}, protected={len(protected)}"
    )

    return ProcessCleanupResult(
        killed=killed,
        failed=failed,
        protected=protected,
    )


# Global monitor instance
_monitor: ClaudeSessionMonitor | None = None


def get_monitor() -> ClaudeSessionMonitor:
    """Get or create the global monitor instance."""
    global _monitor
    if _monitor is None:
        _monitor = ClaudeSessionMonitor()
    return _monitor
