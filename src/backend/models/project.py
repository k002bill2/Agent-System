"""Project model for context-aware orchestration."""

import json
import logging
import math
import os
import queue
import re
import threading
import time
from pathlib import Path

from pydantic import BaseModel, Field

logger = logging.getLogger(__name__)

# Metadata file name stored in project root
AOS_METADATA_FILE = ".aos-project.json"

# 프로젝트 id 는 `projects/<id>` 경로 세그먼트로 그대로 쓰이므로 slug 로 제한한다.
# 경로 구분자(/ \), 상위 참조(..), 절대경로, 공백을 모두 배제해 projects/ 밖 이탈을 차단.
PROJECT_ID_PATTERN = r"^[A-Za-z0-9][A-Za-z0-9_-]*$"
# 상한은 DB 컬럼 폭과 일치해야 한다 — db/models/project.py 의 ProjectModel.id = String(36).
# 더 길게 두면 검증은 통과하는데 DB insert 에서 실패해 레지스트리 불일치가 생긴다.
PROJECT_ID_MAX_LENGTH = 36


def normalize_path(path: str) -> str:
    """Normalize filesystem path by removing shell escape characters.

    When users copy paths from terminal, they may include shell escape characters
    like backslashes before spaces or special characters:
    - "Mobile\\ Documents" -> "Mobile Documents"
    - "iCloud\\~md\\~obsidian" -> "iCloud~md~obsidian"

    Args:
        path: Path string potentially containing shell escapes

    Returns:
        Normalized path without escape characters
    """
    if not path:
        return path

    # Remove backslash escapes (\ followed by space, ~, or other chars)
    # Pattern: backslash followed by a character that would be escaped in shell
    normalized = re.sub(r"\\(.)", r"\1", path)

    return normalized


class Project(BaseModel):
    """Project configuration."""

    id: str
    name: str
    path: str
    description: str = ""
    claude_md: str | None = None
    vector_store_initialized: bool = False
    indexed_at: str | None = None  # ISO timestamp of last indexing
    git_path: str | None = None  # Separate Git repository path (if different from project path)
    git_enabled: bool = False  # Whether Git is configured for this project
    sort_order: int = 0  # Display order (lower numbers first)
    organization_id: str | None = None  # Organization this project belongs to

    @classmethod
    def from_path(cls, project_id: str, project_path: str) -> "Project":
        """Create project from filesystem path."""
        path = Path(project_path)

        # Load CLAUDE.md if exists
        claude_md_path = path / "CLAUDE.md"
        claude_md = None
        if claude_md_path.exists():
            claude_md = claude_md_path.read_text(encoding="utf-8")

        # Try to get name from package.json or use folder name
        name = path.name
        description = ""
        git_path = None

        package_json = path / "package.json"
        if package_json.exists():
            try:
                pkg = json.loads(package_json.read_text())
                # Note: pkg "name" is npm package name, NOT project display name
                # Only use description as fallback
                description = pkg.get("description", "")
            except json.JSONDecodeError:
                pass

        # Load saved metadata from .aos-project.json (takes priority)
        metadata = _load_project_metadata(path)
        sort_order = 0
        organization_id = None
        if metadata:
            name = metadata.get("name", name)
            description = metadata.get("description", description)
            git_path = metadata.get("git_path")
            sort_order = metadata.get("sort_order", 0)
            organization_id = metadata.get("organization_id")

        # Determine effective Git path and check if it's a valid repo
        effective_git_path = git_path or str(path.resolve())
        git_enabled = _check_git_repository(effective_git_path)

        return cls(
            id=project_id,
            name=name,
            path=str(path.resolve()),
            description=description,
            claude_md=claude_md,
            git_path=git_path,
            git_enabled=git_enabled,
            sort_order=sort_order,
            organization_id=organization_id,
        )


class ProjectCreate(BaseModel):
    """Project registration request."""

    id: str = Field(
        ...,
        pattern=PROJECT_ID_PATTERN,
        max_length=PROJECT_ID_MAX_LENGTH,
        description="Unique project identifier (slug; used as a path segment)",
    )
    path: str = Field(..., description="Filesystem path to project")
    organization_id: str | None = Field(None, description="Organization ID")


class ProjectResponse(BaseModel):
    """Project API response."""

    id: str
    name: str
    path: str
    description: str
    has_claude_md: bool
    vector_store_initialized: bool = False
    indexed_at: str | None = None
    git_path: str | None = None
    git_enabled: bool = False
    sort_order: int = 0
    organization_id: str | None = None
    is_active: bool = True


