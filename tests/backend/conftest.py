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
