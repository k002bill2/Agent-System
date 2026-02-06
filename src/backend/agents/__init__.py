"""Agent definitions for specialized tasks."""

from agents.base import AgentConfig, AgentResult, BaseAgent
from agents.lead_orchestrator import LeadOrchestratorAgent, get_lead_orchestrator
from agents.specialist import (
    CodeAnalystAgent,
    ResearcherAgent,
    WriterAgent,
)
from agents.specialists import (
    BackendIntegrationAgent,
    MobileUIAgent,
    TestAutomationAgent,
)

__all__ = [
    # Base
    "BaseAgent",
    "AgentConfig",
    "AgentResult",
    # Original specialists
    "CodeAnalystAgent",
    "ResearcherAgent",
    "WriterAgent",
    # Lead Orchestrator
    "LeadOrchestratorAgent",
    "get_lead_orchestrator",
    # New specialists
    "MobileUIAgent",
    "BackendIntegrationAgent",
    "TestAutomationAgent",
]
