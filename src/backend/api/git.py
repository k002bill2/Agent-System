"""Git API endpoints for team collaboration management."""

import logging

from fastapi import APIRouter, HTTPException, Query

from models.git import (
    DEFAULT_PROTECTED_BRANCHES,
    AddRequest,
    AddResult,
    BranchCreateRequest,
    BranchDiff,
    BranchListResponse,
    # Branch Protection models
    BranchProtectionListResponse,
    BranchProtectionRule,
    BranchProtectionRuleCreate,
    BranchProtectionRuleUpdate,
    CommitCreateRequest,
    CommitCreateResult,
    CommitFile,
    CommitListResponse,
    ConflictFile,
    # Conflict resolution models
    ConflictResolutionRequest,
    ConflictResolutionResult,
    # Draft commits models (LLM-based)
    DraftCommit,
    DraftCommitsRequest,
    DraftCommitsResponse,
    # Remote management models
    GitRemote,
    RemoteAddRequest,
    RemoteListResponse,
    RemoteOperationResult,
    RemoteUpdateRequest,
    # Remote operation models
    FetchResult,
    # Branch models
    GitBranch,
    # Commit models
    GitCommit,
    GitHubMergeRequest,
    GitHubMergeResult,
    GitHubPRListResponse,
    GitHubPRReview,
    GitHubPRReviewCreate,
    # GitHub models
    GitHubPullRequest,
    # Git Repository models
    GitRepository,
    GitRepositoryCreate,
    GitRepositoryListResponse,
    GitRepositoryUpdate,
    # Working directory models (NEW)
    GitWorkingStatus,
    MergeAbortResult,
    MergeExecuteRequest,
    # Merge models
    MergePreview,
    # Merge Request models
    MergeRequest,
    MergeRequestCreate,
    MergeRequestListResponse,
    MergeRequestStatus,
    MergeRequestUpdate,
    MergeResult,
    PullResult,
    PushResult,
    ThreeWayDiff,
    # Permission helpers
    can_merge_to_branch,
    delete_git_repository,
    get_git_repository,
    list_git_repositories,
    register_git_repository,
    update_git_repository,
)
from models.project import get_project

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/git", tags=["git"])


# =============================================================================
# Dependencies
# =============================================================================


def get_effective_git_path(project) -> str:
    """Get the effective Git path for a project."""
    return project.git_path or project.path


def get_git_service_for_project(project_id: str):
    """Get GitService for a project."""
    from services.git_service import get_git_service

    project = get_project(project_id)
    if not project:
        raise HTTPException(status_code=404, detail=f"Project '{project_id}' not found")

    git_path = get_effective_git_path(project)
    service = get_git_service(git_path)
    if not service:
        raise HTTPException(
            status_code=400, detail=f"Project '{project_id}' is not a Git repository"
        )

    return service


def get_merge_service_for_project(project_id: str):
    """Get MergeService for a project."""
    from services.merge_service import get_merge_service

    project = get_project(project_id)
    if not project:
        raise HTTPException(status_code=404, detail=f"Project '{project_id}' not found")

    git_path = get_effective_git_path(project)
    service = get_merge_service(git_path)
    if not service:
        raise HTTPException(
            status_code=400, detail=f"Project '{project_id}' is not a Git repository"
        )

    return service


def get_mr_service_for_project(project_id: str, db_session=None):
    """Get MergeRequestService for a project."""
    from services.merge_service import MergeRequestService, get_merge_service

    project = get_project(project_id)
    if not project:
        raise HTTPException(status_code=404, detail=f"Project '{project_id}' not found")

    git_path = get_effective_git_path(project)
    merge_service = get_merge_service(git_path)
    return MergeRequestService(project_id, merge_service, db_session=db_session)


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


# =============================================================================
# Project Git Status Endpoints
# =============================================================================

from pydantic import BaseModel


class GitStatusResponse(BaseModel):
    """Git status response for a project."""

    project_id: str
    git_enabled: bool
    git_path: str | None
    effective_git_path: str
    is_valid_repo: bool
    current_branch: str | None = None
    error: str | None = None


class GitPathUpdateRequest(BaseModel):
    """Request to update git path for a project."""

    git_path: str | None = None  # None to use project path


@router.get("/projects/{project_id}/status", response_model=GitStatusResponse)
async def get_project_git_status(project_id: str):
    """Get Git status for a project."""
    from services.git_service import get_git_service

    project = get_project(project_id)
    if not project:
        raise HTTPException(status_code=404, detail=f"Project '{project_id}' not found")

    effective_path = get_effective_git_path(project)
    service = get_git_service(effective_path)

    return GitStatusResponse(
        project_id=project_id,
        git_enabled=project.git_enabled,
        git_path=project.git_path,
        effective_git_path=effective_path,
        is_valid_repo=service is not None,
        current_branch=service.current_branch if service else None,
    )


@router.put("/projects/{project_id}/git-path", response_model=GitStatusResponse)
async def update_project_git_path(
    project_id: str,
    request: GitPathUpdateRequest,
):
    """Update Git path for a project."""
    from pathlib import Path

    from models.project import normalize_path, update_project
    from services.git_service import get_git_service

    project = get_project(project_id)
    if not project:
        raise HTTPException(status_code=404, detail=f"Project '{project_id}' not found")

    # Normalize and validate git_path
    git_path = request.git_path
    if git_path:
        git_path = normalize_path(git_path)
        if not Path(git_path).exists():
            raise HTTPException(status_code=400, detail=f"Path does not exist: {git_path}")
        if not Path(git_path).is_dir():
            raise HTTPException(status_code=400, detail=f"Path is not a directory: {git_path}")

    # Update project
    try:
        updated_project = update_project(project_id, git_path=git_path)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

    if not updated_project:
        raise HTTPException(status_code=404, detail=f"Project '{project_id}' not found")

    # Get git service for the new path
    effective_path = get_effective_git_path(updated_project)
    service = get_git_service(effective_path)

    return GitStatusResponse(
        project_id=project_id,
        git_enabled=updated_project.git_enabled,
        git_path=updated_project.git_path,
        effective_git_path=effective_path,
        is_valid_repo=service is not None,
        current_branch=service.current_branch if service else None,
        error=None if service else "Path is not a valid Git repository",
    )


