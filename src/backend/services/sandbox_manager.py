"""Docker sandbox manager for secure command execution."""

import asyncio
import os
import logging
from typing import Any, Optional

try:
    import docker
    from docker.errors import DockerException, ContainerError, ImageNotFound
    DOCKER_AVAILABLE = True
except ImportError:
    DOCKER_AVAILABLE = False

logger = logging.getLogger(__name__)

# Sandbox configuration
DEFAULT_IMAGE = "aos-sandbox:latest"
DEFAULT_MEMORY_LIMIT = "512m"
DEFAULT_CPU_LIMIT = 1.0
DEFAULT_TIMEOUT = 120  # seconds


class SandboxExecutionResult:
    """Result from sandbox command execution."""

    def __init__(
        self,
        success: bool,
        output: str,
        exit_code: int,
        error: Optional[str] = None,
        execution_time_ms: int = 0,
    ):
        self.success = success
        self.output = output
        self.exit_code = exit_code
        self.error = error
        self.execution_time_ms = execution_time_ms

    def to_dict(self) -> dict[str, Any]:
        return {
            "success": self.success,
            "output": self.output,
            "exit_code": self.exit_code,
            "error": self.error,
            "execution_time_ms": self.execution_time_ms,
        }

    def __str__(self) -> str:
        if self.success:
            return self.output
        return f"Error: {self.error or 'Unknown error'}\n{self.output}"


