"""BM25 index management with Redis persistence.

Provides in-memory BM25 indexing for keyword search with
optional Redis persistence to avoid rebuilding from Qdrant on restart.
"""

import json
import logging
import zlib
from typing import Any

from . import config

logger = logging.getLogger(__name__)

# Redis key prefix for BM25 corpus storage
_REDIS_KEY_PREFIX = "rag:bm25:corpus"
_REDIS_TTL_SECONDS = 86400  # 24 hours


def build_bm25_index(
    texts: list[str],
    metadatas: list[dict[str, Any]],
) -> tuple[Any, list[tuple[str, dict[str, Any]]]] | None:
    """Build a BM25 index from texts and metadatas.

    Returns:
        Tuple of (BM25Okapi instance, corpus) or None if BM25 unavailable.
    """
    if not config.BM25_AVAILABLE:
        return None

    corpus_tokens = [config.tokenize(t) for t in texts]
    if not corpus_tokens:
        return None

    index = config.BM25Okapi(corpus_tokens)
    corpus = list(zip(texts, metadatas, strict=True))
    return index, corpus


def bm25_search(
    bm25_index: Any,
    corpus: list[tuple[str, dict[str, Any]]],
    query: str,
    k: int = 10,
) -> list[tuple[str, dict[str, Any], float]]:
    """Search using a BM25 index.

    Args:
        bm25_index: BM25Okapi instance.
        corpus: List of (text, metadata) tuples.
        query: Search query.
        k: Number of results.

    Returns:
        List of (text, metadata, score) tuples, sorted by score descending.
    """
    tokens = config.tokenize(query)
    if not tokens:
        return []

    scores = bm25_index.get_scores(tokens)
    top_indices = sorted(range(len(scores)), key=lambda i: scores[i], reverse=True)[:k]

    results = []
    for idx in top_indices:
        if scores[idx] > 0:
            text, meta = corpus[idx]
            results.append((text, meta, float(scores[idx])))

    return results


# ── Redis persistence ────────────────────────────────────────────────────────


async def save_bm25_to_redis(
    redis_client: Any,
    project_id: str,
    texts: list[str],
    metadatas: list[dict[str, Any]],
) -> bool:
    """Persist BM25 corpus to Redis with compression.

    Args:
        redis_client: Async Redis client.
        project_id: Project identifier.
        texts: Document texts.
        metadatas: Document metadata dicts.

    Returns:
        True on success, False otherwise.
    """
    if redis_client is None:
        return False

    try:
        key = f"{_REDIS_KEY_PREFIX}:{project_id}"
        corpus_data = list(zip(texts, metadatas, strict=True))
        serialized = json.dumps(corpus_data, ensure_ascii=False).encode("utf-8")
        compressed = zlib.compress(serialized)
        await redis_client.set(key, compressed, ex=_REDIS_TTL_SECONDS)
        logger.info("Saved BM25 corpus to Redis for project %s (%d docs)", project_id, len(texts))
        return True
    except Exception as e:
        logger.warning("Failed to save BM25 corpus to Redis: %s", e)
        return False


async def load_bm25_from_redis(
    redis_client: Any,
    project_id: str,
) -> tuple[list[str], list[dict[str, Any]]] | None:
    """Load BM25 corpus from Redis.

    Returns:
        Tuple of (texts, metadatas) or None if not found/expired.
    """
    if redis_client is None:
        return None

    try:
        key = f"{_REDIS_KEY_PREFIX}:{project_id}"
        compressed = await redis_client.get(key)
        if compressed is None:
            return None

        serialized = zlib.decompress(compressed)
        corpus_data = json.loads(serialized)
        texts = [item[0] for item in corpus_data]
        metadatas = [item[1] for item in corpus_data]
        logger.info(
            "Loaded BM25 corpus from Redis for project %s (%d docs)", project_id, len(texts)
        )
        return texts, metadatas
    except Exception as e:
        logger.warning("Failed to load BM25 corpus from Redis: %s", e)
        return None


async def delete_bm25_from_redis(
    redis_client: Any,
    project_id: str,
) -> bool:
    """Delete BM25 corpus from Redis.

    Returns:
        True on success, False otherwise.
    """
    if redis_client is None:
        return False

    try:
        key = f"{_REDIS_KEY_PREFIX}:{project_id}"
        await redis_client.delete(key)
        return True
    except Exception as e:
        logger.warning("Failed to delete BM25 corpus from Redis: %s", e)
        return False
