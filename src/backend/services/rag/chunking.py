"""Document chunking with language-aware splitting and context prefixes."""

import hashlib
from pathlib import Path
from typing import Any

from . import config
from .context_prefix import generate_context_prefix


def chunk_document(
    content: str,
    file_path: str,
    chunk_size: int | None = None,
    chunk_overlap: int | None = None,
) -> list[Any]:
    """Split a document into chunks for indexing.

    Uses RecursiveCharacterTextSplitter with language-aware separators
    when available, otherwise falls back to character-based splitting.
    Files smaller than RAG_FULL_CONTEXT_THRESHOLD are kept as a single chunk.

    When chunk_size/chunk_overlap are None, auto-detects optimal sizes
    from the file extension.
    """
    ext = Path(file_path).suffix.lower()
    if chunk_size is None or chunk_overlap is None:
        type_sizes = config.CONTENT_TYPE_CHUNK_SIZES.get(
            ext, (config.DEFAULT_CHUNK_SIZE, config.DEFAULT_CHUNK_OVERLAP)
        )
        if chunk_size is None:
            chunk_size = type_sizes[0]
        if chunk_overlap is None:
            chunk_overlap = type_sizes[1]

    # Compute content hash from ORIGINAL content (before prefix)
    content_hash = hashlib.md5(content.encode()).hexdigest()[:8]

    # Generate context prefix for this file
    prefix = generate_context_prefix(file_path)

    # Small files -> single chunk
    effective_threshold = max(chunk_size, config.RAG_FULL_CONTEXT_THRESHOLD)
    if len(content) <= effective_threshold:
        return [
            config.Document(
                page_content=prefix + content,
                metadata={
                    "source": file_path,
                    "chunk_index": 0,
                    "total_chunks": 1,
                    "content_hash": content_hash,
                },
            )
        ]

    # Try language-aware splitting
    if config.SPLITTER_AVAILABLE:
        language = config._EXTENSION_LANGUAGE_MAP.get(ext)

        if language is not None:
            splitter = config.RecursiveCharacterTextSplitter.from_language(
                language=language,
                chunk_size=chunk_size,
                chunk_overlap=chunk_overlap,
            )
        else:
            splitter = config.RecursiveCharacterTextSplitter(
                chunk_size=chunk_size,
                chunk_overlap=chunk_overlap,
            )

        raw_chunks = splitter.split_text(content)
        return [
            config.Document(
                page_content=prefix + chunk_text,
                metadata={
                    "source": file_path,
                    "chunk_index": i,
                    "total_chunks": len(raw_chunks),
                    "content_hash": content_hash,
                },
            )
            for i, chunk_text in enumerate(raw_chunks)
        ]

    # Fallback: manual character-based splitting
    return _chunk_document_manual(content, file_path, chunk_size, chunk_overlap, prefix)


def _chunk_document_manual(
    content: str,
    file_path: str,
    chunk_size: int,
    chunk_overlap: int,
    prefix: str,
) -> list[Any]:
    """Fallback character-based chunking (no langchain_text_splitters)."""
    chunks: list[Any] = []
    content_hash = hashlib.md5(content.encode()).hexdigest()[:8]

    if chunk_overlap >= chunk_size:
        chunk_overlap = chunk_size // 4

    start = 0
    chunk_index = 0
    step = chunk_size - chunk_overlap
    total_chunks = max(1, (len(content) + step - 1) // step)

    while start < len(content):
        end = start + chunk_size

        if end < len(content):
            newline_pos = content.rfind("\n", start + chunk_size // 2, end)
            if newline_pos > start:
                end = newline_pos + 1

        chunk_content = content[start:end]
        chunks.append(
            config.Document(
                page_content=prefix + chunk_content,
                metadata={
                    "source": file_path,
                    "chunk_index": chunk_index,
                    "total_chunks": total_chunks,
                    "content_hash": content_hash,
                    "start_char": start,
                    "end_char": end,
                },
            )
        )

        chunk_index += 1
        start = end - chunk_overlap

    return chunks
