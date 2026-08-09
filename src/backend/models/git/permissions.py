"""Git 역할 권한 상수와 판정 함수."""

from .enums import GitPermission

# Role-based Git permissions
GIT_ROLE_PERMISSIONS: dict[str, list[GitPermission]] = {
    "owner": [
        GitPermission.READ,
        GitPermission.WRITE,
        GitPermission.MERGE_MAIN,
        GitPermission.ADMIN,
    ],
    "admin": [
        GitPermission.READ,
        GitPermission.WRITE,
        GitPermission.MERGE_MAIN,
    ],
    "manager": [
        GitPermission.READ,
        GitPermission.WRITE,
        GitPermission.MERGE_MAIN,
    ],
    "member": [
        GitPermission.READ,
        GitPermission.WRITE,
    ],
    "viewer": [
        GitPermission.READ,
    ],
}


# Default protected branches
DEFAULT_PROTECTED_BRANCHES = ["main", "master"]


# Branches that prune-merged must never delete, regardless of merge state
PRUNE_PROTECTED_BRANCHES: frozenset[str] = frozenset({"main", "master", "develop"})


def has_git_permission(role: str, permission: GitPermission) -> bool:
    """Check if a role has a specific Git permission."""
    permissions = GIT_ROLE_PERMISSIONS.get(role, [])
    return permission in permissions


def can_merge_to_branch(
    role: str, branch: str, protected_branches: list[str] | None = None
) -> bool:
    """Check if a role can merge to a specific branch."""
    if protected_branches is None:
        protected_branches = DEFAULT_PROTECTED_BRANCHES

    if branch in protected_branches:
        return has_git_permission(role, GitPermission.MERGE_MAIN)
    else:
        return has_git_permission(role, GitPermission.WRITE)
