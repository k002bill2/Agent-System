"""Comprehensive tests for workflow automation system."""

import asyncio

import pytest

from models.workflow import (
    JobStatus,
    RunnerType,
    StepStatus,
    TriggerType,
    WorkflowCreate,
    WorkflowDefinitionSchema,
    WorkflowJobDef,
    WorkflowRunStatus,
    WorkflowRunTrigger,
    WorkflowStatus,
    WorkflowStepDef,
    WorkflowUpdate,
)
from services.workflow_engine import WorkflowEngine
from services.workflow_service import WorkflowService
from services.workflow_yaml_parser import parse_workflow_yaml, workflow_to_yaml


# ── YAML Parser Tests ──────────────────────────────────────


class TestYamlParser:
    """Tests for workflow YAML parser."""

    def test_valid_yaml_parsing(self):
        yaml_content = """
name: CI Pipeline
description: Test pipeline
on:
  manual: {}
env:
  NODE_VERSION: "20"
jobs:
  lint:
    runs_on: local
    steps:
      - name: Run linter
        run: echo linting
  test:
    runs_on: local
    needs: [lint]
    steps:
      - name: Run tests
        run: echo testing
"""
        result = parse_workflow_yaml(yaml_content)
        assert result["name"] == "CI Pipeline"
        assert len(result["jobs"]) == 2
        assert result["jobs"]["test"]["needs"] == ["lint"]
        assert result["env"]["NODE_VERSION"] == "20"

    def test_missing_name_raises(self):
        with pytest.raises(ValueError, match="name"):
            parse_workflow_yaml("jobs:\n  test:\n    steps:\n      - name: t\n        run: echo t")

    def test_missing_jobs_raises(self):
        with pytest.raises(ValueError, match="jobs"):
            parse_workflow_yaml("name: test")

    def test_missing_steps_raises(self):
        with pytest.raises(ValueError, match="steps"):
            parse_workflow_yaml("name: test\njobs:\n  test:\n    runs_on: local")

    def test_step_without_run_or_uses_raises(self):
        with pytest.raises(ValueError, match="run.*uses"):
            parse_workflow_yaml(
                "name: test\njobs:\n  test:\n    steps:\n      - name: bad step"
            )

    def test_trigger_normalization_string(self):
        result = parse_workflow_yaml(
            "name: test\non: push\njobs:\n  b:\n    steps:\n      - name: b\n        run: echo b"
        )
        assert isinstance(result["on"], dict)
        assert "push" in result["on"]

    def test_trigger_normalization_list(self):
        result = parse_workflow_yaml(
            "name: test\non:\n  - push\n  - pull_request\njobs:\n  b:\n    steps:\n      - name: b\n        run: echo b"
        )
        assert "push" in result["on"]
        assert "pull_request" in result["on"]

    def test_roundtrip_yaml(self):
        yaml_in = "name: test\njobs:\n  b:\n    steps:\n      - name: b\n        run: echo b"
        parsed = parse_workflow_yaml(yaml_in)
        yaml_out = workflow_to_yaml(parsed)
        assert "test" in yaml_out

    def test_env_defaults_to_empty_dict(self):
        result = parse_workflow_yaml(
            "name: test\njobs:\n  b:\n    steps:\n      - name: b\n        run: echo b"
        )
        assert result["env"] == {}

    def test_invalid_yaml_syntax(self):
        with pytest.raises(ValueError, match="YAML"):
            parse_workflow_yaml("name: [unterminated")


# ── Workflow Engine Tests ──────────────────────────────────


