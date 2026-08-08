"""Tests for LLM usage instrumentation at real invocation seams."""

from __future__ import annotations

import asyncio
from datetime import UTC, datetime
from io import BytesIO
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock

import pytest

from agents.base import AgentConfig, BaseAgent
from models.agent_state import TaskNode, TaskStatus, create_initial_state
from models.git import DraftCommitsRequest
from models.llm_access import LLMAccessResponse, LLMEntitlementResponse
from models.llm_models import LLMModelRegistry
from models.llm_usage import (
    LLMRuntimeMode,
    LLMUsageMeasurementMethod,
    LLMUsageSource,
    LLMUsageStatus,
)
from services.llm_access_service import default_access_response
from services.llm_runtime_resolver import LLMRuntimeResolutionError
from services.llm_service import LLMResponse, LLMService
from services.llm_usage_ledger_service import LLMUsageQuotaExceededError


@pytest.mark.asyncio
async def test_llm_service_invoke_records_success_usage(monkeypatch) -> None:
    response = MagicMock()
    response.content = "ok"
    response.usage_metadata = {"input_tokens": 4, "output_tokens": 5}

    fake_llm = MagicMock()
    fake_llm.ainvoke = AsyncMock(return_value=response)
    recorder = AsyncMock()

    monkeypatch.setattr(LLMService, "_get_llm", MagicMock(return_value=fake_llm))
    monkeypatch.setattr("services.llm_service.record_usage_best_effort", recorder)

    result = await LLMService.invoke(
        prompt="hello",
        model_id="codex-cli",
        usage_context={
            "source": LLMUsageSource.PLAYGROUND,
            "user_id": "user-1",
            "organization_id": "org-1",
            "session_id": "session-1",
            "project_id": "project-1",
        },
    )

    assert result.content == "ok"
    recorder.assert_awaited_once()
    usage = recorder.await_args.args[0]
    assert usage.provider == "codex_cli"
    assert usage.mode == LLMRuntimeMode.CLI
    assert usage.source == LLMUsageSource.PLAYGROUND.value
    assert usage.input_tokens == 4
    assert usage.output_tokens == 5
    assert usage.measurement_method == LLMUsageMeasurementMethod.PROVIDER_METADATA
    assert usage.status == LLMUsageStatus.SUCCESS
    assert usage.user_id == "user-1"
    assert usage.organization_id == "org-1"
    assert usage.session_id == "session-1"
    assert usage.project_id == "project-1"


@pytest.mark.asyncio
async def test_llm_service_invoke_preflight_quota_blocks_provider_call(monkeypatch) -> None:
    fake_llm = MagicMock()
    fake_llm.ainvoke = AsyncMock()
    recorder = AsyncMock()
    preflight = AsyncMock(
        side_effect=LLMUsageQuotaExceededError(
            "Monthly token limit reached (100)",
            organization_id="org-1",
            requested_tokens=4098,
        )
    )

    monkeypatch.setattr(LLMService, "_get_llm", MagicMock(return_value=fake_llm))
    monkeypatch.setattr("services.llm_service.record_usage_best_effort", recorder)
    monkeypatch.setattr(
        "services.llm_service.enforce_usage_quota_preflight_best_effort",
        preflight,
    )

    with pytest.raises(LLMUsageQuotaExceededError, match="Monthly token limit reached"):
        await LLMService.invoke(
            prompt="hello",
            model_id="codex-cli",
            usage_context={
                "source": LLMUsageSource.PLAYGROUND,
                "user_id": "user-1",
                "organization_id": "org-1",
            },
        )

    preflight.assert_awaited_once()
    fake_llm.ainvoke.assert_not_awaited()
    recorder.assert_not_awaited()


@pytest.mark.asyncio
async def test_llm_service_invoke_uses_access_resolver_for_default_model(
    monkeypatch,
) -> None:
    monkeypatch.setenv("LLM_PROVIDER", "openai")
    response = MagicMock()
    response.content = "ok"
    response.usage_metadata = {"input_tokens": 4, "output_tokens": 5}
    fake_llm = MagicMock()
    fake_llm.ainvoke = AsyncMock(return_value=response)
    get_llm = MagicMock(return_value=fake_llm)
    recorder = AsyncMock()

    monkeypatch.setattr(LLMService, "_get_llm", get_llm)
    monkeypatch.setattr("services.llm_service.record_usage_best_effort", recorder)

    result = await LLMService.invoke(
        prompt="hello",
        usage_context={
            "source": LLMUsageSource.PLAYGROUND,
            "user_id": "user-1",
            "llm_access": default_access_response("user-1"),
        },
    )

    assert result.model == "codex-cli"
    get_llm.assert_called_once()
    assert get_llm.call_args.args[0] == "codex-cli"
    usage = recorder.await_args.args[0]
    assert usage.model == "codex-cli"
    assert usage.metadata["runtime_provider"] == "codex_cli"
    assert usage.metadata["runtime_mode"] == "cli"
    assert usage.metadata["entitlement_id"] == "default-codex-cli-all"


@pytest.mark.asyncio
async def test_llm_service_invoke_rejects_disabled_access_before_provider_call(
    monkeypatch,
) -> None:
    access = default_access_response("user-1")
    access.entitlements[0].enabled = False
    get_llm = MagicMock()
    recorder = AsyncMock()

    monkeypatch.setattr(LLMService, "_get_llm", get_llm)
    monkeypatch.setattr("services.llm_service.record_usage_best_effort", recorder)

    with pytest.raises(LLMRuntimeResolutionError, match="No enabled LLM entitlement"):
        await LLMService.invoke(
            prompt="hello",
            model_id="codex-cli",
            usage_context={
                "source": LLMUsageSource.PLAYGROUND,
                "user_id": "user-1",
                "llm_access": access,
            },
        )

    get_llm.assert_not_called()
    recorder.assert_not_awaited()


