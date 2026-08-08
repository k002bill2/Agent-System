"""로컬 Claude Code 프로세스 관리 라우트 (`/processes`).

호스트에서 돌고 있는 claude 프로세스를 나열하고, 지정한 PID 를 죽이거나
좀비 프로세스를 일괄 정리한다. 세션 파일이 아니라 **OS 프로세스**를 다루는
것이 이 모듈의 책임이다 — 다른 모듈이 모니터(`get_monitor`)를 통해 디스크를
읽는 것과 대비된다.

현재 세션과 그 부모 PID 는 kill 대상에서 제외한다(`protected`).

`GET /processes` 는 2세그먼트 구체 경로다 — `sessions` 의 `GET /{session_id}`
가 이를 가리므로 `__init__.py` 에서 **`sessions` 보다 먼저** include 해야 한다.
"""

from fastapi import APIRouter
from pydantic import BaseModel

from services.claude_session_monitor import (
    cleanup_stale_processes,
    kill_process,
    list_claude_processes,
)

router = APIRouter()


class ProcessInfo(BaseModel):
    """Process information for API response."""

    pid: int
    version: str
    terminal: str
    state: str
    started: str
    cpu_time: str
    memory_mb: float
    is_foreground: bool
    is_current: bool
    command: str


class ProcessListResponse(BaseModel):
    """Response for process list."""

    processes: list[ProcessInfo]
    total_count: int
    foreground_count: int
    background_count: int


class ProcessKillRequest(BaseModel):
    """Request to kill processes."""

    pids: list[int]
    force: bool = False


class ProcessKillResponse(BaseModel):
    """Response for process kill operation."""

    success: bool
    killed: list[int]
    failed: list[dict]
    protected: list[int]
    message: str


@router.get("/processes", response_model=ProcessListResponse)
async def list_processes() -> ProcessListResponse:
    """List all running Claude Code processes.

    Returns:
        List of processes with metadata
    """
    processes = list_claude_processes()

    foreground_count = sum(1 for p in processes if p.is_foreground)
    background_count = len(processes) - foreground_count

    return ProcessListResponse(
        processes=[
            ProcessInfo(
                pid=p.pid,
                version=p.version,
                terminal=p.terminal,
                state=p.state,
                started=p.started,
                cpu_time=p.cpu_time,
                memory_mb=p.memory_mb,
                is_foreground=p.is_foreground,
                is_current=p.is_current,
                command=p.command,
            )
            for p in processes
        ],
        total_count=len(processes),
        foreground_count=foreground_count,
        background_count=background_count,
    )


@router.post("/processes/kill", response_model=ProcessKillResponse)
async def kill_processes(request: ProcessKillRequest) -> ProcessKillResponse:
    """Kill specific Claude Code processes.

    Args:
        request: List of PIDs to kill

    Returns:
        Result with killed/failed/protected PIDs
    """
    killed = []
    failed = []
    protected = []

    import os

    current_pid = os.getpid()
    parent_pid = os.getppid()

    for pid in request.pids:
        # Protect current session
        if pid == current_pid or pid == parent_pid:
            protected.append(pid)
            continue

        success, message = kill_process(pid, force=request.force)
        if success:
            killed.append(pid)
        else:
            failed.append({"pid": pid, "error": message})

    return ProcessKillResponse(
        success=len(killed) > 0 or len(failed) == 0,
        killed=killed,
        failed=failed,
        protected=protected,
        message=f"Killed {len(killed)} process(es), {len(failed)} failed, {len(protected)} protected",
    )


@router.post("/processes/cleanup-stale", response_model=ProcessKillResponse)
async def cleanup_stale(include_foreground: bool = False) -> ProcessKillResponse:
    """Kill stale Claude Code processes.

    By default only kills background processes.
    With include_foreground=True, also kills foreground processes
    (e.g. zombie AOS-spawned sessions stuck in terminal tabs).

    Args:
        include_foreground: Also kill foreground processes (except current)

    Returns:
        Result with killed/failed/protected PIDs
    """
    result = cleanup_stale_processes(
        protect_foreground=not include_foreground,
        protect_current=True,
    )

    return ProcessKillResponse(
        success=len(result.killed) > 0 or len(result.failed) == 0,
        killed=result.killed,
        failed=[{"pid": pid, "error": msg} for pid, msg in result.failed],
        protected=result.protected,
        message=f"Cleaned up {len(result.killed)} stale process(es)",
    )
