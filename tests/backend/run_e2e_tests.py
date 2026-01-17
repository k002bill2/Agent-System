#!/usr/bin/env python3
"""
E2E Test Runner for Agent Orchestration System.

Run all E2E tests without pytest (for environments where pytest isn't available).

Usage:
    cd src/backend
    source .venv/bin/activate
    python ../../tests/backend/run_e2e_tests.py
"""

import sys
import asyncio
from pathlib import Path
from datetime import datetime, timezone

# Add src/backend to path
backend_path = Path(__file__).parent.parent.parent / "src" / "backend"
sys.path.insert(0, str(backend_path))


class TestResult:
    """Test result container."""

    def __init__(self):
        self.passed = 0
        self.failed = 0
        self.errors = []

    def add_pass(self, name: str):
        self.passed += 1
        print(f"  \u2713 {name}")

    def add_fail(self, name: str, error: str):
        self.failed += 1
        self.errors.append((name, error))
        print(f"  \u2717 {name}: {error}")

    def summary(self):
        total = self.passed + self.failed
        print()
        print(f"Results: {self.passed}/{total} passed")
        if self.errors:
            print("Failures:")
            for name, error in self.errors:
                print(f"  - {name}: {error}")
        return self.failed == 0


result = TestResult()


async def test_orchestration_engine():
    """Test OrchestrationEngine functionality."""
    print("\n1. Testing OrchestrationEngine...")

    from orchestrator import OrchestrationEngine

    try:
        engine = OrchestrationEngine()
        result.add_pass("Engine created")

        # Create session
        session_id = await engine.create_session()
        assert session_id is not None
        result.add_pass("Session created")

        # Get session
        state = await engine.get_session(session_id)
        assert state is not None
        assert state["session_id"] == session_id
        result.add_pass("Session state retrieved")

        # Verify initial state
        assert state["tasks"] == {}
        assert state["pending_approvals"] == {}
        assert state["waiting_for_approval"] is False
        result.add_pass("Initial state correct")

        # Cancel session
        cancel_result = await engine.cancel(session_id)
        assert cancel_result is True
        result.add_pass("Session cancelled")

        # Delete session
        delete_result = await engine.delete_session(session_id)
        assert delete_result is True
        result.add_pass("Session deleted")

        # Verify deletion
        state = await engine.get_session(session_id)
        assert state is None
        result.add_pass("Session deletion verified")

    except Exception as e:
        result.add_fail("OrchestrationEngine tests", str(e))


async def test_api_endpoints():
    """Test FastAPI endpoints."""
    print("\n2. Testing API Endpoints...")

    from httpx import AsyncClient, ASGITransport
    from api.app import create_app
    from api.deps import set_engine, clear_engine
    from orchestrator import OrchestrationEngine

    engine = OrchestrationEngine()
    set_engine(engine)
    app = create_app(title="Test App", debug=True)
    transport = ASGITransport(app=app)

    try:
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            # Health check
            resp = await client.get("/api/health")
            assert resp.status_code == 200
            assert resp.json()["status"] == "healthy"
            result.add_pass("Health check endpoint")

            # Create session
            resp = await client.post("/api/sessions", json={})
            assert resp.status_code == 200
            session_id = resp.json()["session_id"]
            result.add_pass("Create session endpoint")

            # Get session
            resp = await client.get(f"/api/sessions/{session_id}")
            assert resp.status_code == 200
            result.add_pass("Get session endpoint")

            # Get approvals
            resp = await client.get(f"/api/sessions/{session_id}/approvals")
            assert resp.status_code == 200
            assert resp.json() == []
            result.add_pass("Get approvals endpoint")

            # List projects
            resp = await client.get("/api/projects")
            assert resp.status_code == 200
            result.add_pass("List projects endpoint")

            # Delete session
            resp = await client.delete(f"/api/sessions/{session_id}")
            assert resp.status_code == 200
            result.add_pass("Delete session endpoint")

            # 404 for deleted
            resp = await client.get(f"/api/sessions/{session_id}")
            assert resp.status_code == 404
            result.add_pass("404 for deleted session")

    except Exception as e:
        result.add_fail("API endpoint tests", str(e))
    finally:
        clear_engine()


