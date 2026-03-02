"""Workflow management service - CRUD and orchestration."""

import asyncio
import os
import uuid
from typing import Any

from sqlalchemy import desc, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

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
from utils.time import utcnow

USE_DATABASE = os.getenv("USE_DATABASE", "false").lower() == "true"

SEED_WORKFLOWS = [
    {
        "name": "React Dashboard Dev Server",
        "description": "React \ub300\uc2dc\ubcf4\ub4dc \uac1c\ubc1c \uc11c\ubc84 \uc2e4\ud589 (\ud3ec\ud2b8 \ud655\uc778 \u2192 \uc758\uc874\uc131 \uc124\uce58 \u2192 \ud0c0\uc785 \uccb4\ud06c \u2192 Vite \uc2dc\uc791)",
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

    # ── Workflow CRUD (in-memory) ──────────────────────────

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
        now = utcnow()

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

        workflow["updated_at"] = utcnow()
        return workflow

    def delete_workflow(self, workflow_id: str) -> bool:
        """Delete a workflow definition."""
        return self._workflows.pop(workflow_id, None) is not None

    # ── Workflow Runs (in-memory) ──────────────────────────

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
        now = utcnow()

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
                run["completed_at"] = utcnow()

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
        run["completed_at"] = utcnow()
        return run

    def retry_run(self, run_id: str) -> str | None:
        """Retry a failed run (creates a new run with same config)."""
        old_run = self._runs.get(run_id)
        if not old_run:
            return None

        # Note: caller should await trigger_run
        return old_run["workflow_id"]

    # ─────────────────────────────────────────────────────────────
    # Database (async) methods
    # ─────────────────────────────────────────────────────────────

    @staticmethod
    def _model_to_workflow_dict(row: Any) -> dict:
        """Convert WorkflowDefinitionModel to workflow dict."""
        status = row.status
        if isinstance(status, str):
            try:
                status = WorkflowStatus(status)
            except ValueError:
                status = WorkflowStatus.ACTIVE

        last_run_status = row.last_run_status
        if last_run_status and isinstance(last_run_status, str):
            try:
                last_run_status = WorkflowRunStatus(last_run_status)
            except ValueError:
                pass

        return {
            "id": row.id,
            "name": row.name,
            "description": row.description or "",
            "status": status,
            "project_id": row.project_id,
            "definition": row.definition or {},
            "yaml_content": row.yaml_content,
            "env": row.env or {},
            "version": row.version or 1,
            "created_by": row.created_by,
            "created_at": row.created_at,
            "updated_at": row.updated_at,
            "last_run_at": row.last_run_at,
            "last_run_status": last_run_status,
        }

    @staticmethod
    def _model_to_run_dict(row: Any) -> dict:
        """Convert WorkflowRunModel to run dict."""
        status = row.status
        if isinstance(status, str):
            try:
                status = WorkflowRunStatus(status)
            except ValueError:
                pass

        jobs = []
        if hasattr(row, "jobs") and row.jobs:
            for job in row.jobs:
                job_status = job.status
                if isinstance(job_status, str):
                    try:
                        from models.workflow import JobStatus

                        job_status = JobStatus(job_status)
                    except ValueError:
                        pass

                steps = []
                if hasattr(job, "steps") and job.steps:
                    for step in job.steps:
                        steps.append(
                            {
                                "id": step.id,
                                "name": step.name,
                                "status": step.status,
                                "output": step.output or "",
                                "error": step.error,
                                "exit_code": step.exit_code,
                                "duration_ms": step.duration_ms,
                                "started_at": step.started_at,
                                "completed_at": step.completed_at,
                            }
                        )

                jobs.append(
                    {
                        "id": job.id,
                        "name": job.name,
                        "status": job_status,
                        "runner": job.runs_on or "local",
                        "matrix_values": job.matrix_values,
                        "steps": steps,
                        "started_at": job.started_at,
                        "completed_at": job.completed_at,
                        "duration_seconds": job.duration_seconds,
                    }
                )

        # Get workflow_name from relationship if available
        workflow_name = ""
        if hasattr(row, "workflow") and row.workflow:
            workflow_name = row.workflow.name

        return {
            "id": row.id,
            "workflow_id": row.workflow_id,
            "workflow_name": workflow_name,
            "trigger_type": row.trigger_type,
            "trigger_payload": row.trigger_payload or {},
            "status": status,
            "started_at": row.started_at,
            "completed_at": row.completed_at,
            "duration_seconds": row.duration_seconds,
            "total_cost": row.total_cost or 0.0,
            "error_summary": row.error_summary,
            "jobs": jobs,
        }

    # ── Seed ───────────────────────────────────────────────

    @staticmethod
    async def seed_workflows_async(db: AsyncSession) -> None:
        """Seed built-in workflows into database (skip duplicates by name)."""
        from db.models import WorkflowDefinitionModel

        for seed in SEED_WORKFLOWS:
            # Check if already exists by name
            result = await db.execute(
                select(WorkflowDefinitionModel).where(WorkflowDefinitionModel.name == seed["name"])
            )
            if result.scalar_one_or_none():
                continue

            # Parse YAML
            definition = parse_workflow_yaml(seed["yaml_content"])
            now = utcnow()

            db_workflow = WorkflowDefinitionModel(
                id=str(uuid.uuid4()),
                name=seed["name"],
                description=seed.get("description", ""),
                status="active",
                definition=definition,
                yaml_content=seed["yaml_content"],
                env=definition.get("env", {}),
                version=1,
                created_at=now,
                updated_at=now,
            )
            db.add(db_workflow)

        await db.commit()

    # ── Workflow CRUD (database) ───────────────────────────

    @staticmethod
    async def list_workflows_async(db: AsyncSession, project_id: str | None = None) -> list[dict]:
        """List all workflows from database."""
        from db.models import WorkflowDefinitionModel

        query = select(WorkflowDefinitionModel)
        if project_id:
            query = query.where(WorkflowDefinitionModel.project_id == project_id)
        query = query.order_by(desc(WorkflowDefinitionModel.created_at))

        result = await db.execute(query)
        rows = result.scalars().all()
        return [WorkflowService._model_to_workflow_dict(row) for row in rows]

    @staticmethod
    async def get_workflow_async(db: AsyncSession, workflow_id: str) -> dict | None:
        """Get a workflow by ID from database."""
        from db.models import WorkflowDefinitionModel

        result = await db.execute(
            select(WorkflowDefinitionModel).where(WorkflowDefinitionModel.id == workflow_id)
        )
        row = result.scalar_one_or_none()
        if not row:
            return None
        return WorkflowService._model_to_workflow_dict(row)

    @staticmethod
    async def create_workflow_async(
        db: AsyncSession, data: WorkflowCreate, user_id: str | None = None
    ) -> dict:
        """Create a new workflow in database."""
        from db.models import WorkflowDefinitionModel

        workflow_id = str(uuid.uuid4())
        now = utcnow()

        # Parse YAML if provided
        definition = None
        yaml_content = data.yaml_content
        if yaml_content:
            definition = parse_workflow_yaml(yaml_content)
        elif data.definition:
            definition = data.definition.model_dump()

        if definition is None:
            raise ValueError("Either yaml_content or definition must be provided")

        name = data.name or definition.get("name", "Untitled Workflow")
        description = data.description or definition.get("description", "")

        db_workflow = WorkflowDefinitionModel(
            id=workflow_id,
            project_id=data.project_id,
            name=name,
            description=description,
            status="active",
            definition=definition,
            yaml_content=yaml_content,
            env=definition.get("env", {}),
            version=1,
            created_by=user_id,
            created_at=now,
            updated_at=now,
        )
        db.add(db_workflow)
        await db.flush()

        return WorkflowService._model_to_workflow_dict(db_workflow)

    @staticmethod
    async def update_workflow_async(
        db: AsyncSession, workflow_id: str, data: WorkflowUpdate
    ) -> dict | None:
        """Update a workflow in database."""
        from db.models import WorkflowDefinitionModel

        result = await db.execute(
            select(WorkflowDefinitionModel).where(WorkflowDefinitionModel.id == workflow_id)
        )
        row = result.scalar_one_or_none()
        if not row:
            return None

        if data.name is not None:
            row.name = data.name
        if data.description is not None:
            row.description = data.description
        if data.status is not None:
            row.status = data.status.value if hasattr(data.status, "value") else data.status
        if "project_id" in data.model_fields_set:
            row.project_id = data.project_id
        if data.yaml_content is not None:
            row.yaml_content = data.yaml_content
            row.definition = parse_workflow_yaml(data.yaml_content)
            row.version = (row.version or 1) + 1
        elif data.definition is not None:
            row.definition = data.definition.model_dump()
            row.version = (row.version or 1) + 1

        row.updated_at = utcnow()
        await db.flush()

        return WorkflowService._model_to_workflow_dict(row)

    @staticmethod
    async def delete_workflow_async(db: AsyncSession, workflow_id: str) -> bool:
        """Delete a workflow from database (cascade deletes runs)."""
        from db.models import WorkflowDefinitionModel

        result = await db.execute(
            select(WorkflowDefinitionModel).where(WorkflowDefinitionModel.id == workflow_id)
        )
        row = result.scalar_one_or_none()
        if not row:
            return False

        await db.delete(row)
        await db.flush()
        return True

    # ── Workflow Runs (database) ───────────────────────────

    @staticmethod
    async def list_runs_async(
        db: AsyncSession, workflow_id: str | None = None, limit: int = 50
    ) -> list[dict]:
        """List workflow runs from database."""
        from db.models import WorkflowRunModel

        query = select(WorkflowRunModel).options(
            selectinload(WorkflowRunModel.jobs),
            selectinload(WorkflowRunModel.workflow),
        )
        if workflow_id:
            query = query.where(WorkflowRunModel.workflow_id == workflow_id)
        query = query.order_by(desc(WorkflowRunModel.started_at)).limit(limit)

        result = await db.execute(query)
        rows = result.scalars().all()
        return [WorkflowService._model_to_run_dict(row) for row in rows]

    @staticmethod
    async def get_run_async(db: AsyncSession, run_id: str) -> dict | None:
        """Get a run by ID from database with eager-loaded jobs/steps."""
        from db.models import WorkflowJobModel, WorkflowRunModel

        result = await db.execute(
            select(WorkflowRunModel)
            .options(
                selectinload(WorkflowRunModel.jobs).selectinload(WorkflowJobModel.steps),
                selectinload(WorkflowRunModel.workflow),
            )
            .where(WorkflowRunModel.id == run_id)
        )
        row = result.scalar_one_or_none()
        if not row:
            return None
        return WorkflowService._model_to_run_dict(row)

    async def trigger_run_async(
        self,
        db: AsyncSession,
        workflow_id: str,
        trigger: WorkflowRunTrigger,
        project_path: str | None = None,
    ) -> dict:
        """Trigger a new workflow run with DB persistence."""
        from db.models import WorkflowDefinitionModel, WorkflowRunModel

        # Get workflow from DB
        result = await db.execute(
            select(WorkflowDefinitionModel).where(WorkflowDefinitionModel.id == workflow_id)
        )
        wf_row = result.scalar_one_or_none()
        if not wf_row:
            raise ValueError(f"Workflow not found: {workflow_id}")

        status_str = wf_row.status
        if status_str != "active":
            raise ValueError(f"Workflow is not active: {status_str}")

        run_id = str(uuid.uuid4())
        now = utcnow()

        trigger_payload = {
            "inputs": trigger.inputs,
            "branch": trigger.branch,
        }

        # Insert run into DB
        db_run = WorkflowRunModel(
            id=run_id,
            workflow_id=workflow_id,
            trigger_type=trigger.trigger_type.value
            if hasattr(trigger.trigger_type, "value")
            else trigger.trigger_type,
            trigger_payload=trigger_payload,
            status="queued",
            started_at=now,
        )
        db.add(db_run)
        await db.flush()

        # Build in-memory run dict for SSE streaming
        run_dict: dict[str, Any] = {
            "id": run_id,
            "workflow_id": workflow_id,
            "workflow_name": wf_row.name,
            "trigger_type": trigger.trigger_type,
            "trigger_payload": trigger_payload,
            "status": WorkflowRunStatus.QUEUED,
            "started_at": now,
            "completed_at": None,
            "duration_seconds": None,
            "total_cost": 0.0,
            "error_summary": None,
            "jobs": [],
        }
        self._runs[run_id] = run_dict

        # Parse definition for execution
        definition_dict = wf_row.definition or {}
        definition = WorkflowDefinitionSchema(**definition_dict)

        engine = get_workflow_engine()

        async def _run_workflow():
            try:
                run_dict["status"] = WorkflowRunStatus.RUNNING
                # Update DB run status to running
                await engine.update_run_status_db(run_id, "running")

                result = await engine.execute_run(
                    run_id=run_id,
                    definition=definition,
                    trigger_type=trigger.trigger_type,
                    trigger_payload=trigger_payload,
                    project_path=project_path,
                )

                final_status = result["status"]
                completed_at = result.get("completed_at")
                duration = result.get("duration_seconds")
                cost = result.get("total_cost", 0.0)
                error_summary = result.get("error_summary")

                run_dict["status"] = final_status
                run_dict["completed_at"] = completed_at
                run_dict["duration_seconds"] = duration
                run_dict["total_cost"] = cost
                run_dict["error_summary"] = error_summary
                run_dict["jobs"] = list(result.get("jobs", {}).values())

                # Persist final run state and jobs/steps to DB
                status_val = (
                    final_status.value if hasattr(final_status, "value") else str(final_status)
                )
                await engine.update_run_status_db(
                    run_id,
                    status_val,
                    completed_at=completed_at,
                    duration_seconds=duration,
                    total_cost=cost,
                    error_summary=error_summary,
                )

                # Save jobs and steps to DB
                for job_data in result.get("jobs", {}).values():
                    job_id = await engine.save_job_to_db(run_id, job_data)
                    for step_data in job_data.get("steps", []):
                        await engine.save_step_to_db(job_id, step_data)

                # Update workflow last_run info
                await engine.update_workflow_last_run_db(workflow_id, now, status_val)

            except Exception as e:
                run_dict["status"] = WorkflowRunStatus.FAILED
                run_dict["error_summary"] = str(e)
                run_dict["completed_at"] = utcnow()
                await engine.update_run_status_db(
                    run_id,
                    "failed",
                    completed_at=run_dict["completed_at"],
                    error_summary=str(e),
                )

        task = asyncio.create_task(_run_workflow())
        self._run_tasks[run_id] = task

        return run_dict

    async def cancel_run_async(self, db: AsyncSession, run_id: str) -> dict | None:
        """Cancel a running workflow with DB update."""
        from db.models import WorkflowRunModel

        # Check in-memory first for active runs
        run_dict = self._runs.get(run_id)

        engine = get_workflow_engine()
        engine.cancel_run(run_id)

        if run_id in self._run_tasks:
            self._run_tasks[run_id].cancel()

        now = utcnow()

        # Update DB
        result = await db.execute(select(WorkflowRunModel).where(WorkflowRunModel.id == run_id))
        row = result.scalar_one_or_none()
        if row:
            row.status = "cancelled"
            row.completed_at = now
            await db.flush()

        if run_dict:
            run_dict["status"] = WorkflowRunStatus.CANCELLED
            run_dict["completed_at"] = now
            return run_dict

        # If not in memory, build from DB
        if row:
            return {
                "id": row.id,
                "workflow_id": row.workflow_id,
                "workflow_name": "",
                "trigger_type": row.trigger_type,
                "trigger_payload": row.trigger_payload or {},
                "status": WorkflowRunStatus.CANCELLED,
                "started_at": row.started_at,
                "completed_at": now,
                "duration_seconds": row.duration_seconds,
                "total_cost": row.total_cost or 0.0,
                "error_summary": row.error_summary,
                "jobs": [],
            }

        return None

    @staticmethod
    async def retry_run_async(db: AsyncSession, run_id: str) -> str | None:
        """Get workflow_id from an existing run for retry."""
        from db.models import WorkflowRunModel

        result = await db.execute(
            select(WorkflowRunModel.workflow_id).where(WorkflowRunModel.id == run_id)
        )
        row = result.scalar_one_or_none()
        return row if row else None


# Singleton
_service: WorkflowService | None = None


def get_workflow_service() -> WorkflowService:
    global _service
    if _service is None:
        _service = WorkflowService()
    return _service
