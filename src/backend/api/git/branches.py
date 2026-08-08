"""branches 관련 Git API 라우트."""

import logging

from fastapi import APIRouter, HTTPException, Query

from models.git import (
    DEFAULT_PROTECTED_BRANCHES,
    BranchCreateRequest,
    BranchDiff,
    BranchListResponse,
    BranchProtectionListResponse,
    BranchProtectionRule,
    BranchProtectionRuleCreate,
    BranchProtectionRuleUpdate,
    GitBranch,
    PruneExecuteResult,
    PruneRequest,
)

from ._shared import (
    _get_db_session,
    get_git_service_for_project,
    get_github_service,
    get_mr_service_for_project,
)

logger = logging.getLogger(__name__)

router = APIRouter()


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


@router.post("/projects/{project_id}/branches/{branch_name:path}/checkout")
async def checkout_branch(
    project_id: str,
    branch_name: str,
):
    """Checkout (switch to) a branch."""
    from services.git_service import GitServiceError

    git_service = get_git_service_for_project(project_id)

    try:
        branch = git_service.checkout_branch(name=branch_name)
        return {"success": True, "message": f"Switched to branch '{branch_name}'", "branch": branch}
    except GitServiceError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.delete("/projects/{project_id}/branches/{branch_name:path}")
async def delete_branch(
    project_id: str,
    branch_name: str,
    force: bool = Query(False, description="Force delete even if not merged"),
    delete_remote: bool = Query(False, description="Also delete the remote tracking branch"),
    remove_worktree: bool = Query(False, description="Remove associated worktree before deleting"),
):
    """Delete a branch (local and/or remote)."""
    from services.git_service import GitServiceError

    git_service = get_git_service_for_project(project_id)

    try:
        success = git_service.delete_branch(
            name=branch_name,
            force=force,
            delete_remote=delete_remote,
            remove_worktree=remove_worktree,
        )

        # Auto-close open MRs whose source branch was deleted
        closed_mrs = 0
        try:
            db_session = await _get_db_session()
            mr_service = get_mr_service_for_project(project_id, db_session=db_session)
            closed_mrs = await mr_service.close_mrs_by_source_branch_async(
                branch_name, closed_by="system"
            )
        except Exception:
            logger.warning(f"Failed to auto-close MRs for deleted branch '{branch_name}'")

        message = f"Branch '{branch_name}' deleted"
        if closed_mrs > 0:
            message += f" ({closed_mrs} open MR(s) auto-closed)"
        return {"success": success, "message": message}
    except GitServiceError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.post(
    "/projects/{project_id}/branches/prune-merged",
    response_model=PruneExecuteResult,
)
async def prune_merged_branches(project_id: str, request: PruneRequest):
    """Prune local branches whose GitHub PR has been merged.

    Two phases:
    - dry_run=True  → scan only, returns candidates + skipped (no deletion)
    - dry_run=False → executes deletion of candidates, returns deletion outcome

    GitHub token required (503 if not configured). Protection rules from
    BranchProtectionRule table are honored automatically.
    """
    from services.git_service import GitServiceError

    git_service = get_git_service_for_project(project_id)
    github_service = get_github_service()  # raises 503 without token

    # Pre-fetch active protection patterns (async DB) → pass to sync service
    protection_patterns: list[str] = []
    db_session = await _get_db_session()
    if db_session:
        try:
            async with db_session:
                from db.repository import BranchProtectionRepository

                repo = BranchProtectionRepository(db_session)
                rules = await repo.list_by_project(project_id, enabled_only=True)
                protection_patterns = [r.branch_pattern for r in rules if r.branch_pattern]
        except Exception as e:
            logger.warning(f"Failed to load protection rules for {project_id}: {e}")

    try:
        scan = git_service.find_prune_candidates(
            github_service=github_service,
            protection_patterns=protection_patterns,
            extra_protected=request.extra_protected,
        )
    except GitServiceError as e:
        raise HTTPException(status_code=400, detail=str(e))

    if request.dry_run:
        return PruneExecuteResult(
            candidates=scan.candidates,
            skipped=scan.skipped,
            deleted=[],
            errors=[],
            scan_error=scan.scan_error,
        )

    execute = git_service.prune_merged_branches(scan.candidates)
    return PruneExecuteResult(
        candidates=execute.candidates,
        skipped=scan.skipped,  # preserve skip reasons across both phases
        deleted=execute.deleted,
        errors=execute.errors,
        scan_error=scan.scan_error,
    )


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
                        require_no_conflicts=m.require_no_conflicts
                        if m.require_no_conflicts is not None
                        else True,
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
        raise HTTPException(
            status_code=503, detail="Database not configured for branch protection rules"
        )

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
            require_no_conflicts=model.require_no_conflicts
            if model.require_no_conflicts is not None
            else True,
            allowed_merge_roles=model.allowed_merge_roles or ["owner", "admin"],
            allow_force_push=model.allow_force_push or False,
            allow_deletion=model.allow_deletion or False,
            auto_deploy=model.auto_deploy or False,
            deploy_workflow=model.deploy_workflow,
            enabled=model.enabled if model.enabled is not None else True,
            created_at=model.created_at,
            updated_at=model.updated_at,
        )


@router.put(
    "/projects/{project_id}/branch-protection/{rule_id}", response_model=BranchProtectionRule
)
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
            require_no_conflicts=model.require_no_conflicts
            if model.require_no_conflicts is not None
            else True,
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