class ProjectUpdate(BaseModel):
    """Project update request."""

    name: str | None = None
    description: str | None = None
    path: str | None = None  # 프로젝트 경로 수정
    git_path: str | None = None  # Git 저장소 경로 설정


class ProjectLinkRequest(BaseModel):
    """Request to link an external project via symlink."""

    id: str = Field(
        ...,
        pattern=PROJECT_ID_PATTERN,
        max_length=PROJECT_ID_MAX_LENGTH,
        description="Unique project identifier (slug; used as a path segment)",
    )
    source_path: str = Field(..., description="Absolute path to source project")
    # DB 모드(`USE_DATABASE=true`)에서 `ProjectModel` 행에 그대로 들어간다. 대시보드
    # 모달은 둘 다 입력받지만 파일시스템 모드는 디렉터리명·.aos-project.json 에서
    # 파생하므로 선택 필드로 둔다 — 기존 호출자(id+source_path)는 그대로 유효하다.
    name: str | None = Field(None, max_length=255, description="Display name (DB mode)")
    description: str | None = Field(None, description="Project description (DB mode)")


class ProjectCreateFromTemplate(BaseModel):
    """Request to create a new project from template."""

    id: str = Field(
        ...,
        pattern=PROJECT_ID_PATTERN,
        max_length=PROJECT_ID_MAX_LENGTH,
        description="Unique project identifier (slug; used as a path segment)",
    )
    name: str = Field(..., description="Project display name")
    description: str = ""
    template: str = Field(
        "default", description="Template name: default, react-native, python, fastapi"
    )


# ========================================
# DB-managed Project Models (for projects table)
# ========================================


class DBProjectCreate(BaseModel):
    """Request to create a DB-managed project."""

    name: str = Field(..., description="Unique project name", min_length=1, max_length=255)
    description: str | None = Field(None, description="Project description")
    path: str | None = Field(None, description="Filesystem path for config scanning")
    settings: dict | None = Field(None, description="Extra settings (JSON)")
    organization_id: str | None = Field(None, description="조직 ID (자동 감지 또는 명시)")


class DBProjectUpdate(BaseModel):
    """Request to update a DB-managed project."""

    name: str | None = Field(None, description="Project name", max_length=255)
    description: str | None = Field(None, description="Project description")
    path: str | None = Field(None, description="Filesystem path for config scanning")
    settings: dict | None = Field(None, description="Extra settings (JSON)")


class DBProjectResponse(BaseModel):
    """Response for a DB-managed project."""

    id: str
    name: str
    slug: str
    description: str | None = None
    path: str | None = None
    is_active: bool = True
    settings: dict = Field(default_factory=dict)
    organization_id: str | None = None
    created_at: str | None = None
    updated_at: str | None = None
    created_by: str | None = None


class DBProjectListResponse(BaseModel):
    """Response for projects list."""

    projects: list[DBProjectResponse]
    total_count: int


# ========================================
# Project Member Models
# ========================================


class ProjectMemberAdd(BaseModel):
    """Request to add a member to a project."""

    user_id: str = Field(..., description="User UUID to add")
    role: str = Field("viewer", description="Role: owner, editor, viewer")


class ProjectMemberUpdate(BaseModel):
    """Request to update a member's role."""

    role: str = Field(..., description="New role: owner, editor, viewer")


class ProjectMemberResponse(BaseModel):
    """Single project member response."""

    user_id: str
    role: str
    email: str | None = None
    name: str | None = None
    granted_by: str | None = None
    created_at: str | None = None


class ProjectMemberListResponse(BaseModel):
    """Response for project members list."""

    members: list[ProjectMemberResponse]
    total_count: int


class OrgMemberForProject(BaseModel):
    """조직 멤버 중 프로젝트에 추가 가능한 사람."""

    user_id: str
    email: str
    name: str | None = None
    org_role: str  # owner, admin, member, viewer


class OrgMemberListResponse(BaseModel):
    """Available org members response."""

    members: list[OrgMemberForProject]
    total_count: int


# Registry of known projects
PROJECTS_REGISTRY: dict[str, Project] = {}


def register_project(project_id: str, project_path: str) -> Project:
    """Register a project in the registry."""
    # Normalize path to remove shell escape characters
    project_path = normalize_path(project_path)
    project = Project.from_path(project_id, project_path)
    PROJECTS_REGISTRY[project_id] = project
    PROJECT_INIT_ISSUES.pop(project_id, None)
    DEFERRED_PROJECTS.pop(project_id, None)
    return project