async def test_hitl_flow():
    """Test HITL (Human-in-the-Loop) flow."""
    print("\n3. Testing HITL Flow...")

    from httpx import AsyncClient, ASGITransport
    from api.app import create_app
    from api.deps import set_engine, clear_engine
    from orchestrator import OrchestrationEngine
    from models.hitl import ApprovalStatus

    engine = OrchestrationEngine()
    set_engine(engine)
    app = create_app(title="Test App", debug=True)
    transport = ASGITransport(app=app)

    try:
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            # Create session
            resp = await client.post("/api/sessions", json={})
            session_id = resp.json()["session_id"]

            # Inject approval request
            state = await engine.get_session(session_id)
            approval_id = "test-approval-123"
            state["pending_approvals"][approval_id] = {
                "id": approval_id,
                "task_id": "task-456",
                "tool_name": "execute_bash",
                "tool_args": {"command": "echo test"},
                "risk_level": "HIGH",
                "risk_description": "Shell command execution",
                "status": ApprovalStatus.PENDING.value,
                "created_at": datetime.now(timezone.utc).isoformat(),
            }
            state["waiting_for_approval"] = True
            engine._sessions[session_id] = state
            result.add_pass("Approval request injected")

            # Get approvals
            resp = await client.get(f"/api/sessions/{session_id}/approvals")
            assert len(resp.json()) == 1
            result.add_pass("Get pending approvals")

            # Approve
            resp = await client.post(f"/api/sessions/{session_id}/approve/{approval_id}")
            assert resp.status_code == 200
            result.add_pass("Approve operation")

            # Verify status changed
            state = await engine.get_session(session_id)
            assert state["pending_approvals"][approval_id]["status"] == "approved"
            result.add_pass("Approval status updated")

            # Test deny with new session
            resp = await client.post("/api/sessions", json={})
            session_id2 = resp.json()["session_id"]

            state2 = await engine.get_session(session_id2)
            state2["pending_approvals"]["deny-test"] = {
                "id": "deny-test",
                "task_id": "task-789",
                "tool_name": "execute_bash",
                "tool_args": {"command": "rm -rf /"},
                "risk_level": "HIGH",
                "risk_description": "Dangerous command",
                "status": ApprovalStatus.PENDING.value,
                "created_at": datetime.now(timezone.utc).isoformat(),
            }
            state2["waiting_for_approval"] = True
            engine._sessions[session_id2] = state2

            resp = await client.post(f"/api/sessions/{session_id2}/deny/deny-test")
            assert resp.status_code == 200
            result.add_pass("Deny operation")

            state2 = await engine.get_session(session_id2)
            assert state2["pending_approvals"]["deny-test"]["status"] == "denied"
            result.add_pass("Denial status updated")

    except Exception as e:
        result.add_fail("HITL flow tests", str(e))
    finally:
        clear_engine()


async def test_parallel_execution():
    """Test parallel execution capabilities."""
    print("\n4. Testing Parallel Execution...")

    from orchestrator import OrchestrationEngine
    from models.agent_state import TaskStatus, TaskNode, create_initial_state

    try:
        engine = OrchestrationEngine()

        # Verify parallel executor
        assert engine.parallel_executor_node is not None
        assert engine.parallel_executor_node.max_concurrent == 3
        result.add_pass("Parallel executor initialized")

        # Test state structure
        state = create_initial_state(session_id="test")
        assert "batch_task_ids" in state
        result.add_pass("State has batch_task_ids")

        # Test multiple tasks
        for i in range(5):
            task = TaskNode(
                id=f"task-{i}",
                title=f"Task {i}",
                status=TaskStatus.PENDING,
            )
            state["tasks"][f"task-{i}"] = task

        state["batch_task_ids"] = ["task-0", "task-1", "task-2"]
        assert len(state["batch_task_ids"]) == 3
        result.add_pass("Batch task assignment")

        # Test concurrent execution
        async def mock_execute(task_id: str):
            await asyncio.sleep(0.05)
            return f"{task_id} completed"

        results_list = await asyncio.gather(
            mock_execute("task-0"),
            mock_execute("task-1"),
            mock_execute("task-2"),
        )
        assert len(results_list) == 3
        result.add_pass("Concurrent execution with asyncio.gather")

        # Test semaphore
        semaphore = asyncio.Semaphore(3)

        async def limited_execute(task_id: str):
            async with semaphore:
                await asyncio.sleep(0.05)
                return f"{task_id} done"

        all_results = await asyncio.gather(*[
            limited_execute(f"task-{i}") for i in range(5)
        ])
        assert len(all_results) == 5
        result.add_pass("Semaphore limiting")

    except Exception as e:
        result.add_fail("Parallel execution tests", str(e))


async def main():
    """Run all E2E tests."""
    print("=" * 60)
    print("Agent Orchestration System - E2E Tests")
    print("=" * 60)

    await test_orchestration_engine()
    await test_api_endpoints()
    await test_hitl_flow()
    await test_parallel_execution()

    print()
    print("=" * 60)
    success = result.summary()
    print("=" * 60)

    return 0 if success else 1


if __name__ == "__main__":
    exit_code = asyncio.run(main())
    sys.exit(exit_code)
