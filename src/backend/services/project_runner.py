"""Project command runner service."""

import asyncio
import json
import logging
import time
from collections import OrderedDict
from collections.abc import AsyncIterator, Callable
from pathlib import Path

from models.monitoring import (
    CheckCompletedPayload,
    CheckProgressPayload,
    CheckResult,
    CheckStartedPayload,
    CheckStatus,
)
from utils.time import utcnow

logger = logging.getLogger(__name__)

# Vault health inline script — combines links/frontmatter/orphans/images into one JSON result
_VAULT_HEALTH_SCRIPT = (
    "import os,re,sys,json\n"
    "from datetime import datetime as D\n"
    "v='.'\n"
    "notes={}\n"
    "for r,_,fs in os.walk(v):\n"
    " for f in fs:\n"
    "  if f.endswith('.md'):\n"
    "   p=os.path.join(r,f)\n"
    "   notes[p]=open(p,encoding='utf-8',errors='replace').read()\n"
    "stems={os.path.splitext(os.path.basename(p))[0].lower() for p in notes}\n"
    "ie=('.png','.jpg','.jpeg','.gif','.svg','.webp','.bmp')\n"
    "imgs={f.lower() for r,_,fs in os.walk(v) for f in fs if f.lower().endswith(ie)}\n"
    "bl,refs,mf,bi=[],set(),[],[]\n"
    "for p,t in notes.items():\n"
    " rp=os.path.relpath(p,v)\n"
    " if not t.startswith('---'): mf.append(rp)\n"
    " for m in re.findall(r'\\[\\[([^\\]|#]+)',t):\n"
    "  s=m.strip().lower()\n"
    "  refs.add(s)\n"
    "  if s and s not in stems: bl.append(f'{rp}: [[{m.strip()}]]')\n"
    " for m in re.findall(r'!\\[\\[([^\\]]+?)\\]\\]',t):\n"
    "  if m.lower() not in imgs: bi.append(f'{rp}: ![[{m}]]')\n"
    "orph=sorted(stems-refs)\n"
    "ck=[\n"
    " {'name':'links','status':'fail' if bl else 'pass','count':len(bl),'details':bl[:20]},\n"
    " {'name':'frontmatter','status':'fail' if mf else 'pass','count':len(mf),'details':mf[:20]},\n"
    " {'name':'orphans','status':'warn' if orph else 'pass','count':len(orph),'details':[f'{o}.md' for o in orph[:20]]},\n"
    " {'name':'images','status':'fail' if bi else 'pass','count':len(bi),'details':bi[:20]},\n"
    "]\n"
    "hf=any(c['status']=='fail' for c in ck)\n"
    "hw=any(c['status']=='warn' for c in ck)\n"
    "print(json.dumps({'status':'unhealthy' if hf else 'degraded' if hw else 'healthy',"
    "'timestamp':D.now().isoformat(),"
    "'metrics':{'total_notes':len(notes),'total_links':len(refs),'broken_links':len(bl),"
    "'orphan_notes':len(orph),'missing_frontmatter':len(mf),'broken_images':len(bi)},"
    "'checks':ck},ensure_ascii=False))\n"
    "sys.exit(1 if hf else 0)"
)

PRESET_PROFILES: dict[str, OrderedDict[str, dict[str, str | list[str]]]] = {
    "default": OrderedDict(
        {
            "test": {"label": "Test", "command": ["npm", "test"]},
            "lint": {"label": "Lint", "command": ["npm", "run", "lint"]},
            "typecheck": {"label": "TypeCheck", "command": ["npm", "run", "type-check"]},
            "build": {"label": "Build", "command": ["npm", "run", "build"]},
        }
    ),
    "obsidian": OrderedDict(
        {
            "links": {
                "label": "Links",
                "command": [
                    "python3",
                    "-c",
                    "import os,re,sys\nvault='.'\nstems={os.path.splitext(f)[0].lower() for r,_,fs in os.walk(vault) for f in fs if f.endswith('.md')}\nerrs=[]\nfor r,_,fs in os.walk(vault):\n for f in fs:\n  if not f.endswith('.md'): continue\n  p=os.path.join(r,f)\n  for m in re.findall(r'\\[\\[([^\\]|#]+)',open(p,encoding='utf-8',errors='replace').read()):\n   t=m.strip().lower()\n   if t and t not in stems: errs.append(f'{os.path.relpath(p,vault)}: broken [[{m.strip()}]]')\nfor e in errs: print(e)\nprint(f'Broken links: {len(errs)}')\nsys.exit(1 if errs else 0)",
                ],
            },
            "frontmatter": {
                "label": "Frontmatter",
                "command": [
                    "python3",
                    "-c",
                    "import os,sys\nerrs=[]\nfor r,_,fs in os.walk('.'):\n for f in fs:\n  if not f.endswith('.md'): continue\n  p=os.path.join(r,f)\n  txt=open(p,encoding='utf-8',errors='replace').read()\n  if not txt.startswith('---'): errs.append(f'{os.path.relpath(p,\".\")}: missing frontmatter')\nfor e in errs: print(e)\nprint(f'Frontmatter issues: {len(errs)}')\nsys.exit(1 if errs else 0)",
                ],
            },
            "orphans": {
                "label": "Orphans",
                "command": [
                    "python3",
                    "-c",
                    "import os,re,sys\nvault='.'\nall_stems={os.path.splitext(f)[0].lower() for r,_,fs in os.walk(vault) for f in fs if f.endswith('.md')}\nrefs=set()\nfor r,_,fs in os.walk(vault):\n for f in fs:\n  if not f.endswith('.md'): continue\n  for m in re.findall(r'\\[\\[([^\\]|#]+)',open(os.path.join(r,f),encoding='utf-8',errors='replace').read()):\n   refs.add(m.strip().lower())\norphans=sorted(all_stems-refs)\nfor o in orphans: print(f'orphan: {o}.md')\nprint(f'Orphan notes: {len(orphans)}')\nsys.exit(1 if orphans else 0)",
                ],
            },
            "images": {
                "label": "Images",
                "command": [
                    "python3",
                    "-c",
                    "import os,re,sys\nvault='.'\nimg_ext=('.png','.jpg','.jpeg','.gif','.svg','.webp','.bmp')\nimgs={f.lower() for r,_,fs in os.walk(vault) for f in fs if f.lower().endswith(img_ext)}\nerrs=[]\nfor r,_,fs in os.walk(vault):\n for f in fs:\n  if not f.endswith('.md'): continue\n  p=os.path.join(r,f)\n  for m in re.findall(r'!\\[\\[([^\\]]+?)\\]\\]',open(p,encoding='utf-8',errors='replace').read()):\n   if m.lower() not in imgs: errs.append(f'{os.path.relpath(p,vault)}: broken ![[{m}]]')\nfor e in errs: print(e)\nprint(f'Broken image refs: {len(errs)}')\nsys.exit(1 if errs else 0)",
                ],
            },
            "vault-health": {
                "label": "Vault Health",
                "command": ["python3", "-c", _VAULT_HEALTH_SCRIPT],
            },
        }
    ),
    "python": OrderedDict(
        {
            "test": {"label": "Test", "command": ["pytest"]},
            "lint": {"label": "Lint", "command": ["ruff", "check", "."]},
            "typecheck": {"label": "TypeCheck", "command": ["mypy", "src/"]},
            "build": {"label": "Build", "command": ["python", "-m", "build"]},
        }
    ),
    "go": OrderedDict(
        {
            "test": {"label": "Test", "command": ["go", "test", "./..."]},
            "lint": {"label": "Lint", "command": ["golangci-lint", "run"]},
            "vet": {"label": "Vet", "command": ["go", "vet", "./..."]},
            "build": {"label": "Build", "command": ["go", "build", "./..."]},
        }
    ),
    "rust": OrderedDict(
        {
            "test": {"label": "Test", "command": ["cargo", "test"]},
            "clippy": {"label": "Clippy", "command": ["cargo", "clippy"]},
            "check": {"label": "Check", "command": ["cargo", "check"]},
            "build": {"label": "Build", "command": ["cargo", "build"]},
        }
    ),
}