class TestWorkflowEngine:
    """Tests for workflow execution engine."""

    def setup_method(self):
        self.engine = WorkflowEngine()

    def _step(self, name: str = "s", run: str = "echo hi") -> WorkflowStepDef:
        return WorkflowStepDef(name=name, run=run)

    def _job(self, needs: list[str] | None = None, **kwargs) -> WorkflowJobDef:
        return WorkflowJobDef(
            needs=needs or [],
            steps=[self._step()],
            **kwargs,
        )

    # DAG tests

    def test_linear_dag(self):
        jobs = {
            "a": self._job(),
            "b": self._job(needs=["a"]),
            "c": self._job(needs=["b"]),
        }
        groups = self.engine.build_job_dag(jobs)
        assert groups == [["a"], ["b"], ["c"]]

    def test_parallel_dag(self):
        jobs = {
            "a": self._job(),
            "b": self._job(),
            "c": self._job(needs=["a", "b"]),
        }
        groups = self.engine.build_job_dag(jobs)
        assert groups[0] == ["a", "b"]
        assert groups[1] == ["c"]

    def test_diamond_dag(self):
        jobs = {
            "a": self._job(),
            "b": self._job(needs=["a"]),
            "c": self._job(needs=["a"]),
            "d": self._job(needs=["b", "c"]),
        }
        groups = self.engine.build_job_dag(jobs)
        assert groups == [["a"], ["b", "c"], ["d"]]

    def test_circular_dependency_raises(self):
        jobs = {
            "a": self._job(needs=["c"]),
            "b": self._job(needs=["a"]),
            "c": self._job(needs=["b"]),
        }
        with pytest.raises(ValueError, match="Circular"):
            self.engine.build_job_dag(jobs)

    def test_single_job_dag(self):
        jobs = {"only": self._job()}
        groups = self.engine.build_job_dag(jobs)
        assert groups == [["only"]]

    # Matrix tests

    def test_matrix_expansion(self):
        job = WorkflowJobDef(
            matrix={"py": ["3.10", "3.11"], "os": ["ubuntu", "macos"]},
            steps=[self._step()],
        )
        expanded = self.engine.expand_matrix("test", job)
        assert len(expanded) == 4

    def test_no_matrix(self):
        job = self._job()
        expanded = self.engine.expand_matrix("test", job)
        assert len(expanded) == 1
        assert expanded[0] == ("test", {})

    def test_single_key_matrix(self):
        job = WorkflowJobDef(
            matrix={"node": ["18", "20", "22"]},
            steps=[self._step()],
        )
        expanded = self.engine.expand_matrix("build", job)
        assert len(expanded) == 3

    # Variable substitution

    def test_variable_substitution(self):
        cmd = self.engine._substitute_variables(
            "python ${{ matrix.python }} on ${{ env.CI }}",
            {"CI": "true"},
            {"python": "3.11"},
        )
        assert cmd == "python 3.11 on true"

    def test_no_variables(self):
        cmd = self.engine._substitute_variables("echo hello", {}, {})
        assert cmd == "echo hello"

    # Execution tests

    @pytest.mark.asyncio
    async def test_execute_simple_run(self):
        definition = WorkflowDefinitionSchema(
            name="test",
            jobs={
                "echo": WorkflowJobDef(
                    steps=[WorkflowStepDef(name="hello", run="echo hello")]
                )
            },
        )
        result = await self.engine.execute_run(
            run_id="test-run-1",
            definition=definition,
            trigger_type=TriggerType.MANUAL,
            trigger_payload={},
        )
        assert result["status"] == WorkflowRunStatus.COMPLETED

    @pytest.mark.asyncio
    async def test_execute_failing_run(self):
        definition = WorkflowDefinitionSchema(
            name="fail",
            jobs={
                "fail": WorkflowJobDef(
                    steps=[WorkflowStepDef(name="fail", run="exit 1")]
                )
            },
        )
        result = await self.engine.execute_run(
            run_id="test-fail-1",
            definition=definition,
            trigger_type=TriggerType.MANUAL,
            trigger_payload={},
        )
        assert result["status"] == WorkflowRunStatus.FAILED

    @pytest.mark.asyncio
    async def test_execute_parallel_jobs(self):
        definition = WorkflowDefinitionSchema(
            name="parallel",
            jobs={
                "a": WorkflowJobDef(steps=[WorkflowStepDef(name="a", run="echo a")]),
                "b": WorkflowJobDef(steps=[WorkflowStepDef(name="b", run="echo b")]),
                "c": WorkflowJobDef(
                    needs=["a", "b"],
                    steps=[WorkflowStepDef(name="c", run="echo c")],
                ),
            },
        )
        result = await self.engine.execute_run(
            run_id="test-parallel-1",
            definition=definition,
            trigger_type=TriggerType.MANUAL,
            trigger_payload={},
        )
        assert result["status"] == WorkflowRunStatus.COMPLETED

    @pytest.mark.asyncio
    async def test_skipped_job_on_dependency_failure(self):
        definition = WorkflowDefinitionSchema(
            name="skip",
            jobs={
                "fail": WorkflowJobDef(
                    steps=[WorkflowStepDef(name="fail", run="exit 1")]
                ),
                "should-skip": WorkflowJobDef(
                    needs=["fail"],
                    steps=[WorkflowStepDef(name="skip", run="echo skip")],
                ),
            },
        )
        result = await self.engine.execute_run(
            run_id="test-skip-1",
            definition=definition,
            trigger_type=TriggerType.MANUAL,
            trigger_payload={},
        )
        assert result["status"] == WorkflowRunStatus.FAILED

    @pytest.mark.asyncio
    async def test_logs_are_emitted(self):
        definition = WorkflowDefinitionSchema(
            name="logs",
            jobs={
                "test": WorkflowJobDef(
                    steps=[WorkflowStepDef(name="log", run="echo logtest")]
                )
            },
        )
        await self.engine.execute_run(
            run_id="test-logs-1",
            definition=definition,
            trigger_type=TriggerType.MANUAL,
            trigger_payload={},
        )
        logs = self.engine.get_logs("test-logs-1")
        assert len(logs) > 0
        assert any("log" in entry["message"].lower() for entry in logs)

    def test_cancel_run(self):
        self.engine.cancel_run("some-run")
        assert "some-run" in self.engine._cancelled


