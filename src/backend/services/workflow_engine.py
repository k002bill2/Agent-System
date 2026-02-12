"""Workflow execution engine - GitHub Actions-like CI/CD automation."""

import asyncio
import time
import uuid
from collections import defaultdict
from datetime import datetime
from pathlib import Path
from typing import Any, AsyncIterator

from models.workflow import (
    JobStatus,
    RetryConfig,
    RunnerType,
    StepStatus,
    TriggerType,
    WorkflowDefinitionSchema,
    WorkflowJobDef,
    WorkflowRunStatus,
    WorkflowStepDef,
)
from services.variable_expander import expand_variables, mask_secrets, parse_step_outputs


class WorkflowEngine:
    """Core engine for executing workflow definitions."""

    def __init__(self):
        self._running_runs: dict[str, asyncio.Task] = {}
        self._run_logs: dict[str, list[dict]] = defaultdict(list)
        self._cancelled: set[str] = set()
        self._secrets: dict[str, str] = {}  # Populated per-run from SecretService

    # ── DAG Scheduling ──────────────────────────────────────

    def build_job_dag(self, jobs: dict[str, WorkflowJobDef]) -> list[list[str]]:
        """Build parallel execution groups from job dependencies using topological sort."""
        in_degree: dict[str, int] = {name: 0 for name in jobs}
        dependents: dict[str, list[str]] = defaultdict(list)

        for name, job in jobs.items():
            for dep in job.needs:
                if dep in jobs:
                    in_degree[name] += 1
                    dependents[dep].append(name)

        # Kahn's algorithm for topological sort in layers
        groups: list[list[str]] = []
        queue = [name for name, degree in in_degree.items() if degree == 0]

        while queue:
            groups.append(sorted(queue))  # Sort for deterministic order
            next_queue = []
            for name in queue:
                for dep in dependents[name]:
                    in_degree[dep] -= 1
                    if in_degree[dep] == 0:
                        next_queue.append(dep)
            queue = next_queue

        # Check for cycles
        processed = sum(len(g) for g in groups)
        if processed != len(jobs):
            cycle_jobs = [n for n, d in in_degree.items() if d > 0]
            raise ValueError(f"Circular dependency detected in jobs: {cycle_jobs}")

        return groups

    def expand_matrix(self, job_name: str, job: WorkflowJobDef) -> list[tuple[str, dict[str, str]]]:
        """Expand matrix into individual job configurations with exclude/include support."""
        if not job.matrix:
            return [(job_name, {})]

        # Generate all combinations
        keys = list(job.matrix.keys())
        values = [job.matrix[k] for k in keys]

        combinations: list[dict[str, str]] = [{}]
        for key, vals in zip(keys, values):
            new_combos = []
            for combo in combinations:
                for val in vals:
                    new_combo = {**combo, key: val}
                    new_combos.append(new_combo)
            combinations = new_combos

        # Apply exclude filter
        if job.matrix_exclude:
            combinations = [
                combo for combo in combinations
                if not any(
                    all(combo.get(k) == v for k, v in excl.items())
                    for excl in job.matrix_exclude
                )
            ]

        # Apply include additions
        if job.matrix_include:
            for incl in job.matrix_include:
                combinations.append(incl)

        return [(f"{job_name} ({', '.join(f'{k}={v}' for k, v in combo.items())})", combo) for combo in combinations]

    # ── Execution ───────────────────────────────────────────

    async def execute_run(
        self,
        run_id: str,
        definition: WorkflowDefinitionSchema,
        trigger_type: TriggerType,
        trigger_payload: dict,
        project_path: str | None = None,
    ) -> dict:
        """Execute a complete workflow run."""
        run_state: dict[str, Any] = {
            "id": run_id,
            "status": WorkflowRunStatus.RUNNING,
            "started_at": datetime.utcnow(),
            "completed_at": None,
            "jobs": {},
            "total_cost": 0.0,
            "error_summary": None,
        }

        # Load secrets for this run
        try:
            from services.secret_service import get_secret_service
            self._secrets = get_secret_service().get_secrets_for_workflow(
                trigger_payload.get("workflow_id", "")
            )
        except Exception:
            self._secrets = {}

        # Track step outputs across jobs: step_id -> {key: value}
        step_outputs: dict[str, dict[str, str]] = {}

        self._emit_log(run_id, "run", f"Workflow run started (trigger: {trigger_type.value})")

        try:
            # Build DAG
            groups = self.build_job_dag(definition.jobs)
            job_results: dict[str, str] = {}  # job_name -> status

            for group in groups:
                if run_id in self._cancelled:
                    run_state["status"] = WorkflowRunStatus.CANCELLED
                    break

                # Execute jobs in parallel within each group
                tasks = []
                for job_name in group:
                    job_def = definition.jobs[job_name]

                    # Check if dependencies succeeded
                    deps_ok = all(job_results.get(dep) == JobStatus.SUCCESS for dep in job_def.needs)
                    if not deps_ok:
                        job_results[job_name] = JobStatus.SKIPPED
                        self._emit_log(run_id, "job", f"Job '{job_name}' skipped (dependency failed)")
                        continue

                    # Expand matrix
                    matrix_jobs = self.expand_matrix(job_name, job_def)
                    for variant_name, matrix_values in matrix_jobs:
                        tasks.append(
                            self._execute_job(
                                run_id=run_id,
                                job_name=variant_name,
                                job_def=job_def,
                                matrix_values=matrix_values,
                                env={**definition.env, **(job_def.env or {})},
                                project_path=project_path,
                                trigger_payload=trigger_payload,
                                step_outputs=step_outputs,
                            )
                        )

                if tasks:
                    results = await asyncio.gather(*tasks, return_exceptions=True)
                    for job_name_in_group, result in zip(
                        [n for n in group if job_results.get(n) != JobStatus.SKIPPED], results
                    ):
                        if isinstance(result, Exception):
                            job_results[job_name_in_group] = JobStatus.FAILURE
                            run_state["error_summary"] = str(result)
                        else:
                            job_results[job_name_in_group] = result.get("status", JobStatus.FAILURE)
                            run_state["jobs"][job_name_in_group] = result

            # Determine overall status
            if run_state["status"] != WorkflowRunStatus.CANCELLED:
                statuses = set(job_results.values())
                if JobStatus.FAILURE in statuses:
                    run_state["status"] = WorkflowRunStatus.FAILED
                elif all(s in (JobStatus.SUCCESS, JobStatus.SKIPPED) for s in statuses):
                    run_state["status"] = WorkflowRunStatus.COMPLETED
                else:
                    run_state["status"] = WorkflowRunStatus.FAILED

        except Exception as e:
            run_state["status"] = WorkflowRunStatus.FAILED
            run_state["error_summary"] = str(e)
            self._emit_log(run_id, "error", f"Workflow run failed: {e}")

        run_state["completed_at"] = datetime.utcnow()
        if run_state["started_at"] and run_state["completed_at"]:
            run_state["duration_seconds"] = (
                run_state["completed_at"] - run_state["started_at"]
            ).total_seconds()

        self._emit_log(run_id, "run", f"Workflow run completed: {run_state['status'].value}")
        return run_state

    async def _execute_job(
        self,
        run_id: str,
        job_name: str,
        job_def: WorkflowJobDef,
        matrix_values: dict,
        env: dict,
        project_path: str | None,
        trigger_payload: dict,
        step_outputs: dict[str, dict[str, str]] | None = None,
    ) -> dict:
        """Execute a single job."""
        job_id = str(uuid.uuid4())
        job_state: dict[str, Any] = {
            "id": job_id,
            "name": job_name,
            "status": JobStatus.RUNNING,
            "runner": job_def.runs_on,
            "matrix_values": matrix_values,
            "steps": [],
            "started_at": datetime.utcnow(),
            "completed_at": None,
        }

        self._emit_log(run_id, "job", f"Job '{job_name}' started on {job_def.runs_on.value}")

        if step_outputs is None:
            step_outputs = {}

        try:
            for i, step_def in enumerate(job_def.steps):
                if run_id in self._cancelled:
                    job_state["status"] = JobStatus.CANCELLED
                    break

                step_result = await self._execute_step(
                    run_id=run_id,
                    job_id=job_id,
                    step_index=i,
                    step_def=step_def,
                    runner=job_def.runs_on,
                    env={**env, **(step_def.env or {})},
                    matrix_values=matrix_values,
                    project_path=project_path,
                    step_outputs=step_outputs,
                )
                job_state["steps"].append(step_result)

                # Capture step outputs for downstream steps
                step_id = step_def.id or step_def.name
                if step_result.get("parsed_outputs"):
                    step_outputs[step_id] = {"outputs": step_result["parsed_outputs"]}

                if step_result["status"] == StepStatus.FAILURE and not step_def.continue_on_error:
                    job_state["status"] = JobStatus.FAILURE
                    break

            if job_state["status"] == JobStatus.RUNNING:
                job_state["status"] = JobStatus.SUCCESS

        except Exception as e:
            job_state["status"] = JobStatus.FAILURE
            self._emit_log(run_id, "error", f"Job '{job_name}' failed: {e}")

        job_state["completed_at"] = datetime.utcnow()
        if job_state["started_at"] and job_state["completed_at"]:
            job_state["duration_seconds"] = (
                job_state["completed_at"] - job_state["started_at"]
            ).total_seconds()

        self._emit_log(run_id, "job", f"Job '{job_name}' completed: {job_state['status'].value}")
        return job_state

    async def _execute_step(
        self,
        run_id: str,
        job_id: str,
        step_index: int,
        step_def: WorkflowStepDef,
        runner: RunnerType,
        env: dict,
        matrix_values: dict,
        project_path: str | None,
        step_outputs: dict[str, dict[str, Any]] | None = None,
    ) -> dict:
        """Execute a single step with retry support and variable expansion."""
        step_id = str(uuid.uuid4())
        step_state: dict[str, Any] = {
            "id": step_id,
            "name": step_def.name,
            "status": StepStatus.RUNNING,
            "output": "",
            "error": None,
            "exit_code": None,
            "duration_ms": None,
            "started_at": datetime.utcnow(),
            "completed_at": None,
            "parsed_outputs": {},
        }

        self._emit_log(run_id, "step", f"  Step '{step_def.name}' running...")

        # Parse retry config
        retry_config = self._parse_retry_config(step_def.retry)
        max_attempts = retry_config.max_attempts if retry_config else 1
        backoff = retry_config.backoff if retry_config else "linear"
        delay = retry_config.delay_seconds if retry_config else 1.0

        start_time = time.time()

        for attempt in range(max_attempts):
            try:
                if step_def.run:
                    # Expand variables using the new expander
                    command = expand_variables(
                        step_def.run,
                        env=env,
                        matrix=matrix_values,
                        secrets=self._secrets,
                        steps=step_outputs or {},
                    )

                    result = await self._run_shell_command(
                        command=command,
                        runner=runner,
                        project_path=project_path,
                        timeout=step_def.timeout_minutes * 60,
                        run_id=run_id,
                    )

                    # Mask secrets in output
                    stdout = mask_secrets(result["stdout"], self._secrets)
                    stderr = mask_secrets(result["stderr"], self._secrets)

                    step_state["output"] = stdout
                    step_state["error"] = stderr if result["exit_code"] != 0 else None
                    step_state["exit_code"] = result["exit_code"]

                    # Parse step outputs from stdout
                    step_state["parsed_outputs"] = parse_step_outputs(result["stdout"])

                    if result["exit_code"] == 0:
                        step_state["status"] = StepStatus.SUCCESS
                        break
                    else:
                        step_state["status"] = StepStatus.FAILURE
                        if attempt < max_attempts - 1:
                            wait_time = delay * (2 ** attempt if backoff == "exponential" else (attempt + 1))
                            self._emit_log(
                                run_id, "step",
                                f"  Step '{step_def.name}' failed (attempt {attempt + 1}/{max_attempts}), retrying in {wait_time:.1f}s..."
                            )
                            await asyncio.sleep(wait_time)
                            continue
                        break

                elif step_def.uses:
                    self._emit_log(run_id, "step", f"  Action '{step_def.uses}' (built-in actions not yet supported)")
                    step_state["status"] = StepStatus.SUCCESS
                    step_state["output"] = f"Action '{step_def.uses}' executed (stub)"
                    break

                else:
                    step_state["status"] = StepStatus.SKIPPED
                    break

            except asyncio.TimeoutError:
                step_state["status"] = StepStatus.FAILURE
                step_state["error"] = f"Step timed out after {step_def.timeout_minutes} minutes"
                if attempt < max_attempts - 1:
                    self._emit_log(run_id, "step", f"  Step '{step_def.name}' timed out, retrying...")
                    continue
                break
            except Exception as e:
                step_state["status"] = StepStatus.FAILURE
                step_state["error"] = str(e)
                break

        step_state["duration_ms"] = int((time.time() - start_time) * 1000)
        step_state["completed_at"] = datetime.utcnow()

        status_icon = "+" if step_state["status"] == StepStatus.SUCCESS else "x"
        self._emit_log(run_id, "step", f"  {status_icon} Step '{step_def.name}' ({step_state['duration_ms']}ms)")

        return step_state

    def _parse_retry_config(self, retry: Any) -> RetryConfig | None:
        """Parse retry config from step definition."""
        if retry is None:
            return None
        if isinstance(retry, RetryConfig):
            return retry
        if isinstance(retry, dict):
            return RetryConfig(**retry)
        return None

    async def _run_shell_command(
        self,
        command: str,
        runner: RunnerType,
        project_path: str | None,
        timeout: int,
        run_id: str,
    ) -> dict:
        """Execute a shell command."""
        cwd = project_path or str(Path.cwd())

        if runner == RunnerType.DOCKER:
            # Docker sandbox execution (delegate to SandboxManager if available)
            try:
                from services.sandbox_manager import SandboxManager

                sandbox = SandboxManager()
                result = await sandbox.execute(command, timeout=timeout)
                return {
                    "stdout": result.get("stdout", ""),
                    "stderr": result.get("stderr", ""),
                    "exit_code": result.get("exit_code", -1),
                }
            except ImportError:
                # Fallback to local execution with warning
                self._emit_log(run_id, "warning", "  Docker runner unavailable, falling back to local")

        # Local execution
        process = await asyncio.create_subprocess_shell(
            command,
            cwd=cwd,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
        )

        try:
            stdout_bytes, stderr_bytes = await asyncio.wait_for(
                process.communicate(), timeout=timeout
            )
        except asyncio.TimeoutError:
            process.kill()
            raise

        return {
            "stdout": stdout_bytes.decode("utf-8", errors="replace"),
            "stderr": stderr_bytes.decode("utf-8", errors="replace"),
            "exit_code": process.returncode or 0,
        }

    def _substitute_variables(self, command: str, env: dict, matrix_values: dict) -> str:
        """Substitute ${{ matrix.* }} and ${{ env.* }} variables (legacy, uses new expander)."""
        return expand_variables(command, env=env, matrix=matrix_values)

    # ── Lifecycle ───────────────────────────────────────────

    def cancel_run(self, run_id: str):
        """Cancel a running workflow."""
        self._cancelled.add(run_id)
        if run_id in self._running_runs:
            self._running_runs[run_id].cancel()

    # ── Logging ─────────────────────────────────────────────

    def _emit_log(self, run_id: str, level: str, message: str):
        """Emit a log entry for a run (with secret masking)."""
        masked_message = mask_secrets(message, self._secrets) if self._secrets else message
        entry = {
            "timestamp": datetime.utcnow().isoformat(),
            "level": level,
            "message": masked_message,
        }
        self._run_logs[run_id].append(entry)

    def get_logs(self, run_id: str, since_index: int = 0) -> list[dict]:
        """Get logs for a run since a given index."""
        return self._run_logs.get(run_id, [])[since_index:]

    def clear_logs(self, run_id: str):
        """Clear logs for a completed run."""
        self._run_logs.pop(run_id, None)
        self._cancelled.discard(run_id)


# Singleton
_engine: WorkflowEngine | None = None


def get_workflow_engine() -> WorkflowEngine:
    global _engine
    if _engine is None:
        _engine = WorkflowEngine()
    return _engine
