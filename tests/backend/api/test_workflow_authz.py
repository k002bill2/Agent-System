"""Authorization regression tests for the workflow-adjacent routers.

Two layers on purpose:

* handler-direct tests exercise the RBAC branches with a stub database, because
  a non-privileged identity in the ASGI app would reach a real ``AsyncSession``
  and surface as 503 rather than 403;
* ASGI tests assert the routers are actually mounted and gated -- ``app.py``
  imports them through ``safe_import``, which swallows ImportError, so a broken
  import would silently remove the routes while handler tests still passed.
"""

from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest
from fastapi import HTTPException

ADMIN = SimpleNamespace(id="admin", role="admin", is_admin=True, is_active=True)
MEMBER = SimpleNamespace(id="member", role="user", is_admin=False, is_active=True)


def _stub_db():
    return SimpleNamespace(execute=AsyncMock(side_effect=AssertionError("unexpected query")))


# ── Router wiring: every workflow-adjacent route is authenticated ──────


@pytest.mark.anyio
@pytest.mark.parametrize(
    ("method", "path"),
    [
        ("get", "/api/workflows/runs/run-1/artifacts"),
        ("get", "/api/workflows/artifacts/a-1"),
        ("get", "/api/workflows/artifacts/a-1/download"),
        ("delete", "/api/workflows/artifacts/a-1"),
        ("get", "/api/workflows/templates"),
        ("post", "/api/workflows/templates"),
        ("get", "/api/workflows/templates/t-1"),
        ("delete", "/api/workflows/templates/t-1"),
        ("post", "/api/workflows/from-template/t-1"),
        ("get", "/api/workflows/wf-1/webhooks"),
        ("post", "/api/workflows/wf-1/webhooks"),
        ("delete", "/api/workflows/wf-1/webhooks/wh-1"),
    ],
)
async def test_workflow_adjacent_routes_require_authentication(client, method, path):
    """401, not 404/422: the route exists and rejects before doing any work."""
    response = await getattr(client, method)(path)
    assert response.status_code == 401, f"{method.upper()} {path} -> {response.status_code}"


@pytest.mark.anyio
async def test_blank_project_id_query_is_rejected(client, authenticated_app):
    """``?project_id=`` must not degrade into an unfiltered listing."""
    response = await client.get("/api/workflows?project_id=")
    assert response.status_code == 400
    assert response.json()["detail"] == "Invalid project identifier"


@pytest.mark.anyio
async def test_scoped_listing_still_works_for_authorized_user(client, authenticated_app):
    """Guard against "fixed by rejecting everything"."""
    response = await client.get("/api/workflows?project_id=some-project")
    assert response.status_code == 200
    assert response.json()["total"] == 0


# ── list_workflows: the response never leaves the authorized scope ─────


@pytest.mark.anyio
async def test_scoped_listing_drops_global_and_foreign_workflows(monkeypatch):
    """A scoped request must not return global (project_id=None) workflows."""
    from api import workflows as workflows_api

    async def allow(*_args, **_kwargs):
        return None

    rows = [
        {"id": "w-mine", "project_id": "p1"},
        {"id": "w-global", "project_id": None},
        {"id": "w-other", "project_id": "p2"},
    ]
    monkeypatch.setattr(workflows_api, "authorize_workflow_project", allow)
    monkeypatch.setattr(
        workflows_api,
        "get_workflow_service",
        lambda: SimpleNamespace(list_workflows=lambda project_id=None: list(rows)),
    )
    monkeypatch.setattr(workflows_api, "_to_workflow_response", lambda w: w)

    result = await workflows_api.list_workflows(project_id="p1", db=_stub_db(), current_user=MEMBER)

    assert [w["id"] for w in result["workflows"]] == ["w-mine"]
    assert result["total"] == 1


@pytest.mark.anyio
async def test_unscoped_listing_is_privileged_only():
    """No project filter means "everything", so it stays operator-only."""
    from api import workflows as workflows_api

    with pytest.raises(HTTPException) as exc_info:
        await workflows_api.list_workflows(project_id=None, db=_stub_db(), current_user=MEMBER)
    assert exc_info.value.status_code == 403


# ── update_workflow: both sides of a project move are authorized ───────


