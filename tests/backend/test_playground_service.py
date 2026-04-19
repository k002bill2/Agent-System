"""Unit tests for Playground service after the RAG/Tools overhaul.

Covers:
- _to_lc_messages() handles legacy tool-role entries without tool_call_id
- _coerce_llm_content() flattens Gemini multi-part responses
- PlaygroundSession parses legacy JSON dicts (missing rag_k / overrides)
- PlaygroundExecuteRequest carries per-request RAG overrides
- invoke_with_tools force-final round triggers when budget is exhausted
- LLMService._build_messages injects RAG context as a separate SystemMessage
- DEFAULT_SYSTEM_PROMPT contains the updated Gemini-specific guidance
- web_search dispatches to Tavily when TAVILY_API_KEY is set, DDG otherwise
"""

from __future__ import annotations

from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from langchain_core.messages import AIMessage, HumanMessage, SystemMessage

from models.playground import (
    PlaygroundExecuteRequest,
    PlaygroundMessage,
    PlaygroundSession,
)
from services.llm_service import LLMService, _build_messages
from services.playground_service import (
    DEFAULT_SYSTEM_PROMPT,
    _coerce_llm_content,
    _to_lc_messages,
)


# ─────────────────────────────────────────────────────────────
# Helpers / conversions
# ─────────────────────────────────────────────────────────────


def test_to_lc_messages_absorbs_legacy_tool_role() -> None:
    """Legacy tool entries (no tool_call_id) must not break conversion."""
    msgs = [
        PlaygroundMessage(role="user", content="hi"),
        PlaygroundMessage(role="assistant", content="hello"),
        PlaygroundMessage(role="tool", content="Called web_search"),
        PlaygroundMessage(role="system", content="SHOULD BE DROPPED"),
    ]
    out = _to_lc_messages(msgs)
    assert [type(m).__name__ for m in out] == [
        "HumanMessage",
        "AIMessage",
        "SystemMessage",
    ]
    assert "[previous tool call]" in out[2].content


def test_coerce_llm_content_flattens_multipart() -> None:
    """Gemini tool_use blocks must not leak into persisted text."""
    parts = [
        {"type": "text", "text": "real answer"},
        {"type": "tool_use", "name": "x", "input": {}},
    ]
    assert _coerce_llm_content(parts) == "real answer"


def test_coerce_llm_content_passthrough_string() -> None:
    assert _coerce_llm_content("plain") == "plain"


# ─────────────────────────────────────────────────────────────
# Model defaults / legacy compat
# ─────────────────────────────────────────────────────────────


def test_legacy_session_json_fills_rag_defaults() -> None:
    """Sessions persisted before the schema change should still parse."""
    legacy = {
        "id": "abc",
        "name": "legacy",
        "messages": [],
        "executions": [],
        # explicitly no rag_k / rag_hybrid_override / rag_rerank_override
    }
    sess = PlaygroundSession(**legacy)
    assert sess.rag_k == 5
    assert sess.rag_hybrid_override is None
    assert sess.rag_rerank_override is None


def test_request_carries_per_call_rag_overrides() -> None:
    req = PlaygroundExecuteRequest(
        prompt="hi",
        rag_k=12,
        rag_hybrid_override=True,
        rag_rerank_override=False,
    )
    assert req.rag_k == 12
    assert req.rag_hybrid_override is True
    assert req.rag_rerank_override is False


def test_default_system_prompt_is_gemini_specific() -> None:
    assert "단일 출처" in DEFAULT_SYSTEM_PROMPT
    assert "제공된 컨텍스트에 없습니다" in DEFAULT_SYSTEM_PROMPT


# ─────────────────────────────────────────────────────────────
# LLMService message building + force-final
# ─────────────────────────────────────────────────────────────


