"""RAG (Retrieval Augmented Generation) API routes."""

from fastapi import APIRouter, HTTPException, BackgroundTasks
from pydantic import BaseModel, Field

from models.project import get_project, PROJECTS_REGISTRY
from services.rag_service import (
    get_vector_store,
    IndexingResult,
    QueryResult,
)

router = APIRouter(prefix="/rag", tags=["RAG"])


class IndexRequest(BaseModel):
    """Request to index a project."""
    force_reindex: bool = Field(
        default=False,
        description="If true, clear existing index before re-indexing"
    )


class QueryRequest(BaseModel):
    """Request to query project context."""
    query: str = Field(..., description="Search query")
    k: int = Field(default=5, ge=1, le=20, description="Number of results")
    filter_priority: str | None = Field(
        default=None,
        description="Filter by priority ('high' or 'normal')"
    )


class IndexResponse(BaseModel):
    """Response from indexing operation."""
    project_id: str
    documents_indexed: int
    chunks_created: int
    collection_name: str
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


@router.post("/projects/{project_id}/index", response_model=IndexResponse)
async def index_project(
    project_id: str,
    background_tasks: BackgroundTasks,
    request: IndexRequest | None = None,
) -> IndexResponse:
    """
    Index a project's files for RAG search.

    This indexes all relevant files (code, docs, config) in the project
    directory for semantic search during task planning.

    Indexing runs in the background and may take a few moments for large projects.
    """
    # Check if project exists
    project = get_project(project_id)
    if not project:
        raise HTTPException(
            status_code=404,
            detail=f"Project '{project_id}' not found. Register it first."
        )

    # Check if already indexing
    if _indexing_status.get(project_id) == "indexing":
        raise HTTPException(
            status_code=409,
            detail=f"Project '{project_id}' is already being indexed"
        )

    _indexing_status[project_id] = "indexing"

    # Use default values if no request body
    force_reindex = request.force_reindex if request else False

    try:
        store = get_vector_store()
        result = await store.index_project(
            project_id=project.id,
            project_path=project.path,
            force_reindex=force_reindex,
        )

        _indexing_status[project_id] = "completed"

        # Update project registry to mark as indexed
        if project_id in PROJECTS_REGISTRY:
            # The project model doesn't have vector_store_initialized yet,
            # but we track it here
            pass

        return IndexResponse(
            project_id=result.project_id,
            documents_indexed=result.documents_indexed,
            chunks_created=result.chunks_created,
            collection_name=result.collection_name,
            status="completed",
        )

    except Exception as e:
        _indexing_status[project_id] = f"error: {str(e)}"
        raise HTTPException(
            status_code=500,
            detail=f"Indexing failed: {str(e)}"
        )


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
        raise HTTPException(
            status_code=404,
            detail=f"Project '{project_id}' not found"
        )

    try:
        store = get_vector_store()
        result = await store.query(
            project_id=project_id,
            query=request.query,
            k=request.k,
            filter_priority=request.filter_priority,
        )

        return result

    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Query failed: {str(e)}"
        )


@router.get("/projects/{project_id}/stats", response_model=StatsResponse)
async def get_project_stats(project_id: str) -> StatsResponse:
    """
    Get vector store statistics for a project.

    Returns information about the indexed documents and collection status.
    """
    # Check if project exists
    project = get_project(project_id)
    if not project:
        raise HTTPException(
            status_code=404,
            detail=f"Project '{project_id}' not found"
        )

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
        raise HTTPException(
            status_code=500,
            detail=f"Failed to get stats: {str(e)}"
        )


@router.delete("/projects/{project_id}/index")
async def delete_project_index(project_id: str) -> dict:
    """
    Delete all indexed data for a project.

    This removes the vector store collection and all associated embeddings.
    """
    # Check if project exists
    project = get_project(project_id)
    if not project:
        raise HTTPException(
            status_code=404,
            detail=f"Project '{project_id}' not found"
        )

    try:
        store = get_vector_store()
        success = await store.delete_project_index(project_id)

        if success:
            _indexing_status.pop(project_id, None)
            return {"message": f"Index deleted for project '{project_id}'"}
        else:
            return {"message": f"No index found for project '{project_id}'"}

    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Failed to delete index: {str(e)}"
        )


@router.get("/status/{project_id}")
async def get_indexing_status(project_id: str) -> dict:
    """Get the current indexing status for a project."""
    status = _indexing_status.get(project_id, "not_started")
    return {
        "project_id": project_id,
        "status": status,
    }
