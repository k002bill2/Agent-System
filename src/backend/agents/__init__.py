"""Agent definitions for specialized tasks."""

from agents.base import BaseAgent, AgentConfig, AgentResult
from agents.specialist import (
    CodeAnalystAgent,
    ResearcherAgent,
    WriterAgent,
)
from agents.lead_orchestrator import LeadOrchestratorAgent, get_lead_orchestrator
from agents.specialists import (
    MobileUIAgent,
    BackendIntegrationAgent,
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
