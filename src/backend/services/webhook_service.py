"""Webhook service for workflow triggers."""

import hashlib
import hmac
import uuid
from datetime import datetime
from fnmatch import fnmatch
from typing import Any

from models.workflow import TriggerType, WorkflowRunTrigger


class WebhookService:
    """Manages webhooks for workflow triggering."""

    def __init__(self):
        self._webhooks: dict[str, dict[str, Any]] = {}  # webhook_id -> config

    def create_webhook(self, workflow_id: str) -> dict:
        """Create a new webhook for a workflow."""
        webhook_id = str(uuid.uuid4())
        secret = uuid.uuid4().hex
        now = datetime.utcnow()

        webhook = {
            "id": webhook_id,
            "workflow_id": workflow_id,
            "secret": secret,
            "is_active": True,
            "allowed_events": ["push", "pull_request"],
            "created_at": now,
        }
        self._webhooks[webhook_id] = webhook
        return webhook

    def get_webhook(self, webhook_id: str) -> dict | None:
        """Get a webhook by ID."""
        return self._webhooks.get(webhook_id)

    def get_webhooks_for_workflow(self, workflow_id: str) -> list[dict]:
        """Get all webhooks for a workflow."""
        return [
            w for w in self._webhooks.values()
            if w["workflow_id"] == workflow_id
        ]

    def delete_webhook(self, webhook_id: str) -> bool:
        """Delete a webhook."""
        return self._webhooks.pop(webhook_id, None) is not None

    def verify_signature(self, webhook_id: str, payload: bytes, signature: str) -> bool:
        """Verify HMAC-SHA256 signature (X-Hub-Signature-256 header)."""
        webhook = self._webhooks.get(webhook_id)
        if not webhook:
            return False

        expected = "sha256=" + hmac.new(
            webhook["secret"].encode(),
            payload,
            hashlib.sha256,
        ).hexdigest()

        return hmac.compare_digest(expected, signature)

    async def handle_webhook(
        self,
        webhook_id: str,
        event_type: str,
        payload: dict,
    ) -> dict | None:
        """Handle an incoming webhook event and potentially trigger a workflow run."""
        webhook = self._webhooks.get(webhook_id)
        if not webhook:
            return None

        if not webhook["is_active"]:
            return {"status": "ignored", "reason": "webhook_inactive"}

        if event_type not in webhook["allowed_events"]:
            return {"status": "ignored", "reason": f"event_type '{event_type}' not allowed"}

        workflow_id = webhook["workflow_id"]

        # Parse trigger type from event
        trigger_type = TriggerType.WEBHOOK
        if event_type == "push":
            trigger_type = TriggerType.PUSH
        elif event_type == "pull_request":
            trigger_type = TriggerType.PULL_REQUEST

        # Trigger the workflow
        try:
            from services.workflow_service import get_workflow_service

            service = get_workflow_service()
            trigger = WorkflowRunTrigger(
                trigger_type=trigger_type,
                inputs={"event": event_type},
                branch=self._extract_branch(event_type, payload),
            )
            run = await service.trigger_run(workflow_id, trigger)
            return {"status": "triggered", "run_id": run["id"]}
        except Exception as e:
            return {"status": "error", "error": str(e)}

    def matches_branch_filter(
        self,
        branch: str,
        filters: list[str],
    ) -> bool:
        """Check if a branch matches any of the filter patterns."""
        if not filters:
            return True  # No filters = match all
        return any(fnmatch(branch, pattern) for pattern in filters)

    def matches_path_filter(
        self,
        changed_files: list[str],
        filters: list[str],
    ) -> bool:
        """Check if any changed file matches the path filters."""
        if not filters:
            return True  # No filters = match all
        return any(
            fnmatch(f, pattern)
            for f in changed_files
            for pattern in filters
        )

    def _extract_branch(self, event_type: str, payload: dict) -> str | None:
        """Extract branch name from webhook payload."""
        if event_type == "push":
            ref = payload.get("ref", "")
            if ref.startswith("refs/heads/"):
                return ref[len("refs/heads/"):]
            return ref
        elif event_type == "pull_request":
            pr = payload.get("pull_request", {})
            head = pr.get("head", {})
            return head.get("ref")
        return None


# Singleton
_service: WebhookService | None = None


def get_webhook_service() -> WebhookService:
    global _service
    if _service is None:
        _service = WebhookService()
    return _service
