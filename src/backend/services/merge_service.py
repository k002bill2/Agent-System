"""Merge service for conflict detection and merge operations."""

import logging
import subprocess
import tempfile
from datetime import datetime
from pathlib import Path
from typing import Any

try:
    from git import Repo, GitCommandError
    GIT_AVAILABLE = True
except ImportError:
    GIT_AVAILABLE = False
    Repo = None
    GitCommandError = Exception

from models.git import (
    ConflictStatus,
    ConflictType,
    ConflictFile,
    ConflictMarker,
    MergePreview,
    MergeResult,
    ThreeWayDiff,
    DEFAULT_PROTECTED_BRANCHES,
    MergeRequest,
    MergeRequestStatus,
    ResolutionStrategy,
    ConflictResolutionRequest,
    ConflictResolutionResult,
    MergeAbortResult,
)
from services.git_service import GitService, GitServiceError

logger = logging.getLogger(__name__)


class MergeServiceError(Exception):
    """Merge service specific error."""
    pass


class MergeService:
    """Service for merge operations and conflict detection."""

    def __init__(self, git_service: GitService):
        """Initialize merge service.

        Args:
            git_service: GitService instance for the repository
        """
        if not GIT_AVAILABLE:
            raise MergeServiceError("GitPython is not installed")

        self.git_service = git_service
        self.repo = git_service.repo
        self.project_path = git_service.project_path

    # =========================================================================
    # Conflict Detection (Dry-run)
    # =========================================================================

    def check_merge_conflicts(
        self,
        source_branch: str,
        target_branch: str = "main"
    ) -> MergePreview:
        """Check if merge would have conflicts without actually merging.

        Uses git merge-tree for conflict detection without modifying worktree.

        Args:
            source_branch: Branch to merge from
            target_branch: Branch to merge into

        Returns:
            MergePreview with conflict information
        """
        try:
            # Validate branches exist
            if source_branch not in [b.name for b in self.repo.branches]:
                raise MergeServiceError(f"Source branch '{source_branch}' not found")
            if target_branch not in [b.name for b in self.repo.branches]:
                raise MergeServiceError(f"Target branch '{target_branch}' not found")

            source_commit = self.repo.branches[source_branch].commit
            target_commit = self.repo.branches[target_branch].commit

            # Check if already merged
            merge_base = self.repo.merge_base(source_commit, target_commit)
            if merge_base and merge_base[0].hexsha == source_commit.hexsha:
                return MergePreview(
                    source_branch=source_branch,
                    target_branch=target_branch,
                    can_merge=True,
                    conflict_status=ConflictStatus.NO_CONFLICTS,
                    commits_to_merge=0,
                    message="Already up to date",
                )

            # Count commits to merge
            commits_to_merge = 0
            if merge_base:
                base_sha = merge_base[0].hexsha
                commits = list(self.repo.iter_commits(f"{base_sha}..{source_commit.hexsha}"))
                commits_to_merge = len(commits)

            # Use git merge-tree to check for conflicts
            conflict_files = self._check_conflicts_with_merge_tree(
                source_branch, target_branch
            )

            # Get diff stats
            diff = target_commit.diff(source_commit)
            files_changed = len(diff)
            insertions = 0
            deletions = 0

            for d in diff:
                if d.diff:
                    lines = d.diff.decode('utf-8', errors='ignore').split('\n')
                    for line in lines:
                        if line.startswith('+') and not line.startswith('+++'):
                            insertions += 1
                        elif line.startswith('-') and not line.startswith('---'):
                            deletions += 1

            has_conflicts = len(conflict_files) > 0

            return MergePreview(
                source_branch=source_branch,
                target_branch=target_branch,
                can_merge=not has_conflicts,
                conflict_status=(
                    ConflictStatus.HAS_CONFLICTS if has_conflicts
                    else ConflictStatus.NO_CONFLICTS
                ),
                conflicting_files=conflict_files,
                files_changed=files_changed,
                insertions=insertions,
                deletions=deletions,
                commits_to_merge=commits_to_merge,
            )

        except GitCommandError as e:
            raise MergeServiceError(f"Failed to check merge conflicts: {e}")

    def _check_conflicts_with_merge_tree(
        self,
        source_branch: str,
        target_branch: str
    ) -> list[str]:
        """Use git merge-tree to detect conflicts.

        Args:
            source_branch: Source branch
            target_branch: Target branch

        Returns:
            List of conflicting file paths
        """
        try:
            # Find merge base
            result = subprocess.run(
                ['git', 'merge-base', target_branch, source_branch],
                cwd=self.project_path,
                capture_output=True,
                text=True,
            )
            if result.returncode != 0:
                return []

            merge_base = result.stdout.strip()

            # Use merge-tree to simulate merge
            result = subprocess.run(
                ['git', 'merge-tree', merge_base, target_branch, source_branch],
                cwd=self.project_path,
                capture_output=True,
                text=True,
            )

            # Parse output for conflict markers
            conflict_files = []
            output = result.stdout
            lines = output.split('\n')

            for line in lines:
                # Look for conflict markers
                if '<<<<<<' in line or '======' in line or '>>>>>>' in line:
                    # Try to extract filename from previous lines
                    continue
                if line.startswith('changed in both'):
                    # Format: "changed in both" followed by file info
                    parts = line.split()
                    if len(parts) > 3:
                        conflict_files.append(parts[-1])
                elif '+<<<<<<<' in line or '+=======':
                    # Git merge-tree shows conflicts with + prefix
                    pass

            # Alternative: look for files with merge conflict status
            if not conflict_files and '<<<<<<' in output:
                # Parse the merge-tree output more carefully
                current_file = None
                for line in lines:
                    if line.startswith('+++') or line.startswith('---'):
                        # diff header
                        if line.startswith('+++ '):
                            current_file = line[4:].split('\t')[0]
                            if current_file.startswith('b/'):
                                current_file = current_file[2:]
                    if '<<<<<<' in line and current_file:
                        if current_file not in conflict_files:
                            conflict_files.append(current_file)

            return conflict_files

        except Exception as e:
            logger.warning(f"merge-tree check failed: {e}")
            return []

    def get_conflict_details(
        self,
        source_branch: str,
        target_branch: str
    ) -> list[ConflictFile]:
        """Get detailed conflict information for each conflicting file.

        Args:
            source_branch: Source branch
            target_branch: Target branch

        Returns:
            List of conflict file details
        """
        preview = self.check_merge_conflicts(source_branch, target_branch)
        if preview.conflict_status != ConflictStatus.HAS_CONFLICTS:
            return []

        conflicts: list[ConflictFile] = []

        # Get merge base
        source_commit = self.repo.branches[source_branch].commit
        target_commit = self.repo.branches[target_branch].commit
        merge_base = self.repo.merge_base(source_commit, target_commit)
        base_commit = merge_base[0] if merge_base else None

        for file_path in preview.conflicting_files:
            try:
                # Get file content from each branch
                our_content = self._get_file_content(target_commit, file_path)
                their_content = self._get_file_content(source_commit, file_path)
                base_content = ""
                if base_commit:
                    base_content = self._get_file_content(base_commit, file_path)

                # Determine conflict type
                conflict_type = ConflictType.BOTH_MODIFIED
                if not our_content and not their_content:
                    conflict_type = ConflictType.BOTH_ADDED
                elif not our_content:
                    conflict_type = ConflictType.DELETED_BY_US
                elif not their_content:
                    conflict_type = ConflictType.DELETED_BY_THEM

                conflicts.append(ConflictFile(
                    path=file_path,
                    conflict_type=conflict_type,
                    our_content=our_content,
                    their_content=their_content,
                    base_content=base_content,
                ))

            except Exception as e:
                logger.warning(f"Failed to get conflict details for {file_path}: {e}")
                conflicts.append(ConflictFile(
                    path=file_path,
                    conflict_type=ConflictType.BOTH_MODIFIED,
                ))

        return conflicts

    def get_three_way_diff(
        self,
        file_path: str,
        source_branch: str,
        target_branch: str
    ) -> ThreeWayDiff:
        """Get three-way diff for a file.

        Args:
            file_path: Path to the file
            source_branch: Source branch (theirs)
            target_branch: Target branch (ours)

        Returns:
            Three-way diff information
        """
        source_commit = self.repo.branches[source_branch].commit
        target_commit = self.repo.branches[target_branch].commit
        merge_base = self.repo.merge_base(source_commit, target_commit)
        base_commit = merge_base[0] if merge_base else None

        base_content = ""
        if base_commit:
            base_content = self._get_file_content(base_commit, file_path)

        return ThreeWayDiff(
            path=file_path,
            base_content=base_content,
            ours_content=self._get_file_content(target_commit, file_path),
            theirs_content=self._get_file_content(source_commit, file_path),
        )

    def _get_file_content(self, commit: Any, file_path: str) -> str:
        """Get file content from a commit.

        Args:
            commit: Git commit object
            file_path: Path to file

        Returns:
            File content as string
        """
        try:
            blob = commit.tree / file_path
            return blob.data_stream.read().decode('utf-8', errors='ignore')
        except KeyError:
            return ""
        except Exception as e:
            logger.warning(f"Failed to read {file_path} from commit: {e}")
            return ""

    # =========================================================================
    # Merge Execution
    # =========================================================================

    def merge_branch(
        self,
        source_branch: str,
        target_branch: str = "main",
        message: str | None = None,
        author_name: str | None = None,
        author_email: str | None = None,
        no_ff: bool = True
    ) -> MergeResult:
        """Execute merge operation.

        Args:
            source_branch: Branch to merge from
            target_branch: Branch to merge into
            message: Merge commit message
            author_name: Author name for commit
            author_email: Author email for commit
            no_ff: Create merge commit even for fast-forward

        Returns:
            MergeResult with outcome
        """
        # First check for conflicts
        preview = self.check_merge_conflicts(source_branch, target_branch)
        if preview.conflict_status == ConflictStatus.HAS_CONFLICTS:
            return MergeResult(
                success=False,
                message=f"Cannot merge: conflicts in {len(preview.conflicting_files)} files",
                source_branch=source_branch,
                target_branch=target_branch,
            )

        if preview.commits_to_merge == 0:
            return MergeResult(
                success=True,
                message="Already up to date",
                source_branch=source_branch,
                target_branch=target_branch,
            )

        try:
            # Save current branch
            original_branch = self.git_service.current_branch

            # Checkout target branch
            self.repo.heads[target_branch].checkout()

            # Build merge command
            merge_args = [source_branch]
            if no_ff:
                merge_args.insert(0, '--no-ff')

            if message:
                merge_args.extend(['-m', message])
            else:
                merge_args.extend(['-m', f"Merge branch '{source_branch}' into {target_branch}"])

            # Execute merge
            self.repo.git.merge(*merge_args)

            merge_commit_sha = self.repo.head.commit.hexsha

            # Return to original branch if different
            if original_branch != target_branch:
                self.repo.heads[original_branch].checkout()

            return MergeResult(
                success=True,
                merge_commit_sha=merge_commit_sha,
                message=f"Successfully merged {source_branch} into {target_branch}",
                source_branch=source_branch,
                target_branch=target_branch,
            )

        except GitCommandError as e:
            # Abort merge if failed
            try:
                self.repo.git.merge('--abort')
            except Exception:
                pass

            return MergeResult(
                success=False,
                message=f"Merge failed: {e}",
                source_branch=source_branch,
                target_branch=target_branch,
            )

    def abort_merge(self) -> MergeAbortResult:
        """Abort ongoing merge.

        Returns:
            MergeAbortResult with outcome
        """
        try:
            if not self._is_merge_in_progress():
                return MergeAbortResult(
                    success=False,
                    message="No merge in progress to abort"
                )
            self.repo.git.merge('--abort')
            return MergeAbortResult(
                success=True,
                message="Merge aborted successfully"
            )
        except GitCommandError as e:
            return MergeAbortResult(
                success=False,
                message=f"Failed to abort merge: {e}"
            )

    # =========================================================================
    # Conflict Resolution
    # =========================================================================

    def _is_merge_in_progress(self) -> bool:
        """Check if a merge is currently in progress.

        Returns:
            True if merge is in progress
        """
        merge_head_path = Path(self.project_path) / ".git" / "MERGE_HEAD"
        return merge_head_path.exists()

    def _start_merge_for_resolution(
        self,
        source_branch: str,
        target_branch: str
    ) -> bool:
        """Start a merge operation for conflict resolution.

        Args:
            source_branch: Source branch
            target_branch: Target branch

        Returns:
            True if merge started (with conflicts) or already in progress
        """
        if self._is_merge_in_progress():
            return True

        try:
            # Checkout target branch first
            current_branch = self.git_service.current_branch
            if current_branch != target_branch:
                self.repo.heads[target_branch].checkout()

            # Start merge with --no-commit to allow conflict resolution
            try:
                self.repo.git.merge(source_branch, '--no-commit', '--no-ff')
            except GitCommandError:
                # Merge with conflicts - this is expected
                pass

            return self._is_merge_in_progress() or True
        except Exception as e:
            logger.error(f"Failed to start merge for resolution: {e}")
            return False

    def _write_resolved_file(self, file_path: str, content: str) -> bool:
        """Write resolved content to a file.

        Args:
            file_path: Path to the file (relative to repo root)
            content: Resolved content

        Returns:
            True if successful
        """
        try:
            full_path = Path(self.project_path) / file_path
            full_path.parent.mkdir(parents=True, exist_ok=True)
            full_path.write_text(content, encoding='utf-8')
            return True
        except Exception as e:
            logger.error(f"Failed to write resolved file {file_path}: {e}")
            return False

    def _stage_resolved_file(self, file_path: str) -> bool:
        """Stage a resolved file.

        Args:
            file_path: Path to the file (relative to repo root)

        Returns:
            True if successful
        """
        try:
            self.repo.index.add([file_path])
            return True
        except Exception as e:
            logger.error(f"Failed to stage resolved file {file_path}: {e}")
            return False

    def resolve_conflict(
        self,
        request: ConflictResolutionRequest
    ) -> ConflictResolutionResult:
        """Resolve a single file conflict.

        Args:
            request: Conflict resolution request

        Returns:
            ConflictResolutionResult with outcome
        """
        file_path = request.file_path
        strategy = request.strategy
        source_branch = request.source_branch
        target_branch = request.target_branch

        try:
            # Validate branches exist
            if source_branch not in [b.name for b in self.repo.branches]:
                return ConflictResolutionResult(
                    success=False,
                    file_path=file_path,
                    message=f"Source branch '{source_branch}' not found"
                )
            if target_branch not in [b.name for b in self.repo.branches]:
                return ConflictResolutionResult(
                    success=False,
                    file_path=file_path,
                    message=f"Target branch '{target_branch}' not found"
                )

            # Start merge if not already in progress
            if not self._is_merge_in_progress():
                if not self._start_merge_for_resolution(source_branch, target_branch):
                    return ConflictResolutionResult(
                        success=False,
                        file_path=file_path,
                        message="Failed to start merge operation"
                    )

            # Determine resolved content based on strategy
            resolved_content: str = ""

            if strategy == ResolutionStrategy.CUSTOM:
                if request.resolved_content is None:
                    return ConflictResolutionResult(
                        success=False,
                        file_path=file_path,
                        message="resolved_content is required when strategy is CUSTOM"
                    )
                resolved_content = request.resolved_content

            elif strategy == ResolutionStrategy.OURS:
                # Get content from target branch (ours)
                target_commit = self.repo.branches[target_branch].commit
                resolved_content = self._get_file_content(target_commit, file_path)

            elif strategy == ResolutionStrategy.THEIRS:
                # Get content from source branch (theirs)
                source_commit = self.repo.branches[source_branch].commit
                resolved_content = self._get_file_content(source_commit, file_path)

            # Write resolved content
            if not self._write_resolved_file(file_path, resolved_content):
                return ConflictResolutionResult(
                    success=False,
                    file_path=file_path,
                    message="Failed to write resolved content"
                )

            # Stage the resolved file
            if not self._stage_resolved_file(file_path):
                return ConflictResolutionResult(
                    success=False,
                    file_path=file_path,
                    message="Failed to stage resolved file"
                )

            return ConflictResolutionResult(
                success=True,
                file_path=file_path,
                message=f"Conflict resolved using '{strategy.value}' strategy",
                resolved_content=resolved_content
            )

        except Exception as e:
            logger.error(f"Failed to resolve conflict for {file_path}: {e}")
            return ConflictResolutionResult(
                success=False,
                file_path=file_path,
                message=f"Failed to resolve conflict: {str(e)}"
            )

    def get_merge_status(self) -> dict:
        """Get current merge status.

        Returns:
            Dict with merge status information
        """
        in_progress = self._is_merge_in_progress()

        # Get unmerged files if merge in progress
        unmerged_files: list[str] = []
        if in_progress:
            try:
                # Use git ls-files to find unmerged files
                result = subprocess.run(
                    ['git', 'ls-files', '-u', '--full-name'],
                    cwd=self.project_path,
                    capture_output=True,
                    text=True,
                )
                if result.returncode == 0 and result.stdout.strip():
                    # Extract unique file paths
                    files = set()
                    for line in result.stdout.strip().split('\n'):
                        if line:
                            parts = line.split('\t')
                            if len(parts) >= 2:
                                files.add(parts[1])
                    unmerged_files = list(files)
            except Exception as e:
                logger.warning(f"Failed to get unmerged files: {e}")

        return {
            "merge_in_progress": in_progress,
            "unmerged_files": unmerged_files,
            "can_commit": in_progress and len(unmerged_files) == 0,
        }

    def complete_merge(self, message: str | None = None) -> MergeResult:
        """Complete the ongoing merge by creating a merge commit.

        Args:
            message: Optional commit message

        Returns:
            MergeResult with outcome
        """
        if not self._is_merge_in_progress():
            return MergeResult(
                success=False,
                message="No merge in progress to complete",
                source_branch="",
                target_branch="",
            )

        status = self.get_merge_status()
        if not status["can_commit"]:
            return MergeResult(
                success=False,
                message=f"Cannot complete merge: {len(status['unmerged_files'])} unresolved conflicts",
                source_branch="",
                target_branch="",
            )

        try:
            # Commit the merge
            if message:
                self.repo.index.commit(message)
            else:
                # Use default merge message
                merge_msg_path = Path(self.project_path) / ".git" / "MERGE_MSG"
                if merge_msg_path.exists():
                    message = merge_msg_path.read_text(encoding='utf-8').strip()
                else:
                    message = "Merge commit"
                self.repo.index.commit(message)

            merge_commit_sha = self.repo.head.commit.hexsha

            return MergeResult(
                success=True,
                merge_commit_sha=merge_commit_sha,
                message="Merge completed successfully",
                source_branch="",  # Info not available after merge
                target_branch=self.git_service.current_branch,
            )

        except Exception as e:
            logger.error(f"Failed to complete merge: {e}")
            return MergeResult(
                success=False,
                message=f"Failed to complete merge: {str(e)}",
                source_branch="",
                target_branch="",
            )


