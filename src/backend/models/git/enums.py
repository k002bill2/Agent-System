"""Git 도메인 열거형."""

from enum import Enum


class MergeRequestStatus(str, Enum):
    """Status of a merge request."""

    DRAFT = "draft"
    OPEN = "open"
    MERGED = "merged"
    CLOSED = "closed"


class ConflictStatus(str, Enum):
    """Status of merge conflict detection."""

    UNKNOWN = "unknown"
    NO_CONFLICTS = "no_conflicts"
    HAS_CONFLICTS = "has_conflicts"


class ConflictType(str, Enum):
    """Type of file conflict."""

    BOTH_MODIFIED = "both_modified"
    DELETED_BY_US = "deleted_by_us"
    DELETED_BY_THEM = "deleted_by_them"
    BOTH_ADDED = "both_added"
    RENAMED_MODIFIED = "renamed_modified"


class ResolutionStrategy(str, Enum):
    """Strategy for resolving merge conflicts."""

    OURS = "ours"  # Keep target branch version
    THEIRS = "theirs"  # Keep source branch version
    CUSTOM = "custom"  # User provides resolved content


class GitPermission(str, Enum):
    """Git-related permissions."""

    READ = "read"
    WRITE = "write"
    MERGE_MAIN = "merge_main"
    ADMIN = "admin"


class FileStatusType(str, Enum):
    """Type of file status in working directory."""

    MODIFIED = "modified"
    ADDED = "added"
    DELETED = "deleted"
    RENAMED = "renamed"
    UNTRACKED = "untracked"
    STAGED = "staged"