# =============================================================================
# Working Directory Endpoints (status, add, commit)
# =============================================================================


@router.get("/projects/{project_id}/working-status", response_model=GitWorkingStatus)
async def get_working_status(project_id: str):
    """Get working directory status (staged, unstaged, untracked files)."""
    git_service = get_git_service_for_project(project_id)
    return git_service.status()


@router.post("/projects/{project_id}/add", response_model=AddResult)
async def stage_files(
    project_id: str,
    request: AddRequest,
):
    """Stage files for commit (git add).

    - Empty paths with all=False: stages current directory (git add .)
    - all=True: stages all changes including deletions (git add -A)
    - Specific paths: stages only those files
    """
    git_service = get_git_service_for_project(project_id)
    result = git_service.add(paths=request.paths, all=request.all)

    if not result.success:
        raise HTTPException(status_code=400, detail=result.message)

    return result


@router.post("/projects/{project_id}/commit", response_model=CommitCreateResult)
async def create_commit(
    project_id: str,
    request: CommitCreateRequest,
):
    """Create a commit with staged changes.

    Requires files to be staged first using the add endpoint.
    """
    git_service = get_git_service_for_project(project_id)
    result = git_service.commit(
        message=request.message,
        author_name=request.author_name,
        author_email=request.author_email,
    )

    if not result.success:
        raise HTTPException(status_code=400, detail=result.message)

    return result


# =============================================================================
# Draft Commits Endpoints (LLM-based)
# =============================================================================

DRAFT_COMMITS_SYSTEM_PROMPT = """Git 커밋 메시지 생성기. diff를 분석하여 Conventional Commits 형식의 간결한 한글 메시지를 생성합니다.

규칙:
- 타입: feat, fix, docs, refactor, test, chore, style
- scope 포함 (예: auth, api, components)
- 메시지 본문은 반드시 한글로 작성
- 관련 파일끼리 그룹화

메시지 형식 (간결하게):
- 첫 줄: "타입(scope): 요약 제목" (50자 이내)
- 빈 줄
- 변경사항 bullet points 2-4개 (각 30자 이내)

CRITICAL: 반드시 유효한 JSON만 응답. 마크다운이나 설명 없이 JSON만:
{"drafts":[{"message":"feat(auth): OAuth 인증 기능 추가\\n\\n- Google OAuth 로그인 구현\\n- 세션 관리 로직 추가","files":["src/auth/oauth.py"],"type":"feat","scope":"auth"}]}

필수사항:
- diff의 모든 파일을 빠짐없이 포함
- scope가 없으면 null
- 메시지는 간결하게 (전체 200자 이내)
- 줄바꿈은 \\n 사용
- Co-Authored-By 라인 생략"""


