"""Project environment diagnostic service.

Checks workspace, MCP, Git, and quota health for a given project.
"""

import json
import logging
import os
import shutil
from pathlib import Path

from models.diagnostics import (
    CategoryResult,
    DiagnosticCategory,
    DiagnosticCheck,
    DiagnosticStatus,
    FixResult,
    ProjectDiagnostics,
)
from models.project import Project

logger = logging.getLogger(__name__)


def _aggregate_status(checks: list[DiagnosticCheck]) -> DiagnosticStatus:
    """Derive overall status from individual checks."""
    if not checks:
        return DiagnosticStatus.HEALTHY
    statuses = {c.status for c in checks}
    if DiagnosticStatus.UNHEALTHY in statuses:
        return DiagnosticStatus.UNHEALTHY
    if DiagnosticStatus.DEGRADED in statuses:
        return DiagnosticStatus.DEGRADED
    return DiagnosticStatus.HEALTHY


# ─────────────────────────────────────────────────────────────
# Category: Workspace
# ─────────────────────────────────────────────────────────────


def _diagnose_workspace(project: Project) -> CategoryResult:
    """Check workspace filesystem health."""
    checks: list[DiagnosticCheck] = []
    project_path = Path(project.path)

    # 1. Path exists & readable
    if project_path.exists() and os.access(project_path, os.R_OK):
        checks.append(
            DiagnosticCheck(
                name="path_accessible",
                status=DiagnosticStatus.HEALTHY,
                message=f"Project path accessible: {project.path}",
            )
        )
    else:
        checks.append(
            DiagnosticCheck(
                name="path_accessible",
                status=DiagnosticStatus.UNHEALTHY,
                message=f"Project path not accessible: {project.path}",
            )
        )

    # 2. .aos-project.json validity
    config_file = project_path / ".aos-project.json"
    if config_file.exists():
        try:
            data = json.loads(config_file.read_text(encoding="utf-8"))
            checks.append(
                DiagnosticCheck(
                    name="aos_config",
                    status=DiagnosticStatus.HEALTHY,
                    message=".aos-project.json is valid",
                    details={"keys": list(data.keys())},
                )
            )
        except (json.JSONDecodeError, OSError) as e:
            checks.append(
                DiagnosticCheck(
                    name="aos_config",
                    status=DiagnosticStatus.DEGRADED,
                    message=f".aos-project.json parse error: {e}",
                )
            )
    else:
        checks.append(
            DiagnosticCheck(
                name="aos_config",
                status=DiagnosticStatus.DEGRADED,
                message=".aos-project.json not found (using defaults)",
                fixable=True,
                fix_action="create_aos_config",
            )
        )

    # 3. CLAUDE.md exists
    claude_md = project_path / "CLAUDE.md"
    if claude_md.exists():
        size_kb = claude_md.stat().st_size / 1024
        checks.append(
            DiagnosticCheck(
                name="claude_md",
                status=DiagnosticStatus.HEALTHY,
                message="CLAUDE.md found",
                details={"size_kb": round(size_kb, 1)},
            )
        )
    else:
        checks.append(
            DiagnosticCheck(
                name="claude_md",
                status=DiagnosticStatus.DEGRADED,
                message="CLAUDE.md not found",
                fixable=True,
                fix_action="create_claude_md",
            )
        )

    # 4. Disk space
    try:
        usage = shutil.disk_usage(project_path)
        free_gb = usage.free / (1024**3)
        total_gb = usage.total / (1024**3)
        pct_free = (usage.free / usage.total) * 100

        if pct_free > 10:
            status = DiagnosticStatus.HEALTHY
        elif pct_free > 5:
            status = DiagnosticStatus.DEGRADED
        else:
            status = DiagnosticStatus.UNHEALTHY

        checks.append(
            DiagnosticCheck(
                name="disk_space",
                status=status,
                message=f"{free_gb:.1f} GB free of {total_gb:.1f} GB ({pct_free:.0f}%)",
                details={
                    "free_gb": round(free_gb, 2),
                    "total_gb": round(total_gb, 2),
                    "percent_free": round(pct_free, 1),
                },
            )
        )
    except OSError as e:
        checks.append(
            DiagnosticCheck(
                name="disk_space",
                status=DiagnosticStatus.DEGRADED,
                message=f"Cannot read disk usage: {e}",
            )
        )

    return CategoryResult(
        category=DiagnosticCategory.WORKSPACE,
        status=_aggregate_status(checks),
        checks=checks,
    )


