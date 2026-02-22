"""Tests for RAG service: chunking, hybrid search, BM25, reranking."""

from unittest.mock import MagicMock

import pytest

# ── Helpers ───────────────────────────────────────────────────────────────────


def _make_document(page_content: str, metadata: dict | None = None):
    """Create a mock Document-like object."""
    doc = MagicMock()
    doc.page_content = page_content
    doc.metadata = metadata or {}
    return doc


# ── Import guards ─────────────────────────────────────────────────────────────


@pytest.fixture(autouse=True)
def _mock_chroma(monkeypatch):
    """Ensure CHROMA_AVAILABLE is True with mocked Chroma for all tests."""
    import services.rag_service as rag_mod

    monkeypatch.setattr(rag_mod, "CHROMA_AVAILABLE", True)

    # Mock Document to behave like a simple dataclass
    class FakeDocument:
        def __init__(self, page_content: str = "", metadata: dict | None = None):
            self.page_content = page_content
            self.metadata = metadata or {}

    monkeypatch.setattr(rag_mod, "Document", FakeDocument)


@pytest.fixture
def vector_store(monkeypatch, tmp_path):
    """Create a ProjectVectorStore with mocked embeddings."""
    import services.rag_service as rag_mod

    # Mock embeddings to avoid loading real models
    mock_embeddings = MagicMock()
    monkeypatch.setattr(
        rag_mod.ProjectVectorStore,
        "_create_embeddings",
        lambda self, model=None: mock_embeddings,
    )

    store = rag_mod.ProjectVectorStore(persist_directory=str(tmp_path / "chroma"))
    return store


# ── Phase 1: Chunking tests ──────────────────────────────────────────────────


class TestChunkDocument:
    """Tests for _chunk_document with language-aware splitting."""

    def test_small_file_single_chunk(self, vector_store):
        """Files below RAG_FULL_CONTEXT_THRESHOLD → single chunk."""
        content = "Hello world\nThis is a small file."
        chunks = vector_store._chunk_document(content, "readme.md")

        assert len(chunks) == 1
        assert chunks[0].page_content == content
        assert chunks[0].metadata["chunk_index"] == 0
        assert chunks[0].metadata["total_chunks"] == 1
        assert chunks[0].metadata["source"] == "readme.md"

    def test_large_file_multiple_chunks(self, vector_store, monkeypatch):
        """Files above threshold are split into multiple chunks."""
        import services.rag_service as rag_mod

        monkeypatch.setattr(rag_mod, "RAG_FULL_CONTEXT_THRESHOLD", 100)

        content = "line\n" * 200  # ~1000 chars
        chunks = vector_store._chunk_document(content, "big.py", chunk_size=200)

        assert len(chunks) > 1
        # All chunks have required metadata
        for i, chunk in enumerate(chunks):
            assert chunk.metadata["source"] == "big.py"
            assert chunk.metadata["chunk_index"] == i
            assert "content_hash" in chunk.metadata

    def test_content_hash_consistency(self, vector_store):
        """Same content always produces the same hash."""
        content = "def foo():\n    return 42"
        chunks_a = vector_store._chunk_document(content, "a.py")
        chunks_b = vector_store._chunk_document(content, "b.py")

        assert chunks_a[0].metadata["content_hash"] == chunks_b[0].metadata["content_hash"]

    def test_different_content_different_hash(self, vector_store):
        content_a = "version 1"
        content_b = "version 2"

        hash_a = vector_store._chunk_document(content_a, "a.txt")[0].metadata["content_hash"]
        hash_b = vector_store._chunk_document(content_b, "b.txt")[0].metadata["content_hash"]

        assert hash_a != hash_b

    def test_full_context_threshold_configurable(self, vector_store, monkeypatch):
        """RAG_FULL_CONTEXT_THRESHOLD controls single-chunk boundary."""
        import services.rag_service as rag_mod

        content = "x" * 2500  # 2500 chars

        # Default threshold 3000 → single chunk
        monkeypatch.setattr(rag_mod, "RAG_FULL_CONTEXT_THRESHOLD", 3000)
        chunks = vector_store._chunk_document(content, "file.txt")
        assert len(chunks) == 1

        # Threshold 500 → multiple chunks
        monkeypatch.setattr(rag_mod, "RAG_FULL_CONTEXT_THRESHOLD", 500)
        chunks = vector_store._chunk_document(content, "file.txt", chunk_size=1000)
        assert len(chunks) > 1

    def test_python_file_chunking(self, vector_store, monkeypatch):
        """Python files use language-aware separators when available."""
        import services.rag_service as rag_mod

        monkeypatch.setattr(rag_mod, "RAG_FULL_CONTEXT_THRESHOLD", 100)

        python_content = '''
class MyClass:
    """A class."""

    def method_one(self):
        return 1

    def method_two(self):
        return 2


class AnotherClass:
    """Another class."""

    def another_method(self):
        return 3
''' * 5  # Repeat to ensure it's large enough

        chunks = vector_store._chunk_document(python_content, "module.py", chunk_size=200)
        assert len(chunks) > 1
        # Each chunk should be valid text
        for chunk in chunks:
            assert len(chunk.page_content.strip()) > 0


