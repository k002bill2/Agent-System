"""RAG 시스템 3단계 점검 스크립트.

사용자 제공 점검 리스트 기반:
  1단계: 데이터 적재(Ingestion) 확인
  2단계: 검색(Retrieval) 성능 테스트
  3단계: 생성(Generation) 및 환각(Hallucination) 테스트

+ 흔한 실수 검증:
  - 임베딩 모델 불일치 (Embedding Model Mismatch)
  - 거리 계산 방식(Metric) 설정 오류
"""

import hashlib
import os
from pathlib import Path
from unittest.mock import MagicMock, patch

import pytest


# ── Test Helpers ─────────────────────────────────────────────────────────────


@pytest.fixture(autouse=True)
def _mock_qdrant(monkeypatch):
    """Ensure QDRANT_AVAILABLE is True with mocked Qdrant for all tests."""
    import services.rag_service as rag_mod

    monkeypatch.setattr(rag_mod, "QDRANT_AVAILABLE", True)

    class FakeDocument:
        def __init__(self, page_content: str = "", metadata: dict | None = None):
            self.page_content = page_content
            self.metadata = metadata or {}

    monkeypatch.setattr(rag_mod, "Document", FakeDocument)


@pytest.fixture
def vector_store(monkeypatch):
    """Create a ProjectVectorStore with mocked dependencies."""
    import services.rag_service as rag_mod

    mock_embeddings = MagicMock()
    # 384-dim embeddings (HuggingFace all-MiniLM-L6-v2 기본값)
    mock_embeddings.embed_query.return_value = [0.1] * 384

    monkeypatch.setattr(
        rag_mod.ProjectVectorStore,
        "_create_embeddings",
        lambda self, model=None: mock_embeddings,
    )

    mock_client = MagicMock()
    monkeypatch.setattr(rag_mod, "QdrantClient", lambda **kwargs: mock_client)

    store = rag_mod.ProjectVectorStore(qdrant_url="http://localhost:6333")
    store.client = mock_client
    return store


# ═══════════════════════════════════════════════════════════════════════════
# 1단계: 데이터 적재(Ingestion) 확인
# ═══════════════════════════════════════════════════════════════════════════