# =============================================================================
# In-Memory Merge Request Storage
# =============================================================================

# Simple in-memory storage for merge requests
_merge_requests: dict[str, dict[str, MergeRequest]] = {}


class MergeRequestService:
    """Service for managing internal merge requests."""

    def __init__(self, project_id: str, merge_service: MergeService | None = None):
        """Initialize merge request service.

        Args:
            project_id: Project identifier
            merge_service: Optional MergeService for conflict checking
        """
        self.project_id = project_id
        self.merge_service = merge_service

        if project_id not in _merge_requests:
            _merge_requests[project_id] = {}

    def list_merge_requests(
        self,
        status: MergeRequestStatus | None = None
    ) -> list[MergeRequest]:
        """List merge requests.

        Args:
            status: Filter by status

        Returns:
            List of merge requests
        """
        mrs = list(_merge_requests[self.project_id].values())
        if status:
            mrs = [mr for mr in mrs if mr.status == status]
        return sorted(mrs, key=lambda mr: mr.created_at, reverse=True)

    def get_merge_request(self, mr_id: str) -> MergeRequest | None:
        """Get a merge request by ID.

        Args:
            mr_id: Merge request ID

        Returns:
            MergeRequest or None
        """
        return _merge_requests[self.project_id].get(mr_id)

    def create_merge_request(
        self,
        title: str,
        source_branch: str,
        target_branch: str,
        author_id: str,
        author_name: str,
        author_email: str,
        description: str = "",
        reviewers: list[str] | None = None
    ) -> MergeRequest:
        """Create a new merge request.

        Args:
            title: MR title
            source_branch: Source branch
            target_branch: Target branch
            author_id: Author user ID
            author_name: Author name
            author_email: Author email
            description: MR description
            reviewers: List of reviewer user IDs

        Returns:
            Created MergeRequest
        """
        # Check for conflicts if merge service available
        conflict_status = ConflictStatus.UNKNOWN
        if self.merge_service:
            try:
                preview = self.merge_service.check_merge_conflicts(
                    source_branch, target_branch
                )
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
            reviewers=reviewers or [],
        )

        _merge_requests[self.project_id][mr.id] = mr
        return mr

    def update_merge_request(
        self,
        mr_id: str,
        title: str | None = None,
        description: str | None = None,
        status: MergeRequestStatus | None = None,
        reviewers: list[str] | None = None
    ) -> MergeRequest | None:
        """Update a merge request.

        Args:
            mr_id: Merge request ID
            title: New title
            description: New description
            status: New status
            reviewers: New reviewers list

        Returns:
            Updated MergeRequest or None
        """
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

        mr.updated_at = datetime.utcnow()
        return mr

    def approve_merge_request(
        self,
        mr_id: str,
        user_id: str
    ) -> MergeRequest | None:
        """Approve a merge request.

        Args:
            mr_id: Merge request ID
            user_id: Approving user ID

        Returns:
            Updated MergeRequest or None
        """
        mr = _merge_requests[self.project_id].get(mr_id)
        if not mr:
            return None

        if user_id not in mr.approved_by:
            mr.approved_by.append(user_id)
            mr.updated_at = datetime.utcnow()

        return mr

    def merge_merge_request(
        self,
        mr_id: str,
        merged_by: str
    ) -> tuple[MergeRequest | None, MergeResult | None]:
        """Merge a merge request.

        Args:
            mr_id: Merge request ID
            merged_by: User ID who is merging

        Returns:
            Tuple of (MergeRequest, MergeResult) or (None, None)
        """
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

        # Execute merge
        result = self.merge_service.merge_branch(
            source_branch=mr.source_branch,
            target_branch=mr.target_branch,
            message=f"Merge MR #{mr.id[:8]}: {mr.title}",
            author_name=mr.author_name,
            author_email=mr.author_email,
        )

        if result.success:
            mr.status = MergeRequestStatus.MERGED
            mr.merged_at = datetime.utcnow()
            mr.merged_by = merged_by

        mr.updated_at = datetime.utcnow()
        return mr, result

    def close_merge_request(
        self,
        mr_id: str,
        closed_by: str
    ) -> MergeRequest | None:
        """Close a merge request without merging.

        Args:
            mr_id: Merge request ID
            closed_by: User ID who is closing

        Returns:
            Updated MergeRequest or None
        """
        mr = _merge_requests[self.project_id].get(mr_id)
        if not mr:
            return None

        mr.status = MergeRequestStatus.CLOSED
        mr.closed_at = datetime.utcnow()
        mr.closed_by = closed_by
        mr.updated_at = datetime.utcnow()

        return mr

    def refresh_conflict_status(self, mr_id: str) -> MergeRequest | None:
        """Refresh conflict status for a merge request.

        Args:
            mr_id: Merge request ID

        Returns:
            Updated MergeRequest or None
        """
        mr = _merge_requests[self.project_id].get(mr_id)
        if not mr or not self.merge_service:
            return mr

        try:
            preview = self.merge_service.check_merge_conflicts(
                mr.source_branch, mr.target_branch
            )
            mr.conflict_status = preview.conflict_status
            mr.updated_at = datetime.utcnow()
        except Exception as e:
            logger.warning(f"Failed to refresh conflict status: {e}")

        return mr


def get_merge_service(project_path: str) -> MergeService | None:
    """Factory function to get MergeService instance.

    Args:
        project_path: Path to Git repository

    Returns:
        MergeService instance or None
    """
    from services.git_service import get_git_service

    git_service = get_git_service(project_path)
    if not git_service:
        return None

    try:
        return MergeService(git_service)
    except MergeServiceError as e:
        logger.warning(f"Could not initialize MergeService: {e}")
        return None
