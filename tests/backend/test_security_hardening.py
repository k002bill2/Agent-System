"""Regression tests for high-risk API authentication and permission auditing."""

from pathlib import Path
from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest
from fastapi import HTTPException, WebSocketException
from httpx import ASGITransport, AsyncClient

from models.permissions import AgentPermission
from models.project import Project
from services.audit_service import AuditAction

PROTECTED_ROUTE_PREFIXES = (
    "/api/audit",
    "/api/project-configs",
    "/api/sessions/{session_id}/permissions",
    "/api/terminal",
)

SENSITIVE_DISCOVERY_ROUTES = (
    "/api/projects",
    "/api/claude-sessions/projects",
    "/api/agent-sessions",
    "/api/playground/sessions",
)

HIGH_RISK_ROUTE_PATHS = (
    "/api/sessions",
    "/api/sessions/{session_id}",
    "/api/sessions/{session_id}/tasks",
    "/api/warp/open",
    "/api/warp/cleanup",
    "/api/sessions/{session_id}/approve/{approval_id}",
    "/api/sessions/{session_id}/deny/{approval_id}",
    "/api/projects",
    "/api/projects/reorder",
    "/api/projects/link",
    "/api/projects/create",
    "/api/projects/{project_id}",
    "/api/projects/{project_id}/deletion-preview",
    "/api/claude-sessions",
    "/api/claude-sessions/processes",
    "/api/claude-sessions/processes/kill",
    "/api/agent-sessions",
    "/api/agent-sessions/{session_id}",
    "/api/agent-sessions/{session_id}/transcript",
    "/api/playground/sessions/{session_id}",
    "/api/playground/sessions/{session_id}/execute",
    "/api/audit",
    "/api/audit/export",
    "/api/project-registry",
    "/api/project-registry/all",
    "/api/project-registry/{project_id}",
    "/api/project-registry/{project_id}/toggle-active",
    "/api/project-registry/{project_id}/restore",
    "/api/project-registry/{project_id}/permanent",
)

PROJECT_REGISTRY_REQUESTS = (
    ("GET", "/api/project-registry", None),
    ("GET", "/api/project-registry/project-id", None),
    ("PUT", "/api/project-registry/project-id", {}),
    ("PATCH", "/api/project-registry/project-id/toggle-active", {}),
    ("DELETE", "/api/project-registry/project-id", None),
    ("POST", "/api/project-registry/project-id/restore", None),
)


def test_high_risk_routes_advertise_bearer_security(app):
    """Sensitive route families must require the HTTP bearer dependency."""
    paths = app.openapi()["paths"]
    checked = []
    for path, operations in paths.items():
        if not path.startswith(PROTECTED_ROUTE_PREFIXES):
            continue
        for method, operation in operations.items():
            if method not in {"get", "post", "put", "patch", "delete"}:
                continue
            checked.append(f"{method.upper()} {path}")
            assert operation.get("security"), f"missing auth on {method.upper()} {path}"

    assert checked, "expected at least one high-risk route"


def test_expanded_high_risk_routes_advertise_bearer_security(app):
    """Execution, mutation, session, playground, and audit routes stay protected."""
    paths = app.openapi()["paths"]
    for path in HIGH_RISK_ROUTE_PATHS:
        assert path in paths, f"missing route: {path}"
        operations = paths[path]
        assert any(
            operation.get("security")
            for method, operation in operations.items()
            if method in {"get", "post", "put", "patch", "delete"}
        ), f"missing auth on {path}"


# ``/api/agent-sessions`` 는 ``/api/claude-sessions`` 의 provider-neutral alias 다
# (#320). 라우터 레벨 ``dependencies`` 는 핸들러 함수가 아니라 라우터에 붙으므로,
# 원본 핸들러를 import 해 다시 등록하는 alias 는 인증을 스스로 선언하지 않으면
# 정책만 벗겨진 채 노출된다. 위 경로 목록은 allowlist 라 새 엔드포인트를 구조적으로
# 놓치므로, alias 전체를 prefix 로 전수 검사한다.
ALIAS_ROUTE_PREFIX = "/api/agent-sessions"


def test_agent_sessions_alias_routes_all_require_auth(app):
    """alias 라우터의 *모든* operation 이 인증을 요구해야 한다."""
    paths = app.openapi()["paths"]
    checked = []
    for path, operations in paths.items():
        if not path.startswith(ALIAS_ROUTE_PREFIX):
            continue
        for method, operation in operations.items():
            if method not in {"get", "post", "put", "patch", "delete"}:
                continue
            checked.append(f"{method.upper()} {path}")
            assert operation.get("security"), f"missing auth on {method.upper()} {path}"

    assert checked, f"expected at least one route under {ALIAS_ROUTE_PREFIX}"


def test_agent_sessions_alias_matches_origin_auth_policy(app):
    """alias 는 원본 ``/api/claude-sessions`` 와 동일한 보안 스킴을 광고해야 한다."""

    def _schemes(prefix: str) -> set[str]:
        found: set[str] = set()
        for path, operations in app.openapi()["paths"].items():
            if not path.startswith(prefix):
                continue
            for method, operation in operations.items():
                if method not in {"get", "post", "put", "patch", "delete"}:
                    continue
                for requirement in operation.get("security") or []:
                    found.update(requirement)
        return found

    origin = _schemes("/api/claude-sessions")
    alias = _schemes(ALIAS_ROUTE_PREFIX)

    assert origin, "origin routes must advertise a security scheme"
    assert alias == origin, f"alias auth {alias} diverged from origin {origin}"


def _dependency_calls(dependant) -> set:
    """dependant 트리를 재귀로 훑어 의존성 *함수 객체* 를 모은다.

    라우터 레벨 의존성은 최상위에 오지만 핸들러 레벨 의존성은 중첩될 수 있으므로
    재귀로 수집한다.
    """
    found = set()
    for sub in dependant.dependencies:
        if sub.call is not None:
            found.add(sub.call)
        found |= _dependency_calls(sub)
    return found


def test_agent_sessions_alias_enforces_admin_or_manager_role():
    """alias 는 *스킴* 이 아니라 실제 admin/manager 의존성을 걸어야 한다.

    OpenAPI ``security`` 검사만으로는 부족하다 — 의존성을 ``get_current_user`` 로
    바꿔도 동일한 HTTPBearer 스킴을 광고하므로, 위 두 테스트는 통과하면서 일반
    user 에게 열린다. 라우터의 의존성 트리에서 함수 객체를 직접 확인해 그 교체를
    잡는다. OpenAPI 문서가 아니라 라우트를 보므로 ``openapi_extra`` 로 security 를
    수동 주입하는 경우와 WebSocket 라우트도 함께 커버된다.

    한계: 검사 대상은 이 alias 라우터다. 또 다른 모듈이 같은 핸들러를 제3의
    prefix 로 재노출하면 여기서는 잡히지 않는다.
    """
    from api.agent_sessions import router as alias_router
    from api.deps import get_current_admin_or_manager_user

    routes = [route for route in alias_router.routes if hasattr(route, "dependant")]
    assert routes, "alias router exposes no routes"

    for route in routes:
        methods = ",".join(sorted(getattr(route, "methods", None) or {"WS"}))
        assert get_current_admin_or_manager_user in _dependency_calls(route.dependant), (
            f"{methods} {route.path} lacks the admin/manager dependency"
        )


@pytest.mark.asyncio
async def test_agent_sessions_alias_rejects_regular_user(app):
    """인증됐지만 권한 없는 일반 user 는 alias 로도 세션에 닿지 못한다."""
    from api.deps import get_current_user

    app.dependency_overrides[get_current_user] = lambda: SimpleNamespace(
        id="regular-user", role="user", is_admin=False, is_active=True
    )
    try:
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as ac:
            response = await ac.get(ALIAS_ROUTE_PREFIX)
    finally:
        app.dependency_overrides.pop(get_current_user, None)

    assert response.status_code == 403