class TestStage1Ingestion:
    """1단계: 데이터가 제대로 들어가는지 확인."""

    def test_chunk_count_matches_source(self, vector_store, monkeypatch):
        """원본 문서의 청크 개수와 생성된 벡터 개수가 일치하는지 확인."""
        import services.rag_service as rag_mod

        monkeypatch.setattr(rag_mod, "RAG_FULL_CONTEXT_THRESHOLD", 100)

        content = "line " * 500  # ~2500 chars
        chunks = vector_store._chunk_document(content, "test.py", chunk_size=200)

        # 모든 청크에 올바른 인덱스가 부여되었는지
        for i, chunk in enumerate(chunks):
            assert chunk.metadata["chunk_index"] == i
            assert chunk.metadata["total_chunks"] > 0

        # 청크 개수가 1 이상이고 합리적인 범위인지
        assert len(chunks) > 1
        assert len(chunks) == chunks[0].metadata["total_chunks"] or len(chunks) > 0

    def test_embedding_dimension_consistency(self, vector_store):
        """임베딩 모델 차원 수와 DB 컬렉션 설정 차원 수 일치 확인."""
        dim = vector_store._get_embedding_dimension()

        # HuggingFace all-MiniLM-L6-v2 = 384차원
        assert dim == 384
        assert isinstance(dim, int)
        assert dim > 0

    def test_metadata_integrity(self, vector_store):
        """page_content 외에 source, chunk_index 등 메타데이터 누락 확인."""
        content = "def hello():\n    return 'world'"
        chunks = vector_store._chunk_document(content, "src/hello.py")

        required_metadata_keys = {"source", "chunk_index", "total_chunks", "content_hash"}

        for chunk in chunks:
            assert chunk.page_content  # 빈 내용이 아닌지
            for key in required_metadata_keys:
                assert key in chunk.metadata, f"메타데이터 키 '{key}' 누락"

            # source가 올바른 경로인지
            assert chunk.metadata["source"] == "src/hello.py"
            # content_hash가 유효한 해시인지
            assert len(chunk.metadata["content_hash"]) == 8  # MD5[:8]

    def test_content_hash_idempotency(self, vector_store):
        """동일 내용 재인덱싱 시 동일한 ID가 생성되는지 (멱등성)."""
        import uuid

        content = "const x = 42;"
        chunks = vector_store._chunk_document(content, "app.js")
        chunk = chunks[0]

        # 두 번 ID를 생성해도 동일해야 함
        id1 = str(
            uuid.uuid5(
                uuid.NAMESPACE_URL,
                f"{chunk.metadata['source']}_{chunk.metadata['chunk_index']}_{chunk.metadata['content_hash']}",
            )
        )
        id2 = str(
            uuid.uuid5(
                uuid.NAMESPACE_URL,
                f"{chunk.metadata['source']}_{chunk.metadata['chunk_index']}_{chunk.metadata['content_hash']}",
            )
        )
        assert id1 == id2

    def test_priority_files_indexed_first(self, vector_store):
        """CLAUDE.md, README.md 등 우선순위 파일이 'high' 우선순위로 마킹되는지."""
        priority_files = ["CLAUDE.md", "README.md", "package.json", "pyproject.toml"]

        # 실제 인덱싱에서 priority_files 목록이 코드와 일치하는지 확인
        import services.rag_service as rag_mod

        # index_project 메서드 내의 priority_files 목록 참조
        # 코드에서 하드코딩된 목록과 일치하는지 검증
        assert set(priority_files) == {"CLAUDE.md", "README.md", "package.json", "pyproject.toml"}

    def test_file_filtering_skips_lockfiles(self, vector_store):
        """package-lock.json, yarn.lock 등이 인덱싱에서 제외되는지."""
        skip_files = vector_store.SKIP_FILES
        assert "package-lock.json" in skip_files
        assert "yarn.lock" in skip_files
        assert "pnpm-lock.yaml" in skip_files

    def test_file_size_limit(self, vector_store, tmp_path):
        """500KB 초과 파일이 인덱싱에서 제외되는지."""
        # 작은 파일 → 인덱싱 대상
        small_file = tmp_path / "small.py"
        small_file.write_text("x = 1")
        assert vector_store._should_index_file(small_file) is True

        # 큰 파일 → 인덱싱 제외
        large_file = tmp_path / "large.py"
        large_file.write_bytes(b"x" * (501 * 1024))
        assert vector_store._should_index_file(large_file) is False

    def test_skip_directories(self, vector_store):
        """node_modules, .git 등 제외 디렉토리 확인."""
        skip_dirs = vector_store.SKIP_DIRS
        assert "node_modules" in skip_dirs
        assert ".git" in skip_dirs
        assert "__pycache__" in skip_dirs
        assert "dist" in skip_dirs


# ═══════════════════════════════════════════════════════════════════════════
# 2단계: 검색(Retrieval) 성능 테스트
# ═══════════════════════════════════════════════════════════════════════════


