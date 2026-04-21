"""Build effective system prompt for playground LLM calls.

Composes the session's base ``system_prompt`` with Claude Code rules and
memory entries, so the playground's answering LLM shares the same guidance
Claude Code itself operates under.

Design notes:
- Rules and memory are **concatenated into the system prompt string** rather
  than retrieved via RAG similarity. Rules are "always apply" guidance; RAG
  similarity would cause them to flicker in/out per question.
- LLM pipeline (``LLMService.invoke`` / ``invoke_with_tools``) is not
  modified — it receives a single ``system_prompt`` string as before.
- Inclusion is opt-in via ``PlaygroundSession.rules_mode`` and
  ``PlaygroundSession.memory_mode``.
- A soft token budget (``context_budget_tokens``) bounds total injected size.
  Estimation uses ``len(text) // 4`` which is good enough for a truncation
  trigger in mixed Korean/English bodies.
"""

from __future__ import annotations

import logging
from typing import Protocol

from models.playground import PlaygroundSession
from models.project_config import MemoryConfig, RuleConfig

logger = logging.getLogger(__name__)


# ─────────────────────────────────────────────────────────────
# Narrow protocol so tests can stub without importing the heavy
# ProjectConfigMonitor singleton.
# ─────────────────────────────────────────────────────────────


class _ConfigSource(Protocol):
    def get_global_rules(self) -> list[RuleConfig]: ...

    def get_project_rules(self, project_id: str) -> list[RuleConfig]: ...

    def get_rule_content(
        self, project_id: str, rule_id: str, is_global: bool = False
    ) -> tuple[RuleConfig | None, str]: ...

    def get_project_memories(self, project_id: str) -> list[MemoryConfig]: ...

    def get_memory_content(
        self, project_id: str, memory_id: str
    ) -> tuple[MemoryConfig | None, str]: ...

    def get_memory_index(self, project_id: str) -> str: ...


