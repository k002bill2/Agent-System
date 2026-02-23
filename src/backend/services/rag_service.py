"""RAG (Retrieval Augmented Generation) service for project context.

Supports:
- Language-aware chunking via RecursiveCharacterTextSplitter
- Hybrid search (semantic + BM25 with RRF fusion)
- CrossEncoder reranking
All new features are off by default and controlled via environment variables.
"""

import hashlib
import logging
import os
import re
from pathlib import Path
from typing import Any

logger = logging.getLogger(__name__)

from pydantic import BaseModel

# ── RAG Configuration (environment variables) ────────────────────────────────
RAG_ENABLE_HYBRID = os.getenv("RAG_ENABLE_HYBRID", "false").lower() == "true"
RAG_ENABLE_RERANK = os.getenv("RAG_ENABLE_RERANK", "false").lower() == "true"
RAG_RERANK_MODEL = os.getenv("RAG_RERANK_MODEL", "cross-encoder/ms-marco-MiniLM-L-6-v2")
RAG_FULL_CONTEXT_THRESHOLD = int(os.getenv("RAG_FULL_CONTEXT_THRESHOLD", "3000"))
RAG_CANDIDATE_MULTIPLIER = int(os.getenv("RAG_CANDIDATE_MULTIPLIER", "3"))

# ── Conditional imports ───────────────────────────────────────────────────────
CHROMA_AVAILABLE = False
try:
    from langchain_chroma import Chroma
    from langchain_core.documents import Document
    from langchain_core.embeddings import Embeddings

    CHROMA_AVAILABLE = True
except ImportError:
    Chroma = None  # type: ignore
    Document = None  # type: ignore
    Embeddings = None  # type: ignore

BM25_AVAILABLE = False
try:
    from rank_bm25 import BM25Okapi

    BM25_AVAILABLE = True
except ImportError:
    BM25Okapi = None  # type: ignore

RERANK_AVAILABLE = False
try:
    from sentence_transformers import CrossEncoder

    RERANK_AVAILABLE = True
except ImportError:
    CrossEncoder = None  # type: ignore

SPLITTER_AVAILABLE = False
try:
    from langchain_text_splitters import Language, RecursiveCharacterTextSplitter

    SPLITTER_AVAILABLE = True
except ImportError:
    Language = None  # type: ignore
    RecursiveCharacterTextSplitter = None  # type: ignore

# ── Embedding provider config ────────────────────────────────────────────────
LLM_PROVIDER = os.getenv("LLM_PROVIDER", "google")
EMBEDDING_PROVIDER = os.getenv("EMBEDDING_PROVIDER", "huggingface")

if EMBEDDING_PROVIDER == "openai":
    DEFAULT_EMBEDDING_MODEL = "text-embedding-3-small"
elif EMBEDDING_PROVIDER == "google":
    DEFAULT_EMBEDDING_MODEL = "models/text-embedding-004"
else:
    DEFAULT_EMBEDDING_MODEL = "sentence-transformers/all-MiniLM-L6-v2"

# ── File extension → Language mapping ─────────────────────────────────────────
_EXTENSION_LANGUAGE_MAP: dict[str, Any] = {}
if SPLITTER_AVAILABLE:
    _EXTENSION_LANGUAGE_MAP = {
        ".py": Language.PYTHON,
        ".md": Language.MARKDOWN,
        ".ts": Language.JS,
        ".tsx": Language.JS,
        ".js": Language.JS,
        ".jsx": Language.JS,
        ".html": Language.HTML,
    }


class IndexingResult(BaseModel):
    """Result from indexing operation."""

    project_id: str
    documents_indexed: int
    chunks_created: int
    collection_name: str


class QueryResult(BaseModel):
    """Result from a RAG query."""

    query: str
    documents: list[dict[str, Any]]
    total_found: int


def _tokenize(text: str) -> list[str]:
    """Simple whitespace + lowercase tokenizer for BM25."""
    return re.findall(r"\w+", text.lower())


