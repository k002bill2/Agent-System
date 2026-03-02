/**
 * External Usage Store Tests
 *
 * Uses apiClient mock instead of raw fetch mock.
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

const mockGet = vi.fn()
const mockPost = vi.fn()

vi.mock('../../services/apiClient', () => ({
  apiClient: {
    get: (...args: unknown[]) => mockGet(...args),
    post: (...args: unknown[]) => mockPost(...args),
  },
}))

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
    mockGet.mockReset()
    mockPost.mockReset()
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
      mockGet.mockResolvedValueOnce(mockSummaryResponse)

      await useExternalUsageStore.getState().fetchSummary()

      const state = useExternalUsageStore.getState()
      expect(state.summary).toEqual(mockSummaryResponse)
      expect(state.isLoading).toBe(false)
      expect(state.error).toBeNull()
      expect(state.lastFetched).toBeInstanceOf(Date)
    })

    it('sets isLoading to true during fetch', async () => {
      let resolvePromise!: (value: unknown) => void
      mockGet.mockReturnValueOnce(
        new Promise((resolve) => {
          resolvePromise = resolve
        })
      )

      const fetchPromise = useExternalUsageStore.getState().fetchSummary()
      expect(useExternalUsageStore.getState().isLoading).toBe(true)

      resolvePromise(mockSummaryResponse)
      await fetchPromise
      expect(useExternalUsageStore.getState().isLoading).toBe(false)
    })

    it('builds URL with startTime parameter', async () => {
      mockGet.mockResolvedValueOnce(mockSummaryResponse)

      await useExternalUsageStore.getState().fetchSummary('2025-01-01')

      const calledUrl = mockGet.mock.calls[0][0] as string
      expect(calledUrl).toContain('start_time=2025-01-01')
    })

    it('builds URL with endTime parameter', async () => {
      mockGet.mockResolvedValueOnce(mockSummaryResponse)

      await useExternalUsageStore.getState().fetchSummary(undefined, '2025-01-31')

      const calledUrl = mockGet.mock.calls[0][0] as string
      expect(calledUrl).toContain('end_time=2025-01-31')
    })

    it('builds URL with provider list', async () => {
      mockGet.mockResolvedValueOnce(mockSummaryResponse)

      await useExternalUsageStore.getState().fetchSummary(undefined, undefined, ['openai', 'anthropic'])

      const calledUrl = mockGet.mock.calls[0][0] as string
      expect(calledUrl).toContain('providers=openai')
      expect(calledUrl).toContain('providers=anthropic')
    })

    it('builds URL with all parameters', async () => {
      mockGet.mockResolvedValueOnce(mockSummaryResponse)

      await useExternalUsageStore.getState().fetchSummary('2025-01-01', '2025-01-31', ['openai'])

      const calledUrl = mockGet.mock.calls[0][0] as string
      expect(calledUrl).toContain('start_time=2025-01-01')
      expect(calledUrl).toContain('end_time=2025-01-31')
      expect(calledUrl).toContain('providers=openai')
    })

    it('sets error on failure', async () => {
      mockGet.mockRejectedValueOnce(new Error('Request failed'))

      await useExternalUsageStore.getState().fetchSummary()

      const state = useExternalUsageStore.getState()
      expect(state.error).toBe('Request failed')
      expect(state.isLoading).toBe(false)
      expect(state.summary).toBeNull()
    })

    it('clears error on successful fetch', async () => {
      useExternalUsageStore.setState({ error: 'previous error' })
      mockGet.mockResolvedValueOnce(mockSummaryResponse)

      await useExternalUsageStore.getState().fetchSummary()

      expect(useExternalUsageStore.getState().error).toBeNull()
    })
  })

  // ── fetchProviders ─────────────────────────────────────

  describe('fetchProviders', () => {
    it('fetches and stores providers', async () => {
      mockGet.mockResolvedValueOnce([mockProvider])

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
      mockGet.mockResolvedValueOnce(providers)

      await useExternalUsageStore.getState().fetchProviders()

      expect(useExternalUsageStore.getState().providers).toHaveLength(2)
    })

    it('sets error on failure', async () => {
      mockGet.mockRejectedValueOnce(new Error('Forbidden'))

      await useExternalUsageStore.getState().fetchProviders()

      expect(useExternalUsageStore.getState().error).toBe('Forbidden')
    })
  })

  // ── syncProvider ───────────────────────────────────────

  describe('syncProvider', () => {
    it('syncs all providers and refreshes summary', async () => {
      const syncResult = { synced_records: 42 }
      mockPost.mockResolvedValueOnce(syncResult)
      mockGet.mockResolvedValueOnce(mockSummaryResponse)

      const result = await useExternalUsageStore.getState().syncProvider()

      expect(result.synced_records).toBe(42)
      expect(useExternalUsageStore.getState().isLoading).toBe(false)
    })

    it('syncs specific provider', async () => {
      mockPost.mockResolvedValueOnce({ synced_records: 10 })
      mockGet.mockResolvedValueOnce(mockSummaryResponse)

      const result = await useExternalUsageStore.getState().syncProvider('openai')

      expect(result.synced_records).toBe(10)

      // POST body should have provider
      const postBody = mockPost.mock.calls[0][1]
      expect(postBody.provider).toBe('openai')
    })

    it('posts empty body when no provider specified', async () => {
      mockPost.mockResolvedValueOnce({ synced_records: 0 })
      mockGet.mockResolvedValueOnce(mockSummaryResponse)

      await useExternalUsageStore.getState().syncProvider()

      const postBody = mockPost.mock.calls[0][1]
      expect(postBody).toEqual({})
    })

    it('sets error and returns 0 on failure', async () => {
      mockPost.mockRejectedValueOnce(new Error('Service unavailable'))

      const result = await useExternalUsageStore.getState().syncProvider()

      expect(result.synced_records).toBe(0)
      expect(useExternalUsageStore.getState().error).toBe('Service unavailable')
      expect(useExternalUsageStore.getState().isLoading).toBe(false)
    })

    it('sets isLoading to true during sync', async () => {
      let resolvePromise!: (value: unknown) => void
      mockPost.mockReturnValueOnce(
        new Promise((resolve) => {
          resolvePromise = resolve
        })
      )

      const syncPromise = useExternalUsageStore.getState().syncProvider()
      expect(useExternalUsageStore.getState().isLoading).toBe(true)

      resolvePromise({ synced_records: 0 })
      // Need to also mock the fetchSummary call that happens after sync
      mockGet.mockResolvedValueOnce(mockSummaryResponse)
      await syncPromise
      expect(useExternalUsageStore.getState().isLoading).toBe(false)
    })
  })
})