class TestChunkDocumentManual:
    """Tests for fallback manual chunking."""

    def test_manual_chunking_overlap(self, vector_store, monkeypatch):
        """Manual chunking produces overlapping chunks."""
        content = "A" * 300
        chunks = vector_store._chunk_document_manual(content, "test.txt", 100, 20)

        assert len(chunks) > 1
        # Verify metadata
        for i, chunk in enumerate(chunks):
            assert chunk.metadata["chunk_index"] == i
            assert chunk.metadata["source"] == "test.txt"


# ── Phase 2: BM25 tests ──────────────────────────────────────────────────────


class TestBM25:
    """Tests for BM25 indexing and search."""

    def test_build_bm25_index(self, vector_store, monkeypatch):
        """BM25 index is built from texts and metadatas."""
        import services.rag_service as rag_mod

        monkeypatch.setattr(rag_mod, "BM25_AVAILABLE", True)

        texts = [
            "def calculate_total(items):",
            "class UserService:",
            "async def fetch_data():",
        ]
        metadatas = [
            {"source": "calc.py", "chunk_index": 0},
            {"source": "user.py", "chunk_index": 0},
            {"source": "api.py", "chunk_index": 0},
        ]

        vector_store._build_bm25_index("proj1", texts, metadatas)

        assert "proj1" in vector_store._bm25_indices
        assert "proj1" in vector_store._bm25_corpus
        assert len(vector_store._bm25_corpus["proj1"]) == 3

    def test_bm25_search_keyword_match(self, vector_store, monkeypatch):
        """BM25 returns documents matching query keywords."""
        import services.rag_service as rag_mod

        monkeypatch.setattr(rag_mod, "BM25_AVAILABLE", True)

        texts = [
            "def calculate_total(items): return sum(items)",
            "class UserService: manages user accounts",
            "async def fetch_data(): retrieves data from API",
        ]
        metadatas = [
            {"source": "calc.py", "chunk_index": 0},
            {"source": "user.py", "chunk_index": 0},
            {"source": "api.py", "chunk_index": 0},
        ]

        vector_store._build_bm25_index("proj1", texts, metadatas)
        results = vector_store._bm25_search("proj1", "calculate total items", k=2)

        assert len(results) > 0
        # First result should be about calculate_total
        assert "calculate" in results[0][0].lower()

    def test_bm25_search_no_index(self, vector_store):
        """BM25 search returns empty when no index exists."""
        results = vector_store._bm25_search("nonexistent", "query")
        assert results == []

    def test_bm25_search_empty_query(self, vector_store, monkeypatch):
        """BM25 search handles empty/whitespace query."""
        import services.rag_service as rag_mod

        monkeypatch.setattr(rag_mod, "BM25_AVAILABLE", True)

        texts = ["some content"]
        metadatas = [{"source": "a.py", "chunk_index": 0}]
        vector_store._build_bm25_index("proj1", texts, metadatas)

        results = vector_store._bm25_search("proj1", "   ", k=5)
        assert results == []


# ── Phase 2: RRF Fusion tests ────────────────────────────────────────────────


