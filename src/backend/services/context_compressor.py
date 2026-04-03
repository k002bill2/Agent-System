"""Context compressor for managing token budget in long-running sessions.

Closes the "token economy irony": AOS saves tokens by scaling agents to
complexity, but wasted them in long sessions that lacked compression.

Strategy: **graduated compression** — always summarise, never blindly delete.
Even at CRITICAL, spending ~500 tokens on a summary to reclaim ~10,000 is
a 20:1 return. Blind truncation is "penny wise, pound foolish."

Tiers:
  - NORMAL  (< 60%): No action.
  - WARNING (60-75%): Compress oldest 1/3 of messages into summary.
  - HIGH    (75-90%): Compress oldest 1/2 of messages into summary.
  - CRITICAL(≥ 90%): Compress all but recent N into summary.

Each tier always uses LLM summarisation. Extractive fallback is the
*error handler*, never the primary strategy.
"""

from __future__ import annotations

import logging
from datetime import datetime
from typing import Any

from models.context_usage import get_context_limit

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Configuration defaults
# ---------------------------------------------------------------------------
DEFAULT_WARNING_THRESHOLD = 0.60   # start compressing early
DEFAULT_HIGH_THRESHOLD = 0.75      # compress more aggressively
DEFAULT_CRITICAL_THRESHOLD = 0.90  # compress everything except recent
DEFAULT_PRESERVE_RECENT = 10       # minimum messages to keep verbatim
DEFAULT_MIN_MESSAGES_TO_COMPRESS = 6


