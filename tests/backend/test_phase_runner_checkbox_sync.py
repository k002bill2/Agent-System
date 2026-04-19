"""Tests for phase_runner.checkbox_sync: YAML status <-> markdown checkboxes."""

from phase_runner.checkbox_sync import sync_checkboxes
from phase_runner.schema import PhaseSpec, Task, Wave


def _spec(task: Task) -> PhaseSpec:
    return PhaseSpec(phase="p", waves=[Wave(name="w", tasks=[task])])


class TestStatusToCheckbox:
    def test_done_marks_checkbox(self):
        body = "- [ ] **W0-1**: first task\n"
        out = sync_checkboxes(body, _spec(Task(id="W0-1", status="done")))
        assert out == "- [x] **W0-1**: first task\n"

    def test_pending_unmarks_checkbox(self):
        body = "- [x] **W0-1**: first task\n"
        out = sync_checkboxes(body, _spec(Task(id="W0-1", status="pending")))
        assert out == "- [ ] **W0-1**: first task\n"

    def test_failed_leaves_unchecked(self):
        body = "- [ ] **W0-1**: first task\n"
        out = sync_checkboxes(body, _spec(Task(id="W0-1", status="failed")))
        assert out == "- [ ] **W0-1**: first task\n"


class TestIdFormats:
    def test_bold_id_with_colon(self):
        body = "- [ ] **migrate_button**: do stuff\n"
        out = sync_checkboxes(
            body, _spec(Task(id="migrate_button", status="done"))
        )
        assert "[x]" in out

    def test_plain_id_with_colon(self):
        body = "- [ ] W0-1: do stuff\n"
        out = sync_checkboxes(body, _spec(Task(id="W0-1", status="done")))
        assert out == "- [x] W0-1: do stuff\n"

    def test_bold_id_without_colon(self):
        body = "- [ ] **W0-1** continues here\n"
        out = sync_checkboxes(body, _spec(Task(id="W0-1", status="done")))
        assert out == "- [x] **W0-1** continues here\n"

    def test_preserves_indentation(self):
        body = "  - [ ] **W0-1**: nested\n"
        out = sync_checkboxes(body, _spec(Task(id="W0-1", status="done")))
        assert out == "  - [x] **W0-1**: nested\n"


class TestSelectivity:
    def test_skips_tasks_not_in_body(self):
        body = "no checkboxes here\n"
        out = sync_checkboxes(body, _spec(Task(id="W0-1", status="done")))
        assert out == body

    def test_does_not_touch_other_checkboxes(self):
        body = (
            "- [ ] **W0-1**: managed\n"
            "- [ ] **UNKNOWN**: manual item user added\n"
        )
        out = sync_checkboxes(body, _spec(Task(id="W0-1", status="done")))
        assert "- [x] **W0-1**" in out
        assert "- [ ] **UNKNOWN**" in out

    def test_multiple_tasks_updated(self):
        body = "- [ ] **A**: one\n- [ ] **B**: two\n- [ ] **C**: three\n"
        spec = PhaseSpec(
            phase="p",
            waves=[
                Wave(
                    name="w",
                    tasks=[
                        Task(id="A", status="done"),
                        Task(id="B", status="done"),
                        Task(id="C", status="pending"),
                    ],
                )
            ],
        )
        out = sync_checkboxes(body, spec)
        assert out == "- [x] **A**: one\n- [x] **B**: two\n- [ ] **C**: three\n"

    def test_word_boundary_does_not_match_substring(self):
        body = "- [ ] **W0-1-extra**: not the same id\n"
        out = sync_checkboxes(body, _spec(Task(id="W0-1", status="done")))
        assert out == body
