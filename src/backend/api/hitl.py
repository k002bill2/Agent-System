"""HITL (Human-in-the-Loop) API routes.

Approval workflow: list pending, approve, deny operations.
"""

from typing import Any

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from api.deps import get_engine
from models.agent_state import AgentState, TaskStatus
from models.hitl import APPROVAL_STATE_LOCK, ApprovalResponse, ApprovalStatus
from orchestrator import OrchestrationEngine
from services.audit_service import AuditAction, AuditService, ResourceType
from utils.time import utcnow

router = APIRouter(tags=["orchestration"])

# 승인 전이(조회 → 검사 → 변경 → 영속화)는 `APPROVAL_STATE_LOCK` 으로 직렬화한다.
#
# 경합 창은 검사와 변경 사이가 아니라 **그 위의 세션 조회**에 있다.
# `engine.get_session` 은 캐시 미스 시 `await` 하고, DB 경로는 호출마다 새 dict 를
# 돌려주므로(`repo.get_state` 가 JSONB 를 매번 디코딩), 캐시가 빈 상태(프로세스
# 재시작 직후)에서 동시에 들어온 두 요청이 각자 사본에서 PENDING 을 보고
# **둘 다 통과**한다 — 같은 승인으로 위험한 도구가 두 번 실행되는 경로다.
#
# 세션별이 아니라 전역 락 하나인 이유: 승인은 사람이 누르는 저빈도 경로이고
# 임계구역은 조회·저장 왕복뿐이다. 세션별 락은 세션 수만큼 락 객체가 누적된다.


async def resolve_approval(
    engine: OrchestrationEngine,
    session_id: str,
    approval_id: str,
    *,
    approved: bool,
    note: str | None,
) -> tuple[AgentState, dict[str, Any]]:
    """승인/거부 전이의 **유일한** 관문 (REST · WebSocket 공용).

    두 경로가 같은 전이를 각자 구현하면 한쪽에만 검사가 걸린다 — 실제로
    WebSocket 경로에는 PENDING 검사가 없어 이미 소비된(`consumed`) 승인을 다시
    `approved` 로 되돌릴 수 있었고, 그러면 같은 도구가 다시 실행된다.

    조회 → 검사 → 변경 → 영속화를 락 안에서 끝낸다. 그래프 실행은 호출자가 락
    **밖에서** 한다 — 분 단위 실행을 락 안에 두면 두 번째 요청이 응답 없이 매달린다.

    Raises:
        HTTPException: 404(세션·승인 없음) / 400(이미 해소된 승인)
    """
    async with APPROVAL_STATE_LOCK.lock():
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

        # 영속화가 실패하면 되돌리기 위해 이전 값을 잡아 둔다. 되돌리지 않으면
        # 캐시는 `approved`, 저장소는 `pending` 으로 갈라져 재시도가 400 을 받고
        # 그 승인은 영영 해소할 수 없게 된다.
        before_approval = dict(approval)
        before_waiting = state.get("waiting_for_approval")
        before_task: tuple[TaskStatus, str | None, str | None] | None = None

        approval["status"] = (
            ApprovalStatus.APPROVED.value if approved else ApprovalStatus.DENIED.value
        )
        approval["resolver_note"] = note if approved else (note or "Denied by user")
        approval["resolved_at"] = utcnow().isoformat()
        state["pending_approvals"] = pending_approvals
        state["waiting_for_approval"] = False

        task_id = approval["task_id"]
        if not approved:
            tasks = state.get("tasks", {})
            if task_id in tasks:
                task = tasks[task_id]
                before_task = (task.status, task.error, task.pending_approval_id)
                task.status = TaskStatus.FAILED
                task.error = f"Operation denied: {approval['resolver_note']}"
                task.pending_approval_id = None

        # 그래프 실행 **전에** 저장한다. `engine.run` 의 일괄 저장에만 기대면
        # 실행이 실패했을 때 승인이 통째로 사라지고, 도구가 부수효과를 낸 뒤
        # 저장 전에 죽으면 재시작 후 같은 승인이 다시 PENDING 으로 보인다.
        # 거부는 그래프를 돌리지도 않으므로 여기서 저장하지 않으면 아무 데도 남지 않는다.
        try:
            await engine.save_session(session_id, state)
        except Exception:
            approval.clear()
            approval.update(before_approval)
            state["waiting_for_approval"] = before_waiting
            if before_task is not None:
                task = state["tasks"][task_id]
                task.status, task.error, task.pending_approval_id = before_task
            raise

        # 감사 로그는 **저장에 성공한 뒤**에 남긴다. 먼저 남기면 롤백된 전이가
        # "승인됨"으로 기록돼 감사 기록만 홀로 어긋난다.
        AuditService.log(
            action=AuditAction.APPROVAL_GRANTED if approved else AuditAction.APPROVAL_DENIED,
            resource_type=ResourceType.APPROVAL,
            resource_id=approval_id,
            session_id=session_id,
            project_id=state.get("project", {}).get("id"),
            metadata={
                "task_id": task_id,
                "tool_name": approval.get("tool_name"),
                "note": approval["resolver_note"],
            },
        )

    return state, approval


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
    _, approval = await resolve_approval(
        engine,
        session_id,
        approval_id,
        approved=True,
        note=response.note if response else None,
    )

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
    _, approval = await resolve_approval(
        engine,
        session_id,
        approval_id,
        approved=False,
        note=response.note if response else None,
    )

    return {
        "message": "Operation denied",
        "approval_id": approval_id,
        "task_id": approval["task_id"],
    }
