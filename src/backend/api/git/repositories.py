"""repositories 관련 Git API 라우트."""

import logging

from fastapi import APIRouter, HTTPException

from models.git import (
    GitRepository,
    GitRepositoryCreate,
    GitRepositoryListResponse,
    GitRepositoryUpdate,
    delete_git_repository,
    get_git_repository,
    list_git_repositories,
    register_git_repository,
    update_git_repository,
)

logger = logging.getLogger(__name__)

router = APIRouter()


# =============================================================================
# Git Repository Registry Endpoints
# =============================================================================


@router.get("/repositories", response_model=GitRepositoryListResponse)
async def list_repositories():
    """List all registered Git repositories."""
    repos = list_git_repositories()
    return GitRepositoryListResponse(repositories=repos, total=len(repos))


@router.post("/repositories", response_model=GitRepository)
async def create_repository(request: GitRepositoryCreate):
    """Register a new Git repository."""
    from pathlib import Path

    from models.project import normalize_path

    # Normalize path
    path = normalize_path(request.path)

    # Validate path exists
    if not Path(path).exists():
        raise HTTPException(status_code=400, detail=f"Path does not exist: {path}")
    if not Path(path).is_dir():
        raise HTTPException(status_code=400, detail=f"Path is not a directory: {path}")

    repo = register_git_repository(
        name=request.name,
        path=path,
        description=request.description,
    )

    if not repo.is_valid:
        # Still register but warn
        logger.warning(f"Registered path '{path}' is not a valid Git repository")

    return repo


@router.get("/repositories/{repo_id}", response_model=GitRepository)
async def get_repository(repo_id: str):
    """Get a Git repository by ID."""
    repo = get_git_repository(repo_id)
    if not repo:
        raise HTTPException(status_code=404, detail="Repository not found")
    return repo


@router.put("/repositories/{repo_id}", response_model=GitRepository)
async def update_repository(repo_id: str, request: GitRepositoryUpdate):
    """Update a Git repository."""
    from pathlib import Path

    from models.project import normalize_path

    # Validate path if provided
    path = request.path
    if path:
        path = normalize_path(path)
        if not Path(path).exists():
            raise HTTPException(status_code=400, detail=f"Path does not exist: {path}")
        if not Path(path).is_dir():
            raise HTTPException(status_code=400, detail=f"Path is not a directory: {path}")

    repo = update_git_repository(
        repo_id=repo_id,
        name=request.name,
        description=request.description,
        path=path,
    )

    if not repo:
        raise HTTPException(status_code=404, detail="Repository not found")

    return repo


@router.delete("/repositories/{repo_id}")
async def remove_repository(repo_id: str):
    """Delete a Git repository from registry."""
    success = delete_git_repository(repo_id)
    if not success:
        raise HTTPException(status_code=404, detail="Repository not found")
    return {"success": True, "message": "Repository removed"}