def get_project(project_id: str) -> Project | None:
    """Get an available project from the registry.

    Deferred auto-registration placeholders retain a target path only for diagnosis.
    They must not enter terminal/MCP/RAG paths, which could touch the same unavailable
    filesystem and bypass the startup deadline.
    """
    if is_project_deferred(project_id):
        return None
    return PROJECTS_REGISTRY.get(project_id)


def list_projects() -> list[Project]:
    """List available projects, sorted by sort_order.

    Deferred placeholders stay in ``PROJECTS_REGISTRY`` for issue reporting but are
    excluded so ordinary callers cannot perform unbounded path I/O against them.
    """
    projects = [
        project
        for project_id, project in PROJECTS_REGISTRY.items()
        if not is_project_deferred(project_id)
    ]
    return sorted(projects, key=lambda p: (p.sort_order, p.name.lower()))


def unregister_project(project_id: str) -> bool:
    """Remove a project from the registry."""
    if project_id in PROJECTS_REGISTRY:
        del PROJECTS_REGISTRY[project_id]
        return True
    return False


def get_projects_dir() -> Path:
    """Get the projects directory path."""
    base_path = Path(__file__).parent.parent.parent.parent
    return base_path / "projects"


def _load_project_metadata(project_path: Path) -> dict | None:
    """Load project metadata from .aos-project.json if exists."""
    metadata_file = project_path / AOS_METADATA_FILE
    if metadata_file.exists():
        try:
            return json.loads(metadata_file.read_text(encoding="utf-8"))
        except (json.JSONDecodeError, OSError) as e:
            logger.warning(f"Failed to load project metadata from {metadata_file}: {e}")
    return None


def _save_project_metadata(
    project_path: Path,
    name: str,
    description: str,
    git_path: str | None = None,
    sort_order: int | None = None,
    organization_id: str | None = None,
) -> bool:
    """Save project metadata to .aos-project.json."""
    metadata_file = project_path / AOS_METADATA_FILE
    try:
        # Load existing metadata first to preserve other fields
        existing = _load_project_metadata(project_path) or {}
        metadata = {"name": name, "description": description}
        if git_path:
            metadata["git_path"] = git_path
        if sort_order is not None:
            metadata["sort_order"] = sort_order
        elif "sort_order" in existing:
            metadata["sort_order"] = existing["sort_order"]
        if organization_id is not None:
            metadata["organization_id"] = organization_id
        elif "organization_id" in existing:
            metadata["organization_id"] = existing["organization_id"]
        metadata_file.write_text(
            json.dumps(metadata, indent=2, ensure_ascii=False) + "\n", encoding="utf-8"
        )
        logger.info(f"Saved project metadata to {metadata_file}")
        return True
    except OSError as e:
        logger.error(f"Failed to save project metadata to {metadata_file}: {e}")
        return False


def _check_git_repository(path: str) -> bool:
    """Check if a path is a valid Git repository."""
    git_dir = Path(path) / ".git"
    return git_dir.exists() and git_dir.is_dir()


def update_project(
    project_id: str,
    name: str | None = None,
    description: str | None = None,
    path: str | None = None,
    git_path: str | None = None,
) -> Project | None:
    """Update project metadata and optionally update path/symlink."""
    import os

    project = PROJECTS_REGISTRY.get(project_id)
    if not project:
        return None

    metadata_changed = False
    if name is not None:
        project.name = name
        metadata_changed = True
    if description is not None:
        project.description = description
        metadata_changed = True
    if git_path is not None:
        # Normalize and validate git_path
        git_path = normalize_path(git_path)
        if git_path and not Path(git_path).exists():
            raise ValueError(f"Git path does not exist: {git_path}")
        project.git_path = git_path if git_path else None
        # Update git_enabled based on new path
        effective_git_path = project.git_path or project.path
        project.git_enabled = _check_git_repository(effective_git_path)
        metadata_changed = True

    # Save metadata to file for persistence
    if metadata_changed:
        _save_project_metadata(
            Path(project.path), project.name, project.description, project.git_path
        )

    # 경로 변경 처리
    if path is not None:
        # Normalize path to remove shell escape characters (e.g., "Mobile\ Documents" -> "Mobile Documents")
        path = normalize_path(path)

        if path != project.path:
            new_path = Path(path)
            if not new_path.exists():
                raise ValueError(f"Path does not exist: {path}")

            # projects/ 디렉토리의 심볼릭 링크 업데이트
            projects_dir = get_projects_dir()
            symlink_path = projects_dir / project_id

            if symlink_path.is_symlink():
                # 기존 심볼릭 링크 제거 후 새로 생성
                symlink_path.unlink()
                os.symlink(str(new_path.resolve()), str(symlink_path))
            elif symlink_path.exists():
                # 심볼릭 링크가 아닌 실제 디렉토리인 경우 (드문 케이스)
                # 경로만 업데이트하고 파일시스템은 수정하지 않음
                pass

            project.path = str(new_path.resolve())

            # CLAUDE.md 다시 로드
            claude_md_path = new_path / "CLAUDE.md"
            if claude_md_path.exists():
                project.claude_md = claude_md_path.read_text(encoding="utf-8")
            else:
                project.claude_md = None

    return project


