"""ProjectVectorStore: Qdrant-based vector store for project documents.

Thin facade that delegates to specialized modules for chunking,
indexing, querying, BM25, and reranking.
"""

import logging
import os
from pathlib import Path
from typing import Any

from . import config
from .embeddings import create_embeddings
from .models import DebugQueryResult, IndexingResult, QueryResult

logger = logging.getLogger(__name__)


class ProjectVectorStore:
    """Qdrant-based vector store for project documents.

    Indexes project files for semantic search during task planning.

    Features (controlled via env vars):
    - Language-aware chunking (RecursiveCharacterTextSplitter)
    - Content-type aware chunk sizes
    - Contextual retrieval (path-based context prefixes)
    - Hybrid search: semantic + BM25 with Reciprocal Rank Fusion
    - CrossEncoder reranking for precision
    - Incremental indexing (delta-based)
    - Redis-backed BM25 persistence
    """

    # Class-level constants (delegated to config for backward compat)
    INDEXABLE_EXTENSIONS = config.INDEXABLE_EXTENSIONS
    SKIP_FILES = config.SKIP_FILES
    SKIP_DIRS = config.SKIP_DIRS

    def __init__(
        self,
        qdrant_url: str | None = None,
        qdrant_api_key: str | None = None,
        embedding_model: str | None = None,
        prefer_grpc: bool = True,
        redis_client: Any | None = None,
    ):
        self.qdrant_url = qdrant_url or os.getenv("QDRANT_URL", "http://localhost:6333")
        self.qdrant_api_key = qdrant_api_key or os.getenv("QDRANT_API_KEY", "")
        self.prefer_grpc = prefer_grpc
        self.redis_client = redis_client

        # Initialize Qdrant client
        client_kwargs: dict[str, Any] = {
            "url": self.qdrant_url,
            "prefer_grpc": self.prefer_grpc,
        }
        if self.qdrant_api_key:
            client_kwargs["api_key"] = self.qdrant_api_key
        self.client = config.QdrantClient(**client_kwargs)

        self.embeddings = create_embeddings(embedding_model)

        # Detect embedding dimension (lazy)
        self._embedding_dimension: int | None = None

        # Collection cache (collection_name → QdrantVectorStore)
        self._collections: dict[str, Any] = {}

        # BM25 indices (project_id → index)
        self._bm25_indices: dict[str, Any] = {}
        self._bm25_corpus: dict[str, list[tuple[str, dict[str, Any]]]] = {}

    # ── Embedding dimension ──────────────────────────────────────────────────

    def get_embedding_dimension(self) -> int:
        """Detect embedding dimension by embedding a sample text."""
        if self._embedding_dimension is None:
            sample = self.embeddings.embed_query("test")
            self._embedding_dimension = len(sample)
        return self._embedding_dimension

    # ── Collection helpers ───────────────────────────────────────────────────

    def get_collection_name(self, project_id: str) -> str:
        """Generate a valid collection name for Qdrant."""
        safe_name = "".join(c if c.isalnum() else "_" for c in project_id)
        return f"proj_{safe_name}"[:63]

    def _ensure_collection_exists(self, collection_name: str) -> None:
        """Ensure a Qdrant collection exists, creating it if needed."""
        try:
            self.client.get_collection(collection_name)
        except Exception:
            dim = self.get_embedding_dimension()
            self.client.create_collection(
                collection_name=collection_name,
                vectors_config=config.VectorParams(
                    size=dim,
                    distance=config.Distance.COSINE,
                ),
            )
            logger.info("Created Qdrant collection '%s' (dim=%d, cosine)", collection_name, dim)

    def get_or_create_collection(self, project_id: str) -> Any:
        """Get or create a Qdrant vector store for a project."""
        collection_name = self.get_collection_name(project_id)

        if collection_name not in self._collections:
            self._ensure_collection_exists(collection_name)
            self._collections[collection_name] = config.QdrantVectorStore(
                client=self.client,
                collection_name=collection_name,
                embedding=self.embeddings,
            )

        return self._collections[collection_name]

    def get_all_project_collections(self, exclude_ids: list[str] | None = None) -> list[str]:
        """Return all proj_* collection names from Qdrant."""
        exclude_names: set[str] = set()
        if exclude_ids:
            exclude_names = {self.get_collection_name(pid) for pid in exclude_ids}

        try:
            collections_response = self.client.get_collections()
            return [
                c.name
                for c in collections_response.collections
                if c.name.startswith("proj_") and c.name not in exclude_names
            ]
        except Exception as e:
            logger.warning("Failed to list Qdrant collections: %s", e)
            return []

    def extract_project_id_from_collection(self, collection_name: str) -> str:
        """Extract project_id from a collection name (proj_<id> -> <id>)."""
        if collection_name.startswith("proj_"):
            return collection_name[5:]
        return collection_name

    # ── File filtering ───────────────────────────────────────────────────────

    @staticmethod
    def should_index_file(file_path: Path) -> bool:
        """Check if a file should be indexed."""
        if file_path.name in config.SKIP_FILES:
            return False
        if file_path.name.startswith("."):
            return False
        if file_path.suffix.lower() not in config.INDEXABLE_EXTENSIONS:
            return False
        try:
            if file_path.stat().st_size > 500 * 1024:
                return False
        except OSError:
            return False
        return True

    @staticmethod
    def should_skip_directory(dir_path: Path) -> bool:
        """Check if a directory should be skipped."""
        return dir_path.name in config.SKIP_DIRS or dir_path.name.startswith(".")

    # ── Backward-compat methods for tests ───────────────────────────────────

    def _chunk_document(
        self,
        content: str,
        file_path: str,
        chunk_size: int | None = None,
        chunk_overlap: int | None = None,
    ) -> list[Any]:
        """Compatibility wrapper: delegates to chunking module."""
        from .chunking import chunk_document

        return chunk_document(content, file_path, chunk_size, chunk_overlap)

    @staticmethod
    def _chunk_document_manual(
        content: str,
        file_path: str,
        chunk_size: int,
        chunk_overlap: int,
    ) -> list[Any]:
        """Compatibility wrapper for manual chunking."""
        from .chunking import _chunk_document_manual

        return _chunk_document_manual(content, file_path, chunk_size, chunk_overlap, "")

    def _create_embeddings(self, model_name: str | None = None) -> Any:
        """Compatibility wrapper: delegates to embeddings module."""
        return create_embeddings(model_name)

    def _build_bm25_index(
        self, project_id: str, texts: list[str], metadatas: list[dict[str, Any]]
    ) -> None:
        """Compatibility wrapper for BM25 index building."""
        from .bm25 import build_bm25_index

        result = build_bm25_index(texts, metadatas)
        if result is not None:
            self._bm25_indices[project_id] = result[0]
            self._bm25_corpus[project_id] = result[1]

    def _bm25_search(
        self, project_id: str, query_text: str, k: int = 10
    ) -> list[tuple[str, dict[str, Any], float]]:
        """Compatibility wrapper for BM25 search."""
        from .bm25 import bm25_search

        if project_id not in self._bm25_indices:
            return []
        return bm25_search(
            self._bm25_indices[project_id],
            self._bm25_corpus[project_id],
            query_text,
            k,
        )

    def _rerank(
        self, query_text: str, candidates: list[dict[str, Any]], top_k: int
    ) -> list[dict[str, Any]]:
        """Compatibility wrapper for reranking.

        Uses self._cross_encoder if set (for tests), otherwise delegates.
        """
        encoder = getattr(self, "_cross_encoder", None)
        if encoder is None or not candidates:
            return candidates[:top_k]

        pairs = [(query_text, c["content"]) for c in candidates]
        scores = encoder.predict(pairs)
        scored = [
            {**candidate, "score": float(score)}
            for candidate, score in zip(candidates, scores, strict=True)
        ]
        scored.sort(key=lambda x: x["score"], reverse=True)
        return scored[:top_k]

    @staticmethod
    def _rrf_fusion(
        ranked_lists: list[list[tuple[str, dict[str, Any]]]], k_rrf: int = 60
    ) -> list[dict[str, Any]]:
        """Compatibility wrapper for RRF fusion."""
        from .fusion import rrf_fusion

        return rrf_fusion(ranked_lists, k_rrf)

    # ── Delegated operations ─────────────────────────────────────────────────

    async def index_project(
        self,
        project_id: str,
        project_path: str,
        force_reindex: bool = False,
    ) -> IndexingResult:
        """Index all relevant files in a project directory.

        Supports incremental indexing when force_reindex=False:
        only re-indexes changed/new files and removes stale chunks.
        """
        from .indexing import index_project

        return await index_project(self, project_id, project_path, force_reindex)

    async def query(
        self,
        project_id: str,
        query: str = "",
        k: int = 5,
        filter_priority: str | None = None,
        include_shared: bool = False,
        *,
        query_text: str | None = None,
    ) -> QueryResult:
        """Query the vector store for relevant documents."""
        from .query import query_documents

        # Accept both 'query' and 'query_text' for backward compatibility
        effective_query = query_text if query_text is not None else query
        return await query_documents(
            self, project_id, effective_query, k, filter_priority, include_shared
        )

    async def query_cross_project(
        self,
        query_text: str,
        k: int = 5,
        source_project_ids: list[str] | None = None,
        exclude_project_ids: list[str] | None = None,
        filter_priority: str | None = None,
    ) -> QueryResult:
        """Search across multiple project collections."""
        from .query import query_cross_project

        return await query_cross_project(
            self, query_text, k, source_project_ids, exclude_project_ids, filter_priority
        )

    async def debug_query(
        self,
        project_id: str,
        query_text: str,
        k: int = 20,
    ) -> DebugQueryResult:
        """Extended query for debugging: returns top-N chunks with full metadata."""
        from .query import debug_query

        return await debug_query(self, project_id, query_text, k)

    async def delete_project_index(self, project_id: str) -> bool:
        """Delete all indexed data for a project."""
        collection_name = self.get_collection_name(project_id)

        try:
            self.client.delete_collection(collection_name)
            self._collections.pop(collection_name, None)
            self._bm25_indices.pop(project_id, None)
            self._bm25_corpus.pop(project_id, None)
            # Also clean Redis
            from .bm25 import delete_bm25_from_redis

            await delete_bm25_from_redis(self.redis_client, project_id)
            return True
        except Exception:
            return False

    # ── Backward-compat aliases (underscore prefix) ────────────────────────
    _get_collection_name = get_collection_name
    _ensure_collection_exists = _ensure_collection_exists
    _get_or_create_collection = get_or_create_collection
    _get_all_project_collections = get_all_project_collections
    _extract_project_id_from_collection = extract_project_id_from_collection
    _should_index_file = should_index_file
    _should_skip_directory = should_skip_directory
    _get_embedding_dimension = get_embedding_dimension

    def get_collection_stats(self, project_id: str) -> dict[str, Any]:
        """Get statistics for a project's collection."""
        collection_name = self.get_collection_name(project_id)

        try:
            collection_info = self.client.get_collection(collection_name)
            count = collection_info.points_count or 0
            return {
                "project_id": project_id,
                "collection_name": collection_name,
                "document_count": count,
                "indexed": count > 0,
                "hybrid_enabled": config.RAG_ENABLE_HYBRID,
                "rerank_enabled": config.RAG_ENABLE_RERANK,
            }
        except Exception as e:
            return {
                "project_id": project_id,
                "collection_name": collection_name,
                "document_count": 0,
                "indexed": False,
                "error": str(e),
            }