@pytest.mark.asyncio
async def test_permission_update_requires_authentication(client, session_id):
    """Permission mutation must not be callable without a bearer token."""
    response = await client.put(
        f"/api/sessions/{session_id}/permissions",
        json={"enabled_permissions": [AgentPermission.READ_FILE.value]},
    )

    assert response.status_code == 401


@pytest.mark.asyncio
@pytest.mark.parametrize("path", SENSITIVE_DISCOVERY_ROUTES)
async def test_sensitive_discovery_routes_require_authentication(client, path):
    """Filesystem and session metadata must not be anonymously enumerable."""
    response = await client.get(path)

    assert response.status_code == 401


@pytest.mark.asyncio
@pytest.mark.parametrize("method,path,payload", PROJECT_REGISTRY_REQUESTS)
async def test_project_registry_routes_require_authentication(client, method, path, payload):
    """Project registry metadata and mutations must not be anonymous."""
    response = await client.request(method, path, json=payload)
    assert response.status_code == 401


@pytest.mark.asyncio
async def test_production_api_docs_are_disabled(monkeypatch):
    """Production app instances must not publish API documentation routes."""
    from api.app import create_app

    monkeypatch.setenv("ENABLE_API_DOCS", "false")
    production_app = create_app(debug=False)
    async with AsyncClient(
        transport=ASGITransport(app=production_app), base_url="http://test"
    ) as production_client:
        for path in ("/docs", "/redoc", "/openapi.json"):
            response = await production_client.get(path)
            assert response.status_code == 404, path


@pytest.mark.asyncio
async def test_permission_update_writes_audit_event(client, app, session_id):
    """Authenticated permission changes must emit a permission audit event."""
    from api.deps import get_current_user
    from services.audit_service import _audit_logs

    app.dependency_overrides[get_current_user] = lambda: SimpleNamespace(
        id="test-user", role="admin", is_admin=True, is_active=True
    )
    try:
        response = await client.put(
            f"/api/sessions/{session_id}/permissions",
            json={"enabled_permissions": [AgentPermission.READ_FILE.value]},
        )
    finally:
        app.dependency_overrides.pop(get_current_user, None)

    assert response.status_code == 200
    changes = [entry for entry in _audit_logs if entry.action == AuditAction.PERMISSION_CHANGED]
    assert changes
    assert changes[-1].user_id == "test-user"
    assert changes[-1].session_id == session_id


@pytest.mark.asyncio
async def test_terminal_execution_requires_manager_or_admin(client, app):
    """A regular authenticated user must not be able to execute terminals."""
    from api.deps import get_current_user

    app.dependency_overrides[get_current_user] = lambda: SimpleNamespace(
        id="regular-user", role="user", is_admin=False, is_active=True
    )
    try:
        response = await client.post(
            "/api/terminal/execute",
            json={
                "terminal": "orca",
                "project_id": "agent-orchestration",
                "command": "echo blocked",
            },
        )
    finally:
        app.dependency_overrides.pop(get_current_user, None)

    assert response.status_code == 403


@pytest.mark.asyncio
async def test_terminal_execution_writes_audit_event(client, app, monkeypatch):
    """Terminal execution must emit a metadata-only audit record."""
    from api.deps import get_current_user
    from services.audit_service import AuditAction, _audit_logs

    class AvailableAdapter:
        async def is_available(self):
            return True

        async def execute(self, **kwargs):
            return {"success": True, "terminal": "orca", "message": "started"}

    class Service:
        def get_adapter(self, _terminal_type):
            return AvailableAdapter()

    app.dependency_overrides[get_current_user] = lambda: SimpleNamespace(
        id="operator-user", role="admin", is_admin=True, is_active=True
    )
    monkeypatch.setattr("api.terminal.get_project", lambda _project_id: SimpleNamespace(path="/tmp"))
    monkeypatch.setattr("api.terminal.get_terminal_service", lambda: Service())
    try:
        response = await client.post(
            "/api/terminal/execute",
            json={
                "terminal": "orca",
                "project_id": "agent-orchestration",
                "command": "echo secret-not-recorded",
            },
        )
    finally:
        app.dependency_overrides.pop(get_current_user, None)

    assert response.status_code == 200
    events = [entry for entry in _audit_logs if entry.action == AuditAction.TOOL_EXECUTED]
    assert events
    assert events[-1].user_id == "operator-user"
    assert events[-1].metadata["command_length"] == len("echo secret-not-recorded")
    assert "secret-not-recorded" not in str(events[-1].metadata)


@pytest.mark.asyncio
async def test_project_config_lookup_fails_closed_on_database_error(monkeypatch):
    """Project config discovery must not expose filesystem data on DB failure."""
    from api.project_configs.core import list_projects

    monkeypatch.setenv("USE_DATABASE", "true")
    async def broken_lookup(*_args, **_kwargs):
        raise RuntimeError("database unavailable")

    monkeypatch.setattr("api.project_configs.core._get_db_filtered_projects", broken_lookup)
    with pytest.raises(HTTPException) as exc_info:
        await list_projects(current_user=SimpleNamespace(id="user-id"))

    assert exc_info.value.status_code == 503


@pytest.mark.asyncio
async def test_empty_project_registry_fails_closed(monkeypatch):
    """An enabled but empty project registry must not disable access filtering."""
    from api.routes import _get_accessible_paths_for_user

    class EmptyResult:
        def all(self):
            return []

    class EmptyDatabase:
        async def execute(self, *_args, **_kwargs):
            return EmptyResult()

    monkeypatch.setenv("USE_DATABASE", "true")
    with pytest.raises(HTTPException) as exc_info:
        await _get_accessible_paths_for_user(EmptyDatabase(), "user-id", admin_org_ids=[])

    assert exc_info.value.status_code == 503


@pytest.mark.asyncio
async def test_session_permission_authorization_requires_owner_or_privileged_role():
    """Authenticated users cannot change another user's session permissions."""
    from api.permission_toggles import _authorize_session_access

    state = {"user_id": "session-owner"}
    regular_user = SimpleNamespace(id="other-user", role="user", is_admin=False)
    owner = SimpleNamespace(id="session-owner", role="user", is_admin=False)
    manager = SimpleNamespace(id="manager", role="manager", is_admin=False)

    with pytest.raises(HTTPException) as exc_info:
        _authorize_session_access(state, regular_user)
    assert exc_info.value.status_code == 403
    _authorize_session_access(state, owner)
    _authorize_session_access(state, manager)


@pytest.mark.asyncio
async def test_terminal_audit_redacts_adapter_error(monkeypatch):
    """Adapter-provided error text must not be persisted in audit records."""
    from api.terminal import TerminalExecuteRequest, _log_terminal_execution
    from services.audit_service import _audit_logs

    request = TerminalExecuteRequest(
        terminal="orca", project_id="project", command="echo secret"
    )
    before = len(_audit_logs)
    _log_terminal_execution(
        request,
        SimpleNamespace(id="operator"),
        status="failed",
        error_message="adapter leaked secret-token and /private/path",
    )

    entry = _audit_logs[before]
    assert entry.error_message == "adapter_error"
    assert "secret-token" not in str(entry.error_message)


@pytest.mark.asyncio
async def test_terminal_resolution_failure_is_audited(client, app, monkeypatch):
    """Service/adapter resolution failures emit bounded audit metadata."""
    from api.deps import get_current_user
    from services.audit_service import AuditAction, _audit_logs

    app.dependency_overrides[get_current_user] = lambda: SimpleNamespace(
        id="operator", role="admin", is_admin=True, is_active=True
    )
    monkeypatch.setattr("api.terminal.get_project", lambda _project_id: SimpleNamespace(path="/tmp"))
    monkeypatch.setattr(
        "api.terminal.get_terminal_service",
        lambda: (_ for _ in ()).throw(RuntimeError("secret adapter details")),
    )
    before = len(_audit_logs)
    try:
        transport = ASGITransport(app=app, raise_app_exceptions=False)
        async with AsyncClient(transport=transport, base_url="http://test") as failing_client:
            response = await failing_client.post(
                "/api/terminal/execute",
                json={"terminal": "orca", "project_id": "project", "command": "echo secret"},
            )
    finally:
        app.dependency_overrides.pop(get_current_user, None)

    assert response.status_code == 500
    events = [entry for entry in _audit_logs[before:] if entry.action == AuditAction.TOOL_EXECUTED]
    assert events
    assert events[-1].error_message == "adapter_error"


