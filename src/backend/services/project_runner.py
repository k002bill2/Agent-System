"""Project command runner service."""

import asyncio
import time
from collections.abc import AsyncIterator, Callable
from pathlib import Path

from models.monitoring import (
    CheckCompletedPayload,
    CheckProgressPayload,
    CheckResult,
    CheckStartedPayload,
    CheckStatus,
    CheckType,
)
from utils.time import utcnow

# Allowed npm commands (whitelist for security)
# Commands are run from the project root with npm scripts defined in package.json
ALLOWED_COMMANDS: dict[CheckType, list[str]] = {
    CheckType.TEST: ["npm", "test"],
    CheckType.LINT: ["npm", "run", "lint"],
    CheckType.TYPECHECK: ["npm", "run", "type-check"],
    CheckType.BUILD: ["npm", "run", "build"],
}


class ProjectRunner:
    """Runs project checks asynchronously with streaming output."""

    def __init__(self, project_path: str):
        """Initialize runner with project path."""
        self.project_path = Path(project_path)
        if not self.project_path.exists():
            raise ValueError(f"Project path does not exist: {project_path}")

    def _get_command(self, check_type: CheckType) -> list[str]:
        """Get the command for a check type."""
        if check_type not in ALLOWED_COMMANDS:
            raise ValueError(f"Unknown check type: {check_type}")
        return ALLOWED_COMMANDS[check_type].copy()

    async def run_check(
        self,
        check_type: CheckType,
        on_output: Callable[[str, bool], None] | None = None,
    ) -> CheckResult:
        """
        Run a single check and return the result.

        Args:
            check_type: Type of check to run
            on_output: Optional callback for streaming output (line, is_stderr)

        Returns:
            CheckResult with status and output
        """
        command = self._get_command(check_type)
        started_at = utcnow()
        start_time = time.time()

        stdout_lines: list[str] = []
        stderr_lines: list[str] = []

        try:
            # Create subprocess
            process = await asyncio.create_subprocess_exec(
                *command,
                cwd=str(self.project_path),
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE,
                env=None,  # Inherit environment
            )

            # Read stdout and stderr concurrently
            async def read_stream(
                stream: asyncio.StreamReader,
                lines: list[str],
                is_stderr: bool,
            ):
                while True:
                    line = await stream.readline()
                    if not line:
                        break
                    decoded = line.decode("utf-8", errors="replace").rstrip()
                    lines.append(decoded)
                    if on_output:
                        on_output(decoded, is_stderr)

            # Wait for both streams
            await asyncio.gather(
                read_stream(process.stdout, stdout_lines, False),
                read_stream(process.stderr, stderr_lines, True),
            )

            # Wait for process to complete
            exit_code = await process.wait()
            duration_ms = int((time.time() - start_time) * 1000)

            return CheckResult(
                check_type=check_type,
                status=CheckStatus.SUCCESS if exit_code == 0 else CheckStatus.FAILURE,
                exit_code=exit_code,
                stdout="\n".join(stdout_lines),
                stderr="\n".join(stderr_lines),
                duration_ms=duration_ms,
                started_at=started_at,
                completed_at=utcnow(),
            )

        except Exception as e:
            duration_ms = int((time.time() - start_time) * 1000)
            return CheckResult(
                check_type=check_type,
                status=CheckStatus.FAILURE,
                exit_code=-1,
                stdout="\n".join(stdout_lines),
                stderr=f"Error running command: {str(e)}\n" + "\n".join(stderr_lines),
                duration_ms=duration_ms,
                started_at=started_at,
                completed_at=utcnow(),
            )

    async def stream_check(
        self,
        project_id: str,
        check_type: CheckType,
    ) -> AsyncIterator[CheckStartedPayload | CheckProgressPayload | CheckCompletedPayload]:
        """
        Run a check with streaming output.

        Yields events for started, progress, and completed.
        """
        started_at = utcnow()

        # Yield started event
        yield CheckStartedPayload(
            project_id=project_id,
            check_type=check_type,
            started_at=started_at,
        )

        command = self._get_command(check_type)
        start_time = time.time()

        stdout_lines: list[str] = []
        stderr_lines: list[str] = []

        try:
            process = await asyncio.create_subprocess_exec(
                *command,
                cwd=str(self.project_path),
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE,
            )

            # Use a shared queue for both streams - batch lines together
            output_queue: asyncio.Queue[CheckProgressPayload | None] = asyncio.Queue()
            batch_size = 20  # Send every 20 lines as one event

            async def reader(
                stream: asyncio.StreamReader,
                lines: list[str],
                is_stderr: bool,
            ):
                """Read from stream and put to queue in batches."""
                batch: list[str] = []
                while True:
                    line = await stream.readline()
                    if not line:
                        # Flush remaining batch
                        if batch:
                            await output_queue.put(
                                CheckProgressPayload(
                                    project_id=project_id,
                                    check_type=check_type,
                                    output="\n".join(batch),
                                    is_stderr=is_stderr,
                                )
                            )
                        break
                    decoded = line.decode("utf-8", errors="replace").rstrip()
                    lines.append(decoded)
                    batch.append(decoded)

                    # Send batch when full
                    if len(batch) >= batch_size:
                        await output_queue.put(
                            CheckProgressPayload(
                                project_id=project_id,
                                check_type=check_type,
                                output="\n".join(batch),
                                is_stderr=is_stderr,
                            )
                        )
                        batch = []

            # Start readers
            stdout_task = asyncio.create_task(reader(process.stdout, stdout_lines, False))
            stderr_task = asyncio.create_task(reader(process.stderr, stderr_lines, True))

            # Wait for readers and yield progress events
            async def yield_until_done():
                """Yield from queue until both readers are done."""
                while True:
                    # Check if both tasks are done
                    if stdout_task.done() and stderr_task.done():
                        # Drain remaining items from queue
                        while not output_queue.empty():
                            item = await output_queue.get()
                            if item is not None:
                                yield item
                        break

                    try:
                        item = await asyncio.wait_for(output_queue.get(), timeout=0.1)
                        if item is not None:
                            yield item
                    except TimeoutError:
                        continue

            async for event in yield_until_done():
                yield event

            # Wait for tasks to complete
            await asyncio.gather(stdout_task, stderr_task, return_exceptions=True)

            # Wait for process
            exit_code = await process.wait()
            duration_ms = int((time.time() - start_time) * 1000)

            # Yield completed event
            yield CheckCompletedPayload(
                project_id=project_id,
                check_type=check_type,
                status=CheckStatus.SUCCESS if exit_code == 0 else CheckStatus.FAILURE,
                exit_code=exit_code,
                duration_ms=duration_ms,
                stdout="\n".join(stdout_lines),
                stderr="\n".join(stderr_lines),
            )

        except Exception as e:
            duration_ms = int((time.time() - start_time) * 1000)
            yield CheckCompletedPayload(
                project_id=project_id,
                check_type=check_type,
                status=CheckStatus.FAILURE,
                exit_code=-1,
                duration_ms=duration_ms,
                stdout="\n".join(stdout_lines),
                stderr=f"Error: {str(e)}\n" + "\n".join(stderr_lines),
            )


# Global cache for project runners
_runners: dict[str, ProjectRunner] = {}


def get_runner(project_path: str) -> ProjectRunner:
    """Get or create a project runner."""
    if project_path not in _runners:
        _runners[project_path] = ProjectRunner(project_path)
    return _runners[project_path]