def _patch_update_authz(monkeypatch, *, existing_project, target_allowed=True):
    from api import workflows as workflows_api

    calls: list[tuple] = []

    async def fake_authorize_workflow(workflow_id, _user, _db, min_role="viewer"):
        calls.append(("workflow", workflow_id, min_role))
        return {"id": workflow_id, "project_id": existing_project}

    async def fake_authorize_project(project_id, _user, _db, min_role="viewer"):
        calls.append(("project", project_id, min_role))
        if not target_allowed:
            raise HTTPException(status_code=403, detail="Target project access denied")

    monkeypatch.setattr(workflows_api, "authorize_workflow", fake_authorize_workflow)
    monkeypatch.setattr(workflows_api, "authorize_workflow_project", fake_authorize_project)
    return calls


@pytest.mark.anyio
async def test_project_move_authorizes_the_target_project(monkeypatch):
    """Moving a workflow needs editor rights on the destination, not just the source."""
    from api import workflows as workflows_api
    from models.workflow import WorkflowUpdate

    calls = _patch_update_authz(monkeypatch, existing_project="p1")
    updated = {"id": "wf-1", "project_id": "p2"}
    monkeypatch.setattr(
        workflows_api,
        "get_workflow_service",
        lambda: SimpleNamespace(update_workflow=lambda *_a, **_k: updated),
    )
    monkeypatch.setattr(workflows_api, "_to_workflow_response", lambda w: w)

    await workflows_api.update_workflow(
        "wf-1", WorkflowUpdate(project_id="p2"), db=_stub_db(), current_user=MEMBER
    )

    assert ("workflow", "wf-1", "editor") in calls
    assert ("project", "p2", "editor") in calls


@pytest.mark.anyio
async def test_project_move_to_unauthorized_target_is_denied(monkeypatch):
    """An unauthorized destination blocks the update before it is persisted."""
    from api import workflows as workflows_api
    from models.workflow import WorkflowUpdate

    _patch_update_authz(monkeypatch, existing_project="p1", target_allowed=False)

    def must_not_run(*_args, **_kwargs):
        raise AssertionError("update reached the service layer")

    monkeypatch.setattr(
        workflows_api,
        "get_workflow_service",
        lambda: SimpleNamespace(update_workflow=must_not_run),
    )

    with pytest.raises(HTTPException) as exc_info:
        await workflows_api.update_workflow(
            "wf-1", WorkflowUpdate(project_id="p2"), db=_stub_db(), current_user=MEMBER
        )
    assert exc_info.value.status_code == 403


@pytest.mark.anyio
async def test_project_move_to_global_requires_privilege(monkeypatch):
    """``project_id: null`` is the global scope -- it must not be a free target."""
    from api import workflows as workflows_api
    from models.workflow import WorkflowUpdate

    async def fake_authorize_workflow(workflow_id, _user, _db, min_role="viewer"):
        return {"id": workflow_id, "project_id": "p1"}

    monkeypatch.setattr(workflows_api, "authorize_workflow", fake_authorize_workflow)
    monkeypatch.setattr(
        workflows_api,
        "get_workflow_service",
        lambda: SimpleNamespace(
            update_workflow=lambda *_a, **_k: (_ for _ in ()).throw(
                AssertionError("update reached the service layer")
            )
        ),
    )

    with pytest.raises(HTTPException) as exc_info:
        await workflows_api.update_workflow(
            "wf-1", WorkflowUpdate(project_id=None), db=_stub_db(), current_user=MEMBER
        )
    assert exc_info.value.status_code == 403


@pytest.mark.anyio
async def test_update_without_project_change_does_not_reauthorize_target(monkeypatch):
    """A plain rename must not demand rights it never needed."""
    from api import workflows as workflows_api
    from models.workflow import WorkflowUpdate

    calls = _patch_update_authz(monkeypatch, existing_project="p1")
    monkeypatch.setattr(
        workflows_api,
        "get_workflow_service",
        lambda: SimpleNamespace(update_workflow=lambda *_a, **_k: {"id": "wf-1"}),
    )
    monkeypatch.setattr(workflows_api, "_to_workflow_response", lambda w: w)

    await workflows_api.update_workflow(
        "wf-1", WorkflowUpdate(name="renamed"), db=_stub_db(), current_user=MEMBER
    )

    assert [c[0] for c in calls] == ["workflow"]


# ── Templates: a template is not a route into someone else's project ──