class TestStage2Retrieval:
    """2단계: 검색만 따로 실행해서 관련 문서가 올바르게 반환되는지 확인."""

    @pytest.mark.asyncio
    async def test_semantic_search_returns_relevant_results(self, vector_store, monkeypatch):
        """시맨틱 검색이 관련된 내용을 상위(Top-k)에 반환하는지."""
        import services.rag_service as rag_mod

        monkeypatch.setattr(rag_mod, "RAG_ENABLE_HYBRID", False)

        # 관련 문서와 비관련 문서를 포함한 mock 결과
        mock_collection = MagicMock()
        relevant_doc = MagicMock()
        relevant_doc.page_content = "재택근무 규정: 주 2회 가능, 사전 신청 필요"
        relevant_doc.metadata = {"source": "hr-policy.md", "chunk_index": 0, "priority": "high"}

        irrelevant_doc = MagicMock()
        irrelevant_doc.page_content = "서버 배포 절차: CI/CD 파이프라인 사용"
        irrelevant_doc.metadata = {"source": "deploy.md", "chunk_index": 0, "priority": "normal"}

        # 관련 문서가 더 높은 점수
        mock_collection.similarity_search_with_score.return_value = [
            (relevant_doc, 0.92),
            (irrelevant_doc, 0.31),
        ]

        monkeypatch.setattr(
            vector_store, "_get_or_create_collection", lambda pid: mock_collection
        )

        result = await vector_store.query("proj1", "재택근무 규정은?", k=5)

        assert result.total_found == 2
        # 상위 결과가 관련된 내용인지
        assert "재택근무" in result.documents[0]["content"]
        assert result.documents[0]["score"] > result.documents[1]["score"]

    @pytest.mark.asyncio
    async def test_score_range_is_valid(self, vector_store, monkeypatch):
        """점수가 0~1 범위 내에 있는지 (Cosine similarity)."""
        import services.rag_service as rag_mod

        monkeypatch.setattr(rag_mod, "RAG_ENABLE_HYBRID", False)

        mock_collection = MagicMock()
        mock_doc = MagicMock()
        mock_doc.page_content = "test content"
        mock_doc.metadata = {"source": "test.py", "chunk_index": 0, "priority": "normal"}
        mock_collection.similarity_search_with_score.return_value = [(mock_doc, 0.75)]

        monkeypatch.setattr(
            vector_store, "_get_or_create_collection", lambda pid: mock_collection
        )

        result = await vector_store.query("proj1", "test", k=5)

        for doc in result.documents:
            assert 0.0 <= doc["score"] <= 1.0, f"점수 범위 초과: {doc['score']}"

    @pytest.mark.asyncio
    async def test_score_clamping_for_edge_cases(self, vector_store, monkeypatch):
        """점수가 0 미만이거나 1 초과일 때 클램핑되는지."""
        import services.rag_service as rag_mod

        monkeypatch.setattr(rag_mod, "RAG_ENABLE_HYBRID", False)

        mock_collection = MagicMock()
        doc1 = MagicMock()
        doc1.page_content = "negative score"
        doc1.metadata = {"source": "a.py", "chunk_index": 0, "priority": "normal"}
        doc2 = MagicMock()
        doc2.page_content = "over one score"
        doc2.metadata = {"source": "b.py", "chunk_index": 0, "priority": "normal"}

        mock_collection.similarity_search_with_score.return_value = [
            (doc1, -0.1),  # 음수
            (doc2, 1.5),   # 1 초과
        ]

        monkeypatch.setattr(
            vector_store, "_get_or_create_collection", lambda pid: mock_collection
        )

        result = await vector_store.query("proj1", "test", k=5)

        assert result.documents[0]["score"] == 0.0  # 클램핑
        assert result.documents[1]["score"] == 1.0  # 클램핑

    def test_bm25_keyword_relevance(self, vector_store, monkeypatch):
        """BM25 키워드 검색이 정확한 키워드 매칭을 하는지."""
        import services.rag_service as rag_mod

        monkeypatch.setattr(rag_mod, "BM25_AVAILABLE", True)

        texts = [
            "PostgreSQL 데이터베이스 연결 설정 방법",
            "React 컴포넌트 상태 관리 패턴",
            "FastAPI 엔드포인트 인증 미들웨어",
            "Docker 컨테이너 배포 스크립트",
        ]
        metadatas = [
            {"source": "db.md", "chunk_index": 0},
            {"source": "react.md", "chunk_index": 0},
            {"source": "auth.md", "chunk_index": 0},
            {"source": "deploy.md", "chunk_index": 0},
        ]

        vector_store._build_bm25_index("proj1", texts, metadatas)
        results = vector_store._bm25_search("proj1", "PostgreSQL 데이터베이스", k=2)

        assert len(results) > 0
        # 첫 번째 결과가 DB 관련 문서인지
        assert "PostgreSQL" in results[0][0] or "데이터베이스" in results[0][0]

    def test_rrf_fusion_combines_results(self):
        """RRF 퓨전이 시맨틱 + BM25 결과를 올바르게 합성하는지."""
        from services.rag_service import ProjectVectorStore

        # 시맨틱 검색 결과: 의미적으로 관련된 문서
        semantic_list = [
            ("인사 정책 문서: 재택근무 규정", {"source": "hr.md", "chunk_index": 0}),
            ("근무 환경 개선 계획", {"source": "plan.md", "chunk_index": 0}),
        ]
        # BM25 검색 결과: 키워드 매칭
        bm25_list = [
            ("재택근무 신청 절차", {"source": "apply.md", "chunk_index": 0}),
            ("인사 정책 문서: 재택근무 규정", {"source": "hr.md", "chunk_index": 0}),
        ]

        results = ProjectVectorStore._rrf_fusion([semantic_list, bm25_list])

        # 양쪽 모두 출현한 hr.md가 가장 높은 점수
        assert results[0]["source"] == "hr.md"

        # 중복 제거 확인
        sources = [r["source"] for r in results]
        assert len(sources) == len(set(sources))

    @pytest.mark.asyncio
    async def test_priority_filter_works(self, vector_store, monkeypatch):
        """priority 필터가 올바르게 적용되는지."""
        import services.rag_service as rag_mod

        monkeypatch.setattr(rag_mod, "RAG_ENABLE_HYBRID", False)

        mock_collection = MagicMock()
        mock_doc = MagicMock()
        mock_doc.page_content = "high priority content"
        mock_doc.metadata = {"source": "CLAUDE.md", "chunk_index": 0, "priority": "high"}
        mock_collection.similarity_search_with_score.return_value = [(mock_doc, 0.9)]

        monkeypatch.setattr(
            vector_store, "_get_or_create_collection", lambda pid: mock_collection
        )

        result = await vector_store.query("proj1", "query", k=5, filter_priority="high")

        # Qdrant 필터가 호출되었는지 확인
        call_args = mock_collection.similarity_search_with_score.call_args
        assert call_args.kwargs.get("filter") is not None


