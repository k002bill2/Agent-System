"""Tests for artifact service."""

import pytest

from utils.time import utcnow
from services.artifact_service import ArtifactService


class TestArtifactService:
    def setup_method(self):
        import tempfile
        self._tmpdir = tempfile.mkdtemp()
        self.svc = ArtifactService(base_dir=self._tmpdir)

    def test_create_artifact(self):
        artifact = self.svc.create_artifact(
            run_id="run1",
            name="test.txt",
            data=b"hello world",
            content_type="text/plain",
        )
        assert artifact["name"] == "test.txt"
        assert artifact["size_bytes"] == 11
        assert artifact["run_id"] == "run1"

    def test_list_artifacts(self):
        self.svc.create_artifact(run_id="run1", name="a.txt", data=b"a")
        self.svc.create_artifact(run_id="run1", name="b.txt", data=b"b")
        self.svc.create_artifact(run_id="run2", name="c.txt", data=b"c")
        assert len(self.svc.list_artifacts("run1")) == 2
        assert len(self.svc.list_artifacts("run2")) == 1

    def test_get_artifact(self):
        created = self.svc.create_artifact(run_id="run1", name="x.txt", data=b"data")
        fetched = self.svc.get_artifact(created["id"])
        assert fetched is not None
        assert fetched["name"] == "x.txt"

    def test_get_artifact_data(self):
        created = self.svc.create_artifact(run_id="run1", name="f.txt", data=b"file content")
        data = self.svc.get_artifact_data(created["id"])
        assert data == b"file content"

    def test_delete_artifact(self):
        created = self.svc.create_artifact(run_id="run1", name="del.txt", data=b"data")
        assert self.svc.delete_artifact(created["id"]) is True
        assert self.svc.get_artifact(created["id"]) is None

    def test_delete_nonexistent(self):
        assert self.svc.delete_artifact("nope") is False

    def test_get_run_artifacts_size(self):
        self.svc.create_artifact(run_id="run1", name="a.txt", data=b"aaa")
        self.svc.create_artifact(run_id="run1", name="b.txt", data=b"bbbbb")
        assert self.svc.get_run_artifacts_size("run1") == 8

    def test_cleanup_expired(self):
        from datetime import timedelta
        artifact = self.svc.create_artifact(
            run_id="run1", name="old.txt", data=b"old", retention_days=0
        )
        # Manually set expires_at to past
        self.svc._artifacts[artifact["id"]]["expires_at"] = utcnow() - timedelta(days=1)
        cleaned = self.svc.cleanup_expired()
        assert cleaned == 1
        assert len(self.svc.list_artifacts("run1")) == 0

    def test_artifact_with_job_and_step(self):
        artifact = self.svc.create_artifact(
            run_id="run1", name="log.txt", data=b"log",
            job_id="job1", step_id="step1",
        )
        assert artifact["job_id"] == "job1"
        assert artifact["step_id"] == "step1"
