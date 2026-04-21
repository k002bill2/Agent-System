"""Unit tests for ``services.playground_context.build_effective_system_prompt``.

These tests verify that Claude Code rules and memory bodies are composed
into the playground LLM system prompt correctly across modes, without
hitting the real filesystem. A stub ``_ConfigSource`` stands in for
``ProjectConfigMonitor``.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime

from models.playground import PlaygroundSession
from models.project_config import MemoryConfig, RuleConfig
from services.playground_context import build_effective_system_prompt


# ─────────────────────────────────────────────────────────────
# Stub config source
# ─────────────────────────────────────────────────────────────


def _rule(rule_id: str, is_global: bool, name: str, body: str) -> tuple[RuleConfig, str]:
    cfg = RuleConfig(
        rule_id=rule_id,
        project_id="global" if is_global else "proj-1",
        name=name,
        description="",
        file_path=f"/tmp/{rule_id}.md",
        is_global=is_global,
        modified_at=datetime.utcnow(),
    )
    return cfg, body


def _memory(memory_id: str, name: str, body: str) -> tuple[MemoryConfig, str]:
    cfg = MemoryConfig(
        memory_id=memory_id,
        project_id="proj-1",
        name=name,
        description="",
        file_path=f"/tmp/{memory_id}.md",
        memory_type="user",
        modified_at=datetime.utcnow(),
    )
    return cfg, body


@dataclass
class _Stub:
    global_rules: list[tuple[RuleConfig, str]] = field(default_factory=list)
    project_rules: list[tuple[RuleConfig, str]] = field(default_factory=list)
    memories: list[tuple[MemoryConfig, str]] = field(default_factory=list)
    memory_index: str = ""

    def get_global_rules(self) -> list[RuleConfig]:
        return [c for c, _ in self.global_rules]

    def get_project_rules(self, project_id: str) -> list[RuleConfig]:
        return [c for c, _ in self.project_rules]

    def get_rule_content(
        self, project_id: str, rule_id: str, is_global: bool = False
    ) -> tuple[RuleConfig | None, str]:
        pool = self.global_rules if is_global else self.project_rules
        for cfg, body in pool:
            if cfg.rule_id == rule_id:
                return cfg, body
        return None, ""

    def get_project_memories(self, project_id: str) -> list[MemoryConfig]:
        return [c for c, _ in self.memories]

    def get_memory_content(
        self, project_id: str, memory_id: str
    ) -> tuple[MemoryConfig | None, str]:
        for cfg, body in self.memories:
            if cfg.memory_id == memory_id:
                return cfg, body
        return None, ""

    def get_memory_index(self, project_id: str) -> str:
        return self.memory_index


def _session(**overrides) -> PlaygroundSession:
    return PlaygroundSession(
        name="test",
        system_prompt="BASE-PROMPT",
        project_id=overrides.pop("project_id", "proj-1"),
        **overrides,
    )


# ─────────────────────────────────────────────────────────────
# Off modes
# ─────────────────────────────────────────────────────────────


def test_returns_base_prompt_when_all_modes_off() -> None:
    """With both modes off, no rules/memory are fetched."""
    session = _session(rules_mode="off", memory_mode="off")
    stub = _Stub(global_rules=[_rule("g1", True, "Coding", "never mutate")])
    result = build_effective_system_prompt(session, source=stub)
    assert result == "BASE-PROMPT"


def test_returns_base_when_no_project_and_only_project_mode() -> None:
    """rules_mode=project with no project_id yields only the base prompt."""
    session = _session(rules_mode="project", project_id=None)
    stub = _Stub(project_rules=[_rule("p1", False, "BackendRule", "use asyncpg")])
    result = build_effective_system_prompt(session, source=stub)
    assert result == "BASE-PROMPT"


# ─────────────────────────────────────────────────────────────
# Injection
# ─────────────────────────────────────────────────────────────


def test_global_rules_injected_when_mode_global() -> None:
    session = _session(rules_mode="global", memory_mode="off")
    stub = _Stub(
        global_rules=[_rule("coding", True, "Coding Style", "never mutate objects")],
        project_rules=[_rule("backend", False, "Backend", "use asyncpg")],
    )
    result = build_effective_system_prompt(session, source=stub)
    assert "BASE-PROMPT" in result
    assert "never mutate objects" in result
    # Project rule must NOT appear under "global" mode
    assert "use asyncpg" not in result


def test_both_mode_injects_global_and_project_rules() -> None:
    session = _session(rules_mode="both", memory_mode="off")
    stub = _Stub(
        global_rules=[_rule("coding", True, "Coding Style", "never mutate objects")],
        project_rules=[_rule("backend", False, "Backend Rule", "use asyncpg only")],
    )
    result = build_effective_system_prompt(session, source=stub)
    assert "never mutate objects" in result
    assert "use asyncpg only" in result


def test_memory_index_mode_includes_only_index() -> None:
    session = _session(rules_mode="off", memory_mode="index")
    stub = _Stub(
        memory_index="# MEMORY.md\n- project_hooks_canonical_source",
        memories=[_memory("project_hooks_canonical_source", "Hooks", "full body here")],
    )
    result = build_effective_system_prompt(session, source=stub)
    assert "project_hooks_canonical_source" in result
    assert "full body here" not in result  # only index, not individual files


def test_memory_full_mode_includes_bodies() -> None:
    session = _session(rules_mode="off", memory_mode="full")
    stub = _Stub(
        memory_index="# MEMORY.md",
        memories=[_memory("m1", "Hooks", "full body here")],
    )
    result = build_effective_system_prompt(session, source=stub)
    assert "full body here" in result


# ─────────────────────────────────────────────────────────────
# Allow-list (selected ids)
# ─────────────────────────────────────────────────────────────


def test_selected_rule_ids_act_as_allow_list() -> None:
    session = _session(
        rules_mode="global",
        memory_mode="off",
        selected_rule_ids=["coding"],
    )
    stub = _Stub(
        global_rules=[
            _rule("coding", True, "Coding Style", "never mutate"),
            _rule("security", True, "Security", "never log secrets"),
        ]
    )
    result = build_effective_system_prompt(session, source=stub)
    assert "never mutate" in result
    assert "never log secrets" not in result


# ─────────────────────────────────────────────────────────────
# Budget enforcement
# ─────────────────────────────────────────────────────────────


def test_budget_truncates_longest_entry_first() -> None:
    big = "X" * 50_000  # ~12_500 tokens
    small = "Keep me intact"
    session = _session(
        rules_mode="global",
        memory_mode="off",
        context_budget_tokens=1000,  # forces truncation
    )
    stub = _Stub(
        global_rules=[
            _rule("big", True, "Big Rule", big),
            _rule("small", True, "Small Rule", small),
        ]
    )
    result = build_effective_system_prompt(session, source=stub)
    assert "Keep me intact" in result
    assert "…[truncated]" in result or len(result) < 20_000


def test_zero_budget_returns_base_prompt() -> None:
    session = _session(
        rules_mode="global", memory_mode="off", context_budget_tokens=500
    )
    # With empty rules, nothing to inject — should fall through to base.
    stub = _Stub()
    result = build_effective_system_prompt(session, source=stub)
    assert result == "BASE-PROMPT"


# ─────────────────────────────────────────────────────────────
# Frontmatter stripping
# ─────────────────────────────────────────────────────────────


def test_frontmatter_is_stripped_from_rule_body() -> None:
    body_with_fm = "---\nname: Coding\n---\n\n# Coding Style\nNEVER-MUTATE-MARKER"
    session = _session(rules_mode="global", memory_mode="off")
    stub = _Stub(global_rules=[_rule("coding", True, "Coding", body_with_fm)])
    result = build_effective_system_prompt(session, source=stub)
    assert "NEVER-MUTATE-MARKER" in result
    assert "name: Coding" not in result
