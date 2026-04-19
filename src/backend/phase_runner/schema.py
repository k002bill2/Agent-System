"""Pydantic models for phase_runner: PhaseSpec → Wave → Task.

YAML frontmatter is the single source of truth for execution structure
(dependencies, order, agent hints). Body markdown carries human-readable
descriptions; the runner looks them up by task id when needed.
"""

from __future__ import annotations

import re
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

ID_PATTERN = re.compile(r"^[A-Za-z0-9_-]+$")

TaskStatus = Literal["pending", "in_progress", "done", "failed"]


class Task(BaseModel):
    model_config = ConfigDict(extra="forbid")

    id: str
    desc: str | None = None
    depends_on: list[str] = Field(default_factory=list)
    agent_hint: str | None = None
    status: TaskStatus = "pending"

    @field_validator("id")
    @classmethod
    def _valid_id(cls, v: str) -> str:
        if not ID_PATTERN.match(v):
            raise ValueError(f"Task id must match {ID_PATTERN.pattern}: {v!r}")
        return v


class Wave(BaseModel):
    model_config = ConfigDict(extra="forbid")

    name: str
    tasks: list[Task] = Field(min_length=1)

    @model_validator(mode="after")
    def _validate_ids_and_deps(self) -> Wave:
        ids = [t.id for t in self.tasks]
        if len(set(ids)) != len(ids):
            raise ValueError(f"duplicate task ids in wave {self.name!r}")

        id_set = set(ids)
        for t in self.tasks:
            for dep in t.depends_on:
                if dep not in id_set:
                    raise ValueError(f"task {t.id!r}: depends_on {dep!r} not in same wave")

        if self._has_cycle():
            raise ValueError(f"dependency cycle in wave {self.name!r}")
        return self

    def _has_cycle(self) -> bool:
        deps = {t.id: list(t.depends_on) for t in self.tasks}
        white, gray, black = 0, 1, 2
        color: dict[str, int] = {tid: white for tid in deps}

        def visit(node: str) -> bool:
            color[node] = gray
            for nxt in deps[node]:
                if color[nxt] == gray:
                    return True
                if color[nxt] == white and visit(nxt):
                    return True
            color[node] = black
            return False

        return any(color[tid] == white and visit(tid) for tid in deps)


class PhaseSpec(BaseModel):
    model_config = ConfigDict(extra="forbid")

    phase: str
    description: str | None = None
    waves: list[Wave] = Field(min_length=1)

    @classmethod
    def from_tasks_md(cls, path: str) -> PhaseSpec:
        from services.frontmatter_parser import FrontmatterParser

        fm, _body = FrontmatterParser.parse_file(path)
        if not fm:
            raise ValueError(f"No frontmatter found in {path}")
        return cls.model_validate(fm)