@pytest.mark.asyncio
async def test_llm_service_invoke_with_tools_preflight_quota_blocks_provider_call(
    monkeypatch,
) -> None:
    get_llm = MagicMock()
    recorder = AsyncMock()
    preflight = AsyncMock(
        side_effect=LLMUsageQuotaExceededError(
            "Monthly token limit reached (100)",
            organization_id="org-1",
            requested_tokens=4098,
        )
    )

    monkeypatch.setattr(LLMService, "_get_llm", get_llm)
    monkeypatch.setattr("services.llm_service.record_usage_best_effort", recorder)
    monkeypatch.setattr(
        "services.llm_service.enforce_usage_quota_preflight_best_effort",
        preflight,
    )

    with pytest.raises(LLMUsageQuotaExceededError, match="Monthly token limit reached"):
        await LLMService.invoke_with_tools(
            prompt="hello",
            tools=[],
            model_id="codex-cli",
            usage_context={
                "source": LLMUsageSource.PLAYGROUND,
                "user_id": "user-1",
                "organization_id": "org-1",
            },
        )

    preflight.assert_awaited_once()
    get_llm.assert_not_called()
    recorder.assert_not_awaited()


@pytest.mark.asyncio
async def test_llm_service_invoke_with_tools_passes_usage_context_to_tool_executor(
    monkeypatch,
) -> None:
    tool_response = SimpleNamespace(
        content="",
        tool_calls=[
            {
                "name": "web_search",
                "args": {"query": "current status"},
                "id": "tool-call-1",
            }
        ],
        usage_metadata={"input_tokens": 3, "output_tokens": 0},
    )
    final_response = SimpleNamespace(
        content="done",
        tool_calls=[],
        usage_metadata={"input_tokens": 2, "output_tokens": 4},
    )
    bound_llm = MagicMock()
    bound_llm.ainvoke = AsyncMock(side_effect=[tool_response, final_response])
    fake_llm = MagicMock()
    fake_llm.bind_tools = MagicMock(return_value=bound_llm)
    executor = AsyncMock(return_value={"success": True, "results": []})
    recorder = AsyncMock()

    monkeypatch.setattr(LLMService, "_get_llm", MagicMock(return_value=fake_llm))
    monkeypatch.setattr("services.playground_tools.execute_tool", executor)
    monkeypatch.setattr("services.llm_service.record_usage_best_effort", recorder)

    usage_context = {
        "source": LLMUsageSource.PLAYGROUND,
        "user_id": "user-1",
        "organization_id": "org-1",
        "session_id": "session-1",
        "project_id": "project-1",
    }

    result = await LLMService.invoke_with_tools(
        prompt="search",
        model_id="codex-cli",
        tools=["web_search"],
        usage_context=usage_context,
    )

    assert result.content == "done"
    executor.assert_awaited_once()
    assert executor.await_args.kwargs["usage_context"] == usage_context


@pytest.mark.asyncio
async def test_llm_service_invoke_records_error_usage(monkeypatch) -> None:
    fake_llm = MagicMock()
    fake_llm.ainvoke = AsyncMock(side_effect=ValueError("boom"))
    recorder = AsyncMock()

    monkeypatch.setattr(LLMService, "_get_llm", MagicMock(return_value=fake_llm))
    monkeypatch.setattr("services.llm_service.record_usage_best_effort", recorder)

    with pytest.raises(RuntimeError, match="boom"):
        await LLMService.invoke(
            prompt="hello",
            model_id="codex-cli",
            usage_context={"source": LLMUsageSource.PLAYGROUND},
        )

    recorder.assert_awaited_once()
    usage = recorder.await_args.args[0]
    assert usage.provider == "codex_cli"
    assert usage.mode == LLMRuntimeMode.CLI
    assert usage.status == LLMUsageStatus.ERROR
    assert usage.error_message == "boom"
    assert usage.input_tokens is None
    assert usage.output_tokens is None


@pytest.mark.asyncio
async def test_git_draft_commits_passes_usage_context(monkeypatch) -> None:
    from api.git import generate_draft_commits

    git_service = MagicMock()
    git_service.get_working_diff.return_value = "diff --git a/app.py b/app.py"
    git_service.get_changed_files_list.return_value = ["app.py"]

    captured: dict = {}

    async def fake_invoke(**kwargs):
        captured.update(kwargs)
        return LLMResponse(
            content='{"drafts":[{"message":"feat: update app","files":["app.py"],"type":"feat","scope":null}]}',
            input_tokens=10,
            output_tokens=5,
            model="codex-cli",
            provider="codex_cli",
        )

    monkeypatch.setattr("api.git.commits.get_git_service_for_project", MagicMock(return_value=git_service))
    monkeypatch.setattr(LLMService, "invoke", fake_invoke)

    result = await generate_draft_commits(
        "project-1",
        DraftCommitsRequest(staged_only=False),
    )

    assert result.total_files == 1
    usage_context = captured["usage_context"]
    assert usage_context["source"] == LLMUsageSource.GIT_DRAFT_COMMIT
    assert usage_context["project_id"] == "project-1"
    assert usage_context["metadata"]["staged_only"] is False
    assert usage_context["metadata"]["changed_file_count"] == 1