def test_build_messages_separates_rag_into_system_message() -> None:
    msgs = _build_messages(
        system_prompt="Sys",
        history=[HumanMessage(content="prev_u"), AIMessage(content="prev_a")],
        prompt="current",
        rag_context="RAG BLOCK",
        extra_context={"k": "v"},
    )
    # System, RAG-System, prev_u, prev_a, current-Human
    assert len(msgs) == 5
    assert isinstance(msgs[0], SystemMessage) and msgs[0].content == "Sys"
    assert isinstance(msgs[1], SystemMessage)
    assert "RAG BLOCK" in msgs[1].content
    assert "source of truth" in msgs[1].content.lower()
    assert isinstance(msgs[2], HumanMessage) and msgs[2].content == "prev_u"
    assert isinstance(msgs[3], AIMessage) and msgs[3].content == "prev_a"
    assert isinstance(msgs[4], HumanMessage)
    assert "current" in msgs[4].content
    assert "- k: v" in msgs[4].content


def test_build_messages_without_history_or_rag() -> None:
    msgs = _build_messages(
        system_prompt=None,
        history=None,
        prompt="just ask",
    )
    assert len(msgs) == 1
    assert isinstance(msgs[0], HumanMessage)
    assert msgs[0].content == "just ask"


@pytest.mark.asyncio
async def test_invoke_with_tools_force_final_on_budget_exhaustion() -> None:
    """When tool iterations run out we must still return a real answer."""
    # Mock LLM that *always* wants to call a tool, forcing budget exhaustion.
    mock_llm = MagicMock()

    always_tool_response = MagicMock()
    always_tool_response.content = ""
    always_tool_response.tool_calls = [
        {"name": "web_search", "args": {"query": "x"}, "id": "t1"}
    ]
    always_tool_response.usage_metadata = {"input_tokens": 10, "output_tokens": 2}

    # Raw llm.ainvoke (used for the force-final round) returns a clean answer.
    forced_final = MagicMock()
    forced_final.content = "final synthesized answer"
    forced_final.usage_metadata = {"input_tokens": 20, "output_tokens": 5}

    mock_llm.ainvoke = AsyncMock(return_value=forced_final)
    mock_bound = MagicMock()
    mock_bound.ainvoke = AsyncMock(return_value=always_tool_response)
    mock_llm.bind_tools = MagicMock(return_value=mock_bound)

    async def fake_exec(_name, _args, working_directory=None):
        return {"success": True, "results": []}

    with (
        patch.object(LLMService, "_get_llm", return_value=mock_llm),
        patch("services.playground_tools.execute_tool", side_effect=fake_exec),
    ):
        resp = await LLMService.invoke_with_tools(
            prompt="q",
            tools=["web_search"],
            model_id="gemini-3.1-pro-preview",
            max_tool_iterations=2,
        )

    assert resp.content == "final synthesized answer"
    # Budget of 2 rounds -> 2 tool calls recorded before force-final kicks in
    assert len(resp.tool_calls) == 2


# ─────────────────────────────────────────────────────────────
# Web search provider dispatch
# ─────────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_web_search_uses_tavily_when_key_set(monkeypatch) -> None:
    from services import playground_tools

    async def fake_tavily(query, max_results, api_key):
        return {
            "success": True,
            "query": query,
            "provider": "tavily",
            "results": [{"title": "t", "url": "u", "snippet": "s", "score": 0.9}],
            "total": 1,
            "answer": "synthesized",
        }

    monkeypatch.setenv("TAVILY_API_KEY", "fake-key")
    monkeypatch.setattr(playground_tools.PlaygroundTools, "_web_search_tavily", fake_tavily)

    res = await playground_tools.PlaygroundTools.web_search("test", 3)
    assert res["provider"] == "tavily"
    assert res["answer"] == "synthesized"


@pytest.mark.asyncio
async def test_web_search_falls_back_to_ddg_without_key(monkeypatch) -> None:
    from services import playground_tools

    async def fake_ddg(query, max_results=5):
        return {"success": True, "provider": "duckduckgo", "results": []}

    monkeypatch.delenv("TAVILY_API_KEY", raising=False)
    monkeypatch.setattr(playground_tools.PlaygroundTools, "_web_search_ddg", fake_ddg)

    res = await playground_tools.PlaygroundTools.web_search("test", 3)
    assert res["provider"] == "duckduckgo"