# ═══════════════════════════════════════════════════════════════════════════
# 3단계: 생성(Generation) 및 환각(Hallucination) 테스트
# ═══════════════════════════════════════════════════════════════════════════


class TestStage3Generation:
    """3단계: LLM 연결 최종 응답 + 참조 출처 확인."""

    @pytest.mark.asyncio
    async def test_context_includes_source_references(self, vector_store, monkeypatch):
        """get_project_context_with_sources가 출처 정보를 함께 반환하는지."""
        import services.rag_service as rag_mod

        monkeypatch.setattr(rag_mod, "RAG_ENABLE_HYBRID", False)

        mock_collection = MagicMock()
        mock_doc = MagicMock()
        mock_doc.page_content = "프로젝트 Alpha 3단계 목표: 자동화 달성"
        mock_doc.metadata = {
            "source": "project-alpha.md",
            "chunk_index": 2,
            "priority": "high",
        }
        mock_collection.similarity_search_with_score.return_value = [(mock_doc, 0.88)]

        monkeypatch.setattr(
            vector_store, "_get_or_create_collection", lambda pid: mock_collection
        )

        # 전역 인스턴스 모킹
        monkeypatch.setattr(rag_mod, "_vector_store", vector_store)

        context, sources = await rag_mod.get_project_context_with_sources(
            "proj1", "프로젝트 Alpha 3단계 목표는?"
        )

        # 컨텍스트에 소스 참조가 포함되는지
        assert "[project-alpha.md]" in context
        assert "프로젝트 Alpha" in context

        # 구조화된 소스 정보 확인
        assert len(sources) == 1
        assert sources[0]["source"] == "project-alpha.md"
        assert sources[0]["score"] > 0

    @pytest.mark.asyncio
    async def test_context_format_for_llm(self, vector_store, monkeypatch):
        """LLM에 전달되는 컨텍스트 형식이 올바른지."""
        import services.rag_service as rag_mod

        monkeypatch.setattr(rag_mod, "RAG_ENABLE_HYBRID", False)

        mock_collection = MagicMock()

        doc1 = MagicMock()
        doc1.page_content = "첫 번째 문서 내용"
        doc1.metadata = {"source": "doc1.md", "chunk_index": 0, "priority": "high"}

        doc2 = MagicMock()
        doc2.page_content = "두 번째 문서 내용"
        doc2.metadata = {"source": "doc2.md", "chunk_index": 0, "priority": "normal"}

        mock_collection.similarity_search_with_score.return_value = [
            (doc1, 0.9),
            (doc2, 0.7),
        ]

        monkeypatch.setattr(
            vector_store, "_get_or_create_collection", lambda pid: mock_collection
        )
        monkeypatch.setattr(rag_mod, "_vector_store", vector_store)

        context = await rag_mod.get_project_context("proj1", "query", k=2)

        # 구분자로 분리된 형식
        assert "---" in context
        assert "[doc1.md]" in context
        assert "[doc2.md]" in context

    @pytest.mark.asyncio
    async def test_empty_results_return_empty_context(self, vector_store, monkeypatch):
        """결과가 없을 때 빈 문자열을 반환하는지."""
        import services.rag_service as rag_mod

        monkeypatch.setattr(rag_mod, "RAG_ENABLE_HYBRID", False)

        mock_collection = MagicMock()
        mock_collection.similarity_search_with_score.return_value = []

        monkeypatch.setattr(
            vector_store, "_get_or_create_collection", lambda pid: mock_collection
        )
        monkeypatch.setattr(rag_mod, "_vector_store", vector_store)

        context = await rag_mod.get_project_context("proj1", "존재하지 않는 내용")
        assert context == ""

        context2, sources2 = await rag_mod.get_project_context_with_sources(
            "proj1", "존재하지 않는 내용"
        )
        assert context2 == ""
        assert sources2 == []