@pytest.mark.asyncio
async def test_git_draft_commits_passes_llm_access_context(monkeypatch) -> None:
    from api.git import generate_draft_commits_for_project

    git_service = MagicMock()
    git_service.get_working_diff.return_value = "diff --git a/app.py b/app.py"
    git_service.get_changed_files_list.return_value = ["app.py"]
    captured: dict = {}
    access = default_access_response("user-1")

    async def fake_invoke(**kwargs):
        captured.update(kwargs)
        return LLMResponse(
            content='{"drafts":[{"message":"feat: update app","files":["app.py"],"type":"feat","scope":null}]}',
            input_tokens=10,
            output_tokens=5,
            model="codex-cli",
            provider="codex_cli",
        )

    monkeypatch.setattr("api.git.commits.get_git_service_for_project", MagicMock(return_value=git_service))
    monkeypatch.setattr(LLMService, "invoke", fake_invoke)

    result = await generate_draft_commits_for_project(
        "project-1",
        DraftCommitsRequest(staged_only=False),
        llm_access=access,
    )

    assert result.total_files == 1
    usage_context = captured["usage_context"]
    assert usage_context["llm_access"] == access
    assert usage_context["user_id"] == "user-1"


class _UsageTestAgent(BaseAgent):
    async def execute(self, task: str, context: dict | None = None):
        return await self._invoke_llm(task, context=context, usage_context=context)


@pytest.mark.asyncio
async def test_base_agent_invoke_llm_records_task_analyzer_usage(monkeypatch) -> None:
    llm_response = SimpleNamespace(
        content="analysis",
        usage_metadata={"input_tokens": 11, "output_tokens": 7},
    )
    fake_llm = MagicMock()
    fake_llm.ainvoke = AsyncMock(return_value=llm_response)
    recorder = AsyncMock()

    monkeypatch.setattr("agents.base.record_usage_best_effort", recorder)
    monkeypatch.setattr("agents.base.LLMService._get_llm", MagicMock(return_value=fake_llm))

    agent = _UsageTestAgent(
        AgentConfig(
            name="UsageTest",
            description="usage test",
            system_prompt="system",
            model_name="codex-cli",
        )
    )

    result = await agent.execute(
        "analyze this",
        context={
            "source": LLMUsageSource.TASK_ANALYZER,
            "project_id": "project-1",
            "metadata": {"agent": "LeadOrchestrator"},
        },
    )

    assert result == "analysis"
    recorder.assert_awaited_once()
    usage = recorder.await_args.args[0]
    assert usage.source == LLMUsageSource.TASK_ANALYZER.value
    assert usage.provider == "codex_cli"
    assert usage.mode == LLMRuntimeMode.CLI
    assert usage.input_tokens == 11
    assert usage.output_tokens == 7
    assert usage.status == LLMUsageStatus.SUCCESS
    assert usage.project_id == "project-1"
    assert usage.metadata == {"agent": "LeadOrchestrator"}


@pytest.mark.asyncio
async def test_base_agent_invoke_llm_uses_llm_access_resolver(monkeypatch) -> None:
    monkeypatch.setenv("LLM_PROVIDER", "openai")
    llm_response = SimpleNamespace(
        content="analysis",
        usage_metadata={"input_tokens": 11, "output_tokens": 7},
    )
    default_llm = MagicMock()
    default_llm.ainvoke = AsyncMock(return_value=llm_response)
    resolved_llm = MagicMock()
    resolved_llm.ainvoke = AsyncMock(return_value=llm_response)
    get_llm = MagicMock(return_value=resolved_llm)
    recorder = AsyncMock()
    access = default_access_response("user-1")

    monkeypatch.setattr("agents.base.record_usage_best_effort", recorder)
    monkeypatch.setattr("agents.base.LLMService._get_llm", get_llm)

    agent = _UsageTestAgent(
        AgentConfig(
            name="UsageTest",
            description="usage test",
            system_prompt="system",
            model_name="gpt-4o-mini",
        )
    )
    agent.llm = default_llm
    get_llm.reset_mock()

    result = await agent._invoke_llm(
        "analyze this",
        usage_context={
            "source": LLMUsageSource.TASK_ANALYZER,
            "user_id": "user-1",
            "llm_access": access,
        },
    )

    assert result == "analysis"
    get_llm.assert_called_once()
    assert get_llm.call_args.kwargs["model_id"] == "codex-cli"
    default_llm.ainvoke.assert_not_awaited()
    usage = recorder.await_args.args[0]
    assert usage.model == "codex-cli"
    assert usage.metadata["runtime_provider"] == "codex_cli"
    assert usage.metadata["runtime_mode"] == "cli"


def _api_entitlement(
    *,
    provider: str = "openai",
    source_scope: str = "task_analyzer",
) -> LLMEntitlementResponse:
    now = datetime(2026, 7, 3, tzinfo=UTC)
    return LLMEntitlementResponse(
        id=f"{provider}-api-entitlement",
        user_id="user-1",
        organization_id=None,
        provider=provider,
        mode="api",
        source_scope=source_scope,
        enabled=True,
        cli_profile_id=None,
        allow_api_fallback=True,
        quota_policy_id=None,
        created_at=now,
        updated_at=now,
    )


def test_task_analyzer_ocr_rejects_default_cli_only_access() -> None:
    from api.agents import _resolve_ocr_runtime

    model = LLMModelRegistry.get_by_id("gpt-4o-mini")
    assert model is not None

    with pytest.raises(LLMRuntimeResolutionError, match="OCR runtime is not allowed"):
        _resolve_ocr_runtime(
            default_access_response("user-1"),
            organization_id=None,
            candidates=[model],
        )