# ── Workflow Service Tests ─────────────────────────────────


class TestWorkflowService:
    """Tests for workflow service (CRUD + orchestration)."""

    SAMPLE_YAML = """
name: Service Test
jobs:
  hello:
    runs_on: local
    steps:
      - name: Hello
        run: echo hello
"""

    def setup_method(self):
        self.svc = WorkflowService()
        # 시드 워크플로우 제거하여 테스트 격리
        for wf in list(self.svc._workflows.values()):
            self.svc.delete_workflow(wf["id"])

    def test_create_workflow(self):
        wf = self.svc.create_workflow(
            WorkflowCreate(name="Test", yaml_content=self.SAMPLE_YAML)
        )
        assert wf["name"] == "Test"
        assert wf["status"] == WorkflowStatus.ACTIVE
        assert wf["version"] == 1

    def test_list_workflows(self):
        self.svc.create_workflow(
            WorkflowCreate(name="A", yaml_content=self.SAMPLE_YAML)
        )
        self.svc.create_workflow(
            WorkflowCreate(name="B", yaml_content=self.SAMPLE_YAML)
        )
        assert len(self.svc.list_workflows()) == 2

    def test_list_workflows_project_filter(self):
        self.svc.create_workflow(
            WorkflowCreate(name="A", yaml_content=self.SAMPLE_YAML, project_id="p1")
        )
        self.svc.create_workflow(
            WorkflowCreate(name="B", yaml_content=self.SAMPLE_YAML, project_id="p2")
        )
        assert len(self.svc.list_workflows(project_id="p1")) == 1

    def test_get_workflow(self):
        wf = self.svc.create_workflow(
            WorkflowCreate(name="Get", yaml_content=self.SAMPLE_YAML)
        )
        fetched = self.svc.get_workflow(wf["id"])
        assert fetched is not None
        assert fetched["name"] == "Get"

    def test_get_nonexistent_workflow(self):
        assert self.svc.get_workflow("nonexistent") is None

    def test_update_workflow(self):
        wf = self.svc.create_workflow(
            WorkflowCreate(name="Upd", yaml_content=self.SAMPLE_YAML)
        )
        updated = self.svc.update_workflow(
            wf["id"], WorkflowUpdate(description="new desc")
        )
        assert updated["description"] == "new desc"

    def test_update_yaml_increments_version(self):
        wf = self.svc.create_workflow(
            WorkflowCreate(name="Ver", yaml_content=self.SAMPLE_YAML)
        )
        assert wf["version"] == 1
        updated = self.svc.update_workflow(
            wf["id"], WorkflowUpdate(yaml_content=self.SAMPLE_YAML)
        )
        assert updated["version"] == 2

    def test_delete_workflow(self):
        wf = self.svc.create_workflow(
            WorkflowCreate(name="Del", yaml_content=self.SAMPLE_YAML)
        )
        assert self.svc.delete_workflow(wf["id"]) is True
        assert self.svc.get_workflow(wf["id"]) is None

    def test_delete_nonexistent(self):
        assert self.svc.delete_workflow("nope") is False

    def test_create_without_yaml_or_definition_raises(self):
        with pytest.raises(ValueError):
            self.svc.create_workflow(WorkflowCreate(name="Bad"))

    @pytest.mark.asyncio
    async def test_trigger_and_complete_run(self):
        wf = self.svc.create_workflow(
            WorkflowCreate(name="Run", yaml_content=self.SAMPLE_YAML)
        )
        run = await self.svc.trigger_run(wf["id"], WorkflowRunTrigger())

        # Wait for completion
        for _ in range(30):
            await asyncio.sleep(0.3)
            current = self.svc.get_run(run["id"])
            if current and current["status"] in (
                WorkflowRunStatus.COMPLETED,
                WorkflowRunStatus.FAILED,
            ):
                break

        current = self.svc.get_run(run["id"])
        assert current["status"] == WorkflowRunStatus.COMPLETED

    @pytest.mark.asyncio
    async def test_trigger_inactive_workflow_raises(self):
        wf = self.svc.create_workflow(
            WorkflowCreate(name="Inact", yaml_content=self.SAMPLE_YAML)
        )
        self.svc.update_workflow(wf["id"], WorkflowUpdate(status=WorkflowStatus.INACTIVE))
        with pytest.raises(ValueError, match="not active"):
            await self.svc.trigger_run(wf["id"], WorkflowRunTrigger())

    @pytest.mark.asyncio
    async def test_list_runs(self):
        wf = self.svc.create_workflow(
            WorkflowCreate(name="Runs", yaml_content=self.SAMPLE_YAML)
        )
        await self.svc.trigger_run(wf["id"], WorkflowRunTrigger())
        runs = self.svc.list_runs(workflow_id=wf["id"])
        assert len(runs) == 1

    @pytest.mark.asyncio
    async def test_cancel_run(self):
        wf = self.svc.create_workflow(
            WorkflowCreate(name="Cancel", yaml_content=self.SAMPLE_YAML)
        )
        run = await self.svc.trigger_run(wf["id"], WorkflowRunTrigger())
        cancelled = self.svc.cancel_run(run["id"])
        assert cancelled is not None
        assert cancelled["status"] == WorkflowRunStatus.CANCELLED