def _estimate_tokens(text: str) -> int:
    """Rough token estimate used only for soft-capping injected context."""
    return max(1, len(text) // 4)


def _truncate_to_budget(body: str, token_budget: int) -> str:
    """Trim the tail of a body so its estimated tokens fit the budget.

    We slice on a character boundary proportional to the budget, then append
    a visible marker so the model knows content was omitted.
    """
    if _estimate_tokens(body) <= token_budget:
        return body
    char_budget = max(200, token_budget * 4 - 40)  # leave room for marker
    return body[:char_budget].rstrip() + "\n\n…[truncated]"


def _strip_frontmatter(body: str) -> str:
    """Drop a leading YAML frontmatter block if present.

    Rules/memory files often begin with ``---\\n...\\n---`` which is
    metadata for tooling and wastes tokens in the prompt.
    """
    lines = body.splitlines()
    if lines and lines[0].strip() == "---":
        for i in range(1, len(lines)):
            if lines[i].strip() == "---":
                return "\n".join(lines[i + 1 :]).lstrip("\n")
    return body


def _format_section(header: str, body: str) -> str:
    return f"\n\n### {header}\n{body.strip()}\n"


# ─────────────────────────────────────────────────────────────
# Collection helpers
# ─────────────────────────────────────────────────────────────


def _collect_rules(session: PlaygroundSession, source: _ConfigSource) -> list[tuple[str, str]]:
    """Return ``[(header, body), ...]`` for rules selected by session."""
    if session.rules_mode == "off":
        return []

    include_global = session.rules_mode in ("global", "both")
    include_project = session.rules_mode in ("project", "both") and bool(session.project_id)
    allow_list = set(session.selected_rule_ids)

    entries: list[tuple[str, str]] = []

    if include_global:
        for rule in source.get_global_rules():
            if allow_list and rule.rule_id not in allow_list:
                continue
            _, content = source.get_rule_content("global", rule.rule_id, is_global=True)
            if not content:
                continue
            header = f"Global Rule · {rule.name or rule.rule_id}"
            entries.append((header, _strip_frontmatter(content)))

    if include_project and session.project_id:
        for rule in source.get_project_rules(session.project_id):
            if allow_list and rule.rule_id not in allow_list:
                continue
            _, content = source.get_rule_content(session.project_id, rule.rule_id, is_global=False)
            if not content:
                continue
            header = f"Project Rule · {rule.name or rule.rule_id}"
            entries.append((header, _strip_frontmatter(content)))

    return entries


def _collect_memories(session: PlaygroundSession, source: _ConfigSource) -> list[tuple[str, str]]:
    """Return ``[(header, body), ...]`` for memory entries selected by session."""
    if session.memory_mode == "off" or not session.project_id:
        return []

    entries: list[tuple[str, str]] = []

    index_body = source.get_memory_index(session.project_id)
    if index_body.strip():
        entries.append(("Memory Index (MEMORY.md)", index_body))

    if session.memory_mode == "full":
        allow_list = set(session.selected_memory_ids)
        for memory in source.get_project_memories(session.project_id):
            if allow_list and memory.memory_id not in allow_list:
                continue
            _, content = source.get_memory_content(session.project_id, memory.memory_id)
            if not content:
                continue
            header = f"Memory · {memory.name or memory.memory_id}"
            entries.append((header, _strip_frontmatter(content)))

    return entries


# ─────────────────────────────────────────────────────────────
# Budget enforcement
# ─────────────────────────────────────────────────────────────


def _fit_to_budget(entries: list[tuple[str, str]], token_budget: int) -> list[tuple[str, str]]:
    """Keep short entries intact; truncate the longest when over budget.

    Strategy: sort by length ascending, admit while the running total fits.
    Once an entry would overflow, admit a truncated version and stop.
    """
    if token_budget <= 0:
        return []

    ordered = sorted(entries, key=lambda e: len(e[1]))
    fitted: list[tuple[str, str]] = []
    remaining = token_budget

    for header, body in ordered:
        cost = _estimate_tokens(body) + _estimate_tokens(header) + 8  # headers+glue
        if cost <= remaining:
            fitted.append((header, body))
            remaining -= cost
            continue
        if remaining > 100:
            trimmed = _truncate_to_budget(body, remaining - _estimate_tokens(header) - 8)
            fitted.append((header, trimmed))
        break

    # Restore original order so the prompt reads top-down (global → project →
    # memory), not length-sorted.
    original_order = {id(e): i for i, e in enumerate(entries)}
    fitted.sort(key=lambda e: original_order.get(id(e), 1_000_000))
    return fitted


# ─────────────────────────────────────────────────────────────
# Public API
# ─────────────────────────────────────────────────────────────


def build_effective_system_prompt(
    session: PlaygroundSession,
    source: _ConfigSource | None = None,
) -> str:
    """Compose the final system prompt sent to the LLM.

    Returns ``session.system_prompt`` unchanged when no rule/memory modes are
    active. Never raises on manager errors — falls back to the base prompt
    with a logged warning, so a bad rule file cannot break playground.
    """
    base_prompt = session.system_prompt or ""

    if session.rules_mode == "off" and session.memory_mode == "off":
        return base_prompt

    try:
        if source is None:
            # Local import to avoid a top-level cycle (monitor imports many
            # services that may transitively import this module).
            from services.project_config_monitor import get_project_config_monitor

            source = get_project_config_monitor()

        rule_entries = _collect_rules(session, source)
        memory_entries = _collect_memories(session, source)
    except Exception as e:  # pragma: no cover — defensive
        logger.warning("Failed to collect rules/memory for session %s: %s", session.id, e)
        return base_prompt

    all_entries = rule_entries + memory_entries
    fitted = _fit_to_budget(all_entries, session.context_budget_tokens)

    if not fitted:
        return base_prompt

    sections = [_format_section(h, b) for h, b in fitted]
    header_note = (
        "\n\n---\n"
        "## Claude Code Context\n"
        "The following rules and memory entries reflect the user's global and "
        "project-specific guidance. Follow them unless they conflict with the "
        "session's base instructions above."
    )
    return f"{base_prompt}{header_note}{''.join(sections)}".strip() or base_prompt


__all__ = ["build_effective_system_prompt"]
