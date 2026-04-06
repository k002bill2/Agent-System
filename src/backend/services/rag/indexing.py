"""Project indexing with incremental (delta) support.

When force_reindex=False, compares content hashes to only
re-index changed/new files and remove stale chunks.
"""

import hashlib
import logging
import uuid
from pathlib import Path
from typing import TYPE_CHECKING, Any

from ..code_entity_extractor import CodeEntity, extract_entities
from .bm25 import build_bm25_index, save_bm25_to_redis
from .chunking import chunk_document
from . import config
from .models import IndexingResult

if TYPE_CHECKING:
    from .store import ProjectVectorStore

logger = logging.getLogger(__name__)

PRIORITY_FILES = ["CLAUDE.md", "README.md", "package.json", "pyproject.toml"]


def _entity_in_chunk(entity: CodeEntity, chunk: Any) -> bool:
    """Check if a code entity is referenced in a document chunk."""
    return entity.name in chunk.page_content


def _get_existing_content_hashes(store: "ProjectVectorStore", project_id: str) -> dict[str, str]:
    """Fetch source→content_hash mapping from Qdrant for existing chunks.

    Returns dict like {"src/auth.py": "a1b2c3d4", ...}
    Only returns one hash per source (the first chunk's hash).
    """
    collection_name = store.get_collection_name(project_id)
    try:
        all_points, _ = store.client.scroll(
            collection_name=collection_name,
            limit=10000,
            with_payload=True,
            with_vectors=False,
        )
        hashes: dict[str, str] = {}
        for point in all_points:
            payload = point.payload or {}
            metadata = payload.get("metadata", {})
            source = metadata.get("source", "")
            content_hash = metadata.get("content_hash", "")
            if source and content_hash and source not in hashes:
                hashes[source] = content_hash
        return hashes
    except Exception:
        return {}


def _compute_file_hash(content: str) -> str:
    """Compute content hash matching the chunking hash format."""
    return hashlib.md5(content.encode()).hexdigest()[:8]


def _delete_stale_chunks(
    store: "ProjectVectorStore",
    project_id: str,
    stale_sources: set[str],
) -> int:
    """Delete Qdrant points for files no longer on disk.

    Returns count of deleted sources.
    """
    if not stale_sources:
        return 0

    collection_name = store.get_collection_name(project_id)
    deleted = 0

    for source in stale_sources:
        try:
            store.client.delete(
                collection_name=collection_name,
                points_selector=config.QdrantFilter(
                    must=[
                        config.FieldCondition(
                            key="metadata.source",
                            match=config.MatchValue(value=source),
                        )
                    ]
                ),
            )
            deleted += 1
        except Exception as e:
            logger.warning("Failed to delete stale chunks for %s: %s", source, e)

    return deleted


def _enrich_chunks_with_entities(
    chunks: list[Any],
    file_path: str,
    content: str,
    project_id: str,
    priority: str,
) -> None:
    """Enrich chunk metadata with code entity information."""
    try:
        entities = extract_entities(file_path, content)
        file_imports = list({imp for e in entities for imp in e.imports})
    except Exception:
        entities, file_imports = [], []

    for chunk in chunks:
        chunk.metadata["priority"] = priority
        chunk.metadata["project_id"] = project_id
        chunk_entities = [e for e in entities if _entity_in_chunk(e, chunk)]
        chunk.metadata["entity_names"] = [e.name for e in chunk_entities]
        chunk.metadata["entity_types"] = [e.entity_type.value for e in chunk_entities]
        chunk.metadata["imports"] = file_imports