@pytest.mark.asyncio
async def test_terminal_malformed_result_is_audited(client, app, monkeypatch):
    """Malformed adapter results emit an execution error audit event."""
    from api.deps import get_current_user
    from services.audit_service import AuditAction, _audit_logs

    class Adapter:
        async def is_available(self):
            return True

        async def execute(self, **_kwargs):
            return None

    class Service:
        def get_adapter(self, _terminal_type):
            return Adapter()

    app.dependency_overrides[get_current_user] = lambda: SimpleNamespace(
        id="operator", role="admin", is_admin=True, is_active=True
    )
    monkeypatch.setattr("api.terminal.get_project", lambda _project_id: SimpleNamespace(path="/tmp"))
    monkeypatch.setattr("api.terminal.get_terminal_service", lambda: Service())
    before = len(_audit_logs)
    try:
        transport = ASGITransport(app=app, raise_app_exceptions=False)
        async with AsyncClient(transport=transport, base_url="http://test") as failing_client:
            response = await failing_client.post(
                "/api/terminal/execute",
                json={"terminal": "orca", "project_id": "project", "command": "echo secret"},
            )
    finally:
        app.dependency_overrides.pop(get_current_user, None)

    assert response.status_code == 500
    events = [entry for entry in _audit_logs[before:] if entry.action == AuditAction.TOOL_EXECUTED]
    assert events
    assert events[-1].error_message == "execution_error"


@pytest.mark.asyncio
async def test_claude_session_listing_requires_privileged_role(client, app):
    """Regular users cannot enumerate machine-wide Claude sessions."""
    from api.deps import get_current_user

    app.dependency_overrides[get_current_user] = lambda: SimpleNamespace(
        id="regular", role="user", is_admin=False, is_active=True
    )
    try:
        response = await client.get("/api/claude-sessions")
    finally:
        app.dependency_overrides.pop(get_current_user, None)

    assert response.status_code == 403


@pytest.mark.asyncio
async def test_project_config_child_global_routes_require_privileged_role(client, app):
    """Global project-config asset enumeration is not for regular users."""
    from api.deps import get_current_user

    app.dependency_overrides[get_current_user] = lambda: SimpleNamespace(
        id="regular", role="user", is_admin=False, is_active=True
    )
    try:
        response = await client.get("/api/project-configs/skills/all")
    finally:
        app.dependency_overrides.pop(get_current_user, None)

    assert response.status_code == 403


@pytest.mark.asyncio
async def test_project_config_query_project_id_cannot_bypass_global_guard(client, app, monkeypatch):
    """A query-string project_id must not turn a global route into project scope."""
    from api.deps import get_current_user

    monkeypatch.setenv("USE_DATABASE", "false")
    app.dependency_overrides[get_current_user] = lambda: SimpleNamespace(
        id="regular", role="user", is_admin=False, is_active=True
    )
    try:
        response = await client.get(
            "/api/project-configs/paths?project_id=authorized-project"
        )
    finally:
        app.dependency_overrides.pop(get_current_user, None)

    assert response.status_code == 403


def test_project_templates_route_requires_authentication(app):
    """Project template metadata is not an anonymous project API."""
    operation = app.openapi()["paths"]["/api/projects/templates"]["get"]
    assert operation.get("security")


@pytest.mark.asyncio
async def test_db_project_config_listing_does_not_initialize_global_monitor(monkeypatch):
    """DB-mode listing must not construct the auto-discovering singleton."""
    from api.project_configs.core import list_projects

    monkeypatch.setenv("USE_DATABASE", "true")
    monkeypatch.setattr(
        "api.project_configs.core.get_project_config_monitor",
        lambda: (_ for _ in ()).throw(AssertionError("global monitor must not initialize")),
    )

    async def fake_filtered(monitor, current_user):
        assert monitor is None
        return []

    monkeypatch.setattr("api.project_configs.core._get_db_filtered_projects", fake_filtered)
    result = await list_projects(SimpleNamespace(id="admin", role="admin", is_admin=True))
    assert result.total_count == 0


@pytest.mark.asyncio
async def test_db_project_context_authorizes_before_resolving(monkeypatch):
    """DB-mode context resolves via the DB registry - after the ACL check.

    PR #318 put a blanket 503 here because the handler read only the in-memory
    registry, which is keyed by the projects/ symlink name and so misses every
    ProjectModel UUID the dashboard sends. The resolver replaced the 503; this
    asserts that lifting it did not also lift the authorization.
    """
    from api.context import get_project_context

    monkeypatch.setenv("USE_DATABASE", "true")

    async def deny_project_role(*_args, **_kwargs):
        raise HTTPException(status_code=403, detail="No access to this project")

    monkeypatch.setattr("api.context.require_project_role", deny_project_role)
    monkeypatch.setattr(
        "api.context.get_project_or_404",
        _unreachable_resolver("resolution ran before authorization"),
    )
    with pytest.raises(HTTPException) as exc_info:
        await get_project_context(
            "registered",
            SimpleNamespace(),
            SimpleNamespace(id="member", role="user", is_admin=False),
            SimpleNamespace(execute=lambda *_args, **_kwargs: None),
        )
    assert exc_info.value.status_code == 403


def _unreachable_resolver(message: str):
    """An async ``get_project_or_404`` stand-in that must never be awaited."""

    async def _resolver(*_args, **_kwargs):
        raise AssertionError(message)

    return _resolver


@pytest.mark.asyncio
async def test_db_project_context_serves_a_registered_project(monkeypatch):
    """A project the caller may reach comes back instead of a 503."""
    from api.context import get_project_context

    monkeypatch.setenv("USE_DATABASE", "true")

    async def allow_project_role(*_args, **_kwargs):
        return "viewer"

    resolved = Project(id="db-uuid", name="DB Project", path="/tmp/db-project")

    async def resolve(project_id, db):
        assert project_id == "db-uuid"
        return resolved

    monkeypatch.setattr("api.context.require_project_role", allow_project_role)
    monkeypatch.setattr("api.context.get_project_or_404", resolve)

    engine = SimpleNamespace(
        session_service=SimpleNamespace(list_sessions=AsyncMock(return_value=[]))
    )
    response = await get_project_context(
        "db-uuid",
        engine,
        SimpleNamespace(id="admin", role="admin", is_admin=True),
        SimpleNamespace(execute=lambda *_args, **_kwargs: None),
    )

    assert response.project_id == "db-uuid"
    assert response.project_name == "DB Project"


@pytest.mark.asyncio
async def test_project_config_copy_target_requires_access(monkeypatch):
    """Copy destinations must be registered and independently authorized."""
    from api.project_configs.access import require_project_config_target_access

    target = SimpleNamespace(id="target", path="/target", organization_id="org-other")

    class Result:
        def __init__(self, value):
            self.value = value

        def scalars(self):
            return SimpleNamespace(all=lambda: self.value)

        def scalar_one_or_none(self):
            return self.value

    class Database:
        def __init__(self):
            self.calls = 0

        async def execute(self, *_args, **_kwargs):
            self.calls += 1
            return Result([target] if self.calls == 1 else None)

    async def no_admin_orgs(_user):
        return []

    monkeypatch.setenv("USE_DATABASE", "true")
    monkeypatch.setattr("api.projects._get_admin_org_ids", no_admin_orgs)
    with pytest.raises(HTTPException) as exc_info:
        await require_project_config_target_access(
            "target",
            SimpleNamespace(id="user", role="user", is_admin=False),
            Database(),
        )
    assert exc_info.value.status_code == 403


