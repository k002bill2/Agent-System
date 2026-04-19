"""CLI entry: python -m phase_runner <subcommand> <phase-dir>.

Subcommands:
    validate   Load *-tasks.md, validate schema, print a summary.
    migrate    Prepend inferred YAML frontmatter to *-tasks.md (idempotent).
    sync       Re-sync body checkboxes from frontmatter statuses.
    run        Not supported via CLI — use /execute-tasks-file slash command.
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

from pydantic import ValidationError

from phase_runner.checkbox_sync import sync_checkboxes
from phase_runner.migrate import migrate_file
from phase_runner.schema import PhaseSpec


def _find_tasks_md(phase_dir: Path) -> Path:
    matches = list(phase_dir.glob("*-tasks.md"))
    if not matches:
        plain = phase_dir / "tasks.md"
        if plain.exists():
            return plain
        raise FileNotFoundError(f"No *-tasks.md or tasks.md in {phase_dir}")
    if len(matches) > 1:
        raise RuntimeError(f"Multiple *-tasks.md in {phase_dir}: {matches}")
    return matches[0]


def cmd_validate(phase_dir: Path) -> int:
    tasks_md = _find_tasks_md(phase_dir)
    try:
        spec = PhaseSpec.from_tasks_md(str(tasks_md))
    except (ValueError, ValidationError) as e:
        print(f"INVALID {tasks_md}: {e}", file=sys.stderr)
        return 1
    total_tasks = sum(len(w.tasks) for w in spec.waves)
    print(f"OK — {len(spec.waves)} waves, {total_tasks} tasks")
    return 0


def cmd_migrate(phase_dir: Path) -> int:
    tasks_md = _find_tasks_md(phase_dir)
    migrate_file(str(tasks_md), phase_name=phase_dir.name)
    print(f"migrated {tasks_md} (review with git diff before committing)")
    return 0


def cmd_sync(phase_dir: Path) -> int:
    from services.frontmatter_parser import FrontmatterParser

    tasks_md = _find_tasks_md(phase_dir)
    content = tasks_md.read_text(encoding="utf-8")
    fm, body = FrontmatterParser.parse(content)
    if not fm:
        print(f"No frontmatter in {tasks_md}", file=sys.stderr)
        return 1
    spec = PhaseSpec.model_validate(fm)
    new_body = sync_checkboxes(body, spec)
    if new_body == body:
        print("no changes")
        return 0
    # Reconstruct file: frontmatter + new body
    import yaml

    rendered = yaml.safe_dump(fm, allow_unicode=True, sort_keys=False)
    tasks_md.write_text(f"---\n{rendered}---\n{new_body}", encoding="utf-8")
    print(f"synced checkboxes in {tasks_md}")
    return 0


def cmd_run(phase_dir: Path) -> int:
    print(
        "`run` is not supported via Python CLI.\n"
        "Use the Claude Code slash command instead:\n"
        f"  /execute-tasks-file {phase_dir}",
        file=sys.stderr,
    )
    return 2


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(prog="phase_runner")
    sub = parser.add_subparsers(dest="cmd", required=True)

    for name in ("validate", "migrate", "sync", "run"):
        p = sub.add_parser(name)
        p.add_argument("phase_dir", type=Path)

    args = parser.parse_args(argv)
    return {
        "validate": cmd_validate,
        "migrate": cmd_migrate,
        "sync": cmd_sync,
        "run": cmd_run,
    }[args.cmd](args.phase_dir)


if __name__ == "__main__":
    raise SystemExit(main())
