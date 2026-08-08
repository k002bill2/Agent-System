"""tmux 관련 Agents API 라우트.

Claude CLI 인증 상태, tmux 세션 기반 실행과 세션 관리, 실행 전략 목록.
workspace 경로 검증 헬퍼(get_allowed_workspace_roots·_validate_project_path·
ALLOWED_WORKSPACE_ROOTS)가 여기 산다 — tmux 실행 경로 검증 전용이며,
`__init__.py` 가 이 셋을 재노출한다(패키지 밖 테스트가 직접 가져간다).
"""

import os
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from agents.lead_orchestrator import (
    ExecutionStrategy,
)
from api.deps import get_current_user
from db.models import UserModel
from models.llm_usage import (
    LLMUsageSource,
)
from services.agent_registry import (
    EffortLevel,
)
from services.llm_usage_ledger_service import (
    LLMUsageQuotaExceededError,
)
from services.task_analysis_service import (
    get_task_analysis_service,
)

router = APIRouter()


router = APIRouter()

_DEFAULT_WORKSPACE_ROOTS = [
    Path.home() / "Work",
    Path.home() / "Projects",
    Path.home() / "Developer",
    Path("/tmp/aos-workspaces"),
]


def get_allowed_workspace_roots() -> list[Path]:
    """Get allowed workspace roots, configurable via AOS_WORKSPACE_ROOTS env.

    Env format: comma-separated paths, e.g. "/home/user/Work,/opt/projects"
    Falls back to defaults if env is not set.
    """
    env_roots = os.getenv("AOS_WORKSPACE_ROOTS")
    if env_roots:
        return [Path(p.strip()) for p in env_roots.split(",") if p.strip()]
    return _DEFAULT_WORKSPACE_ROOTS


# Module-level alias for backward compat
ALLOWED_WORKSPACE_ROOTS = _DEFAULT_WORKSPACE_ROOTS


def _validate_project_path(path_str: str) -> Path:
    """Validate project path is within allowed workspace directories.

    Raises HTTPException if path is outside allowed roots or contains traversal.
    """
    try:
        resolved = Path(path_str).resolve()
    except (ValueError, OSError):
        raise HTTPException(status_code=400, detail=f"Invalid project path: {path_str}")

    # Check for path traversal attempts
    if ".." in Path(path_str).parts:
        raise HTTPException(status_code=400, detail="Path traversal not allowed")

    # Verify path is within allowed roots (use dynamic getter for env support)
    allowed_roots = get_allowed_workspace_roots()
    for allowed_root in allowed_roots:
        try:
            if resolved.is_relative_to(allowed_root.resolve()):
                return resolved
        except (ValueError, OSError):
            continue

    raise HTTPException(
        status_code=400,
        detail="Project path must be within allowed workspace directories",
    )


class ExecuteWithTmuxRequest(BaseModel):
    """tmux + Claude CLI 실행 요청."""

    analysis_id: str = Field(..., description="실행할 분석 ID")
    project_id: str | None = Field(None, description="프로젝트 ID (선택)")
    branch_name: str | None = Field(None, description="실행 전 생성할 feature branch (선택)")


class TmuxSessionResponse(BaseModel):
    """tmux 세션 응답."""

    session_name: str
    analysis_id: str
    active: bool
    output: str = ""
    started_at: str
    task_input: str = ""


# ─────────────────────────────────────────────────────────────
# Tmux + Claude Code CLI Execution API
# ─────────────────────────────────────────────────────────────


@router.get("/orchestrate/claude-auth-status")
async def check_claude_auth_status(_user: UserModel = Depends(get_current_user)):
    """Claude CLI 인증 상태 및 크레딧 사전 체크.

    tmux 실행 전에 호출하여 인증/크레딧 문제를 미리 확인.
    """
    from services.tmux_service import get_tmux_service

    tmux = get_tmux_service()

    if not tmux.is_available():
        return {
            "authenticated": False,
            "has_credits": False,
            "error": "tmux_not_installed",
            "message": "tmux가 설치되어 있지 않습니다.",
        }

    auth_status = await tmux.check_claude_auth()
    return auth_status.model_dump()


