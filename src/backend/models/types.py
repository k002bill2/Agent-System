"""Type-safe ID and action types for Boris Cherny-style type safety.

Uses NewType for zero-runtime-cost semantic typing of ID fields.
Prevents mixing agent_id with task_id at the type checker level.

Usage:
    from .types import AgentId, TaskId, SessionId

    def assign_task(agent: AgentId, task: TaskId) -> None:
        ...  # mypy catches if you pass TaskId where AgentId expected
"""

from __future__ import annotations

from typing import Literal, NewType

# Semantic ID types - zero runtime cost, caught by mypy
AgentId = NewType("AgentId", str)
TaskId = NewType("TaskId", str)
SessionId = NewType("SessionId", str)
ProjectId = NewType("ProjectId", str)

# Orchestration action type - exhaustive pattern matching
NextAction = Literal[
    "plan",
    "execute",
    "review",
    "self_correct",
    "parallel_execute",
    "complete",
    "fail",
    "wait_approval",
]


# Helper constructors for explicit conversion from str
def as_agent_id(s: str) -> AgentId:
    """Explicitly convert a string to AgentId."""
    return AgentId(s)


def as_task_id(s: str) -> TaskId:
    """Explicitly convert a string to TaskId."""
    return TaskId(s)


def as_session_id(s: str) -> SessionId:
    """Explicitly convert a string to SessionId."""
    return SessionId(s)


def as_project_id(s: str) -> ProjectId:
    """Explicitly convert a string to ProjectId."""
    return ProjectId(s)
