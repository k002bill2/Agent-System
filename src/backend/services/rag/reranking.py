"""CrossEncoder reranking for search result precision."""

import logging
from typing import Any

from . import config

logger = logging.getLogger(__name__)

# Lazy singleton
_cross_encoder: Any | None = None


def get_cross_encoder() -> Any | None:
    """Lazy-initialize the CrossEncoder singleton.

    Returns:
        CrossEncoder instance or None if unavailable.
    """
    global _cross_encoder
    if _cross_encoder is None and config.RERANK_AVAILABLE:
        _cross_encoder = config.CrossEncoder(config.RAG_RERANK_MODEL)
        logger.info("Initialized CrossEncoder: %s", config.RAG_RERANK_MODEL)
    return _cross_encoder


def rerank(
    query: str,
    candidates: list[dict[str, Any]],
    top_k: int,
) -> list[dict[str, Any]]:
    """Rerank candidates using CrossEncoder.

    Args:
        query: Original search query.
        candidates: List of candidate dicts with "content" key.
        top_k: Number of top results to return.

    Returns:
        Top-k candidates sorted by rerank score.
    """
    encoder = get_cross_encoder()
    if encoder is None or not candidates:
        return candidates[:top_k]

    pairs = [(query, c["content"]) for c in candidates]
    scores = encoder.predict(pairs)

    # Create new candidate dicts with updated scores (immutability)
    scored = [
        {**candidate, "score": float(score)}
        for candidate, score in zip(candidates, scores, strict=True)
    ]
    scored.sort(key=lambda x: x["score"], reverse=True)
    return scored[:top_k]