@pytest.mark.asyncio
async def test_task_analyzer_ocr_records_allowed_api_fallback_usage(monkeypatch) -> None:
    from fastapi import UploadFile

    from api import agents as agents_api

    model = LLMModelRegistry.get_by_id("gpt-4o-mini")
    assert model is not None
    access = LLMAccessResponse(
        user_id="user-1",
        api_fallback_enabled=True,
        profiles=[],
        entitlements=[_api_entitlement()],
    )
    user = SimpleNamespace(id="user-1", organization_id="org-1")
    llm_response = SimpleNamespace(
        content="hello world",
        usage_metadata={"input_tokens": 17, "output_tokens": 3},
    )
    fake_llm = MagicMock()
    fake_llm.ainvoke = AsyncMock(return_value=llm_response)
    recorder = AsyncMock()
    preflight = AsyncMock()

    monkeypatch.setattr("api.agents._legacy.get_access_for_user", AsyncMock(return_value=access))
    monkeypatch.setattr("api.agents._legacy.LLMModelRegistry.get_enabled", MagicMock(return_value=[model]))
    monkeypatch.setattr("api.agents._legacy.LLMModelRegistry.is_available", MagicMock(return_value=True))
    monkeypatch.setattr("api.agents._legacy.LLMService._get_llm", MagicMock(return_value=fake_llm))
    monkeypatch.setattr("api.agents._legacy.record_usage_best_effort", recorder)
    monkeypatch.setattr(
        "api.agents._legacy.enforce_usage_quota_preflight_best_effort",
        preflight,
    )

    upload = UploadFile(file=BytesIO(b"fake-image-bytes"), filename="sample.png")

    result = await agents_api.extract_text_from_image(
        image=upload,
        _user=user,
        db=MagicMock(),
    )

    assert result.success is True
    assert result.text == "hello world"
    assert result.model_used == "gpt-4o-mini"
    preflight.assert_awaited_once()
    assert preflight.await_args.kwargs["user_id"] == "user-1"
    assert preflight.await_args.kwargs["organization_id"] == "org-1"
    assert preflight.await_args.kwargs["estimated_tokens"] > 0
    recorder.assert_awaited_once()
    usage = recorder.await_args.args[0]
    assert usage.provider == "openai"
    assert usage.mode == LLMRuntimeMode.API
    assert usage.source == LLMUsageSource.TASK_ANALYZER_OCR.value
    assert usage.model == "gpt-4o-mini"
    assert usage.input_tokens == 17
    assert usage.output_tokens == 3
    assert usage.measurement_method == LLMUsageMeasurementMethod.PROVIDER_METADATA
    assert usage.status == LLMUsageStatus.SUCCESS
    assert usage.user_id == "user-1"
    assert usage.organization_id == "org-1"
    assert usage.metadata["runtime_provider"] == "openai"
    assert usage.metadata["filename"] == "sample.png"


@pytest.mark.asyncio
async def test_llm_proxy_records_api_fallback_usage(monkeypatch) -> None:
    from api import llm_proxy

    recorder = AsyncMock()
    monkeypatch.setattr("api.llm_proxy.record_usage_best_effort", recorder)

    await llm_proxy._record_internal_proxy_usage(
        provider_name="openai",
        user_id="user-1",
        organization_id="org-1",
        response_json={
            "model": "gpt-4o-mini",
            "usage": {"prompt_tokens": 12, "completion_tokens": 8},
        },
        latency_ms=42.5,
        status_code=200,
    )

    recorder.assert_awaited_once()
    usage = recorder.await_args.args[0]
    assert usage.provider == "openai"
    assert usage.mode == LLMRuntimeMode.API
    assert usage.source == LLMUsageSource.API_FALLBACK_PROXY.value
    assert usage.model == "gpt-4o-mini"
    assert usage.input_tokens == 12
    assert usage.output_tokens == 8
    assert usage.measurement_method == LLMUsageMeasurementMethod.PROVIDER_METADATA
    assert usage.status == LLMUsageStatus.SUCCESS
    assert usage.user_id == "user-1"
    assert usage.organization_id == "org-1"
    assert usage.latency_ms == 42


def test_llm_proxy_api_fallback_disabled_by_default(monkeypatch) -> None:
    from api import llm_proxy

    monkeypatch.delenv("LLM_API_FALLBACK_ENABLED", raising=False)
    assert llm_proxy._api_fallback_enabled() is False


def test_llm_proxy_api_fallback_enabled_explicitly(monkeypatch) -> None:
    from api import llm_proxy

    monkeypatch.setenv("LLM_API_FALLBACK_ENABLED", "true")
    assert llm_proxy._api_fallback_enabled() is True


