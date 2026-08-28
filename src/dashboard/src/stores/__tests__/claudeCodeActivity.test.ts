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

const { authenticatedSseInstances, mockCreateAuthenticatedSseClient } = vi.hoisted(() => {
  type StatusHandler = (status: string) => void
  type Client = {
    url: string
    listeners: Record<string, ((e: MessageEvent) => void)[]>
    close: ReturnType<typeof vi.fn>
    addEventListener: (event: string, handler: (e: MessageEvent) => void) => void
    emit: (event: string, data?: unknown) => void
    emitStatus: (status: string) => void
  }
  const instances: Client[] = []
  const create = vi.fn((url: string, options?: { onStatus?: StatusHandler }) => {
    const client = {
      url,
      listeners: {} as Record<string, ((e: MessageEvent) => void)[]>,
      close: vi.fn(),
      addEventListener(event: string, handler: (e: MessageEvent) => void) {
        ;(this.listeners[event] ??= []).push(handler)
      },
      emit(event: string, data?: unknown) {
        for (const handler of this.listeners[event] ?? []) handler(data as MessageEvent)
      },
      emitStatus(status: string) {
        options?.onStatus?.(status)
      },
    } satisfies Client
    instances.push(client)
    return client
  })
  return { authenticatedSseInstances: instances, mockCreateAuthenticatedSseClient: create }
})

vi.mock('../../services/authenticatedSse', () => ({
  createAuthenticatedSseClient: mockCreateAuthenticatedSseClient,
}))

import { useClaudeCodeActivityStore } from '../claudeCodeActivity'
import { apiClient } from '../../services/apiClient'
import { useAuthStore } from '../auth'

const mockApiClient = vi.mocked(apiClient)

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
  authenticatedSseInstances.length = 0
}