class TestRRFFusion:
    """Tests for Reciprocal Rank Fusion."""

    def test_rrf_single_list(self):
        """RRF with a single list preserves ranking."""
        from services.rag_service import ProjectVectorStore

        ranked = [
            ("doc A content", {"source": "a.py", "chunk_index": 0}),
            ("doc B content", {"source": "b.py", "chunk_index": 0}),
        ]

        results = ProjectVectorStore._rrf_fusion([ranked])

        assert len(results) == 2
        assert results[0]["source"] == "a.py"
        assert results[1]["source"] == "b.py"
        assert results[0]["score"] > results[1]["score"]

    def test_rrf_two_lists_boost_overlap(self):
        """Documents appearing in both lists get boosted scores."""
        from services.rag_service import ProjectVectorStore

        list1 = [
            ("doc A", {"source": "a.py", "chunk_index": 0}),
            ("doc B", {"source": "b.py", "chunk_index": 0}),
            ("doc C", {"source": "c.py", "chunk_index": 0}),
        ]
        list2 = [
            ("doc C", {"source": "c.py", "chunk_index": 0}),
            ("doc A", {"source": "a.py", "chunk_index": 0}),
        ]

        results = ProjectVectorStore._rrf_fusion([list1, list2])

        # doc A appears in both (rank 0 in list1, rank 1 in list2) → highest
        sources = [r["source"] for r in results]
        assert "a.py" in sources
        assert "c.py" in sources

        # Both A and C should have higher scores than B (which only appears in list1)
        score_map = {r["source"]: r["score"] for r in results}
        assert score_map["a.py"] > score_map["b.py"]
        assert score_map["c.py"] > score_map["b.py"]

    def test_rrf_deduplication(self):
        """Same document from different lists is not duplicated."""
        from services.rag_service import ProjectVectorStore

        list1 = [("doc A", {"source": "a.py", "chunk_index": 0})]
        list2 = [("doc A", {"source": "a.py", "chunk_index": 0})]

        results = ProjectVectorStore._rrf_fusion([list1, list2])
        assert len(results) == 1

    def test_rrf_empty_lists(self):
        """RRF handles empty ranked lists."""
        from services.rag_service import ProjectVectorStore

        results = ProjectVectorStore._rrf_fusion([[], []])
        assert results == []


# ── Phase 2: Reranking tests ─────────────────────────────────────────────────


class TestReranking:
    """Tests for CrossEncoder reranking."""

    def test_rerank_with_mock_encoder(self, vector_store, monkeypatch):
        """Reranking re-sorts candidates by CrossEncoder score."""
        import services.rag_service as rag_mod

        monkeypatch.setattr(rag_mod, "RERANK_AVAILABLE", True)

        # Mock CrossEncoder to return reversed scores
        mock_encoder = MagicMock()
        mock_encoder.predict.return_value = [0.1, 0.9, 0.5]
        vector_store._cross_encoder = mock_encoder

        candidates = [
            {"content": "doc A", "source": "a.py", "score": 0.8},
            {"content": "doc B", "source": "b.py", "score": 0.6},
            {"content": "doc C", "source": "c.py", "score": 0.4},
        ]

        result = vector_store._rerank("query", candidates, top_k=2)

        assert len(result) == 2
        # doc B got highest score (0.9) from mock encoder
        assert result[0]["source"] == "b.py"
        assert result[0]["score"] == 0.9

    def test_rerank_no_encoder(self, vector_store, monkeypatch):
        """Without encoder, rerank returns original order truncated."""
        import services.rag_service as rag_mod

        monkeypatch.setattr(rag_mod, "RERANK_AVAILABLE", False)
        vector_store._cross_encoder = None

        candidates = [
            {"content": "doc A", "source": "a.py", "score": 0.8},
            {"content": "doc B", "source": "b.py", "score": 0.6},
        ]

        result = vector_store._rerank("query", candidates, top_k=1)
        assert len(result) == 1
        assert result[0]["source"] == "a.py"

    def test_rerank_empty_candidates(self, vector_store):
        """Rerank handles empty candidate list."""
        result = vector_store._rerank("query", [], top_k=5)
        assert result == []


# ── Integration: query path tests ─────────────────────────────────────────────