@pytest.mark.asyncio
async def test_tmux_execute_analysis_records_cli_usage(monkeypatch, tmp_path) -> None:
    from services.tmux_service import TmuxService

    service = TmuxService()
    sent_commands: list[str] = []
    recorder = AsyncMock()

    monkeypatch.setattr(service, "is_available", lambda: True)
    monkeypatch.setattr(service, "is_claude_available", lambda: True)
    monkeypatch.setattr(service, "create_session", lambda _name, _path: True)
    monkeypatch.setattr(
        service,
        "send_command",
        lambda _name, command: sent_commands.append(command) or True,
    )
    monkeypatch.setattr("services.tmux_service.record_usage_best_effort", recorder)

    info = await service.execute_analysis(
        analysis_id="analysis-1",
        project_path=str(tmp_path),
        analysis={"analysis": {}, "execution_plan": {}},
        task_input="implement task",
        usage_context={
            "source": LLMUsageSource.TASK_ANALYZER_EXECUTION,
            "user_id": "user-1",
            "organization_id": "org-1",
            "project_id": "project-1",
        },
    )

    assert info is not None
    assert sent_commands and "claude -p" in sent_commands[-1]
    assert "tee" in sent_commands[-1]
    assert info.transcript_path
    recorder.assert_awaited_once()
    usage = recorder.await_args.args[0]
    assert usage.provider == "claude_cli"
    assert usage.mode == LLMRuntimeMode.CLI
    assert usage.source == LLMUsageSource.TASK_ANALYZER_EXECUTION.value
    assert usage.model == "claude-code-cli"
    assert usage.status == LLMUsageStatus.SUCCESS
    assert usage.user_id == "user-1"
    assert usage.organization_id == "org-1"
    assert usage.project_id == "project-1"
    assert usage.analysis_id == "analysis-1"
    assert usage.session_id == info.session_name
    assert usage.metadata["tmux_session"] == info.session_name
    assert usage.metadata["project_path"] == str(tmp_path)


@pytest.mark.asyncio
async def test_tmux_execute_analysis_preflight_quota_blocks_session_creation(
    monkeypatch,
    tmp_path,
) -> None:
    from services.tmux_service import TmuxService

    service = TmuxService()
    recorder = AsyncMock()
    preflight = AsyncMock(
        side_effect=LLMUsageQuotaExceededError(
            "Monthly token limit reached (100)",
            organization_id="org-1",
            requested_tokens=100,
        )
    )
    create_session = MagicMock(return_value=True)
    send_command = MagicMock(return_value=True)

    monkeypatch.setattr(service, "is_available", lambda: True)
    monkeypatch.setattr(service, "is_claude_available", lambda: True)
    monkeypatch.setattr(service, "create_session", create_session)
    monkeypatch.setattr(service, "send_command", send_command)
    monkeypatch.setattr("services.tmux_service.record_usage_best_effort", recorder)
    monkeypatch.setattr(
        "services.tmux_service.enforce_usage_quota_preflight_best_effort",
        preflight,
    )

    with pytest.raises(LLMUsageQuotaExceededError, match="Monthly token limit reached"):
        await service.execute_analysis(
            analysis_id="analysis-1",
            project_path=str(tmp_path),
            analysis={"analysis": {}, "execution_plan": {}},
            task_input="implement task",
            usage_context={
                "source": LLMUsageSource.TASK_ANALYZER_EXECUTION,
                "user_id": "user-1",
                "organization_id": "org-1",
                "project_id": "project-1",
            },
        )

    preflight.assert_awaited_once()
    assert preflight.await_args.kwargs["user_id"] == "user-1"
    assert preflight.await_args.kwargs["organization_id"] == "org-1"
    assert preflight.await_args.kwargs["estimated_tokens"] > 0
    create_session.assert_not_called()
    send_command.assert_not_called()
    recorder.assert_not_awaited()


@pytest.mark.asyncio
async def test_warp_open_claude_launch_records_usage_intent(monkeypatch, tmp_path) -> None:
    from api import warp as warp_api

    project = SimpleNamespace(
        id="project-1",
        path=str(tmp_path),
        organization_id="org-1",
    )
    fake_warp = MagicMock()
    fake_warp.is_warp_installed.return_value = True
    fake_warp.build_claude_command.return_value = "claude launch task"
    fake_warp.open_with_command.return_value = {
        "success": True,
        "message": "Opened Warp",
        "uri": "warp://launch/aos-test",
        "opened_as": "window",
    }
    recorder = AsyncMock()
    preflight = AsyncMock()

    monkeypatch.setattr("api.warp.get_project", MagicMock(return_value=project))
    monkeypatch.setattr("api.warp.get_warp_service", MagicMock(return_value=fake_warp))
    monkeypatch.setattr("api.warp.record_usage_best_effort", recorder)
    monkeypatch.setattr(
        "api.warp.enforce_usage_quota_preflight_best_effort",
        preflight,
    )

    response = await warp_api.open_in_warp(
        warp_api.WarpOpenRequest(
            project_id="project-1",
            command="launch task",
            use_claude_cli=True,
        )
    )

    assert response.success is True
    preflight.assert_awaited_once()
    assert preflight.await_args.kwargs["organization_id"] == "org-1"
    assert preflight.await_args.kwargs["estimated_tokens"] > 0
    recorder.assert_awaited_once()
    usage = recorder.await_args.args[0]
    assert usage.provider == "claude_cli"
    assert usage.mode == LLMRuntimeMode.CLI
    assert usage.source == LLMUsageSource.WARP_LAUNCH.value
    assert usage.model == "claude-code-cli"
    assert usage.input_tokens == preflight.await_args.kwargs["estimated_tokens"]
    assert usage.output_tokens is None
    assert usage.measurement_method == LLMUsageMeasurementMethod.ESTIMATED
    assert usage.status == LLMUsageStatus.SUCCESS
    assert usage.organization_id == "org-1"
    assert usage.project_id == "project-1"
    assert usage.metadata["event"] == "warp_launch_created"
    assert usage.metadata["open_via_frontend"] is False


