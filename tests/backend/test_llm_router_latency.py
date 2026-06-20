"""Tests for per-provider response latency exposure on the LLM router.

The router already accumulates per-provider samples in ``_latency_tracker``.
This surfaces them on ``LLMProviderConfig`` as ``last_latency_ms`` (most recent)
and ``avg_latency_ms`` (mean of the retained window) without mutating the stored
provider objects — injection happens on copies returned by the getters.
"""

import pytest

import services.llm_router_service as svc
from models.llm_router import LLMProvider, LLMProviderConfig
from services.llm_router_service import LLMRouterService


@pytest.fixture(autouse=True)
def _clean_state():
    svc._providers.clear()
    svc._latency_tracker.clear()
    yield
    svc._providers.clear()
    svc._latency_tracker.clear()


def _add_provider() -> str:
    provider = LLMProviderConfig(provider=LLMProvider.OPENAI, model="gpt-4")
    svc._providers[provider.id] = provider
    return provider.id


def test_latency_for_no_data_returns_none_none():
    pid = _add_provider()
    assert LLMRouterService._latency_for(pid) == (None, None)


def test_latency_for_returns_last_sample_and_mean():
    pid = _add_provider()
    svc._latency_tracker[pid] = [100.0, 200.0, 300.0]
    assert LLMRouterService._latency_for(pid) == (300, 200.0)


def test_list_providers_injects_latency_and_keeps_stored_clean():
    pid = _add_provider()
    svc._latency_tracker[pid] = [50.0, 150.0]

    listed = LLMRouterService.list_providers()

    assert listed[0].last_latency_ms == 150
    assert listed[0].avg_latency_ms == 100.0
    # the stored object must stay clean — injection happens on a copy
    assert svc._providers[pid].last_latency_ms is None
    assert svc._providers[pid].avg_latency_ms is None


def test_get_provider_injects_latency():
    pid = _add_provider()
    svc._latency_tracker[pid] = [42.0]

    got = LLMRouterService.get_provider(pid)

    assert got.last_latency_ms == 42
    assert got.avg_latency_ms == 42.0


def test_provider_without_samples_exposes_none():
    pid = _add_provider()
    got = LLMRouterService.get_provider(pid)
    assert got.last_latency_ms is None
    assert got.avg_latency_ms is None