class SandboxManager:
    """
    Manages Docker containers for sandboxed command execution.

    Features:
    - Network isolation (--network=none)
    - Memory limits
    - CPU limits
    - Non-root user execution
    - Automatic cleanup
    """

    def __init__(
        self,
        image: str = DEFAULT_IMAGE,
        memory_limit: str = DEFAULT_MEMORY_LIMIT,
        cpu_limit: float = DEFAULT_CPU_LIMIT,
        timeout: int = DEFAULT_TIMEOUT,
    ):
        """
        Initialize the sandbox manager.

        Args:
            image: Docker image to use for sandbox
            memory_limit: Memory limit (e.g., "512m", "1g")
            cpu_limit: CPU limit (1.0 = 1 core)
            timeout: Default command timeout in seconds
        """
        self.image = image
        self.memory_limit = memory_limit
        self.cpu_limit = cpu_limit
        self.timeout = timeout
        self._client: Optional[docker.DockerClient] = None
        self._available: Optional[bool] = None

    @property
    def client(self) -> Optional[docker.DockerClient]:
        """Lazy initialization of Docker client."""
        if self._client is None and DOCKER_AVAILABLE:
            try:
                self._client = docker.from_env()
                # Test connection
                self._client.ping()
            except DockerException as e:
                logger.warning(f"Docker not available: {e}")
                self._client = None
        return self._client

    @property
    def available(self) -> bool:
        """Check if sandbox execution is available."""
        if self._available is None:
            if not DOCKER_AVAILABLE:
                self._available = False
            elif self.client is None:
                self._available = False
            else:
                # Check if image exists
                try:
                    self.client.images.get(self.image)
                    self._available = True
                except ImageNotFound:
                    logger.warning(f"Sandbox image not found: {self.image}")
                    self._available = False
                except DockerException as e:
                    logger.warning(f"Docker error checking image: {e}")
                    self._available = False

        return self._available

    def _ensure_available(self) -> None:
        """Raise an error if sandbox is not available."""
        if not self.available:
            raise RuntimeError(
                "Sandbox not available. "
                "Ensure Docker is running and the sandbox image is built. "
                "Run: ./infra/scripts/build-sandbox.sh"
            )

    async def execute(
        self,
        command: str,
        task_id: str,
        project_path: Optional[str] = None,
        timeout: Optional[int] = None,
        env: Optional[dict[str, str]] = None,
    ) -> SandboxExecutionResult:
        """
        Execute a command in a sandboxed Docker container.

        Args:
            command: Shell command to execute
            task_id: Task ID for container naming/tracking
            project_path: Optional project path to mount (read-only)
            timeout: Command timeout in seconds
            env: Additional environment variables

        Returns:
            SandboxExecutionResult with command output
        """
        self._ensure_available()

        timeout = timeout or self.timeout
        container_name = f"aos-sandbox-{task_id[:8]}"

        # Prepare volumes
        volumes = {}
        if project_path and os.path.isdir(project_path):
            # Mount project read-only
            volumes[project_path] = {
                "bind": "/workspace/project",
                "mode": "ro",
            }

        # Prepare environment
        container_env = {
            "TASK_ID": task_id,
            "PYTHONUNBUFFERED": "1",
        }
        if env:
            container_env.update(env)

        import time
        start_time = time.time()

        try:
            # Run container
            container = self.client.containers.run(
                self.image,
                command=["bash", "-c", command],
                name=container_name,
                detach=True,
                remove=False,  # We'll remove manually after getting logs
                user="sandbox",
                working_dir="/workspace",
                # Security constraints
                network_mode="none",  # No network access
                mem_limit=self.memory_limit,
                cpu_period=100000,  # 100ms
                cpu_quota=int(self.cpu_limit * 100000),  # CPU percentage
                read_only=False,  # Workspace needs to be writable
                volumes=volumes,
                environment=container_env,
                # Prevent privilege escalation
                security_opt=["no-new-privileges"],
            )

            try:
                # Wait for completion with timeout
                result = container.wait(timeout=timeout)
                exit_code = result.get("StatusCode", -1)

                # Get logs
                output = container.logs(stdout=True, stderr=True).decode(
                    "utf-8", errors="replace"
                )

                execution_time_ms = int((time.time() - start_time) * 1000)

                return SandboxExecutionResult(
                    success=(exit_code == 0),
                    output=output,
                    exit_code=exit_code,
                    error=None if exit_code == 0 else f"Command exited with code {exit_code}",
                    execution_time_ms=execution_time_ms,
                )

            except Exception as e:
                # Timeout or other error
                try:
                    container.kill()
                except Exception:
                    pass

                execution_time_ms = int((time.time() - start_time) * 1000)

                return SandboxExecutionResult(
                    success=False,
                    output="",
                    exit_code=-1,
                    error=f"Container execution failed: {str(e)}",
                    execution_time_ms=execution_time_ms,
                )

            finally:
                # Always cleanup container
                try:
                    container.remove(force=True)
                except Exception:
                    pass

        except ContainerError as e:
            execution_time_ms = int((time.time() - start_time) * 1000)
            return SandboxExecutionResult(
                success=False,
                output=e.stderr.decode("utf-8", errors="replace") if e.stderr else "",
                exit_code=e.exit_status,
                error=f"Container error: {str(e)}",
                execution_time_ms=execution_time_ms,
            )

        except DockerException as e:
            execution_time_ms = int((time.time() - start_time) * 1000)
            return SandboxExecutionResult(
                success=False,
                output="",
                exit_code=-1,
                error=f"Docker error: {str(e)}",
                execution_time_ms=execution_time_ms,
            )

    async def cleanup_old_containers(self, max_age_seconds: int = 3600) -> int:
        """
        Clean up old sandbox containers.

        Args:
            max_age_seconds: Max age for containers to keep

        Returns:
            Number of containers removed
        """
        if not self.available:
            return 0

        import time
        removed = 0
        current_time = time.time()

        try:
            containers = self.client.containers.list(
                all=True,
                filters={"name": "aos-sandbox-"},
            )

            for container in containers:
                created_str = container.attrs.get("Created", "")
                if created_str:
                    from datetime import datetime
                    # Parse Docker timestamp
                    created = datetime.fromisoformat(
                        created_str.replace("Z", "+00:00")
                    ).timestamp()
                    age = current_time - created

                    if age > max_age_seconds:
                        try:
                            container.remove(force=True)
                            removed += 1
                            logger.info(f"Removed old container: {container.name}")
                        except Exception as e:
                            logger.warning(f"Failed to remove container {container.name}: {e}")

        except DockerException as e:
            logger.warning(f"Error cleaning up containers: {e}")

        return removed


# Global instance (lazy initialized)
_sandbox_manager: Optional[SandboxManager] = None


def get_sandbox_manager() -> SandboxManager:
    """Get or create the global sandbox manager instance."""
    global _sandbox_manager
    if _sandbox_manager is None:
        _sandbox_manager = SandboxManager()
    return _sandbox_manager


async def execute_sandboxed(
    command: str,
    task_id: str,
    project_path: Optional[str] = None,
    timeout: int = DEFAULT_TIMEOUT,
) -> SandboxExecutionResult:
    """
    Convenience function to execute a command in sandbox.

    Falls back to regular execution if sandbox is not available.
    """
    manager = get_sandbox_manager()

    if manager.available:
        return await manager.execute(
            command=command,
            task_id=task_id,
            project_path=project_path,
            timeout=timeout,
        )
    else:
        # Fallback: Log warning and indicate sandbox not available
        logger.warning("Sandbox not available, command not executed for security")
        return SandboxExecutionResult(
            success=False,
            output="",
            exit_code=-1,
            error="Sandbox not available. Build with: ./infra/scripts/build-sandbox.sh",
            execution_time_ms=0,
        )