@pytest.mark.asyncio
async def test_warp_open_claude_launch_preflight_quota_blocks_launch(
    monkeypatch,
    tmp_path,
) -> None:
    from fastapi import HTTPException

    from api import warp as warp_api

    project = SimpleNamespace(
        id="project-1",
        path=str(tmp_path),
        organization_id="org-1",
    )
    fake_warp = MagicMock()
    fake_warp.is_warp_installed.return_value = True
    fake_warp.build_claude_command.return_value = "claude launch task"
    recorder = AsyncMock()
    preflight = AsyncMock(
        side_effect=LLMUsageQuotaExceededError(
            "Monthly token limit reached (100)",
            organization_id="org-1",
            requested_tokens=10,
        )
    )

    monkeypatch.setattr("api.warp.get_project", MagicMock(return_value=project))
    monkeypatch.setattr("api.warp.get_warp_service", MagicMock(return_value=fake_warp))
    monkeypatch.setattr("api.warp.record_usage_best_effort", recorder)
    monkeypatch.setattr(
        "api.warp.enforce_usage_quota_preflight_best_effort",
        preflight,
    )

    with pytest.raises(HTTPException) as exc_info:
        await warp_api.open_in_warp(
            warp_api.WarpOpenRequest(
                project_id="project-1",
                command="launch task",
                use_claude_cli=True,
            )
        )

    assert exc_info.value.status_code == 429
    fake_warp.open_with_command.assert_not_called()
    recorder.assert_not_awaited()


def test_warp_agent_run_records_usage(monkeypatch, tmp_path) -> None:
    from tools import warp_tools

    recorder = AsyncMock()
    preflight = AsyncMock()
    completed = MagicMock(returncode=0, stdout="done", stderr="")

    monkeypatch.setattr("tools.warp_tools._check_warp_installed", MagicMock(return_value=True))
    monkeypatch.setattr("tools.warp_tools.record_usage_best_effort", recorder)
    monkeypatch.setattr(
        "tools.warp_tools.enforce_usage_quota_preflight_best_effort",
        preflight,
    )
    monkeypatch.setattr("tools.warp_tools.subprocess.run", MagicMock(return_value=completed))

    result = warp_tools.warp_agent_run.func(
        prompt="inspect project",
        cwd=str(tmp_path),
        model="warp-model",
        timeout=30,
    )

    assert result == "done"
    preflight.assert_awaited_once()
    assert preflight.await_args.kwargs["estimated_tokens"] > 0
    recorder.assert_awaited_once()
    usage = recorder.await_args.args[0]
    assert usage.provider == "warp_ai"
    assert usage.mode == LLMRuntimeMode.CLI
    assert usage.source == "warp_agent"
    assert usage.model == "warp-model"
    assert usage.input_tokens == preflight.await_args.kwargs["estimated_tokens"]
    assert usage.output_tokens is None
    assert usage.measurement_method == LLMUsageMeasurementMethod.ESTIMATED
    assert usage.status == LLMUsageStatus.SUCCESS
    assert usage.metadata["event"] == "warp_agent_completed"
    assert usage.metadata["cwd"] == str(tmp_path)
    assert usage.metadata["has_mcp"] is False


def test_warp_agent_run_preflight_quota_blocks_subprocess(monkeypatch, tmp_path) -> None:
    from tools import warp_tools

    recorder = AsyncMock()
    preflight = AsyncMock(
        side_effect=LLMUsageQuotaExceededError(
            "Monthly token limit reached (100)",
            organization_id="org-1",
            requested_tokens=10,
        )
    )
    run = MagicMock()

    monkeypatch.setattr("tools.warp_tools._check_warp_installed", MagicMock(return_value=True))
    monkeypatch.setattr("tools.warp_tools.record_usage_best_effort", recorder)
    monkeypatch.setattr(
        "tools.warp_tools.enforce_usage_quota_preflight_best_effort",
        preflight,
    )
    monkeypatch.setattr("tools.warp_tools.subprocess.run", run)

    result = warp_tools.warp_agent_run.func(
        prompt="inspect project",
        cwd=str(tmp_path),
    )

    assert result == "Error: Monthly token limit reached (100)"
    run.assert_not_called()
    recorder.assert_not_awaited()


@pytest.mark.asyncio
async def test_executor_warp_agent_run_passes_usage_context(monkeypatch, tmp_path) -> None:
    from orchestrator.nodes import ExecutorNode
    from tools import warp_tools

    recorder = AsyncMock()
    preflight = AsyncMock()
    completed = MagicMock(returncode=0, stdout="done", stderr="")

    monkeypatch.setattr("tools.warp_tools._check_warp_installed", MagicMock(return_value=True))
    monkeypatch.setattr("tools.warp_tools.record_usage_best_effort", recorder)
    monkeypatch.setattr(
        "tools.warp_tools.enforce_usage_quota_preflight_best_effort",
        preflight,
    )
    monkeypatch.setattr("tools.warp_tools.subprocess.run", MagicMock(return_value=completed))

    node = ExecutorNode(llm=None, tools=[warp_tools.warp_agent_run])
    result = await node._execute_tool(
        "warp_agent_run",
        {
            "prompt": "inspect project",
            "cwd": str(tmp_path),
            "model": "warp-model",
            "timeout": 30,
        },
        usage_context={
            "source": LLMUsageSource.ORCHESTRATOR,
            "user_id": "user-1",
            "organization_id": "org-1",
            "session_id": "session-1",
            "task_id": "task-1",
            "project_id": "project-1",
            "metadata": {"node": "ExecutorNode"},
        },
    )

    assert result == "done"
    preflight.assert_awaited_once()
    assert preflight.await_args.kwargs["user_id"] == "user-1"
    assert preflight.await_args.kwargs["organization_id"] == "org-1"
    recorder.assert_awaited_once()
    usage = recorder.await_args.args[0]
    assert usage.provider == "warp_ai"
    assert usage.mode == LLMRuntimeMode.CLI
    assert usage.source == "warp_agent"
    assert usage.user_id == "user-1"
    assert usage.organization_id == "org-1"
    assert usage.session_id == "session-1"
    assert usage.task_id == "task-1"
    assert usage.project_id == "project-1"
    assert usage.metadata["event"] == "warp_agent_completed"
    assert usage.metadata["node"] == "ExecutorNode"