@router.post("/projects/{project_id}/draft-commits", response_model=DraftCommitsResponse)
async def generate_draft_commits(
    project_id: str,
    request: DraftCommitsRequest,
):
    """Generate LLM-based draft commits from git diff.

    Analyzes the current working directory changes and suggests
    logical commit groupings with conventional commit messages.
    """
    import json

    from services.llm_service import LLMService

    git_service = get_git_service_for_project(project_id)

    # Get diff content
    try:
        diff_content = git_service.get_working_diff(staged_only=request.staged_only)
        changed_files = git_service.get_changed_files_list(staged_only=request.staged_only)
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Failed to get diff: {str(e)}")

    if not diff_content or not changed_files:
        return DraftCommitsResponse(
            drafts=[],
            total_files=0,
            token_usage=None,
        )

    # Truncate diff if too long (to avoid token limits)
    max_diff_chars = 50000
    if len(diff_content) > max_diff_chars:
        diff_content = diff_content[:max_diff_chars] + "\n\n... (diff truncated)"

    # Build prompt with file list
    file_list = "\n".join(f"- {f}" for f in changed_files)
    user_prompt = f"""Files changed:
{file_list}

Diff:
{diff_content}"""

    try:
        # Call LLM with higher max_tokens to avoid truncation
        response = await LLMService.invoke(
            prompt=user_prompt,
            system_prompt=DRAFT_COMMITS_SYSTEM_PROMPT,
            temperature=0.3,
            max_tokens=8192,
        )

        # Parse JSON response - handle both string and list content
        raw_content = response.content
        if isinstance(raw_content, list):
            # Some LLM providers return list of content blocks
            content = "".join(
                block.get("text", str(block)) if isinstance(block, dict) else str(block)
                for block in raw_content
            )
        else:
            content = str(raw_content)

        content = content.strip()

        # Check for server error responses before JSON parsing
        error_indicators = [
            "Internal Server Error",
            "Bad Gateway",
            "Service Unavailable",
            "Gateway Timeout",
        ]
        for indicator in error_indicators:
            if indicator in content:
                raise HTTPException(
                    status_code=503,
                    detail=f"LLM 서비스 일시적 오류: {indicator}. 잠시 후 다시 시도해주세요.",
                )

        # Handle markdown code blocks (```json ... ``` or ``` ... ```)
        if content.startswith("```"):
            lines = content.split("\n")
            # Remove first line (```json or ```) and last line (```)
            start_idx = 1
            end_idx = len(lines)
            if lines[-1].strip() == "```":
                end_idx = -1
            content = "\n".join(lines[start_idx:end_idx]).strip()

        # Validate JSON structure before parsing
        if not content.startswith("{") and not content.startswith("["):
            raise HTTPException(
                status_code=502,
                detail=f"LLM 응답이 유효한 JSON 형식이 아닙니다: {content[:100]}...",
            )

        result = json.loads(content)
        drafts = [
            DraftCommit(
                message=d["message"],
                files=d["files"],
                type=d["type"],
                scope=d.get("scope"),
            )
            for d in result.get("drafts", [])
        ]

        return DraftCommitsResponse(
            drafts=drafts,
            total_files=len(changed_files),
            token_usage=response.total_tokens,
        )

    except json.JSONDecodeError as e:
        logger.error(
            f"Failed to parse LLM response: {e}, content: {content[:500] if content else 'empty'}"
        )
        # Try to recover truncated JSON by attempting partial parsing
        try:
            # If JSON was truncated, try to find and fix common issues
            if '"drafts":' in content:
                import re

                # Method 1: Try to fix truncated JSON by closing brackets
                fixed_content = content

                # If we're inside a string, find and truncate at the last complete entry
                if '"message":' in fixed_content:
                    # Find positions of all complete-looking draft objects
                    # Look for patterns like "}," or "}]" after "scope":
                    complete_entries = list(
                        re.finditer(r'"scope"\s*:\s*(null|"[^"]*")\s*\}', fixed_content)
                    )
                    if complete_entries:
                        last_complete = complete_entries[-1]
                        # Truncate and close properly
                        fixed_content = fixed_content[: last_complete.end()]
                        # Ensure proper JSON structure
                        if not fixed_content.endswith("]}"):
                            fixed_content += "]}"
                        try:
                            result = json.loads(fixed_content)
                            drafts = [
                                DraftCommit(
                                    message=d["message"],
                                    files=d["files"],
                                    type=d["type"],
                                    scope=d.get("scope"),
                                )
                                for d in result.get("drafts", [])
                            ]
                            if drafts:
                                logger.warning(
                                    f"Recovered {len(drafts)} draft commits by fixing truncated JSON"
                                )
                                return DraftCommitsResponse(
                                    drafts=drafts,
                                    total_files=len(changed_files),
                                    token_usage=response.total_tokens,
                                )
                        except json.JSONDecodeError:
                            pass  # Try next method

                # Method 2: Use regex to extract individual complete drafts
                # This pattern handles escaped characters in message field
                draft_pattern = r'\{\s*"message"\s*:\s*"((?:[^"\\]|\\.)*)"\s*,\s*"files"\s*:\s*\[((?:[^\]]*?))\]\s*,\s*"type"\s*:\s*"([^"]+)"\s*,\s*"scope"\s*:\s*(null|"[^"]*")\s*\}'
                matches = re.findall(draft_pattern, content, re.DOTALL)
                if matches:
                    drafts = []
                    for match in matches:
                        # Unescape the message (handle \\n -> \n)
                        message = match[0].encode().decode("unicode_escape")
                        files_str = match[1]
                        files = [f.strip().strip('"') for f in files_str.split(",") if f.strip()]
                        drafts.append(
                            DraftCommit(
                                message=message,
                                files=files,
                                type=match[2],
                                scope=None if match[3] == "null" else match[3].strip('"'),
                            )
                        )
                    if drafts:
                        logger.warning(
                            f"Recovered {len(drafts)} draft commits via regex extraction"
                        )
                        return DraftCommitsResponse(
                            drafts=drafts,
                            total_files=len(changed_files),
                            token_usage=response.total_tokens,
                        )
        except Exception as recovery_error:
            logger.error(f"JSON recovery failed: {recovery_error}")

        raise HTTPException(
            status_code=500, detail=f"Failed to parse LLM response as JSON: {str(e)}"
        )
    except Exception as e:
        logger.error(f"LLM invocation failed: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"LLM invocation failed: {str(e)}")


# =============================================================================
# Branch Endpoints
# =============================================================================


@router.get("/projects/{project_id}/branches", response_model=BranchListResponse)
async def list_branches(
    project_id: str,
    include_remote: bool = Query(True, description="Include remote branches"),
    base_branch: str = Query("main", description="Base branch for ahead/behind calculation"),
):
    """List all branches in a project."""
    git_service = get_git_service_for_project(project_id)

    branches = git_service.list_branches(
        include_remote=include_remote,
        base_branch=base_branch,
    )

    return BranchListResponse(
        branches=branches,
        current_branch=git_service.current_branch,
        protected_branches=DEFAULT_PROTECTED_BRANCHES,
    )


@router.post("/projects/{project_id}/branches", response_model=GitBranch)
async def create_branch(
    project_id: str,
    request: BranchCreateRequest,
):
    """Create a new branch."""
    from services.git_service import GitServiceError

    git_service = get_git_service_for_project(project_id)

    try:
        branch = git_service.create_branch(
            name=request.name,
            start_point=request.start_point,
        )
        return branch
    except GitServiceError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.delete("/projects/{project_id}/branches/{branch_name:path}")
async def delete_branch(
    project_id: str,
    branch_name: str,
    force: bool = Query(False, description="Force delete even if not merged"),
):
    """Delete a branch."""
    from services.git_service import GitServiceError

    git_service = get_git_service_for_project(project_id)

    try:
        success = git_service.delete_branch(name=branch_name, force=force)
        return {"success": success, "message": f"Branch '{branch_name}' deleted"}
    except GitServiceError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.get("/projects/{project_id}/branches/{branch_name:path}/diff", response_model=BranchDiff)
async def get_branch_diff(
    project_id: str,
    branch_name: str,
    base: str = Query("main", description="Base branch for comparison"),
):
    """Get diff summary between a branch and base."""
    from services.git_service import GitServiceError

    git_service = get_git_service_for_project(project_id)

    try:
        diff = git_service.get_branch_diff(branch=branch_name, base=base)
        return diff
    except GitServiceError as e:
        raise HTTPException(status_code=400, detail=str(e))


# =============================================================================
# Commit Endpoints
# =============================================================================


@router.get("/projects/{project_id}/commits", response_model=CommitListResponse)
async def list_commits(
    project_id: str,
    branch: str | None = Query(None, description="Branch name (default: current)"),
    limit: int = Query(50, ge=1, le=200, description="Maximum commits to return"),
    skip: int = Query(0, ge=0, description="Number of commits to skip"),
):
    """List commits in a branch."""
    git_service = get_git_service_for_project(project_id)

    commits = git_service.get_commits(branch=branch, limit=limit, skip=skip)
    actual_branch = branch or git_service.current_branch

    return CommitListResponse(
        commits=commits,
        branch=actual_branch,
        total=len(commits),
    )


@router.get("/projects/{project_id}/commits/{sha}", response_model=GitCommit)
async def get_commit(
    project_id: str,
    sha: str,
):
    """Get a specific commit."""
    from services.git_service import GitServiceError

    git_service = get_git_service_for_project(project_id)

    try:
        commit = git_service.get_commit(sha)
        return commit
    except GitServiceError as e:
        raise HTTPException(status_code=404, detail=str(e))


@router.get("/projects/{project_id}/commits/{sha}/files", response_model=list[CommitFile])
async def get_commit_files(
    project_id: str,
    sha: str,
):
    """Get files changed in a commit."""
    from services.git_service import GitServiceError

    git_service = get_git_service_for_project(project_id)

    try:
        files = git_service.get_commit_files(sha)
        return files
    except GitServiceError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.get("/projects/{project_id}/commits/{sha}/diff")
async def get_commit_diff(
    project_id: str,
    sha: str,
    file_path: str | None = Query(None, description="Optional file path to filter diff"),
):
    """Get diff for a commit."""
    from services.git_service import GitServiceError

    git_service = get_git_service_for_project(project_id)

    try:
        diff = git_service.get_commit_diff(sha, file_path=file_path)
        return {"diff": diff}
    except GitServiceError as e:
        raise HTTPException(status_code=400, detail=str(e))


# =============================================================================
# Merge Preview & Execution Endpoints
# =============================================================================


@router.post("/projects/{project_id}/merge/preview", response_model=MergePreview)
async def preview_merge(
    project_id: str,
    source_branch: str = Query(..., description="Source branch to merge"),
    target_branch: str = Query("main", description="Target branch"),
):
    """Preview merge and check for conflicts (dry-run)."""
    from services.merge_service import MergeServiceError

    merge_service = get_merge_service_for_project(project_id)

    try:
        preview = merge_service.check_merge_conflicts(
            source_branch=source_branch,
            target_branch=target_branch,
        )
        return preview
    except MergeServiceError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.get("/projects/{project_id}/merge/conflicts", response_model=list[ConflictFile])
async def get_conflicts(
    project_id: str,
    source_branch: str = Query(..., description="Source branch"),
    target_branch: str = Query("main", description="Target branch"),
):
    """Get detailed conflict information."""
    merge_service = get_merge_service_for_project(project_id)

    conflicts = merge_service.get_conflict_details(
        source_branch=source_branch,
        target_branch=target_branch,
    )
    return conflicts


@router.get("/projects/{project_id}/merge/three-way-diff", response_model=ThreeWayDiff)
async def get_three_way_diff(
    project_id: str,
    file_path: str = Query(..., description="File path"),
    source_branch: str = Query(..., description="Source branch"),
    target_branch: str = Query("main", description="Target branch"),
):
    """Get three-way diff for a file."""
    merge_service = get_merge_service_for_project(project_id)

    diff = merge_service.get_three_way_diff(
        file_path=file_path,
        source_branch=source_branch,
        target_branch=target_branch,
    )
    return diff


@router.post("/projects/{project_id}/merge", response_model=MergeResult)
async def execute_merge(
    project_id: str,
    request: MergeExecuteRequest,
    user_role: str = Query("member", description="User role for permission check"),
):
    """Execute merge operation.

    Requires 'merge_main' permission for protected branches.
    """
    from services.merge_service import MergeServiceError

    # Check permissions for protected branches
    if not can_merge_to_branch(user_role, request.target_branch):
        raise HTTPException(
            status_code=403,
            detail=f"Insufficient permissions to merge to '{request.target_branch}'",
        )

    merge_service = get_merge_service_for_project(project_id)

    try:
        result = merge_service.merge_branch(
            source_branch=request.source_branch,
            target_branch=request.target_branch,
            message=request.message,
        )
        return result
    except MergeServiceError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/projects/{project_id}/merge/resolve", response_model=ConflictResolutionResult)
async def resolve_conflict(
    project_id: str,
    request: ConflictResolutionRequest,
):
    """Resolve a single file conflict.

    Use this endpoint to resolve conflicts one file at a time during a merge.
    Supported strategies:
    - ours: Keep target branch version
    - theirs: Keep source branch version
    - custom: Provide resolved content manually
    """
    merge_service = get_merge_service_for_project(project_id)

    result = merge_service.resolve_conflict(request)

    if not result.success:
        raise HTTPException(status_code=400, detail=result.message)

    return result


@router.post("/projects/{project_id}/merge/abort", response_model=MergeAbortResult)
async def abort_merge(project_id: str):
    """Abort an ongoing merge operation.

    Use this endpoint to cancel a merge that has conflicts.
    All changes will be reverted to the pre-merge state.
    """
    merge_service = get_merge_service_for_project(project_id)

    result = merge_service.abort_merge()

    if not result.success:
        raise HTTPException(status_code=400, detail=result.message)

    return result


@router.get("/projects/{project_id}/merge/status")
async def get_merge_status(project_id: str):
    """Get current merge status.

    Returns information about whether a merge is in progress,
    which files still have unresolved conflicts, and whether
    the merge can be completed.
    """
    merge_service = get_merge_service_for_project(project_id)
    return merge_service.get_merge_status()


@router.post("/projects/{project_id}/merge/complete", response_model=MergeResult)
async def complete_merge(
    project_id: str,
    message: str | None = Query(None, description="Commit message for the merge"),
):
    """Complete an ongoing merge after all conflicts are resolved.

    Use this endpoint after resolving all conflicts to create the merge commit.
    """
    merge_service = get_merge_service_for_project(project_id)

    result = merge_service.complete_merge(message)

    if not result.success:
        raise HTTPException(status_code=400, detail=result.message)

    return result


# =============================================================================
# Internal Merge Request Endpoints
# =============================================================================


@router.get("/projects/{project_id}/merge-requests", response_model=MergeRequestListResponse)
async def list_merge_requests(
    project_id: str,
    status: MergeRequestStatus | None = Query(None, description="Filter by status"),
):
    """List merge requests for a project."""
    db_session = await _get_db_session()
    try:
        mr_service = get_mr_service_for_project(project_id, db_session=db_session)
        if db_session:
            async with db_session:
                mrs = await mr_service.list_merge_requests_async(status=status)
                await db_session.commit()
        else:
            mrs = mr_service.list_merge_requests(status=status)
        return MergeRequestListResponse(merge_requests=mrs, total=len(mrs))
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to list merge requests: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/projects/{project_id}/merge-requests/{mr_id}", response_model=MergeRequest)
async def get_merge_request(
    project_id: str,
    mr_id: str,
):
    """Get a merge request by ID."""
    db_session = await _get_db_session()
    try:
        mr_service = get_mr_service_for_project(project_id, db_session=db_session)
        if db_session:
            async with db_session:
                mr = await mr_service.get_merge_request_async(mr_id)
                await db_session.commit()
        else:
            mr = mr_service.get_merge_request(mr_id)

        if not mr:
            raise HTTPException(status_code=404, detail="Merge request not found")
        return mr
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to get merge request: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/projects/{project_id}/merge-requests", response_model=MergeRequest)
async def create_merge_request(
    project_id: str,
    request: MergeRequestCreate,
    author_id: str = Query("system", description="Author user ID"),
    author_name: str = Query("System", description="Author name"),
    author_email: str = Query("system@example.com", description="Author email"),
):
    """Create a new merge request."""
    db_session = await _get_db_session()
    try:
        mr_service = get_mr_service_for_project(project_id, db_session=db_session)
        if db_session:
            async with db_session:
                mr = await mr_service.create_merge_request_async(
                    title=request.title,
                    source_branch=request.source_branch,
                    target_branch=request.target_branch,
                    description=request.description,
                    reviewers=request.reviewers,
                    author_id=author_id,
                    author_name=author_name,
                    author_email=author_email,
                    auto_merge=request.auto_merge,
                )
                await db_session.commit()
        else:
            mr = mr_service.create_merge_request(
                title=request.title,
                source_branch=request.source_branch,
                target_branch=request.target_branch,
                description=request.description,
                reviewers=request.reviewers,
                author_id=author_id,
                author_name=author_name,
                author_email=author_email,
                auto_merge=request.auto_merge,
            )
        return mr
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to create merge request: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.put("/projects/{project_id}/merge-requests/{mr_id}", response_model=MergeRequest)
async def update_merge_request(
    project_id: str,
    mr_id: str,
    request: MergeRequestUpdate,
):
    """Update a merge request."""
    db_session = await _get_db_session()
    try:
        mr_service = get_mr_service_for_project(project_id, db_session=db_session)
        if db_session:
            async with db_session:
                mr = await mr_service.update_merge_request_async(
                    mr_id=mr_id,
                    title=request.title,
                    description=request.description,
                    status=request.status,
                    reviewers=request.reviewers,
                    auto_merge=request.auto_merge,
                )
                await db_session.commit()
        else:
            mr = mr_service.update_merge_request(
                mr_id=mr_id,
                title=request.title,
                description=request.description,
                status=request.status,
                reviewers=request.reviewers,
            )

        if not mr:
            raise HTTPException(status_code=404, detail="Merge request not found")
        return mr
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to update merge request: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/projects/{project_id}/merge-requests/{mr_id}/approve", response_model=MergeRequest)
async def approve_merge_request(
    project_id: str,
    mr_id: str,
    user_id: str = Query(..., description="Approving user ID"),
):
    """Approve a merge request. Triggers auto-merge if conditions met."""
    db_session = await _get_db_session()
    try:
        mr_service = get_mr_service_for_project(project_id, db_session=db_session)
        if db_session:
            async with db_session:
                mr = await mr_service.approve_merge_request_async(mr_id=mr_id, user_id=user_id)
                await db_session.commit()
        else:
            mr = mr_service.approve_merge_request(mr_id=mr_id, user_id=user_id)

        if not mr:
            raise HTTPException(status_code=404, detail="Merge request not found")
        return mr
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to approve merge request: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/projects/{project_id}/merge-requests/{mr_id}/merge")
async def merge_merge_request(
    project_id: str,
    mr_id: str,
    user_id: str = Query(..., description="User ID performing the merge"),
    user_role: str = Query("member", description="User role for permission check"),
):
    """Merge a merge request."""
    db_session = await _get_db_session()
    try:
        mr_service = get_mr_service_for_project(project_id, db_session=db_session)

        if db_session:
            async with db_session:
                mr = await mr_service.get_merge_request_async(mr_id)
                if not mr:
                    raise HTTPException(status_code=404, detail="Merge request not found")

                if not can_merge_to_branch(user_role, mr.target_branch):
                    raise HTTPException(
                        status_code=403, detail=f"Insufficient permissions to merge to '{mr.target_branch}'"
                    )

                mr, result = await mr_service.merge_merge_request_async(mr_id=mr_id, merged_by=user_id)
                await db_session.commit()

                # Trigger auto-deploy after successful merge
                if result and result.success:
                    await mr_service._try_auto_deploy(mr)
        else:
            mr = mr_service.get_merge_request(mr_id)
            if not mr:
                raise HTTPException(status_code=404, detail="Merge request not found")

            if not can_merge_to_branch(user_role, mr.target_branch):
                raise HTTPException(
                    status_code=403, detail=f"Insufficient permissions to merge to '{mr.target_branch}'"
                )

            mr, result = mr_service.merge_merge_request(mr_id=mr_id, merged_by=user_id)

        if not mr:
            raise HTTPException(status_code=404, detail="Merge request not found")

        return {"merge_request": mr, "merge_result": result}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to merge: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/projects/{project_id}/merge-requests/{mr_id}/close", response_model=MergeRequest)
async def close_merge_request(
    project_id: str,
    mr_id: str,
    user_id: str = Query(..., description="User ID closing the MR"),
):
    """Close a merge request without merging."""
    db_session = await _get_db_session()
    try:
        mr_service = get_mr_service_for_project(project_id, db_session=db_session)
        if db_session:
            async with db_session:
                mr = await mr_service.close_merge_request_async(mr_id=mr_id, closed_by=user_id)
                await db_session.commit()
        else:
            mr = mr_service.close_merge_request(mr_id=mr_id, closed_by=user_id)

        if not mr:
            raise HTTPException(status_code=404, detail="Merge request not found")
        return mr
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to close merge request: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post(
    "/projects/{project_id}/merge-requests/{mr_id}/refresh-conflicts", response_model=MergeRequest
)
async def refresh_mr_conflicts(
    project_id: str,
    mr_id: str,
):
    """Refresh conflict status for a merge request."""
    db_session = await _get_db_session()
    try:
        mr_service = get_mr_service_for_project(project_id, db_session=db_session)
        if db_session:
            async with db_session:
                mr = await mr_service.refresh_conflict_status_async(mr_id)
                await db_session.commit()
        else:
            mr = mr_service.refresh_conflict_status(mr_id)

        if not mr:
            raise HTTPException(status_code=404, detail="Merge request not found")
        return mr
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to refresh conflict status: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# =============================================================================
# Branch Protection Rule Endpoints
# =============================================================================


@router.get("/projects/{project_id}/branch-protection", response_model=BranchProtectionListResponse)
async def list_branch_protection_rules(project_id: str):
    """List branch protection rules for a project."""
    import os
    import uuid

    if os.getenv("USE_DATABASE", "false").lower() == "true":
        db_session = await _get_db_session()
        if db_session:
            async with db_session:
                from db.repository import BranchProtectionRepository
                repo = BranchProtectionRepository(db_session)
                models = await repo.list_by_project(project_id)
                rules = [
                    BranchProtectionRule(
                        id=m.id,
                        project_id=m.project_id,
                        branch_pattern=m.branch_pattern,
                        require_approvals=m.require_approvals or 0,
                        require_no_conflicts=m.require_no_conflicts if m.require_no_conflicts is not None else True,
                        allowed_merge_roles=m.allowed_merge_roles or ["owner", "admin"],
                        allow_force_push=m.allow_force_push or False,
                        allow_deletion=m.allow_deletion or False,
                        auto_deploy=m.auto_deploy or False,
                        deploy_workflow=m.deploy_workflow,
                        enabled=m.enabled if m.enabled is not None else True,
                        created_at=m.created_at,
                        updated_at=m.updated_at,
                    )
                    for m in models
                ]
                return BranchProtectionListResponse(rules=rules, total=len(rules))

    # Fallback: return default rules
    default_rules = [
        BranchProtectionRule(
            id=str(uuid.uuid4()),
            project_id=project_id,
            branch_pattern=pattern,
            require_approvals=0,
        )
        for pattern in DEFAULT_PROTECTED_BRANCHES
    ]
    return BranchProtectionListResponse(rules=default_rules, total=len(default_rules))


@router.post("/projects/{project_id}/branch-protection", response_model=BranchProtectionRule)
async def create_branch_protection_rule(
    project_id: str,
    request: BranchProtectionRuleCreate,
):
    """Create a new branch protection rule."""
    import os
    import uuid

    if os.getenv("USE_DATABASE", "false").lower() != "true":
        raise HTTPException(status_code=503, detail="Database not configured for branch protection rules")

    db_session = await _get_db_session()
    if not db_session:
        raise HTTPException(status_code=503, detail="Database not available")

    async with db_session:
        from db.repository import BranchProtectionRepository
        repo = BranchProtectionRepository(db_session)
        model = await repo.create(
            id=str(uuid.uuid4()),
            project_id=project_id,
            branch_pattern=request.branch_pattern,
            require_approvals=request.require_approvals,
            require_no_conflicts=request.require_no_conflicts,
            allowed_merge_roles=request.allowed_merge_roles,
            allow_force_push=request.allow_force_push,
            allow_deletion=request.allow_deletion,
            auto_deploy=request.auto_deploy,
            deploy_workflow=request.deploy_workflow,
            enabled=request.enabled,
        )
        await db_session.commit()

        return BranchProtectionRule(
            id=model.id,
            project_id=model.project_id,
            branch_pattern=model.branch_pattern,
            require_approvals=model.require_approvals or 0,
            require_no_conflicts=model.require_no_conflicts if model.require_no_conflicts is not None else True,
            allowed_merge_roles=model.allowed_merge_roles or ["owner", "admin"],
            allow_force_push=model.allow_force_push or False,
            allow_deletion=model.allow_deletion or False,
            auto_deploy=model.auto_deploy or False,
            deploy_workflow=model.deploy_workflow,
            enabled=model.enabled if model.enabled is not None else True,
            created_at=model.created_at,
            updated_at=model.updated_at,
        )


@router.put("/projects/{project_id}/branch-protection/{rule_id}", response_model=BranchProtectionRule)
async def update_branch_protection_rule(
    project_id: str,
    rule_id: str,
    request: BranchProtectionRuleUpdate,
):
    """Update a branch protection rule."""
    import os

    if os.getenv("USE_DATABASE", "false").lower() != "true":
        raise HTTPException(status_code=503, detail="Database not configured")

    db_session = await _get_db_session()
    if not db_session:
        raise HTTPException(status_code=503, detail="Database not available")

    async with db_session:
        from db.repository import BranchProtectionRepository
        repo = BranchProtectionRepository(db_session)

        updates = {k: v for k, v in request.model_dump().items() if v is not None}
        if not updates:
            raise HTTPException(status_code=400, detail="No fields to update")

        success = await repo.update(rule_id, **updates)
        if not success:
            raise HTTPException(status_code=404, detail="Rule not found")

        model = await repo.get(rule_id)
        await db_session.commit()

        return BranchProtectionRule(
            id=model.id,
            project_id=model.project_id,
            branch_pattern=model.branch_pattern,
            require_approvals=model.require_approvals or 0,
            require_no_conflicts=model.require_no_conflicts if model.require_no_conflicts is not None else True,
            allowed_merge_roles=model.allowed_merge_roles or ["owner", "admin"],
            allow_force_push=model.allow_force_push or False,
            allow_deletion=model.allow_deletion or False,
            auto_deploy=model.auto_deploy or False,
            deploy_workflow=model.deploy_workflow,
            enabled=model.enabled if model.enabled is not None else True,
            created_at=model.created_at,
            updated_at=model.updated_at,
        )


@router.delete("/projects/{project_id}/branch-protection/{rule_id}")
async def delete_branch_protection_rule(
    project_id: str,
    rule_id: str,
):
    """Delete a branch protection rule."""
    import os

    if os.getenv("USE_DATABASE", "false").lower() != "true":
        raise HTTPException(status_code=503, detail="Database not configured")

    db_session = await _get_db_session()
    if not db_session:
        raise HTTPException(status_code=503, detail="Database not available")

    async with db_session:
        from db.repository import BranchProtectionRepository
        repo = BranchProtectionRepository(db_session)
        success = await repo.delete(rule_id)
        await db_session.commit()

        if not success:
            raise HTTPException(status_code=404, detail="Rule not found")
        return {"success": True, "message": "Rule deleted"}


# =============================================================================
# Remote Management Endpoints
# =============================================================================


@router.get("/projects/{project_id}/remotes", response_model=RemoteListResponse)
async def list_remotes(project_id: str):
    """List all remotes for a project."""
    git_service = get_git_service_for_project(project_id)
    remotes = git_service.list_remotes()
    return RemoteListResponse(remotes=remotes)


@router.post("/projects/{project_id}/remotes", response_model=RemoteOperationResult)
async def add_remote(project_id: str, request: RemoteAddRequest):
    """Add a new remote."""
    git_service = get_git_service_for_project(project_id)
    result = git_service.add_remote(name=request.name, url=request.url)
    if not result.success:
        raise HTTPException(status_code=400, detail=result.message)
    return result


@router.delete("/projects/{project_id}/remotes/{remote_name}", response_model=RemoteOperationResult)
async def remove_remote(project_id: str, remote_name: str):
    """Remove a remote."""
    git_service = get_git_service_for_project(project_id)
    result = git_service.remove_remote(name=remote_name)
    if not result.success:
        raise HTTPException(status_code=400, detail=result.message)
    return result


@router.put("/projects/{project_id}/remotes/{remote_name}", response_model=RemoteOperationResult)
async def update_remote(project_id: str, remote_name: str, request: RemoteUpdateRequest):
    """Update a remote (rename or change URL)."""
    git_service = get_git_service_for_project(project_id)

    # Update URL first if provided
    if request.url:
        result = git_service.set_remote_url(name=remote_name, url=request.url)
        if not result.success:
            raise HTTPException(status_code=400, detail=result.message)

    # Then rename if provided
    if request.new_name:
        result = git_service.rename_remote(name=remote_name, new_name=request.new_name)
        if not result.success:
            raise HTTPException(status_code=400, detail=result.message)
        return result

    if request.url:
        return RemoteOperationResult(success=True, message=f"Remote '{remote_name}' updated")

    return RemoteOperationResult(success=True, message="No changes requested")


# =============================================================================
# Remote Operation Endpoints
# =============================================================================


@router.post("/projects/{project_id}/fetch", response_model=FetchResult)
async def fetch_remote(
    project_id: str,
    remote: str = Query("origin", description="Remote name"),
):
    """Fetch from remote."""
    git_service = get_git_service_for_project(project_id)
    result = git_service.fetch(remote=remote)
    return result


@router.post("/projects/{project_id}/pull", response_model=PullResult)
async def pull_remote(
    project_id: str,
    remote: str = Query("origin", description="Remote name"),
    branch: str | None = Query(None, description="Branch to pull"),
):
    """Pull from remote."""
    git_service = get_git_service_for_project(project_id)
    result = git_service.pull(remote=remote, branch=branch)
    return result


@router.post("/projects/{project_id}/push", response_model=PushResult)
async def push_remote(
    project_id: str,
    remote: str = Query("origin", description="Remote name"),
    branch: str | None = Query(None, description="Branch to push"),
    set_upstream: bool = Query(False, description="Set upstream tracking"),
):
    """Push to remote."""
    git_service = get_git_service_for_project(project_id)
    result = git_service.push(remote=remote, branch=branch, set_upstream=set_upstream)
    return result


# =============================================================================
# GitHub API Endpoints
# =============================================================================


@router.get("/github/{repo_owner}/{repo_name}/pulls", response_model=GitHubPRListResponse)
async def list_github_prs(
    repo_owner: str,
    repo_name: str,
    state: str = Query("open", description="Filter by state (open, closed, all)"),
    base: str | None = Query(None, description="Filter by base branch"),
    limit: int = Query(30, ge=1, le=100, description="Maximum PRs to return"),
):
    """List GitHub pull requests."""
    from services.github_service import GitHubServiceError

    github_service = get_github_service()
    repo = f"{repo_owner}/{repo_name}"

    try:
        prs = github_service.list_pull_requests(
            repo=repo,
            state=state,
            base=base,
            limit=limit,
        )
        return GitHubPRListResponse(pull_requests=prs, total=len(prs))
    except GitHubServiceError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.get("/github/{repo_owner}/{repo_name}/pulls/{pr_number}", response_model=GitHubPullRequest)
async def get_github_pr(
    repo_owner: str,
    repo_name: str,
    pr_number: int,
):
    """Get a specific GitHub pull request."""
    from services.github_service import GitHubServiceError

    github_service = get_github_service()
    repo = f"{repo_owner}/{repo_name}"

    try:
        pr = github_service.get_pull_request(pr_number=pr_number, repo=repo)
        return pr
    except GitHubServiceError as e:
        raise HTTPException(status_code=404, detail=str(e))


@router.post(
    "/github/{repo_owner}/{repo_name}/pulls/{pr_number}/merge", response_model=GitHubMergeResult
)
async def merge_github_pr(
    repo_owner: str,
    repo_name: str,
    pr_number: int,
    request: GitHubMergeRequest,
):
    """Merge a GitHub pull request."""
    from services.github_service import GitHubServiceError

    github_service = get_github_service()
    repo = f"{repo_owner}/{repo_name}"

    try:
        result = github_service.merge_pull_request(
            pr_number=pr_number,
            repo=repo,
            merge_method=request.merge_method,
            commit_title=request.commit_title,
            commit_message=request.commit_message,
        )
        return result
    except GitHubServiceError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.get(
    "/github/{repo_owner}/{repo_name}/pulls/{pr_number}/reviews",
    response_model=list[GitHubPRReview],
)
async def list_github_pr_reviews(
    repo_owner: str,
    repo_name: str,
    pr_number: int,
):
    """List reviews on a GitHub pull request."""
    from services.github_service import GitHubServiceError

    github_service = get_github_service()
    repo = f"{repo_owner}/{repo_name}"

    try:
        reviews = github_service.list_pr_reviews(pr_number=pr_number, repo=repo)
        return reviews
    except GitHubServiceError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.post(
    "/github/{repo_owner}/{repo_name}/pulls/{pr_number}/reviews", response_model=GitHubPRReview
)
async def create_github_pr_review(
    repo_owner: str,
    repo_name: str,
    pr_number: int,
    request: GitHubPRReviewCreate,
):
    """Create a review on a GitHub pull request."""
    from services.github_service import GitHubServiceError

    github_service = get_github_service()
    repo = f"{repo_owner}/{repo_name}"

    try:
        review = github_service.create_pr_review(
            pr_number=pr_number,
            repo=repo,
            body=request.body,
            event=request.event,
        )
        return review
    except GitHubServiceError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.get("/github/{repo_owner}/{repo_name}/pulls/{pr_number}/mergeable")
async def check_github_pr_mergeable(
    repo_owner: str,
    repo_name: str,
    pr_number: int,
):
    """Check if a GitHub PR is mergeable."""
    from services.github_service import GitHubServiceError

    github_service = get_github_service()
    repo = f"{repo_owner}/{repo_name}"

    try:
        status = github_service.check_pr_mergeable(pr_number=pr_number, repo=repo)
        return status
    except GitHubServiceError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.get("/github/{repo_owner}/{repo_name}/info")
async def get_github_repo_info(
    repo_owner: str,
    repo_name: str,
):
    """Get GitHub repository information."""
    from services.github_service import GitHubServiceError

    github_service = get_github_service()
    repo = f"{repo_owner}/{repo_name}"

    try:
        info = github_service.get_repo_info(repo=repo)
        return info
    except GitHubServiceError as e:
        raise HTTPException(status_code=404, detail=str(e))


@router.get("/github/{repo_owner}/{repo_name}/branches")
async def list_github_branches(
    repo_owner: str,
    repo_name: str,
    protected: bool | None = Query(None, description="Filter by protected status"),
):
    """List GitHub repository branches."""
    from services.github_service import GitHubServiceError

    github_service = get_github_service()
    repo = f"{repo_owner}/{repo_name}"

    try:
        branches = github_service.list_branches(repo=repo, protected=protected)
        return {"branches": branches, "total": len(branches)}
    except GitHubServiceError as e:
        raise HTTPException(status_code=400, detail=str(e))


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
