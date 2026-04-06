"""Query operations: semantic, hybrid, cross-project, and debug queries."""

import logging
import re
import time
from typing import TYPE_CHECKING, Any

from . import config
from .bm25 import bm25_search, build_bm25_index, load_bm25_from_redis
from .fusion import rrf_fusion
from .models import DebugQueryResult, QueryResult
from .query_expansion import expand_query_synonyms
from .reranking import rerank

if TYPE_CHECKING:
    from .store import ProjectVectorStore

logger = logging.getLogger(__name__)


def _build_priority_filter(filter_priority: str | None) -> Any:
    """Build a Qdrant filter for document priority."""
    if not filter_priority:
        return None
    return config.QdrantFilter(
        must=[
            config.FieldCondition(
                key="metadata.priority",
                match=config.MatchValue(value=filter_priority),
            )
        ]
    )


def _ensure_bm25_index(store: "ProjectVectorStore", project_id: str) -> bool:
    """Ensure BM25 index exists: in-memory → Redis → Qdrant scroll."""
    if project_id in store._bm25_indices:
        return True

    if not config.BM25_AVAILABLE:
        return False

    # Try loading from Redis first
    import asyncio

    try:
        loop = asyncio.get_event_loop()
        if loop.is_running():
            # We're in an async context — schedule a coroutine
            import concurrent.futures

            with concurrent.futures.ThreadPoolExecutor() as pool:
                redis_result = pool.submit(
                    asyncio.run, load_bm25_from_redis(store.redis_client, project_id)
                ).result()
        else:
            redis_result = loop.run_until_complete(
                load_bm25_from_redis(store.redis_client, project_id)
            )
    except Exception:
        redis_result = None

    if redis_result is not None:
        texts, metadatas = redis_result
        result = build_bm25_index(texts, metadatas)
        if result is not None:
            store._bm25_indices[project_id] = result[0]
            store._bm25_corpus[project_id] = result[1]
            return True

    # Fallback: rebuild from Qdrant
    try:
        collection_name = store.get_collection_name(project_id)
        all_points, _ = store.client.scroll(
            collection_name=collection_name,
            limit=10000,
            with_payload=True,
            with_vectors=False,
        )
        if not all_points:
            return False

        texts = []
        metadatas = []
        for point in all_points:
            payload = point.payload or {}
            page_content = payload.get("page_content", "")
            metadata = payload.get("metadata", {})
            if page_content:
                texts.append(page_content)
                metadatas.append(metadata)

        if not texts:
            return False

        result = build_bm25_index(texts, metadatas)
        if result is not None:
            store._bm25_indices[project_id] = result[0]
            store._bm25_corpus[project_id] = result[1]
            return True
    except Exception:
        pass

    return False


async def _hybrid_query(
    store: "ProjectVectorStore",
    project_id: str,
    collection: Any,
    query_text: str,
    k: int,
    qdrant_filter: Any,
) -> QueryResult:
    """Hybrid search: semantic + BM25 → RRF → optional rerank."""
    # Optionally expand query for BM25
    bm25_query = query_text
    if config.RAG_ENABLE_QUERY_EXPANSION:
        bm25_query = expand_query_synonyms(query_text)

    # 1. Semantic candidates (expanded)
    semantic_k = k * config.RAG_CANDIDATE_MULTIPLIER
    semantic_results = collection.similarity_search_with_score(
        query=query_text,
        k=semantic_k,
        filter=qdrant_filter,
    )
    semantic_ranked: list[tuple[str, dict[str, Any]]] = [
        (doc.page_content, doc.metadata) for doc, _score in semantic_results
    ]

    # 2. BM25 candidates
    _ensure_bm25_index(store, project_id)
    bm25_ranked: list[tuple[str, dict[str, Any]]] = []
    if project_id in store._bm25_indices:
        bm25_raw = bm25_search(
            store._bm25_indices[project_id],
            store._bm25_corpus[project_id],
            bm25_query,
            k=k * 2,
        )
        bm25_ranked = [(text, meta) for text, meta, _score in bm25_raw]

    # 3. RRF fusion
    fused = rrf_fusion([semantic_ranked, bm25_ranked])

    # 4. Optional reranking
    if config.RAG_ENABLE_RERANK and config.RERANK_AVAILABLE:
        rerank_pool = fused[: k * 2]
        final = rerank(query_text, rerank_pool, top_k=k)
    else:
        final = fused[:k]

    return QueryResult(query=query_text, documents=final, total_found=len(final))