# ─────────────────────────────────────────────────────────────
# Category: MCP
# ─────────────────────────────────────────────────────────────


def _diagnose_mcp(project: Project) -> CategoryResult:
    """Check MCP server configuration health."""
    checks: list[DiagnosticCheck] = []
    project_path = Path(project.path)

    # 1. Project-level MCP config (.claude/mcp.json)
    mcp_json = project_path / ".claude" / "mcp.json"
    if mcp_json.exists():
        try:
            data = json.loads(mcp_json.read_text(encoding="utf-8"))
            servers = data.get("mcpServers", {})
            enabled = {k: v for k, v in servers.items() if not v.get("disabled", False)}
            disabled = {k: v for k, v in servers.items() if v.get("disabled", False)}

            if disabled:
                checks.append(
                    DiagnosticCheck(
                        name="mcp_project_config",
                        status=DiagnosticStatus.DEGRADED,
                        message=f"{len(enabled)} enabled, {len(disabled)} disabled: {', '.join(disabled.keys())}",
                        details={
                            "enabled": list(enabled.keys()),
                            "disabled": list(disabled.keys()),
                        },
                        fixable=True,
                        fix_action="enable_mcp_servers",
                    )
                )
            else:
                checks.append(
                    DiagnosticCheck(
                        name="mcp_project_config",
                        status=DiagnosticStatus.HEALTHY,
                        message=f"{len(enabled)} server(s) enabled",
                        details={"enabled": list(enabled.keys())},
                    )
                )
        except (json.JSONDecodeError, OSError) as e:
            checks.append(
                DiagnosticCheck(
                    name="mcp_project_config",
                    status=DiagnosticStatus.DEGRADED,
                    message=f"MCP config parse error: {e}",
                )
            )
    else:
        checks.append(
            DiagnosticCheck(
                name="mcp_project_config",
                status=DiagnosticStatus.HEALTHY,
                message="No project-level MCP config (using global)",
            )
        )

    # 2. Global MCP config (~/.claude.json)
    global_config = Path.home() / ".claude.json"
    if global_config.exists():
        try:
            data = json.loads(global_config.read_text(encoding="utf-8"))
            servers = data.get("mcpServers", {})
            enabled = {k: v for k, v in servers.items() if not v.get("disabled", False)}

            checks.append(
                DiagnosticCheck(
                    name="mcp_global_config",
                    status=DiagnosticStatus.HEALTHY,
                    message=f"{len(enabled)} global server(s) configured",
                    details={"servers": list(enabled.keys())},
                )
            )
        except (json.JSONDecodeError, OSError) as e:
            checks.append(
                DiagnosticCheck(
                    name="mcp_global_config",
                    status=DiagnosticStatus.DEGRADED,
                    message=f"Global MCP config error: {e}",
                )
            )
    else:
        checks.append(
            DiagnosticCheck(
                name="mcp_global_config",
                status=DiagnosticStatus.HEALTHY,
                message="No global MCP config found",
            )
        )

    return CategoryResult(
        category=DiagnosticCategory.MCP,
        status=_aggregate_status(checks),
        checks=checks,
    )


# ─────────────────────────────────────────────────────────────
# Category: Git
# ─────────────────────────────────────────────────────────────


def _diagnose_git(project: Project) -> CategoryResult:
    """Check Git repository health."""
    checks: list[DiagnosticCheck] = []

    effective_path = project.git_path or project.path

    if not project.git_enabled:
        checks.append(
            DiagnosticCheck(
                name="git_repository",
                status=DiagnosticStatus.DEGRADED,
                message="Not a Git repository",
                details={"path": effective_path},
            )
        )
        return CategoryResult(
            category=DiagnosticCategory.GIT,
            status=_aggregate_status(checks),
            checks=checks,
        )

    try:
        from services.git_service import GitService

        git = GitService(effective_path)

        # 1. Repository valid
        checks.append(
            DiagnosticCheck(
                name="git_repository",
                status=DiagnosticStatus.HEALTHY,
                message=f"Valid Git repository on branch '{git.current_branch}'",
                details={"branch": git.current_branch},
            )
        )

        # 2. Working directory clean?
        if git.is_dirty:
            checks.append(
                DiagnosticCheck(
                    name="git_clean",
                    status=DiagnosticStatus.DEGRADED,
                    message="Working directory has uncommitted changes",
                )
            )
        else:
            checks.append(
                DiagnosticCheck(
                    name="git_clean",
                    status=DiagnosticStatus.HEALTHY,
                    message="Working directory is clean",
                )
            )

        # 3. Remote configured?
        remotes = [r.name for r in git.repo.remotes]
        if remotes:
            checks.append(
                DiagnosticCheck(
                    name="git_remote",
                    status=DiagnosticStatus.HEALTHY,
                    message=f"Remote(s) configured: {', '.join(remotes)}",
                    details={"remotes": remotes},
                )
            )
        else:
            checks.append(
                DiagnosticCheck(
                    name="git_remote",
                    status=DiagnosticStatus.DEGRADED,
                    message="No remote configured",
                )
            )

    except Exception as e:
        checks.append(
            DiagnosticCheck(
                name="git_repository",
                status=DiagnosticStatus.UNHEALTHY,
                message=f"Git error: {e}",
            )
        )

    return CategoryResult(
        category=DiagnosticCategory.GIT,
        status=_aggregate_status(checks),
        checks=checks,
    )


