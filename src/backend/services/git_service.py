"""Git service for local repository operations using GitPython."""

import logging
from datetime import datetime
from pathlib import Path

try:
    from git import GitCommandError, InvalidGitRepositoryError, Repo
    from git.objects.commit import Commit

    GIT_AVAILABLE = True
except ImportError:
    GIT_AVAILABLE = False
    Repo = None
    GitCommandError = Exception
    InvalidGitRepositoryError = Exception

from models.git import (
    DEFAULT_PROTECTED_BRANCHES,
    AddResult,
    BranchDiff,
    CommitCreateResult,
    CommitFile,
    DiffHunk,
    FetchResult,
    FileDiffResponse,
    FileHunksResponse,
    # New models for status/add/commit
    FileStatusType,
    GitBranch,
    GitCommit,
    GitStatusFile,
    GitWorkingStatus,
    PullResult,
    PushResult,
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
        self, include_remote: bool = True, base_branch: str = "main"
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

                branches.append(
                    GitBranch(
                        name=branch.name,
                        is_current=(branch.name == current),
                        is_remote=False,
                        is_protected=(branch.name in DEFAULT_PROTECTED_BRANCHES),
                        commit_sha=commit.hexsha,
                        commit_message=commit.message.strip().split("\n")[0][:100],
                        commit_author=commit.author.name,
                        commit_date=datetime.fromtimestamp(commit.committed_date),
                        ahead=ahead,
                        behind=behind,
                        tracking_branch=tracking,
                    )
                )
            except Exception as e:
                logger.warning(f"Error processing branch {branch.name}: {e}")

        # Remote branches
        if include_remote:
            for ref in self.repo.remotes.origin.refs if self.repo.remotes else []:
                try:
                    # Skip HEAD reference
                    if ref.name.endswith("/HEAD"):
                        continue

                    remote_name = ref.name.replace("origin/", "")
                    # Skip if already in local branches
                    if any(b.name == remote_name for b in branches):
                        continue

                    commit = ref.commit
                    ahead, behind = 0, 0
                    if base_commit:
                        ahead, behind = self._count_ahead_behind(commit, base_commit)

                    branches.append(
                        GitBranch(
                            name=ref.name,
                            is_current=False,
                            is_remote=True,
                            is_protected=(remote_name in DEFAULT_PROTECTED_BRANCHES),
                            commit_sha=commit.hexsha,
                            commit_message=commit.message.strip().split("\n")[0][:100],
                            commit_author=commit.author.name,
                            commit_date=datetime.fromtimestamp(commit.committed_date),
                            ahead=ahead,
                            behind=behind,
                        )
                    )
                except Exception as e:
                    logger.warning(f"Error processing remote ref {ref}: {e}")

        return sorted(branches, key=lambda b: (b.is_remote, b.name))

    def create_branch(self, name: str, start_point: str = "HEAD") -> GitBranch:
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
                commit_message=commit.message.strip().split("\n")[0][:100],
                commit_author=commit.author.name,
                commit_date=datetime.fromtimestamp(commit.committed_date),
            )
        except GitCommandError as e:
            raise GitServiceError(f"Failed to create branch: {e}")

    def delete_branch(self, name: str, force: bool = False, delete_remote: bool = False) -> bool:
        """Delete a branch (local and optionally remote).

        Args:
            name: Branch name to delete
            force: Force delete even if not merged
            delete_remote: Also delete the branch from the remote

        Returns:
            True if deleted successfully
        """
        if name == self.current_branch:
            raise GitServiceError("Cannot delete the current branch")

        if name in DEFAULT_PROTECTED_BRANCHES and not force:
            raise GitServiceError(f"Cannot delete protected branch '{name}' without force flag")

        try:
            # Check if this is a remote-only branch (e.g. "origin/feature")
            is_remote_ref = "/" in name and any(
                name.startswith(r.name + "/") for r in self.repo.remotes
            )

            if is_remote_ref:
                # Parse remote name and branch name
                parts = name.split("/", 1)
                remote_name, remote_branch = parts[0], parts[1]
                try:
                    remote_obj = self.repo.remotes[remote_name]
                    remote_obj.push(refspec=f":refs/heads/{remote_branch}")
                except GitCommandError:
                    # Remote branch may already be deleted; prune stale ref
                    pass
                finally:
                    # Always prune to clean up stale remote-tracking refs
                    try:
                        self.repo.remotes[remote_name].fetch(prune=True)
                    except GitCommandError:
                        pass
            else:
                # Delete local branch
                self.repo.delete_head(name, force=force)

                # Optionally delete remote tracking branch
                if delete_remote:
                    self._delete_remote_tracking_branch(name)

            return True
        except GitServiceError:
            raise
        except GitCommandError as e:
            raise GitServiceError(f"Failed to delete branch: {e}")

    def _delete_remote_tracking_branch(self, branch_name: str) -> None:
        """Delete the remote tracking branch for a local branch.

        Args:
            branch_name: Local branch name
        """
        # Find which remote tracks this branch
        for remote in self.repo.remotes:
            remote_ref = f"{remote.name}/{branch_name}"
            refs = [ref.name for ref in remote.refs]
            if remote_ref in refs:
                try:
                    remote.push(refspec=f":refs/heads/{branch_name}")
                except GitCommandError:
                    # Remote branch may already be deleted; prune stale ref
                    try:
                        remote.fetch(prune=True)
                    except GitCommandError as prune_err:
                        raise GitServiceError(
                            f"Failed to clean up stale remote ref '{remote_ref}': {prune_err}"
                        )

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

    def get_branch_diff(self, branch: str, base: str = "main") -> BranchDiff:
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
                    lines = d.diff.decode("utf-8", errors="ignore").split("\n")
                    for line in lines:
                        if line.startswith("+") and not line.startswith("+++"):
                            stats["insertions"] += 1
                        elif line.startswith("-") and not line.startswith("---"):
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
        self, branch: str | None = None, limit: int = 50, skip: int = 0
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
                    lines = d.diff.decode("utf-8", errors="ignore").split("\n")
                    for line in lines:
                        if line.startswith("+") and not line.startswith("+++"):
                            additions += 1
                        elif line.startswith("-") and not line.startswith("---"):
                            deletions += 1

                files.append(
                    CommitFile(
                        path=d.b_path or d.a_path,
                        status=status,
                        additions=additions,
                        deletions=deletions,
                        old_path=d.a_path if d.renamed_file else None,
                    )
                )

            return files
        except Exception as e:
            raise GitServiceError(f"Failed to get commit files: {e}")

    def get_commit_diff(self, sha: str, file_path: str | None = None) -> str:
        """Get diff for a commit, optionally filtered by file path.

        Args:
            sha: Commit SHA
            file_path: Optional file path to filter diff

        Returns:
            Unified diff string
        """
        try:
            commit = self.repo.commit(sha)
            parent = commit.parents[0] if commit.parents else None
            diff = (
                parent.diff(commit, create_patch=True)
                if parent
                else commit.diff(None, create_patch=True)
            )

            result_lines: list[str] = []
            for d in diff:
                current_path = d.b_path or d.a_path
                if file_path and current_path != file_path:
                    continue
                if d.diff:
                    diff_text = d.diff.decode("utf-8", errors="ignore")
                    # Add file header
                    result_lines.append(f"diff --git a/{d.a_path or current_path} b/{current_path}")
                    if d.new_file:
                        result_lines.append("new file")
                    elif d.deleted_file:
                        result_lines.append("deleted file")
                    elif d.renamed_file:
                        result_lines.append(f"rename from {d.a_path}")
                        result_lines.append(f"rename to {d.b_path}")
                    result_lines.append(f"--- a/{d.a_path or '/dev/null'}")
                    result_lines.append(f"+++ b/{current_path or '/dev/null'}")
                    result_lines.append(diff_text)
                    result_lines.append("")

            return "\n".join(result_lines)
        except Exception as e:
            raise GitServiceError(f"Failed to get commit diff: {e}")

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

                staged_files.append(
                    GitStatusFile(
                        path=d.b_path or d.a_path,
                        status=status,
                        staged=True,
                        old_path=d.a_path if d.renamed_file else None,
                    )
                )
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

                unstaged_files.append(
                    GitStatusFile(
                        path=d.b_path or d.a_path,
                        status=status,
                        staged=False,
                    )
                )
        except Exception as e:
            logger.debug(f"Error getting unstaged files: {e}")

        # Get untracked files
        try:
            for path in self.repo.untracked_files:
                untracked_files.append(
                    GitStatusFile(
                        path=path,
                        status=FileStatusType.UNTRACKED,
                        staged=False,
                    )
                )
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

    def add(self, paths: list[str] | None = None, all: bool = False) -> AddResult:
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
        self, message: str, author_name: str | None = None, author_email: str | None = None
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
    # Staging Area Enhancement Operations
    # =========================================================================

    def unstage(self, paths: list[str] | None = None, all: bool = False) -> AddResult:
        """Unstage files (git reset HEAD).

        Args:
            paths: List of file paths to unstage. None means unstage all.
            all: If True, unstage all staged files.

        Returns:
            Result of unstage operation
        """
        try:
            unstaged_files: list[str] = []

            if all or not paths:
                # git reset HEAD (unstage all)
                self.repo.git.reset("HEAD")
                unstaged_files = [f.path for f in self.status().unstaged_files]
            else:
                # Unstage specific paths
                for path in paths:
                    self.repo.git.reset("HEAD", "--", path)
                    unstaged_files.append(path)

            return AddResult(
                success=True,
                staged_files=unstaged_files,
                message=f"Unstaged {len(unstaged_files)} file(s)",
            )
        except GitCommandError as e:
            return AddResult(
                success=False,
                message=f"Failed to unstage files: {e}",
            )
        except Exception as e:
            return AddResult(
                success=False,
                message=f"Error unstaging files: {e}",
            )

    def get_file_diff(self, file_path: str, staged: bool = False) -> FileDiffResponse:
        """Get diff for a single file.

        Args:
            file_path: Path to the file (relative to repo root)
            staged: If True, get staged diff. Otherwise get unstaged diff.

        Returns:
            FileDiffResponse with diff content
        """
        try:
            diff_text = ""

            if staged:
                diff_text = self.repo.git.diff("--staged", "--unified=3", "--", file_path)
            else:
                # Check if file is untracked
                if file_path in self.repo.untracked_files:
                    full_path = self.project_path / file_path
                    if full_path.exists() and full_path.is_file():
                        content = full_path.read_text(errors="ignore")
                        lines = content.split("\n")[:500]
                        diff_text = (
                            f"--- /dev/null\n+++ b/{file_path}\n@@ -0,0 +1,{len(lines)} @@\n"
                        )
                        diff_text += "\n".join(f"+{line}" for line in lines)
                else:
                    diff_text = self.repo.git.diff("--unified=3", "--", file_path)

            return FileDiffResponse(
                file_path=file_path,
                diff=diff_text,
                staged=staged,
            )
        except GitCommandError as e:
            raise GitServiceError(f"Failed to get file diff: {e}")

    def get_file_hunks(self, file_path: str, staged: bool = False) -> FileHunksResponse:
        """Get diff hunks for a single file.

        Args:
            file_path: Path to the file (relative to repo root)
            staged: If True, get staged hunks. Otherwise get unstaged hunks.

        Returns:
            FileHunksResponse with parsed hunks
        """
        try:
            if staged:
                diff_text = self.repo.git.diff("--staged", "--unified=3", "--", file_path)
            else:
                diff_text = self.repo.git.diff("--unified=3", "--", file_path)

            hunks = self._parse_hunks(diff_text)

            return FileHunksResponse(
                file_path=file_path,
                hunks=hunks,
                total_hunks=len(hunks),
            )
        except GitCommandError as e:
            raise GitServiceError(f"Failed to get file hunks: {e}")

    def stage_hunks(self, file_path: str, hunk_indices: list[int]) -> AddResult:
        """Stage specific hunks of a file.

        Args:
            file_path: Path to the file
            hunk_indices: Indices of hunks to stage

        Returns:
            Result of staging operation
        """
        import subprocess
        import tempfile

        try:
            # Get full diff for the file
            diff_text = self.repo.git.diff("--unified=3", "--", file_path)
            all_hunks = self._parse_hunks(diff_text)

            if not all_hunks:
                return AddResult(
                    success=False,
                    message="No hunks found for this file",
                )

            # Validate indices
            valid_indices = [i for i in hunk_indices if 0 <= i < len(all_hunks)]
            if not valid_indices:
                return AddResult(
                    success=False,
                    message="No valid hunk indices provided",
                )

            # Build partial patch
            patch = self._build_partial_patch(file_path, diff_text, all_hunks, valid_indices)

            # Apply patch to index using git apply --cached
            with tempfile.NamedTemporaryFile(
                mode="w", suffix=".patch", delete=False, dir=str(self.project_path)
            ) as f:
                f.write(patch)
                patch_path = f.name

            try:
                subprocess.run(
                    ["git", "apply", "--cached", patch_path],
                    cwd=str(self.project_path),
                    capture_output=True,
                    text=True,
                    check=True,
                )
            finally:
                Path(patch_path).unlink(missing_ok=True)

            return AddResult(
                success=True,
                staged_files=[file_path],
                message=f"Staged {len(valid_indices)} hunk(s) from {file_path}",
            )
        except subprocess.CalledProcessError as e:
            return AddResult(
                success=False,
                message=f"Failed to apply patch: {e.stderr or e.stdout or str(e)}",
            )
        except Exception as e:
            return AddResult(
                success=False,
                message=f"Error staging hunks: {e}",
            )

    def _parse_hunks(self, diff_text: str) -> list[DiffHunk]:
        """Parse diff text into hunks.

        Args:
            diff_text: Unified diff text

        Returns:
            List of DiffHunk objects
        """
        import re

        hunks: list[DiffHunk] = []
        lines = diff_text.split("\n")
        current_content_lines: list[str] = []
        current_header = ""
        hunk_index = 0

        for line in lines:
            hunk_match = re.match(r"^@@ -(\d+),?(\d*) \+(\d+),?(\d*) @@(.*)$", line)
            if hunk_match:
                # Save previous hunk
                if current_header:
                    hunks.append(
                        DiffHunk(
                            index=hunk_index,
                            header=current_header,
                            content="\n".join(current_content_lines),
                            old_start=int(re.match(r"@@ -(\d+)", current_header).group(1)),
                            old_count=int(
                                re.match(r"@@ -\d+,?(\d*)", current_header).group(1) or "1"
                            ),
                            new_start=int(
                                re.match(r"@@ -\d+,?\d* \+(\d+)", current_header).group(1)
                            ),
                            new_count=int(
                                re.match(r"@@ -\d+,?\d* \+\d+,?(\d*)", current_header).group(1)
                                or "1"
                            ),
                        )
                    )
                    hunk_index += 1

                current_header = line
                current_content_lines = []
            elif current_header and (
                line.startswith("+") or line.startswith("-") or line.startswith(" ")
            ):
                current_content_lines.append(line)

        # Save last hunk
        if current_header:
            import re as re_mod

            hunks.append(
                DiffHunk(
                    index=hunk_index,
                    header=current_header,
                    content="\n".join(current_content_lines),
                    old_start=int(re_mod.match(r"@@ -(\d+)", current_header).group(1)),
                    old_count=int(re_mod.match(r"@@ -\d+,?(\d*)", current_header).group(1) or "1"),
                    new_start=int(re_mod.match(r"@@ -\d+,?\d* \+(\d+)", current_header).group(1)),
                    new_count=int(
                        re_mod.match(r"@@ -\d+,?\d* \+\d+,?(\d*)", current_header).group(1) or "1"
                    ),
                )
            )

        return hunks

    def _build_partial_patch(
        self,
        file_path: str,
        full_diff: str,
        all_hunks: list[DiffHunk],
        selected_indices: list[int],
    ) -> str:
        """Build a partial patch containing only selected hunks.

        Args:
            file_path: File path for patch header
            full_diff: Full diff text
            all_hunks: All parsed hunks
            selected_indices: Indices of hunks to include

        Returns:
            Partial patch string ready for git apply
        """
        lines = full_diff.split("\n")

        # Extract file header lines (before first hunk)
        header_lines: list[str] = []
        for line in lines:
            if line.startswith("@@"):
                break
            header_lines.append(line)

        # If no header, build one
        if not header_lines:
            header_lines = [
                f"diff --git a/{file_path} b/{file_path}",
                f"--- a/{file_path}",
                f"+++ b/{file_path}",
            ]

        # Build patch with selected hunks only
        patch_parts = header_lines[:]
        for idx in sorted(selected_indices):
            if 0 <= idx < len(all_hunks):
                hunk = all_hunks[idx]
                patch_parts.append(hunk.header)
                patch_parts.append(hunk.content)

        return "\n".join(patch_parts) + "\n"

    # =========================================================================
    # Diff Operations
    # =========================================================================

    def get_working_diff(self, staged_only: bool = False) -> str:
        """Get diff content for working directory changes.

        Args:
            staged_only: If True, only get diff for staged files. Otherwise get all changes.

        Returns:
            Unified diff string for all changes
        """
        try:
            diff_parts: list[str] = []

            if staged_only:
                # Get staged changes only (index vs HEAD)
                staged_diff = self.repo.git.diff("--staged", "--unified=3")
                if staged_diff:
                    diff_parts.append(staged_diff)
            else:
                # Get staged changes
                staged_diff = self.repo.git.diff("--staged", "--unified=3")
                if staged_diff:
                    diff_parts.append("# Staged changes:\n" + staged_diff)

                # Get unstaged changes (working tree vs index)
                unstaged_diff = self.repo.git.diff("--unified=3")
                if unstaged_diff:
                    diff_parts.append("# Unstaged changes:\n" + unstaged_diff)

                # Get untracked files content
                for path in self.repo.untracked_files:
                    try:
                        file_path = self.project_path / path
                        if file_path.exists() and file_path.is_file():
                            # Read first 500 lines max to avoid huge files
                            content = file_path.read_text(errors="ignore")
                            lines = content.split("\n")[:500]
                            diff_parts.append(
                                f"# New file: {path}\n" + "\n".join(f"+{line}" for line in lines)
                            )
                    except Exception:
                        diff_parts.append(f"# New file: {path} (binary or unreadable)")

            return "\n\n".join(diff_parts)
        except GitCommandError as e:
            raise GitServiceError(f"Failed to get diff: {e}")

    def get_changed_files_list(self, staged_only: bool = False) -> list[str]:
        """Get list of all changed file paths.

        Args:
            staged_only: If True, only return staged files.

        Returns:
            List of file paths
        """
        files: list[str] = []

        try:
            if staged_only:
                # Staged files only
                diff_staged = self.repo.index.diff("HEAD")
                for d in diff_staged:
                    files.append(d.b_path or d.a_path)
            else:
                # All changes
                # Staged
                try:
                    diff_staged = self.repo.index.diff("HEAD")
                    for d in diff_staged:
                        path = d.b_path or d.a_path
                        if path not in files:
                            files.append(path)
                except Exception:
                    pass

                # Unstaged
                try:
                    diff_unstaged = self.repo.index.diff(None)
                    for d in diff_unstaged:
                        path = d.b_path or d.a_path
                        if path not in files:
                            files.append(path)
                except Exception:
                    pass

                # Untracked
                for path in self.repo.untracked_files:
                    if path not in files:
                        files.append(path)

            return files
        except Exception as e:
            raise GitServiceError(f"Failed to get changed files: {e}")

    # =========================================================================
    # Remote Management
    # =========================================================================

    def list_remotes(self) -> list:
        """List all remotes.

        Returns:
            List of GitRemote objects
        """
        from models.git import GitRemote

        try:
            remotes = []
            for remote in self.repo.remotes:
                urls = list(remote.urls)
                remotes.append(
                    GitRemote(
                        name=remote.name,
                        url=urls[0] if urls else "",
                        fetch_url=urls[0] if urls else None,
                        push_url=remote.url
                        if hasattr(remote, "url")
                        else (urls[0] if urls else None),
                    )
                )
            return remotes
        except Exception as e:
            raise GitServiceError(f"Failed to list remotes: {e}")

    def get_remote(self, name: str):
        """Get a single remote by name.

        Args:
            name: Remote name

        Returns:
            GitRemote or None
        """
        from models.git import GitRemote

        try:
            if name not in [r.name for r in self.repo.remotes]:
                return None
            remote = self.repo.remotes[name]
            urls = list(remote.urls)
            return GitRemote(
                name=remote.name,
                url=urls[0] if urls else "",
                fetch_url=urls[0] if urls else None,
                push_url=remote.url if hasattr(remote, "url") else (urls[0] if urls else None),
            )
        except Exception as e:
            raise GitServiceError(f"Failed to get remote '{name}': {e}")

    def add_remote(self, name: str, url: str):
        """Add a new remote.

        Args:
            name: Remote name
            url: Remote URL

        Returns:
            RemoteOperationResult
        """
        from models.git import RemoteOperationResult

        try:
            if name in [r.name for r in self.repo.remotes]:
                return RemoteOperationResult(
                    success=False, message=f"Remote '{name}' already exists"
                )
            self.repo.create_remote(name, url)
            return RemoteOperationResult(
                success=True, message=f"Remote '{name}' added with URL '{url}'"
            )
        except Exception as e:
            return RemoteOperationResult(success=False, message=f"Failed to add remote: {e}")

    def remove_remote(self, name: str):
        """Remove a remote.

        Args:
            name: Remote name

        Returns:
            RemoteOperationResult
        """
        from models.git import RemoteOperationResult

        try:
            if name not in [r.name for r in self.repo.remotes]:
                return RemoteOperationResult(success=False, message=f"Remote '{name}' not found")
            self.repo.delete_remote(name)
            return RemoteOperationResult(success=True, message=f"Remote '{name}' removed")
        except Exception as e:
            return RemoteOperationResult(success=False, message=f"Failed to remove remote: {e}")

    def rename_remote(self, name: str, new_name: str):
        """Rename a remote.

        Args:
            name: Current remote name
            new_name: New remote name

        Returns:
            RemoteOperationResult
        """
        from models.git import RemoteOperationResult

        try:
            if name not in [r.name for r in self.repo.remotes]:
                return RemoteOperationResult(success=False, message=f"Remote '{name}' not found")
            remote = self.repo.remotes[name]
            remote.rename(new_name)
            return RemoteOperationResult(
                success=True, message=f"Remote '{name}' renamed to '{new_name}'"
            )
        except Exception as e:
            return RemoteOperationResult(success=False, message=f"Failed to rename remote: {e}")

    def set_remote_url(self, name: str, url: str):
        """Set URL for a remote.

        Args:
            name: Remote name
            url: New URL

        Returns:
            RemoteOperationResult
        """
        from models.git import RemoteOperationResult

        try:
            if name not in [r.name for r in self.repo.remotes]:
                return RemoteOperationResult(success=False, message=f"Remote '{name}' not found")
            remote = self.repo.remotes[name]
            remote.set_url(url)
            return RemoteOperationResult(
                success=True, message=f"Remote '{name}' URL updated to '{url}'"
            )
        except Exception as e:
            return RemoteOperationResult(success=False, message=f"Failed to set remote URL: {e}")

    # =========================================================================
    # Remote Operations
    # =========================================================================

    def fetch(self, remote: str = "origin", prune: bool = True) -> FetchResult:
        """Fetch from remote.

        Args:
            remote: Remote name
            prune: Remove stale remote-tracking refs (default True)

        Returns:
            Fetch result
        """
        try:
            remote_obj = self.repo.remotes[remote]
            info = remote_obj.fetch(prune=prune)

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

    def pull(self, remote: str = "origin", branch: str | None = None) -> PullResult:
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
        self, remote: str = "origin", branch: str | None = None, set_upstream: bool = False
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