async def query_documents(
    store: "ProjectVectorStore",
    project_id: str,
    query_text: str,
    k: int = 5,
    filter_priority: str | None = None,
    include_shared: bool = False,
) -> QueryResult:
    """Query the vector store for relevant documents.

    Supports hybrid (semantic + BM25) and semantic-only modes.
    """
    collection = store.get_or_create_collection(project_id)
    qdrant_filter = _build_priority_filter(filter_priority)

    if config.RAG_ENABLE_HYBRID and config.BM25_AVAILABLE:
        local_result = await _hybrid_query(
            store, project_id, collection, query_text, k, qdrant_filter
        )
    else:
        results = collection.similarity_search_with_score(
            query=query_text, k=k, filter=qdrant_filter
        )
        documents = []
        for doc, score in results:
            similarity = max(0.0, min(1.0, float(score)))
            documents.append(
                {
                    "content": doc.page_content,
                    "source": doc.metadata.get("source", "unknown"),
                    "chunk_index": doc.metadata.get("chunk_index", 0),
                    "priority": doc.metadata.get("priority", "normal"),
                    "project_id": doc.metadata.get("project_id", project_id),
                    "score": similarity,
                }
            )
        local_result = QueryResult(
            query=query_text, documents=documents, total_found=len(documents)
        )

    if not include_shared:
        return local_result

    # Cross-project search: merge results from other collections
    other_collections = store.get_all_project_collections(exclude_ids=[project_id])
    all_ranked_lists: list[list[tuple[str, dict[str, Any]]]] = []

    # Local results with boost (double insertion for RRF)
    local_ranked: list[tuple[str, dict[str, Any]]] = [
        (d["content"], {**d, "project_id": d.get("project_id", project_id)})
        for d in local_result.documents
    ]
    all_ranked_lists.append(local_ranked)
    all_ranked_lists.append(local_ranked)

    for coll_name in other_collections:
        try:
            other_pid = store.extract_project_id_from_collection(coll_name)
            other_vs = store.get_or_create_collection(other_pid)
            other_results = other_vs.similarity_search_with_score(
                query=query_text, k=k, filter=qdrant_filter
            )
            other_ranked: list[tuple[str, dict[str, Any]]] = [
                (
                    doc.page_content,
                    {
                        "source": doc.metadata.get("source", "unknown"),
                        "chunk_index": doc.metadata.get("chunk_index", 0),
                        "priority": doc.metadata.get("priority", "normal"),
                        "project_id": doc.metadata.get("project_id", other_pid),
                    },
                )
                for doc, _score in other_results
            ]
            all_ranked_lists.append(other_ranked)
        except Exception as e:
            logger.warning("Cross-project search failed for %s: %s", coll_name, e)

    fused = rrf_fusion(all_ranked_lists)[:k]
    return QueryResult(query=query_text, documents=fused, total_found=len(fused))