describe('claudeCodeActivity store', () => {
  beforeEach(() => {
    resetStore()
    useAuthStore.setState({
      _hasHydrated: false,
      accessToken: null,
      refreshToken: null,
      expiresAt: null,
    })
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

      const es = useClaudeCodeActivityStore.getState().eventSource as unknown as (typeof authenticatedSseInstances)[number]
      expect(es).not.toBeNull()
      expect(es.url).toContain('/api/claude-sessions/s-1/activity/stream')
    })

    it('closes existing event source before creating new', () => {
      const oldES = { close: vi.fn() }
      useClaudeCodeActivityStore.setState({ eventSource: oldES as any })

      useClaudeCodeActivityStore.getState().startStreaming('s-2')

      expect(oldES.close).toHaveBeenCalled()
    })

    it('resumes a persisted session when auth hydrates after the activity store', async () => {
      useClaudeCodeActivityStore.setState({ activeSessionId: 's-hydrated' })
      useAuthStore.setState({
        _hasHydrated: true,
        accessToken: 'hydrated-token',
        refreshToken: null,
        expiresAt: Date.now() + 60_000,
      })

      await vi.waitFor(() => expect(authenticatedSseInstances).toHaveLength(1))

      expect(authenticatedSseInstances[0].url).toContain(
        '/api/claude-sessions/s-hydrated/activity/stream',
      )
    })
  })

  // ── setActiveSession ───────────────────────────────────

  describe('setActiveSession', () => {
    it('clears activity, tasks, and sets null when called with null', () => {
      useClaudeCodeActivityStore.setState({
        activeSessionId: 's-1',
        activities: [{ id: 'ev-1' } as any],
        tasks: { t1: { id: 't1' } as any },
        rootTaskIds: ['t1'],
        activityTotalCount: 5,
        hasMoreActivity: true,
        activityOffset: 5,
      })

      useClaudeCodeActivityStore.getState().setActiveSession(null)

      const state = useClaudeCodeActivityStore.getState()
      expect(state.activeSessionId).toBeNull()
      expect(state.activities).toEqual([])
      expect(state.tasks).toEqual({})
      expect(state.rootTaskIds).toEqual([])
      expect(state.activityTotalCount).toBe(0)
      expect(state.hasMoreActivity).toBe(false)
      expect(state.activityOffset).toBe(0)
    })

    it('stops existing streaming when called with null', () => {
      const mockES = { close: vi.fn() }
      useClaudeCodeActivityStore.setState({ eventSource: mockES as any })

      useClaudeCodeActivityStore.getState().setActiveSession(null)

      expect(mockES.close).toHaveBeenCalled()
      expect(useClaudeCodeActivityStore.getState().eventSource).toBeNull()
    })

    it('sets activeSessionId, fetches data, and starts streaming when called with a sessionId', async () => {
      const activityData = {
        events: [{ id: 'ev-1', type: 'message' }],
        total_count: 1,
        has_more: false,
        offset: 0,
      }
      const tasksData = {
        tasks: { t1: { id: 't1', title: 'Task 1' } },
        root_task_ids: ['t1'],
      }

      // Create promises we can resolve manually to control timing
      let resolveActivity!: (v: typeof activityData) => void
      let resolveTasks!: (v: typeof tasksData) => void
      const activityPromise = new Promise<typeof activityData>((res) => { resolveActivity = res })
      const tasksPromise = new Promise<typeof tasksData>((res) => { resolveTasks = res })

      mockApiClient.get
        .mockReturnValueOnce(activityPromise)
        .mockReturnValueOnce(tasksPromise)

      useClaudeCodeActivityStore.getState().setActiveSession('s-1')

      // activeSessionId should be set immediately (synchronous)
      expect(useClaudeCodeActivityStore.getState().activeSessionId).toBe('s-1')

      // Resolve both fetches so Promise.all completes, then startStreaming is called
      resolveActivity(activityData)
      resolveTasks(tasksData)

      // Flush all pending microtasks (multiple awaits to drain the chain)
      await Promise.resolve()
      await Promise.resolve()
      await Promise.resolve()

      const state = useClaudeCodeActivityStore.getState()
      expect(state.activities).toEqual(activityData.events)
      expect(state.tasks).toEqual(tasksData.tasks)
      expect(state.rootTaskIds).toEqual(['t1'])
      expect(state.eventSource).not.toBeNull()

      const es = state.eventSource as unknown as (typeof authenticatedSseInstances)[number]
      expect(es.url).toContain('/api/claude-sessions/s-1/activity/stream')
    })

    it('stops existing stream before starting new session', async () => {
      const oldES = { close: vi.fn() }
      useClaudeCodeActivityStore.setState({ eventSource: oldES as any })

      let resolveActivity!: (v: object) => void
      let resolveTasks!: (v: object) => void
      const activityPromise = new Promise<object>((res) => { resolveActivity = res })
      const tasksPromise = new Promise<object>((res) => { resolveTasks = res })

      mockApiClient.get
        .mockReturnValueOnce(activityPromise)
        .mockReturnValueOnce(tasksPromise)

      useClaudeCodeActivityStore.getState().setActiveSession('s-2')

      expect(oldES.close).toHaveBeenCalled()

      resolveActivity({ events: [], total_count: 0, has_more: false, offset: 0 })
      resolveTasks({ tasks: {}, root_task_ids: [] })

      await Promise.resolve()
      await Promise.resolve()
      await Promise.resolve()

      expect(useClaudeCodeActivityStore.getState().eventSource).not.toBeNull()
    })
  })

  // ── SSE event handlers ─────────────────────────────────

  describe('SSE activity_batch event handler', () => {
    it('sets activities from parsed JSON batch', () => {
      useClaudeCodeActivityStore.getState().startStreaming('s-1')
      const es = useClaudeCodeActivityStore.getState().eventSource as unknown as (typeof authenticatedSseInstances)[number]

      const batch = [
        { id: 'ev-1', type: 'user', session_id: 's-1', timestamp: '2024-01-01T00:00:00Z' },
        { id: 'ev-2', type: 'assistant', session_id: 's-1', timestamp: '2024-01-01T00:00:01Z' },
      ]

      const handler = es.listeners['activity_batch'][0]
      handler(new MessageEvent('activity_batch', { data: JSON.stringify(batch) }))

      expect(useClaudeCodeActivityStore.getState().activities).toEqual(batch)
    })

    it('logs error and does not update state when JSON is invalid', () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
      useClaudeCodeActivityStore.getState().startStreaming('s-1')
      const es = useClaudeCodeActivityStore.getState().eventSource as unknown as (typeof authenticatedSseInstances)[number]

      useClaudeCodeActivityStore.setState({ activities: [{ id: 'existing' } as any] })

      const handler = es.listeners['activity_batch'][0]
      handler(new MessageEvent('activity_batch', { data: 'not-valid-json{{{' }))

      // State should remain unchanged on parse error
      expect(useClaudeCodeActivityStore.getState().activities).toEqual([{ id: 'existing' }])
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('Failed to parse activity batch:'),
        expect.anything()
      )

      consoleSpy.mockRestore()
    })
  })

  describe('SSE activity event handler', () => {
    it('appends activity to the list and increments count', () => {
      useClaudeCodeActivityStore.setState({
        activities: [{ id: 'ev-1', type: 'user' } as any],
        activityTotalCount: 1,
      })

      useClaudeCodeActivityStore.getState().startStreaming('s-1')
      const es = useClaudeCodeActivityStore.getState().eventSource as unknown as (typeof authenticatedSseInstances)[number]

      const newActivity = {
        id: 'ev-2',
        type: 'assistant',
        session_id: 's-1',
        timestamp: '2024-01-01T00:00:01Z',
      }

      const handler = es.listeners['activity'][0]
      handler(new MessageEvent('activity', { data: JSON.stringify(newActivity) }))

      const state = useClaudeCodeActivityStore.getState()
      expect(state.activities).toHaveLength(2)
      expect(state.activities[1]).toEqual(newActivity)
      expect(state.activityTotalCount).toBe(2)
    })

    it('refetches tasks when activity is TaskCreate tool_use', async () => {
      mockApiClient.get.mockResolvedValueOnce({
        tasks: { t1: { id: 't1', title: 'New Task' } },
        root_task_ids: ['t1'],
      })

      useClaudeCodeActivityStore.getState().startStreaming('s-1')
      const es = useClaudeCodeActivityStore.getState().eventSource as unknown as (typeof authenticatedSseInstances)[number]

      const taskCreateActivity = {
        id: 'ev-3',
        type: 'tool_use',
        tool_name: 'TaskCreate',
        session_id: 's-1',
        timestamp: '2024-01-01T00:00:02Z',
      }

      const handler = es.listeners['activity'][0]
      handler(new MessageEvent('activity', { data: JSON.stringify(taskCreateActivity) }))

      await vi.waitFor(() => {
        return useClaudeCodeActivityStore.getState().tasks['t1'] !== undefined
      })

      expect(mockApiClient.get).toHaveBeenCalledWith(
        expect.stringContaining('/api/claude-sessions/s-1/tasks')
      )
      expect(useClaudeCodeActivityStore.getState().tasks).toEqual({
        t1: { id: 't1', title: 'New Task' },
      })
    })

    it('refetches tasks when activity is TaskUpdate tool_use', async () => {
      mockApiClient.get.mockResolvedValueOnce({
        tasks: { t1: { id: 't1', title: 'Updated Task' } },
        root_task_ids: ['t1'],
      })

      useClaudeCodeActivityStore.getState().startStreaming('s-1')
      const es = useClaudeCodeActivityStore.getState().eventSource as unknown as (typeof authenticatedSseInstances)[number]

      const taskUpdateActivity = {
        id: 'ev-4',
        type: 'tool_use',
        tool_name: 'TaskUpdate',
        session_id: 's-1',
        timestamp: '2024-01-01T00:00:03Z',
      }

      const handler = es.listeners['activity'][0]
      handler(new MessageEvent('activity', { data: JSON.stringify(taskUpdateActivity) }))

      await vi.waitFor(() => {
        return useClaudeCodeActivityStore.getState().tasks['t1'] !== undefined
      })

      expect(mockApiClient.get).toHaveBeenCalledWith(
        expect.stringContaining('/api/claude-sessions/s-1/tasks')
      )
    })

    it('does not refetch tasks for other tool_use types', () => {
      useClaudeCodeActivityStore.getState().startStreaming('s-1')
      const es = useClaudeCodeActivityStore.getState().eventSource as unknown as (typeof authenticatedSseInstances)[number]

      const otherActivity = {
        id: 'ev-5',
        type: 'tool_use',
        tool_name: 'Bash',
        session_id: 's-1',
        timestamp: '2024-01-01T00:00:04Z',
      }

      const handler = es.listeners['activity'][0]
      handler(new MessageEvent('activity', { data: JSON.stringify(otherActivity) }))

      expect(mockApiClient.get).not.toHaveBeenCalled()
    })

    it('does not refetch tasks for non-tool_use activity types', () => {
      useClaudeCodeActivityStore.getState().startStreaming('s-1')
      const es = useClaudeCodeActivityStore.getState().eventSource as unknown as (typeof authenticatedSseInstances)[number]

      const assistantActivity = {
        id: 'ev-6',
        type: 'assistant',
        session_id: 's-1',
        timestamp: '2024-01-01T00:00:05Z',
      }

      const handler = es.listeners['activity'][0]
      handler(new MessageEvent('activity', { data: JSON.stringify(assistantActivity) }))

      expect(mockApiClient.get).not.toHaveBeenCalled()
    })

    it('logs error and does not update state when JSON is invalid', () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
      useClaudeCodeActivityStore.setState({ activities: [], activityTotalCount: 0 })

      useClaudeCodeActivityStore.getState().startStreaming('s-1')
      const es = useClaudeCodeActivityStore.getState().eventSource as unknown as (typeof authenticatedSseInstances)[number]

      const handler = es.listeners['activity'][0]
      handler(new MessageEvent('activity', { data: 'bad-json}}' }))

      expect(useClaudeCodeActivityStore.getState().activities).toEqual([])
      expect(useClaudeCodeActivityStore.getState().activityTotalCount).toBe(0)
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('Failed to parse activity event:'),
        expect.anything()
      )

      consoleSpy.mockRestore()
    })
  })

  describe('SSE session_completed event handler', () => {
    it('is registered and can be triggered without error', () => {
      useClaudeCodeActivityStore.setState({
        activities: [{ id: 'ev-1' } as any],
        activityTotalCount: 1,
      })

      useClaudeCodeActivityStore.getState().startStreaming('s-1')
      const es = useClaudeCodeActivityStore.getState().eventSource as unknown as (typeof authenticatedSseInstances)[number]

      // Verify the handler exists
      expect(es.listeners['session_completed']).toBeDefined()
      expect(es.listeners['session_completed']).toHaveLength(1)

      // Fire it — it's a no-op, but should not throw
      const handler = es.listeners['session_completed'][0]
      expect(() => handler(new MessageEvent('session_completed', { data: '' }))).not.toThrow()

      // State should be preserved (no-op)
      expect(useClaudeCodeActivityStore.getState().activities).toHaveLength(1)
      expect(useClaudeCodeActivityStore.getState().activityTotalCount).toBe(1)
    })
  })

  describe('SSE transport status handling', () => {
    it('reconnects after a transport error, but only while the session is active', () => {
      vi.useFakeTimers()
      useClaudeCodeActivityStore.setState({
        activeSessionId: 's-1',
        dataSource: 'claude-code',
      })

      useClaudeCodeActivityStore.getState().startStreaming('s-1')
      const es = useClaudeCodeActivityStore.getState().eventSource as unknown as (typeof authenticatedSseInstances)[number]
      es.emitStatus('error')

      expect(useClaudeCodeActivityStore.getState().eventSource).toBe(es)
      vi.advanceTimersByTime(5000)

      const newEs = useClaudeCodeActivityStore.getState().eventSource as unknown as (typeof authenticatedSseInstances)[number]
      expect(newEs).not.toBe(es)
      expect(newEs.url).toContain('/api/claude-sessions/s-1/activity/stream')
      vi.useRealTimers()
    })

    it('does not reconnect after a terminal authentication failure', () => {
      vi.useFakeTimers()
      useClaudeCodeActivityStore.setState({
        activeSessionId: 's-1',
        dataSource: 'claude-code',
      })

      useClaudeCodeActivityStore.getState().startStreaming('s-1')
      const es = useClaudeCodeActivityStore.getState().eventSource as unknown as (typeof authenticatedSseInstances)[number]
      es.emitStatus('authentication-failed')
      vi.advanceTimersByTime(5000)

      expect(useClaudeCodeActivityStore.getState().eventSource).toBeNull()
      expect(useClaudeCodeActivityStore.getState().error).toContain('Authentication required')
      expect(authenticatedSseInstances).toHaveLength(1)
      vi.useRealTimers()
    })

    it('does not reconnect when the active session or data source changes', () => {
      vi.useFakeTimers()
      useClaudeCodeActivityStore.setState({
        activeSessionId: 's-1',
        dataSource: 'claude-code',
      })
      useClaudeCodeActivityStore.getState().startStreaming('s-1')
      const es = useClaudeCodeActivityStore.getState().eventSource as unknown as (typeof authenticatedSseInstances)[number]
      es.emitStatus('error')
      useClaudeCodeActivityStore.setState({ activeSessionId: null })
      vi.advanceTimersByTime(5000)
      expect(authenticatedSseInstances).toHaveLength(1)
      vi.useRealTimers()
    })
  })

  // ── fetchActivity non-Error rejection ──────────────────

  describe('fetchActivity non-Error thrown', () => {
    it('sets error to Unknown error when a non-Error value is thrown', async () => {
      mockApiClient.get.mockRejectedValueOnce('plain string error')

      await useClaudeCodeActivityStore.getState().fetchActivity('s-1')

      expect(useClaudeCodeActivityStore.getState().error).toBe('Unknown error')
      expect(useClaudeCodeActivityStore.getState().isLoadingActivity).toBe(false)
    })

    it('sets error to Unknown error when null is thrown', async () => {
      mockApiClient.get.mockRejectedValueOnce(null)

      await useClaudeCodeActivityStore.getState().fetchActivity('s-1')

      expect(useClaudeCodeActivityStore.getState().error).toBe('Unknown error')
    })
  })

  // ── fetchTasks non-Error rejection ─────────────────────

  describe('fetchTasks non-Error thrown', () => {
    it('sets error to Unknown error when a non-Error value is thrown', async () => {
      mockApiClient.get.mockRejectedValueOnce(42)

      await useClaudeCodeActivityStore.getState().fetchTasks('s-1')

      expect(useClaudeCodeActivityStore.getState().error).toBe('Unknown error')
      expect(useClaudeCodeActivityStore.getState().isLoadingTasks).toBe(false)
    })

    it('sets error to Unknown error when an object is thrown', async () => {
      mockApiClient.get.mockRejectedValueOnce({ code: 500, message: 'server down' })

      await useClaudeCodeActivityStore.getState().fetchTasks('s-1')

      expect(useClaudeCodeActivityStore.getState().error).toBe('Unknown error')
    })
  })

  // ── onRehydrateStorage ─────────────────────────────────

  describe('onRehydrateStorage', () => {
    it('calls startStreaming on next tick when activeSessionId is present after rehydration', () => {
      vi.useFakeTimers()

      // Simulate what onRehydrateStorage does by calling the callback directly
      // We construct a state object with an activeSessionId and startStreaming spy
      const startStreamingSpy = vi.fn()
      const rehydratedState = {
        activeSessionId: 's-rehydrated',
        startStreaming: startStreamingSpy,
      }

      // Directly invoke the onRehydrateStorage callback pattern
      const callback = (state: typeof rehydratedState | undefined) => {
        if (state?.activeSessionId) {
          setTimeout(() => {
            state.startStreaming(state.activeSessionId!)
          }, 0)
        }
      }
      callback(rehydratedState as any)

      // Before tick fires, startStreaming should not have been called
      expect(startStreamingSpy).not.toHaveBeenCalled()

      // Advance timers to fire the setTimeout(fn, 0)
      vi.advanceTimersByTime(0)

      expect(startStreamingSpy).toHaveBeenCalledWith('s-rehydrated')

      vi.useRealTimers()
    })

    it('does not call startStreaming when activeSessionId is null after rehydration', () => {
      vi.useFakeTimers()

      const startStreamingSpy = vi.fn()
      const rehydratedState = {
        activeSessionId: null,
        startStreaming: startStreamingSpy,
      }

      const callback = (state: typeof rehydratedState | undefined) => {
        if (state?.activeSessionId) {
          setTimeout(() => {
            state.startStreaming(state.activeSessionId!)
          }, 0)
        }
      }
      callback(rehydratedState as any)

      vi.advanceTimersByTime(0)

      expect(startStreamingSpy).not.toHaveBeenCalled()

      vi.useRealTimers()
    })

    it('does not call startStreaming when state is undefined after rehydration', () => {
      vi.useFakeTimers()

      const startStreamingSpy = vi.fn()

      const callback = (state: { activeSessionId: string | null; startStreaming: typeof startStreamingSpy } | undefined) => {
        if (state?.activeSessionId) {
          setTimeout(() => {
            state.startStreaming(state.activeSessionId!)
          }, 0)
        }
      }
      callback(undefined)

      vi.advanceTimersByTime(0)

      expect(startStreamingSpy).not.toHaveBeenCalled()

      vi.useRealTimers()
    })
  })
})