@pytest.mark.asyncio
async def test_orchestrator_executor_records_token_update_usage(monkeypatch) -> None:
    from orchestrator.nodes import ExecutorNode

    response = SimpleNamespace(
        content="done",
        tool_calls=[],
        usage_metadata={"input_tokens": 13, "output_tokens": 5},
    )
    fake_llm = MagicMock()
    fake_llm.model_name = "codex-cli"
    fake_llm.ainvoke = AsyncMock(return_value=response)
    recorder = AsyncMock()

    monkeypatch.setattr("orchestrator.nodes.record_usage_best_effort", recorder)
    monkeypatch.setattr("orchestrator.nodes.AuditService.log", MagicMock())
    monkeypatch.setattr("orchestrator.nodes.audit_task_status_change", MagicMock())

    state = create_initial_state(session_id="session-1")
    task = TaskNode(
        id="task-1",
        title="Task 1",
        description="Do task",
        status=TaskStatus.PENDING,
    )
    state["tasks"] = {"task-1": task}
    state["current_task_id"] = "task-1"
    state["project"] = {"id": "project-1"}

    result = await ExecutorNode(llm=fake_llm, tools=[]).run(state)

    assert result["_last_token_update"]["total_tokens"] == 18
    recorder.assert_awaited_once()
    usage = recorder.await_args.args[0]
    assert usage.provider == "codex_cli"
    assert usage.mode == LLMRuntimeMode.CLI
    assert usage.source == LLMUsageSource.ORCHESTRATOR.value
    assert usage.model == "codex-cli"
    assert usage.input_tokens == 13
    assert usage.output_tokens == 5
    assert usage.total_tokens == 18
    assert usage.session_id == "session-1"
    assert usage.task_id == "task-1"
    assert usage.project_id == "project-1"
    assert usage.metadata["node"] == "ExecutorNode"
    assert usage.metadata["agent_name"] == "Executor"


@pytest.mark.asyncio
async def test_orchestration_engine_create_session_stores_llm_access_as_dict(
    monkeypatch,
) -> None:
    from orchestrator.engine import OrchestrationEngine
    from services.session_service import SessionService

    monkeypatch.setattr("orchestrator.engine.AuditService.log", MagicMock())

    engine = OrchestrationEngine(
        llm=MagicMock(),
        tools=[],
        session_service=SessionService(use_database=False),
    )
    access = default_access_response("user-1")

    session_id = await engine.create_session(
        user_id="user-1",
        organization_id="org-1",
        llm_access=access,
    )
    state = await engine.get_session(session_id)

    assert state is not None
    assert state["llm_access"]["user_id"] == "user-1"
    assert state["llm_access"]["entitlements"][0]["provider"] == "codex_cli"
    assert state["llm_access"]["profiles"][0]["id"] == "default-codex-cli"


@pytest.mark.asyncio
async def test_context_compressor_passes_usage_context_to_llm_service(monkeypatch) -> None:
    from services.context_compressor import ContextCompressor

    captured: dict[str, object] = {}

    async def fake_invoke(**kwargs):
        captured.update(kwargs)
        return LLMResponse(content="요약")

    monkeypatch.setattr("services.llm_service.LLMService.invoke", fake_invoke)

    compressor = ContextCompressor(
        warning_threshold=0.0,
        high_threshold=1.0,
        critical_threshold=2.0,
        preserve_recent=2,
        min_messages=3,
    )
    usage_context = {
        "source": LLMUsageSource.CONTEXT_COMPRESSION,
        "user_id": "user-1",
        "organization_id": "org-1",
        "session_id": "session-1",
        "project_id": "project-1",
        "llm_access": default_access_response("user-1").model_dump(mode="json"),
    }
    state = {
        "messages": [
            {"role": "user", "content": "first message"},
            {"role": "assistant", "content": "second message"},
            {"role": "user", "content": "third message"},
            {"role": "assistant", "content": "fourth message"},
        ],
        "system_context": "",
        "tasks": {},
    }

    result = await compressor.compress_if_needed(
        state,
        provider="codex_cli",
        model="codex-cli",
        usage_context=usage_context,
    )

    assert result.compressed is True
    assert captured["usage_context"] == usage_context
    assert captured["model_id"] == ""


@pytest.mark.asyncio
async def test_orchestration_engine_passes_context_compression_usage_context(
    monkeypatch,
) -> None:
    from orchestrator.engine import OrchestrationEngine
    from services.context_compressor import CompressionResult
    from services.session_service import SessionService

    monkeypatch.setattr("orchestrator.engine.AuditService.log", MagicMock())

    engine = OrchestrationEngine(
        llm=MagicMock(),
        tools=[],
        session_service=SessionService(use_database=False),
    )
    engine.compiled_graph = SimpleNamespace(ainvoke=AsyncMock(side_effect=lambda state: state))
    captured: dict[str, object] = {}

    async def fake_compress_if_needed(state, **kwargs):
        captured["state"] = state
        captured.update(kwargs)
        return CompressionResult(False, 0, 0, 0, 0)

    engine._compressor = SimpleNamespace(compress_if_needed=fake_compress_if_needed)
    access = default_access_response("user-1")
    session_id = await engine.create_session(
        user_id="user-1",
        organization_id="org-1",
        llm_access=access,
    )
    state = await engine.get_session(session_id)
    assert state is not None
    state["project"] = {"id": "project-1"}

    await engine.run(session_id, "compress me")

    usage_context = captured["usage_context"]
    assert usage_context["source"] == LLMUsageSource.CONTEXT_COMPRESSION
    assert usage_context["user_id"] == "user-1"
    assert usage_context["organization_id"] == "org-1"
    assert usage_context["session_id"] == session_id
    assert usage_context["project_id"] == "project-1"
    assert usage_context["llm_access"]["user_id"] == "user-1"


