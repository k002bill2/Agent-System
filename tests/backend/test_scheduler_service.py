"""Tests for scheduler service."""

import pytest
from unittest.mock import patch, AsyncMock

from services.scheduler_service import SchedulerService


class TestSchedulerService:
    def setup_method(self):
        self.svc = SchedulerService()
        self.svc.start()

    def teardown_method(self):
        self.svc.shutdown()

    def test_add_schedule(self):
        result = self.svc.add_schedule("wf1", "0 * * * *")
        assert result["workflow_id"] == "wf1"
        assert result["cron"] == "0 * * * *"
        assert result["is_active"] is True

    def test_add_schedule_invalid_cron(self):
        with pytest.raises(ValueError, match="Invalid cron"):
            self.svc.add_schedule("wf1", "invalid")

    def test_add_schedule_wrong_fields(self):
        with pytest.raises(ValueError):
            self.svc.add_schedule("wf1", "* *")

    def test_get_schedule(self):
        self.svc.add_schedule("wf1", "0 9 * * *")
        schedule = self.svc.get_schedule("wf1")
        assert schedule is not None
        assert schedule["cron"] == "0 9 * * *"

    def test_get_nonexistent_schedule(self):
        assert self.svc.get_schedule("nope") is None

    def test_remove_schedule(self):
        self.svc.add_schedule("wf1", "0 * * * *")
        assert self.svc.remove_schedule("wf1") is True
        assert self.svc.get_schedule("wf1") is None

    def test_remove_nonexistent(self):
        assert self.svc.remove_schedule("nope") is False

    def test_pause_resume_schedule(self):
        self.svc.add_schedule("wf1", "0 * * * *")
        assert self.svc.pause_schedule("wf1") is True
        schedule = self.svc.get_schedule("wf1")
        assert schedule["is_active"] is False
        assert self.svc.resume_schedule("wf1") is True
        schedule = self.svc.get_schedule("wf1")
        assert schedule["is_active"] is True

    def test_get_next_runs(self):
        runs = self.svc.get_next_runs("0 * * * *", count=3)
        assert len(runs) == 3

    def test_replace_existing_schedule(self):
        self.svc.add_schedule("wf1", "0 * * * *")
        self.svc.add_schedule("wf1", "30 * * * *")
        schedule = self.svc.get_schedule("wf1")
        assert schedule["cron"] == "30 * * * *"
