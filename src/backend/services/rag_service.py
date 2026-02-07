"""RAG (Retrieval Augmented Generation) service for project context."""

import hashlib
import os
from pathlib import Path
from typing import Any

from pydantic import BaseModel

# Conditional imports for Railway (chromadb not available)
CHROMA_AVAILABLE = False
try:
    from langchain_chroma import Chroma
    from langchain_core.documents import Document
    from langchain_core.embeddings import Embeddings

    CHROMA_AVAILABLE = True
except ImportError:
    # Dummy classes for when chromadb is not available
    Chroma = None  # type: ignore
    Document = None  # type: ignore
    Embeddings = None  # type: ignore

# Determine embedding provider based on environment
LLM_PROVIDER = os.getenv("LLM_PROVIDER", "google")
EMBEDDING_PROVIDER = os.getenv("EMBEDDING_PROVIDER", "huggingface")  # huggingface is most reliable

# Set default embedding model based on provider
# HuggingFace is recommended as it works locally without API keys
if EMBEDDING_PROVIDER == "openai":
    DEFAULT_EMBEDDING_MODEL = "text-embedding-3-small"
elif EMBEDDING_PROVIDER == "google":
    DEFAULT_EMBEDDING_MODEL = "models/text-embedding-004"
else:
    # Default to HuggingFace (free, no API key, runs locally)
    DEFAULT_EMBEDDING_MODEL = "sentence-transformers/all-MiniLM-L6-v2"


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


