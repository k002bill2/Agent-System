"""RAG Pydantic models for indexing and query results."""

from typing import Any

from pydantic import BaseModel


class IndexingResult(BaseModel):
    """Result from indexing operation."""

    project_id: str
    documents_indexed: int
    chunks_created: int
    collection_name: str
    # Incremental indexing stats
    files_unchanged: int = 0
    files_updated: int = 0
    files_deleted: int = 0
    incremental: bool = False


class QueryResult(BaseModel):
    """Result from a RAG query."""

    query: str
    documents: list[dict[str, Any]]
    total_found: int


class DebugQueryResult(BaseModel):
    """Extended query result with debugging information."""

    query: str
    total_found: int
    hybrid_enabled: bool
    rerank_enabled: bool
    embedding_provider: str
    chunks: list[dict[str, Any]]
    timing_ms: float