class ProjectVectorStore:
    """
    Chroma-based vector store for project documents.

    Indexes project files (especially CLAUDE.md and source code)
    for semantic search during task planning.

    Features (opt-in via env vars):
    - Language-aware chunking (RecursiveCharacterTextSplitter)
    - Hybrid search: semantic + BM25 with Reciprocal Rank Fusion
    - CrossEncoder reranking for precision
    """

    # File extensions to index
    INDEXABLE_EXTENSIONS = {
        ".md",
        ".py",
        ".ts",
        ".tsx",
        ".js",
        ".jsx",
        ".json",
        ".yaml",
        ".yml",
        ".toml",
        ".txt",
        ".rst",
        ".html",
        ".css",
    }

    # Files to always skip
    SKIP_FILES = {
        "package-lock.json",
        "yarn.lock",
        "pnpm-lock.yaml",
        ".DS_Store",
        "Thumbs.db",
    }

    # Directories to skip
    SKIP_DIRS = {
        "node_modules",
        ".git",
        ".venv",
        "venv",
        "__pycache__",
        ".next",
        ".nuxt",
        "dist",
        "build",
        ".cache",
        "coverage",
    }

    def __init__(
        self,
        persist_directory: str | None = None,
        embedding_model: str | None = None,
    ):
        self.persist_directory = persist_directory or os.path.join(
            os.path.expanduser("~"), ".ags", "chroma_db"
        )
        Path(self.persist_directory).mkdir(parents=True, exist_ok=True)

        self.embeddings = self._create_embeddings(embedding_model)

        # Collection cache
        self._collections: dict[str, Chroma] = {}

        # BM25 indices (project_id → index)
        self._bm25_indices: dict[str, Any] = {}  # BM25Okapi instances
        self._bm25_corpus: dict[str, list[tuple[str, dict[str, Any]]]] = {}

        # CrossEncoder singleton (lazy)
        self._cross_encoder: Any | None = None

    # ── Embeddings ────────────────────────────────────────────────────────────

    def _create_embeddings(self, model_name: str | None = None) -> Embeddings:
        """Create embeddings instance based on EMBEDDING_PROVIDER."""
        model = model_name or DEFAULT_EMBEDDING_MODEL

        if (
            EMBEDDING_PROVIDER == "huggingface"
            or "sentence-transformers" in model
            or "all-MiniLM" in model
        ):
            try:
                from langchain_huggingface import HuggingFaceEmbeddings

                hf_model = (
                    model
                    if "sentence-transformers" in model
                    else "sentence-transformers/all-MiniLM-L6-v2"
                )
                print(f"[RAG] Using HuggingFace embeddings: {hf_model}")
                return HuggingFaceEmbeddings(model_name=hf_model)
            except ImportError:
                print("[RAG] langchain-huggingface not installed, trying alternatives...")

        if EMBEDDING_PROVIDER == "openai" or os.getenv("OPENAI_API_KEY"):
            try:
                from langchain_openai import OpenAIEmbeddings

                openai_model = model if "text-embedding" in model else "text-embedding-3-small"
                print(f"[RAG] Using OpenAI embeddings: {openai_model}")
                return OpenAIEmbeddings(model=openai_model)
            except ImportError:
                print("[RAG] langchain-openai not installed, trying alternatives...")

        google_api_key = os.getenv("GOOGLE_API_KEY")
        if EMBEDDING_PROVIDER == "google" and google_api_key:
            try:
                from langchain_google_genai import GoogleGenerativeAIEmbeddings

                google_model = model if "text-embedding" in model else "models/text-embedding-004"
                print(f"[RAG] Using Google embeddings: {google_model}")
                return GoogleGenerativeAIEmbeddings(
                    model=google_model, google_api_key=google_api_key
                )
            except ImportError:
                print("[RAG] langchain-google-genai not installed, trying alternatives...")

        try:
            from langchain_huggingface import HuggingFaceEmbeddings

            print("[RAG] Fallback to HuggingFace embeddings")
            return HuggingFaceEmbeddings(model_name="sentence-transformers/all-MiniLM-L6-v2")
        except ImportError:
            pass

        raise ValueError(
            "No embedding provider available. Install langchain-huggingface for local embeddings, "
            "or set OPENAI_API_KEY/GOOGLE_API_KEY for cloud embeddings."
        )

    # ── Collection helpers ────────────────────────────────────────────────────

    def _get_collection_name(self, project_id: str) -> str:
        """Generate a valid Chroma collection name."""
        safe_name = "".join(c if c.isalnum() else "_" for c in project_id)
        return f"proj_{safe_name}"[:63]

    def _get_or_create_collection(self, project_id: str) -> Chroma:
        """Get or create a Chroma collection for a project."""
        collection_name = self._get_collection_name(project_id)

        if collection_name not in self._collections:
            self._collections[collection_name] = Chroma(
                collection_name=collection_name,
                embedding_function=self.embeddings,
                persist_directory=self.persist_directory,
                collection_metadata={"hnsw:space": "cosine"},
            )

        return self._collections[collection_name]

    # ── File filtering ────────────────────────────────────────────────────────

    def _should_index_file(self, file_path: Path) -> bool:
        """Check if a file should be indexed."""
        if file_path.name in self.SKIP_FILES:
            return False
        if file_path.name.startswith("."):
            return False
        if file_path.suffix.lower() not in self.INDEXABLE_EXTENSIONS:
            return False
        try:
            if file_path.stat().st_size > 500 * 1024:
                return False
        except OSError:
            return False
        return True

    def _should_skip_directory(self, dir_path: Path) -> bool:
        """Check if a directory should be skipped."""
        return dir_path.name in self.SKIP_DIRS or dir_path.name.startswith(".")

    # ── Chunking ──────────────────────────────────────────────────────────────

    def _chunk_document(
        self,
        content: str,
        file_path: str,
        chunk_size: int = 1000,
        chunk_overlap: int = 200,
    ) -> list[Document]:
        """
        Split a document into chunks for indexing.

        Uses RecursiveCharacterTextSplitter with language-aware separators
        when available, otherwise falls back to character-based splitting.
        Files smaller than RAG_FULL_CONTEXT_THRESHOLD are kept as a single chunk.
        """
        content_hash = hashlib.md5(content.encode()).hexdigest()[:8]

        # Small files → single chunk (use configurable threshold)
        effective_threshold = max(chunk_size, RAG_FULL_CONTEXT_THRESHOLD)
        if len(content) <= effective_threshold:
            return [
                Document(
                    page_content=content,
                    metadata={
                        "source": file_path,
                        "chunk_index": 0,
                        "total_chunks": 1,
                        "content_hash": content_hash,
                    },
                )
            ]

        # Try language-aware splitting
        if SPLITTER_AVAILABLE:
            ext = Path(file_path).suffix.lower()
            language = _EXTENSION_LANGUAGE_MAP.get(ext)

            if language is not None:
                splitter = RecursiveCharacterTextSplitter.from_language(
                    language=language,
                    chunk_size=chunk_size,
                    chunk_overlap=chunk_overlap,
                )
            else:
                splitter = RecursiveCharacterTextSplitter(
                    chunk_size=chunk_size,
                    chunk_overlap=chunk_overlap,
                )

            raw_chunks = splitter.split_text(content)
            return [
                Document(
                    page_content=chunk_text,
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
        return self._chunk_document_manual(content, file_path, chunk_size, chunk_overlap)

    def _chunk_document_manual(
        self,
        content: str,
        file_path: str,
        chunk_size: int,
        chunk_overlap: int,
    ) -> list[Document]:
        """Fallback character-based chunking (no langchain_text_splitters)."""
        chunks: list[Document] = []
        content_hash = hashlib.md5(content.encode()).hexdigest()[:8]

        # Guard against overlap >= size (would cause infinite loop / division by zero)
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
                Document(
                    page_content=chunk_content,
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

    # ── BM25 index management ─────────────────────────────────────────────────

    def _build_bm25_index(
        self,
        project_id: str,
        texts: list[str],
        metadatas: list[dict[str, Any]],
    ) -> None:
        """Build an in-memory BM25 index for a project."""
        if not BM25_AVAILABLE:
            return

        corpus_tokens = [_tokenize(t) for t in texts]
        if not corpus_tokens:
            return

        self._bm25_indices[project_id] = BM25Okapi(corpus_tokens)
        self._bm25_corpus[project_id] = list(zip(texts, metadatas, strict=True))

    def _ensure_bm25_index(self, project_id: str) -> bool:
        """Lazy rebuild BM25 index from ChromaDB if not present."""
        if project_id in self._bm25_indices:
            return True

        if not BM25_AVAILABLE:
            return False

        try:
            collection = self._get_or_create_collection(project_id)
            result = collection._collection.get()
            if not result or not result.get("documents"):
                return False

            texts = result["documents"]
            metadatas = result.get("metadatas", [{}] * len(texts))
            self._build_bm25_index(project_id, texts, metadatas)
            return project_id in self._bm25_indices
        except Exception:
            return False

    def _bm25_search(
        self,
        project_id: str,
        query: str,
        k: int = 10,
    ) -> list[tuple[str, dict[str, Any], float]]:
        """Search using BM25 index. Returns (text, metadata, score) tuples."""
        if project_id not in self._bm25_indices:
            return []

        bm25 = self._bm25_indices[project_id]
        corpus = self._bm25_corpus[project_id]
        tokens = _tokenize(query)

        if not tokens:
            return []

        scores = bm25.get_scores(tokens)
        # Get top-k indices
        top_indices = sorted(range(len(scores)), key=lambda i: scores[i], reverse=True)[:k]

        results = []
        for idx in top_indices:
            if scores[idx] > 0:
                text, meta = corpus[idx]
                results.append((text, meta, float(scores[idx])))

        return results

    # ── Reranking ─────────────────────────────────────────────────────────────

    def _get_cross_encoder(self) -> Any:
        """Lazy-initialize the CrossEncoder singleton."""
        if self._cross_encoder is None and RERANK_AVAILABLE:
            self._cross_encoder = CrossEncoder(RAG_RERANK_MODEL)
        return self._cross_encoder

    def _rerank(
        self,
        query: str,
        candidates: list[dict[str, Any]],
        top_k: int,
    ) -> list[dict[str, Any]]:
        """Rerank candidates using CrossEncoder. Returns top_k results."""
        encoder = self._get_cross_encoder()
        if encoder is None or not candidates:
            return candidates[:top_k]

        pairs = [(query, c["content"]) for c in candidates]
        scores = encoder.predict(pairs)

        for candidate, score in zip(candidates, scores, strict=True):
            candidate["score"] = float(score)

        candidates.sort(key=lambda x: x["score"], reverse=True)
        return candidates[:top_k]

    # ── Hybrid query helpers ──────────────────────────────────────────────────

    @staticmethod
    def _rrf_fusion(
        ranked_lists: list[list[tuple[str, dict[str, Any]]]],
        k_rrf: int = 60,
    ) -> list[dict[str, Any]]:
        """
        Reciprocal Rank Fusion across multiple ranked lists.

        Each list contains (text, metadata) tuples in rank order.
        Returns fused results sorted by RRF score.
        """
        doc_scores: dict[str, float] = {}
        doc_map: dict[str, dict[str, Any]] = {}

        for ranked_list in ranked_lists:
            for rank, (text, meta) in enumerate(ranked_list):
                # Use source + chunk_index as dedup key
                doc_key = f"{meta.get('source', '')}::{meta.get('chunk_index', 0)}"
                doc_scores[doc_key] = doc_scores.get(doc_key, 0.0) + 1.0 / (rank + k_rrf)
                if doc_key not in doc_map:
                    doc_map[doc_key] = {
                        "content": text,
                        "source": meta.get("source", "unknown"),
                        "chunk_index": meta.get("chunk_index", 0),
                        "priority": meta.get("priority", "normal"),
                    }

        # Sort by fused score
        sorted_keys = sorted(doc_scores, key=lambda k: doc_scores[k], reverse=True)
        results = []
        for key in sorted_keys:
            entry = doc_map[key].copy()
            entry["score"] = doc_scores[key]
            results.append(entry)

        return results

    # ── Indexing ──────────────────────────────────────────────────────────────

    async def index_project(
        self,
        project_id: str,
        project_path: str,
        force_reindex: bool = False,
    ) -> IndexingResult:
        """
        Index all relevant files in a project directory.

        Args:
            project_id: Unique project identifier
            project_path: Path to the project root
            force_reindex: If True, clear existing index first

        Returns:
            IndexingResult with statistics
        """
        collection = self._get_or_create_collection(project_id)
        collection_name = self._get_collection_name(project_id)

        if force_reindex:
            try:
                collection._client.delete_collection(collection_name)
            except Exception:
                pass
            self._collections.pop(collection_name, None)
            # Clear BM25 caches too
            self._bm25_indices.pop(project_id, None)
            self._bm25_corpus.pop(project_id, None)
            collection = self._get_or_create_collection(project_id)

        # Resolve symlinks for consistent path handling
        project_root = Path(project_path).resolve()
        logger.info(f"Indexing project '{project_id}' at: {project_root}")
        logger.info(f"  Original path: {project_path}")
        logger.info(f"  Resolved path: {project_root}")
        logger.info(f"  Is symlink: {Path(project_path).is_symlink()}")
        documents: list[Document] = []
        files_indexed = 0
        skipped_count = 0

        priority_files = ["CLAUDE.md", "README.md", "package.json", "pyproject.toml"]

        for priority_file in priority_files:
            file_path = project_root / priority_file
            if file_path.exists() and file_path.is_file():
                try:
                    content = file_path.read_text(encoding="utf-8", errors="ignore")
                    chunks = self._chunk_document(
                        content,
                        str(file_path.relative_to(project_root)),
                    )
                    for chunk in chunks:
                        chunk.metadata["priority"] = "high"
                    documents.extend(chunks)
                    files_indexed += 1
                except Exception as e:
                    logger.debug(f"Skipped priority file {file_path}: {e}")

        for item in project_root.rglob("*"):
            if not item.is_file():
                continue

            # Compute relative path first; skip files outside project_root
            # (e.g. broken symlinks or resolve mismatches)
            try:
                rel_path = item.relative_to(project_root)
            except ValueError:
                skipped_count += 1
                logger.warning(f"Skipped file (relative_to failed): {item}")
                continue

            # Check skip directories using only the relative path parts
            # (avoids false positives from parent dirs above project_root)
            rel_parents = rel_path.parts[:-1]
            if any(self._should_skip_directory(Path(part)) for part in rel_parents):
                logger.debug(f"Skipped by dir filter: {rel_path} (parents: {rel_parents})")
                continue

            if item.name in priority_files:
                continue
            if not self._should_index_file(item):
                continue

            try:
                content = item.read_text(encoding="utf-8", errors="ignore")
                if not content.strip():
                    continue

                chunks = self._chunk_document(
                    content,
                    str(rel_path),
                )
                for chunk in chunks:
                    chunk.metadata["priority"] = "normal"
                documents.extend(chunks)
                files_indexed += 1
            except Exception as e:
                skipped_count += 1
                logger.warning(f"Skipped file (read/chunk failed): {item}: {e}")
                continue

        logger.info(
            f"Indexing complete: {files_indexed} files, "
            f"{len(documents)} chunks, {skipped_count} skipped"
        )

        if documents:
            texts = [doc.page_content for doc in documents]
            metadatas = [doc.metadata for doc in documents]
            ids = [
                f"{doc.metadata['source']}_{doc.metadata['chunk_index']}_{doc.metadata['content_hash']}"
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
            if RAG_ENABLE_HYBRID:
                self._build_bm25_index(project_id, texts, metadatas)

        return IndexingResult(
            project_id=project_id,
            documents_indexed=files_indexed,
            chunks_created=len(documents),
            collection_name=collection_name,
        )

    # ── Query ─────────────────────────────────────────────────────────────────

    async def query(
        self,
        project_id: str,
        query: str,
        k: int = 5,
        filter_priority: str | None = None,
    ) -> QueryResult:
        """
        Query the vector store for relevant documents.

        When RAG_ENABLE_HYBRID is True:
          1. Semantic search (k * CANDIDATE_MULTIPLIER candidates)
          2. BM25 keyword search (k * 2 candidates)
          3. RRF fusion of both lists
          4. Optional CrossEncoder reranking (if RAG_ENABLE_RERANK)
          5. Return top-k

        Otherwise: standard semantic similarity search.
        """
        collection = self._get_or_create_collection(project_id)

        where_filter = None
        if filter_priority:
            where_filter = {"priority": filter_priority}

        if RAG_ENABLE_HYBRID and BM25_AVAILABLE:
            return await self._hybrid_query(project_id, collection, query, k, where_filter)

        # ── Standard semantic-only path ───────────────────────────────────
        results = collection.similarity_search_with_score(
            query=query,
            k=k,
            filter=where_filter,
        )

        documents = []
        for doc, distance in results:
            similarity = max(0.0, min(1.0, 1.0 - float(distance)))
            documents.append(
                {
                    "content": doc.page_content,
                    "source": doc.metadata.get("source", "unknown"),
                    "chunk_index": doc.metadata.get("chunk_index", 0),
                    "priority": doc.metadata.get("priority", "normal"),
                    "score": similarity,
                }
            )

        return QueryResult(query=query, documents=documents, total_found=len(documents))

    async def _hybrid_query(
        self,
        project_id: str,
        collection: Chroma,
        query: str,
        k: int,
        where_filter: dict | None,
    ) -> QueryResult:
        """Hybrid search: semantic + BM25 → RRF → optional rerank."""

        # 1. Semantic candidates (expanded)
        semantic_k = k * RAG_CANDIDATE_MULTIPLIER
        semantic_results = collection.similarity_search_with_score(
            query=query,
            k=semantic_k,
            filter=where_filter,
        )
        semantic_ranked: list[tuple[str, dict[str, Any]]] = [
            (doc.page_content, doc.metadata) for doc, _score in semantic_results
        ]

        # 2. BM25 candidates
        self._ensure_bm25_index(project_id)
        bm25_raw = self._bm25_search(project_id, query, k=k * 2)
        bm25_ranked: list[tuple[str, dict[str, Any]]] = [
            (text, meta) for text, meta, _score in bm25_raw
        ]

        # 3. RRF fusion
        fused = self._rrf_fusion([semantic_ranked, bm25_ranked])

        # 4. Optional reranking
        if RAG_ENABLE_RERANK and RERANK_AVAILABLE:
            rerank_pool = fused[: k * 2]
            final = self._rerank(query, rerank_pool, top_k=k)
        else:
            final = fused[:k]

        return QueryResult(query=query, documents=final, total_found=len(final))

    # ── Delete / Stats ────────────────────────────────────────────────────────

    async def delete_project_index(self, project_id: str) -> bool:
        """Delete all indexed data for a project."""
        collection_name = self._get_collection_name(project_id)

        try:
            if collection_name in self._collections:
                collection = self._collections[collection_name]
                collection._client.delete_collection(collection_name)
                del self._collections[collection_name]
            # Clear BM25 caches
            self._bm25_indices.pop(project_id, None)
            self._bm25_corpus.pop(project_id, None)
            return True
        except Exception:
            return False

    def get_collection_stats(self, project_id: str) -> dict[str, Any]:
        """Get statistics for a project's collection."""
        collection = self._get_or_create_collection(project_id)

        try:
            count = collection._collection.count()
            return {
                "project_id": project_id,
                "collection_name": self._get_collection_name(project_id),
                "document_count": count,
                "indexed": count > 0,
                "hybrid_enabled": RAG_ENABLE_HYBRID,
                "rerank_enabled": RAG_ENABLE_RERANK,
            }
        except Exception as e:
            return {
                "project_id": project_id,
                "collection_name": self._get_collection_name(project_id),
                "document_count": 0,
                "indexed": False,
                "error": str(e),
            }


# ── Global instance (lazy initialized) ────────────────────────────────────────
_vector_store: "ProjectVectorStore | None" = None


def get_vector_store() -> "ProjectVectorStore":
    """Get or create the global vector store instance."""
    if not CHROMA_AVAILABLE:
        raise ImportError("ChromaDB not available. RAG features are disabled.")

    global _vector_store
    if _vector_store is None:
        _vector_store = ProjectVectorStore()
    return _vector_store


async def get_project_context(project_id: str, query: str, k: int = 5) -> str:
    """
    Convenience function to get relevant project context for a query.

    Returns formatted string of relevant document chunks.
    """
    store = get_vector_store()
    result = await store.query(project_id, query, k=k)

    if not result.documents:
        return ""

    context_parts = []
    for doc in result.documents:
        source = doc["source"]
        content = doc["content"]
        context_parts.append(f"[{source}]\n{content}")

    return "\n\n---\n\n".join(context_parts)


async def get_project_context_with_sources(
    project_id: str, query: str, k: int = 5
) -> tuple[str, list[dict]]:
    """
    Get relevant project context with structured source information.

    Returns:
        tuple of (formatted context string, list of source document dicts)
        Each source dict: {content, source, chunk_index, priority, score}
    """
    store = get_vector_store()
    result = await store.query(project_id, query, k=k)

    if not result.documents:
        return "", []

    context_parts = []
    for doc in result.documents:
        source = doc["source"]
        content = doc["content"]
        context_parts.append(f"[{source}]\n{content}")

    formatted = "\n\n---\n\n".join(context_parts)
    return formatted, result.documents
