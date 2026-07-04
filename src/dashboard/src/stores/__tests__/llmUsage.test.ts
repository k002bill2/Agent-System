import { beforeEach, describe, expect, it, vi } from 'vitest'

import { useLLMUsageStore } from '../llmUsage'

const { mockGet } = vi.hoisted(() => ({
  mockGet: vi.fn(),
}))

vi.mock('@/services/apiClient', () => ({
  apiClient: {
    get: mockGet,
  },
}))

const summary = {
  period_start: '2026-07-01T00:00:00Z',
  period_end: '2026-07-02T00:00:00Z',
  total_requests: 3,
  total_input_tokens: 100,
  total_output_tokens: 50,
  total_tokens: 150,
  estimated_cost_usd: 0,
  provider_breakdown: {
    codex_cli: { total_requests: 2, total_input_tokens: 80, total_output_tokens: 40, total_tokens: 120, estimated_cost_usd: 0 },
    openai: { total_requests: 1, total_input_tokens: 20, total_output_tokens: 10, total_tokens: 30, estimated_cost_usd: 0.01 },
  },
  source_breakdown: {
    playground: { total_requests: 1, total_input_tokens: 30, total_output_tokens: 10, total_tokens: 40, estimated_cost_usd: 0 },
  },
  member_breakdown: {},
  organization_breakdown: {},
  mode_breakdown: {
    cli: { total_requests: 2, total_input_tokens: 80, total_output_tokens: 40, total_tokens: 120, estimated_cost_usd: 0 },
    api: { total_requests: 1, total_input_tokens: 20, total_output_tokens: 10, total_tokens: 30, estimated_cost_usd: 0.01 },
  },
  model_breakdown: {},
  status_breakdown: {},
}

describe('llmUsage store', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    useLLMUsageStore.setState({
      summary: null,
      isLoading: false,
      error: null,
      lastFetched: null,
    })
  })

  it('fetches summary from the internal LLM usage API', async () => {
    mockGet.mockResolvedValueOnce(summary)

    await useLLMUsageStore.getState().fetchSummary()

    expect(mockGet).toHaveBeenCalledWith('/api/llm-usage/summary')
    expect(useLLMUsageStore.getState().summary?.total_tokens).toBe(150)
    expect(useLLMUsageStore.getState().isLoading).toBe(false)
    expect(useLLMUsageStore.getState().error).toBeNull()
    expect(useLLMUsageStore.getState().lastFetched).toBeInstanceOf(Date)
  })

  it('passes filters as query parameters', async () => {
    mockGet.mockResolvedValueOnce(summary)

    await useLLMUsageStore.getState().fetchSummary({
      mode: 'cli',
      source: 'playground',
      projectId: 'project-1',
    })

    expect(mockGet).toHaveBeenCalledWith(
      '/api/llm-usage/summary?mode=cli&source=playground&project_id=project-1',
    )
  })

  it('stores errors from failed requests', async () => {
    mockGet.mockRejectedValueOnce(new Error('failed'))

    await useLLMUsageStore.getState().fetchSummary()

    expect(useLLMUsageStore.getState().summary).toBeNull()
    expect(useLLMUsageStore.getState().isLoading).toBe(false)
    expect(useLLMUsageStore.getState().error).toBe('failed')
  })
})
