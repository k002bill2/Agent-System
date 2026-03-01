import { describe, it, expect, beforeEach, vi } from 'vitest'
import { useClaudeUsageStore } from '../claudeUsage'

// Mock apiClient
const mockGet = vi.fn()
vi.mock('../../services/apiClient', () => ({
  apiClient: {
    get: (...args: unknown[]) => mockGet(...args),
  },
}))

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
    mockGet.mockReset()
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
      mockGet.mockResolvedValueOnce(usageData)

      await useClaudeUsageStore.getState().fetchUsage()

      const state = useClaudeUsageStore.getState()
      expect(state.usage).toEqual(usageData)
      expect(state.isLoading).toBe(false)
      expect(state.lastFetched).toBeInstanceOf(Date)
      expect(state.error).toBeNull()
    })

    it('sets error on failure', async () => {
      mockGet.mockRejectedValueOnce(new Error('Network error'))

      await useClaudeUsageStore.getState().fetchUsage()

      expect(useClaudeUsageStore.getState().error).toBe('Network error')
      expect(useClaudeUsageStore.getState().isLoading).toBe(false)
    })

    it('prevents duplicate requests while loading', async () => {
      let resolveFirst: (v: unknown) => void
      mockGet.mockReturnValueOnce(
        new Promise(resolve => { resolveFirst = resolve })
      )

      const promise1 = useClaudeUsageStore.getState().fetchUsage()
      expect(useClaudeUsageStore.getState().isLoading).toBe(true)

      // Second call should be skipped
      const promise2 = useClaudeUsageStore.getState().fetchUsage()

      resolveFirst!({ total_cost: 0 })

      await promise1
      await promise2

      expect(mockGet).toHaveBeenCalledTimes(1)
    })

    it('sets isLoading during fetch', async () => {
      let resolvePromise: (v: unknown) => void
      mockGet.mockReturnValueOnce(
        new Promise(resolve => { resolvePromise = resolve })
      )

      const promise = useClaudeUsageStore.getState().fetchUsage()
      expect(useClaudeUsageStore.getState().isLoading).toBe(true)

      resolvePromise!({ total_cost: 0 })
      await promise

      expect(useClaudeUsageStore.getState().isLoading).toBe(false)
    })

    it('calls apiClient.get with correct URL', async () => {
      mockGet.mockResolvedValueOnce({})

      await useClaudeUsageStore.getState().fetchUsage()

      expect(mockGet).toHaveBeenCalledWith('/api/usage')
    })
  })
})
