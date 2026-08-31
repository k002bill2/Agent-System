"""LangChain 메시지 변환과 접근 불가 모델 폴백."""

import logging
import os
from typing import Any

from langchain_core.messages import AIMessage, BaseMessage, HumanMessage, SystemMessage

from models.llm_access import LLMAccessResponse
from models.llm_models import LLMModelRegistry
from models.llm_usage import LLMUsageSource
from models.playground import PlaygroundExecution, PlaygroundMessage, PlaygroundSession
from services.llm_runtime_resolver import (
    LLMRuntimeRequest,
    LLMRuntimeResolutionError,
    resolve_llm_runtime,
)
from services.llm_service import LLMResponse

logger = logging.getLogger(__name__)


def _to_lc_messages(msgs: list[PlaygroundMessage]) -> list[BaseMessage]:
    """
    Convert persisted ``PlaygroundMessage`` history into LangChain messages.

    - ``user`` → ``HumanMessage``
    - ``assistant`` → ``AIMessage``
    - ``tool`` → ``SystemMessage(content="[previous tool call] ...")``
      (Legacy sessions don't carry ``tool_call_id`` required by LangChain
      ``ToolMessage``; absorbing as SystemMessage preserves the information
      without tripping strict tool-call validation on the next turn.)
    - ``system`` role is omitted (handled via explicit ``system_prompt`` arg)
    """
    out: list[BaseMessage] = []
    for m in msgs:
        role = m.role
        content = m.content or ""
        if role == "user":
            out.append(HumanMessage(content=content))
        elif role == "assistant":
            out.append(AIMessage(content=content))
        elif role == "tool":
            out.append(SystemMessage(content=f"[previous tool call] {content}"))
        # other roles (system, etc.) are intentionally dropped
    return out


def _coerce_llm_content(content: Any) -> str:
    """
    Flatten LLM content into a plain string.

    Gemini's multi-part responses can arrive as ``[{type: "text", text: ...},
    {type: "tool_use", ...}]``. We extract only the textual parts so the
    ``tool_use`` blocks don't leak into persisted transcripts as ``str(dict)``.
    """
    if isinstance(content, str):
        return content
    if isinstance(content, list):
        parts: list[str] = []
        for item in content:
            if isinstance(item, dict):
                # Only collect text parts; skip tool_use/tool_result blocks
                if item.get("type") in (None, "text"):
                    text = item.get("text")
                    if text:
                        parts.append(str(text))
            else:
                parts.append(str(item))
        return " ".join(parts)
    return str(content)


def _playground_usage_context(
    session: PlaygroundSession,
    *,
    execution: PlaygroundExecution | None = None,
    metadata: dict[str, Any] | None = None,
    llm_access: LLMAccessResponse | None = None,
) -> dict[str, Any]:
    context_metadata = {
        "agent_id": session.agent_id,
        "execution_id": execution.id if execution else None,
    }
    if metadata:
        context_metadata.update(metadata)
    user_id = session.user_id or (llm_access.user_id if llm_access else None)
    context = {
        "source": LLMUsageSource.PLAYGROUND,
        "session_id": session.id,
        "project_id": session.project_id,
        "metadata": {k: v for k, v in context_metadata.items() if v is not None},
    }
    if user_id:
        context["user_id"] = user_id
    if llm_access:
        context["llm_access"] = llm_access
    return context


def _is_inaccessible_model_error(error: Exception) -> bool:
    """Detect errors caused by a model the current caller cannot use.

    Two distinct sources must trigger the stale-model fallback:
    - provider-side errors (OpenAI/Anthropic "model_not_found", etc.), matched by
      message, and
    - the runtime resolver rejecting the requested model for the authenticated
      user's entitlements. ``LLMService.invoke`` re-raises that
      ``LLMRuntimeResolutionError`` raw, and its message ("No enabled LLM
      entitlement for provider=...") matches none of the provider patterns — so
      it must be recognized by type, or authenticated fallback never fires.
    """
    if isinstance(error, LLMRuntimeResolutionError):
        return True
    message = str(error).lower()
    return (
        "model_not_found" in message
        or "does not have access to model" in message
        or "unknown model:" in message
    )


def _safe_playground_fallback_model(
    current_model: str,
    usage_context: dict[str, Any] | None = None,
) -> str | None:
    """Pick a conservative fallback for stale persisted Playground sessions.

    For an authenticated user the runtime resolver gates models by entitlement,
    so the fallback must be a model the user is actually entitled to. The global
    env default may not be in their entitlements and would only trigger a fresh
    ``LLMRuntimeResolutionError`` — breaking the fallback. Resolve the user's
    entitled default instead; return ``None`` (no doomed retry) when they have no
    usable entitlement. Anonymous sessions keep the env-default behaviour.
    """
    access = usage_context.get("llm_access") if usage_context else None
    if isinstance(access, LLMAccessResponse):
        try:
            resolution = resolve_llm_runtime(
                access,
                LLMRuntimeRequest(
                    user_id=usage_context.get("user_id") if usage_context else None,
                    source=LLMUsageSource.PLAYGROUND.value,
                    requested_model_id=None,
                    organization_id=(
                        usage_context.get("organization_id") if usage_context else None
                    ),
                ),
            )
        except LLMRuntimeResolutionError:
            return None
        entitled = resolution.model_id
        return entitled if entitled and entitled != current_model else None

    configured_default = LLMModelRegistry.get_default(os.getenv("LLM_PROVIDER") or "codex_cli")
    fallback = configured_default or "codex-cli"
    return fallback if fallback and fallback != current_model else None


async def _invoke_with_model_fallback(
    session: PlaygroundSession,
    invoke,
    **kwargs: Any,
) -> LLMResponse:
    """Invoke once, then retry with the configured safe default for stale models.

    The retry is execution-scoped: ``session.model`` is the user's saved
    choice and is never rewritten here — a successful fallback is recorded on
    the execution (requested/resolved), and a failed fallback target must not
    be persisted into the session either.
    """
    try:
        return await invoke(model_id=session.model, **kwargs)
    except Exception as exc:
        fallback_model = _safe_playground_fallback_model(session.model, kwargs.get("usage_context"))
        if not fallback_model or not _is_inaccessible_model_error(exc):
            raise

        logger.warning(
            "playground_model_inaccessible_retry",
            extra={"stale_model": session.model, "fallback_model": fallback_model},
        )
        return await invoke(model_id=fallback_model, **kwargs)