def set_project_git_path(project: Project, git_path: str | None) -> Project:
    """Set a project's Git repository path and persist it to `.aos-project.json`.

    `update_project` 는 `PROJECTS_REGISTRY` 엔트리에만 동작한다 — DB 모드의 프로젝트는
    레지스트리에 없으므로 id 가 아니라 `Project` 객체를 직접 받는다. 저장 대상은
    `update_project` 와 같은 메타데이터 파일이고 읽기도 `Project.from_path` 가 같은
    파일을 보므로, 두 모드가 같은 위치를 쓴다.

    Raises:
        ValueError: `git_path` 가 존재하지 않는 경로일 때.
    """
    if git_path:
        git_path = normalize_path(git_path)
        if not Path(git_path).exists():
            raise ValueError(f"Git path does not exist: {git_path}")

    project.git_path = git_path or None
    project.git_enabled = _check_git_repository(project.git_path or project.path)
    _save_project_metadata(Path(project.path), project.name, project.description, project.git_path)
    return project


def update_project_sort_order(project_id: str, sort_order: int) -> Project | None:
    """Update a project's sort order."""
    project = PROJECTS_REGISTRY.get(project_id)
    if not project:
        return None

    project.sort_order = sort_order

    # Save to metadata file
    _save_project_metadata(
        Path(project.path), project.name, project.description, project.git_path, sort_order
    )

    return project


def reorder_projects(project_ids: list[str]) -> list[Project]:
    """
    Reorder all projects based on the provided list of IDs.

    Args:
        project_ids: List of project IDs in the desired order

    Returns:
        List of updated projects in the new order
    """
    updated_projects = []

    for index, project_id in enumerate(project_ids):
        project = update_project_sort_order(project_id, index)
        if project:
            updated_projects.append(project)

    return updated_projects


# ========================================
# Auto-registration from projects/ directory
# ========================================

# 항목 하나가 자동 등록에서 점유할 수 있는 최대 시간(초).
# projects/ 링크의 대상은 iCloud 같은 네트워크 백업 저장소일 수 있고, 그런 경로의
# stat/read 는 materialize 를 유발해 수 분 걸린다. init_projects 는 FastAPI lifespan
# 에서 동기 호출되므로 상한이 없으면 그 시간만큼 readiness 가 통째로 막힌다 (issue #410).
DEFAULT_PROJECT_INIT_TIMEOUT = 2.0

# 대상 파일시스템이 무응답이면 Python에서 I/O 스레드를 강제 취소할 수 없다. 따라서
# 자동 등록 워커 수 자체를 제한해, 느린 링크가 많아도 남는 daemon이 무한히 쌓이지 않게 한다.
MAX_PROJECT_INIT_WORKERS = 4
PROJECT_INIT_WORKER_SLOTS = threading.BoundedSemaphore(MAX_PROJECT_INIT_WORKERS)
PROJECT_INIT_WORKER_RELEASED = threading.Semaphore(0)
PROJECT_INIT_RETRY_LOCK = threading.Lock()

# 자동 등록에서 정상 처리되지 못한 항목: project_id -> "deferred" | "pending" | "unavailable"
# - deferred:    링크는 있는데 대상이 느려 데드라인을 넘김. 대상 경로는 진단 전용
#                DEFERRED_PROJECTS 에 두고 운영 레지스트리에는 넣지 않는다.
# - unavailable: 대상이 없거나 접근에서 예외. 등록하지 않는다.
PROJECT_INIT_ISSUES: dict[str, str] = {}
DEFERRED_PROJECTS: dict[str, Project] = {}