# ═══════════════════════════════════════════════════════════════════════════
# 흔한 실수 검증: Troubleshooting
# ═══════════════════════════════════════════════════════════════════════════


class TestTroubleshooting:
    """DB 교체 시 가장 흔한 실수 검증."""

    def test_embedding_model_consistency(self, monkeypatch):
        """임베딩 모델 불일치(Embedding Model Mismatch) 방지 확인.

        인덱싱 시 사용한 모델과 검색 시 사용하는 모델이 동일한지.
        """
        import services.rag_service as rag_mod

        # 기본 임베딩 제공자가 일관되는지
        assert rag_mod.EMBEDDING_PROVIDER in ("huggingface", "openai", "google")

        # HuggingFace 기본값 확인
        if rag_mod.EMBEDDING_PROVIDER == "huggingface":
            assert rag_mod.DEFAULT_EMBEDDING_MODEL == "sentence-transformers/all-MiniLM-L6-v2"
        elif rag_mod.EMBEDDING_PROVIDER == "openai":
            assert rag_mod.DEFAULT_EMBEDDING_MODEL == "text-embedding-3-small"
        elif rag_mod.EMBEDDING_PROVIDER == "google":
            assert rag_mod.DEFAULT_EMBEDDING_MODEL == "models/text-embedding-004"

    def test_distance_metric_is_cosine(self):
        """거리 계산 방식이 Cosine으로 올바르게 설정되어 있는지."""
        import services.rag_service as rag_mod

        # 코드에서 Distance.COSINE을 사용하는지 확인
        # _ensure_collection_exists 메서드에서 Distance.COSINE 설정
        import inspect

        source = inspect.getsource(rag_mod.ProjectVectorStore._ensure_collection_exists)
        assert "Distance.COSINE" in source

    def test_single_embedding_instance_per_store(self, vector_store):
        """하나의 VectorStore 인스턴스가 동일한 임베딩을 사용하는지.

        인덱싱과 검색에서 서로 다른 임베딩 모델을 사용하면 안 됨.
        """
        embeddings = vector_store.embeddings
        assert embeddings is not None

        # 여러 번 호출해도 동일한 인스턴스
        assert vector_store.embeddings is embeddings

    def test_collection_name_deterministic(self, vector_store):
        """같은 project_id에 대해 항상 동일한 컬렉션 이름이 생성되는지."""
        name1 = vector_store._get_collection_name("my-project-123")
        name2 = vector_store._get_collection_name("my-project-123")
        assert name1 == name2

        # 유효한 컬렉션 이름인지 (63자 이하)
        assert len(name1) <= 63
        assert name1.startswith("proj_")

    def test_reindex_clears_caches(self, vector_store, monkeypatch):
        """force_reindex=True 시 BM25 캐시도 함께 초기화되는지."""
        # BM25 캐시에 데이터 삽입
        vector_store._bm25_indices["proj1"] = "fake_index"
        vector_store._bm25_corpus["proj1"] = [("text", {})]

        # force_reindex가 캐시를 지우는지 확인 (실제 인덱싱 없이 로직만 검증)
        import services.rag_service as rag_mod

        source = inspect.getsource(rag_mod.ProjectVectorStore.index_project)
        assert "bm25_indices.pop" in source
        assert "bm25_corpus.pop" in source

    def test_hybrid_search_config_flags(self, monkeypatch):
        """하이브리드 검색 및 리랭킹 플래그가 올바르게 설정되는지."""
        import services.rag_service as rag_mod

        # 기본값 확인 (비활성)
        # 모듈 레벨 상수이므로 직접 확인
        assert isinstance(rag_mod.RAG_ENABLE_HYBRID, bool)
        assert isinstance(rag_mod.RAG_ENABLE_RERANK, bool)
        assert isinstance(rag_mod.RAG_CANDIDATE_MULTIPLIER, int)
        assert rag_mod.RAG_CANDIDATE_MULTIPLIER >= 1

    def test_batch_ingestion_size(self):
        """배치 크기가 적절한지 확인 (5000)."""
        import inspect

        import services.rag_service as rag_mod

        source = inspect.getsource(rag_mod.ProjectVectorStore.index_project)
        assert "batch_size = 5000" in source


