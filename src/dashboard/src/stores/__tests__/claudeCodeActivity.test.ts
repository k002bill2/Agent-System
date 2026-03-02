/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, beforeEach, vi } from 'vitest'

vi.mock('../../services/apiClient', () => ({
  apiClient: {
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
    patch: vi.fn(),
    delete: vi.fn(),
  },
}))

import { useClaudeCodeActivityStore } from '../claudeCodeActivity'
import { apiClient } from '../../services/apiClient'

const mockApiClient = vi.mocked(apiClient)

// Mock EventSource
class MockEventSource {
  url: string
  listeners: Record<string, ((e: MessageEvent) => void)[]> = {}
  close = vi.fn()
  constructor(url: string) { this.url = url }
  addEventListener(event: string, handler: (e: MessageEvent) => void) {
    if (!this.listeners[event]) this.listeners[event] = []
    this.listeners[event].push(handler)
  }
}
// @ts-expect-error - Mock
global.EventSource = MockEventSource

function resetStore() {
  useClaudeCodeActivityStore.setState({
    dataSource: 'claude-code',
    activeSessionId: null,
    activities: [],
    activityTotalCount: 0,
    isLoadingActivity: false,
    hasMoreActivity: false,
    activityOffset: 0,
    tasks: {},
    rootTaskIds: [],
    isLoadingTasks: false,
    eventSource: null,
    error: null,
  })
}

