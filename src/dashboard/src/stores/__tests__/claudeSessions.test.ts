/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { useClaudeSessionsStore } from '../claudeSessions'

const mockFetch = vi.fn()
global.fetch = mockFetch

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
  useClaudeSessionsStore.setState({
    sessions: [],
    totalCount: 0,
    filteredCount: 0,
    activeCount: 0,
    isLoading: false,
    offset: 0,
    hasMore: false,
    pageSize: 30,
    isLoadingMore: false,
    selectedSessionId: null,
    selectedSession: null,
    isLoadingDetails: false,
    transcriptEntries: [],
    transcriptTotalCount: 0,
    transcriptHasMore: false,
    transcriptOffset: 0,
    isLoadingTranscript: false,
    sortBy: 'last_activity',
    sortOrder: 'desc',
    projectFilter: null,
    sourceUserFilter: null,
    searchQuery: '',
    sourceUsers: [],
    currentUser: '',
    allProjects: [],
    autoRefresh: true,
    refreshInterval: 5,
    error: null,
    generatingSummaryFor: null,
    autoGenerateSummaries: false, // Disable for tests
    eventSource: null,
    isBatchGenerating: false,
    batchJustCompleted: false,
    batchProgress: { total: 0, processed: 0, success: 0, failed: 0 },
    pendingSummaryCount: 0,
  })
}