async def index_project(
    store: "ProjectVectorStore",
    project_id: str,
    project_path: str,
    force_reindex: bool = False,
) -> IndexingResult:
    """Index all relevant files in a project directory.

    When force_reindex=False (default): incremental indexing.
    When force_reindex=True: full rebuild.
    """
    collection_name = store.get_collection_name(project_id)

    # Get existing hashes for incremental mode
    existing_hashes: dict[str, str] = {}
    incremental = not force_reindex

    if force_reindex:
        try:
            store.client.delete_collection(collection_name)
        except Exception:
            pass
        store._collections.pop(collection_name, None)
        store._bm25_indices.pop(project_id, None)
        store._bm25_corpus.pop(project_id, None)
    elif incremental:
        existing_hashes = _get_existing_content_hashes(store, project_id)

    collection = store.get_or_create_collection(project_id)

    # Resolve symlinks for consistent path handling
    project_root = Path(project_path).resolve()
    logger.info("Indexing project '%s' at: %s (incremental=%s)", project_id, project_root, incremental)

    documents: list[Any] = []
    files_indexed = 0
    files_unchanged = 0
    files_updated = 0
    skipped_count = 0
    indexed_sources: set[str] = set()

    # Helper to process a single file
    def _process_file(
        file_path: Path, rel_str: str, priority: str
    ) -> bool:
        nonlocal files_unchanged, files_updated
        content = file_path.read_text(encoding="utf-8", errors="ignore")
        if not content.strip():
            return False

        current_hash = _compute_file_hash(content)
        indexed_sources.add(rel_str)

        # Incremental: skip unchanged files
        if incremental and rel_str in existing_hashes:
            if existing_hashes[rel_str] == current_hash:
                files_unchanged += 1
                return False
            files_updated += 1

        chunks = chunk_document(content, rel_str)
        _enrich_chunks_with_entities(chunks, rel_str, content, project_id, priority)
        documents.extend(chunks)
        return True

    # Index priority files first
    for priority_file in PRIORITY_FILES:
        file_path = project_root / priority_file
        if file_path.exists() and file_path.is_file():
            try:
                rel = str(file_path.relative_to(project_root))
                if _process_file(file_path, rel, "high"):
                    files_indexed += 1
            except Exception as e:
                logger.debug("Skipped priority file %s: %s", file_path, e)

    # Index remaining files
    for item in project_root.rglob("*"):
        if not item.is_file():
            continue

        try:
            rel_path = item.relative_to(project_root)
        except ValueError:
            skipped_count += 1
            continue

        rel_parents = rel_path.parts[:-1]
        if any(store.should_skip_directory(Path(part)) for part in rel_parents):
            continue

        if item.name in PRIORITY_FILES:
            continue
        if not store.should_index_file(item):
            continue

        try:
            rel_str = str(rel_path)
            if _process_file(item, rel_str, "normal"):
                files_indexed += 1
        except Exception as e:
            skipped_count += 1
            logger.warning("Skipped file (read/chunk failed): %s: %s", item, e)

    # Delete stale chunks (files removed from disk)
    files_deleted = 0
    if incremental and existing_hashes:
        stale_sources = set(existing_hashes.keys()) - indexed_sources
        if stale_sources:
            files_deleted = _delete_stale_chunks(store, project_id, stale_sources)
            logger.info("Removed %d stale file(s) from index", files_deleted)

    logger.info(
        "Indexing complete: %d indexed, %d unchanged, %d updated, %d deleted, %d skipped",
        files_indexed, files_unchanged, files_updated, files_deleted, skipped_count,
    )

    if documents:
        texts = [doc.page_content for doc in documents]
        metadatas = [doc.metadata for doc in documents]
        ids = [
            str(
                uuid.uuid5(
                    uuid.NAMESPACE_URL,
                    f"{doc.metadata['source']}_{doc.metadata['chunk_index']}_{doc.metadata['content_hash']}",
                )
            )
            for doc in documents
        ]

        batch_size = 5000
        for i in range(0, len(texts), batch_size):
            collection.add_texts(
                texts=texts[i : i + batch_size],
                metadatas=metadatas[i : i + batch_size],
                ids=ids[i : i + batch_size],
            )

        # Build BM25 index if hybrid enabled
        if config.RAG_ENABLE_HYBRID:
            store._bm25_indices.pop(project_id, None)
            store._bm25_corpus.pop(project_id, None)
            result = build_bm25_index(texts, metadatas)
            if result is not None:
                store._bm25_indices[project_id] = result[0]
                store._bm25_corpus[project_id] = result[1]
                # Persist to Redis
                await save_bm25_to_redis(store.redis_client, project_id, texts, metadatas)

    return IndexingResult(
        project_id=project_id,
        documents_indexed=files_indexed,
        chunks_created=len(documents),
        collection_name=collection_name,
        files_unchanged=files_unchanged,
        files_updated=files_updated,
        files_deleted=files_deleted,
        incremental=incremental,
    )
