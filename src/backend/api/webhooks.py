"""Webhook API router."""

from fastapi import APIRouter, Depends, Header, HTTPException, Request
from sqlalchemy.ext.asyncio import AsyncSession

from api.deps import get_current_user, get_db_session
from api.workflow_authz import authorize_workflow
from db.models import UserModel
from services.webhook_service import get_webhook_service

router = APIRouter(prefix="/webhooks", tags=["webhooks"])


@router.post("/{webhook_id}")
async def receive_webhook(
    webhook_id: str,
    request: Request,
    x_github_event: str | None = Header(None, alias="X-GitHub-Event"),
    x_hub_signature_256: str | None = Header(None, alias="X-Hub-Signature-256"),
):
    """Receive and process an incoming webhook.

    This endpoint is unauthenticated by design, so the HMAC signature is the
    only credential. It is therefore mandatory: an unsigned request is rejected
    before the body is parsed and before any workflow can be triggered.
    """
    if not x_hub_signature_256:
        raise HTTPException(status_code=401, detail="Missing webhook signature")

    service = get_webhook_service()
    webhook = service.get_webhook(webhook_id)
    if not webhook:
        raise HTTPException(status_code=404, detail="Webhook not found")

    body = await request.body()
    if not service.verify_signature(webhook_id, body, x_hub_signature_256):
        raise HTTPException(status_code=401, detail="Invalid signature")

    try:
        payload = await request.json()
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid webhook payload")
    if not isinstance(payload, dict):
        raise HTTPException(status_code=400, detail="Invalid webhook payload")

    event_type = x_github_event or payload.get("event", "push")

    result = await service.handle_webhook(webhook_id, event_type, payload)
    if result is None:
        raise HTTPException(status_code=404, detail="Webhook not found")

    return result


# Workflow-scoped webhook management
workflow_webhook_router = APIRouter(
    tags=["webhooks"],
    dependencies=[Depends(get_current_user)],
)


@workflow_webhook_router.post("/workflows/{workflow_id}/webhooks", status_code=201)
async def create_webhook(
    workflow_id: str,
    db: AsyncSession = Depends(get_db_session),
    current_user: UserModel = Depends(get_current_user),
):
    """Create a webhook for a workflow."""
    await authorize_workflow(workflow_id, current_user, db, min_role="editor")
    service = get_webhook_service()
    webhook = service.create_webhook(workflow_id)
    return {
        "id": webhook["id"],
        "workflow_id": webhook["workflow_id"],
        "url": f"/api/webhooks/{webhook['id']}",
        "secret": webhook["secret"],
        "is_active": webhook["is_active"],
        "allowed_events": webhook["allowed_events"],
        "created_at": webhook["created_at"].isoformat(),
    }


@workflow_webhook_router.get("/workflows/{workflow_id}/webhooks")
async def list_webhooks(
    workflow_id: str,
    db: AsyncSession = Depends(get_db_session),
    current_user: UserModel = Depends(get_current_user),
):
    """List webhooks for a workflow."""
    await authorize_workflow(workflow_id, current_user, db)
    service = get_webhook_service()
    webhooks = service.get_webhooks_for_workflow(workflow_id)
    return {
        "webhooks": [
            {
                "id": w["id"],
                "workflow_id": w["workflow_id"],
                "url": f"/api/webhooks/{w['id']}",
                "is_active": w["is_active"],
                "allowed_events": w["allowed_events"],
                "created_at": w["created_at"].isoformat(),
            }
            for w in webhooks
        ],
        "total": len(webhooks),
    }


@workflow_webhook_router.delete("/workflows/{workflow_id}/webhooks/{webhook_id}", status_code=204)
async def delete_webhook(
    workflow_id: str,
    webhook_id: str,
    db: AsyncSession = Depends(get_db_session),
    current_user: UserModel = Depends(get_current_user),
):
    """Delete a webhook belonging to the given workflow."""
    await authorize_workflow(workflow_id, current_user, db, min_role="editor")
    service = get_webhook_service()
    webhook = service.get_webhook(webhook_id)
    # The authorization above covers ``workflow_id`` only, so a webhook owned by
    # a different workflow must not be deletable through this path.
    if not webhook or webhook.get("workflow_id") != workflow_id:
        raise HTTPException(status_code=404, detail="Webhook not found")
    if not service.delete_webhook(webhook_id):
        raise HTTPException(status_code=404, detail="Webhook not found")