# ── Global instance (lazy initialized) ──────────────────────────────────────
_vector_store: ProjectVectorStore | None = None


def get_vector_store() -> ProjectVectorStore:
    """Get or create the global vector store instance."""
    if not config.QDRANT_AVAILABLE:
        raise ImportError("Qdrant not available. RAG features are disabled.")

    global _vector_store
    if _vector_store is None:
        _vector_store = ProjectVectorStore()
    return _vector_store


async def get_project_context(
    project_id: str,
    query: str,
    k: int = 5,
    include_shared: bool = False,
) -> str:
    """Convenience: get formatted project context for a query."""
    store = get_vector_store()
    result = await store.query(project_id, query, k=k, include_shared=include_shared)

    if not result.documents:
        return ""

    context_parts = []
    for doc in result.documents:
        source = doc["source"]
        content = doc["content"]
        pid = doc.get("project_id", project_id)
        prefix = f"[{source}]" if pid == project_id else f"[{pid}:{source}]"
        context_parts.append(f"{prefix}\n{content}")

    return "\n\n---\n\n".join(context_parts)


async def get_project_context_with_sources(
    project_id: str,
    query: str,
    k: int = 5,
    include_shared: bool = False,
) -> tuple[str, list[dict]]:
    """Convenience: get context with structured source information."""
    store = get_vector_store()
    result = await store.query(project_id, query, k=k, include_shared=include_shared)

    if not result.documents:
        return "", []

    context_parts = []
    for doc in result.documents:
        source = doc["source"]
        content = doc["content"]
        pid = doc.get("project_id", project_id)
        prefix = f"[{source}]" if pid == project_id else f"[{pid}:{source}]"
        context_parts.append(f"{prefix}\n{content}")

    formatted = "\n\n---\n\n".join(context_parts)
    return formatted, result.documents


async def get_cross_project_context(
    query: str,
    k: int = 5,
    source_project_ids: list[str] | None = None,
    exclude_project_ids: list[str] | None = None,
) -> str:
    """Convenience: search across all projects."""
    store = get_vector_store()
    result = await store.query_cross_project(
        query_text=query,
        k=k,
        source_project_ids=source_project_ids,
        exclude_project_ids=exclude_project_ids,
    )

    if not result.documents:
        return ""

    context_parts = []
    for doc in result.documents:
        source = doc["source"]
        content = doc["content"]
        pid = doc.get("project_id", "unknown")
        context_parts.append(f"[{pid}:{source}]\n{content}")

    return "\n\n---\n\n".join(context_parts)
