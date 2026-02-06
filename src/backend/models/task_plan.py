"""Task planning schemas for LLM-based task decomposition."""

from typing import Literal

from pydantic import BaseModel, Field


class SubtaskPlan(BaseModel):
    """A planned subtask from LLM decomposition."""

    title: str = Field(..., description="Short, descriptive title for the subtask")
    description: str = Field(..., description="Detailed description of what needs to be done")
    estimated_effort: Literal["low", "medium", "high"] = Field(
        default="medium",
        description="Estimated effort level for this subtask"
    )
    dependencies: list[str] = Field(
        default_factory=list,
        description="List of subtask titles that must be completed before this one"
    )
    required_tools: list[str] = Field(
        default_factory=list,
        description="List of tools that may be needed for this subtask"
    )


class TaskPlanResult(BaseModel):
    """Result of LLM task decomposition."""

    analysis: str = Field(
        ...,
        description="Brief analysis of the task and approach"
    )
    is_complex: bool = Field(
        default=True,
        description="Whether the task requires multiple subtasks"
    )
    subtasks: list[SubtaskPlan] = Field(
        default_factory=list,
        description="List of subtasks to execute"
    )


PLANNER_SYSTEM_PROMPT = """You are a Task Planner in a multi-agent orchestration system.

Your role is to analyze user requests and decompose them into actionable subtasks.

## Guidelines

1. **Analysis First**: Understand the user's intent and the scope of work needed.

2. **Task Decomposition**:
   - Break complex tasks into 2-5 smaller, actionable subtasks
   - Each subtask should be independently executable
   - Keep simple tasks as single subtasks

3. **Dependencies**:
   - Identify which subtasks depend on others
   - Reference dependencies by subtask title
   - Tasks without dependencies can run in parallel

4. **Effort Estimation**:
   - low: Quick file reads, simple edits, basic commands
   - medium: Multiple file operations, code modifications
   - high: Complex refactoring, extensive testing, multiple components

5. **Required Tools**:
   - read_file, write_file, edit_file: File operations
   - list_directory, search_files, search_content: Navigation and search
   - execute_bash: Shell commands
   - run_tests, run_lint, run_typecheck: Code quality checks

## Example

For "Add a login feature with validation":
- Subtask 1: "Research existing auth patterns" (low effort, no deps, tools: search_files, read_file)
- Subtask 2: "Create login form component" (medium effort, deps: [Subtask 1], tools: write_file)
- Subtask 3: "Add form validation logic" (medium effort, deps: [Subtask 2], tools: edit_file)
- Subtask 4: "Write tests for login" (medium effort, deps: [Subtask 3], tools: write_file, run_tests)

Respond with a structured JSON plan."""


PLANNER_USER_TEMPLATE = """## Task to Plan

{task_description}

## Project Context

{project_context}

## Available Tools

{available_tools}

---

Analyze this task and create an execution plan with subtasks. If the task is simple (single action), create just one subtask."""