@router.post("/orchestrate/execute-with-tmux", response_model=TmuxSessionResponse)
async def execute_with_tmux(
    request: ExecuteWithTmuxRequest, current_user: UserModel = Depends(get_current_user)
):
    """
    분석 결과를 tmux + Claude Code CLI로 실행.

    1. 저장된 분석 결과 조회
    2. 프로젝트 경로 결정
    3. Claude Code 프롬프트 생성
    4. tmux 세션에서 claude -p 실행
    5. session_name 반환
    """
    from services.tmux_service import get_tmux_service

    tmux = get_tmux_service()

    if not tmux.is_available():
        raise HTTPException(status_code=503, detail="tmux is not installed on the server")

    if not tmux.is_claude_available():
        raise HTTPException(status_code=503, detail="Claude CLI is not installed on the server")

    # NOTE: 인증/크레딧 사전 체크를 제거함.
    # 백엔드 프로세스 환경에서 claude를 실행하면 macOS 키체인 접근이 달라
    # 실제로는 정상인데도 인증 실패로 오판할 수 있음.
    # tmux 세션은 사용자의 login shell 환경을 상속하므로 정상 동작하며,
    # 인증/크레딧 문제가 있으면 tmux 출력에서 자연스럽게 확인 가능.

    # 분석 결과 조회
    analysis_service = get_task_analysis_service()
    entry = await analysis_service.get_analysis(request.analysis_id)
    if not entry:
        raise HTTPException(status_code=404, detail=f"Analysis not found: {request.analysis_id}")

    if not entry.success or not entry.analysis:
        raise HTTPException(status_code=400, detail="Cannot execute a failed analysis")

    # 프로젝트 경로 결정
    project_path = "."
    project_id = request.project_id or entry.project_id
    if project_id:
        try:
            from services.project_service import get_project_service

            project_service = get_project_service()
            project = await project_service.get_project(project_id)
            if project and project.path:
                project_path = project.path
        except Exception:
            pass

    # 컨텍스트에서 project_path 추출 시도
    if project_path == "." and entry.context:
        ctx_path = entry.context.get("project_path")
        if ctx_path:
            project_path = ctx_path

    # 경로 유효성 검증 (path traversal 방어)
    # "." 포함 모든 경로를 검증 — CWD가 허용 범위 밖일 수 있음
    validated_path = _validate_project_path(project_path)
    project_path = str(validated_path)

    # tmux + Claude CLI 실행

    try:
        info = await tmux.execute_analysis(
            analysis_id=request.analysis_id,
            project_path=project_path,
            analysis=entry.analysis,
            task_input=entry.task_input,
            branch_name=request.branch_name,
            usage_context={
                "source": LLMUsageSource.TASK_ANALYZER_EXECUTION,
                "user_id": str(current_user.id),
                "organization_id": getattr(current_user, "organization_id", None),
                "project_id": project_id,
                "metadata": {"api_endpoint": "execute-with-tmux"},
            },
        )
    except LLMUsageQuotaExceededError as exc:
        raise HTTPException(status_code=429, detail=str(exc)) from exc

    if not info:
        raise HTTPException(status_code=500, detail="Failed to create tmux session")

    return TmuxSessionResponse(
        session_name=info.session_name,
        analysis_id=info.analysis_id,
        active=info.active,
        output="",
        started_at=info.started_at.isoformat(),
        task_input=info.task_input,
    )


@router.get("/orchestrate/tmux-sessions/{session_name}/status", response_model=TmuxSessionResponse)
async def get_tmux_session_status(session_name: str, _user: UserModel = Depends(get_current_user)):
    """tmux 세션 상태 + 최근 출력 조회."""
    from services.tmux_service import get_tmux_service

    tmux = get_tmux_service()
    info = tmux.get_session(session_name)

    if not info:
        raise HTTPException(status_code=404, detail=f"Tmux session not found: {session_name}")

    # 출력 캡처
    output = ""
    if info.active:
        captured = tmux.capture_output(session_name)
        if captured is not None:
            output = captured
    else:
        # 세션이 종료된 경우에도 마지막 캡처 시도
        captured = tmux.capture_output(session_name)
        if captured is not None:
            output = captured

    return TmuxSessionResponse(
        session_name=info.session_name,
        analysis_id=info.analysis_id,
        active=info.active,
        output=output,
        started_at=info.started_at.isoformat(),
        task_input=info.task_input,
    )


