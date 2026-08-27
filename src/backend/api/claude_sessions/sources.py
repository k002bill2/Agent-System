"""세션 소스 설정 라우트 (`/external-paths`, `/source-users`).

모니터가 훑을 외부 projects 디렉토리를 런타임에 추가·제거·조회하고, 발견된
세션의 소유 사용자 목록을 제공한다. 기본 경로(`~/.claude/projects`) 외의
경로를 다루는 것이 이 모듈의 책임이다.

`GET /external-paths` · `POST /external-paths` · `GET /source-users` 는
2세그먼트 구체 경로다 — `sessions` 의 `GET /{session_id}` 가 이들을 가리므로
`__init__.py` 에서 **`sessions` 보다 먼저** include 해야 한다.
"""

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from api.deps import get_current_admin_or_manager_user
from services.claude_session_monitor import get_monitor
from services.codex_session_monitor import get_codex_monitor

router = APIRouter(dependencies=[Depends(get_current_admin_or_manager_user)])


class ExternalPathRequest(BaseModel):
    """Request to add external path."""

    path: str


class ExternalPathResponse(BaseModel):
    """Response for external path operations."""

    success: bool
    message: str
    paths: list[str]


@router.get("/external-paths", response_model=ExternalPathResponse)
async def list_external_paths() -> ExternalPathResponse:
    """List all external (non-default) projects paths.

    Returns:
        List of external paths currently configured
    """
    monitor = get_monitor()
    paths = monitor.get_external_paths()

    return ExternalPathResponse(
        success=True,
        message=f"Found {len(paths)} external path(s)",
        paths=paths,
    )


@router.post("/external-paths", response_model=ExternalPathResponse)
async def add_external_path(request: ExternalPathRequest) -> ExternalPathResponse:
    """Add an external projects path at runtime.

    Args:
        request: Path to add

    Returns:
        Updated list of external paths
    """
    monitor = get_monitor()

    if monitor.add_external_path(request.path):
        return ExternalPathResponse(
            success=True,
            message=f"Added external path: {request.path}",
            paths=monitor.get_external_paths(),
        )
    else:
        raise HTTPException(
            status_code=400,
            detail=f"Path does not exist or is already added: {request.path}",
        )


@router.delete("/external-paths/{path_encoded}")
async def remove_external_path(path_encoded: str) -> ExternalPathResponse:
    """Remove an external projects path.

    Note: Path should be URL-encoded (/ -> %2F)

    Args:
        path_encoded: URL-encoded path to remove

    Returns:
        Updated list of external paths
    """
    import urllib.parse

    monitor = get_monitor()
    path = urllib.parse.unquote(path_encoded)

    if monitor.remove_external_path(path):
        return ExternalPathResponse(
            success=True,
            message=f"Removed external path: {path}",
            paths=monitor.get_external_paths(),
        )
    else:
        raise HTTPException(
            status_code=400,
            detail=f"Path not found or is the default path: {path}",
        )


@router.get("/source-users")
async def list_source_users() -> dict:
    """List all unique source users from discovered sessions.

    Returns:
        List of unique usernames and current user
    """
    monitor = get_monitor()
    users = set(monitor.get_unique_source_users())
    users.update(session.source_user for session in get_codex_monitor().discover_sessions())
    current_user = monitor._get_current_user()

    return {
        "users": sorted(users),
        "current_user": current_user,
    }