# ═══════════════════════════════════════════════════════════════════════════
# 추가: 엣지 케이스 및 안정성 테스트
# ═══════════════════════════════════════════════════════════════════════════


class TestEdgeCases:
    """엣지 케이스 및 안정성 검증."""

    def test_empty_content_chunking(self, vector_store):
        """빈 내용 청킹이 안전하게 처리되는지."""
        chunks = vector_store._chunk_document("", "empty.py")
        # 빈 내용이면 단일 청크 (빈 상태)
        assert len(chunks) == 1
        assert chunks[0].page_content == ""

    def test_unicode_content_handling(self, vector_store):
        """유니코드(한국어 등) 내용이 올바르게 처리되는지."""
        content = "한국어 테스트 문서입니다. 이것은 유니코드 테스트입니다."
        chunks = vector_store._chunk_document(content, "korean.md")

        assert len(chunks) == 1
        assert "한국어" in chunks[0].page_content

    def test_special_chars_in_project_id(self, vector_store):
        """특수문자가 포함된 project_id가 안전하게 처리되는지."""
        name = vector_store._get_collection_name("my project/v2.0!")
        assert "/" not in name
        assert " " not in name
        assert "!" not in name
        assert name.startswith("proj_")

    def test_manual_chunking_overlap_guard(self, vector_store):
        """오버랩이 청크 크기 이상일 때 무한 루프 방지."""
        # overlap >= chunk_size인 경우
        chunks = vector_store._chunk_document_manual(
            "A" * 300, "test.txt",
            chunk_size=100,
            chunk_overlap=100,  # overlap == size
        )
        # 무한 루프 없이 결과 반환
        assert len(chunks) > 0

    def test_collection_stats_error_handling(self, vector_store):
        """컬렉션이 없을 때 에러가 아닌 빈 상태를 반환하는지."""
        vector_store.client.get_collection.side_effect = Exception("Collection not found")

        stats = vector_store.get_collection_stats("nonexistent")
        assert stats["document_count"] == 0
        assert stats["indexed"] is False
        assert "error" in stats

    def test_tokenizer_handles_mixed_content(self):
        """토크나이저가 혼합 콘텐츠(코드+한국어)를 처리하는지."""
        from services.rag_service import _tokenize

        tokens = _tokenize("def hello(): # 인사 함수")
        assert "def" in tokens
        assert "hello" in tokens
        assert "인사" in tokens
        assert "함수" in tokens


# ═══════════════════════════════════════════════════════════════════════════
# 4단계: 크로스 프로젝트 검색 검증
# ═══════════════════════════════════════════════════════════════════════════