class ProjectVectorStore:
    """
    Chroma-based vector store for project documents.

    Indexes project files (especially CLAUDE.md and source code)
    for semantic search during task planning.
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
        """
        Initialize the vector store.

        Args:
            persist_directory: Directory to persist Chroma DB. If None, uses in-memory.
            embedding_model: Embedding model to use. Defaults to sentence-transformers.
        """
        self.persist_directory = persist_directory or os.path.join(
            os.path.expanduser("~"), ".ags", "chroma_db"
        )

        # Ensure persist directory exists
        Path(self.persist_directory).mkdir(parents=True, exist_ok=True)

        # Initialize embeddings
        self.embeddings = self._create_embeddings(embedding_model)

        # Collection cache
        self._collections: dict[str, Chroma] = {}

    def _create_embeddings(self, model_name: str | None = None) -> Embeddings:
        """Create embeddings instance based on EMBEDDING_PROVIDER."""
        model = model_name or DEFAULT_EMBEDDING_MODEL

        # Try HuggingFace first (most reliable, runs locally, no API key needed)
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

        # OpenAI embeddings
        if EMBEDDING_PROVIDER == "openai" or os.getenv("OPENAI_API_KEY"):
            try:
                from langchain_openai import OpenAIEmbeddings

                openai_model = model if "text-embedding" in model else "text-embedding-3-small"
                print(f"[RAG] Using OpenAI embeddings: {openai_model}")
                return OpenAIEmbeddings(model=openai_model)
            except ImportError:
                print("[RAG] langchain-openai not installed, trying alternatives...")

        # Google Gemini embeddings
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

        # Final fallback: try HuggingFace regardless of setting
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

    def _get_collection_name(self, project_id: str) -> str:
        """Generate a valid Chroma collection name."""
        # Chroma collection names must be 3-63 chars, alphanumeric with underscores
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

    def _should_index_file(self, file_path: Path) -> bool:
        """Check if a file should be indexed."""
        # Skip by name
        if file_path.name in self.SKIP_FILES:
            return False

        # Skip hidden files
        if file_path.name.startswith("."):
            return False

        # Check extension
        if file_path.suffix.lower() not in self.INDEXABLE_EXTENSIONS:
            return False

        # Skip large files (> 500KB)
        try:
            if file_path.stat().st_size > 500 * 1024:
                return False
        except OSError:
            return False

        return True

    def _should_skip_directory(self, dir_path: Path) -> bool:
        """Check if a directory should be skipped."""
        return dir_path.name in self.SKIP_DIRS or dir_path.name.startswith(".")

    def _chunk_document(
        self,
        content: str,
        file_path: str,
        chunk_size: int = 1000,
        chunk_overlap: int = 200,
    ) -> list[Document]:
        """
        Split a document into chunks for indexing.

        Uses simple character-based chunking with overlap.
        """
        chunks = []

        # Calculate file hash for deduplication
        content_hash = hashlib.md5(content.encode()).hexdigest()[:8]

        # Handle small files as single chunk
        if len(content) <= chunk_size:
            chunks.append(
                Document(
                    page_content=content,
                    metadata={
                        "source": file_path,
                        "chunk_index": 0,
                        "total_chunks": 1,
                        "content_hash": content_hash,
                    },
                )
            )
            return chunks

        # Split into overlapping chunks
        start = 0
        chunk_index = 0
        total_chunks = (len(content) + chunk_size - chunk_overlap - 1) // (
            chunk_size - chunk_overlap
        )

        while start < len(content):
            end = start + chunk_size

            # Try to break at a newline for cleaner chunks
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

        # Clear existing if force reindex
        if force_reindex:
            # Delete and recreate collection
            try:
                collection._client.delete_collection(collection_name)
            except Exception:
                pass

            # Remove from cache and recreate
            self._collections.pop(collection_name, None)
            collection = self._get_or_create_collection(project_id)

        project_root = Path(project_path)
        documents: list[Document] = []
        files_indexed = 0

        # Priority files to index first (these get higher relevance)
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
                    # Add priority metadata
                    for chunk in chunks:
                        chunk.metadata["priority"] = "high"
                    documents.extend(chunks)
                    files_indexed += 1
                except Exception:
                    pass

        # Walk directory for other files
        for item in project_root.rglob("*"):
            # Skip directories in skip list
            if any(self._should_skip_directory(parent) for parent in item.parents):
                continue

            if not item.is_file():
                continue

            # Skip already processed priority files
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
                    str(item.relative_to(project_root)),
                )
                for chunk in chunks:
                    chunk.metadata["priority"] = "normal"
                documents.extend(chunks)
                files_indexed += 1

            except Exception:
                continue

        # Add documents to collection
        if documents:
            texts = [doc.page_content for doc in documents]
            metadatas = [doc.metadata for doc in documents]
            ids = [
                f"{doc.metadata['source']}_{doc.metadata['chunk_index']}_{doc.metadata['content_hash']}"
                for doc in documents
            ]

            # ChromaDB max batch size is 5461; split into chunks
            batch_size = 5000
            for i in range(0, len(texts), batch_size):
                collection.add_texts(
                    texts=texts[i : i + batch_size],
                    metadatas=metadatas[i : i + batch_size],
                    ids=ids[i : i + batch_size],
                )

        return IndexingResult(
            project_id=project_id,
            documents_indexed=files_indexed,
            chunks_created=len(documents),
            collection_name=collection_name,
        )

    async def query(
        self,
        project_id: str,
        query: str,
        k: int = 5,
        filter_priority: str | None = None,
    ) -> QueryResult:
        """
        Query the vector store for relevant documents.

        Args:
            project_id: Project to query
            query: Search query
            k: Number of results to return
            filter_priority: Optional filter for "high" or "normal" priority docs

        Returns:
            QueryResult with matching documents
        """
        collection = self._get_or_create_collection(project_id)

        # Build filter if specified
        where_filter = None
        if filter_priority:
            where_filter = {"priority": filter_priority}

        # Perform similarity search
        results = collection.similarity_search_with_score(
            query=query,
            k=k,
            filter=where_filter,
        )

        documents = []
        for doc, distance in results:
            # Cosine distance → similarity (1 - distance), clamped to [0, 1]
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

        return QueryResult(
            query=query,
            documents=documents,
            total_found=len(documents),
        )

    async def delete_project_index(self, project_id: str) -> bool:
        """Delete all indexed data for a project."""
        collection_name = self._get_collection_name(project_id)

        try:
            if collection_name in self._collections:
                collection = self._collections[collection_name]
                collection._client.delete_collection(collection_name)
                del self._collections[collection_name]
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
            }
        except Exception as e:
            return {
                "project_id": project_id,
                "collection_name": self._get_collection_name(project_id),
                "document_count": 0,
                "indexed": False,
                "error": str(e),
            }


# Global instance (lazy initialized)
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

    # Format context from documents
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

    # Format context from documents
    context_parts = []
    for doc in result.documents:
        source = doc["source"]
        content = doc["content"]
        context_parts.append(f"[{source}]\n{content}")

    formatted = "\n\n---\n\n".join(context_parts)
    return formatted, result.documents
