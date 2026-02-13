"""Workflow management service - CRUD and orchestration."""

import asyncio
import uuid
from datetime import datetime
from typing import Any

from models.workflow import (
    WorkflowCreate,
    WorkflowDefinitionSchema,
    WorkflowRunStatus,
    WorkflowRunTrigger,
    WorkflowStatus,
    WorkflowUpdate,
)
from services.workflow_engine import get_workflow_engine
from services.workflow_yaml_parser import parse_workflow_yaml

SEED_WORKFLOWS = [
    {
        "name": "React Dashboard Dev Server",
        "description": "React 대시보드 개발 서버 실행 (포트 확인 → 의존성 설치 → 타입 체크 → Vite 시작)",
        "yaml_content": """name: React Dashboard Dev Server
on:
  manual: {}
env:
  DASHBOARD_DIR: src/dashboard
  DEV_PORT: "5173"
jobs:
  check-port:
    name: Check port availability
    runs_on: local
    steps:
      - name: Kill existing Vite process if running
        run: pkill -f "vite" 2>/dev/null || echo "No existing process"
      - name: Verify port is free
        run: lsof -i :${{ env.DEV_PORT }} 2>/dev/null && echo "WARNING - port still in use" || echo "Port ${{ env.DEV_PORT }} is free"
  install-deps:
    name: Install dependencies
    runs_on: local
    steps:
      - name: Install npm dependencies
        run: cd ${{ env.DASHBOARD_DIR }} && test -d node_modules && echo "node_modules exists, skipping install" || npm install
  type-check:
    name: TypeScript type check
    runs_on: local
    needs: [install-deps]
    steps:
      - name: Run tsc --noEmit
        run: cd ${{ env.DASHBOARD_DIR }} && npx tsc --noEmit
        continue_on_error: true
  start-server:
    name: Start Vite dev server
    runs_on: local
    needs: [check-port, type-check]
    steps:
      - name: Start dev server in background
        run: cd ${{ env.DASHBOARD_DIR }} && nohup npm run dev > /tmp/vite-dev.log 2>&1 & echo "Dev server PID=$!"
      - name: Wait for server to be ready
        run: sleep 3 && curl -s -o /dev/null -w "HTTP %{http_code}" http://localhost:${{ env.DEV_PORT }}/ || echo "Server starting..."
      - name: Print access info
        run: echo "Dashboard available at http://localhost:${{ env.DEV_PORT }}"
""",
    },
]