@pytest.mark.asyncio
async def test_database_dependency_failure_is_503(monkeypatch):
    """Database dependency construction failures are controlled responses."""
    from api.deps import get_db_session

    def broken_factory():
        raise RuntimeError("database unavailable")

    monkeypatch.setattr("api.deps.async_session_factory", broken_factory)
    with pytest.raises(HTTPException) as exc_info:
        await get_db_session().__anext__()
    assert exc_info.value.status_code == 503


@pytest.mark.asyncio
async def test_database_dependency_preserves_endpoint_exception(monkeypatch):
    """Dependency cleanup must not relabel handler errors as database failures."""
    from api.deps import get_db_session

    class Session:
        async def commit(self):
            return None

        async def rollback(self):
            return None

    class SessionContext:
        async def __aenter__(self):
            return Session()

        async def __aexit__(self, *_args):
            return None

    monkeypatch.setattr("api.deps.async_session_factory", lambda: SessionContext())
    generator = get_db_session()
    await generator.__anext__()
    with pytest.raises(ValueError, match="handler failure"):
        await generator.athrow(ValueError("handler failure"))


@pytest.mark.asyncio
async def test_database_session_http_exception_is_generic_503(monkeypatch):
    """Session factory HTTP errors must not leak arbitrary status or detail."""
    from api.deps import get_db_session

    class SessionContext:
        async def __aenter__(self):
            raise HTTPException(status_code=418, detail="database sentinel")

    monkeypatch.setattr("api.deps.async_session_factory", lambda: SessionContext())
    with pytest.raises(HTTPException) as exc_info:
        await get_db_session().__anext__()

    assert exc_info.value.status_code == 503
    assert exc_info.value.detail == "Database service is temporarily unavailable"


@pytest.mark.asyncio
async def test_db_project_deletion_routes_reject_unresolvable_ids(monkeypatch):
    """An id the authoritative registry cannot resolve never reaches cleanup.

    Deletion is the one route where a wrong resolution is destructive, so the
    404 has to land before the cleanup service is constructed, not inside it.
    """
    from api.routes import delete_project, get_deletion_preview

    monkeypatch.setenv("USE_DATABASE", "true")
    monkeypatch.setattr("api.routes.require_project_role", AsyncMock())

    async def unresolvable(_project_id, _db):
        return None

    monkeypatch.setattr("api.deps.resolve_project", unresolvable)
    cleanup_service = AsyncMock()
    monkeypatch.setattr(
        "services.project_cleanup_service.get_cleanup_service", lambda: cleanup_service
    )
    user = SimpleNamespace(id="owner", role="admin", is_admin=True, is_active=True)

    for handler in (get_deletion_preview, delete_project):
        with pytest.raises(HTTPException) as exc_info:
            await handler("db-project", current_user=user, db=object())
        assert exc_info.value.status_code == 404

    cleanup_service.get_deletion_preview.assert_not_awaited()
    cleanup_service.cascade_delete.assert_not_awaited()


@pytest.mark.asyncio
async def test_db_project_deletion_requires_owner_before_resolving(monkeypatch):
    """Deletion keeps its owner gate - the resolver must not soften it."""
    from api.routes import delete_project

    monkeypatch.setenv("USE_DATABASE", "true")
    seen = {}

    async def record_role(project_id, current_user, db, min_role="viewer"):
        seen["min_role"] = min_role
        raise HTTPException(status_code=403, detail="Requires at least 'owner' role")

    monkeypatch.setattr("api.routes.require_project_role", record_role)
    monkeypatch.setattr(
        "api.deps.resolve_project", _unreachable_resolver("resolved before authorization")
    )

    with pytest.raises(HTTPException) as exc_info:
        await delete_project(
            "db-project",
            current_user=SimpleNamespace(id="viewer", role="user", is_admin=False, is_active=True),
            db=object(),
        )

    assert exc_info.value.status_code == 403
    assert seen["min_role"] == "owner"


@pytest.mark.asyncio
async def test_db_project_deletion_removes_the_db_registry_row(monkeypatch):
    """Cascade delete must drop the DB registry rows, not just the in-memory one.

    Clearing only PROJECTS_REGISTRY leaves the project listed by
    GET /api/projects with its sessions, index and symlink already gone.
    """
    from services.project_cleanup_service import ProjectCleanupService

    monkeypatch.setenv("USE_DATABASE", "true")
    service = ProjectCleanupService()

    removed: list[str] = []

    async def record(project_id):
        removed.append(project_id)
        return True

    monkeypatch.setattr(service, "_delete_db_project_registry", record)
    monkeypatch.setattr(service, "_delete_db_records", AsyncMock(return_value=0))

    summary = await service.cascade_delete(
        Project(id="db-uuid", name="DB Project", path="/tmp/db-project")
    )

    assert summary.registry_unregistered is True
    assert removed == ["db-uuid"]


@pytest.mark.asyncio
async def test_project_role_acl_failure_is_503(monkeypatch):
    """DB ACL query failures must not become generic 500 responses."""
    from api.deps import require_project_role
    from services.project_access_service import ProjectAccessService

    monkeypatch.setenv("USE_DATABASE", "false")

    async def broken_acl(*_args, **_kwargs):
        raise RuntimeError("acl sentinel")

    monkeypatch.setattr(ProjectAccessService, "has_any_access_control", broken_acl)
    user = SimpleNamespace(id="user", role="user", is_admin=False, is_active=True)
    with pytest.raises(HTTPException) as exc_info:
        await require_project_role("project", user, object())

    assert exc_info.value.status_code == 503


@pytest.mark.asyncio
async def test_debug_errors_use_generic_json_without_tracebacks(monkeypatch):
    """Debug docs mode must not enable plaintext traceback responses."""
    from api.app import create_app

    monkeypatch.setenv("ENABLE_API_DOCS", "false")
    debug_app = create_app(debug=True)

    @debug_app.get("/test-debug-error")
    async def _raise_debug_error():
        raise RuntimeError("debug sentinel")

    async with AsyncClient(
        transport=ASGITransport(app=debug_app, raise_app_exceptions=False),
        base_url="http://test",
    ) as client:
        response = await client.get("/test-debug-error")

    assert response.status_code == 500
    assert "debug sentinel" not in response.text
    assert response.json()["detail"] == "Internal server error"


@pytest.mark.asyncio
async def test_debug_environment_enables_standard_docs(monkeypatch):
    """DEBUG=true enables docs even when create_app receives debug=False."""
    from api.app import create_app

    monkeypatch.setenv("DEBUG", "true")
    monkeypatch.setenv("ENABLE_API_DOCS", "false")
    debug_app = create_app(debug=False)
    async with AsyncClient(transport=ASGITransport(app=debug_app), base_url="http://test") as client:
        assert (await client.get("/docs")).status_code == 200


@pytest.mark.asyncio
async def test_railway_docs_follow_environment_policy(monkeypatch):
    """The Docker-deployed Railway entrypoint must apply the same docs policy."""
    import importlib

    monkeypatch.setenv("DEBUG", "false")
    monkeypatch.setenv("ENABLE_API_DOCS", "false")
    import api.app_railway as app_railway

    app_railway = importlib.reload(app_railway)
    async with AsyncClient(
        transport=ASGITransport(app=app_railway.app), base_url="http://test"
    ) as client:
        for path in ("/docs", "/redoc", "/openapi.json"):
            assert (await client.get(path)).status_code == 404


@pytest.mark.asyncio
async def test_railway_debug_errors_use_generic_json_without_tracebacks(monkeypatch):
    """Railway DEBUG=true must not expose plaintext traceback responses."""
    import importlib

    monkeypatch.setenv("DEBUG", "true")
    monkeypatch.setenv("ENABLE_API_DOCS", "false")
    import api.app_railway as app_railway

    app_railway = importlib.reload(app_railway)

    @app_railway.app.get("/test-railway-debug-error")
    async def _raise_debug_error():
        raise RuntimeError("railway debug sentinel")

    async with AsyncClient(
        transport=ASGITransport(app=app_railway.app, raise_app_exceptions=False),
        base_url="http://test",
    ) as client:
        response = await client.get("/test-railway-debug-error")

    assert response.status_code == 500
    assert "railway debug sentinel" not in response.text
    assert response.json()["detail"] == "Internal server error"


