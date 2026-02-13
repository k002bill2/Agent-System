/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { useAuditStore } from '../audit'

const mockFetch = vi.fn()
global.fetch = mockFetch

function resetStore() {
  useAuditStore.setState({
    logs: [],
    total: 0,
    stats: null,
    isLoading: false,
    isLoadingStats: false,
    error: null,
    page: 0,
    pageSize: 20,
    filter: {},
  })
}

describe('audit store', () => {
  beforeEach(() => {
    resetStore()
    mockFetch.mockReset()
  })

  // ── Initial State ──────────────────────────────────────

  describe('initial state', () => {
    it('has empty logs', () => {
      expect(useAuditStore.getState().logs).toEqual([])
    })

    it('has zero total', () => {
      expect(useAuditStore.getState().total).toBe(0)
    })

    it('has null stats', () => {
      expect(useAuditStore.getState().stats).toBeNull()
    })

    it('has page 0 and pageSize 20', () => {
      expect(useAuditStore.getState().page).toBe(0)
      expect(useAuditStore.getState().pageSize).toBe(20)
    })

    it('has empty filter', () => {
      expect(useAuditStore.getState().filter).toEqual({})
    })
  })

  // ── fetchLogs ──────────────────────────────────────────

  describe('fetchLogs', () => {
    it('fetches and stores logs', async () => {
      const data = {
        logs: [{ id: 'log-1', action: 'create', status: 'success' }],
        total: 1,
      }
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(data),
      })

      await useAuditStore.getState().fetchLogs()

      const state = useAuditStore.getState()
      expect(state.logs).toEqual(data.logs)
      expect(state.total).toBe(1)
      expect(state.isLoading).toBe(false)
    })

    it('includes filter params in request', async () => {
      useAuditStore.setState({
        filter: { session_id: 's-1', action: 'tool_executed', status: 'success' },
      })
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ logs: [], total: 0 }),
      })

      await useAuditStore.getState().fetchLogs()

      const url = mockFetch.mock.calls[0][0] as string
      expect(url).toContain('session_id=s-1')
      expect(url).toContain('action=tool_executed')
      expect(url).toContain('status=success')
    })

    it('includes pagination params', async () => {
      useAuditStore.setState({ page: 2, pageSize: 10 })
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ logs: [], total: 0 }),
      })

      await useAuditStore.getState().fetchLogs()

      const url = mockFetch.mock.calls[0][0] as string
      expect(url).toContain('limit=10')
      expect(url).toContain('offset=20')
    })

    it('sets error on failure', async () => {
      mockFetch.mockResolvedValueOnce({ ok: false })

      await useAuditStore.getState().fetchLogs()

      expect(useAuditStore.getState().error).toContain('Failed to fetch audit logs')
      expect(useAuditStore.getState().isLoading).toBe(false)
    })

    it('handles network error', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Network failed'))

      await useAuditStore.getState().fetchLogs()

      expect(useAuditStore.getState().error).toBe('Network failed')
    })
  })

  // ── fetchStats ─────────────────────────────────────────

  describe('fetchStats', () => {
    it('fetches and stores stats from API', async () => {
      const statsData = {
        total_actions: 100,
        tool_executions: 50,
        approvals: 10,
        errors: 5,
        actions_by_type: {},
        actions_by_status: {},
        recent_trend: [],
      }
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(statsData),
      })

      await useAuditStore.getState().fetchStats()

      expect(useAuditStore.getState().stats).toEqual(statsData)
      expect(useAuditStore.getState().isLoadingStats).toBe(false)
    })

    it('passes sessionId as query param', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({}),
      })

      await useAuditStore.getState().fetchStats('session-123')

      const url = mockFetch.mock.calls[0][0] as string
      expect(url).toContain('session_id=session-123')
    })

    it('calculates fallback stats on API failure', async () => {
      useAuditStore.setState({
        logs: [
          { id: '1', action: 'tool_executed', status: 'success' } as any,
          { id: '2', action: 'approval_granted', status: 'success' } as any,
          { id: '3', action: 'create', status: 'failed' } as any,
        ],
        total: 3,
      })
      mockFetch.mockResolvedValueOnce({ ok: false })

      await useAuditStore.getState().fetchStats()

      const stats = useAuditStore.getState().stats!
      expect(stats.total_actions).toBe(3)
      expect(stats.tool_executions).toBe(1)
      expect(stats.approvals).toBe(1)
      expect(stats.errors).toBe(1)
      expect(stats.isLoadingStats).toBeUndefined()
    })

    it('calculates fallback stats on network error', async () => {
      useAuditStore.setState({ logs: [], total: 0 })
      mockFetch.mockRejectedValueOnce(new Error('Network'))

      await useAuditStore.getState().fetchStats()

      const stats = useAuditStore.getState().stats!
      expect(stats.total_actions).toBe(0)
      expect(stats.tool_executions).toBe(0)
    })
  })

  // ── setFilter ──────────────────────────────────────────

  describe('setFilter', () => {
    it('merges filter and resets page to 0', async () => {
      useAuditStore.setState({ page: 5 })
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ logs: [], total: 0 }),
      })

      useAuditStore.getState().setFilter({ action: 'create' })

      expect(useAuditStore.getState().filter.action).toBe('create')
      expect(useAuditStore.getState().page).toBe(0)
    })

    it('merges with existing filter', async () => {
      useAuditStore.setState({ filter: { action: 'create' } })
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ logs: [], total: 0 }),
      })

      useAuditStore.getState().setFilter({ status: 'success' })

      const filter = useAuditStore.getState().filter
      expect(filter.action).toBe('create')
      expect(filter.status).toBe('success')
    })
  })

  // ── clearFilter ────────────────────────────────────────

  describe('clearFilter', () => {
    it('clears all filters and resets page', async () => {
      useAuditStore.setState({ filter: { action: 'create', status: 'success' }, page: 3 })
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ logs: [], total: 0 }),
      })

      useAuditStore.getState().clearFilter()

      expect(useAuditStore.getState().filter).toEqual({})
      expect(useAuditStore.getState().page).toBe(0)
    })
  })

  // ── setPage ────────────────────────────────────────────

  describe('setPage', () => {
    it('sets page and triggers fetchLogs', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ logs: [], total: 0 }),
      })

      useAuditStore.getState().setPage(3)

      expect(useAuditStore.getState().page).toBe(3)
      expect(mockFetch).toHaveBeenCalled()
    })
  })

  // ── refresh ────────────────────────────────────────────

  describe('refresh', () => {
    it('calls fetchLogs and fetchStats', async () => {
      mockFetch
        .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({ logs: [], total: 0 }) })
        .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({}) })

      await useAuditStore.getState().refresh()

      expect(mockFetch).toHaveBeenCalledTimes(2)
    })
  })
})