class WorkflowService:
    """Service for managing workflow definitions and runs."""

    def __init__(self):
        self._workflows: dict[str, dict] = {}
        self._runs: dict[str, dict] = {}
        self._run_tasks: dict[str, asyncio.Task] = {}
        self._seed_workflows()

    def _seed_workflows(self):
        """Seed built-in workflows."""
        for seed in SEED_WORKFLOWS:
            data = WorkflowCreate(
                name=seed["name"],
                description=seed.get("description", ""),
                yaml_content=seed["yaml_content"],
                project_id=seed.get("project_id"),
            )
            self.create_workflow(data)

    # ── Workflow CRUD ───────────────────────────────────────

    def list_workflows(self, project_id: str | None = None) -> list[dict]:
        """List all workflows, optionally filtered by project."""
        workflows = list(self._workflows.values())
        if project_id:
            workflows = [w for w in workflows if w.get("project_id") == project_id]
        return sorted(workflows, key=lambda w: w["created_at"], reverse=True)

    def get_workflow(self, workflow_id: str) -> dict | None:
        """Get a workflow by ID."""
        return self._workflows.get(workflow_id)

    def create_workflow(self, data: WorkflowCreate, user_id: str | None = None) -> dict:
        """Create a new workflow definition."""
        workflow_id = str(uuid.uuid4())
        now = datetime.utcnow()

        # Parse YAML if provided
        definition = None
        yaml_content = data.yaml_content
        if yaml_content:
            definition = parse_workflow_yaml(yaml_content)
        elif data.definition:
            definition = data.definition.model_dump()

        if definition is None:
            raise ValueError("Either yaml_content or definition must be provided")

        workflow = {
            "id": workflow_id,
            "name": data.name or definition.get("name", "Untitled Workflow"),
            "description": data.description or definition.get("description", ""),
            "status": WorkflowStatus.ACTIVE,
            "project_id": data.project_id,
            "definition": definition,
            "yaml_content": yaml_content,
            "env": definition.get("env", {}),
            "version": 1,
            "created_by": user_id,
            "created_at": now,
            "updated_at": now,
            "last_run_at": None,
            "last_run_status": None,
        }
        self._workflows[workflow_id] = workflow
        return workflow

    def update_workflow(self, workflow_id: str, data: WorkflowUpdate) -> dict | None:
        """Update a workflow definition."""
        workflow = self._workflows.get(workflow_id)
        if not workflow:
            return None

        if data.name is not None:
            workflow["name"] = data.name
        if data.description is not None:
            workflow["description"] = data.description
        if data.status is not None:
            workflow["status"] = data.status
        if "project_id" in data.model_fields_set:
            workflow["project_id"] = data.project_id
        if data.yaml_content is not None:
            workflow["yaml_content"] = data.yaml_content
            workflow["definition"] = parse_workflow_yaml(data.yaml_content)
            workflow["version"] += 1
        elif data.definition is not None:
            workflow["definition"] = data.definition.model_dump()
            workflow["version"] += 1

        workflow["updated_at"] = datetime.utcnow()
        return workflow

    def delete_workflow(self, workflow_id: str) -> bool:
        """Delete a workflow definition."""
        return self._workflows.pop(workflow_id, None) is not None

    # ── Workflow Runs ───────────────────────────────────────

    def list_runs(self, workflow_id: str | None = None, limit: int = 50) -> list[dict]:
        """List workflow runs."""
        runs = list(self._runs.values())
        if workflow_id:
            runs = [r for r in runs if r["workflow_id"] == workflow_id]
        return sorted(runs, key=lambda r: r["started_at"], reverse=True)[:limit]

    def get_run(self, run_id: str) -> dict | None:
        """Get a run by ID."""
        return self._runs.get(run_id)

    async def trigger_run(
        self,
        workflow_id: str,
        trigger: WorkflowRunTrigger,
        project_path: str | None = None,
    ) -> dict:
        """Trigger a new workflow run."""
        workflow = self._workflows.get(workflow_id)
        if not workflow:
            raise ValueError(f"Workflow not found: {workflow_id}")

        if workflow["status"] != WorkflowStatus.ACTIVE:
            raise ValueError(f"Workflow is not active: {workflow['status']}")

        run_id = str(uuid.uuid4())
        now = datetime.utcnow()

        run: dict[str, Any] = {
            "id": run_id,
            "workflow_id": workflow_id,
            "workflow_name": workflow["name"],
            "trigger_type": trigger.trigger_type,
            "trigger_payload": {
                "inputs": trigger.inputs,
                "branch": trigger.branch,
            },
            "status": WorkflowRunStatus.QUEUED,
            "started_at": now,
            "completed_at": None,
            "duration_seconds": None,
            "total_cost": 0.0,
            "error_summary": None,
            "jobs": [],
        }
        self._runs[run_id] = run

        # Parse definition
        definition_dict = workflow["definition"]
        definition = WorkflowDefinitionSchema(**definition_dict)

        # Start execution in background
        engine = get_workflow_engine()

        async def _run_workflow():
            try:
                run["status"] = WorkflowRunStatus.RUNNING
                result = await engine.execute_run(
                    run_id=run_id,
                    definition=definition,
                    trigger_type=trigger.trigger_type,
                    trigger_payload=run["trigger_payload"],
                    project_path=project_path,
                )
                run["status"] = result["status"]
                run["completed_at"] = result.get("completed_at")
                run["duration_seconds"] = result.get("duration_seconds")
                run["total_cost"] = result.get("total_cost", 0.0)
                run["error_summary"] = result.get("error_summary")
                run["jobs"] = list(result.get("jobs", {}).values())

                # Update workflow last run info
                workflow["last_run_at"] = now
                workflow["last_run_status"] = run["status"]
            except Exception as e:
                run["status"] = WorkflowRunStatus.FAILED
                run["error_summary"] = str(e)
                run["completed_at"] = datetime.utcnow()

        task = asyncio.create_task(_run_workflow())
        self._run_tasks[run_id] = task

        return run

    def cancel_run(self, run_id: str) -> dict | None:
        """Cancel a running workflow."""
        run = self._runs.get(run_id)
        if not run:
            return None

        engine = get_workflow_engine()
        engine.cancel_run(run_id)

        if run_id in self._run_tasks:
            self._run_tasks[run_id].cancel()

        run["status"] = WorkflowRunStatus.CANCELLED
        run["completed_at"] = datetime.utcnow()
        return run

    def retry_run(self, run_id: str) -> str | None:
        """Retry a failed run (creates a new run with same config)."""
        old_run = self._runs.get(run_id)
        if not old_run:
            return None

        # Note: caller should await trigger_run
        return old_run["workflow_id"]


# Singleton
_service: WorkflowService | None = None


def get_workflow_service() -> WorkflowService:
    global _service
    if _service is None:
        _service = WorkflowService()
    return _service
