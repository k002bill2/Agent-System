"""RAG (Retrieval Augmented Generation) API routes."""

import logging
from datetime import UTC, datetime
from pathlib import Path

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession

from api.deps import get_current_user, get_db_session
from api.projects import authorize_db_project, authorize_db_projects
from models.project import PROJECTS_REGISTRY, Project, get_project
from services.code_entity_extractor import extract_dependencies, extract_entities
from services.rag_service import (
    QDRANT_AVAILABLE,
    QueryResult,
    get_vector_store,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/rag", tags=["RAG"])


class IndexRequest(BaseModel):
    """Request to index a project."""

    force_reindex: bool = Field(
        default=False, description="If true, clear existing index before re-indexing"
    )


class QueryRequest(BaseModel):
    """Request to query project context."""

    query: str = Field(..., description="Search query")
    k: int = Field(default=5, ge=1, le=20, description="Number of results")
    filter_priority: str | None = Field(
        default=None, description="Filter by priority ('high' or 'normal')"
    )
    include_shared: bool = Field(
        default=False,
        description="If true, also search other project collections",
    )


class CrossProjectQueryRequest(BaseModel):
    """Request to query across multiple projects."""

    query: str = Field(..., description="Search query")
    k: int = Field(default=5, ge=1, le=20, description="Number of results")
    project_ids: list[str] | None = Field(
        default=None, description="Project IDs to search (None = all indexed projects)"
    )
    exclude_project_ids: list[str] | None = Field(
        default=None, description="Project IDs to exclude from search"
    )
    filter_priority: str | None = Field(
        default=None, description="Filter by priority ('high' or 'normal')"
    )


class IndexResponse(BaseModel):
    """Response from indexing operation."""

    project_id: str
    documents_indexed: int = 0
    chunks_created: int = 0
    collection_name: str = ""
    status: str


class StatsResponse(BaseModel):
    """Statistics for a project's vector store."""

    project_id: str
    collection_name: str
    document_count: int
    indexed: bool
    status: str = "not_started"
    started_at: str | None = None
    completed_at: str | None = None
    error: str | None = None


# Per-project indexing state. Status values: not_started | indexing | completed | error.
# last_known_count holds the most recent stable chunk count so we can serve a
# stable number to the UI while a background reindex is mid-flight (the live
# Qdrant points_count fluctuates as the collection is dropped and refilled).
_indexing_state: dict[str, dict] = {}


async def _get_db_project(
    project_id: str, user: object, session: AsyncSession, min_role: str = "viewer"
) -> Project | None:
    """Resolve an access-authorized DB-registry project as the legacy RAG shape.

    인가는 `api/projects` 의 `authorize_db_project` 가 소유한다 — `GET /projects`
    와 같은 규칙을 재사용하기 위해서다. 규칙을 여기 복제하면 두 벌이 조용히
    갈라지고, 갈라진 쪽이 인가 검사라 티가 나지 않는다.
    """
    try:
        row = await authorize_db_project(project_id, user, session, min_role=min_role)
    except Exception as exc:
        logger.exception("Failed to resolve RAG project '%s' from the database", project_id)
        raise HTTPException(
            status_code=503,
            detail="Project registry is temporarily unavailable",
        ) from exc

    if not row:
        return None

    return Project(
        id=row.id,
        name=row.name,
        path=row.path or "",
        description=row.description or "",
        organization_id=row.organization_id,
    )


async def _resolve_project(
    project_id: str, user: object, session: AsyncSession, min_role: str = "viewer"
) -> Project | None:
    """Resolve legacy filesystem projects first, then DB-registry projects.

    DB 레지스트리는 `path` 가 nullable 이다. 빈 경로를 그대로 흘리면
    `Path("").resolve()` 가 **서버의 작업 디렉터리**로 해석돼 저장소 전체가 그
    프로젝트 컬렉션에 인덱싱된다. 그래서 여기서 미등록과 동일하게 취급한다.
    """
    legacy = get_project(project_id)
    if legacy:
        return legacy

    db_project = await _get_db_project(project_id, user, session, min_role=min_role)
    if db_project is None or not db_project.path.strip():
        return None
    return db_project


async def _authorized_project_ids(
    requested_ids: list[str] | None, user: object, session: AsyncSession
) -> list[str]:
    """교차 프로젝트 검색이 실제로 훑어도 되는 컬렉션 ID 만 낸다.

    레거시 filesystem 레지스트리에는 per-user ACL 이 아예 없다. 그쪽은 이 변경
    전과 같은 가시성을 유지하고(인증만 새로 요구한다), DB 레지스트리 프로젝트는
    단건 라우트와 같은 인가 규칙으로 좁힌다.
    """
    legacy_ids = set(PROJECTS_REGISTRY)
    if requested_ids is not None:
        legacy_ids &= set(requested_ids)

    try:
        db_rows = await authorize_db_projects(requested_ids, user, session)
    except Exception as exc:
        logger.exception("Failed to resolve authorized RAG projects from the database")
        raise HTTPException(
            status_code=503,
            detail="Project registry is temporarily unavailable",
        ) from exc

    return sorted(legacy_ids | {row.id for row in db_rows})


def _get_state(project_id: str) -> dict:
    """Return the indexing state record, creating a not_started default."""
    return _indexing_state.get(
        project_id,
        {
            "status": "not_started",
            "started_at": None,
            "completed_at": None,
            "last_known_count": 0,
            "error": None,
        },
    )


def _safe_count(project_id: str) -> int:
    """Best-effort live Qdrant count, swallowing transient errors."""
    if not QDRANT_AVAILABLE:
        return 0
    try:
        store = get_vector_store()
        return int(store.get_collection_stats(project_id).get("document_count", 0))
    except Exception:
        return 0


async def _do_index_project(
    project_id: str, project_path: str, force_reindex: bool = False
) -> None:
    """Execute project indexing in the background."""
    try:
        store = get_vector_store()
        result = await store.index_project(
            project_id=project_id,
            project_path=project_path,
            force_reindex=force_reindex,
        )

        prev = _get_state(project_id)
        _indexing_state[project_id] = {
            "status": "completed",
            "started_at": prev.get("started_at"),
            "completed_at": datetime.now(UTC).isoformat(),
            "last_known_count": result.chunks_created,
            "error": None,
        }

        # Update project registry to mark as indexed
        if project_id in PROJECTS_REGISTRY:
            PROJECTS_REGISTRY[project_id].vector_store_initialized = True
            PROJECTS_REGISTRY[project_id].indexed_at = datetime.now(UTC).isoformat()

        logger.info(
            "Indexing completed for project '%s': %d docs, %d chunks",
            project_id,
            result.documents_indexed,
            result.chunks_created,
        )

    except Exception as e:
        prev = _get_state(project_id)
        _indexing_state[project_id] = {
            "status": "error",
            "started_at": prev.get("started_at"),
            "completed_at": datetime.now(UTC).isoformat(),
            "last_known_count": prev.get("last_known_count", 0),
            "error": str(e),
        }
        logger.error("Indexing failed for project '%s': %s", project_id, e)


def trigger_background_indexing(
    project_id: str,
    project_path: str,
    background_tasks: BackgroundTasks,
    force_reindex: bool = False,
) -> bool:
    """Trigger background indexing for a project.

    Returns True if indexing was triggered, False if already indexing or Qdrant unavailable.
    """
    if not QDRANT_AVAILABLE:
        logger.warning("Qdrant not available, skipping indexing for '%s'", project_id)
        return False

    current = _get_state(project_id)
    if current.get("status") == "indexing":
        logger.info("Project '%s' is already being indexed, skipping", project_id)
        return False

    # Capture pre-indexing count so polling clients see the last stable value
    # while the collection is being dropped and refilled by the background task.
    last_known = current.get("last_known_count") or _safe_count(project_id)

    _indexing_state[project_id] = {
        "status": "indexing",
        "started_at": datetime.now(UTC).isoformat(),
        "completed_at": None,
        "last_known_count": last_known,
        "error": None,
    }
    background_tasks.add_task(_do_index_project, project_id, project_path, force_reindex)
    logger.info("Background indexing triggered for project '%s'", project_id)
    return True


def get_indexing_status_value(project_id: str) -> str:
    """Get the current indexing status string for a project (backward-compat helper)."""
    state = _get_state(project_id)
    if state["status"] == "error" and state.get("error"):
        return f"error: {state['error']}"
    return state["status"]


@router.post("/projects/{project_id}/index", response_model=IndexResponse)
async def index_project(
    project_id: str,
    background_tasks: BackgroundTasks,
    current_user=Depends(get_current_user),
    db: AsyncSession = Depends(get_db_session),
    request: IndexRequest | None = None,
) -> IndexResponse:
    """
    Index a project's files for RAG search.

    Indexing runs in the background. Poll GET /status/{project_id} for progress.
    """
    project = await _resolve_project(project_id, current_user, db, min_role="editor")
    if not project:
        raise HTTPException(
            status_code=404, detail=f"Project '{project_id}' not found. Register it first."
        )

    # 등록된 경로가 실제 디렉터리가 아니면 인덱싱은 조용히 0건을 넣고
    # `completed` 를 보고한다 — 성공처럼 보이는 실패라, 예약 전에 막는다.
    if not Path(project.path).is_dir():
        raise HTTPException(
            status_code=404,
            detail=f"Project '{project_id}' has no readable directory at its registered path",
        )

    force_reindex = request.force_reindex if request else False

    triggered = trigger_background_indexing(
        project_id=project.id,
        project_path=project.path,
        background_tasks=background_tasks,
        force_reindex=force_reindex,
    )

    if not triggered and _get_state(project_id).get("status") == "indexing":
        return IndexResponse(project_id=project_id, status="already_indexing")

    if not triggered:
        raise HTTPException(status_code=503, detail="Qdrant not available")

    return IndexResponse(project_id=project_id, status="indexing")


@router.post("/projects/{project_id}/query", response_model=QueryResult)
async def query_project(
    project_id: str,
    request: QueryRequest,
    current_user=Depends(get_current_user),
    db: AsyncSession = Depends(get_db_session),
) -> QueryResult:
    """
    Query project context using semantic search.

    Returns the most relevant document chunks from the project's indexed files.
    """
    # Check if project exists
    project = await _resolve_project(project_id, current_user, db)
    if not project:
        raise HTTPException(status_code=404, detail=f"Project '{project_id}' not found")

    # `include_shared` 는 서비스 계층에서 다른 컬렉션을 **전부** 훑는다. 대상을
    # 호출자의 ACL 로 좁혀 넘기지 않으면 단건 라우트의 인가가 이 플래그 하나로
    # 우회된다. 이 조회는 try 밖에 둔다 — 레지스트리 장애의 503 이 아래 catch-all
    # 에 먹히면 내부 예외 문자열이 담긴 500 으로 바뀐다.
    allowed_shared_ids = (
        await _authorized_project_ids(None, current_user, db) if request.include_shared else None
    )

    try:
        store = get_vector_store()
        result = await store.query(
            project_id=project_id,
            query=request.query,
            k=request.k,
            filter_priority=request.filter_priority,
            include_shared=request.include_shared,
            allowed_shared_project_ids=allowed_shared_ids,
        )

        return result

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Query failed: {str(e)}")


@router.get("/projects/{project_id}/stats", response_model=StatsResponse)
async def get_project_stats(
    project_id: str,
    current_user=Depends(get_current_user),
    db: AsyncSession = Depends(get_db_session),
) -> StatsResponse:
    """
    Get vector store statistics for a project.

    Returns information about the indexed documents and collection status.
    """
    # Check if project exists
    project = await _resolve_project(project_id, current_user, db)
    if not project:
        raise HTTPException(status_code=404, detail=f"Project '{project_id}' not found")

    try:
        store = get_vector_store()
        stats = store.get_collection_stats(project_id)
        state = _get_state(project_id)

        # While indexing is in flight the collection is being dropped and
        # refilled, so the live points_count fluctuates and would flash 0/partial
        # values in the UI. Pin the count to the last stable value until the
        # background task completes.
        live_count = stats["document_count"]
        if state["status"] == "indexing":
            document_count = state.get("last_known_count") or 0
            indexed = document_count > 0
        else:
            document_count = live_count
            indexed = stats["indexed"]
            # Keep last_known_count in sync with reality outside indexing.
            if state["status"] in ("not_started", "completed") and live_count > 0:
                state["last_known_count"] = live_count
                _indexing_state[project_id] = state

        return StatsResponse(
            project_id=stats["project_id"],
            collection_name=stats["collection_name"],
            document_count=document_count,
            indexed=indexed,
            status=state["status"],
            started_at=state.get("started_at"),
            completed_at=state.get("completed_at"),
            error=stats.get("error") or state.get("error"),
        )

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to get stats: {str(e)}")


@router.delete("/projects/{project_id}/index")
async def delete_project_index(
    project_id: str,
    current_user=Depends(get_current_user),
    db: AsyncSession = Depends(get_db_session),
) -> dict:
    """
    Delete all indexed data for a project.

    This removes the vector store collection and all associated embeddings.
    """
    # Check if project exists
    project = await _resolve_project(project_id, current_user, db, min_role="editor")
    if not project:
        raise HTTPException(status_code=404, detail=f"Project '{project_id}' not found")

    try:
        store = get_vector_store()
        success = await store.delete_project_index(project_id)

        if success:
            _indexing_state.pop(project_id, None)
            # Reset project registry status
            if project_id in PROJECTS_REGISTRY:
                PROJECTS_REGISTRY[project_id].vector_store_initialized = False
                PROJECTS_REGISTRY[project_id].indexed_at = None
            return {"message": f"Index deleted for project '{project_id}'"}
        else:
            return {"message": f"No index found for project '{project_id}'"}

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to delete index: {str(e)}")


@router.get("/status/{project_id}")
async def get_indexing_status(
    project_id: str,
    current_user=Depends(get_current_user),
    db: AsyncSession = Depends(get_db_session),
) -> dict:
    """Get the current indexing status for a project."""
    project = await _resolve_project(project_id, current_user, db)
    if not project:
        raise HTTPException(status_code=404, detail=f"Project '{project_id}' not found")

    state = _get_state(project_id)

    if project_id in PROJECTS_REGISTRY:
        indexed = PROJECTS_REGISTRY[project_id].vector_store_initialized or False
    else:
        # DB 레지스트리 프로젝트는 in-memory 플래그가 없다. 그 경우 컬렉션이
        # 유일한 사실이다 — 안 그러면 인덱싱이 끝나도 영원히 `indexed: false` 라
        # 대시보드가 "미인덱싱" 으로 계속 표시한다.
        indexed = _safe_count(project_id) > 0

    # Mirror /stats: while indexing, return the last known stable count so
    # the UI never sees the partial mid-reindex value.
    if state["status"] == "indexing":
        document_count = state.get("last_known_count") or 0
    else:
        document_count = _safe_count(project_id) if indexed else 0
        if state["status"] in ("not_started", "completed") and document_count > 0:
            state["last_known_count"] = document_count
            _indexing_state[project_id] = state

    return {
        "project_id": project_id,
        "status": state["status"],
        "indexed": indexed,
        "document_count": document_count,
        "started_at": state.get("started_at"),
        "completed_at": state.get("completed_at"),
        "error": state.get("error"),
    }


@router.post("/query", response_model=QueryResult)
async def cross_project_query(
    request: CrossProjectQueryRequest,
    current_user=Depends(get_current_user),
    db: AsyncSession = Depends(get_db_session),
) -> QueryResult:
    """
    Query across multiple project collections.

    Search all indexed projects (or a subset) and return merged results
    ranked by Reciprocal Rank Fusion.

    검색 대상은 **호출자가 접근 가능한 프로젝트로 좁힌다**. 인증만 걸면 member 가
    남의 project_id 를 지목해 그 청크를 그대로 읽을 수 있다 — 단건 라우트에
    ACL 을 건 의미가 사라진다.
    """
    allowed_ids = await _authorized_project_ids(request.project_ids, current_user, db)
    # `query_cross_project` 는 source 목록이 None 일 때만 exclude 를 적용한다.
    # 인가 필터가 항상 명시 목록을 넘기게 됐으므로 제외를 여기서 미리 뺀다 —
    # 안 그러면 제외한 프로젝트가 그대로 검색돼 결과에 섞인다.
    if request.exclude_project_ids:
        excluded = set(request.exclude_project_ids)
        allowed_ids = [pid for pid in allowed_ids if pid not in excluded]
    if not allowed_ids:
        return QueryResult(query=request.query, documents=[], total_found=0)

    try:
        store = get_vector_store()
        result = await store.query_cross_project(
            query=request.query,
            k=request.k,
            source_project_ids=allowed_ids,
            exclude_project_ids=request.exclude_project_ids,
            filter_priority=request.filter_priority,
        )
        return result

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Cross-project query failed: {str(e)}")


@router.get("/collections")
async def list_collections() -> dict:
    """
    List all indexed project collections with statistics.

    Returns a summary of all proj_* collections in Qdrant.
    """
    try:
        store = get_vector_store()
        collection_names = store._get_all_project_collections()

        collections = []
        for coll_name in collection_names:
            pid = store._extract_project_id_from_collection(coll_name)
            try:
                info = store.client.get_collection(coll_name)
                count = info.points_count or 0
            except Exception:
                count = 0

            collections.append(
                {
                    "project_id": pid,
                    "collection_name": coll_name,
                    "document_count": count,
                    "indexed": count > 0,
                }
            )

        return {
            "total_collections": len(collections),
            "collections": collections,
        }

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to list collections: {str(e)}")


# ── Code Entity Endpoints ────────────────────────────────────────────────────


@router.get("/projects/{project_id}/entities")
async def get_project_entities(
    project_id: str,
    current_user=Depends(get_current_user),
    db: AsyncSession = Depends(get_db_session),
    entity_type: str | None = None,
) -> dict:
    """
    Get code entities extracted from a project's indexed files.

    Scans project files and extracts functions, classes, interfaces, etc.
    Optionally filter by entity_type (function, class, method, interface, etc.).
    """
    project = await _resolve_project(project_id, current_user, db)
    if not project:
        raise HTTPException(status_code=404, detail=f"Project not found: {project_id}")

    from pathlib import Path

    project_root = Path(project.path).resolve()
    if not project_root.is_dir():
        raise HTTPException(status_code=404, detail=f"Project path not found: {project_root}")

    all_entities = []
    indexable_exts = {".py", ".ts", ".tsx", ".js", ".jsx"}
    skip_dirs = {"node_modules", ".git", "__pycache__", ".venv", "venv", "dist", "build"}

    for item in project_root.rglob("*"):
        if not item.is_file():
            continue
        if item.suffix.lower() not in indexable_exts:
            continue
        try:
            rel_parts = item.relative_to(project_root).parts
        except ValueError:
            continue
        if any(part in skip_dirs for part in rel_parts[:-1]):
            continue

        try:
            content = item.read_text(encoding="utf-8", errors="ignore")
            entities = extract_entities(str(item), content)
            for e in entities:
                e.file_path = str(item.relative_to(project_root))
            all_entities.extend(entities)
        except Exception:
            continue

    if entity_type:
        all_entities = [e for e in all_entities if e.entity_type.value == entity_type]

    return {
        "project_id": project_id,
        "total": len(all_entities),
        "entities": [
            {
                "name": e.name,
                "type": e.entity_type.value,
                "file_path": e.file_path,
                "line_number": e.line_number,
                "signature": e.signature,
                "docstring": e.docstring,
                "parent": e.parent,
            }
            for e in all_entities
        ],
    }


@router.get("/projects/{project_id}/dependencies")
async def get_project_dependencies(
    project_id: str,
    current_user=Depends(get_current_user),
    db: AsyncSession = Depends(get_db_session),
    entity_name: str | None = None,
) -> dict:
    """
    Get code dependency relationships for a project.

    Extracts import and inheritance relationships between code entities.
    Optionally filter by entity_name to see deps for a specific entity.
    """
    project = await _resolve_project(project_id, current_user, db)
    if not project:
        raise HTTPException(status_code=404, detail=f"Project not found: {project_id}")

    from pathlib import Path

    project_root = Path(project.path).resolve()
    if not project_root.is_dir():
        raise HTTPException(status_code=404, detail=f"Project path not found: {project_root}")

    all_deps = []
    indexable_exts = {".py", ".ts", ".tsx", ".js", ".jsx"}
    skip_dirs = {"node_modules", ".git", "__pycache__", ".venv", "venv", "dist", "build"}

    for item in project_root.rglob("*"):
        if not item.is_file():
            continue
        if item.suffix.lower() not in indexable_exts:
            continue
        try:
            rel_parts = item.relative_to(project_root).parts
        except ValueError:
            continue
        if any(part in skip_dirs for part in rel_parts[:-1]):
            continue

        try:
            content = item.read_text(encoding="utf-8", errors="ignore")
            deps = extract_dependencies(str(item), content)
            for d in deps:
                d.file_path = str(item.relative_to(project_root))
            all_deps.extend(deps)
        except Exception:
            continue

    if entity_name:
        all_deps = [
            d for d in all_deps if d.source_entity == entity_name or d.target_entity == entity_name
        ]

    return {
        "project_id": project_id,
        "total": len(all_deps),
        "dependencies": [
            {
                "source": d.source_entity,
                "target": d.target_entity,
                "type": d.dependency_type,
                "file_path": d.file_path,
                "line_number": d.line_number,
            }
            for d in all_deps
        ],
    }