# ── API Router Tests (httpx ASGI) ──────────────────────────


class TestWorkflowAPI:
    """Tests for workflow REST API."""

    SAMPLE_YAML = "name: API Test\njobs:\n  hi:\n    steps:\n      - name: hi\n        run: echo hi"

    @pytest.fixture
    def client(self):
        """Create async httpx test client."""
        from httpx import ASGITransport, AsyncClient

        from api.app import app

        transport = ASGITransport(app=app)
        return AsyncClient(transport=transport, base_url="http://test")

    @pytest.mark.asyncio
    async def test_list_empty(self, client):
        async with client as c:
            r = await c.get("/api/workflows")
            assert r.status_code == 200
            assert r.json()["total"] >= 0

    @pytest.mark.asyncio
    async def test_create_and_get(self, client):
        async with client as c:
            r = await c.post(
                "/api/workflows",
                json={"name": "API", "yaml_content": self.SAMPLE_YAML},
            )
            assert r.status_code == 201
            wf_id = r.json()["id"]

            r2 = await c.get(f"/api/workflows/{wf_id}")
            assert r2.status_code == 200
            assert r2.json()["name"] == "API"

    @pytest.mark.asyncio
    async def test_create_invalid_returns_400(self, client):
        async with client as c:
            r = await c.post(
                "/api/workflows",
                json={"name": "Bad", "yaml_content": "name: bad\nstuff: true"},
            )
            assert r.status_code == 400

    @pytest.mark.asyncio
    async def test_get_nonexistent_returns_404(self, client):
        async with client as c:
            r = await c.get("/api/workflows/nonexistent")
            assert r.status_code == 404

    @pytest.mark.asyncio
    async def test_delete(self, client):
        async with client as c:
            r = await c.post(
                "/api/workflows",
                json={"name": "Del", "yaml_content": self.SAMPLE_YAML},
            )
            wf_id = r.json()["id"]

            r2 = await c.delete(f"/api/workflows/{wf_id}")
            assert r2.status_code == 204

            r3 = await c.get(f"/api/workflows/{wf_id}")
            assert r3.status_code == 404

    @pytest.mark.asyncio
    async def test_trigger_and_get_run(self, client):
        async with client as c:
            r = await c.post(
                "/api/workflows",
                json={"name": "Run", "yaml_content": self.SAMPLE_YAML},
            )
            wf_id = r.json()["id"]

            r2 = await c.post(f"/api/workflows/{wf_id}/runs")
            assert r2.status_code == 201
            run_id = r2.json()["id"]

            # Wait for completion
            for _ in range(30):
                await asyncio.sleep(0.3)
                r3 = await c.get(f"/api/workflows/runs/{run_id}")
                if r3.json()["status"] in ("completed", "failed"):
                    break

            assert r3.json()["status"] == "completed"

    @pytest.mark.asyncio
    async def test_yaml_export(self, client):
        async with client as c:
            r = await c.post(
                "/api/workflows",
                json={"name": "YAML", "yaml_content": self.SAMPLE_YAML},
            )
            wf_id = r.json()["id"]

            r2 = await c.get(f"/api/workflows/{wf_id}/yaml")
            assert r2.status_code == 200
            assert "yaml" in r2.json()
