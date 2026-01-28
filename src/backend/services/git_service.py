"""Git service for local repository operations using GitPython."""

import logging
from datetime import datetime
from pathlib import Path
from typing import Any

try:
    from git import Repo, GitCommandError, InvalidGitRepositoryError
    from git.objects.commit import Commit
    GIT_AVAILABLE = True
except ImportError:
    GIT_AVAILABLE = False
    Repo = None
    GitCommandError = Exception
    InvalidGitRepositoryError = Exception

from models.git import (
    GitBranch,
    GitCommit,
    BranchDiff,
    CommitFile,
    FetchResult,
    PullResult,
    PushResult,
    DEFAULT_PROTECTED_BRANCHES,
    # New models for status/add/commit
    FileStatusType,
    GitStatusFile,
    GitWorkingStatus,
    AddResult,
    CommitCreateResult,
)

logger = logging.getLogger(__name__)


class GitServiceError(Exception):
    """Git service specific error."""
    pass


class GitService:
    """Service for local Git repository operations."""

    def __init__(self, project_path: str):
        """Initialize Git service for a project.

        Args:
            project_path: Path to the Git repository
        """
        if not GIT_AVAILABLE:
            raise GitServiceError("GitPython is not installed. Run: pip install gitpython")

        self.project_path = Path(project_path)
        if not self.project_path.exists():
            raise GitServiceError(f"Project path does not exist: {project_path}")

        try:
            self.repo = Repo(str(self.project_path))
        except InvalidGitRepositoryError:
            raise GitServiceError(f"Not a git repository: {project_path}")

    @property
    def is_dirty(self) -> bool:
        """Check if the working directory has uncommitted changes."""
        return self.repo.is_dirty()

    @property
    def current_branch(self) -> str:
        """Get the current branch name."""
        try:
            return self.repo.active_branch.name
        except TypeError:
            # Detached HEAD state
            return f"HEAD@{self.repo.head.commit.hexsha[:7]}"

    # =========================================================================
    # Branch Operations
    # =========================================================================

    def list_branches(
        self,
        include_remote: bool = True,
        base_branch: str = "main"
    ) -> list[GitBranch]:
        """List all branches with their status.

        Args:
            include_remote: Include remote tracking branches
            base_branch: Base branch for ahead/behind calculation

        Returns:
            List of branch information
        """
        branches: list[GitBranch] = []
        current = self.current_branch

        # Get base commit for comparison
        base_commit = None
        try:
            if base_branch in [b.name for b in self.repo.branches]:
                base_commit = self.repo.branches[base_branch].commit
        except Exception:
            pass

        # Local branches
        for branch in self.repo.branches:
            try:
                commit = branch.commit
                ahead, behind = 0, 0

                # Calculate ahead/behind if base exists
                if base_commit and branch.name != base_branch:
                    ahead, behind = self._count_ahead_behind(commit, base_commit)

                # Check tracking branch
                tracking = None
                try:
                    tracking_ref = branch.tracking_branch()
                    if tracking_ref:
                        tracking = tracking_ref.name
                except Exception:
                    pass

                branches.append(GitBranch(
                    name=branch.name,
                    is_current=(branch.name == current),
                    is_remote=False,
                    is_protected=(branch.name in DEFAULT_PROTECTED_BRANCHES),
                    commit_sha=commit.hexsha,
                    commit_message=commit.message.strip().split('\n')[0][:100],
                    commit_author=commit.author.name,
                    commit_date=datetime.fromtimestamp(commit.committed_date),
                    ahead=ahead,
                    behind=behind,
                    tracking_branch=tracking,
                ))
            except Exception as e:
                logger.warning(f"Error processing branch {branch.name}: {e}")

        # Remote branches
        if include_remote:
            for ref in self.repo.remotes.origin.refs if self.repo.remotes else []:
                try:
                    # Skip HEAD reference
                    if ref.name.endswith('/HEAD'):
                        continue

                    remote_name = ref.name.replace('origin/', '')
                    # Skip if already in local branches
                    if any(b.name == remote_name for b in branches):
                        continue

                    commit = ref.commit
                    ahead, behind = 0, 0
                    if base_commit:
                        ahead, behind = self._count_ahead_behind(commit, base_commit)

                    branches.append(GitBranch(
                        name=ref.name,
                        is_current=False,
                        is_remote=True,
                        is_protected=(remote_name in DEFAULT_PROTECTED_BRANCHES),
                        commit_sha=commit.hexsha,
                        commit_message=commit.message.strip().split('\n')[0][:100],
                        commit_author=commit.author.name,
                        commit_date=datetime.fromtimestamp(commit.committed_date),
                        ahead=ahead,
                        behind=behind,
                    ))
                except Exception as e:
                    logger.warning(f"Error processing remote ref {ref}: {e}")

        return sorted(branches, key=lambda b: (b.is_remote, b.name))

    def create_branch(
        self,
        name: str,
        start_point: str = "HEAD"
    ) -> GitBranch:
        """Create a new branch.

        Args:
            name: Branch name
            start_point: Starting commit or branch

        Returns:
            Created branch information
        """
        if name in [b.name for b in self.repo.branches]:
            raise GitServiceError(f"Branch '{name}' already exists")

        try:
            # Create branch
            new_branch = self.repo.create_head(name, start_point)
            commit = new_branch.commit

            return GitBranch(
                name=new_branch.name,
                is_current=False,
                is_remote=False,
                is_protected=False,
                commit_sha=commit.hexsha,
                commit_message=commit.message.strip().split('\n')[0][:100],
                commit_author=commit.author.name,
                commit_date=datetime.fromtimestamp(commit.committed_date),
            )
        except GitCommandError as e:
            raise GitServiceError(f"Failed to create branch: {e}")

    def delete_branch(
        self,
        name: str,
        force: bool = False
    ) -> bool:
        """Delete a branch.

        Args:
            name: Branch name to delete
            force: Force delete even if not merged

        Returns:
            True if deleted successfully
        """
        if name == self.current_branch:
            raise GitServiceError("Cannot delete the current branch")

        if name in DEFAULT_PROTECTED_BRANCHES and not force:
            raise GitServiceError(f"Cannot delete protected branch '{name}' without force flag")

        try:
            self.repo.delete_head(name, force=force)
            return True
        except GitCommandError as e:
            raise GitServiceError(f"Failed to delete branch: {e}")

    def checkout_branch(self, name: str, create: bool = False) -> GitBranch:
        """Checkout a branch.

        Args:
            name: Branch name
            create: Create if doesn't exist

        Returns:
            Checked out branch information
        """
        try:
            if create and name not in [b.name for b in self.repo.branches]:
                self.create_branch(name)

            self.repo.heads[name].checkout()
            return self.list_branches()[0]  # Return current branch
        except GitCommandError as e:
            raise GitServiceError(f"Failed to checkout branch: {e}")

    def get_branch_diff(
        self,
        branch: str,
        base: str = "main"
    ) -> BranchDiff:
        """Get diff summary between two branches.

        Args:
            branch: Branch to compare
            base: Base branch

        Returns:
            Diff summary
        """
        try:
            branch_commit = self.repo.branches[branch].commit
            base_commit = self.repo.branches[base].commit

            ahead, behind = self._count_ahead_behind(branch_commit, base_commit)

            # Get diff stats
            diff = base_commit.diff(branch_commit)
            stats = {"files": 0, "insertions": 0, "deletions": 0}

            for d in diff:
                stats["files"] += 1
                if d.diff:
                    lines = d.diff.decode('utf-8', errors='ignore').split('\n')
                    for line in lines:
                        if line.startswith('+') and not line.startswith('+++'):
                            stats["insertions"] += 1
                        elif line.startswith('-') and not line.startswith('---'):
                            stats["deletions"] += 1

            return BranchDiff(
                source_branch=branch,
                target_branch=base,
                ahead=ahead,
                behind=behind,
                files_changed=stats["files"],
                insertions=stats["insertions"],
                deletions=stats["deletions"],
            )
        except (KeyError, AttributeError) as e:
            raise GitServiceError(f"Branch not found: {e}")

    # =========================================================================
    # Commit Operations
    # =========================================================================

    def get_commits(
        self,
        branch: str | None = None,
        limit: int = 50,
        skip: int = 0
    ) -> list[GitCommit]:
        """Get commit history.

        Args:
            branch: Branch name (None for current)
            limit: Maximum number of commits
            skip: Number of commits to skip

        Returns:
            List of commits
        """
        commits: list[GitCommit] = []
        try:
            ref = branch or self.current_branch
            for commit in self.repo.iter_commits(ref, max_count=limit, skip=skip):
                commits.append(self._commit_to_model(commit))
        except GitCommandError as e:
            raise GitServiceError(f"Failed to get commits: {e}")

        return commits

    def get_commit(self, sha: str) -> GitCommit:
        """Get a specific commit.

        Args:
            sha: Commit SHA

        Returns:
            Commit information
        """
        try:
            commit = self.repo.commit(sha)
            return self._commit_to_model(commit)
        except Exception as e:
            raise GitServiceError(f"Commit not found: {e}")

    def get_commit_files(self, sha: str) -> list[CommitFile]:
        """Get files changed in a commit.

        Args:
            sha: Commit SHA

        Returns:
            List of changed files
        """
        try:
            commit = self.repo.commit(sha)
            files: list[CommitFile] = []

            parent = commit.parents[0] if commit.parents else None
            diff = parent.diff(commit) if parent else commit.diff(None)

            for d in diff:
                status = "modified"
                if d.new_file:
                    status = "added"
                elif d.deleted_file:
                    status = "deleted"
                elif d.renamed_file:
                    status = "renamed"

                additions = 0
                deletions = 0
                if d.diff:
                    lines = d.diff.decode('utf-8', errors='ignore').split('\n')
                    for line in lines:
                        if line.startswith('+') and not line.startswith('+++'):
                            additions += 1
                        elif line.startswith('-') and not line.startswith('---'):
                            deletions += 1

                files.append(CommitFile(
                    path=d.b_path or d.a_path,
                    status=status,
                    additions=additions,
                    deletions=deletions,
                    old_path=d.a_path if d.renamed_file else None,
                ))

            return files
        except Exception as e:
            raise GitServiceError(f"Failed to get commit files: {e}")

    # =========================================================================
    # Working Directory Operations (status, add, commit)
    # =========================================================================

    def status(self) -> GitWorkingStatus:
        """Get working directory status.

        Returns:
            Working directory status with staged/unstaged/untracked files
        """
        staged_files: list[GitStatusFile] = []
        unstaged_files: list[GitStatusFile] = []
        untracked_files: list[GitStatusFile] = []

        # Get staged files (index vs HEAD)
        try:
            diff_staged = self.repo.index.diff("HEAD")
            for d in diff_staged:
                status = FileStatusType.MODIFIED
                if d.new_file:
                    status = FileStatusType.ADDED
                elif d.deleted_file:
                    status = FileStatusType.DELETED
                elif d.renamed_file:
                    status = FileStatusType.RENAMED

                staged_files.append(GitStatusFile(
                    path=d.b_path or d.a_path,
                    status=status,
                    staged=True,
                    old_path=d.a_path if d.renamed_file else None,
                ))
        except Exception as e:
            # Empty repo or other error
            logger.debug(f"Error getting staged files: {e}")

        # Get unstaged files (working tree vs index)
        try:
            diff_unstaged = self.repo.index.diff(None)
            for d in diff_unstaged:
                status = FileStatusType.MODIFIED
                if d.deleted_file:
                    status = FileStatusType.DELETED

                unstaged_files.append(GitStatusFile(
                    path=d.b_path or d.a_path,
                    status=status,
                    staged=False,
                ))
        except Exception as e:
            logger.debug(f"Error getting unstaged files: {e}")

        # Get untracked files
        try:
            for path in self.repo.untracked_files:
                untracked_files.append(GitStatusFile(
                    path=path,
                    status=FileStatusType.UNTRACKED,
                    staged=False,
                ))
        except Exception as e:
            logger.debug(f"Error getting untracked files: {e}")

        total = len(staged_files) + len(unstaged_files) + len(untracked_files)
        is_clean = total == 0

        return GitWorkingStatus(
            branch=self.current_branch,
            is_clean=is_clean,
            staged_files=staged_files,
            unstaged_files=unstaged_files,
            untracked_files=untracked_files,
            total_changes=total,
        )

    def add(
        self,
        paths: list[str] | None = None,
        all: bool = False
    ) -> AddResult:
        """Stage files for commit.

        Args:
            paths: List of file paths to stage. None or empty means current directory.
            all: If True, stage all changes including deletions (git add -A)

        Returns:
            Result of add operation
        """
        try:
            staged_files: list[str] = []

            if all:
                # git add -A (all changes including deletions)
                self.repo.git.add(A=True)
                # Get list of staged files
                status = self.status()
                staged_files = [f.path for f in status.staged_files]
            elif paths and len(paths) > 0:
                # Add specific paths
                for path in paths:
                    self.repo.index.add([path])
                    staged_files.append(path)
            else:
                # git add . (current directory)
                self.repo.git.add(".")
                status = self.status()
                staged_files = [f.path for f in status.staged_files]

            return AddResult(
                success=True,
                staged_files=staged_files,
                message=f"Staged {len(staged_files)} file(s)",
            )
        except GitCommandError as e:
            return AddResult(
                success=False,
                message=f"Failed to stage files: {e}",
            )
        except Exception as e:
            return AddResult(
                success=False,
                message=f"Error staging files: {e}",
            )

    def commit(
        self,
        message: str,
        author_name: str | None = None,
        author_email: str | None = None
    ) -> CommitCreateResult:
        """Create a commit with staged changes.

        Args:
            message: Commit message
            author_name: Author name (optional, uses git config if not provided)
            author_email: Author email (optional, uses git config if not provided)

        Returns:
            Result of commit operation
        """
        # Check if there are staged changes
        status = self.status()
        if len(status.staged_files) == 0:
            return CommitCreateResult(
                success=False,
                message="No staged changes to commit. Use 'add' first.",
            )

        try:
            # Build author string if provided
            author = None
            if author_name and author_email:
                from git import Actor
                author = Actor(author_name, author_email)

            # Create commit
            if author:
                commit = self.repo.index.commit(message, author=author)
            else:
                commit = self.repo.index.commit(message)

            return CommitCreateResult(
                success=True,
                commit_sha=commit.hexsha,
                message=f"Created commit {commit.hexsha[:7]}",
                files_committed=len(status.staged_files),
            )
        except GitCommandError as e:
            return CommitCreateResult(
                success=False,
                message=f"Failed to create commit: {e}",
            )
        except Exception as e:
            return CommitCreateResult(
                success=False,
                message=f"Error creating commit: {e}",
            )

    # =========================================================================
    # Remote Operations
    # =========================================================================

    def fetch(self, remote: str = "origin") -> FetchResult:
        """Fetch from remote.

        Args:
            remote: Remote name

        Returns:
            Fetch result
        """
        try:
            remote_obj = self.repo.remotes[remote]
            info = remote_obj.fetch()

            return FetchResult(
                success=True,
                remote=remote,
                branches_updated=[str(i.ref) for i in info if i.flags & i.FAST_FORWARD],
                new_branches=[str(i.ref) for i in info if i.flags & i.NEW_HEAD],
                message=f"Fetched {len(info)} refs from {remote}",
            )
        except Exception as e:
            return FetchResult(
                success=False,
                remote=remote,
                message=str(e),
            )

    def pull(
        self,
        remote: str = "origin",
        branch: str | None = None
    ) -> PullResult:
        """Pull from remote.

        Args:
            remote: Remote name
            branch: Branch to pull (None for current)

        Returns:
            Pull result
        """
        branch = branch or self.current_branch
        try:
            remote_obj = self.repo.remotes[remote]

            # Get commits before pull
            before_sha = self.repo.head.commit.hexsha

            # Pull
            info = remote_obj.pull(branch)

            # Count new commits
            commits_pulled = 0
            if info:
                after_sha = self.repo.head.commit.hexsha
                if before_sha != after_sha:
                    commits = list(self.repo.iter_commits(f"{before_sha}..{after_sha}"))
                    commits_pulled = len(commits)

            return PullResult(
                success=True,
                remote=remote,
                branch=branch,
                commits_pulled=commits_pulled,
                message=f"Pulled {commits_pulled} commits",
            )
        except GitCommandError as e:
            return PullResult(
                success=False,
                remote=remote,
                branch=branch,
                message=str(e),
            )

    def push(
        self,
        remote: str = "origin",
        branch: str | None = None,
        set_upstream: bool = False
    ) -> PushResult:
        """Push to remote.

        Args:
            remote: Remote name
            branch: Branch to push (None for current)
            set_upstream: Set upstream tracking

        Returns:
            Push result
        """
        branch = branch or self.current_branch
        try:
            remote_obj = self.repo.remotes[remote]

            # Push
            if set_upstream:
                info = remote_obj.push(branch, set_upstream=True)
            else:
                info = remote_obj.push(branch)

            # Check for errors
            for push_info in info:
                if push_info.flags & push_info.ERROR:
                    return PushResult(
                        success=False,
                        remote=remote,
                        branch=branch,
                        message=push_info.summary,
                    )

            return PushResult(
                success=True,
                remote=remote,
                branch=branch,
                commits_pushed=len(info),
                message=f"Pushed to {remote}/{branch}",
            )
        except GitCommandError as e:
            return PushResult(
                success=False,
                remote=remote,
                branch=branch,
                message=str(e),
            )

    # =========================================================================
    # Helper Methods
    # =========================================================================

    def _count_ahead_behind(self, commit1: "Commit", commit2: "Commit") -> tuple[int, int]:
        """Count commits ahead and behind between two commits.

        Args:
            commit1: First commit (typically branch head)
            commit2: Second commit (typically base branch)

        Returns:
            Tuple of (ahead, behind)
        """
        try:
            # Find merge base
            merge_base = self.repo.merge_base(commit1, commit2)
            if not merge_base:
                return 0, 0

            base = merge_base[0]

            # Count commits
            ahead = len(list(self.repo.iter_commits(f"{base.hexsha}..{commit1.hexsha}")))
            behind = len(list(self.repo.iter_commits(f"{base.hexsha}..{commit2.hexsha}")))

            return ahead, behind
        except Exception:
            return 0, 0

    def _commit_to_model(self, commit: "Commit") -> GitCommit:
        """Convert GitPython commit to model.

        Args:
            commit: GitPython commit object

        Returns:
            GitCommit model
        """
        return GitCommit(
            sha=commit.hexsha,
            short_sha=commit.hexsha[:7],
            message=commit.message.strip(),
            author_name=commit.author.name,
            author_email=commit.author.email,
            authored_date=datetime.fromtimestamp(commit.authored_date),
            committer_name=commit.committer.name,
            committer_email=commit.committer.email,
            committed_date=datetime.fromtimestamp(commit.committed_date),
            parent_shas=[p.hexsha for p in commit.parents],
        )


def get_git_service(project_path: str) -> GitService | None:
    """Factory function to get GitService instance.

    Args:
        project_path: Path to Git repository

    Returns:
        GitService instance or None if not a git repo
    """
    try:
        return GitService(project_path)
    except GitServiceError as e:
        logger.warning(f"Could not initialize GitService: {e}")
        return None