def test_setup_and_compose_do_not_print_secret_fragments():
    """Static bootstrap policy keeps secrets out of setup output."""
    setup = Path(__file__).parents[2] / "setup.sh"
    compose = Path(__file__).parents[2] / "docker-compose.dev.yml"
    setup_text = setup.read_text()
    compose_text = compose.read_text()
    assert "NEW_SECRET: -4" not in setup_text
    assert "NEW_PG_PW: -4" not in setup_text
    assert "postgresql+asyncpg://${POSTGRES_USER:-aos}:${POSTGRES_PASSWORD:?set POSTGRES_PASSWORD}@postgres:5432/${POSTGRES_DB:-aos}" in compose_text


@pytest.mark.asyncio
async def test_project_access_lookup_fails_closed_on_database_error(monkeypatch):
    """Project access lookup must not turn a DB error into full disclosure."""
    from api.routes import _get_accessible_paths_for_user

    class BrokenDatabase:
        async def execute(self, *_args, **_kwargs):
            raise RuntimeError("database unavailable")

    monkeypatch.setenv("USE_DATABASE", "true")
    with pytest.raises(HTTPException) as exc_info:
        await _get_accessible_paths_for_user(BrokenDatabase(), "user-id", admin_org_ids=[])

    assert exc_info.value.status_code == 503


@pytest.mark.asyncio
async def test_project_config_empty_registry_fails_closed(monkeypatch):
    """An empty DB project registry must not become an empty successful response."""
    from api.project_configs.core import _get_db_filtered_projects

    class EmptyScalars:
        def all(self):
            return []

    class EmptyResult:
        def scalars(self):
            return EmptyScalars()

    class EmptySession:
        async def __aenter__(self):
            return self

        async def __aexit__(self, *_args):
            return None

        async def execute(self, *_args, **_kwargs):
            return EmptyResult()

    monkeypatch.setattr("db.database.async_session_factory", lambda: EmptySession())
    with pytest.raises(HTTPException) as exc_info:
        await _get_db_filtered_projects(
            object(), SimpleNamespace(id="admin", role="admin", is_admin=True)
        )

    assert exc_info.value.status_code == 503


@pytest.mark.asyncio
async def test_project_config_db_mode_scans_only_registered_paths(monkeypatch):
    """DB mode must not invoke monitor-wide filesystem discovery."""
    from api.project_configs.core import _get_db_filtered_projects

    project = SimpleNamespace(
        id="registered",
        name="Registered",
        path="/explicit/registered",
        updated_at=None,
        created_at=None,
    )

    class Result:
        def scalars(self):
            return SimpleNamespace(all=lambda: [project])

    class Session:
        async def __aenter__(self):
            return self

        async def __aexit__(self, *_args):
            return None

        async def execute(self, *_args, **_kwargs):
            return Result()

    class Monitor:
        def discover_projects(self):
            raise AssertionError("DB mode must not enumerate all filesystem projects")

        def add_external_project(self, _path):
            return None

    monkeypatch.setattr("db.database.async_session_factory", lambda: Session())
    result = await _get_db_filtered_projects(
        Monitor(), SimpleNamespace(id="admin", role="admin", is_admin=True)
    )
    assert len(result) == 1
    assert result[0].project_name == "Registered"


@pytest.mark.asyncio
async def test_projects_db_failure_returns_503_without_filesystem_listing(monkeypatch):
    """Initial DB registry failures must be controlled 503 responses."""
    from api.routes import get_projects

    class BrokenDatabase:
        async def execute(self, *_args, **_kwargs):
            raise RuntimeError("database unavailable")

    monkeypatch.setenv("USE_DATABASE", "true")
    monkeypatch.setattr("api.routes.list_projects", lambda: (_ for _ in ()).throw(
        AssertionError("filesystem listing must not run in DB mode")
    ))
    with pytest.raises(HTTPException) as exc_info:
        await get_projects(
            current_user=SimpleNamespace(id="admin", role="admin", is_admin=True),
            db=BrokenDatabase(),
        )

    assert exc_info.value.status_code == 503


@pytest.mark.asyncio
async def test_projects_all_inactive_registry_returns_503(monkeypatch):
    """A DB registry with no active projects is a controlled unavailable state."""
    from api.routes import get_projects

    class Result:
        def scalars(self):
            return SimpleNamespace(all=lambda: [SimpleNamespace(is_active=False)])

    class Database:
        async def execute(self, *_args, **_kwargs):
            return Result()

    monkeypatch.setenv("USE_DATABASE", "true")
    with pytest.raises(HTTPException) as exc_info:
        await get_projects(
            current_user=SimpleNamespace(id="admin", role="admin", is_admin=True),
            db=Database(),
        )

    assert exc_info.value.status_code == 503


@pytest.mark.asyncio
async def test_project_registry_database_failure_returns_503(monkeypatch):
    """Registry CRUD database failures must not escape as generic 500s."""
    from api.projects.registry import list_active_projects

    class BrokenSession:
        async def __aenter__(self):
            return self

        async def __aexit__(self, *_args):
            return None

        async def execute(self, *_args, **_kwargs):
            raise RuntimeError("database unavailable")

    monkeypatch.setenv("USE_DATABASE", "true")
    monkeypatch.setattr("db.database.async_session_factory", lambda: BrokenSession())
    with pytest.raises(HTTPException) as exc_info:
        await list_active_projects(
            current_user=SimpleNamespace(id="admin", role="admin", is_admin=True)
        )

    assert exc_info.value.status_code == 503


@pytest.mark.asyncio
async def test_db_project_route_rejects_unregistered_id_before_filesystem_lookup(monkeypatch):
    """Known filesystem IDs cannot bypass the DB project registry."""
    from api.routes import get_project_by_id

    class Result:
        def scalar_one_or_none(self):
            return None

    class Database:
        async def execute(self, *_args, **_kwargs):
            return Result()

    monkeypatch.setenv("USE_DATABASE", "true")
    monkeypatch.setattr("api.routes.get_project", lambda _project_id: (_ for _ in ()).throw(
        AssertionError("legacy filesystem lookup must not run")
    ))
    with pytest.raises(HTTPException) as exc_info:
        await get_project_by_id(
            "filesystem-only",
            current_user=SimpleNamespace(id="user", role="user", is_admin=False),
            db=Database(),
        )

    assert exc_info.value.status_code == 404


@pytest.mark.asyncio
async def test_claude_project_lookup_fails_closed_on_database_error(monkeypatch):
    """Claude project discovery must not fall back to an unfiltered list on DB errors."""
    from api.claude_sessions.discovery import list_projects

    class BrokenSession:
        async def __aenter__(self):
            return self

        async def __aexit__(self, *_args):
            return None

        async def execute(self, *_args, **_kwargs):
            raise RuntimeError("database unavailable")

    monkeypatch.setenv("USE_DATABASE", "true")
    monkeypatch.setattr("db.database.async_session_factory", lambda: BrokenSession())
    with pytest.raises(HTTPException) as exc_info:
        await list_projects(SimpleNamespace(id="user-id", role="user", is_admin=False))

    assert exc_info.value.status_code == 503


@pytest.mark.parametrize(
    ("debug", "enabled", "expected"),
    (
        (False, "false", False),
        (False, "true", True),
        (True, "false", True),
        (True, "true", True),
    ),
)
def test_api_docs_enablement_matrix(monkeypatch, debug, enabled, expected):
    """Docs are enabled only by debug mode or explicit configuration."""
    from api.app import _api_docs_enabled

    monkeypatch.setenv("ENABLE_API_DOCS", enabled)

    assert _api_docs_enabled(debug) is expected


# ── filesystem-mode project-config ACL ──────────────────────────


def _request_stub(method: str, project_id: str | None, path: str) -> SimpleNamespace:
    """Minimal stand-in for the Request fields the guard actually reads."""
    return SimpleNamespace(
        method=method,
        path_params={"project_id": project_id} if project_id else {},
        url=SimpleNamespace(path=path),
    )