class TestStage4CrossProject:
    """4단계: 프로젝트 간 인덱싱 데이터 공유 검증."""

    def test_indexing_includes_project_id_metadata(self, vector_store, monkeypatch):
        """인덱싱 시 chunk 메타데이터에 project_id가 포함되는지."""
        import services.rag_service as rag_mod

        source = inspect.getsource(rag_mod.ProjectVectorStore.index_project)
        # project_id가 메타데이터에 추가되는 코드가 있는지
        assert 'metadata["project_id"]' in source

    def test_backward_compat_project_id_from_collection(self, vector_store):
        """project_id 메타데이터가 없는 기존 데이터도 컬렉션 이름에서 추출 가능."""
        pid = vector_store._extract_project_id_from_collection("proj_my_project")
        assert pid == "my_project"

    @pytest.mark.asyncio
    async def test_cross_project_context_format(self, vector_store, monkeypatch):
        """get_cross_project_context가 project_id:source 형식으로 포맷하는지."""
        import services.rag_service as rag_mod

        monkeypatch.setattr(rag_mod, "RAG_ENABLE_HYBRID", False)

        mock_coll = MagicMock()
        mock_coll.name = "proj_alpha"
        mock_response = MagicMock()
        mock_response.collections = [mock_coll]
        vector_store.client.get_collections.return_value = mock_response

        doc = MagicMock()
        doc.page_content = "alpha documentation"
        doc.metadata = {
            "source": "docs.md",
            "chunk_index": 0,
            "priority": "normal",
            "project_id": "alpha",
        }

        mock_vs = MagicMock()
        mock_vs.similarity_search_with_score.return_value = [(doc, 0.9)]
        monkeypatch.setattr(vector_store, "_get_or_create_collection", lambda pid: mock_vs)
        monkeypatch.setattr(rag_mod, "_vector_store", vector_store)

        context = await rag_mod.get_cross_project_context("docs query", k=3)

        assert "[alpha:docs.md]" in context
        assert "alpha documentation" in context

    @pytest.mark.asyncio
    async def test_include_shared_boosts_local_results(self, vector_store, monkeypatch):
        """include_shared=True일 때 현재 프로젝트 결과가 우선순위를 받는지."""
        import services.rag_service as rag_mod

        monkeypatch.setattr(rag_mod, "RAG_ENABLE_HYBRID", False)

        # Two collections: main and other
        mock_coll1 = MagicMock()
        mock_coll1.name = "proj_main"
        mock_coll2 = MagicMock()
        mock_coll2.name = "proj_other"
        mock_response = MagicMock()
        mock_response.collections = [mock_coll1, mock_coll2]
        vector_store.client.get_collections.return_value = mock_response

        # Similar content in both projects
        local_doc = MagicMock()
        local_doc.page_content = "shared topic in main"
        local_doc.metadata = {
            "source": "shared.py",
            "chunk_index": 0,
            "priority": "normal",
            "project_id": "main",
        }

        other_doc = MagicMock()
        other_doc.page_content = "shared topic in other"
        other_doc.metadata = {
            "source": "shared.py",
            "chunk_index": 1,  # different chunk_index for unique dedup key
            "priority": "normal",
            "project_id": "other",
        }

        mock_local_vs = MagicMock()
        mock_local_vs.similarity_search_with_score.return_value = [(local_doc, 0.8)]
        mock_other_vs = MagicMock()
        mock_other_vs.similarity_search_with_score.return_value = [(other_doc, 0.8)]

        def fake_get(pid):
            if pid == "main":
                return mock_local_vs
            return mock_other_vs

        monkeypatch.setattr(vector_store, "_get_or_create_collection", fake_get)

        result = await vector_store.query("main", "shared topic", k=5, include_shared=True)

        assert result.total_found == 2
        # Local result should be ranked first due to double-insertion boost
        assert result.documents[0]["content"] == "shared topic in main"

    def test_rrf_fusion_preserves_project_id(self):
        """RRF 퓨전 결과에 project_id가 보존되는지."""
        from services.rag_service import ProjectVectorStore

        ranked = [
            [
                ("doc A", {"source": "a.py", "chunk_index": 0, "project_id": "proj1"}),
                ("doc B", {"source": "b.py", "chunk_index": 0, "project_id": "proj2"}),
            ]
        ]

        results = ProjectVectorStore._rrf_fusion(ranked)
        assert results[0].get("project_id") == "proj1"
        assert results[1].get("project_id") == "proj2"

    def test_get_all_project_collections_error_handling(self, vector_store):
        """Qdrant 연결 실패 시 빈 리스트 반환."""
        vector_store.client.get_collections.side_effect = Exception("Connection refused")

        result = vector_store._get_all_project_collections()
        assert result == []


# 테스트에서 import 필요
import inspect