def get_project_init_issues() -> dict[str, str]:
    """Return a copy of the deferred/unavailable state from the last auto-registration."""
    return dict(PROJECT_INIT_ISSUES)


def is_project_deferred(project_id: str) -> bool:
    """True if the project is registered as a placeholder whose target never responded."""
    return PROJECT_INIT_ISSUES.get(project_id) == "deferred"


def _load_project_entry(item: Path) -> Project | None:
    """Build a Project from one `projects/` entry (all blocking filesystem work).

    자동 등록에서 대상 파일시스템을 건드리는 부분은 전부 여기 모여 있다 —
    `init_projects` 가 이 함수만 데드라인 안에서 돌리면 되도록.

    Returns:
        Project, 또는 대상이 디렉터리가 아니면 None.
    """
    real_path = item.resolve() if item.is_symlink() else item
    if not real_path.is_dir():
        return None
    return Project.from_path(item.name, normalize_path(str(real_path)))


def _project_init_timeout(entry_timeout: float | None) -> float:
    """Return a finite, positive auto-registration budget from arg/env/default."""
    if entry_timeout is None:
        try:
            entry_timeout = float(
                os.getenv("PROJECT_INIT_TIMEOUT_SECONDS", str(DEFAULT_PROJECT_INIT_TIMEOUT))
            )
        except ValueError:
            entry_timeout = DEFAULT_PROJECT_INIT_TIMEOUT

    if not math.isfinite(entry_timeout) or entry_timeout <= 0:
        return DEFAULT_PROJECT_INIT_TIMEOUT
    return entry_timeout


def _schedule_project_init_retry(
    root: Path, entry_timeout: float, wait_for_worker_release: bool
) -> None:
    """Retry queued entries once a bounded worker becomes available.

    A hung syscall cannot be cancelled. If all workers are occupied, retain at most
    one daemon scheduler rather than creating another worker per project; it retries
    discovery when one of the existing workers eventually returns.
    """
    if not PROJECT_INIT_RETRY_LOCK.acquire(blocking=False):
        return

    def _retry() -> None:
        try:
            if wait_for_worker_release:
                PROJECT_INIT_WORKER_RELEASED.acquire()
            init_projects(str(root), entry_timeout=entry_timeout)
        finally:
            PROJECT_INIT_RETRY_LOCK.release()

    threading.Thread(target=_retry, name="aos-project-init-retry", daemon=True).start()


def _deferred_project(item: Path, is_symlink: bool) -> Project:
    """Placeholder for an entry whose target never answered within the deadline.

    대상 파일시스템에는 접근하지 않는다 — `os.readlink` 는 링크 자신의 메타데이터만
    읽으므로 느린 대상에서도 즉시 반환한다. 그래서 이름/설명/CLAUDE.md 는 비어 있고
    `git_enabled` 는 False 다.
    """
    target = str(item)
    if is_symlink:
        try:
            raw = os.readlink(item)
            target = raw if os.path.isabs(raw) else str(item.parent / raw)
        except OSError:
            pass
    return Project(id=item.name, name=item.name, path=target, git_enabled=False)


