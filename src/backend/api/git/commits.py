"""commits 관련 Git API 라우트."""

import logging

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession

from api.deps import get_current_user_optional, get_db_session
from db.models import UserModel
from models.git import (
    CommitFile,
    CommitListResponse,
    DraftCommit,
    DraftCommitsRequest,
    DraftCommitsResponse,
    GitCommit,
)
from models.llm_access import LLMAccessResponse
from models.llm_usage import LLMUsageSource
from services.llm_access_service import get_access_for_user

from ._shared import get_git_service_for_project

logger = logging.getLogger(__name__)

router = APIRouter()


async def _get_llm_access_for_git(
    current_user: UserModel | None,
    db: AsyncSession | None,
) -> LLMAccessResponse | None:
    if not isinstance(current_user, UserModel) or not isinstance(db, AsyncSession):
        return None
    return await get_access_for_user(db, str(current_user.id))


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
    worktree_path: str | None = Query(None, description="Worktree path to target"),
    current_user: UserModel | None = Depends(get_current_user_optional),
    db: AsyncSession = Depends(get_db_session),
):
    llm_access = await _get_llm_access_for_git(current_user, db)
    target_worktree = worktree_path if isinstance(worktree_path, str) else None
    return await generate_draft_commits_for_project(
        project_id,
        request,
        worktree_path=target_worktree,
        llm_access=llm_access,
    )


async def generate_draft_commits_for_project(
    project_id: str,
    request: DraftCommitsRequest,
    worktree_path: str | None = None,
    llm_access: LLMAccessResponse | None = None,
):
    """Generate LLM-based draft commits from git diff.

    Analyzes the current working directory changes and suggests
    logical commit groupings with conventional commit messages.
    """
    import json

    from services.llm_service import LLMService

    git_service = await get_git_service_for_project(project_id, worktree_path=worktree_path)

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
            usage_context={
                "source": LLMUsageSource.GIT_DRAFT_COMMIT,
                "user_id": llm_access.user_id if llm_access else None,
                "llm_access": llm_access,
                "project_id": project_id,
                "metadata": {
                    "staged_only": request.staged_only,
                    "changed_file_count": len(changed_files),
                    "worktree_path": worktree_path,
                },
            },
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
    git_service = await get_git_service_for_project(project_id)

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

    git_service = await get_git_service_for_project(project_id)

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

    git_service = await get_git_service_for_project(project_id)

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

    git_service = await get_git_service_for_project(project_id)

    try:
        diff = git_service.get_commit_diff(sha, file_path=file_path)
        return {"diff": diff}
    except GitServiceError as e:
        raise HTTPException(status_code=400, detail=str(e))