# ─────────────────────────────────────────────────────────────
# Category: Quota
# ─────────────────────────────────────────────────────────────


def _diagnose_quota(project: Project) -> CategoryResult:
    """Check organization quota health."""
    checks: list[DiagnosticCheck] = []

    if not project.organization_id:
        checks.append(
            DiagnosticCheck(
                name="organization",
                status=DiagnosticStatus.HEALTHY,
                message="No organization linked (personal project)",
            )
        )
        return CategoryResult(
            category=DiagnosticCategory.QUOTA,
            status=DiagnosticStatus.HEALTHY,
            checks=checks,
        )

    try:
        from services.organization_service import OrganizationService
        from services.quota_service import QuotaService

        org = OrganizationService.get_organization(project.organization_id)
        if not org:
            checks.append(
                DiagnosticCheck(
                    name="organization",
                    status=DiagnosticStatus.UNHEALTHY,
                    message=f"Organization not found: {project.organization_id}",
                )
            )
            return CategoryResult(
                category=DiagnosticCategory.QUOTA,
                status=DiagnosticStatus.UNHEALTHY,
                checks=checks,
            )

        quota = QuotaService.get_quota_status(org)

        # Members
        m = quota.members
        checks.append(
            DiagnosticCheck(
                name="quota_members",
                status=DiagnosticStatus.HEALTHY if m.allowed else DiagnosticStatus.UNHEALTHY,
                message=m.message or f"{m.current}/{m.limit} members",
                details={"current": m.current, "limit": m.limit},
            )
        )

        # Projects
        p = quota.projects
        checks.append(
            DiagnosticCheck(
                name="quota_projects",
                status=DiagnosticStatus.HEALTHY if p.allowed else DiagnosticStatus.UNHEALTHY,
                message=p.message or f"{p.current}/{p.limit} projects",
                details={"current": p.current, "limit": p.limit},
            )
        )

        # Tokens
        t = quota.tokens
        if t.limit < 0:
            token_status = DiagnosticStatus.HEALTHY
        elif t.current / max(t.limit, 1) > 0.9:
            token_status = DiagnosticStatus.DEGRADED
        else:
            token_status = DiagnosticStatus.HEALTHY if t.allowed else DiagnosticStatus.UNHEALTHY

        checks.append(
            DiagnosticCheck(
                name="quota_tokens",
                status=token_status,
                message=t.message or f"{t.current}/{t.limit} tokens this month",
                details={"current": t.current, "limit": t.limit},
            )
        )

    except Exception as e:
        checks.append(
            DiagnosticCheck(
                name="organization",
                status=DiagnosticStatus.DEGRADED,
                message=f"Quota check error: {e}",
            )
        )

    return CategoryResult(
        category=DiagnosticCategory.QUOTA,
        status=_aggregate_status(checks),
        checks=checks,
    )


# ─────────────────────────────────────────────────────────────
# Public API
# ─────────────────────────────────────────────────────────────

CATEGORY_RUNNERS = {
    DiagnosticCategory.WORKSPACE: _diagnose_workspace,
    DiagnosticCategory.MCP: _diagnose_mcp,
    DiagnosticCategory.GIT: _diagnose_git,
    DiagnosticCategory.QUOTA: _diagnose_quota,
}


