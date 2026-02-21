/**
 * External Usage Store Tests
 *
 * ExternalProviderConfig, UnifiedUsageRecord, UsageSummary 등
 * 외부 LLM 사용량 데이터를 관리하는 스토어 테스트.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'
import {
  useExternalUsageStore,
  type ExternalProviderConfig,
  type ExternalUsageSummaryResponse,
} from '../externalUsage'

// ─────────────────────────────────────────────────────────────
// Mock Setup
// ─────────────────────────────────────────────────────────────

const mockFetch = vi.fn()
global.fetch = mockFetch

// authFetch는 내부적으로 global.fetch 호출
vi.mock('../auth', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../auth')>()
  return {
    ...actual,
    authFetch: vi.fn(async (url: string, options?: RequestInit) => {
      return mockFetch(url, options)
    }),
  }
})

// ─────────────────────────────────────────────────────────────
// Test Fixtures
// ─────────────────────────────────────────────────────────────

const mockProvider: ExternalProviderConfig = {
  provider: 'openai',
  enabled: true,
  api_key_masked: 'sk-****1234',
  org_id: 'org-123',
  last_sync_at: '2025-01-01T00:00:00Z',
  error_message: null,
}

const mockSummaryResponse: ExternalUsageSummaryResponse = {
  providers: [
    {
      provider: 'openai',
      period_start: '2025-01-01T00:00:00Z',
      period_end: '2025-01-31T23:59:59Z',
      total_input_tokens: 10000,
      total_output_tokens: 5000,
      total_cost_usd: 0.5,
      total_requests: 100,
      model_breakdown: { 'gpt-4': 60, 'gpt-3.5': 40 },
      member_breakdown: { 'user@example.com': 100 },
    },
  ],
  total_cost_usd: 0.5,
  records: [],
  period_start: '2025-01-01T00:00:00Z',
  period_end: '2025-01-31T23:59:59Z',
}

// ─────────────────────────────────────────────────────────────
// Store Reset Helper
// ─────────────────────────────────────────────────────────────

function resetStore() {
  useExternalUsageStore.setState({
    summary: null,
    providers: [],
    isLoading: false,
    error: null,
    lastFetched: null,
  })
}

// ─────────────────────────────────────────────────────────────
// Tests
// ─────────────────────────────────────────────────────────────

describe('externalUsage store', () => {
  beforeEach(() => {
    resetStore()
    mockFetch.mockReset()
  })

  // ── Initial State ──────────────────────────────────────

  describe('initial state', () => {
    it('has null summary', () => {
      expect(useExternalUsageStore.getState().summary).toBeNull()
    })

    it('has empty providers', () => {
      expect(useExternalUsageStore.getState().providers).toEqual([])
    })

    it('is not loading', () => {
      expect(useExternalUsageStore.getState().isLoading).toBe(false)
    })

    it('has null error', () => {
      expect(useExternalUsageStore.getState().error).toBeNull()
    })

    it('has null lastFetched', () => {
      expect(useExternalUsageStore.getState().lastFetched).toBeNull()
    })
  })

  // ── fetchSummary ───────────────────────────────────────

  describe('fetchSummary', () => {
    it('fetches summary without parameters', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockSummaryResponse),
      })

      await useExternalUsageStore.getState().fetchSummary()

      const state = useExternalUsageStore.getState()
      expect(state.summary).toEqual(mockSummaryResponse)
      expect(state.isLoading).toBe(false)
      expect(state.error).toBeNull()
      expect(state.lastFetched).toBeInstanceOf(Date)
    })

    it('sets isLoading to true during fetch', async () => {
      let resolvePromise!: (value: unknown) => void
      mockFetch.mockReturnValueOnce(
        new Promise((resolve) => {
          resolvePromise = resolve
        })
      )

      const fetchPromise = useExternalUsageStore.getState().fetchSummary()
      expect(useExternalUsageStore.getState().isLoading).toBe(true)

      resolvePromise({ ok: true, json: () => Promise.resolve(mockSummaryResponse) })
      await fetchPromise
      expect(useExternalUsageStore.getState().isLoading).toBe(false)
    })

    it('builds URL with startTime parameter', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockSummaryResponse),
      })

      await useExternalUsageStore.getState().fetchSummary('2025-01-01')

      const calledUrl = mockFetch.mock.calls[0][0] as string
      expect(calledUrl).toContain('start_time=2025-01-01')
    })

    it('builds URL with endTime parameter', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockSummaryResponse),
      })

      await useExternalUsageStore.getState().fetchSummary(undefined, '2025-01-31')

      const calledUrl = mockFetch.mock.calls[0][0] as string
      expect(calledUrl).toContain('end_time=2025-01-31')
    })

    it('builds URL with provider list', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockSummaryResponse),
      })

      await useExternalUsageStore.getState().fetchSummary(undefined, undefined, ['openai', 'anthropic'])

      const calledUrl = mockFetch.mock.calls[0][0] as string
      expect(calledUrl).toContain('providers=openai')
      expect(calledUrl).toContain('providers=anthropic')
    })

    it('builds URL with all parameters', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockSummaryResponse),
      })

      await useExternalUsageStore.getState().fetchSummary('2025-01-01', '2025-01-31', ['openai'])

      const calledUrl = mockFetch.mock.calls[0][0] as string
      expect(calledUrl).toContain('start_time=2025-01-01')
      expect(calledUrl).toContain('end_time=2025-01-31')
      expect(calledUrl).toContain('providers=openai')
    })

    it('sets error on HTTP failure', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
      })

      await useExternalUsageStore.getState().fetchSummary()

      const state = useExternalUsageStore.getState()
      expect(state.error).toContain('HTTP 500')
      expect(state.isLoading).toBe(false)
      expect(state.summary).toBeNull()
    })

    it('sets error on network failure', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Network error'))

      await useExternalUsageStore.getState().fetchSummary()

      const state = useExternalUsageStore.getState()
      expect(state.error).toBe('Network error')
      expect(state.isLoading).toBe(false)
    })

    it('clears error on successful fetch', async () => {
      useExternalUsageStore.setState({ error: 'previous error' })
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockSummaryResponse),
      })

      await useExternalUsageStore.getState().fetchSummary()

      expect(useExternalUsageStore.getState().error).toBeNull()
    })
  })

  // ── fetchProviders ─────────────────────────────────────

  describe('fetchProviders', () => {
    it('fetches and stores providers', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve([mockProvider]),
      })

      await useExternalUsageStore.getState().fetchProviders()

      const state = useExternalUsageStore.getState()
      expect(state.providers).toHaveLength(1)
      expect(state.providers[0]).toEqual(mockProvider)
    })

    it('fetches multiple providers', async () => {
      const providers = [
        mockProvider,
        { ...mockProvider, provider: 'anthropic', enabled: false },
      ]
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(providers),
      })

      await useExternalUsageStore.getState().fetchProviders()

      expect(useExternalUsageStore.getState().providers).toHaveLength(2)
    })

    it('sets error on HTTP failure', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 403,
      })

      await useExternalUsageStore.getState().fetchProviders()

      expect(useExternalUsageStore.getState().error).toContain('HTTP 403')
    })

    it('sets error on network failure', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Connection refused'))

      await useExternalUsageStore.getState().fetchProviders()

      expect(useExternalUsageStore.getState().error).toBe('Connection refused')
    })
  })

  // ── syncProvider ───────────────────────────────────────

  describe('syncProvider', () => {
    it('syncs all providers and refreshes summary', async () => {
      const syncResult = { synced_records: 42 }
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve(syncResult),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve(mockSummaryResponse),
        })

      const result = await useExternalUsageStore.getState().syncProvider()

      expect(result.synced_records).toBe(42)
      expect(useExternalUsageStore.getState().isLoading).toBe(false)
    })

    it('syncs specific provider', async () => {
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ synced_records: 10 }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve(mockSummaryResponse),
        })

      const result = await useExternalUsageStore.getState().syncProvider('openai')

      expect(result.synced_records).toBe(10)

      // POST body should have provider
      const postBody = JSON.parse(mockFetch.mock.calls[0][1]?.body as string)
      expect(postBody.provider).toBe('openai')
    })

    it('posts empty body when no provider specified', async () => {
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ synced_records: 0 }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve(mockSummaryResponse),
        })

      await useExternalUsageStore.getState().syncProvider()

      const postBody = JSON.parse(mockFetch.mock.calls[0][1]?.body as string)
      expect(postBody).toEqual({})
    })

    it('sets error and returns 0 on HTTP failure', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 503,
      })

      const result = await useExternalUsageStore.getState().syncProvider()

      expect(result.synced_records).toBe(0)
      expect(useExternalUsageStore.getState().error).toContain('HTTP 503')
      expect(useExternalUsageStore.getState().isLoading).toBe(false)
    })

    it('sets error and returns 0 on network failure', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Timeout'))

      const result = await useExternalUsageStore.getState().syncProvider()

      expect(result.synced_records).toBe(0)
      expect(useExternalUsageStore.getState().error).toBe('Timeout')
      expect(useExternalUsageStore.getState().isLoading).toBe(false)
    })

    it('sets isLoading to true during sync', async () => {
      let resolvePromise!: (value: unknown) => void
      mockFetch.mockReturnValueOnce(
        new Promise((resolve) => {
          resolvePromise = resolve
        })
      )

      const syncPromise = useExternalUsageStore.getState().syncProvider()
      expect(useExternalUsageStore.getState().isLoading).toBe(true)

      resolvePromise({ ok: false, status: 500 })
      await syncPromise
      expect(useExternalUsageStore.getState().isLoading).toBe(false)
    })
  })
})
