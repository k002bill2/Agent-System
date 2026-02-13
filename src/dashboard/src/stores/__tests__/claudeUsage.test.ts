import { describe, it, expect, beforeEach, vi } from 'vitest'
import { useClaudeUsageStore } from '../claudeUsage'

const mockFetch = vi.fn()
global.fetch = mockFetch

function resetStore() {
  useClaudeUsageStore.setState({
    usage: null,
    isLoading: false,
    error: null,
    lastFetched: null,
  })
}

describe('claudeUsage store', () => {
  beforeEach(() => {
    resetStore()
    mockFetch.mockReset()
  })

  // ── Initial State ──────────────────────────────────────

  describe('initial state', () => {
    it('has null usage', () => {
      expect(useClaudeUsageStore.getState().usage).toBeNull()
    })

    it('is not loading', () => {
      expect(useClaudeUsageStore.getState().isLoading).toBe(false)
    })

    it('has no error', () => {
      expect(useClaudeUsageStore.getState().error).toBeNull()
    })

    it('has null lastFetched', () => {
      expect(useClaudeUsageStore.getState().lastFetched).toBeNull()
    })
  })

  // ── clearError ─────────────────────────────────────────

  describe('clearError', () => {
    it('clears error', () => {
      useClaudeUsageStore.setState({ error: 'some error' })
      useClaudeUsageStore.getState().clearError()
      expect(useClaudeUsageStore.getState().error).toBeNull()
    })
  })

  // ── fetchUsage ─────────────────────────────────────────

  describe('fetchUsage', () => {
    it('fetches and stores usage data', async () => {
      const usageData = {
        total_cost: 12.5,
        total_tokens: 100000,
        sessions: [],
      }
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(usageData),
      })

      await useClaudeUsageStore.getState().fetchUsage()

      const state = useClaudeUsageStore.getState()
      expect(state.usage).toEqual(usageData)
      expect(state.isLoading).toBe(false)
      expect(state.lastFetched).toBeInstanceOf(Date)
      expect(state.error).toBeNull()
    })

    it('sets error on HTTP failure with detail', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        statusText: 'Internal Server Error',
        json: () => Promise.resolve({ detail: 'Service unavailable' }),
      })

      await useClaudeUsageStore.getState().fetchUsage()

      const state = useClaudeUsageStore.getState()
      expect(state.error).toBe('Service unavailable')
      expect(state.isLoading).toBe(false)
      expect(state.usage).toBeNull()
    })

    it('falls back to statusText when no detail', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        statusText: 'Not Found',
        json: () => Promise.reject(new Error('parse error')),
      })

      await useClaudeUsageStore.getState().fetchUsage()

      expect(useClaudeUsageStore.getState().error).toContain('Not Found')
    })

    it('sets error on network failure', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Network error'))

      await useClaudeUsageStore.getState().fetchUsage()

      expect(useClaudeUsageStore.getState().error).toBe('Network error')
      expect(useClaudeUsageStore.getState().isLoading).toBe(false)
    })

    it('prevents duplicate requests while loading', async () => {
      let resolveFirst: (v: unknown) => void
      mockFetch.mockReturnValueOnce(
        new Promise(resolve => { resolveFirst = resolve })
      )

      const promise1 = useClaudeUsageStore.getState().fetchUsage()
      expect(useClaudeUsageStore.getState().isLoading).toBe(true)

      // Second call should be skipped
      const promise2 = useClaudeUsageStore.getState().fetchUsage()

      resolveFirst!({
        ok: true,
        json: () => Promise.resolve({ total_cost: 0 }),
      })

      await promise1
      await promise2

      expect(mockFetch).toHaveBeenCalledTimes(1)
    })

    it('sets isLoading during fetch', async () => {
      let resolvePromise: (v: unknown) => void
      mockFetch.mockReturnValueOnce(
        new Promise(resolve => { resolvePromise = resolve })
      )

      const promise = useClaudeUsageStore.getState().fetchUsage()
      expect(useClaudeUsageStore.getState().isLoading).toBe(true)

      resolvePromise!({
        ok: true,
        json: () => Promise.resolve({ total_cost: 0 }),
      })
      await promise

      expect(useClaudeUsageStore.getState().isLoading).toBe(false)
    })
  })
})
