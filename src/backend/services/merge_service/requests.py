"""머지 요청 CRUD 와 그 인메모리 저장소.

`_merge_requests` 는 `global` 로 재바인딩되지 않고 테스트도 갈아끼우지
않는다(전수 실측). 그래도 reader 전부와 같은 모듈에 둔다 — 나중에
재바인딩이 생기면 갈린 쪽이 옛 dict 를 계속 보기 때문이다.
"""

import logging
from typing import Any

from models.git import ConflictStatus, MergeRequest, MergeRequestStatus, MergeResult
from utils.time import utcnow

from .service import MergeService

logger = logging.getLogger(__name__)


_merge_requests: dict[str, dict[str, MergeRequest]] = {}


class MergeRequestService:
    """Service for managing internal merge requests.

    Supports DB persistence (preferred) with in-memory fallback.
    """

    def __init__(
        self,
        project_id: str,
        merge_service: MergeService | None = None,
        db_session=None,
    ):
        self.project_id = project_id
        self.merge_service = merge_service
        self.db_session = db_session
        self.use_database = db_session is not None

        if not self.use_database and project_id not in _merge_requests:
            _merge_requests[project_id] = {}

    def _mr_from_model(self, model) -> MergeRequest:
        """Convert DB model to Pydantic model."""
        return MergeRequest(
            id=model.id,
            project_id=model.project_id,
            title=model.title,
            description=model.description or "",
            source_branch=model.source_branch,
            target_branch=model.target_branch,
            status=MergeRequestStatus(model.status),
            author_id=model.author_id or "",
            author_name=model.author_name or "",
            author_email=model.author_email or "",
            conflict_status=ConflictStatus(model.conflict_status)
            if model.conflict_status
            else ConflictStatus.UNKNOWN,
            auto_merge=model.auto_merge if model.auto_merge is not None else False,
            reviewers=model.reviewers or [],
            approved_by=model.approved_by or [],
            created_at=model.created_at or utcnow(),
            updated_at=model.updated_at or utcnow(),
            merged_at=model.merged_at,
            merged_by=model.merged_by,
            closed_at=model.closed_at,
            closed_by=model.closed_by,
        )

    async def _get_repo(self):
        """Get MergeRequestRepository."""
        from db.repository import MergeRequestRepository

        return MergeRequestRepository(self.db_session)

    async def _get_protection_repo(self):
        """Get BranchProtectionRepository."""
        from db.repository import BranchProtectionRepository

        return BranchProtectionRepository(self.db_session)

    # ── List ──

    async def list_merge_requests_async(
        self, status: MergeRequestStatus | None = None
    ) -> list[MergeRequest]:
        if self.use_database:
            repo = await self._get_repo()
            models = await repo.list_by_project(
                self.project_id, status=status.value if status else None
            )
            return [self._mr_from_model(m) for m in models]
        return self.list_merge_requests(status)

    def list_merge_requests(self, status: MergeRequestStatus | None = None) -> list[MergeRequest]:
        mrs = list(_merge_requests[self.project_id].values())
        if status:
            mrs = [mr for mr in mrs if mr.status == status]
        return sorted(mrs, key=lambda mr: mr.created_at, reverse=True)

    # ── Get ──

    async def get_merge_request_async(self, mr_id: str) -> MergeRequest | None:
        if self.use_database:
            repo = await self._get_repo()
            model = await repo.get(mr_id)
            return self._mr_from_model(model) if model else None
        return self.get_merge_request(mr_id)

    def get_merge_request(self, mr_id: str) -> MergeRequest | None:
        return _merge_requests[self.project_id].get(mr_id)

    # ── Create ──

    async def create_merge_request_async(
        self,
        title: str,
        source_branch: str,
        target_branch: str,
        author_id: str,
        author_name: str,
        author_email: str,
        description: str = "",
        reviewers: list[str] | None = None,
        auto_merge: bool = False,
    ) -> MergeRequest:
        import uuid as _uuid

        conflict_status = ConflictStatus.UNKNOWN
        if self.merge_service:
            try:
                preview = self.merge_service.check_merge_conflicts(source_branch, target_branch)
                conflict_status = preview.conflict_status
            except Exception:
                pass

        mr_id = str(_uuid.uuid4())

        if self.use_database:
            repo = await self._get_repo()
            model = await repo.create(
                id=mr_id,
                project_id=self.project_id,
                title=title,
                description=description,
                source_branch=source_branch,
                target_branch=target_branch,
                author_id=author_id,
                author_name=author_name,
                author_email=author_email,
                conflict_status=conflict_status.value,
                auto_merge=auto_merge,
                reviewers=reviewers or [],
                approved_by=[],
            )
            return self._mr_from_model(model)

        mr = MergeRequest(
            id=mr_id,
            project_id=self.project_id,
            title=title,
            description=description,
            source_branch=source_branch,
            target_branch=target_branch,
            author_id=author_id,
            author_name=author_name,
            author_email=author_email,
            conflict_status=conflict_status,
            auto_merge=auto_merge,
            reviewers=reviewers or [],
        )
        _merge_requests[self.project_id][mr.id] = mr
        return mr

    # Sync wrapper for backward compatibility
    def create_merge_request(
        self,
        title: str,
        source_branch: str,
        target_branch: str,
        author_id: str,
        author_name: str,
        author_email: str,
        description: str = "",
        reviewers: list[str] | None = None,
        auto_merge: bool = False,
    ) -> MergeRequest:
        conflict_status = ConflictStatus.UNKNOWN
        if self.merge_service:
            try:
                preview = self.merge_service.check_merge_conflicts(source_branch, target_branch)
                conflict_status = preview.conflict_status
            except Exception:
                pass

        mr = MergeRequest(
            project_id=self.project_id,
            title=title,
            description=description,
            source_branch=source_branch,
            target_branch=target_branch,
            author_id=author_id,
            author_name=author_name,
            author_email=author_email,
            conflict_status=conflict_status,
            auto_merge=auto_merge,
            reviewers=reviewers or [],
        )
        _merge_requests[self.project_id][mr.id] = mr
        return mr

    # ── Update ──

    async def update_merge_request_async(
        self,
        mr_id: str,
        title: str | None = None,
        description: str | None = None,
        status: MergeRequestStatus | None = None,
        reviewers: list[str] | None = None,
        auto_merge: bool | None = None,
    ) -> MergeRequest | None:
        if self.use_database:
            repo = await self._get_repo()
            updates = {}
            if title is not None:
                updates["title"] = title
            if description is not None:
                updates["description"] = description
            if status is not None:
                updates["status"] = status.value
            if reviewers is not None:
                updates["reviewers"] = reviewers
            if auto_merge is not None:
                updates["auto_merge"] = auto_merge
            if updates:
                await repo.update(mr_id, **updates)
            return await self.get_merge_request_async(mr_id)
        return self.update_merge_request(mr_id, title, description, status, reviewers)

    def update_merge_request(
        self,
        mr_id: str,
        title: str | None = None,
        description: str | None = None,
        status: MergeRequestStatus | None = None,
        reviewers: list[str] | None = None,
    ) -> MergeRequest | None:
        mr = _merge_requests[self.project_id].get(mr_id)
        if not mr:
            return None
        if title is not None:
            mr.title = title
        if description is not None:
            mr.description = description
        if status is not None:
            mr.status = status
        if reviewers is not None:
            mr.reviewers = reviewers
        mr.updated_at = utcnow()
        return mr

    # ── Approve (with auto-merge check) ──

    async def approve_merge_request_async(self, mr_id: str, user_id: str) -> MergeRequest | None:
        if self.use_database:
            repo = await self._get_repo()
            model = await repo.get(mr_id)
            if not model:
                return None
            approved = list(model.approved_by or [])
            if user_id not in approved:
                approved.append(user_id)
                await repo.update(mr_id, approved_by=approved)

            mr = await self.get_merge_request_async(mr_id)
            # Auto-merge check
            if mr and mr.auto_merge:
                await self._try_auto_merge(mr)
                mr = await self.get_merge_request_async(mr_id)
            return mr

        mr = self.approve_merge_request(mr_id, user_id)
        if mr and mr.auto_merge:
            self._try_auto_merge_sync(mr)
        return mr

    def approve_merge_request(self, mr_id: str, user_id: str) -> MergeRequest | None:
        mr = _merge_requests[self.project_id].get(mr_id)
        if not mr:
            return None
        if user_id not in mr.approved_by:
            mr.approved_by.append(user_id)
            mr.updated_at = utcnow()
        return mr

    async def _try_auto_merge(self, mr: MergeRequest) -> None:
        """Try auto-merge if conditions are met."""
        if mr.status != MergeRequestStatus.OPEN:
            return

        # Check branch protection rules for required approvals
        required_approvals = 0
        if self.use_database:
            protection_repo = await self._get_protection_repo()
            rule = await protection_repo.find_matching_rule(self.project_id, mr.target_branch)
            if rule:
                required_approvals = rule.require_approvals

        if len(mr.approved_by) < required_approvals:
            return

        # Check no conflicts
        if mr.conflict_status == ConflictStatus.HAS_CONFLICTS:
            return

        # Refresh conflict check
        if self.merge_service and mr.conflict_status == ConflictStatus.UNKNOWN:
            try:
                preview = self.merge_service.check_merge_conflicts(
                    mr.source_branch, mr.target_branch
                )
                if preview.conflict_status == ConflictStatus.HAS_CONFLICTS:
                    if self.use_database:
                        repo = await self._get_repo()
                        await repo.update(mr.id, conflict_status="has_conflicts")
                    return
            except Exception:
                return

        # Execute auto-merge
        logger.info(f"Auto-merging MR {mr.id[:8]}: {mr.title}")
        _, result = await self.merge_merge_request_async(mr.id, "auto-merge")

        # Trigger auto-deploy if configured
        if result and result.success:
            await self._try_auto_deploy(mr)

    def _try_auto_merge_sync(self, mr: MergeRequest) -> None:
        """Sync auto-merge for in-memory mode (simplified)."""
        if mr.status != MergeRequestStatus.OPEN:
            return
        if mr.conflict_status == ConflictStatus.HAS_CONFLICTS:
            return
        if not self.merge_service:
            return
        logger.info(f"Auto-merging MR {mr.id[:8]}: {mr.title}")
        self.merge_merge_request(mr.id, "auto-merge")

    async def _try_auto_deploy(self, mr: MergeRequest) -> None:
        """Trigger auto-deploy if branch protection rule has auto_deploy enabled."""
        if not self.use_database:
            return
        try:
            protection_repo = await self._get_protection_repo()
            rule = await protection_repo.find_matching_rule(self.project_id, mr.target_branch)
            if not rule or not rule.auto_deploy:
                return

            workflow = rule.deploy_workflow or "deploy-staging.yml"
            logger.info(
                f"Auto-deploy triggered for MR {mr.id[:8]} -> {mr.target_branch}, "
                f"workflow: {workflow}"
            )

            # Dispatch GitHub Actions workflow
            try:
                from services.github_service import get_github_service

                github_service = get_github_service()
                if github_service:
                    github_service.dispatch_workflow(
                        workflow_file=workflow,
                        ref=mr.target_branch,
                    )
                    logger.info(f"Auto-deploy workflow dispatched: {workflow}")
                else:
                    logger.warning("GitHub service not available for auto-deploy")
            except Exception as e:
                logger.error(f"Auto-deploy dispatch failed: {e}")
        except Exception as e:
            logger.error(f"Auto-deploy check failed: {e}")

    # ── Merge ──

    async def merge_merge_request_async(
        self, mr_id: str, merged_by: str
    ) -> tuple[MergeRequest | None, MergeResult | None]:
        if self.use_database:
            repo = await self._get_repo()
            model = await repo.get(mr_id)
            if not model:
                return None, None
            mr = self._mr_from_model(model)

            if mr.status != MergeRequestStatus.OPEN:
                return mr, MergeResult(
                    success=False,
                    message=f"Cannot merge: MR status is {mr.status}",
                    source_branch=mr.source_branch,
                    target_branch=mr.target_branch,
                )

            if not self.merge_service:
                return mr, MergeResult(
                    success=False,
                    message="Merge service not available",
                    source_branch=mr.source_branch,
                    target_branch=mr.target_branch,
                )

            result = self.merge_service.merge_branch(
                source_branch=mr.source_branch,
                target_branch=mr.target_branch,
                message=f"Merge MR #{mr.id[:8]}: {mr.title}",
                author_name=mr.author_name,
                author_email=mr.author_email,
            )

            if result.success:
                await repo.update(
                    mr_id,
                    status="merged",
                    merged_at=utcnow(),
                    merged_by=merged_by,
                )
                # Close other OPEN MRs with the same source→target branch
                await self._close_duplicate_mrs_async(
                    repo, mr_id, mr.source_branch, mr.target_branch, merged_by
                )

            mr = await self.get_merge_request_async(mr_id)
            return mr, result

        return self.merge_merge_request(mr_id, merged_by)

    def merge_merge_request(
        self, mr_id: str, merged_by: str
    ) -> tuple[MergeRequest | None, MergeResult | None]:
        mr = _merge_requests[self.project_id].get(mr_id)
        if not mr:
            return None, None

        if mr.status != MergeRequestStatus.OPEN:
            return mr, MergeResult(
                success=False,
                message=f"Cannot merge: MR status is {mr.status}",
                source_branch=mr.source_branch,
                target_branch=mr.target_branch,
            )

        if not self.merge_service:
            return mr, MergeResult(
                success=False,
                message="Merge service not available",
                source_branch=mr.source_branch,
                target_branch=mr.target_branch,
            )

        result = self.merge_service.merge_branch(
            source_branch=mr.source_branch,
            target_branch=mr.target_branch,
            message=f"Merge MR #{mr.id[:8]}: {mr.title}",
            author_name=mr.author_name,
            author_email=mr.author_email,
        )

        if result.success:
            mr.status = MergeRequestStatus.MERGED
            mr.merged_at = utcnow()
            mr.merged_by = merged_by
            # Close other OPEN MRs with the same source→target branch
            self._close_duplicate_mrs_sync(mr_id, mr.source_branch, mr.target_branch, merged_by)

        mr.updated_at = utcnow()
        return mr, result

    # ── Close ──

    async def close_merge_request_async(self, mr_id: str, closed_by: str) -> MergeRequest | None:
        if self.use_database:
            repo = await self._get_repo()
            await repo.update(
                mr_id,
                status="closed",
                closed_at=utcnow(),
                closed_by=closed_by,
            )
            return await self.get_merge_request_async(mr_id)
        return self.close_merge_request(mr_id, closed_by)

    def close_merge_request(self, mr_id: str, closed_by: str) -> MergeRequest | None:
        mr = _merge_requests[self.project_id].get(mr_id)
        if not mr:
            return None
        mr.status = MergeRequestStatus.CLOSED
        mr.closed_at = utcnow()
        mr.closed_by = closed_by
        mr.updated_at = utcnow()
        return mr

    # ── Delete ──

    async def delete_merge_request_async(self, mr_id: str) -> bool:
        """Permanently delete a merge request record. Returns True if a row was removed."""
        if self.use_database:
            repo = await self._get_repo()
            return await repo.delete(mr_id)
        return self.delete_merge_request(mr_id)

    def delete_merge_request(self, mr_id: str) -> bool:
        """In-memory delete. Returns True if the MR existed and was removed."""
        return _merge_requests[self.project_id].pop(mr_id, None) is not None

    # ── Close duplicate MRs ──

    async def _close_duplicate_mrs_async(
        self,
        repo: Any,
        merged_mr_id: str,
        source_branch: str,
        target_branch: str,
        closed_by: str,
    ) -> None:
        """Close other OPEN MRs with the same source→target after a successful merge."""
        open_mrs = await repo.list_by_project(self.project_id, status="open")
        now = utcnow()
        for model in open_mrs:
            if (
                model.id != merged_mr_id
                and model.source_branch == source_branch
                and model.target_branch == target_branch
            ):
                await repo.update(
                    model.id,
                    status="closed",
                    closed_at=now,
                    closed_by=closed_by,
                )
                logger.info(f"Auto-closed duplicate MR {model.id[:8]} (same branch pair)")

    def _close_duplicate_mrs_sync(
        self,
        merged_mr_id: str,
        source_branch: str,
        target_branch: str,
        closed_by: str,
    ) -> None:
        """Close other OPEN MRs with the same source→target after a successful merge."""
        now = utcnow()
        for mr_id, mr in _merge_requests[self.project_id].items():
            if (
                mr_id != merged_mr_id
                and mr.status == MergeRequestStatus.OPEN
                and mr.source_branch == source_branch
                and mr.target_branch == target_branch
            ):
                mr.status = MergeRequestStatus.CLOSED
                mr.closed_at = now
                mr.closed_by = closed_by
                mr.updated_at = now
                logger.info(f"Auto-closed duplicate MR {mr_id[:8]} (same branch pair)")

    # ── Close MRs by deleted source branch ──

    async def close_mrs_by_source_branch_async(
        self, branch_name: str, closed_by: str = "system"
    ) -> int:
        """Close all OPEN MRs whose source_branch matches a deleted branch."""
        closed_count = 0
        now = utcnow()
        if self.use_database:
            repo = await self._get_repo()
            open_mrs = await repo.list_by_project(self.project_id, status="open")
            for model in open_mrs:
                if model.source_branch == branch_name:
                    await repo.update(
                        model.id,
                        status="closed",
                        closed_at=now,
                        closed_by=closed_by,
                    )
                    closed_count += 1
                    logger.info(
                        f"Auto-closed MR {model.id[:8]} (source branch '{branch_name}' deleted)"
                    )
        else:
            closed_count = self.close_mrs_by_source_branch(branch_name, closed_by)
        return closed_count

    def close_mrs_by_source_branch(self, branch_name: str, closed_by: str = "system") -> int:
        """Close all OPEN MRs whose source_branch matches a deleted branch."""
        closed_count = 0
        now = utcnow()
        for mr_id, mr in _merge_requests[self.project_id].items():
            if mr.status == MergeRequestStatus.OPEN and mr.source_branch == branch_name:
                mr.status = MergeRequestStatus.CLOSED
                mr.closed_at = now
                mr.closed_by = closed_by
                mr.updated_at = now
                closed_count += 1
                logger.info(f"Auto-closed MR {mr_id[:8]} (source branch '{branch_name}' deleted)")
        return closed_count

    # ── Refresh conflict status ──

    async def refresh_conflict_status_async(self, mr_id: str) -> MergeRequest | None:
        if self.use_database:
            mr = await self.get_merge_request_async(mr_id)
            if not mr or not self.merge_service:
                return mr
            try:
                preview = self.merge_service.check_merge_conflicts(
                    mr.source_branch, mr.target_branch
                )
                repo = await self._get_repo()
                await repo.update(mr_id, conflict_status=preview.conflict_status.value)
                return await self.get_merge_request_async(mr_id)
            except Exception as e:
                logger.warning(f"Failed to refresh conflict status: {e}")
            return mr
        return self.refresh_conflict_status(mr_id)

    def refresh_conflict_status(self, mr_id: str) -> MergeRequest | None:
        mr = _merge_requests[self.project_id].get(mr_id)
        if not mr or not self.merge_service:
            return mr
        try:
            preview = self.merge_service.check_merge_conflicts(mr.source_branch, mr.target_branch)
            mr.conflict_status = preview.conflict_status
            mr.updated_at = utcnow()
        except Exception as e:
            logger.warning(f"Failed to refresh conflict status: {e}")
        return mr
