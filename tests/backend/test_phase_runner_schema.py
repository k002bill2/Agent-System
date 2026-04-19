"""Tests for phase_runner.schema: Pydantic models + frontmatter parsing."""

from pathlib import Path

import pytest
from pydantic import ValidationError

from phase_runner.schema import PhaseSpec, Task, Wave


class TestTaskValidation:
    def test_accepts_alphanumeric_dash_underscore_id(self):
        Task(id="W0-1")
        Task(id="migrate_button")
        Task(id="ABC123")

    def test_rejects_empty_id(self):
        with pytest.raises(ValidationError):
            Task(id="")

    def test_rejects_special_characters(self):
        with pytest.raises(ValidationError):
            Task(id="task with space")
        with pytest.raises(ValidationError):
            Task(id="task.with.dots")
        with pytest.raises(ValidationError):
            Task(id="task/slash")

    def test_default_fields(self):
        t = Task(id="x")
        assert t.desc is None
        assert t.depends_on == []
        assert t.agent_hint is None
        assert t.status == "pending"


class TestWaveValidation:
    def test_minimal_wave(self):
        w = Wave(name="w1", tasks=[Task(id="a"), Task(id="b")])
        assert len(w.tasks) == 2

    def test_rejects_duplicate_ids(self):
        with pytest.raises(ValidationError, match="duplicate"):
            Wave(name="w1", tasks=[Task(id="a"), Task(id="a")])

    def test_depends_on_references_same_wave(self):
        Wave(
            name="w1",
            tasks=[
                Task(id="a"),
                Task(id="b", depends_on=["a"]),
            ],
        )

    def test_rejects_depends_on_unknown_id(self):
        with pytest.raises(ValidationError, match="depends_on"):
            Wave(
                name="w1",
                tasks=[Task(id="b", depends_on=["missing"])],
            )

    def test_rejects_dependency_cycle(self):
        with pytest.raises(ValidationError, match="cycle"):
            Wave(
                name="w1",
                tasks=[
                    Task(id="a", depends_on=["b"]),
                    Task(id="b", depends_on=["a"]),
                ],
            )

    def test_rejects_self_dependency(self):
        with pytest.raises(ValidationError, match="cycle"):
            Wave(name="w1", tasks=[Task(id="a", depends_on=["a"])])


class TestPhaseSpec:
    def test_minimal_phase(self):
        p = PhaseSpec(
            phase="smoke",
            waves=[Wave(name="w1", tasks=[Task(id="a")])],
        )
        assert p.phase == "smoke"
        assert p.description is None

    def test_rejects_empty_waves(self):
        with pytest.raises(ValidationError):
            PhaseSpec(phase="smoke", waves=[])

    def test_rejects_missing_phase(self):
        with pytest.raises(ValidationError):
            PhaseSpec(waves=[Wave(name="w1", tasks=[Task(id="a")])])


class TestFromTasksMd:
    def test_parses_valid_frontmatter(self, tmp_path: Path):
        md = tmp_path / "smoke-tasks.md"
        md.write_text(
            """---
phase: smoke
description: "test phase"
waves:
  - name: write
    tasks:
      - id: a
        desc: first task
      - id: b
        depends_on: [a]
---

# Smoke Tasks

## Wave 1 — write
- [ ] **a**: first task
- [ ] **b**: depends on a
""",
            encoding="utf-8",
        )
        p = PhaseSpec.from_tasks_md(str(md))
        assert p.phase == "smoke"
        assert p.description == "test phase"
        assert len(p.waves) == 1
        assert p.waves[0].tasks[1].depends_on == ["a"]

    def test_raises_when_no_frontmatter(self, tmp_path: Path):
        md = tmp_path / "no-fm.md"
        md.write_text("# just body\n- [ ] task\n", encoding="utf-8")
        with pytest.raises(ValueError, match="frontmatter"):
            PhaseSpec.from_tasks_md(str(md))

    def test_raises_when_invalid_yaml_schema(self, tmp_path: Path):
        md = tmp_path / "bad.md"
        md.write_text(
            """---
phase: bad
waves:
  - name: w1
    tasks:
      - id: "has space"
---
""",
            encoding="utf-8",
        )
        with pytest.raises(ValidationError):
            PhaseSpec.from_tasks_md(str(md))
