"""Git API 모듈들이 공유하는 의존성.

`_legacy.py` 분할 과정에서 여러 모듈이 함께 쓰게 된 이름을 여기로 승격한다.
순환 import 를 막기 위해 이 모듈은 형제 모듈(`._legacy` 포함)을 import 하지
않는다 — 의존은 항상 한 방향(형제 → `_shared`)이다.
"""

import os

from fastapi import Depends, HTTPException, Request
from sqlalchemy.ext.asyncio import AsyncSession

from api.deps import get_current_user, get_db_session, require_project_role
from models.project import Project, get_project


def _use_database() -> bool:
    return os.getenv("USE_DATABASE", "false").lower() == "true"


# =============================================================================
# Project Resolution & Authorization
# =============================================================================


async def resolve_project(project_id: str) -> Project:
    """`project_id` 를 그 모드의 권위 레지스트리로 해석한다.

    DB 모드에서는 `ProjectModel` 이 유일한 권위다 — 파일시스템 폴백을 두지 않는다.
    폴백을 두면 `projects/` 심링크 이름만 알면 DB 미등록 프로젝트에 git API 가 닿고,
    `enforce_git_project_access` 가 거는 인가도 그 경로로 우회된다
    (`api/sessions.py:_resolve_project_context` 가 파일시스템을 먼저 보는 탓에 실제로
    그 우회를 갖고 있다 — 여기서는 반복하지 않는다).

    DB 행에서 만든 `Project` 는 `Project.from_path` 로 구성한다. `.aos-project.json`
    의 `git_path`·CLAUDE.md·저장소 유효성을 그대로 얻기 위해서다 — 필드를 손으로
    옮기면 git-path 설정이 조용히 무시된다.
    """
    if not _use_database():
        project = get_project(project_id)
        if not project:
            raise HTTPException(status_code=404, detail=f"Project '{project_id}' not found")
        return project

    from sqlalchemy import select

    from db.database import async_session_factory
    from db.models import ProjectModel

    try:
        async with async_session_factory() as session:
            row = (
                await session.execute(
                    select(ProjectModel).where(
                        ProjectModel.id == project_id,
                        ProjectModel.is_active == True,  # noqa: E712
                    )
                )
            ).scalar_one_or_none()
    except Exception as exc:
        raise HTTPException(
            status_code=503,
            detail="Project lookup is temporarily unavailable",
        ) from exc

    if row is None or not row.path:
        raise HTTPException(status_code=404, detail=f"Project '{project_id}' not found")

    project = Project.from_path(str(row.id), str(row.path))

    # 이름·설명의 권위는 DB 행이다. `from_path` 는 폴더명·package.json 에서 파생하므로
    # 그대로 두면 git-path 저장(`set_project_git_path` → `.aos-project.json`)이 그
    # 파일시스템 기본값을 써 넣어 DB 레코드와 조용히 갈린다.
    return project.model_copy(update={"name": row.name, "description": row.description or ""})


async def enforce_git_project_access(
    request: Request,
    current_user=Depends(get_current_user),
    db: AsyncSession = Depends(get_db_session),
) -> None:
    """`{project_id}` 를 가진 git 라우트 전체에 프로젝트 단위 인가를 건다.

    `project_id` 를 파라미터로 **선언하지 않고** `request.path_params` 에서 읽는 것이
    핵심이다. 선언하면 FastAPI 가 `{project_id}` 없는 라우트(`/repositories`,
    `/github/...`)에서 그것을 필수 쿼리 파라미터로 해석해 그 라우트들이 깨진다.
    라우터 소유 모듈에 걸어 두면 새 라우트가 추가돼도 자동으로 덮인다 — 라우트마다
    붙이는 방식은 한 곳만 빠뜨려도 조용히 열린다.

    메모리 모드에는 프로젝트 ACL 자체가 없으므로(레지스트리가 곧 접근 범위) DB
    모드에서만 강제한다. 이는 기존 동작 유지이며, 이 변경으로 새로 열리는 표면은 없다.
    """
    if not _use_database():
        return

    project_id = request.path_params.get("project_id")
    if project_id is None:
        return

    # 읽기와 쓰기를 나눈다. `models/git/permissions.py` 의 `viewer` 는 READ 전용인데
    # 전 라우트를 viewer 로 통과시키면 viewer 가 커밋·푸시·브랜치 삭제·브랜치 보호
    # 변경까지 하게 된다. 기준은 `api/project_configs` 의 filesystem 분기와 같은
    # 관례(GET=viewer / 그 외=editor)라 두 표면의 쓰기 권한 기준이 일치한다.
    #
    # 읽기만 하는 POST(`/merge/preview`·`/draft-commits`)도 editor 를 요구한다 —
    # 메서드 기준은 라우트 표가 드리프트하지 않고, 엄격한 쪽으로 틀린다.
    min_role = "viewer" if request.method in {"GET", "HEAD", "OPTIONS"} else "editor"

    # 404(미등록) / 403(거부) / 503(조회 실패) — 전부 fail-closed.
    await require_project_role(project_id, current_user, db, min_role=min_role)


# =============================================================================
# Service Factories & Path Helpers
# =============================================================================


def get_github_service():
    """Get GitHubService instance."""
    from services.github_service import get_github_service as factory

    service = factory()
    if not service:
        raise HTTPException(
            status_code=503,
            detail="GitHub service not available. Check GITHUB_TOKEN environment variable.",
        )

    return service


def get_effective_git_path(project) -> str:
    """Get the effective Git path for a project."""
    return project.git_path or project.path


async def get_git_service_for_project(project_id: str, worktree_path: str | None = None):
    """Get GitService for a project, optionally targeting a specific worktree.

    인가는 호출자가 아니라 라우터의 `enforce_git_project_access` 가 이미 걸었다 —
    여기서는 해석만 한다.

    Args:
        project_id: Project identifier
        worktree_path: Optional worktree path. Validated against actual worktree list.
    """
    from pathlib import Path

    from services.git_service import get_git_service

    project = await resolve_project(project_id)

    git_path = get_effective_git_path(project)
    service = get_git_service(git_path)
    if not service:
        raise HTTPException(
            status_code=400, detail=f"Project '{project_id}' is not a Git repository"
        )

    if worktree_path:
        # Security: validate worktree_path against actual worktree list
        resolved_requested = str(Path(worktree_path).resolve())
        valid_paths = {str(Path(wt.path).resolve()) for wt in service.list_worktrees()}
        if resolved_requested not in valid_paths:
            raise HTTPException(
                status_code=403,
                detail="Invalid worktree path: not a registered worktree",
            )
        # Return a GitService instance pointing to the worktree
        wt_service = get_git_service(resolved_requested)
        if not wt_service:
            raise HTTPException(
                status_code=400,
                detail="Worktree path is not a valid Git working directory",
            )
        return wt_service

    return service


async def get_mr_service_for_project(project_id: str, db_session=None):
    """Get MergeRequestService for a project."""
    from services.merge_service import MergeRequestService, get_merge_service

    project = await resolve_project(project_id)

    git_path = get_effective_git_path(project)
    merge_service = get_merge_service(git_path)
    return MergeRequestService(project_id, merge_service, db_session=db_session)


# =============================================================================
# DB Session
# =============================================================================


async def _get_db_session():
    """Get optional DB session (returns None if DB not configured)."""
    import os

    if os.getenv("USE_DATABASE", "false").lower() != "true":
        return None
    try:
        from db.database import async_session_factory

        return async_session_factory()
    except Exception:
        return None
