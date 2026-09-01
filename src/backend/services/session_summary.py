"""Provider-neutral pieces of agent session summarization.

Only three things are genuinely provider-independent: where a summary is
cached, how messages are rendered into the prompt, and the Ollama call itself.
Extracting the *first messages* is deliberately left to each monitor — a Claude
JSONL and a Codex rollout share no structure, and a common extractor would only
be a switch on provider wearing a shared name.
"""

from __future__ import annotations

import logging
import os
import re
from pathlib import Path

import httpx

logger = logging.getLogger(__name__)

SUMMARY_FAILED = "요약 생성 실패"
SUMMARY_EMPTY = "대화 내용 없음"

# A session id reaches the cache path as a file name. Claude ids come from a
# file stem, but a Codex id is read out of the rollout's own metadata, so it is
# untrusted input — anything that could escape the cache directory is rejected.
_SAFE_SESSION_ID = re.compile(r"[A-Za-z0-9._-]{1,255}")


def summary_cache_path(session_id: str) -> Path:
    """Get the cache file path for a session summary.

    Uses SUMMARY_CACHE_DIR env var if set, otherwise falls back to
    ~/.claude/session_summaries/. In Docker, ~/.claude is read-only,
    so /app/data/summaries is used instead.

    Raises:
        ValueError: If the session id is not safe to use as a file name.
    """
    if not _SAFE_SESSION_ID.fullmatch(session_id) or session_id in {".", ".."}:
        raise ValueError("Unsafe session id")

    cache_dir = os.getenv("SUMMARY_CACHE_DIR", "")
    if cache_dir:
        return Path(cache_dir) / f"{session_id}.txt"

    # In Docker (CLAUDE_HOME is set), use /app/data/summaries to avoid read-only mount
    if os.getenv("CLAUDE_HOME", ""):
        return Path("/app/data/summaries") / f"{session_id}.txt"

    return Path.home() / ".claude" / "session_summaries" / f"{session_id}.txt"


def read_cached_summary(session_id: str) -> str | None:
    """Return the cached summary for a session, or None."""
    try:
        cache_path = summary_cache_path(session_id)
    except ValueError:
        return None
    if cache_path.exists():
        return cache_path.read_text().strip()
    return None


def format_messages_for_prompt(messages: list[dict]) -> str:
    """Render extracted messages into the summary prompt body."""
    formatted = []
    for msg in messages:
        role = "사용자" if msg["role"] == "user" else "어시스턴트"
        content = msg["content"][:200]  # Truncate for prompt
        formatted.append(f"{role}: {content}")
    return "\n".join(formatted)


async def generate_summary_from_messages(session_id: str, messages: list[dict]) -> str:
    """Generate and cache an AI summary from already-extracted messages.

    Uses the configured Ollama model for cost efficiency. Disables reasoning for
    thinking models so the response field carries the summary.
    """
    try:
        cache_path = summary_cache_path(session_id)
    except ValueError:
        logger.warning("Refusing to cache a summary for an unsafe session id")
        return SUMMARY_FAILED

    if cache_path.exists():
        logger.info(f"Using cached summary for session {session_id}")
        return cache_path.read_text().strip()

    if not messages:
        return SUMMARY_EMPTY

    prompt = f"""다음 대화의 주제를 한 문장(30자 이내)으로 요약해주세요.
마침표 없이 간결하게 작성하세요.

대화:
{format_messages_for_prompt(messages)}

요약:"""

    try:
        ollama_base_url = os.getenv("OLLAMA_BASE_URL", "http://localhost:11434")
        from config import get_model_for_provider

        ollama_model = get_model_for_provider("ollama")

        async with httpx.AsyncClient(timeout=120.0) as client:
            response = await client.post(
                f"{ollama_base_url}/api/generate",
                json={
                    "model": ollama_model,
                    "prompt": prompt,
                    "stream": False,
                    "think": False,
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

        cache_path.parent.mkdir(parents=True, exist_ok=True)
        cache_path.write_text(summary)

        logger.info(f"Generated summary for session {session_id}: {summary}")
        return summary

    except Exception as e:
        logger.error(f"Failed to generate summary for {session_id}: {e}")
        return SUMMARY_FAILED
