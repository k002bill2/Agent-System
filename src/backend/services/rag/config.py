"""RAG configuration: environment variables, constants, conditional imports."""

import os
import re
from typing import Any

# ── RAG Configuration (environment variables) ────────────────────────────────
RAG_ENABLE_HYBRID = os.getenv("RAG_ENABLE_HYBRID", "true").lower() == "true"
RAG_ENABLE_RERANK = os.getenv("RAG_ENABLE_RERANK", "true").lower() == "true"
RAG_RERANK_MODEL = os.getenv("RAG_RERANK_MODEL", "cross-encoder/ms-marco-MiniLM-L-6-v2")
RAG_FULL_CONTEXT_THRESHOLD = int(os.getenv("RAG_FULL_CONTEXT_THRESHOLD", "3000"))
RAG_CANDIDATE_MULTIPLIER = int(os.getenv("RAG_CANDIDATE_MULTIPLIER", "3"))
RAG_ENABLE_QUERY_EXPANSION = os.getenv("RAG_ENABLE_QUERY_EXPANSION", "false").lower() == "true"

# ── Conditional imports ──────────────────────────────────────────────────────
QDRANT_AVAILABLE = False
try:
    from langchain_core.documents import Document
    from langchain_core.embeddings import Embeddings
    from langchain_qdrant import QdrantVectorStore
    from qdrant_client import QdrantClient
    from qdrant_client.models import Distance, FieldCondition, MatchValue, VectorParams
    from qdrant_client.models import Filter as QdrantFilter

    QDRANT_AVAILABLE = True
except ImportError:
    QdrantClient = None  # type: ignore
    QdrantVectorStore = None  # type: ignore
    Document = None  # type: ignore
    Embeddings = None  # type: ignore
    Distance = None  # type: ignore
    FieldCondition = None  # type: ignore
    MatchValue = None  # type: ignore
    VectorParams = None  # type: ignore
    QdrantFilter = None  # type: ignore

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

# ── File extension → Language mapping ────────────────────────────────────────
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

# ── Content-type aware chunk sizes ───────────────────────────────────────────
# extension -> (chunk_size, chunk_overlap)
CONTENT_TYPE_CHUNK_SIZES: dict[str, tuple[int, int]] = {
    ".py": (1500, 300),
    ".ts": (1500, 300),
    ".tsx": (1500, 300),
    ".js": (1500, 300),
    ".jsx": (1500, 300),
    ".md": (800, 160),
    ".rst": (800, 160),
    ".json": (2000, 200),
    ".yaml": (2000, 200),
    ".yml": (2000, 200),
    ".toml": (2000, 200),
    ".html": (1200, 240),
    ".css": (1200, 240),
}
DEFAULT_CHUNK_SIZE = 1000
DEFAULT_CHUNK_OVERLAP = 200

# ── File filter constants ────────────────────────────────────────────────────
INDEXABLE_EXTENSIONS = {
    ".md", ".py", ".ts", ".tsx", ".js", ".jsx", ".json",
    ".yaml", ".yml", ".toml", ".txt", ".rst", ".html", ".css",
}

SKIP_FILES = {
    "package-lock.json", "yarn.lock", "pnpm-lock.yaml",
    ".DS_Store", "Thumbs.db",
}

SKIP_DIRS = {
    "node_modules", ".git", ".venv", "venv", "__pycache__",
    ".next", ".nuxt", "dist", "build", ".cache", "coverage",
}


def tokenize(text: str) -> list[str]:
    """Simple whitespace + lowercase tokenizer for BM25."""
    return re.findall(r"\w+", text.lower())