def run_diagnostics(
    project: Project,
    categories: list[DiagnosticCategory] | None = None,
) -> ProjectDiagnostics:
    """Run environment diagnostics for a project.

    Args:
        project: The project to diagnose.
        categories: Specific categories to check. None means all.

    Returns:
        ProjectDiagnostics with results per category.
    """
    target_categories = categories or list(DiagnosticCategory)
    results: dict[str, CategoryResult] = {}

    for cat in target_categories:
        runner = CATEGORY_RUNNERS.get(cat)
        if runner:
            try:
                results[cat.value] = runner(project)
            except Exception as e:
                logger.error(f"Diagnostic failed for {cat.value}: {e}")
                results[cat.value] = CategoryResult(
                    category=cat,
                    status=DiagnosticStatus.UNHEALTHY,
                    checks=[
                        DiagnosticCheck(
                            name="internal_error",
                            status=DiagnosticStatus.UNHEALTHY,
                            message=f"Diagnostic runner error: {e}",
                        )
                    ],
                )

    # Overall status
    all_statuses = {r.status for r in results.values()}
    if DiagnosticStatus.UNHEALTHY in all_statuses:
        overall = DiagnosticStatus.UNHEALTHY
    elif DiagnosticStatus.DEGRADED in all_statuses:
        overall = DiagnosticStatus.DEGRADED
    else:
        overall = DiagnosticStatus.HEALTHY

    return ProjectDiagnostics(
        project_id=project.id,
        project_name=project.name,
        overall_status=overall,
        categories=results,
    )


# ─────────────────────────────────────────────────────────────
# Self-Healing Fix Actions
# ─────────────────────────────────────────────────────────────


def _fix_create_aos_config(project: Project, params: dict) -> str:
    """Create a default .aos-project.json."""
    config_file = Path(project.path) / ".aos-project.json"
    if config_file.exists():
        return ".aos-project.json already exists"

    default_config = {
        "name": project.name,
        "description": project.description or "",
    }
    config_file.write_text(
        json.dumps(default_config, indent=2, ensure_ascii=False) + "\n",
        encoding="utf-8",
    )
    return "Created .aos-project.json with default config"


def _fix_create_claude_md(project: Project, params: dict) -> str:
    """Create a minimal CLAUDE.md."""
    claude_md = Path(project.path) / "CLAUDE.md"
    if claude_md.exists():
        return "CLAUDE.md already exists"

    content = f"# {project.name}\n\nProject instructions for Claude Code.\n"
    claude_md.write_text(content, encoding="utf-8")
    return "Created CLAUDE.md with minimal template"


def _fix_enable_mcp_servers(project: Project, params: dict) -> str:
    """Enable all disabled MCP servers in project config."""
    mcp_json = Path(project.path) / ".claude" / "mcp.json"
    if not mcp_json.exists():
        return "No .claude/mcp.json found"

    try:
        data = json.loads(mcp_json.read_text(encoding="utf-8"))
        servers = data.get("mcpServers", {})
        enabled_count = 0

        target_ids = params.get("server_ids")
        for server_id, config in servers.items():
            if config.get("disabled", False):
                if target_ids is None or server_id in target_ids:
                    config["disabled"] = False
                    enabled_count += 1

        mcp_json.write_text(
            json.dumps(data, indent=2, ensure_ascii=False) + "\n",
            encoding="utf-8",
        )
        return f"Enabled {enabled_count} MCP server(s)"
    except (json.JSONDecodeError, OSError) as e:
        return f"Failed to update MCP config: {e}"


FIX_HANDLERS: dict[str, callable] = {
    "create_aos_config": _fix_create_aos_config,
    "create_claude_md": _fix_create_claude_md,
    "enable_mcp_servers": _fix_enable_mcp_servers,
}


def execute_fix(
    project: Project,
    fix_action: str,
    params: dict | None = None,
) -> FixResult:
    """Execute a self-healing fix and re-diagnose.

    Args:
        project: The project to fix.
        fix_action: Fix action ID (e.g. "create_aos_config").
        params: Optional parameters for the fix.

    Returns:
        FixResult with success status and updated diagnostics.
    """
    handler = FIX_HANDLERS.get(fix_action)
    if not handler:
        return FixResult(
            fix_action=fix_action,
            success=False,
            message=f"Unknown fix action: {fix_action}",
        )

    try:
        message = handler(project, params or {})
        diagnostics = run_diagnostics(project)
        return FixResult(
            fix_action=fix_action,
            success=True,
            message=message,
            diagnostics=diagnostics,
        )
    except Exception as e:
        logger.error(f"Fix action '{fix_action}' failed: {e}")
        return FixResult(
            fix_action=fix_action,
            success=False,
            message=f"Fix failed: {e}",
        )