def _patch_filesystem_project(monkeypatch, exists: bool = True) -> None:
    monkeypatch.setenv("USE_DATABASE", "false")
    summary = (lambda pid: {"id": pid}) if exists else (lambda pid: None)
    monkeypatch.setattr(
        "services.project_config_monitor.get_project_config_monitor",
        lambda: SimpleNamespace(get_project_summary=summary),
    )


@pytest.mark.asyncio
async def test_filesystem_project_config_consults_project_acl(monkeypatch):
    """Existence alone must not authorize a project-scoped config route.

    This branch used to `return current_user` right after the existence check,
    making it the only project-scoped path that never called
    require_project_role -- so any authenticated user who knew another project's
    ID could reach that project's .claude assets.
    """
    from api.project_configs import access as access_module

    _patch_filesystem_project(monkeypatch)

    seen: dict[str, object] = {}

    async def fake_require(project_id, current_user, db, min_role="viewer"):
        seen["project_id"] = project_id
        seen["min_role"] = min_role
        raise HTTPException(status_code=403, detail="No access to this project")

    monkeypatch.setattr(access_module, "require_project_role", fake_require)

    with pytest.raises(HTTPException) as exc:
        await access_module.require_project_config_access(
            _request_stub("GET", "proj-a", "/api/project-configs/proj-a/skills"),
            SimpleNamespace(id="regular", role="user", is_admin=False, is_active=True),
            db=object(),
        )

    assert exc.value.status_code == 403
    assert seen["project_id"] == "proj-a"


@pytest.mark.asyncio
async def test_filesystem_project_config_mutation_requires_editor(monkeypatch):
    """Reads settle for viewer; writes to .claude assets need editor."""
    from api.project_configs import access as access_module

    _patch_filesystem_project(monkeypatch)

    seen: dict[str, object] = {}

    async def fake_require(project_id, current_user, db, min_role="viewer"):
        seen[project_id] = min_role
        return "owner"

    monkeypatch.setattr(access_module, "require_project_role", fake_require)

    user = SimpleNamespace(id="regular", role="user", is_admin=False, is_active=True)
    for method, project_id in (("GET", "read-proj"), ("POST", "write-proj"), ("DELETE", "del-proj")):
        await access_module.require_project_config_access(
            _request_stub(method, project_id, f"/api/project-configs/{project_id}/skills"),
            user,
            db=object(),
        )

    assert seen == {"read-proj": "viewer", "write-proj": "editor", "del-proj": "editor"}


@pytest.mark.asyncio
async def test_filesystem_project_config_allows_project_without_acl(monkeypatch):
    """A project with no ACL records stays open -- the documented fallback.

    require_project_role returns "editor" when has_any_access_control is False,
    so today's single-user deployments keep working; the guard only bites once
    ACL rows exist.
    """
    from api.project_configs import access as access_module

    _patch_filesystem_project(monkeypatch)

    async def fake_require(project_id, current_user, db, min_role="viewer"):
        return "editor"

    monkeypatch.setattr(access_module, "require_project_role", fake_require)

    user = SimpleNamespace(id="regular", role="user", is_admin=False, is_active=True)
    result = await access_module.require_project_config_access(
        _request_stub("GET", "open-proj", "/api/project-configs/open-proj/skills"),
        user,
        db=object(),
    )

    assert result is user


@pytest.mark.asyncio
async def test_filesystem_project_config_copy_target_requires_editor(monkeypatch):
    """A copy writes into the target, so the target needs its own write check.

    The route dependency authorizes the *source* project only. This guard used
    to return immediately in filesystem mode, so editor access to one project
    was enough to push .claude assets into any other project by ID.
    """
    from api.project_configs import access as access_module

    _patch_filesystem_project(monkeypatch)

    seen: dict[str, object] = {}

    async def fake_require(project_id, current_user, db, min_role="viewer"):
        seen["project_id"] = project_id
        seen["min_role"] = min_role
        raise HTTPException(status_code=403, detail="No access to this project")

    monkeypatch.setattr(access_module, "require_project_role", fake_require)

    with pytest.raises(HTTPException) as exc:
        await access_module.require_project_config_target_access(
            "victim-project",
            SimpleNamespace(id="regular", role="user", is_admin=False, is_active=True),
            db=object(),
        )

    assert exc.value.status_code == 403
    assert seen == {"project_id": "victim-project", "min_role": "editor"}


@pytest.mark.asyncio
async def test_filesystem_project_config_copy_target_must_exist(monkeypatch):
    """An unknown target is a 404, not a silent pass-through."""
    from api.project_configs import access as access_module

    _patch_filesystem_project(monkeypatch, exists=False)

    with pytest.raises(HTTPException) as exc:
        await access_module.require_project_config_target_access(
            "ghost-project",
            SimpleNamespace(id="regular", role="user", is_admin=False, is_active=True),
            db=object(),
        )

    assert exc.value.status_code == 404


# ── WebSocket authentication ────────────────────────────────────


class _StubAuthService:
    """Accepts exactly one token so the query/header paths stay distinguishable."""

    def __init__(self, db):
        self._db = db

    def verify_token(self, token, token_type="access"):
        return {"sub": "user-1"} if token == "good-token" else None

    async def get_user_by_id(self, user_id):
        return SimpleNamespace(id=user_id, is_active=True)


@pytest.mark.asyncio
async def test_websocket_auth_accepts_query_token(monkeypatch):
    """Browsers cannot set headers on a WebSocket, so the query param is the path."""
    from api import deps as deps_module

    monkeypatch.setattr(deps_module, "AuthService", _StubAuthService)

    user = await deps_module.get_current_user_websocket(
        SimpleNamespace(headers={}), token="good-token", db=object()
    )

    assert user.id == "user-1"


def test_websocket_route_binds_the_token_query_parameter(monkeypatch):
    """The wiring, not the function body: does FastAPI bind `?token=` here?

    The two tests above call get_current_user_websocket with `token` as a Python
    keyword, which never exercises query extraction on a websocket route. That
    is the same shape as the bug this commit fixes - both sides correct, the
    seam between them assumed - so drive it through the real ASGI route.

    Close *reason* separates the two outcomes: the auth dependency closes with
    "Not authenticated", while a request that got past auth reaches the handler
    and closes with "Session not found".
    """
    from starlette.testclient import TestClient
    from starlette.websockets import WebSocketDisconnect

    from api import deps as deps_module
    from api.app import create_app
    from api.deps import get_db_session, set_engine
    from orchestrator import OrchestrationEngine

    monkeypatch.setattr(deps_module, "AuthService", _StubAuthService)
    set_engine(OrchestrationEngine())

    test_app = create_app(title="WS Query Binding", debug=True)
    test_app.dependency_overrides[get_db_session] = lambda: object()
    client = TestClient(test_app)

    with pytest.raises(WebSocketDisconnect) as without_token:
        with client.websocket_connect("/ws/sess-binding"):
            pass

    with pytest.raises(WebSocketDisconnect) as with_token:
        with client.websocket_connect("/ws/sess-binding?token=good-token"):
            pass

    assert without_token.value.reason == "Not authenticated"
    # Past authentication - so the query parameter really did reach the guard.
    assert with_token.value.reason == "Session not found"


@pytest.mark.asyncio
async def test_websocket_auth_rejects_missing_token(monkeypatch):
    """No credential at all closes with 1008 rather than serving the stream."""
    from api import deps as deps_module

    monkeypatch.setattr(deps_module, "AuthService", _StubAuthService)

    with pytest.raises(WebSocketException) as exc:
        await deps_module.get_current_user_websocket(
            SimpleNamespace(headers={}), token=None, db=object()
        )

    assert exc.value.code == 1008


# ── session project resolution (database mode) ──────────────────


class _FakeResult:
    def __init__(self, row):
        self._row = row

    def scalar_one_or_none(self):
        return self._row


class _FakeDb:
    def __init__(self, row=None):
        self._row = row
        self.executed = 0

    async def execute(self, _stmt):
        self.executed += 1
        return _FakeResult(self._row)