@pytest.mark.anyio
async def test_create_from_template_denies_unauthorized_project(monkeypatch):
    from api import templates as templates_api

    async def deny(*_args, **_kwargs):
        raise HTTPException(status_code=403, detail="No access to this project")

    monkeypatch.setattr(templates_api, "authorize_workflow_project", deny)
    monkeypatch.setattr(
        templates_api,
        "get_template_service",
        lambda: SimpleNamespace(
            create_workflow_from_template=lambda *_a, **_k: (_ for _ in ()).throw(
                AssertionError("workflow was created despite denial")
            )
        ),
    )

    with pytest.raises(HTTPException) as exc_info:
        await templates_api.create_from_template(
            "t-1", name=None, project_id="p2", db=_stub_db(), current_user=MEMBER
        )
    assert exc_info.value.status_code == 403


@pytest.mark.anyio
async def test_create_from_template_into_global_requires_privilege():
    from api import templates as templates_api

    with pytest.raises(HTTPException) as exc_info:
        await templates_api.create_from_template(
            "t-1", name=None, project_id=None, db=_stub_db(), current_user=MEMBER
        )
    assert exc_info.value.status_code == 403


@pytest.mark.anyio
async def test_create_from_template_rejects_blank_project():
    from api import templates as templates_api

    with pytest.raises(HTTPException) as exc_info:
        await templates_api.create_from_template(
            "t-1", name=None, project_id="  ", db=_stub_db(), current_user=ADMIN
        )
    assert exc_info.value.status_code == 400


# ── Artifacts: authorization walks run -> workflow -> project ──────────


@pytest.mark.anyio
async def test_artifact_listing_is_denied_without_run_access(monkeypatch):
    from api import artifacts as artifacts_api

    async def deny(*_args, **_kwargs):
        raise HTTPException(status_code=403, detail="No access to this project")

    monkeypatch.setattr(artifacts_api, "authorize_run", deny)
    monkeypatch.setattr(
        artifacts_api,
        "get_artifact_service",
        lambda: SimpleNamespace(
            list_artifacts=lambda *_a, **_k: (_ for _ in ()).throw(
                AssertionError("artifacts were read despite denial")
            )
        ),
    )

    with pytest.raises(HTTPException) as exc_info:
        await artifacts_api.list_artifacts("run-1", db=_stub_db(), current_user=MEMBER)
    assert exc_info.value.status_code == 403


@pytest.mark.anyio
async def test_artifact_download_authorizes_the_owning_run(monkeypatch):
    from api import artifacts as artifacts_api

    seen: list[tuple] = []

    async def record(run_id, _user, _db, min_role="viewer"):
        seen.append((run_id, min_role))
        raise HTTPException(status_code=403, detail="No access to this project")

    monkeypatch.setattr(artifacts_api, "authorize_run", record)
    monkeypatch.setattr(
        artifacts_api,
        "get_artifact_service",
        lambda: SimpleNamespace(
            get_artifact=lambda _id: {"id": "a-1", "run_id": "run-9", "name": "x"},
            get_artifact_data=lambda _id: (_ for _ in ()).throw(
                AssertionError("artifact bytes were read despite denial")
            ),
        ),
    )

    with pytest.raises(HTTPException) as exc_info:
        await artifacts_api.download_artifact("a-1", db=_stub_db(), current_user=MEMBER)

    assert exc_info.value.status_code == 403
    assert seen == [("run-9", "viewer")]


# ── Webhooks ──────────────────────────────────────────────────────────


class _Request:
    def __init__(self, body: bytes):
        self._body = body

    async def body(self) -> bytes:
        return self._body

    async def json(self):
        import json

        return json.loads(self._body)


@pytest.mark.anyio
async def test_unsigned_webhook_is_rejected_without_executing(monkeypatch):
    """The signature is the only credential, so it cannot be optional."""
    from api import webhooks as webhooks_api

    handle = AsyncMock()
    monkeypatch.setattr(
        webhooks_api,
        "get_webhook_service",
        lambda: SimpleNamespace(
            get_webhook=lambda _id: {"id": "wh-1", "workflow_id": "wf-1"},
            verify_signature=lambda *_a, **_k: (_ for _ in ()).throw(
                AssertionError("verification ran for an unsigned request")
            ),
            handle_webhook=handle,
        ),
    )

    with pytest.raises(HTTPException) as exc_info:
        await webhooks_api.receive_webhook(
            "wh-1",
            _Request(b'{"ref": "refs/heads/main"}'),
            x_github_event="push",
            x_hub_signature_256=None,
        )

    assert exc_info.value.status_code == 401
    handle.assert_not_awaited()