@pytest.mark.asyncio
async def test_orchestrator_executor_uses_llm_access_resolver(monkeypatch) -> None:
    from orchestrator.nodes import ExecutorNode

    response = SimpleNamespace(
        content="done",
        tool_calls=[],
        usage_metadata={"input_tokens": 13, "output_tokens": 5},
    )
    default_llm = MagicMock()
    default_llm.model_name = "gpt-4o-mini"
    default_llm.ainvoke = AsyncMock(return_value=response)
    resolved_llm = MagicMock()
    resolved_llm.model_name = "codex-cli"
    resolved_llm.ainvoke = AsyncMock(return_value=response)
    get_llm = MagicMock(return_value=resolved_llm)
    recorder = AsyncMock()

    monkeypatch.setattr("orchestrator.nodes.LLMService._get_llm", get_llm)
    monkeypatch.setattr("orchestrator.nodes.record_usage_best_effort", recorder)
    monkeypatch.setattr("orchestrator.nodes.AuditService.log", MagicMock())
    monkeypatch.setattr("orchestrator.nodes.audit_task_status_change", MagicMock())

    state = create_initial_state(
        session_id="session-1",
        user_id="user-1",
        organization_id="org-1",
    )
    state["llm_access"] = default_access_response("user-1").model_dump(mode="json")
    task = TaskNode(
        id="task-1",
        title="Task 1",
        description="Do task",
        status=TaskStatus.PENDING,
    )
    state["tasks"] = {"task-1": task}
    state["current_task_id"] = "task-1"
    state["project"] = {"id": "project-1"}

    result = await ExecutorNode(llm=default_llm, tools=[]).run(state)

    assert result["_last_token_update"]["model"] == "codex-cli"
    get_llm.assert_called_once()
    assert get_llm.call_args.kwargs["model_id"] == "codex-cli"
    default_llm.ainvoke.assert_not_awaited()
    resolved_llm.ainvoke.assert_awaited_once()
    usage = recorder.await_args.args[0]
    assert usage.model == "codex-cli"
    assert usage.metadata["runtime_provider"] == "codex_cli"
    assert usage.metadata["runtime_mode"] == "cli"
    assert usage.metadata["entitlement_id"] == "default-codex-cli-all"


@pytest.mark.asyncio
async def test_tmux_get_session_records_completion_when_process_exits(
    monkeypatch,
    tmp_path,
) -> None:
    from services.tmux_service import TmuxService, TmuxSessionInfo
    from utils.time import utcnow

    service = TmuxService()
    recorder = AsyncMock()
    transcript_path = tmp_path / "claude.out"
    transcript_path.write_text(
        '\n{"usage": {"input_tokens": 123, "output_tokens": 45, '
        '"total_tokens": 168, "cost_usd": 0.0123}}\n',
        encoding="utf-8",
    )
    service._sessions["aos-test"] = TmuxSessionInfo(
        session_name="aos-test",
        analysis_id="analysis-1",
        project_path="/tmp/project",
        active=True,
        started_at=utcnow(),
        task_input="task",
        usage_context={
            "source": LLMUsageSource.TASK_ANALYZER_EXECUTION,
            "user_id": "user-1",
            "organization_id": "org-1",
            "project_id": "project-1",
        },
        transcript_path=str(transcript_path),
    )

    monkeypatch.setattr(service, "is_session_alive", lambda _name: False)
    monkeypatch.setattr("services.tmux_service.record_usage_best_effort", recorder)

    info = service.get_session("aos-test")
    await asyncio.sleep(0)

    assert info is not None
    assert info.active is False
    recorder.assert_awaited_once()
    usage = recorder.await_args.args[0]
    assert usage.status == LLMUsageStatus.SUCCESS
    assert usage.provider == "claude_cli"
    assert usage.source == LLMUsageSource.TASK_ANALYZER_EXECUTION.value
    assert usage.session_id == "aos-test"
    assert usage.analysis_id == "analysis-1"
    assert usage.project_id == "project-1"
    assert usage.input_tokens == 123
    assert usage.output_tokens == 45
    assert usage.total_tokens == 168
    assert usage.estimated_cost_usd == 0.0123
    assert usage.measurement_method == LLMUsageMeasurementMethod.CLI_METADATA
    assert usage.metadata["event"] == "tmux_session_completed"
    assert usage.metadata["cli_usage_metadata"] == {
        "input_tokens": 123,
        "output_tokens": 45,
        "total_tokens": 168,
        "estimated_cost_usd": 0.0123,
    }


def test_parse_claude_cli_usage_metadata_from_labeled_transcript() -> None:
    from services.tmux_service import parse_claude_cli_usage_metadata

    usage = parse_claude_cli_usage_metadata(
        """
        Completed.
        Input tokens: 1,000
        Output tokens: 250
        Total cost: $0.045
        """
    )

    assert usage == {
        "input_tokens": 1000,
        "output_tokens": 250,
        "total_tokens": 1250,
        "estimated_cost_usd": 0.045,
    }