describe('claudeCodeActivity store', () => {
  beforeEach(() => {
    resetStore()
    vi.clearAllMocks()
  })

  // ── Initial State ──────────────────────────────────────

  describe('initial state', () => {
    it('has claude-code as default data source', () => {
      expect(useClaudeCodeActivityStore.getState().dataSource).toBe('claude-code')
    })

    it('has no active session', () => {
      expect(useClaudeCodeActivityStore.getState().activeSessionId).toBeNull()
    })

    it('has empty activities', () => {
      expect(useClaudeCodeActivityStore.getState().activities).toEqual([])
    })

    it('has empty tasks', () => {
      expect(useClaudeCodeActivityStore.getState().tasks).toEqual({})
    })
  })

  // ── clearActivity ──────────────────────────────────────

  describe('clearActivity', () => {
    it('clears all activity state', () => {
      useClaudeCodeActivityStore.setState({
        activities: [{ id: '1' } as any],
        activityTotalCount: 10,
        hasMoreActivity: true,
        activityOffset: 50,
      })

      useClaudeCodeActivityStore.getState().clearActivity()

      const state = useClaudeCodeActivityStore.getState()
      expect(state.activities).toEqual([])
      expect(state.activityTotalCount).toBe(0)
      expect(state.hasMoreActivity).toBe(false)
      expect(state.activityOffset).toBe(0)
    })
  })

  // ── clearTasks ─────────────────────────────────────────

  describe('clearTasks', () => {
    it('clears all tasks state', () => {
      useClaudeCodeActivityStore.setState({
        tasks: { 't1': { id: 't1' } as any },
        rootTaskIds: ['t1'],
      })

      useClaudeCodeActivityStore.getState().clearTasks()

      expect(useClaudeCodeActivityStore.getState().tasks).toEqual({})
      expect(useClaudeCodeActivityStore.getState().rootTaskIds).toEqual([])
    })
  })

  // ── clearError ─────────────────────────────────────────

  describe('clearError', () => {
    it('clears error', () => {
      useClaudeCodeActivityStore.setState({ error: 'some error' })
      useClaudeCodeActivityStore.getState().clearError()
      expect(useClaudeCodeActivityStore.getState().error).toBeNull()
    })
  })

  // ── setDataSource ──────────────────────────────────────

  describe('setDataSource', () => {
    it('switches data source and clears data', () => {
      useClaudeCodeActivityStore.setState({
        activeSessionId: 's-1',
        activities: [{ id: '1' } as any],
        tasks: { t1: {} as any },
      })

      useClaudeCodeActivityStore.getState().setDataSource('dashboard')

      const state = useClaudeCodeActivityStore.getState()
      expect(state.dataSource).toBe('dashboard')
      expect(state.activeSessionId).toBeNull()
      expect(state.activities).toEqual([])
      expect(state.tasks).toEqual({})
    })
  })

  // ── fetchActivity ──────────────────────────────────────

  describe('fetchActivity', () => {
    it('fetches and stores activity events', async () => {
      const data = {
        events: [{ id: 'ev-1', type: 'message' }],
        total_count: 1,
        has_more: false,
        offset: 0,
      }
      mockApiClient.get.mockResolvedValueOnce(data)

      await useClaudeCodeActivityStore.getState().fetchActivity('s-1')

      const state = useClaudeCodeActivityStore.getState()
      expect(state.activities).toEqual(data.events)
      expect(state.activityTotalCount).toBe(1)
      expect(state.isLoadingActivity).toBe(false)
    })

    it('appends when append=true', async () => {
      useClaudeCodeActivityStore.setState({
        activities: [{ id: 'ev-1' } as any],
      })
      const data = {
        events: [{ id: 'ev-2' }],
        total_count: 2,
        has_more: false,
        offset: 1,
      }
      mockApiClient.get.mockResolvedValueOnce(data)

      await useClaudeCodeActivityStore.getState().fetchActivity('s-1', 1, true)

      expect(useClaudeCodeActivityStore.getState().activities).toHaveLength(2)
    })

    it('sets error on failure', async () => {
      mockApiClient.get.mockRejectedValueOnce(new Error('Failed to fetch activity'))

      await useClaudeCodeActivityStore.getState().fetchActivity('s-1')

      expect(useClaudeCodeActivityStore.getState().error).toBe('Failed to fetch activity')
    })
  })

  // ── fetchTasks ─────────────────────────────────────────

  describe('fetchTasks', () => {
    it('fetches and stores tasks', async () => {
      const data = {
        tasks: { 't1': { id: 't1', name: 'Task 1' } },
        root_task_ids: ['t1'],
      }
      mockApiClient.get.mockResolvedValueOnce(data)

      await useClaudeCodeActivityStore.getState().fetchTasks('s-1')

      const state = useClaudeCodeActivityStore.getState()
      expect(state.tasks).toEqual(data.tasks)
      expect(state.rootTaskIds).toEqual(['t1'])
      expect(state.isLoadingTasks).toBe(false)
    })

    it('sets error on failure', async () => {
      mockApiClient.get.mockRejectedValueOnce(new Error('Failed to fetch tasks'))

      await useClaudeCodeActivityStore.getState().fetchTasks('s-1')

      expect(useClaudeCodeActivityStore.getState().error).toBe('Failed to fetch tasks')
    })
  })

  // ── stopStreaming ──────────────────────────────────────

  describe('stopStreaming', () => {
    it('closes event source and sets to null', () => {
      const mockES = { close: vi.fn() }
      useClaudeCodeActivityStore.setState({ eventSource: mockES as any })

      useClaudeCodeActivityStore.getState().stopStreaming()

      expect(mockES.close).toHaveBeenCalled()
      expect(useClaudeCodeActivityStore.getState().eventSource).toBeNull()
    })

    it('does nothing if no event source', () => {
      useClaudeCodeActivityStore.getState().stopStreaming()
      expect(useClaudeCodeActivityStore.getState().eventSource).toBeNull()
    })
  })

  // ── startStreaming ─────────────────────────────────────

  describe('startStreaming', () => {
    it('creates EventSource with correct URL', () => {
      useClaudeCodeActivityStore.getState().startStreaming('s-1')

      const es = useClaudeCodeActivityStore.getState().eventSource as unknown as MockEventSource
      expect(es).not.toBeNull()
      expect(es.url).toContain('/api/claude-sessions/s-1/activity/stream')
    })

    it('closes existing event source before creating new', () => {
      const oldES = { close: vi.fn() }
      useClaudeCodeActivityStore.setState({ eventSource: oldES as any })

      useClaudeCodeActivityStore.getState().startStreaming('s-2')

      expect(oldES.close).toHaveBeenCalled()
    })
  })
})
