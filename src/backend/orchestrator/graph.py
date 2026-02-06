"""LangGraph orchestration graph definition."""

from typing import Any, Literal

from langgraph.graph import END, StateGraph

from models.agent_state import AgentState, TaskStatus
from orchestrator.nodes import (
    ExecutorNode,
    OrchestratorNode,
    PlannerNode,
    ReviewerNode,
    SelfCorrectionNode,
)
from orchestrator.parallel_executor import ParallelExecutorNode


async def waiting_node(state: AgentState) -> dict[str, Any]:
    """
    Waiting node for HITL approval.

    This node is a passthrough that maintains the waiting state.
    The graph will be resumed from this point after approval/denial.
    """
    return {
        "waiting_for_approval": state.get("waiting_for_approval", True),
    }


def route_orchestrator(state: AgentState) -> Literal["planner", "executor", "execute_batch", "reviewer", "end"]:
    """Route from orchestrator to next node."""
    next_action = state.get("next_action")

    if next_action == "plan":
        return "planner"
    elif next_action == "execute":
        return "executor"
    elif next_action == "execute_batch":
        return "execute_batch"
    elif next_action == "review":
        return "reviewer"
    else:
        return "end"


def route_planner(state: AgentState) -> Literal["orchestrator", "end"]:
    """Route from planner back to orchestrator."""
    if state.get("last_error"):
        return "end"
    return "orchestrator"


def route_executor(state: AgentState) -> Literal["orchestrator", "waiting", "self_correct", "end"]:
    """Route from executor back to orchestrator, waiting state, or self-correction."""
    if state.get("waiting_for_approval"):
        return "waiting"

    # Check if current task failed and can be retried
    current_task_id = state.get("current_task_id")
    tasks = state.get("tasks", {})

    if current_task_id and current_task_id in tasks:
        task = tasks[current_task_id]
        if task.status == TaskStatus.FAILED:
            # Check if retries are available
            if task.retry_count < task.max_retries:
                return "self_correct"

    if state.get("last_error"):
        return "end"
    return "orchestrator"


def route_self_correct(state: AgentState) -> Literal["executor", "orchestrator", "end"]:
    """Route from self-correction to executor (retry) or orchestrator."""
    current_task_id = state.get("current_task_id")
    tasks = state.get("tasks", {})

    if current_task_id and current_task_id in tasks:
        task = tasks[current_task_id]
        # If task was reset to pending by self-correction, execute it
        if task.status == TaskStatus.PENDING:
            return "executor"
        # If still failed (max retries or can't retry), go back to orchestrator
        elif task.status == TaskStatus.FAILED:
            return "orchestrator"

    return "orchestrator"


def route_reviewer(state: AgentState) -> Literal["orchestrator", "end"]:
    """Route from reviewer back to orchestrator."""
    if state.get("last_error"):
        return "end"
    return "orchestrator"


def should_continue(state: AgentState) -> bool:
    """Check if orchestration should continue."""
    iteration_count = state.get("iteration_count", 0)
    max_iterations = state.get("max_iterations", 100)

    if iteration_count >= max_iterations:
        return False

    # Check if all tasks are completed
    tasks = state.get("tasks", {})
    root_task_id = state.get("root_task_id")

    if root_task_id and root_task_id in tasks:
        root_task = tasks[root_task_id]
        if root_task.status in ("completed", "failed", "cancelled"):
            return False

    return True


def create_orchestrator_graph(
    orchestrator_node: OrchestratorNode,
    planner_node: PlannerNode,
    executor_node: ExecutorNode,
    reviewer_node: ReviewerNode,
    self_correction_node: SelfCorrectionNode | None = None,
    parallel_executor_node: ParallelExecutorNode | None = None,
) -> StateGraph:
    """
    Create the main orchestration graph.

    Graph structure:
    ```
    [START] -> orchestrator -> {planner, executor, execute_batch, reviewer} -> orchestrator -> [END]
                                     |                    |
                                executor           execute_batch (parallel)
                                     |                    |
                                     +-----> waiting (HITL) -> [END/executor]
                                     |
                                executor --error--> self_correct --> executor (retry)
                                                        |
                                                        +--max retries--> orchestrator
    ```
    """
    # Create the graph
    graph = StateGraph(AgentState)

    # Add nodes
    graph.add_node("orchestrator", orchestrator_node.run)
    graph.add_node("planner", planner_node.run)
    graph.add_node("executor", executor_node.run)
    graph.add_node("reviewer", reviewer_node.run)
    graph.add_node("waiting", waiting_node)  # HITL waiting node

    # Add parallel executor node if provided
    if parallel_executor_node:
        graph.add_node("execute_batch", parallel_executor_node.run)

    # Add self-correction node if provided
    if self_correction_node:
        graph.add_node("self_correct", self_correction_node.run)

    # Set entry point
    graph.set_entry_point("orchestrator")

    # Add conditional edges from orchestrator
    orchestrator_edges = {
        "planner": "planner",
        "executor": "executor",
        "reviewer": "reviewer",
        "end": END,
    }
    if parallel_executor_node:
        orchestrator_edges["execute_batch"] = "execute_batch"

    graph.add_conditional_edges(
        "orchestrator",
        route_orchestrator,
        orchestrator_edges,
    )

    # Add edges back to orchestrator
    graph.add_conditional_edges(
        "planner",
        route_planner,
        {
            "orchestrator": "orchestrator",
            "end": END,
        },
    )

    # Executor routing with self-correction support
    executor_edges = {
        "orchestrator": "orchestrator",
        "waiting": "waiting",  # HITL: Go to waiting state
        "end": END,
    }
    if self_correction_node:
        executor_edges["self_correct"] = "self_correct"

    graph.add_conditional_edges(
        "executor",
        route_executor,
        executor_edges,
    )

    # Add self-correction routing if enabled
    if self_correction_node:
        graph.add_conditional_edges(
            "self_correct",
            route_self_correct,
            {
                "executor": "executor",  # Retry
                "orchestrator": "orchestrator",  # Max retries exceeded
                "end": END,
            },
        )

    graph.add_conditional_edges(
        "reviewer",
        route_reviewer,
        {
            "orchestrator": "orchestrator",
            "end": END,
        },
    )

    # Add parallel executor routing if enabled
    if parallel_executor_node:
        graph.add_edge("execute_batch", "orchestrator")

    # Waiting node ends the current execution (will be resumed after approval)
    graph.add_edge("waiting", END)

    return graph


def compile_graph(graph: StateGraph):
    """Compile the graph for execution."""
    return graph.compile()