def _db_project_row():
    return SimpleNamespace(
        id="05c4302d-9602-4b70-8267-65964f5bed4d",
        name="DB Project",
        path="/tmp/db-project",
        description="from the DB registry",
        organization_id=None,
        settings={},
    )


@pytest.mark.asyncio
async def test_session_resolves_database_project(monkeypatch):
    """/api/projects serves ProjectModel ids, so session creation must accept them.

    In database mode startup no longer populates PROJECTS_REGISTRY, so the
    filesystem lookup misses every id the dashboard can send and session
    creation 404s on the projects it just listed.
    """
    from api import sessions as sessions_module

    monkeypatch.setenv("USE_DATABASE", "true")
    monkeypatch.setattr("models.project.get_project", lambda pid: None)

    seen = {}

    async def fake_require(project_id, current_user, db, min_role="viewer"):
        seen["project_id"] = project_id
        seen["min_role"] = min_role
        return "viewer"

    monkeypatch.setattr(sessions_module, "require_project_role", fake_require)

    project = await sessions_module._resolve_project_context(
        "05c4302d-9602-4b70-8267-65964f5bed4d",
        SimpleNamespace(id="u1", role="user", is_admin=False, is_active=True),
        _FakeDb(_db_project_row()),
    )

    assert project is not None
    assert project.id == "05c4302d-9602-4b70-8267-65964f5bed4d"
    assert project.name == "DB Project"
    # Resolution must not become an authorization bypass.
    assert seen == {"project_id": "05c4302d-9602-4b70-8267-65964f5bed4d", "min_role": "viewer"}


@pytest.mark.asyncio
async def test_session_database_project_denial_propagates(monkeypatch):
    """A session must not attach a project the caller cannot otherwise reach."""
    from api import sessions as sessions_module

    monkeypatch.setenv("USE_DATABASE", "true")
    monkeypatch.setattr("models.project.get_project", lambda pid: None)

    async def deny(project_id, current_user, db, min_role="viewer"):
        raise HTTPException(status_code=403, detail="No access to this project")

    monkeypatch.setattr(sessions_module, "require_project_role", deny)

    with pytest.raises(HTTPException) as exc:
        await sessions_module._resolve_project_context(
            "someone-elses-project",
            SimpleNamespace(id="u1", role="user", is_admin=False, is_active=True),
            _FakeDb(_db_project_row()),
        )

    assert exc.value.status_code == 403


@pytest.mark.asyncio
async def test_session_filesystem_mode_does_not_query_the_database(monkeypatch):
    """Memory mode keeps its registry-only behaviour - no new DB round trip."""
    from api import sessions as sessions_module

    monkeypatch.setenv("USE_DATABASE", "false")
    monkeypatch.setattr("models.project.get_project", lambda pid: None)

    db = _FakeDb(_db_project_row())
    project = await sessions_module._resolve_project_context(
        "ghost", SimpleNamespace(id="u1", role="user", is_admin=False, is_active=True), db
    )

    assert project is None
    assert db.executed == 0


@pytest.mark.asyncio
async def test_session_filesystem_registry_does_not_bypass_db_authorization(monkeypatch):
    """A projects/ symlink id must not short-circuit the DB ACL check.

    Startup scans projects/ in database mode too (7ed7c46), so the in-memory
    registry is populated there. Returning a registry hit before
    ``require_project_role`` would let any authenticated caller attach a
    project by its symlink name, skipping the ACL the DB id is subject to.
    """
    from api import sessions as sessions_module

    monkeypatch.setenv("USE_DATABASE", "true")
    registry_project = SimpleNamespace(id="obsidian", name="Obsidian")
    monkeypatch.setattr("models.project.get_project", lambda pid: registry_project)

    async def deny(project_id, current_user, db, min_role="viewer"):
        raise HTTPException(status_code=404, detail="Project not found")

    monkeypatch.setattr(sessions_module, "require_project_role", deny)

    with pytest.raises(HTTPException) as exc:
        await sessions_module._resolve_project_context(
            "obsidian",
            SimpleNamespace(id="u1", role="user", is_admin=False, is_active=True),
            _FakeDb(_db_project_row()),
        )

    assert exc.value.status_code == 404


@pytest.mark.asyncio
async def test_create_session_uses_the_project_resolver(monkeypatch):
    """The wiring: does create_session actually go through the resolver?

    The tests above call _resolve_project_context directly, so reverting the
    call site inside create_session leaves them all green - the same seam this
    branch already got wrong once with the WebSocket token.
    """
    from api import sessions as sessions_module

    called = {}

    async def fake_resolver(project_id, current_user, db):
        called["project_id"] = project_id
        return SimpleNamespace(id=project_id, name="Resolved", path="/tmp/x")

    monkeypatch.setattr(sessions_module, "_resolve_project_context", fake_resolver)

    class _Engine:
        async def create_session(self, **kwargs):
            called["project_passed"] = kwargs.get("project")
            return "sess-1"

    async def no_quota(*args, **kwargs):
        return None

    monkeypatch.setattr(sessions_module, "_get_llm_access_for_session", no_quota)

    response = await sessions_module.create_session(
        request=sessions_module.SessionCreate(project_id="db-uuid-1"),
        engine=_Engine(),
        current_user=SimpleNamespace(id="u1", role="user", is_admin=False, is_active=True),
        db=_FakeDb(),
    )

    assert response.session_id == "sess-1"
    assert called["project_id"] == "db-uuid-1"
    assert called["project_passed"].id == "db-uuid-1"



# ─────────────────────────────────────────────────────────────
# project-configs: 빈 접근 집합은 장애가 아니다
# ─────────────────────────────────────────────────────────────


class _FakeSession:
    """async_session_factory() 대역 — 지정한 프로젝트 목록을 그대로 돌려준다."""

    def __init__(self, projects):
        self._projects = projects

    async def __aenter__(self):
        return self

    async def __aexit__(self, *_args):
        return None

    async def execute(self, *_args, **_kwargs):
        projects = self._projects
        return SimpleNamespace(scalars=lambda: SimpleNamespace(all=lambda: projects))


@pytest.mark.asyncio
async def test_project_configs_empty_access_returns_empty_list_not_503(monkeypatch):
    """접근 가능한 프로젝트가 0개인 일반 사용자는 빈 목록을 받는다.

    쿼리가 이미 접근 제어로 필터링돼 있으므로, 결과가 비었다는 것은 "이 사용자가
    볼 수 있는 프로젝트가 없다"는 정상적인 인가 결과다. 503 으로 답하면 권한
    결과를 실제 장애와 구분할 수 없게 되고, 정상 사용자에게 서비스가 고장났다고
    알리게 된다.
    """
    from api.project_configs.core import _get_db_filtered_projects

    monkeypatch.setattr("db.database.async_session_factory", lambda: _FakeSession([]))
    monkeypatch.setattr("api.projects._get_admin_org_ids", AsyncMock(return_value=[]))

    result = await _get_db_filtered_projects(
        None,
        SimpleNamespace(id="member-1", role="member", is_admin=False),
    )
    assert result == []


@pytest.mark.asyncio
async def test_project_configs_empty_registry_still_returns_503_for_admin(monkeypatch):
    """admin 의 빈 결과는 레지스트리 미구성이므로 503 을 유지한다.

    admin 쿼리는 접근 필터가 없어 전체 활성 프로젝트를 조회한다. 그것이 비었다면
    기동 동기화가 끝나지 않은 상태이지 인가 결과가 아니다 (api/routes.py 의
    레지스트리 검사와 같은 해석).
    """
    from api.project_configs.core import _get_db_filtered_projects

    monkeypatch.setattr("db.database.async_session_factory", lambda: _FakeSession([]))

    with pytest.raises(HTTPException) as exc_info:
        await _get_db_filtered_projects(
            None,
            SimpleNamespace(id="admin-1", role="admin", is_admin=True),
        )
    assert exc_info.value.status_code == 503


