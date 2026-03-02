"""Agent definitions for specialized tasks.

Lazy imports to prevent circular dependency chains between
agents, services.agent_registry, and lead_orchestrator.
"""

from agents.base import AgentConfig, AgentResult, BaseAgent


def __getattr__(name: str):
    """Lazy-load agent classes to avoid circular imports."""
    _lazy_map = {
        "LeadOrchestratorAgent": ("agents.lead_orchestrator", "LeadOrchestratorAgent"),
        "get_lead_orchestrator": ("agents.lead_orchestrator", "get_lead_orchestrator"),
        "BackendIntegrationAgent": ("agents.specialists", "BackendIntegrationAgent"),
        "MobileUIAgent": ("agents.specialists", "MobileUIAgent"),
        "TestAutomationAgent": ("agents.specialists", "TestAutomationAgent"),
        # Legacy (deprecated, retained for backward compatibility)
        "CodeAnalystAgent": ("agents.specialist", "CodeAnalystAgent"),
        "ResearcherAgent": ("agents.specialist", "ResearcherAgent"),
        "WriterAgent": ("agents.specialist", "WriterAgent"),
    }
    if name in _lazy_map:
        module_path, attr = _lazy_map[name]
        import importlib

        module = importlib.import_module(module_path)
        return getattr(module, attr)
    raise AttributeError(f"module 'agents' has no attribute {name!r}")


__all__ = [
    # Base (eagerly loaded - no circular risk)
    "BaseAgent",
    "AgentConfig",
    "AgentResult",
    # Lead Orchestrator (lazy)
    "LeadOrchestratorAgent",
    "get_lead_orchestrator",
    # Specialists (lazy)
    "MobileUIAgent",
    "BackendIntegrationAgent",
    "TestAutomationAgent",
    # Legacy (deprecated, lazy - backward compat)
    "CodeAnalystAgent",
    "ResearcherAgent",
    "WriterAgent",
]
