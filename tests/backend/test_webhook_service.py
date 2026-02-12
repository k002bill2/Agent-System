"""Tests for webhook service."""

import hashlib
import hmac

import pytest

from services.webhook_service import WebhookService


class TestWebhookService:
    def setup_method(self):
        self.svc = WebhookService()

    def test_create_webhook(self):
        webhook = self.svc.create_webhook("wf1")
        assert webhook["workflow_id"] == "wf1"
        assert webhook["is_active"] is True
        assert webhook["secret"]

    def test_get_webhook(self):
        webhook = self.svc.create_webhook("wf1")
        fetched = self.svc.get_webhook(webhook["id"])
        assert fetched is not None
        assert fetched["id"] == webhook["id"]

    def test_get_nonexistent_webhook(self):
        assert self.svc.get_webhook("nope") is None

    def test_list_webhooks_for_workflow(self):
        self.svc.create_webhook("wf1")
        self.svc.create_webhook("wf1")
        self.svc.create_webhook("wf2")
        assert len(self.svc.get_webhooks_for_workflow("wf1")) == 2
        assert len(self.svc.get_webhooks_for_workflow("wf2")) == 1

    def test_delete_webhook(self):
        webhook = self.svc.create_webhook("wf1")
        assert self.svc.delete_webhook(webhook["id"]) is True
        assert self.svc.get_webhook(webhook["id"]) is None

    def test_delete_nonexistent(self):
        assert self.svc.delete_webhook("nope") is False

    def test_verify_signature_valid(self):
        webhook = self.svc.create_webhook("wf1")
        payload = b'{"ref":"refs/heads/main"}'
        expected = "sha256=" + hmac.new(
            webhook["secret"].encode(), payload, hashlib.sha256
        ).hexdigest()
        assert self.svc.verify_signature(webhook["id"], payload, expected) is True

    def test_verify_signature_invalid(self):
        webhook = self.svc.create_webhook("wf1")
        assert self.svc.verify_signature(webhook["id"], b"test", "sha256=invalid") is False

    def test_verify_signature_nonexistent_webhook(self):
        assert self.svc.verify_signature("nope", b"test", "sha256=abc") is False

    def test_matches_branch_filter(self):
        assert self.svc.matches_branch_filter("main", ["main", "release/*"]) is True
        assert self.svc.matches_branch_filter("develop", ["main", "release/*"]) is False
        assert self.svc.matches_branch_filter("release/v1", ["main", "release/*"]) is True

    def test_matches_branch_filter_empty(self):
        assert self.svc.matches_branch_filter("any", []) is True

    def test_matches_path_filter(self):
        assert self.svc.matches_path_filter(["src/main.py"], ["src/**"]) is True
        assert self.svc.matches_path_filter(["docs/readme.md"], ["src/**"]) is False

    def test_matches_path_filter_empty(self):
        assert self.svc.matches_path_filter(["any.py"], []) is True

    def test_extract_branch_push(self):
        branch = self.svc._extract_branch("push", {"ref": "refs/heads/main"})
        assert branch == "main"

    def test_extract_branch_pr(self):
        branch = self.svc._extract_branch(
            "pull_request",
            {"pull_request": {"head": {"ref": "feature/x"}}},
        )
        assert branch == "feature/x"

    @pytest.mark.asyncio
    async def test_handle_webhook_inactive(self):
        webhook = self.svc.create_webhook("wf1")
        webhook["is_active"] = False
        result = await self.svc.handle_webhook(webhook["id"], "push", {})
        assert result["status"] == "ignored"

    @pytest.mark.asyncio
    async def test_handle_webhook_disallowed_event(self):
        webhook = self.svc.create_webhook("wf1")
        result = await self.svc.handle_webhook(webhook["id"], "release", {})
        assert result["status"] == "ignored"