def _load_project_config(project_path: Path) -> dict | None:
    """Load project config from .aos-project.json."""
    config_file = project_path / ".aos-project.json"
    if not config_file.exists():
        return None
    try:
        return json.loads(config_file.read_text(encoding="utf-8"))
    except (json.JSONDecodeError, OSError) as e:
        logger.warning(f"Failed to load config from {config_file}: {e}")
        return None


def get_check_config(project_path: str) -> OrderedDict[str, dict[str, str]]:
    """Get check configuration for a project.

    Priority: health_checks dict > health_check_preset > default preset.
    Returns OrderedDict of {check_id: {"label": str, "command": str}}.
    """
    path = Path(project_path)
    config = _load_project_config(path)

    # 1. Custom health_checks dict
    if config and "health_checks" in config:
        custom = config["health_checks"]
        result: OrderedDict[str, dict[str, str]] = OrderedDict()
        for check_id, entry in custom.items():
            cmd = entry.get("command", "echo 'no command'")
            if isinstance(cmd, list):
                cmd_str = " ".join(cmd)
            else:
                cmd_str = str(cmd)
            result[check_id] = {
                "label": entry.get("label", check_id.title()),
                "command": cmd_str,
            }
        return result

    # 2. Preset
    preset_name = (config or {}).get("health_check_preset", "default")
    preset = PRESET_PROFILES.get(preset_name, PRESET_PROFILES["default"])

    result = OrderedDict()
    for check_id, entry in preset.items():
        cmd = entry["command"]
        if isinstance(cmd, list):
            cmd_str = " ".join(cmd)
        else:
            cmd_str = str(cmd)
        result[check_id] = {"label": entry["label"], "command": cmd_str}
    return result


class ProjectRunner:
    """Runs project checks asynchronously with streaming output."""

    def __init__(self, project_path: str):
        """Initialize runner with project path."""
        self.project_path = Path(project_path)
        if not self.project_path.exists():
            raise ValueError(f"Project path does not exist: {project_path}")
        self._config = get_check_config(project_path)

    def _get_command(self, check_id: str) -> list[str]:
        """Get the command for a check ID."""
        config = _load_project_config(self.project_path)

        # Check for custom command in .aos-project.json
        if config and "health_checks" in config:
            hc = config["health_checks"]
            if check_id in hc:
                cmd = hc[check_id].get("command")
                if isinstance(cmd, str):
                    return ["bash", "-c", cmd]
                if isinstance(cmd, list):
                    return list(cmd)

        # Check in preset
        preset_name = (config or {}).get("health_check_preset", "default")
        preset = PRESET_PROFILES.get(preset_name, PRESET_PROFILES["default"])
        if check_id in preset:
            cmd = preset[check_id]["command"]
            if isinstance(cmd, str):
                return ["bash", "-c", cmd]
            return list(cmd)

        raise ValueError(f"Unknown check type: {check_id}")

    async def run_check(
        self,
        check_type: str,
        on_output: Callable[[str, bool], None] | None = None,
    ) -> CheckResult:
        """
        Run a single check and return the result.

        Args:
            check_type: Check type ID (e.g. 'test', 'lint', 'links')
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
        check_type: str,
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
    """Get or create a project runner.

    Always creates a new runner to pick up config changes in .aos-project.json.
    """
    _runners[project_path] = ProjectRunner(project_path)
    return _runners[project_path]
