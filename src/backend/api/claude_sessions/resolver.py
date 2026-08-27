"""Provider-neutral session lookup shared by the session routes.

Lives in its own module because both ``sessions`` and ``activity`` need it:
importing a private name across sibling route modules made the dependency
invisible to readers and easy to break during refactors.
"""

from models.claude_session import ClaudeSessionDetail
from services.claude_session_monitor import ClaudeSessionMonitor, get_monitor
from services.codex_session_monitor import CodexSessionMonitor, get_codex_monitor


def resolve_session(
    session_id: str,
) -> tuple[ClaudeSessionMonitor | CodexSessionMonitor, ClaudeSessionDetail | None]:
    """Resolve a session against the supported provider adapters.

    Claude is tried first because its ids are the legacy contract; a Codex
    rollout only answers when no Claude session owns the id.
    """
    claude_monitor = get_monitor()
    details = claude_monitor.get_session_details(session_id)
    if details is not None:
        return claude_monitor, details

    codex_monitor = get_codex_monitor()
    return codex_monitor, codex_monitor.get_session_details(session_id)