async def query_cross_project(
    store: "ProjectVectorStore",
    query_text: str,
    k: int = 5,
    source_project_ids: list[str] | None = None,
    exclude_project_ids: list[str] | None = None,
    filter_priority: str | None = None,
) -> QueryResult:
    """Search across multiple project collections."""
    qdrant_filter = _build_priority_filter(filter_priority)

    if source_project_ids is not None:
        collection_names = [store.get_collection_name(pid) for pid in source_project_ids]
    else:
        collection_names = store.get_all_project_collections(exclude_ids=exclude_project_ids)

    all_ranked_lists: list[list[tuple[str, dict[str, Any]]]] = []

    for coll_name in collection_names:
        try:
            pid = store.extract_project_id_from_collection(coll_name)
            vs = store.get_or_create_collection(pid)
            results = vs.similarity_search_with_score(
                query=query_text, k=k, filter=qdrant_filter
            )
            ranked: list[tuple[str, dict[str, Any]]] = [
                (
                    doc.page_content,
                    {
                        "source": doc.metadata.get("source", "unknown"),
                        "chunk_index": doc.metadata.get("chunk_index", 0),
                        "priority": doc.metadata.get("priority", "normal"),
                        "project_id": doc.metadata.get("project_id", pid),
                    },
                )
                for doc, _score in results
            ]
            all_ranked_lists.append(ranked)
        except Exception as e:
            logger.warning("Cross-project query failed for %s: %s", coll_name, e)

    if not all_ranked_lists:
        return QueryResult(query=query_text, documents=[], total_found=0)

    fused = rrf_fusion(all_ranked_lists)[:k]
    return QueryResult(query=query_text, documents=fused, total_found=len(fused))


async def debug_query(
    store: "ProjectVectorStore",
    project_id: str,
    query_text: str,
    k: int = 20,
) -> DebugQueryResult:
    """Extended query for debugging: top-N chunks with full metadata and timing.

    Implements the guide's recommendation: "inspect the top 20 chunks
    with your own eyes to understand why the right information isn't ranking."
    """
    start_time = time.monotonic()

    collection = store.get_or_create_collection(project_id)

    # Always run both semantic and hybrid for comparison
    semantic_results = collection.similarity_search_with_score(query=query_text, k=k)

    chunks: list[dict[str, Any]] = []
    for doc, score in semantic_results:
        similarity = max(0.0, min(1.0, float(score)))
        chunk_data: dict[str, Any] = {
            "content": doc.page_content,
            "source": doc.metadata.get("source", "unknown"),
            "chunk_index": doc.metadata.get("chunk_index", 0),
            "total_chunks": doc.metadata.get("total_chunks", 1),
            "priority": doc.metadata.get("priority", "normal"),
            "content_hash": doc.metadata.get("content_hash", ""),
            "entity_names": doc.metadata.get("entity_names", []),
            "entity_types": doc.metadata.get("entity_types", []),
            "imports": doc.metadata.get("imports", []),
            "score": similarity,
            "highlight": _highlight_query_terms(doc.page_content, query_text),
        }
        chunks.append(chunk_data)

    elapsed_ms = (time.monotonic() - start_time) * 1000

    return DebugQueryResult(
        query=query_text,
        total_found=len(chunks),
        hybrid_enabled=config.RAG_ENABLE_HYBRID,
        rerank_enabled=config.RAG_ENABLE_RERANK,
        embedding_provider=config.EMBEDDING_PROVIDER,
        chunks=chunks,
        timing_ms=round(elapsed_ms, 2),
    )


def _highlight_query_terms(content: str, query: str) -> str:
    """Create a highlighted snippet showing query term matches.

    Returns first 200 chars around the first match, with **bold** markers.
    """
    terms = re.findall(r"\w+", query.lower())
    if not terms:
        return content[:200]

    content_lower = content.lower()
    first_match_pos = len(content)
    for term in terms:
        pos = content_lower.find(term)
        if pos != -1 and pos < first_match_pos:
            first_match_pos = pos

    if first_match_pos == len(content):
        return content[:200]

    # Extract window around first match
    start = max(0, first_match_pos - 50)
    end = min(len(content), first_match_pos + 150)
    snippet = content[start:end]

    # Bold matching terms
    for term in terms:
        pattern = re.compile(re.escape(term), re.IGNORECASE)
        snippet = pattern.sub(f"**{term}**", snippet)

    if start > 0:
        snippet = "..." + snippet
    if end < len(content):
        snippet = snippet + "..."

    return snippet
