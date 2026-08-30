"""Safe resolution of database-registered project filesystem targets."""

from pathlib import Path

from models.project import Project

# ``Path.resolve()`` reports a symlink loop as ``RuntimeError``, not ``OSError``
# (measured on CPython 3.11, for both ``strict`` values). Catching only
# ``OSError`` would let that escape and turn an unusable path into a 500
# instead of a closed door.
_UNRESOLVABLE = (OSError, RuntimeError)


def resolve_registered_root(path: str | None) -> Path | None:
    """Return the canonical registered directory, or ``None`` if unusable."""
    raw_path = str(path or "").strip()
    if not raw_path:
        return None
    try:
        root = Path(raw_path).resolve(strict=True)
    except _UNRESOLVABLE:
        return None
    return root if root.is_dir() else None


def safe_project_child(
    project_root: str | Path,
    *parts: str,
    strict: bool = False,
) -> Path | None:
    """Resolve a project child while rejecting symlink escapes.

    The DB-registered root is the trust boundary. A child may be a symlink only
    when its resolved target remains inside that root. ``strict=False`` is used
    for files that may be created by a self-healing action.
    """
    root = resolve_registered_root(str(project_root))
    if root is None:
        return None
    try:
        resolved = root.joinpath(*parts).resolve(strict=strict)
    except _UNRESOLVABLE:
        return None
    if resolved != root and root not in resolved.parents:
        return None
    return resolved


def build_registered_project(row) -> Project | None:
    """Build a Project from DB fields without trusting filesystem metadata.

    `.aos-project.json` is not an authority for DB identity, organization, or
    Git location. DB projects have no separate git_path column, so diagnostics
    inspect only the registered project root.
    """
    root = resolve_registered_root(getattr(row, "path", None))
    if root is None:
        return None

    claude_md = None
    claude_path = safe_project_child(root, "CLAUDE.md", strict=True)
    if claude_path is not None and claude_path.is_file():
        try:
            claude_md = claude_path.read_text(encoding="utf-8")
        except (OSError, UnicodeError):
            claude_md = None

    git_dir = safe_project_child(root, ".git", strict=True)
    return Project(
        id=str(row.id),
        name=str(row.name),
        path=str(root),
        description=str(row.description or ""),
        claude_md=claude_md,
        git_path=None,
        git_enabled=git_dir is not None and git_dir.is_dir(),
        organization_id=getattr(row, "organization_id", None),
    )


async def load_registered_project(db, project_id: str) -> Project | None:
    """Load an active DB project and build its safe filesystem view."""
    from sqlalchemy import select

    from db.models import ProjectModel

    result = await db.execute(
        select(ProjectModel).where(
            ProjectModel.id == project_id,
            ProjectModel.is_active == True,  # noqa: E712
        )
    )
    row = result.scalar_one_or_none()
    return build_registered_project(row) if row is not None else None