@router.get("/orchestrate/tmux-sessions/{session_name}/stream")
async def stream_tmux_session(session_name: str, _user: UserModel = Depends(get_current_user)):
    """SSE 스트리밍으로 tmux 세션 출력 전달 (2초 폴링)."""
    import asyncio

    from starlette.responses import StreamingResponse

    from services.tmux_service import get_tmux_service

    tmux = get_tmux_service()
    info = tmux.get_session(session_name)

    if not info:
        raise HTTPException(status_code=404, detail=f"Tmux session not found: {session_name}")

    async def event_generator():
        last_output = ""
        inactive_count = 0

        while True:
            current_info = tmux.get_session(session_name)
            if not current_info:
                yield "data: {'event': 'session_ended', 'active': false}\n\n"
                break

            captured = tmux.capture_output(session_name)
            output = captured if captured is not None else ""

            # 새로운 출력이 있으면 전송
            if output != last_output:
                import json

                data = json.dumps(
                    {
                        "event": "output",
                        "output": output,
                        "active": current_info.active,
                    }
                )
                yield f"data: {data}\n\n"
                last_output = output
                inactive_count = 0
            else:
                inactive_count += 1

            # 세션이 종료되면 마지막 상태 전송 후 종료
            if not current_info.active:
                import json

                data = json.dumps(
                    {
                        "event": "session_ended",
                        "output": output,
                        "active": False,
                    }
                )
                yield f"data: {data}\n\n"
                break

            # 5분 동안 변화 없으면 종료 (150 * 2초)
            if inactive_count > 150:
                yield "data: {'event': 'timeout'}\n\n"
                break

            await asyncio.sleep(2)

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


@router.post("/orchestrate/tmux-sessions/{session_name}/stop")
async def stop_tmux_session(session_name: str, _user: UserModel = Depends(get_current_user)):
    """tmux 세션 강제 종료."""
    from services.tmux_service import get_tmux_service

    tmux = get_tmux_service()
    info = tmux.get_session(session_name)

    if not info:
        raise HTTPException(status_code=404, detail=f"Tmux session not found: {session_name}")

    success = tmux.kill_session(session_name)

    if not success:
        raise HTTPException(status_code=500, detail=f"Failed to kill tmux session: {session_name}")

    return {"message": f"Tmux session {session_name} stopped", "success": True}


@router.get("/orchestrate/tmux-sessions")
async def list_tmux_sessions(_user: UserModel = Depends(get_current_user)):
    """모든 AOS tmux 세션 목록."""
    from services.tmux_service import get_tmux_service

    tmux = get_tmux_service()
    sessions = tmux.list_aos_sessions()

    return {
        "sessions": [
            TmuxSessionResponse(
                session_name=s.session_name,
                analysis_id=s.analysis_id,
                active=s.active,
                output="",
                started_at=s.started_at.isoformat(),
                task_input=s.task_input,
            ).model_dump()
            for s in sessions
        ],
        "total": len(sessions),
    }


@router.get("/orchestrate/strategies")
async def get_execution_strategies(_user: UserModel = Depends(get_current_user)):
    """사용 가능한 실행 전략 목록."""
    return {
        "strategies": [
            {
                "value": s.value,
                "description": {
                    "sequential": "순차 실행 - 태스크를 하나씩 순서대로 실행",
                    "parallel": "병렬 실행 - 독립적인 태스크를 동시에 실행",
                    "mixed": "혼합 실행 - 일부 병렬, 일부 순차",
                }[s.value],
            }
            for s in ExecutionStrategy
        ],
        "effort_levels": [
            {
                "value": e.value,
                "description": {
                    "quick": "빠른 작업 (< 5분)",
                    "medium": "중간 복잡도 (5-30분)",
                    "thorough": "복잡한 작업 (30분+)",
                }[e.value],
            }
            for e in EffortLevel
        ],
    }