def estimate_tokens(text: str) -> int:
    """Cheap token estimate without external tokeniser.

    Heuristic: ~4 chars per token for Latin, ~2 chars per token for CJK.
    """
    if not text:
        return 0
    cjk_count = sum(1 for ch in text if "\u3000" <= ch <= "\u9fff" or "\uac00" <= ch <= "\ud7af")
    latin_count = len(text) - cjk_count
    return (latin_count // 4) + (cjk_count // 2)


def estimate_messages_tokens(messages: list[dict[str, Any]]) -> int:
    """Estimate total tokens across a list of messages."""
    total = 0
    for msg in messages:
        content = msg.get("content", "")
        if isinstance(content, str):
            total += estimate_tokens(content)
        total += 4  # per-message overhead (role, separators)
    return total


class CompressionResult:
    """Result of a compression attempt."""

    __slots__ = (
        "compressed",
        "original_count",
        "remaining_count",
        "tokens_before",
        "tokens_after",
        "summary_text",
        "tier",
    )

    def __init__(
        self,
        compressed: bool,
        original_count: int,
        remaining_count: int,
        tokens_before: int,
        tokens_after: int,
        summary_text: str | None = None,
        tier: str = "none",
    ):
        self.compressed = compressed
        self.original_count = original_count
        self.remaining_count = remaining_count
        self.tokens_before = tokens_before
        self.tokens_after = tokens_after
        self.summary_text = summary_text
        self.tier = tier

    def to_dict(self) -> dict[str, Any]:
        return {
            "compressed": self.compressed,
            "original_count": self.original_count,
            "remaining_count": self.remaining_count,
            "tokens_before": self.tokens_before,
            "tokens_after": self.tokens_after,
            "tier": self.tier,
            "timestamp": datetime.utcnow().isoformat(),
        }


class ContextCompressor:
    """Graduated context compressor — always summarise, never blindly delete.

    Compression intensifies as usage grows, but every tier uses LLM
    summarisation. The ~500 token cost of a summary is negligible compared
    to the thousands of tokens reclaimed.
    """

    def __init__(
        self,
        *,
        warning_threshold: float = DEFAULT_WARNING_THRESHOLD,
        high_threshold: float = DEFAULT_HIGH_THRESHOLD,
        critical_threshold: float = DEFAULT_CRITICAL_THRESHOLD,
        preserve_recent: int = DEFAULT_PRESERVE_RECENT,
        min_messages: int = DEFAULT_MIN_MESSAGES_TO_COMPRESS,
    ):
        self.warning_threshold = warning_threshold
        self.high_threshold = high_threshold
        self.critical_threshold = critical_threshold
        self.preserve_recent = preserve_recent
        self.min_messages = min_messages

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------

    async def compress_if_needed(
        self,
        state: dict[str, Any],
        provider: str = "google",
        model: str = "",
    ) -> CompressionResult:
        """Check context usage and compress messages if threshold exceeded.

        Graduated strategy:
          - WARNING  (60-75%): summarise oldest 1/3
          - HIGH     (75-90%): summarise oldest 1/2
          - CRITICAL (≥ 90%):  summarise all but preserve_recent

        Always uses LLM summary. Extractive fallback only on LLM failure.
        """
        messages: list[dict] = state.get("messages", [])
        if len(messages) < self.min_messages:
            return self._no_op(messages)

        # Estimate current usage
        msg_tokens = estimate_messages_tokens(messages)
        system_tokens = estimate_tokens(state.get("system_context", ""))
        task_tokens = estimate_tokens(str(state.get("tasks", {})))
        current_tokens = msg_tokens + system_tokens + task_tokens

        context_limit = get_context_limit(provider, model)
        usage_ratio = current_tokens / context_limit if context_limit > 0 else 0

        if usage_ratio < self.warning_threshold:
            return self._no_op(messages, current_tokens)

        # Determine compression tier and how many messages to compress
        tier, compress_ratio = self._determine_tier(usage_ratio)
        preserve = self._calculate_preserve_count(len(messages), compress_ratio)

        if preserve >= len(messages):
            return self._no_op(messages, current_tokens)

        tokens_before = current_tokens
        original_count = len(messages)

        result = await self._graduated_compress(
            messages, preserve, provider, model, tier,
        )

        tokens_after = (
            estimate_messages_tokens(state["messages"])
            + system_tokens
            + task_tokens
        )

        # Record compression event
        record = result.to_dict()
        record["tokens_before"] = tokens_before
        record["tokens_after"] = tokens_after
        state.setdefault("compression_history", []).append(record)

        savings_pct = (1 - tokens_after / tokens_before) * 100 if tokens_before > 0 else 0
        logger.info(
            "Context compressed [%s]: %d→%d messages, %d→%d tokens (%.0f%% saved, usage was %.0f%%)",
            tier,
            original_count,
            result.remaining_count,
            tokens_before,
            tokens_after,
            savings_pct,
            usage_ratio * 100,
        )

        return result

    # ------------------------------------------------------------------
    # Tier determination
    # ------------------------------------------------------------------

    def _determine_tier(self, usage_ratio: float) -> tuple[str, float]:
        """Determine compression tier and ratio of messages to compress.

        Returns (tier_name, compress_ratio) where compress_ratio is the
        fraction of messages to compress (0.33 = oldest third, etc.).
        """
        if usage_ratio >= self.critical_threshold:
            return ("CRITICAL", 1.0)  # compress all but preserve_recent
        if usage_ratio >= self.high_threshold:
            return ("HIGH", 0.5)      # compress oldest half
        return ("WARNING", 0.33)      # compress oldest third

    def _calculate_preserve_count(
        self, total: int, compress_ratio: float,
    ) -> int:
        """Calculate how many recent messages to preserve.

        For CRITICAL (ratio=1.0): keep exactly preserve_recent.
        For WARNING/HIGH: keep at least preserve_recent, or the
        non-compressed tail, whichever is larger.
        """
        if compress_ratio >= 1.0:
            return min(self.preserve_recent, total)

        keep_by_ratio = max(1, int(total * (1 - compress_ratio)))
        return max(self.preserve_recent, keep_by_ratio)

    # ------------------------------------------------------------------
    # Graduated compression
    # ------------------------------------------------------------------

    async def _graduated_compress(
        self,
        messages: list[dict],
        preserve: int,
        provider: str,
        model: str,
        tier: str,
    ) -> CompressionResult:
        """Compress oldest messages via LLM summary, keep recent ones.

        Used by ALL tiers — the only difference is how many messages
        get compressed (determined by `preserve`).
        """
        original_count = len(messages)
        tokens_before = estimate_messages_tokens(messages)

        old_messages = messages[:-preserve]
        recent_messages = messages[-preserve:]

        # Always attempt LLM summary
        summary = await self._generate_summary(old_messages, provider, model)

        # Build the compressed message list
        summary_msg: dict[str, Any] = {
            "role": "system",
            "content": (
                f"[이전 대화 요약 — {len(old_messages)}개 메시지 압축 ({tier})]\n"
                f"{summary}"
            ),
        }

        messages.clear()
        messages.append(summary_msg)
        messages.extend(recent_messages)

        return CompressionResult(
            compressed=True,
            original_count=original_count,
            remaining_count=len(messages),
            tokens_before=tokens_before,
            tokens_after=estimate_messages_tokens(messages),
            summary_text=summary,
            tier=tier,
        )

    # ------------------------------------------------------------------
    # LLM summary generation
    # ------------------------------------------------------------------

    async def _generate_summary(
        self,
        messages: list[dict],
        provider: str,
        model: str,
    ) -> str:
        """Generate a concise summary of messages via LLM.

        Falls back to extractive summary ONLY if LLM is truly unavailable.
        """
        conversation = self._format_messages_for_summary(messages)

        prompt = (
            "아래는 AI 에이전트 오케스트레이션 세션의 이전 대화입니다.\n"
            "핵심 결정사항, 완료된 작업, 중요한 컨텍스트를 보존하면서 "
            "간결하게 요약해주세요.\n\n"
            "규칙:\n"
            "- 3-5문장으로 요약\n"
            "- 구체적인 파일명, 함수명, 에러 메시지는 보존\n"
            "- 태스크 상태(완료/실패/대기)를 명시\n"
            "- 불필요한 인사말이나 확인 메시지는 제거\n\n"
            f"대화 내용:\n{conversation}"
        )

        try:
            from services.llm_service import LLMService

            response = await LLMService.invoke(
                prompt=prompt,
                model_id=model or "",
                temperature=0.0,
                max_tokens=512,
            )
            return response.content.strip()
        except Exception as e:
            logger.warning("LLM summary failed, using extractive fallback: %s", e)
            return self._extractive_fallback(messages)

    def _format_messages_for_summary(self, messages: list[dict]) -> str:
        """Format messages into a readable conversation for the summariser."""
        lines: list[str] = []
        for msg in messages:
            role = msg.get("role", "unknown")
            content = msg.get("content", "")
            if isinstance(content, str) and content.strip():
                truncated = content[:500] + "..." if len(content) > 500 else content
                lines.append(f"[{role}] {truncated}")
        return "\n".join(lines[-30:])  # cap at 30 messages for summariser input

    def _extractive_fallback(self, messages: list[dict]) -> str:
        """Simple extractive summary — ERROR HANDLER only, not primary strategy.

        Used when LLM is completely unavailable (no API key, network down).
        """
        user_msgs: list[str] = []
        assistant_msgs: list[str] = []

        for msg in messages:
            content = msg.get("content", "")
            if not isinstance(content, str) or not content.strip():
                continue
            first_line = content.strip().split("\n")[0][:200]
            if msg.get("role") == "user":
                user_msgs.append(first_line)
            elif msg.get("role") == "assistant":
                assistant_msgs.append(first_line)

        parts: list[str] = []
        if user_msgs:
            parts.append(f"사용자 요청: {'; '.join(user_msgs[:3])}")
        if assistant_msgs:
            parts.append(f"어시스턴트 응답: {assistant_msgs[-1]}")
        return " | ".join(parts) if parts else "(이전 대화 내용 없음)"

    # ------------------------------------------------------------------
    # Helpers
    # ------------------------------------------------------------------

    @staticmethod
    def _no_op(
        messages: list[dict],
        current_tokens: int = 0,
    ) -> CompressionResult:
        return CompressionResult(
            compressed=False,
            original_count=len(messages),
            remaining_count=len(messages),
            tokens_before=current_tokens,
            tokens_after=current_tokens,
            tier="none",
        )