def init_projects(base_path: str | None = None, entry_timeout: float | None = None) -> None:
    """Initialize projects from the `projects/` directory.

    Only symlinks are registered as projects. Regular directories
    (e.g. e2e test artifacts) are ignored.

    `projects/` 의 **최상위 항목만** 훑는다. `projects/agent-orchestration` 처럼
    저장소 루트를 도로 가리키는 자기참조 링크가 있어도 하위로 내려가지 않는다.

    전체 작업 시간을 `entry_timeout` 으로 제한하고, 예외는 항목 단위로 잡는다.
    느리거나 사라진 대상 하나, 또는 많은 느린 대상이 기동을 막거나 lifespan 을
    죽이지 못하게 하기 위함이다.

    Args:
        base_path: Agent System 루트. None 이면 이 파일 기준으로 추론.
        entry_timeout: 전체 자동 등록 상한(초). None 이면
            `PROJECT_INIT_TIMEOUT_SECONDS` 환경변수, 그것도 없으면
            `DEFAULT_PROJECT_INIT_TIMEOUT`.
    """
    root = Path(base_path) if base_path is not None else Path(__file__).parent.parent.parent.parent

    entry_timeout = _project_init_timeout(entry_timeout)

    projects_dir = root / "projects"
    if not projects_dir.exists():
        return

    try:
        entries = list(projects_dir.iterdir())
    except OSError as exc:
        # lifespan 은 이 호출을 감싸지 않는다 — 여기서 새면 기동이 통째로 실패한다.
        logger.warning("project_discovery_failed: %s (%s)", projects_dir, exc)
        return

    candidates: list[tuple[Path, bool]] = []
    for item in entries:
        is_symlink = item.is_symlink()
        # Regular entries can themselves be on a stalled mount. Do not call
        # `is_dir()` here: all target probing belongs inside the bounded worker.
        if not item.name.startswith("test-"):
            candidates.append((item, is_symlink))

    deadline = time.monotonic() + entry_timeout
    work: queue.Queue[Path] = queue.Queue()
    for item, _ in candidates:
        work.put(item)

    results: dict[str, tuple[Project | None, BaseException | None]] = {}
    attempted: set[str] = set()
    results_lock = threading.Lock()
    result_available = threading.Event()

    def _worker() -> None:
        try:
            while time.monotonic() < deadline:
                try:
                    item = work.get_nowait()
                except queue.Empty:
                    return

                with results_lock:
                    attempted.add(item.name)

                try:
                    project = _load_project_entry(item)
                    error: BaseException | None = None
                except BaseException as exc:  # noqa: BLE001 - report per-entry failure
                    project = None
                    error = exc

                with results_lock:
                    results[item.name] = (project, error)
                result_available.set()
        finally:
            PROJECT_INIT_WORKER_SLOTS.release()
            PROJECT_INIT_WORKER_RELEASED.release()

    workers = []
    for _ in range(min(MAX_PROJECT_INIT_WORKERS, len(candidates))):
        if not PROJECT_INIT_WORKER_SLOTS.acquire(blocking=False):
            break
        workers.append(threading.Thread(target=_worker, name="aos-project-init", daemon=True))

    # 다른 초기화 시도에서 이미 제한된 모든 워커를 점유 중이면 이번 스캔은 상태를
    # 바꾸지 않는다. 응답하지 않은 것으로 오인해 정상 프로젝트를 숨기지 않고,
    # 먼저 시작된 bounded 작업이 끝난 뒤 다음 재시도에서 다시 검사한다.
    if candidates and not workers:
        logger.warning(
            "project_discovery_skipped: all %s bounded workers are occupied",
            MAX_PROJECT_INIT_WORKERS,
        )
        return

    for worker in workers:
        worker.start()

    while time.monotonic() < deadline:
        with results_lock:
            if len(results) == len(candidates):
                break
        result_available.wait(timeout=max(0.0, deadline - time.monotonic()))
        result_available.clear()

    with results_lock:
        completed_results = dict(results)
        attempted_names = set(attempted)

    retry_needed = False
    for item, is_symlink in candidates:
        result = completed_results.get(item.name)
        if result is None:
            PROJECTS_REGISTRY.pop(item.name, None)
            if item.name in attempted_names:
                PROJECT_INIT_ISSUES[item.name] = "deferred"
                DEFERRED_PROJECTS[item.name] = _deferred_project(item, is_symlink)
                retry_needed = True
                logger.warning(
                    "project_registration_deferred: %s did not respond within the %.1fs "
                    "startup discovery budget",
                    item.name,
                    entry_timeout,
                )
            else:
                PROJECT_INIT_ISSUES[item.name] = "pending"
                DEFERRED_PROJECTS.pop(item.name, None)
                retry_needed = True
                logger.warning(
                    "project_registration_pending: %s was not assigned a bounded worker; "
                    "will retry when a worker returns",
                    item.name,
                )
            continue

        project, error = result

        if error is not None or project is None:
            # Non-directory regular entries are not projects and retain the prior
            # behavior of being ignored. Symlinks remain reportable diagnostics.
            if not is_symlink and project is None:
                continue
            PROJECT_INIT_ISSUES[item.name] = "unavailable"
            PROJECTS_REGISTRY.pop(item.name, None)
            DEFERRED_PROJECTS.pop(item.name, None)
            logger.warning(
                "project_registration_unavailable: %s (%s)",
                item.name,
                error if error is not None else "target is not a directory",
            )
            continue

        PROJECT_INIT_ISSUES.pop(item.name, None)
        DEFERRED_PROJECTS.pop(item.name, None)
        PROJECTS_REGISTRY[item.name] = project

    if retry_needed:
        _schedule_project_init_retry(
            root,
            entry_timeout,
            wait_for_worker_release=any(worker.is_alive() for worker in workers),
        )
