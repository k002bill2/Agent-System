"""Pytest configuration for backend tests."""

import os
import sys
from pathlib import Path

import pytest
import pytest_asyncio
from httpx import AsyncClient, ASGITransport

# Add src/backend to path
backend_path = Path(__file__).parent.parent.parent / "src" / "backend"
sys.path.insert(0, str(backend_path))

# Set test environment
os.environ["USE_DATABASE"] = "false"
os.environ["LLM_PROVIDER"] = "ollama"
os.environ["OLLAMA_MODEL"] = "qwen2.5:7b"

# RateLimitService is a process-global singleton keyed by client IP, and every
# suite here shares the one TestClient IP. A request-heavy module therefore
# drains the shared free-tier budget (60 req/min) and whichever module runs
# next fails with 429 — an ordering-dependent break invisible in a single-file
# run. test_playground_authorization.py already disables the middleware for
# exactly this reason; doing it once here covers every suite.
# Nothing loses coverage: the service itself is tested directly in
# test_rate_limit_service.py, and the 429 asserted in
# tests/backend/api/test_agent_registry.py comes from the independent
# api/v1/rate_limiter.py, which does not read this flag.
os.environ["RATE_LIMIT_ENABLED"] = "false"

# Force HuggingFace offline so tests never download models (HF 429 flake
# guard for every pytest invocation, local and CI). An unmocked model load
# fails loudly instead of hitting the network — mark such tests
# @pytest.mark.network and run them with: HF_HUB_OFFLINE=0 pytest -m network
os.environ.setdefault("HF_HUB_OFFLINE", "1")
os.environ.setdefault("TRANSFORMERS_OFFLINE", "1")


@pytest.fixture(scope="session")
def anyio_backend():
    """Use asyncio for async tests."""
    return "asyncio"


@pytest_asyncio.fixture
async def app():
    """Create FastAPI app for testing."""
    from api.app import create_app
    from api.deps import set_engine, clear_engine
    from orchestrator import OrchestrationEngine

    # Set up engine for tests (simulating lifespan startup)
    engine = OrchestrationEngine()
    set_engine(engine)

    test_app = create_app(title="Test Agent System", debug=True)
    yield test_app

    # Cleanup (simulating lifespan shutdown)
    clear_engine()


@pytest_asyncio.fixture
async def authenticated_app(app):
    """App with a deterministic privileged test identity for protected API tests."""
    from types import SimpleNamespace

    from api.deps import get_current_user

    app.dependency_overrides[get_current_user] = lambda: SimpleNamespace(
        id="test-admin", role="admin", is_admin=True, is_active=True
    )
    yield app
    app.dependency_overrides.pop(get_current_user, None)


@pytest_asyncio.fixture
async def client(app):
    """Create async HTTP client for testing."""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        yield ac


@pytest_asyncio.fixture
async def engine():
    """Create orchestration engine for testing."""
    from orchestrator import OrchestrationEngine

    engine = OrchestrationEngine()
    yield engine


@pytest_asyncio.fixture
async def session_id(engine):
    """Create a test session."""
    session_id = await engine.create_session()
    yield session_id
    # Cleanup
    await engine.delete_session(session_id)


# Note: Agent Registry reset is handled in individual test setup_method
# to avoid conflicts with class-based test fixtures
