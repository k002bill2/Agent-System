"""RAG (Retrieval Augmented Generation) API routes."""

import logging
from datetime import UTC, datetime

from fastapi import APIRouter, BackgroundTasks, HTTPException
from pydantic import BaseModel, Field

from models.project import PROJECTS_REGISTRY, get_project
from services.code_entity_extractor import extract_dependencies, extract_entities
from services.rag_service import (
    QDRANT_AVAILABLE,
    DebugQueryResult,
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
    error: str | None = None


# Track indexing status
_indexing_status: dict[str, str] = {}


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

        _indexing_status[project_id] = "completed"

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
        _indexing_status[project_id] = f"error: {str(e)}"
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

    if _indexing_status.get(project_id) == "indexing":
        logger.info("Project '%s' is already being indexed, skipping", project_id)
        return False

    _indexing_status[project_id] = "indexing"
    background_tasks.add_task(_do_index_project, project_id, project_path, force_reindex)
    logger.info("Background indexing triggered for project '%s'", project_id)
    return True


def get_indexing_status_value(project_id: str) -> str:
    """Get the current indexing status for a project."""
    return _indexing_status.get(project_id, "not_started")


@router.post("/projects/{project_id}/index", response_model=IndexResponse)
async def index_project(
    project_id: str,
    background_tasks: BackgroundTasks,
    request: IndexRequest | None = None,
) -> IndexResponse:
    """
    Index a project's files for RAG search.

    Indexing runs in the background. Poll GET /status/{project_id} for progress.
    """
    project = get_project(project_id)
    if not project:
        raise HTTPException(
            status_code=404, detail=f"Project '{project_id}' not found. Register it first."
        )

    force_reindex = request.force_reindex if request else False

    triggered = trigger_background_indexing(
        project_id=project.id,
        project_path=project.path,
        background_tasks=background_tasks,
        force_reindex=force_reindex,
    )

    if not triggered and _indexing_status.get(project_id) == "indexing":
        return IndexResponse(project_id=project_id, status="already_indexing")

    if not triggered:
        raise HTTPException(status_code=503, detail="Qdrant not available")

    return IndexResponse(project_id=project_id, status="indexing")


@router.post("/projects/{project_id}/query", response_model=QueryResult)
async def query_project(
    project_id: str,
    request: QueryRequest,
) -> QueryResult:
    """
    Query project context using semantic search.

    Returns the most relevant document chunks from the project's indexed files.
    """
    # Check if project exists
    project = get_project(project_id)
    if not project:
        raise HTTPException(status_code=404, detail=f"Project '{project_id}' not found")

    try:
        store = get_vector_store()
        result = await store.query(
            project_id=project_id,
            query=request.query,
            k=request.k,
            filter_priority=request.filter_priority,
            include_shared=request.include_shared,
        )

        return result

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Query failed: {str(e)}")


class DebugQueryRequest(BaseModel):
    """Request for debug query (returns detailed chunk information)."""

    query: str = Field(..., description="Search query")
    k: int = Field(default=20, ge=1, le=50, description="Number of results (up to 50)")


@router.post("/projects/{project_id}/debug-query", response_model=DebugQueryResult)
async def debug_query_project(
    project_id: str,
    request: DebugQueryRequest,
) -> DebugQueryResult:
    """Debug endpoint: returns top-N chunks with full metadata, scores, and highlights.

    Use this to inspect search quality — the guide recommends examining
    the top 20 chunks to understand why relevant info isn't ranking.
    """
    project = get_project(project_id)
    if not project:
        raise HTTPException(status_code=404, detail=f"Project '{project_id}' not found")

    try:
        store = get_vector_store()
        return await store.debug_query(
            project_id=project_id,
            query_text=request.query,
            k=request.k,
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Debug query failed: {str(e)}")


@router.get("/projects/{project_id}/stats", response_model=StatsResponse)
async def get_project_stats(project_id: str) -> StatsResponse:
    """
    Get vector store statistics for a project.

    Returns information about the indexed documents and collection status.
    """
    # Check if project exists
    project = get_project(project_id)
    if not project:
        raise HTTPException(status_code=404, detail=f"Project '{project_id}' not found")

    try:
        store = get_vector_store()
        stats = store.get_collection_stats(project_id)

        return StatsResponse(
            project_id=stats["project_id"],
            collection_name=stats["collection_name"],
            document_count=stats["document_count"],
            indexed=stats["indexed"],
            error=stats.get("error"),
        )

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to get stats: {str(e)}")


@router.delete("/projects/{project_id}/index")
async def delete_project_index(project_id: str) -> dict:
    """
    Delete all indexed data for a project.

    This removes the vector store collection and all associated embeddings.
    """
    # Check if project exists
    project = get_project(project_id)
    if not project:
        raise HTTPException(status_code=404, detail=f"Project '{project_id}' not found")

    try:
        store = get_vector_store()
        success = await store.delete_project_index(project_id)

        if success:
            _indexing_status.pop(project_id, None)
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
async def get_indexing_status(project_id: str) -> dict:
    """Get the current indexing status for a project."""
    status = _indexing_status.get(project_id, "not_started")

    indexed = False
    document_count = 0

    # Check project registry for indexed state
    if project_id in PROJECTS_REGISTRY:
        indexed = PROJECTS_REGISTRY[project_id].vector_store_initialized or False

    # Try to get document count from vector store
    if QDRANT_AVAILABLE and indexed:
        try:
            store = get_vector_store()
            stats = store.get_collection_stats(project_id)
            document_count = stats.get("document_count", 0)
        except Exception:
            pass

    return {
        "project_id": project_id,
        "status": status,
        "indexed": indexed,
        "document_count": document_count,
    }


@router.post("/query", response_model=QueryResult)
async def cross_project_query(request: CrossProjectQueryRequest) -> QueryResult:
    """
    Query across multiple project collections.

    Search all indexed projects (or a subset) and return merged results
    ranked by Reciprocal Rank Fusion.
    """
    try:
        store = get_vector_store()
        result = await store.query_cross_project(
            query=request.query,
            k=request.k,
            source_project_ids=request.project_ids,
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
    entity_type: str | None = None,
) -> dict:
    """
    Get code entities extracted from a project's indexed files.

    Scans project files and extracts functions, classes, interfaces, etc.
    Optionally filter by entity_type (function, class, method, interface, etc.).
    """
    project = get_project(project_id)
    if not project:
        raise HTTPException(status_code=404, detail=f"Project not found: {project_id}")

    from pathlib import Path

    project_root = Path(project["path"]).resolve()
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
    entity_name: str | None = None,
) -> dict:
    """
    Get code dependency relationships for a project.

    Extracts import and inheritance relationships between code entities.
    Optionally filter by entity_name to see deps for a specific entity.
    """
    project = get_project(project_id)
    if not project:
        raise HTTPException(status_code=404, detail=f"Project not found: {project_id}")

    from pathlib import Path

    project_root = Path(project["path"]).resolve()
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
