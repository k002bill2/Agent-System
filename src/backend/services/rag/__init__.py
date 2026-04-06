"""RAG (Retrieval Augmented Generation) service for project context.

Supports:
- Language-aware chunking via RecursiveCharacterTextSplitter
- Content-type aware chunk sizes (code: 1500, docs: 800, config: 2000)
- Contextual Retrieval (path-based context prefixes)
- Hybrid search (semantic + BM25 with RRF fusion) — enabled by default
- CrossEncoder reranking — enabled by default
- Incremental indexing (delta-based)
- Redis-backed BM25 persistence
- Query expansion (code-domain synonyms)

Vector DB backend: Qdrant.
"""

# Re-export all public symbols for backward compatibility
from .config import (
    BM25_AVAILABLE,
    QDRANT_AVAILABLE,
    RAG_ENABLE_HYBRID,
    RAG_ENABLE_RERANK,
    RERANK_AVAILABLE,
)
from .models import DebugQueryResult, IndexingResult, QueryResult
from .store import (
    ProjectVectorStore,
    get_cross_project_context,
    get_project_context,
    get_project_context_with_sources,
    get_vector_store,
)

__all__ = [
    "BM25_AVAILABLE",
    "DebugQueryResult",
    "IndexingResult",
    "QDRANT_AVAILABLE",
    "ProjectVectorStore",
    "QueryResult",
    "RAG_ENABLE_HYBRID",
    "RAG_ENABLE_RERANK",
    "RERANK_AVAILABLE",
    "get_cross_project_context",
    "get_project_context",
    "get_project_context_with_sources",
    "get_vector_store",
]
