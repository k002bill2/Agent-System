"""Tests for advanced matrix features (exclude/include)."""

import pytest

from models.workflow import WorkflowJobDef, WorkflowStepDef
from services.workflow_engine import WorkflowEngine


class TestAdvancedMatrix:
    def setup_method(self):
        self.engine = WorkflowEngine()

    def _step(self):
        return WorkflowStepDef(name="test", run="echo test")

    def test_basic_matrix(self):
        job = WorkflowJobDef(
            matrix={"os": ["ubuntu", "macos"], "py": ["3.11", "3.12"]},
            steps=[self._step()],
        )
        expanded = self.engine.expand_matrix("test", job)
        assert len(expanded) == 4

    def test_single_dimension_matrix(self):
        job = WorkflowJobDef(
            matrix={"py": ["3.10", "3.11", "3.12"]},
            steps=[self._step()],
        )
        expanded = self.engine.expand_matrix("test", job)
        assert len(expanded) == 3

    def test_no_matrix(self):
        job = WorkflowJobDef(steps=[self._step()])
        expanded = self.engine.expand_matrix("test", job)
        assert len(expanded) == 1
        assert expanded[0][1] == {}

    def test_matrix_with_exclude(self):
        job = WorkflowJobDef(
            matrix={"os": ["ubuntu", "macos"], "py": ["3.11", "3.12"]},
            matrix_exclude=[{"os": "macos", "py": "3.11"}],
            steps=[self._step()],
        )
        expanded = self.engine.expand_matrix("test", job)
        assert len(expanded) == 3
        # macos+3.11 should be excluded
        combos = [combo for _, combo in expanded]
        assert {"os": "macos", "py": "3.11"} not in combos

    def test_matrix_with_include(self):
        job = WorkflowJobDef(
            matrix={"os": ["ubuntu"], "py": ["3.12"]},
            matrix_include=[{"os": "windows", "py": "3.12", "experimental": "true"}],
            steps=[self._step()],
        )
        expanded = self.engine.expand_matrix("test", job)
        assert len(expanded) == 2  # 1 original + 1 included

    def test_matrix_exclude_and_include(self):
        job = WorkflowJobDef(
            matrix={"os": ["ubuntu", "macos"], "py": ["3.11", "3.12"]},
            matrix_exclude=[{"os": "macos", "py": "3.11"}],
            matrix_include=[{"os": "windows", "py": "3.12"}],
            steps=[self._step()],
        )
        expanded = self.engine.expand_matrix("test", job)
        # 4 - 1 (exclude) + 1 (include) = 4
        assert len(expanded) == 4

    def test_empty_matrix(self):
        job = WorkflowJobDef(matrix={}, steps=[self._step()])
        expanded = self.engine.expand_matrix("test", job)
        assert len(expanded) == 1

    def test_matrix_naming(self):
        job = WorkflowJobDef(
            matrix={"py": ["3.11"]},
            steps=[self._step()],
        )
        expanded = self.engine.expand_matrix("build", job)
        name, combo = expanded[0]
        assert "py=3.11" in name
        assert "build" in name