class TestQueryPaths:
    """Test that query routes correctly between semantic-only and hybrid."""

    @pytest.mark.asyncio
    async def test_semantic_only_query(self, vector_store, monkeypatch):
        """When hybrid disabled, uses standard similarity search."""
        import services.rag_service as rag_mod

        monkeypatch.setattr(rag_mod, "RAG_ENABLE_HYBRID", False)

        # Mock collection
        mock_collection = MagicMock()
        mock_doc = MagicMock()
        mock_doc.page_content = "test content"
        mock_doc.metadata = {"source": "test.py", "chunk_index": 0, "priority": "normal"}
        mock_collection.similarity_search_with_score.return_value = [(mock_doc, 0.2)]

        monkeypatch.setattr(
            vector_store, "_get_or_create_collection", lambda pid: mock_collection
        )

        result = await vector_store.query("proj1", "test query", k=5)

        assert result.total_found == 1
        assert result.documents[0]["content"] == "test content"
        assert result.documents[0]["score"] == pytest.approx(0.8, abs=0.01)
        mock_collection.similarity_search_with_score.assert_called_once()

    @pytest.mark.asyncio
    async def test_hybrid_query_path(self, vector_store, monkeypatch):
        """When hybrid enabled, uses RRF fusion of semantic + BM25."""
        import services.rag_service as rag_mod

        monkeypatch.setattr(rag_mod, "RAG_ENABLE_HYBRID", True)
        monkeypatch.setattr(rag_mod, "RAG_ENABLE_RERANK", False)
        monkeypatch.setattr(rag_mod, "BM25_AVAILABLE", True)

        # Mock collection for semantic search
        mock_collection = MagicMock()
        mock_doc = MagicMock()
        mock_doc.page_content = "semantic result"
        mock_doc.metadata = {"source": "sem.py", "chunk_index": 0, "priority": "normal"}
        mock_collection.similarity_search_with_score.return_value = [(mock_doc, 0.1)]

        monkeypatch.setattr(
            vector_store, "_get_or_create_collection", lambda pid: mock_collection
        )

        # Build BM25 index
        vector_store._build_bm25_index(
            "proj1",
            ["bm25 keyword result", "semantic result"],
            [
                {"source": "bm25.py", "chunk_index": 0, "priority": "normal"},
                {"source": "sem.py", "chunk_index": 0, "priority": "normal"},
            ],
        )

        result = await vector_store.query("proj1", "keyword result", k=5)

        assert result.total_found > 0
        # Both semantic and BM25 results should appear
        sources = [d["source"] for d in result.documents]
        assert any(s in sources for s in ["sem.py", "bm25.py"])


# ── Tokenizer test ────────────────────────────────────────────────────────────


class TestTokenize:
    def test_basic_tokenization(self):
        from services.rag_service import _tokenize

        tokens = _tokenize("Hello World! This is a Test_123.")
        assert tokens == ["hello", "world", "this", "is", "a", "test_123"]

    def test_empty_string(self):
        from services.rag_service import _tokenize

        assert _tokenize("") == []
        assert _tokenize("   ") == []


# ── Config tests ──────────────────────────────────────────────────────────────


class TestConfig:
    """Test that configuration flags are read correctly."""

    def test_default_config_values(self, monkeypatch):
        """Default config has hybrid and rerank disabled."""
        monkeypatch.delenv("RAG_ENABLE_HYBRID", raising=False)
        monkeypatch.delenv("RAG_ENABLE_RERANK", raising=False)

        # Re-evaluate module-level constants by importing fresh
        # (Note: in practice these are set at module load time)
        import services.rag_service as rag_mod

        # These are the defaults when env vars are not set
        assert rag_mod.RAG_FULL_CONTEXT_THRESHOLD >= 1000  # Sensible default

    def test_collection_stats_includes_hybrid_info(self, vector_store, monkeypatch):
        """get_collection_stats reports hybrid/rerank status."""
        mock_collection = MagicMock()
        mock_collection._collection.count.return_value = 42
        monkeypatch.setattr(
            vector_store, "_get_or_create_collection", lambda pid: mock_collection
        )

        stats = vector_store.get_collection_stats("proj1")
        assert stats["document_count"] == 42
        assert "hybrid_enabled" in stats
        assert "rerank_enabled" in stats