describe('claudeSessions store', () => {
  beforeEach(() => {
    resetStore()
    mockFetch.mockReset()
  })

  // ── Initial State ──────────────────────────────────────

  describe('initial state', () => {
    it('has empty sessions', () => {
      expect(useClaudeSessionsStore.getState().sessions).toEqual([])
    })

    it('has default sort', () => {
      expect(useClaudeSessionsStore.getState().sortBy).toBe('last_activity')
      expect(useClaudeSessionsStore.getState().sortOrder).toBe('desc')
    })

    it('has no selected session', () => {
      expect(useClaudeSessionsStore.getState().selectedSessionId).toBeNull()
    })
  })

  // ── UI Actions ─────────────────────────────────────────

  describe('UI actions', () => {
    it('setSearchQuery', () => {
      useClaudeSessionsStore.getState().setSearchQuery('test query')
      expect(useClaudeSessionsStore.getState().searchQuery).toBe('test query')
    })

    it('setRefreshInterval', () => {
      useClaudeSessionsStore.getState().setRefreshInterval(10)
      expect(useClaudeSessionsStore.getState().refreshInterval).toBe(10)
    })

    it('clearError', () => {
      useClaudeSessionsStore.setState({ error: 'err' })
      useClaudeSessionsStore.getState().clearError()
      expect(useClaudeSessionsStore.getState().error).toBeNull()
    })

    it('setAutoGenerateSummaries', () => {
      useClaudeSessionsStore.getState().setAutoGenerateSummaries(true)
      expect(useClaudeSessionsStore.getState().autoGenerateSummaries).toBe(true)
    })

    it('clearTranscript', () => {
      useClaudeSessionsStore.setState({
        transcriptEntries: [{ id: '1' } as any],
        transcriptTotalCount: 1,
      })
      useClaudeSessionsStore.getState().clearTranscript()
      expect(useClaudeSessionsStore.getState().transcriptEntries).toEqual([])
      expect(useClaudeSessionsStore.getState().transcriptTotalCount).toBe(0)
    })
  })

  // ── fetchSessions ──────────────────────────────────────

  describe('fetchSessions', () => {
    it('fetches and stores sessions', async () => {
      const data = {
        sessions: [{ session_id: 's-1', project_name: 'Test' }],
        total_count: 1,
        filtered_count: 1,
        active_count: 0,
        has_more: false,
        offset: 0,
      }
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(data),
      })

      await useClaudeSessionsStore.getState().fetchSessions()

      const state = useClaudeSessionsStore.getState()
      expect(state.sessions).toEqual(data.sessions)
      expect(state.totalCount).toBe(1)
      expect(state.isLoading).toBe(false)
    })

    it('includes filter params', async () => {
      useClaudeSessionsStore.setState({
        projectFilter: 'MyProject',
        sourceUserFilter: 'user1',
      })
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ sessions: [], total_count: 0, filtered_count: 0, active_count: 0, has_more: false, offset: 0 }),
      })

      await useClaudeSessionsStore.getState().fetchSessions('active')

      const url = mockFetch.mock.calls[0][0] as string
      expect(url).toContain('project=MyProject')
      expect(url).toContain('source_user=user1')
      expect(url).toContain('status=active')
    })

    it('sets error on failure', async () => {
      mockFetch.mockResolvedValueOnce({ ok: false, statusText: 'Error' })

      await useClaudeSessionsStore.getState().fetchSessions()

      expect(useClaudeSessionsStore.getState().error).toContain('Failed to fetch sessions')
    })
  })

  // ── loadMoreSessions ───────────────────────────────────

  describe('loadMoreSessions', () => {
    it('skips if no more data', async () => {
      useClaudeSessionsStore.setState({ hasMore: false })

      await useClaudeSessionsStore.getState().loadMoreSessions()

      expect(mockFetch).not.toHaveBeenCalled()
    })

    it('skips if already loading', async () => {
      useClaudeSessionsStore.setState({ hasMore: true, isLoadingMore: true })

      await useClaudeSessionsStore.getState().loadMoreSessions()

      expect(mockFetch).not.toHaveBeenCalled()
    })

    it('appends new sessions', async () => {
      useClaudeSessionsStore.setState({
        sessions: [{ session_id: 's-1' } as any],
        hasMore: true,
      })
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          sessions: [{ session_id: 's-2' }],
          has_more: false,
          offset: 1,
        }),
      })

      await useClaudeSessionsStore.getState().loadMoreSessions()

      expect(useClaudeSessionsStore.getState().sessions).toHaveLength(2)
      expect(useClaudeSessionsStore.getState().isLoadingMore).toBe(false)
    })
  })

  // ── getFilteredSessions ────────────────────────────────

  describe('getFilteredSessions', () => {
    it('returns all sessions when no search query', () => {
      useClaudeSessionsStore.setState({
        sessions: [{ session_id: 's-1' } as any],
        searchQuery: '',
      })

      expect(useClaudeSessionsStore.getState().getFilteredSessions()).toHaveLength(1)
    })

    it('filters by search query', () => {
      useClaudeSessionsStore.setState({
        sessions: [
          { session_id: 's-1', summary: 'Fix login bug', slug: null, project_name: 'App' } as any,
          { session_id: 's-2', summary: 'Add tests', slug: null, project_name: 'App' } as any,
        ],
        searchQuery: 'login',
      })

      const filtered = useClaudeSessionsStore.getState().getFilteredSessions()
      expect(filtered).toHaveLength(1)
      expect(filtered[0].session_id).toBe('s-1')
    })
  })

  // ── getUniqueProjects ──────────────────────────────────

  describe('getUniqueProjects', () => {
    it('returns allProjects from API when available', () => {
      useClaudeSessionsStore.setState({ allProjects: ['A', 'B'] })
      expect(useClaudeSessionsStore.getState().getUniqueProjects()).toEqual(['A', 'B'])
    })

    it('falls back to sessions projects', () => {
      useClaudeSessionsStore.setState({
        allProjects: [],
        sessions: [
          { project_name: 'B' } as any,
          { project_name: 'A' } as any,
          { project_name: 'B' } as any, // duplicate
        ],
      })
      expect(useClaudeSessionsStore.getState().getUniqueProjects()).toEqual(['A', 'B'])
    })
  })

  // ── isExternalSession ──────────────────────────────────

  describe('isExternalSession', () => {
    it('returns true for different user', () => {
      useClaudeSessionsStore.setState({ currentUser: 'me' })
      expect(useClaudeSessionsStore.getState().isExternalSession({ source_user: 'other' } as any)).toBe(true)
    })

    it('returns false for same user', () => {
      useClaudeSessionsStore.setState({ currentUser: 'me' })
      expect(useClaudeSessionsStore.getState().isExternalSession({ source_user: 'me' } as any)).toBe(false)
    })
  })

  // ── fetchSessionDetails ────────────────────────────────

  describe('fetchSessionDetails', () => {
    it('fetches and stores session details', async () => {
      const detail = { session_id: 's-1', status: 'active', message_count: 10 }
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(detail),
      })

      await useClaudeSessionsStore.getState().fetchSessionDetails('s-1')

      expect(useClaudeSessionsStore.getState().selectedSession).toEqual(detail)
      expect(useClaudeSessionsStore.getState().selectedSessionId).toBe('s-1')
    })

    it('sets error on failure', async () => {
      mockFetch.mockResolvedValueOnce({ ok: false, statusText: 'Not Found' })

      await useClaudeSessionsStore.getState().fetchSessionDetails('s-1')

      expect(useClaudeSessionsStore.getState().error).toContain('Failed to fetch session details')
    })
  })

  // ── fetchTranscript ────────────────────────────────────

  describe('fetchTranscript', () => {
    it('fetches and stores transcript', async () => {
      const data = {
        entries: [{ id: 'e-1', role: 'user', text: 'Hello' }],
        total_count: 1,
        has_more: false,
        offset: 0,
      }
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(data),
      })

      await useClaudeSessionsStore.getState().fetchTranscript('s-1')

      expect(useClaudeSessionsStore.getState().transcriptEntries).toEqual(data.entries)
      expect(useClaudeSessionsStore.getState().transcriptTotalCount).toBe(1)
    })

    it('appends when append=true', async () => {
      useClaudeSessionsStore.setState({
        transcriptEntries: [{ id: 'e-1' } as any],
      })
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          entries: [{ id: 'e-2' }],
          total_count: 2,
          has_more: false,
          offset: 1,
        }),
      })

      await useClaudeSessionsStore.getState().fetchTranscript('s-1', 1, 50, true)

      expect(useClaudeSessionsStore.getState().transcriptEntries).toHaveLength(2)
    })
  })

  // ── Delete Actions ─────────────────────────────────────

  describe('delete actions', () => {
    it('deleteSession removes from list', async () => {
      useClaudeSessionsStore.setState({
        sessions: [{ session_id: 's-1' } as any, { session_id: 's-2' } as any],
        totalCount: 2,
      })
      mockFetch.mockResolvedValueOnce({ ok: true })

      const result = await useClaudeSessionsStore.getState().deleteSession('s-1')

      expect(result).toBe(true)
      expect(useClaudeSessionsStore.getState().sessions).toHaveLength(1)
      expect(useClaudeSessionsStore.getState().totalCount).toBe(1)
    })

    it('deleteSession clears selected if deleted', async () => {
      useClaudeSessionsStore.setState({
        sessions: [{ session_id: 's-1' } as any],
        selectedSessionId: 's-1',
        selectedSession: {} as any,
        totalCount: 1,
      })
      mockFetch.mockResolvedValueOnce({ ok: true })

      await useClaudeSessionsStore.getState().deleteSession('s-1')

      expect(useClaudeSessionsStore.getState().selectedSessionId).toBeNull()
      expect(useClaudeSessionsStore.getState().selectedSession).toBeNull()
    })

    it('deleteEmptySessions removes deleted sessions', async () => {
      useClaudeSessionsStore.setState({
        sessions: [
          { session_id: 's-1', message_count: 0 } as any,
          { session_id: 's-2', message_count: 5 } as any,
        ],
        totalCount: 2,
      })
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ deleted_count: 1, deleted_ids: ['s-1'] }),
      })

      const result = await useClaudeSessionsStore.getState().deleteEmptySessions()

      expect(result.deletedCount).toBe(1)
      expect(useClaudeSessionsStore.getState().sessions).toHaveLength(1)
    })
  })

  // ── Ghost Sessions ─────────────────────────────────────

  describe('ghost sessions', () => {
    it('getEmptySessionsCount', () => {
      useClaudeSessionsStore.setState({
        sessions: [
          { message_count: 0 } as any,
          { message_count: 5 } as any,
          { message_count: 0 } as any,
        ],
      })
      expect(useClaudeSessionsStore.getState().getEmptySessionsCount()).toBe(2)
    })

    it('getGhostSessionsCount', () => {
      useClaudeSessionsStore.setState({
        sessions: [
          { message_count: 3, user_message_count: 0, assistant_message_count: 0 } as any,
          { message_count: 5, user_message_count: 2, assistant_message_count: 3 } as any,
        ],
      })
      expect(useClaudeSessionsStore.getState().getGhostSessionsCount()).toBe(1)
    })

    it('isGhostSession returns true for ghost', () => {
      const ghost = { message_count: 3, user_message_count: 0, assistant_message_count: 0 } as any
      expect(useClaudeSessionsStore.getState().isGhostSession(ghost)).toBe(true)
    })

    it('isGhostSession returns false for normal', () => {
      const normal = { message_count: 3, user_message_count: 1, assistant_message_count: 2 } as any
      expect(useClaudeSessionsStore.getState().isGhostSession(normal)).toBe(false)
    })
  })

  // ── Summary ────────────────────────────────────────────

  describe('generateSummary', () => {
    it('generates and updates session summary', async () => {
      useClaudeSessionsStore.setState({
        sessions: [{ session_id: 's-1', summary: null } as any],
      })
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ summary: 'This session fixed a bug' }),
      })

      await useClaudeSessionsStore.getState().generateSummary('s-1')

      expect(useClaudeSessionsStore.getState().sessions[0].summary).toBe('This session fixed a bug')
      expect(useClaudeSessionsStore.getState().generatingSummaryFor).toBeNull()
    })

    it('sets error on failure', async () => {
      mockFetch.mockResolvedValueOnce({ ok: false, statusText: 'Error' })

      await useClaudeSessionsStore.getState().generateSummary('s-1')

      expect(useClaudeSessionsStore.getState().error).toContain('Failed to generate summary')
    })
  })

  // ── Streaming ──────────────────────────────────────────

  describe('streaming', () => {
    it('stopStreaming closes eventSource', () => {
      const mockES = { close: vi.fn() }
      useClaudeSessionsStore.setState({ eventSource: mockES as any })

      useClaudeSessionsStore.getState().stopStreaming()

      expect(mockES.close).toHaveBeenCalled()
      expect(useClaudeSessionsStore.getState().eventSource).toBeNull()
    })

    it('startStreaming creates EventSource', () => {
      useClaudeSessionsStore.getState().startStreaming('s-1')

      const es = useClaudeSessionsStore.getState().eventSource as unknown as MockEventSource
      expect(es).not.toBeNull()
      expect(es.url).toContain('/api/claude-sessions/s-1/stream')
    })

    it('startStreaming skips for completed sessions', () => {
      useClaudeSessionsStore.setState({
        selectedSession: { status: 'completed' } as any,
      })

      useClaudeSessionsStore.getState().startStreaming('s-1')

      expect(useClaudeSessionsStore.getState().eventSource).toBeNull()
    })
  })

  // ── fetchSourceUsers ───────────────────────────────────

  describe('fetchSourceUsers', () => {
    it('fetches and stores source users', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ users: ['user1', 'user2'], current_user: 'user1' }),
      })

      await useClaudeSessionsStore.getState().fetchSourceUsers()

      expect(useClaudeSessionsStore.getState().sourceUsers).toEqual(['user1', 'user2'])
      expect(useClaudeSessionsStore.getState().currentUser).toBe('user1')
    })
  })

  // ── fetchProjects ──────────────────────────────────────

  describe('fetchProjects', () => {
    it('fetches and stores projects', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ projects: ['Project-A', 'Project-B'] }),
      })

      await useClaudeSessionsStore.getState().fetchProjects()

      expect(useClaudeSessionsStore.getState().allProjects).toEqual(['Project-A', 'Project-B'])
    })
  })

  // ── Batch Summaries ────────────────────────────────────

  describe('generateBatchSummaries', () => {
    it('generates batch summaries and updates state', async () => {
      useClaudeSessionsStore.setState({
        sessions: [{ session_id: 's-1', summary: null } as any],
        pendingSummaryCount: 5,
      })
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          total_processed: 3,
          success_count: 2,
          failed_count: 1,
          generated_summaries: [
            { session_id: 's-1', summary: 'Generated summary' },
          ],
        }),
      })

      await useClaudeSessionsStore.getState().generateBatchSummaries(10)

      const state = useClaudeSessionsStore.getState()
      expect(state.batchProgress.total).toBe(3)
      expect(state.batchProgress.success).toBe(2)
      expect(state.isBatchGenerating).toBe(false)
      expect(state.batchJustCompleted).toBe(true)
      expect(state.pendingSummaryCount).toBe(3)
      expect(state.sessions[0].summary).toBe('Generated summary')
    })

    it('skips if already generating', async () => {
      useClaudeSessionsStore.setState({ isBatchGenerating: true })

      await useClaudeSessionsStore.getState().generateBatchSummaries()

      expect(mockFetch).not.toHaveBeenCalled()
    })
  })
})
