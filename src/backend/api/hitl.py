"""HITL (Human-in-the-Loop) API routes.

Approval workflow: list pending, approve, deny operations.
"""

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from api.deps import get_engine
from models.agent_state import TaskStatus
from models.hitl import ApprovalResponse, ApprovalStatus
from orchestrator import OrchestrationEngine

router = APIRouter(tags=["orchestration"])


class ApprovalRequestResponse(BaseModel):
    """Response for pending approval requests."""

    approval_id: str
    task_id: str
    tool_name: str
    tool_args: dict
    risk_level: str
    risk_description: str
    created_at: str
    status: str


@router.get("/sessions/{session_id}/approvals")
async def get_pending_approvals(
    session_id: str,
    engine: OrchestrationEngine = Depends(get_engine),
) -> list[ApprovalRequestResponse]:
    """Get all pending approval requests for a session."""
    state = await engine.get_session(session_id)
    if not state:
        raise HTTPException(status_code=404, detail="Session not found")

    pending_approvals = state.get("pending_approvals", {})
    return [
        ApprovalRequestResponse(
            approval_id=approval["id"],
            task_id=approval["task_id"],
            tool_name=approval["tool_name"],
            tool_args=approval["tool_args"],
            risk_level=approval["risk_level"],
            risk_description=approval["risk_description"],
            created_at=approval["created_at"],
            status=approval["status"],
        )
        for approval in pending_approvals.values()
        if approval["status"] == ApprovalStatus.PENDING.value
    ]


@router.post("/sessions/{session_id}/approve/{approval_id}")
async def approve_operation(
    session_id: str,
    approval_id: str,
    response: ApprovalResponse | None = None,
    engine: OrchestrationEngine = Depends(get_engine),
):
    """
    Approve a pending operation.

    This will update the approval status and resume execution.
    """
    state = await engine.get_session(session_id)
    if not state:
        raise HTTPException(status_code=404, detail="Session not found")

    pending_approvals = state.get("pending_approvals", {})
    if approval_id not in pending_approvals:
        raise HTTPException(status_code=404, detail="Approval request not found")

    approval = pending_approvals[approval_id]
    if approval["status"] != ApprovalStatus.PENDING.value:
        raise HTTPException(
            status_code=400, detail=f"Approval already resolved: {approval['status']}"
        )

    # Update approval status
    approval["status"] = ApprovalStatus.APPROVED.value
    approval["resolver_note"] = response.note if response else None
    state["pending_approvals"] = pending_approvals
    state["waiting_for_approval"] = False

    # Resume execution
    try:
        await engine.run(session_id, "")
        return {
            "message": "Operation approved",
            "approval_id": approval_id,
            "task_id": approval["task_id"],
            "resumed": True,
        }
    except Exception as e:
        return {
            "message": "Operation approved but execution failed",
            "approval_id": approval_id,
            "error": str(e),
        }


@router.post("/sessions/{session_id}/deny/{approval_id}")
async def deny_operation(
    session_id: str,
    approval_id: str,
    response: ApprovalResponse | None = None,
    engine: OrchestrationEngine = Depends(get_engine),
):
    """
    Deny a pending operation.

    This will mark the task as failed and stop execution.
    """
    state = await engine.get_session(session_id)
    if not state:
        raise HTTPException(status_code=404, detail="Session not found")

    pending_approvals = state.get("pending_approvals", {})
    if approval_id not in pending_approvals:
        raise HTTPException(status_code=404, detail="Approval request not found")

    approval = pending_approvals[approval_id]
    if approval["status"] != ApprovalStatus.PENDING.value:
        raise HTTPException(
            status_code=400, detail=f"Approval already resolved: {approval['status']}"
        )

    # Update approval status
    approval["status"] = ApprovalStatus.DENIED.value
    approval["resolver_note"] = response.note if response else "Denied by user"
    state["pending_approvals"] = pending_approvals
    state["waiting_for_approval"] = False

    # Update the task status
    task_id = approval["task_id"]
    tasks = state.get("tasks", {})
    if task_id in tasks:
        task = tasks[task_id]
        task.status = TaskStatus.FAILED
        task.error = f"Operation denied: {approval['resolver_note']}"
        task.pending_approval_id = None

    return {
        "message": "Operation denied",
        "approval_id": approval_id,
        "task_id": task_id,
    }
