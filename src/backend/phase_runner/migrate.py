"""Infer YAML frontmatter from an existing tasks.md and prepend it.

Used to onboard the four existing phases in dev/active/ without hand-writing
frontmatter. Heuristic-only — user is expected to review before committing.
"""

from __future__ import annotations

import re
from pathlib import Path
from typing import Any

import yaml
from pydantic import ValidationError

from phase_runner.schema import PhaseSpec
from services.frontmatter_parser import FrontmatterParser

WAVE_HEADING_RE = re.compile(r"^#{2,4}\s+Wave\s+(?P<name>.+?)\s*$", re.MULTILINE)
TASK_LINE_RE = re.compile(
    r"^\s*-\s+\[(?P<check>[ xX])\]\s+\*\*(?P<id>[A-Za-z0-9_-]+)\*\*",
    re.MULTILINE,
)


def _extract_tasks(section: str) -> list[dict[str, Any]]:
    tasks: list[dict[str, Any]] = []
    for t in TASK_LINE_RE.finditer(section):
        entry: dict[str, Any] = {"id": t.group("id")}
        if t.group("check").lower() == "x":
            entry["status"] = "done"
        tasks.append(entry)
    return tasks


def infer_frontmatter(body: str, phase_name: str) -> dict[str, Any]:
    heading_matches = list(WAVE_HEADING_RE.finditer(body))
    waves: list[dict[str, Any]] = []
    for i, h in enumerate(heading_matches):
        start = h.end()
        end = heading_matches[i + 1].start() if i + 1 < len(heading_matches) else len(body)
        tasks = _extract_tasks(body[start:end])
        if tasks:
            waves.append({"name": h.group("name").strip(), "tasks": tasks})

    if not waves:
        # Flat format: no Wave headings. Treat all task lines as one default wave.
        flat_tasks = _extract_tasks(body)
        if flat_tasks:
            waves.append({"name": "default", "tasks": flat_tasks})

    return {"phase": phase_name, "waves": waves}


def migrate_file(path: str, phase_name: str) -> None:
    content = Path(path).read_text(encoding="utf-8")
    existing_fm, existing_body = FrontmatterParser.parse(content)
    body_for_infer = existing_body if existing_fm else content

    fm = infer_frontmatter(body_for_infer, phase_name)
    try:
        PhaseSpec.model_validate(fm)
    except ValidationError as e:
        raise RuntimeError(
            f"inferred frontmatter for {path} is invalid — aborting write: {e}"
        ) from e

    if existing_fm:
        if existing_fm == fm:
            return  # already migrated with same content — no-op
        # Existing frontmatter differs; replace it with fresh inference
        trailing = existing_body
    else:
        trailing = f"\n{content}"

    rendered = yaml.safe_dump(fm, allow_unicode=True, sort_keys=False)
    Path(path).write_text(f"---\n{rendered}---\n{trailing}", encoding="utf-8")
