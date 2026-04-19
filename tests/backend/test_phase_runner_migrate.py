"""Tests for phase_runner.migrate: infer frontmatter from existing tasks.md."""

from pathlib import Path

import pytest

from phase_runner.migrate import infer_frontmatter, migrate_file
from phase_runner.schema import PhaseSpec


SAMPLE_BODY = """# React 19 Migration — Tasks

## Wave 0 — 사전 조사

- [ ] **W0-1**: `cloneElement` 호출부 확인
- [ ] **W0-2**: `useRef()` 인자 없는 호출 수집

## Wave 1 — 핵심 bump

- [ ] **W1-1**: 4개 패키지 묶음 업그레이드
- [x] **W1-2**: 중복 설치 확인
"""


def test_infer_detects_waves_and_tasks():
    fm = infer_frontmatter(SAMPLE_BODY, phase_name="react-19-migration")
    assert fm["phase"] == "react-19-migration"
    waves = fm["waves"]
    assert len(waves) == 2
    assert waves[0]["name"] == "0 — 사전 조사"
    assert [t["id"] for t in waves[0]["tasks"]] == ["W0-1", "W0-2"]
    assert [t["id"] for t in waves[1]["tasks"]] == ["W1-1", "W1-2"]


def test_infer_preserves_done_status():
    fm = infer_frontmatter(SAMPLE_BODY, phase_name="p")
    wave1_tasks = fm["waves"][1]["tasks"]
    statuses = {t["id"]: t.get("status", "pending") for t in wave1_tasks}
    assert statuses["W1-1"] == "pending"
    assert statuses["W1-2"] == "done"


def test_infer_output_round_trips_through_pydantic():
    fm = infer_frontmatter(SAMPLE_BODY, phase_name="react-19-migration")
    # Must validate cleanly
    spec = PhaseSpec.model_validate(fm)
    assert spec.phase == "react-19-migration"


def test_migrate_file_prepends_frontmatter(tmp_path: Path):
    md = tmp_path / "react-19-migration-tasks.md"
    md.write_text(SAMPLE_BODY, encoding="utf-8")
    migrate_file(str(md), phase_name="react-19-migration")
    content = md.read_text(encoding="utf-8")
    assert content.startswith("---\n")
    # frontmatter closes before the original body
    parts = content.split("---\n", 2)
    assert len(parts) == 3
    assert parts[2].lstrip().startswith("# React 19 Migration")


def test_infer_handles_h3_wave_headings():
    body = """# phase

## Tasks

### Wave 1 — 런타임 교체

- [ ] **W1-1**: do thing

### Wave 2 — 마이그레이션

- [ ] **W2-1**: do other thing
"""
    fm = infer_frontmatter(body, phase_name="p")
    assert len(fm["waves"]) == 2
    assert [t["id"] for t in fm["waves"][0]["tasks"]] == ["W1-1"]


def test_infer_falls_back_to_single_default_wave_for_flat_format():
    body = """# Phase X — Tasks

## Tasks

- [x] **P1-1**: do thing one
- [x] **P1-2**: do thing two
"""
    fm = infer_frontmatter(body, phase_name="p")
    assert len(fm["waves"]) == 1
    assert fm["waves"][0]["name"] == "default"
    assert [t["id"] for t in fm["waves"][0]["tasks"]] == ["P1-1", "P1-2"]
    assert all(t["status"] == "done" for t in fm["waves"][0]["tasks"])


def test_migrate_aborts_if_inferred_frontmatter_invalid(tmp_path: Path):
    md = tmp_path / "p-tasks.md"
    md.write_text("# just prose, no waves at all\n", encoding="utf-8")
    with pytest.raises(RuntimeError, match="invalid"):
        migrate_file(str(md), phase_name="p")
    # file must remain unchanged
    assert md.read_text(encoding="utf-8") == "# just prose, no waves at all\n"


def test_migrate_file_is_idempotent(tmp_path: Path):
    md = tmp_path / "p-tasks.md"
    md.write_text(SAMPLE_BODY, encoding="utf-8")
    migrate_file(str(md), phase_name="p")
    first = md.read_text(encoding="utf-8")
    migrate_file(str(md), phase_name="p")
    second = md.read_text(encoding="utf-8")
    assert first == second  # re-running on already-migrated file is a no-op