@pytest.mark.anyio
async def test_invalid_webhook_signature_is_rejected_without_executing(monkeypatch):
    from api import webhooks as webhooks_api

    handle = AsyncMock()
    monkeypatch.setattr(
        webhooks_api,
        "get_webhook_service",
        lambda: SimpleNamespace(
            get_webhook=lambda _id: {"id": "wh-1", "workflow_id": "wf-1"},
            verify_signature=lambda *_a, **_k: False,
            handle_webhook=handle,
        ),
    )

    with pytest.raises(HTTPException) as exc_info:
        await webhooks_api.receive_webhook(
            "wh-1",
            _Request(b'{"ref": "refs/heads/main"}'),
            x_github_event="push",
            x_hub_signature_256="sha256=deadbeef",
        )

    assert exc_info.value.status_code == 401
    handle.assert_not_awaited()


@pytest.mark.anyio
async def test_correctly_signed_webhook_is_executed():
    """Guard against "fixed by rejecting everything"."""
    import hashlib
    import hmac

    from api import webhooks as webhooks_api
    from services.webhook_service import WebhookService

    service = WebhookService()
    webhook = service.create_webhook("wf-1")
    body = b'{"ref": "refs/heads/main"}'
    signature = "sha256=" + hmac.new(webhook["secret"].encode(), body, hashlib.sha256).hexdigest()

    assert service.verify_signature(webhook["id"], body, signature) is True
    # A non-ASCII header must fail verification rather than raise.
    assert service.verify_signature(webhook["id"], body, "sha256=é") is False

    triggered: list[tuple] = []

    async def handle(webhook_id, event_type, payload):
        triggered.append((webhook_id, event_type, payload))
        return {"status": "triggered", "run_id": "r-1"}

    service.handle_webhook = handle  # type: ignore[method-assign]
    original = webhooks_api.get_webhook_service
    webhooks_api.get_webhook_service = lambda: service  # type: ignore[assignment]
    try:
        result = await webhooks_api.receive_webhook(
            webhook["id"],
            _Request(body),
            x_github_event="push",
            x_hub_signature_256=signature,
        )
    finally:
        webhooks_api.get_webhook_service = original  # type: ignore[assignment]

    assert result["status"] == "triggered"
    assert triggered and triggered[0][1] == "push"


@pytest.mark.anyio
async def test_webhook_delete_is_scoped_to_its_workflow(monkeypatch):
    """A webhook owned by another workflow must not be deletable via this path."""
    from api import webhooks as webhooks_api

    async def allow(*_args, **_kwargs):
        return {"id": "wf-1", "project_id": "p1"}

    deleted: list[str] = []
    monkeypatch.setattr(webhooks_api, "authorize_workflow", allow)
    monkeypatch.setattr(
        webhooks_api,
        "get_webhook_service",
        lambda: SimpleNamespace(
            get_webhook=lambda _id: {"id": "wh-2", "workflow_id": "wf-OTHER"},
            delete_webhook=lambda wid: deleted.append(wid) or True,
        ),
    )

    with pytest.raises(HTTPException) as exc_info:
        await webhooks_api.delete_webhook("wf-1", "wh-2", db=_stub_db(), current_user=MEMBER)

    assert exc_info.value.status_code == 404
    assert deleted == []


@pytest.mark.anyio
async def test_webhook_management_requires_workflow_authorization(monkeypatch):
    from api import webhooks as webhooks_api

    async def deny(*_args, **_kwargs):
        raise HTTPException(status_code=403, detail="No access to this project")

    monkeypatch.setattr(webhooks_api, "authorize_workflow", deny)
    monkeypatch.setattr(
        webhooks_api,
        "get_webhook_service",
        lambda: SimpleNamespace(
            create_webhook=lambda *_a: (_ for _ in ()).throw(
                AssertionError("webhook created despite denial")
            ),
            get_webhooks_for_workflow=lambda *_a: (_ for _ in ()).throw(
                AssertionError("webhooks listed despite denial")
            ),
        ),
    )

    for coro in (
        webhooks_api.create_webhook("wf-1", db=_stub_db(), current_user=MEMBER),
        webhooks_api.list_webhooks("wf-1", db=_stub_db(), current_user=MEMBER),
    ):
        with pytest.raises(HTTPException) as exc_info:
            await coro
        assert exc_info.value.status_code == 403