# ─────────────────────────────────────────────────────────────
# Database-mode project-config authorization
#
# PR #318 put a blanket 503 ("unavailable in database mode") on top of these
# branches, so the authorization below never actually ran and nothing locked
# it. The 2026-08-27 posture decision removed the block; these tests are the
# evidence that lifting it did not open the routes to unauthorized users.
# ─────────────────────────────────────────────────────────────


def _db_project(project_id: str = "proj-uuid", organization_id: str = "org-1"):
    """Stand-in for the ProjectModel columns the guard reads."""
    return SimpleNamespace(id=project_id, path="/tmp/proj", organization_id=organization_id)


class _ProjectConfigDbStub:
    """Serves the guard's two queries in order: active projects, then the grant.

    The guard runs `select(ProjectModel)` first and `select(ProjectAccessModel)`
    only for non-privileged users, so call order is the discriminator.
    """

    def __init__(self, projects, direct_grant=None):
        self._projects = projects
        self._direct_grant = direct_grant
        self.calls = 0

    async def execute(self, *_args, **_kwargs):
        self.calls += 1
        if self.calls == 1:
            return SimpleNamespace(scalars=lambda: SimpleNamespace(all=lambda: self._projects))
        return SimpleNamespace(scalar_one_or_none=lambda: self._direct_grant)


@pytest.mark.asyncio
async def test_db_project_config_allows_privileged_operator(monkeypatch):
    """An operator reaches a registered project's .claude assets in DB mode."""
    from api.project_configs import access as access_module

    monkeypatch.setenv("USE_DATABASE", "true")
    admin = SimpleNamespace(id="admin-1", role="admin", is_admin=True, is_active=True)

    result = await access_module.require_project_config_access(
        _request_stub("GET", "proj-uuid", "/api/project-configs/proj-uuid/skills"),
        admin,
        db=_ProjectConfigDbStub([_db_project()]),
    )

    assert result is admin


@pytest.mark.asyncio
async def test_db_project_config_allows_explicit_grant(monkeypatch):
    """A non-privileged user with a ProjectAccess row is authorized."""
    from api.project_configs import access as access_module

    monkeypatch.setenv("USE_DATABASE", "true")

    async def no_admin_orgs(_user):
        return []

    monkeypatch.setattr("api.projects._get_admin_org_ids", no_admin_orgs)
    member = SimpleNamespace(id="member-1", role="user", is_admin=False, is_active=True)

    result = await access_module.require_project_config_access(
        _request_stub("GET", "proj-uuid", "/api/project-configs/proj-uuid/skills"),
        member,
        db=_ProjectConfigDbStub([_db_project()], direct_grant="proj-uuid"),
    )

    assert result is member


@pytest.mark.asyncio
async def test_db_project_config_denies_user_without_grant(monkeypatch):
    """No org-admin scope and no ProjectAccess row still means 403, not access."""
    from api.project_configs import access as access_module

    monkeypatch.setenv("USE_DATABASE", "true")

    async def no_admin_orgs(_user):
        return []

    monkeypatch.setattr("api.projects._get_admin_org_ids", no_admin_orgs)

    with pytest.raises(HTTPException) as exc_info:
        await access_module.require_project_config_access(
            _request_stub("GET", "proj-uuid", "/api/project-configs/proj-uuid/skills"),
            SimpleNamespace(id="outsider", role="user", is_admin=False, is_active=True),
            db=_ProjectConfigDbStub([_db_project()], direct_grant=None),
        )

    assert exc_info.value.status_code == 403


@pytest.mark.asyncio
async def test_db_project_config_unregistered_project_is_404(monkeypatch):
    """An ID that matches no active DB project is still not found."""
    from api.project_configs import access as access_module

    monkeypatch.setenv("USE_DATABASE", "true")

    with pytest.raises(HTTPException) as exc_info:
        await access_module.require_project_config_access(
            _request_stub("GET", "other-uuid", "/api/project-configs/other-uuid/skills"),
            SimpleNamespace(id="admin-1", role="admin", is_admin=True, is_active=True),
            db=_ProjectConfigDbStub([_db_project()]),
        )

    assert exc_info.value.status_code == 404


@pytest.mark.asyncio
async def test_db_global_config_route_requires_privileged_role(monkeypatch):
    """Global asset routes stay operator-only in DB mode -- same as memory mode.

    These have no project_id, so they used to hit the discovery 503 before any
    role check. Removing it must not turn them into open routes.
    """
    from api.project_configs import access as access_module

    monkeypatch.setenv("USE_DATABASE", "true")

    with pytest.raises(HTTPException) as exc_info:
        await access_module.require_project_config_access(
            _request_stub("GET", None, "/api/project-configs/global"),
            SimpleNamespace(id="member-1", role="user", is_admin=False, is_active=True),
            db=object(),
        )

    assert exc_info.value.status_code == 403

    operator = SimpleNamespace(id="manager-1", role="manager", is_admin=False, is_active=True)
    result = await access_module.require_project_config_access(
        _request_stub("GET", None, "/api/project-configs/global"),
        operator,
        db=object(),
    )

    assert result is operator


# ─────────────────────────────────────────────────────────────
# Git API authentication
#
# The git package had no authentication gate at all until 2026-08-28: the
# router carried no `dependencies`, `include_router` added none, and the one
# `get_current_user` in the package (commits.py) is the *optional* variant.
# Unauthenticated GETs returned 200 with real repository data once a project
# was in PROJECTS_REGISTRY; writes reached body validation (422, not 401).
# An empty registry made it look closed -- `7ed7c46` filled the registry in
# database mode and the surface became reachable.
#
# No test called a git route over HTTP, which is why nothing caught it. These
# do.
# ─────────────────────────────────────────────────────────────


def _register_git_project(tmp_path) -> str:
    """Create a real repo and register it, returning the route's project_id."""
    import subprocess

    from models.project import register_project

    repo = tmp_path / "repo"
    repo.mkdir()
    # `-b` 로 이름을 고정한다 — init.defaultBranch 는 환경마다 다르다
    # (로컬 main / CI 기본 master).
    subprocess.run(["git", "init", "-q", "-b", "work"], cwd=repo, check=True)
    (repo / "f.txt").write_text("x\n")
    subprocess.run(["git", "add", "."], cwd=repo, check=True)
    subprocess.run(
        ["git", "-c", "user.email=a@b.c", "-c", "user.name=t", "commit", "-qm", "init"],
        cwd=repo,
        check=True,
    )
    project_id = str(repo).replace("/", "-")
    register_project(project_id, str(repo))
    return project_id


@pytest.mark.anyio
async def test_git_reads_require_authentication(client, tmp_path):
    """A registered project must not expose its history to anonymous callers.

    These returned 200 with branch names, commit SHAs, messages and author
    identities before the router gate existed.
    """
    project_id = _register_git_project(tmp_path)

    for path in (
        f"/api/git/projects/{project_id}/branches",
        f"/api/git/projects/{project_id}/commits",
        f"/api/git/projects/{project_id}/remotes",
    ):
        response = await client.get(path)
        assert response.status_code == 401, f"{path} -> {response.status_code}"


@pytest.mark.anyio
async def test_git_writes_require_authentication(client, tmp_path):
    """Writes must be rejected before body validation, not after.

    A 422 here would mean the request reached the handler's schema check with
    no identity attached -- that was the pre-fix behaviour.
    """
    project_id = _register_git_project(tmp_path)

    response = await client.post(
        f"/api/git/projects/{project_id}/branches", json={"name": "injected"}
    )
    assert response.status_code == 401


@pytest.mark.anyio
async def test_git_route_reachable_when_authenticated(client, authenticated_app, tmp_path):
    """The gate must not break the dashboard: an authenticated read still works.

    Guards against "fixed by making it always fail" -- the frontend sends a
    bearer token via apiClient's auth interceptor, so this is the real path.
    """
    project_id = _register_git_project(tmp_path)

    response = await client.get(f"/api/git/projects/{project_id}/branches")

    assert response.status_code == 200
    branches = response.json()["branches"]
    assert [b["name"] for b in branches] == ["work"]
    assert branches[0]["is_current"] is True
