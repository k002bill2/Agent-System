"""Reciprocal Rank Fusion (RRF) for combining ranked search results."""

from typing import Any


def rrf_fusion(
    ranked_lists: list[list[tuple[str, dict[str, Any]]]],
    k_rrf: int = 60,
) -> list[dict[str, Any]]:
    """Reciprocal Rank Fusion across multiple ranked lists.

    Each list contains (text, metadata) tuples in rank order.
    Returns fused results sorted by RRF score.
    """
    doc_scores: dict[str, float] = {}
    doc_map: dict[str, dict[str, Any]] = {}

    for ranked_list in ranked_lists:
        for rank, (text, meta) in enumerate(ranked_list):
            doc_key = f"{meta.get('source', '')}::{meta.get('chunk_index', 0)}"
            doc_scores[doc_key] = doc_scores.get(doc_key, 0.0) + 1.0 / (rank + k_rrf)
            if doc_key not in doc_map:
                entry = {
                    "content": text,
                    "source": meta.get("source", "unknown"),
                    "chunk_index": meta.get("chunk_index", 0),
                    "priority": meta.get("priority", "normal"),
                }
                if "project_id" in meta:
                    entry["project_id"] = meta["project_id"]
                doc_map[doc_key] = entry

    sorted_keys = sorted(doc_scores, key=lambda k: doc_scores[k], reverse=True)
    results = []
    for key in sorted_keys:
        entry = {**doc_map[key], "score": doc_scores[key]}
        results.append(entry)

    return results
