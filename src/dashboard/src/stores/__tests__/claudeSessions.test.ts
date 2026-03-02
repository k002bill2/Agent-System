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

import { useClaudeSessionsStore } from '../claudeSessions'
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
  // Helper: fire a registered event
  emit(event: string, data?: any) {
    const handlers = this.listeners[event] || []
    handlers.forEach((h) => h(data as MessageEvent))
  }
}
// @ts-expect-error - Mock
global.EventSource = MockEventSource

const emptyResponse = {
  sessions: [],
  total_count: 0,
  filtered_count: 0,
  active_count: 0,
  has_more: false,
  offset: 0,
}

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
    vi.clearAllMocks()
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

    it('has default pagination', () => {
      const state = useClaudeSessionsStore.getState()
      expect(state.offset).toBe(0)
      expect(state.hasMore).toBe(false)
      expect(state.pageSize).toBe(30)
      expect(state.isLoadingMore).toBe(false)
    })

    it('has default transcript state', () => {
      const state = useClaudeSessionsStore.getState()
      expect(state.transcriptEntries).toEqual([])
      expect(state.transcriptTotalCount).toBe(0)
      expect(state.transcriptHasMore).toBe(false)
      expect(state.transcriptOffset).toBe(0)
      expect(state.isLoadingTranscript).toBe(false)
    })

    it('has default auto-refresh settings', () => {
      const state = useClaudeSessionsStore.getState()
      expect(state.autoRefresh).toBe(true)
      expect(state.refreshInterval).toBe(5)
    })

    it('has default batch summary state', () => {
      const state = useClaudeSessionsStore.getState()
      expect(state.isBatchGenerating).toBe(false)
      expect(state.batchJustCompleted).toBe(false)
      expect(state.batchProgress).toEqual({ total: 0, processed: 0, success: 0, failed: 0 })
      expect(state.pendingSummaryCount).toBe(0)
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
        transcriptHasMore: true,
        transcriptOffset: 5,
      })
      useClaudeSessionsStore.getState().clearTranscript()
      expect(useClaudeSessionsStore.getState().transcriptEntries).toEqual([])
      expect(useClaudeSessionsStore.getState().transcriptTotalCount).toBe(0)
      expect(useClaudeSessionsStore.getState().transcriptHasMore).toBe(false)
      expect(useClaudeSessionsStore.getState().transcriptOffset).toBe(0)
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
      mockApiClient.get.mockResolvedValueOnce(data)

      await useClaudeSessionsStore.getState().fetchSessions()

      const state = useClaudeSessionsStore.getState()
      expect(state.sessions).toEqual(data.sessions)
      expect(state.totalCount).toBe(1)
      expect(state.filteredCount).toBe(1)
      expect(state.activeCount).toBe(0)
      expect(state.hasMore).toBe(false)
      expect(state.isLoading).toBe(false)
    })

    it('includes filter params', async () => {
      useClaudeSessionsStore.setState({
        projectFilter: 'MyProject',
        sourceUserFilter: 'user1',
      })
      mockApiClient.get.mockResolvedValueOnce(emptyResponse)

      await useClaudeSessionsStore.getState().fetchSessions('active')

      const url = mockApiClient.get.mock.calls[0][0] as string
      expect(url).toContain('project=MyProject')
      expect(url).toContain('source_user=user1')
      expect(url).toContain('status=active')
    })

    it('sets error on failure', async () => {
      mockApiClient.get.mockRejectedValueOnce(new Error('Failed to fetch sessions'))

      await useClaudeSessionsStore.getState().fetchSessions()

      expect(useClaudeSessionsStore.getState().error).toBe('Failed to fetch sessions')
      expect(useClaudeSessionsStore.getState().isLoading).toBe(false)
    })

    it('resets offset when reset=true (default)', async () => {
      useClaudeSessionsStore.setState({ offset: 30 })
      mockApiClient.get.mockResolvedValueOnce(emptyResponse)

      await useClaudeSessionsStore.getState().fetchSessions()

      // offset param in URL should be 0
      const url = mockApiClient.get.mock.calls[0][0] as string
      expect(url).toContain('offset=0')
    })

    it('preserves offset when reset=false', async () => {
      useClaudeSessionsStore.setState({ offset: 30 })
      mockApiClient.get.mockResolvedValueOnce(emptyResponse)

      await useClaudeSessionsStore.getState().fetchSessions(undefined, false)

      const url = mockApiClient.get.mock.calls[0][0] as string
      expect(url).toContain('offset=30')
    })

    it('clears batchJustCompleted on fetch', async () => {
      useClaudeSessionsStore.setState({ batchJustCompleted: true })
      mockApiClient.get.mockResolvedValueOnce(emptyResponse)

      await useClaudeSessionsStore.getState().fetchSessions()

      expect(useClaudeSessionsStore.getState().batchJustCompleted).toBe(false)
    })

    it('handles non-Error thrown values', async () => {
      mockApiClient.get.mockRejectedValueOnce('string error')

      await useClaudeSessionsStore.getState().fetchSessions()

      expect(useClaudeSessionsStore.getState().error).toBe('Unknown error')
      expect(useClaudeSessionsStore.getState().isLoading).toBe(false)
    })

    it('triggers autoGenerateMissingSummaries when enabled', async () => {
      useClaudeSessionsStore.setState({ autoGenerateSummaries: true })
      // First call: fetchSessions
      mockApiClient.get.mockResolvedValueOnce({
        ...emptyResponse,
        sessions: [{ session_id: 's-1', summary: null }],
      })
      // Second call: autoGenerateMissingSummaries internal fetch
      mockApiClient.get.mockResolvedValueOnce({
        ...emptyResponse,
        sessions: [{ session_id: 's-1', summary: null }],
      })
      // Third call: generateSummaryQuiet
      mockApiClient.post.mockResolvedValueOnce({ summary: 'Auto' })
      // Fourth call: fetchPendingSummaryCount
      mockApiClient.get.mockResolvedValueOnce({ pending_count: 0 })

      await useClaudeSessionsStore.getState().fetchSessions()

      // Wait for non-blocking auto-generate
      await vi.waitFor(() => {
        expect(mockApiClient.get.mock.calls.length).toBeGreaterThanOrEqual(2)
      })
    })

    it('does not include status param when not provided', async () => {
      mockApiClient.get.mockResolvedValueOnce(emptyResponse)

      await useClaudeSessionsStore.getState().fetchSessions()

      const url = mockApiClient.get.mock.calls[0][0] as string
      expect(url).not.toContain('status=')
    })

    it('does not include project param when projectFilter is null', async () => {
      mockApiClient.get.mockResolvedValueOnce(emptyResponse)

      await useClaudeSessionsStore.getState().fetchSessions()

      const url = mockApiClient.get.mock.calls[0][0] as string
      expect(url).not.toContain('project=')
    })

    it('does not include source_user param when sourceUserFilter is null', async () => {
      mockApiClient.get.mockResolvedValueOnce(emptyResponse)

      await useClaudeSessionsStore.getState().fetchSessions()

      const url = mockApiClient.get.mock.calls[0][0] as string
      expect(url).not.toContain('source_user=')
    })
  })

  // ── loadMoreSessions ───────────────────────────────────

  describe('loadMoreSessions', () => {
    it('skips if no more data', async () => {
      useClaudeSessionsStore.setState({ hasMore: false })

      await useClaudeSessionsStore.getState().loadMoreSessions()

      expect(mockApiClient.get).not.toHaveBeenCalled()
    })

    it('skips if already loading', async () => {
      useClaudeSessionsStore.setState({ hasMore: true, isLoadingMore: true })

      await useClaudeSessionsStore.getState().loadMoreSessions()

      expect(mockApiClient.get).not.toHaveBeenCalled()
    })

    it('appends new sessions', async () => {
      useClaudeSessionsStore.setState({
        sessions: [{ session_id: 's-1' } as any],
        hasMore: true,
      })
      mockApiClient.get.mockResolvedValueOnce({
        sessions: [{ session_id: 's-2' }],
        has_more: false,
        offset: 1,
      })

      await useClaudeSessionsStore.getState().loadMoreSessions()

      expect(useClaudeSessionsStore.getState().sessions).toHaveLength(2)
      expect(useClaudeSessionsStore.getState().isLoadingMore).toBe(false)
    })

    it('sets error on failure', async () => {
      useClaudeSessionsStore.setState({ hasMore: true })
      mockApiClient.get.mockRejectedValueOnce(new Error('Failed to load more sessions'))

      await useClaudeSessionsStore.getState().loadMoreSessions()

      expect(useClaudeSessionsStore.getState().error).toBe('Failed to load more sessions')
      expect(useClaudeSessionsStore.getState().isLoadingMore).toBe(false)
    })

    it('handles non-Error thrown values', async () => {
      useClaudeSessionsStore.setState({ hasMore: true })
      mockApiClient.get.mockRejectedValueOnce(42)

      await useClaudeSessionsStore.getState().loadMoreSessions()

      expect(useClaudeSessionsStore.getState().error).toBe('Unknown error')
      expect(useClaudeSessionsStore.getState().isLoadingMore).toBe(false)
    })

    it('includes filter params in URL', async () => {
      useClaudeSessionsStore.setState({
        hasMore: true,
        projectFilter: 'Proj',
        sourceUserFilter: 'admin',
        sessions: [{ session_id: 's-1' } as any],
      })
      mockApiClient.get.mockResolvedValueOnce({
        sessions: [],
        has_more: false,
        offset: 1,
      })

      await useClaudeSessionsStore.getState().loadMoreSessions('active')

      const url = mockApiClient.get.mock.calls[0][0] as string
      expect(url).toContain('project=Proj')
      expect(url).toContain('source_user=admin')
      expect(url).toContain('status=active')
      expect(url).toContain('offset=1')
    })
  })

  // ── refreshSessions ────────────────────────────────────

  describe('refreshSessions', () => {
    it('merges new sessions at the top', async () => {
      useClaudeSessionsStore.setState({
        sessions: [
          { session_id: 's-1', status: 'idle' } as any,
        ],
      })
      mockApiClient.get.mockResolvedValueOnce({
        sessions: [
          { session_id: 's-2', status: 'active' },
          { session_id: 's-1', status: 'active' },
        ],
        total_count: 2,
        filtered_count: 2,
        active_count: 2,
        has_more: false,
        offset: 0,
      })

      await useClaudeSessionsStore.getState().refreshSessions()

      const state = useClaudeSessionsStore.getState()
      expect(state.sessions).toHaveLength(2)
      // New session s-2 should be first
      expect(state.sessions[0].session_id).toBe('s-2')
      // Existing s-1 should be updated
      expect(state.sessions[1].status).toBe('active')
      expect(state.totalCount).toBe(2)
      expect(state.activeCount).toBe(2)
    })

    it('keeps existing sessions beyond first page', async () => {
      useClaudeSessionsStore.setState({
        sessions: [
          { session_id: 's-1', status: 'idle' } as any,
          { session_id: 's-extra', status: 'completed' } as any,
        ],
      })
      // API returns only s-1 (first page)
      mockApiClient.get.mockResolvedValueOnce({
        sessions: [{ session_id: 's-1', status: 'active' }],
        total_count: 2,
        filtered_count: 2,
        active_count: 1,
        has_more: true,
        offset: 0,
      })

      await useClaudeSessionsStore.getState().refreshSessions()

      const sessions = useClaudeSessionsStore.getState().sessions
      // Both sessions kept: no new ones, and s-extra is beyond first page
      expect(sessions).toHaveLength(2)
      expect(sessions[0].session_id).toBe('s-1')
      expect(sessions[0].status).toBe('active')
      expect(sessions[1].session_id).toBe('s-extra')
    })

    it('silently fails on error', async () => {
      mockApiClient.get.mockRejectedValueOnce(new Error('network down'))

      await useClaudeSessionsStore.getState().refreshSessions()

      // No error set in state
      expect(useClaudeSessionsStore.getState().error).toBeNull()
    })

    it('clears batchJustCompleted', async () => {
      useClaudeSessionsStore.setState({ batchJustCompleted: true })
      mockApiClient.get.mockResolvedValueOnce({
        ...emptyResponse,
      })

      await useClaudeSessionsStore.getState().refreshSessions()

      expect(useClaudeSessionsStore.getState().batchJustCompleted).toBe(false)
    })

    it('includes filter params in refresh', async () => {
      useClaudeSessionsStore.setState({
        projectFilter: 'ProjX',
        sourceUserFilter: 'user1',
      })
      mockApiClient.get.mockResolvedValueOnce(emptyResponse)

      await useClaudeSessionsStore.getState().refreshSessions('active')

      const url = mockApiClient.get.mock.calls[0][0] as string
      expect(url).toContain('project=ProjX')
      expect(url).toContain('source_user=user1')
      expect(url).toContain('status=active')
      expect(url).toContain('offset=0')
    })
  })

  // ── setSortBy / setSortOrder / setProjectFilter / setSourceUserFilter ──

  describe('sort and filter actions', () => {
    it('setSortBy sets field and triggers fetchSessions', async () => {
      mockApiClient.get.mockResolvedValueOnce(emptyResponse)

      useClaudeSessionsStore.getState().setSortBy('created_at')

      expect(useClaudeSessionsStore.getState().sortBy).toBe('created_at')
      // fetchSessions was called
      await vi.waitFor(() => {
        expect(mockApiClient.get).toHaveBeenCalled()
      })
    })

    it('setSortOrder sets order and triggers fetchSessions', async () => {
      mockApiClient.get.mockResolvedValueOnce(emptyResponse)

      useClaudeSessionsStore.getState().setSortOrder('asc')

      expect(useClaudeSessionsStore.getState().sortOrder).toBe('asc')
      await vi.waitFor(() => {
        expect(mockApiClient.get).toHaveBeenCalled()
      })
    })

    it('setProjectFilter sets filter and triggers fetchSessions', async () => {
      mockApiClient.get.mockResolvedValueOnce(emptyResponse)

      useClaudeSessionsStore.getState().setProjectFilter('MyProj')

      expect(useClaudeSessionsStore.getState().projectFilter).toBe('MyProj')
      await vi.waitFor(() => {
        expect(mockApiClient.get).toHaveBeenCalled()
      })
    })

    it('setSourceUserFilter sets filter and triggers fetchSessions', async () => {
      mockApiClient.get.mockResolvedValueOnce(emptyResponse)

      useClaudeSessionsStore.getState().setSourceUserFilter('admin')

      expect(useClaudeSessionsStore.getState().sourceUserFilter).toBe('admin')
      await vi.waitFor(() => {
        expect(mockApiClient.get).toHaveBeenCalled()
      })
    })

    it('setProjectFilter can clear filter with null', async () => {
      useClaudeSessionsStore.setState({ projectFilter: 'Something' })
      mockApiClient.get.mockResolvedValueOnce(emptyResponse)

      useClaudeSessionsStore.getState().setProjectFilter(null)

      expect(useClaudeSessionsStore.getState().projectFilter).toBeNull()
    })

    it('setSourceUserFilter can clear filter with null', async () => {
      useClaudeSessionsStore.setState({ sourceUserFilter: 'someone' })
      mockApiClient.get.mockResolvedValueOnce(emptyResponse)

      useClaudeSessionsStore.getState().setSourceUserFilter(null)

      expect(useClaudeSessionsStore.getState().sourceUserFilter).toBeNull()
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

    it('returns all when search is whitespace only', () => {
      useClaudeSessionsStore.setState({
        sessions: [{ session_id: 's-1' } as any],
        searchQuery: '   ',
      })

      expect(useClaudeSessionsStore.getState().getFilteredSessions()).toHaveLength(1)
    })

    it('filters by summary', () => {
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

    it('filters by slug', () => {
      useClaudeSessionsStore.setState({
        sessions: [
          { session_id: 's-1', summary: null, slug: 'fix-login', project_name: null } as any,
          { session_id: 's-2', summary: null, slug: 'add-tests', project_name: null } as any,
        ],
        searchQuery: 'login',
      })

      expect(useClaudeSessionsStore.getState().getFilteredSessions()).toHaveLength(1)
    })

    it('filters by session_id', () => {
      useClaudeSessionsStore.setState({
        sessions: [
          { session_id: 'abc-123', summary: null, slug: null, project_name: null } as any,
          { session_id: 'def-456', summary: null, slug: null, project_name: null } as any,
        ],
        searchQuery: 'abc',
      })

      expect(useClaudeSessionsStore.getState().getFilteredSessions()).toHaveLength(1)
    })

    it('filters by project_name', () => {
      useClaudeSessionsStore.setState({
        sessions: [
          { session_id: 's-1', summary: null, slug: null, project_name: 'Agent-System' } as any,
          { session_id: 's-2', summary: null, slug: null, project_name: 'Other' } as any,
        ],
        searchQuery: 'agent',
      })

      expect(useClaudeSessionsStore.getState().getFilteredSessions()).toHaveLength(1)
    })

    it('search is case insensitive', () => {
      useClaudeSessionsStore.setState({
        sessions: [
          { session_id: 's-1', summary: 'FIX BUG', slug: null, project_name: null } as any,
        ],
        searchQuery: 'fix bug',
      })

      expect(useClaudeSessionsStore.getState().getFilteredSessions()).toHaveLength(1)
    })

    it('handles null search targets gracefully', () => {
      useClaudeSessionsStore.setState({
        sessions: [
          { session_id: 's-1', summary: null, slug: null, project_name: null } as any,
        ],
        searchQuery: 'something',
      })

      // Should not throw, just return empty
      expect(useClaudeSessionsStore.getState().getFilteredSessions()).toHaveLength(0)
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

    it('filters out null and empty project names in fallback', () => {
      useClaudeSessionsStore.setState({
        allProjects: [],
        sessions: [
          { project_name: null } as any,
          { project_name: '' } as any,
          { project_name: 'Valid' } as any,
        ],
      })
      expect(useClaudeSessionsStore.getState().getUniqueProjects()).toEqual(['Valid'])
    })

    it('returns empty array when no projects', () => {
      useClaudeSessionsStore.setState({
        allProjects: [],
        sessions: [],
      })
      expect(useClaudeSessionsStore.getState().getUniqueProjects()).toEqual([])
    })
  })

  // ── getUniqueSourceUsers ───────────────────────────────

  describe('getUniqueSourceUsers', () => {
    it('returns unique sorted source users', () => {
      useClaudeSessionsStore.setState({
        sessions: [
          { source_user: 'charlie' } as any,
          { source_user: 'alice' } as any,
          { source_user: 'charlie' } as any,
          { source_user: 'bob' } as any,
        ],
      })
      expect(useClaudeSessionsStore.getState().getUniqueSourceUsers()).toEqual(['alice', 'bob', 'charlie'])
    })

    it('filters out null and empty source users', () => {
      useClaudeSessionsStore.setState({
        sessions: [
          { source_user: null } as any,
          { source_user: '' } as any,
          { source_user: 'user1' } as any,
        ],
      })
      expect(useClaudeSessionsStore.getState().getUniqueSourceUsers()).toEqual(['user1'])
    })

    it('returns empty array when no sessions', () => {
      expect(useClaudeSessionsStore.getState().getUniqueSourceUsers()).toEqual([])
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

    it('returns false for empty source_user', () => {
      useClaudeSessionsStore.setState({ currentUser: '' })
      expect(useClaudeSessionsStore.getState().isExternalSession({ source_user: '' } as any)).toBe(false)
    })

    it('returns true for empty source_user when currentUser is set', () => {
      useClaudeSessionsStore.setState({ currentUser: 'me' })
      // empty string !== 'me' but empty string !== '' check:
      // The store checks: source_user !== '' && source_user !== currentUser
      // So empty source_user fails the first check => false
      expect(useClaudeSessionsStore.getState().isExternalSession({ source_user: '' } as any)).toBe(false)
    })
  })

  // ── fetchSessionDetails ────────────────────────────────

  describe('fetchSessionDetails', () => {
    it('fetches and stores session details', async () => {
      const detail = { session_id: 's-1', status: 'active', message_count: 10 }
      mockApiClient.get.mockResolvedValueOnce(detail)

      await useClaudeSessionsStore.getState().fetchSessionDetails('s-1')

      expect(useClaudeSessionsStore.getState().selectedSession).toEqual(detail)
      expect(useClaudeSessionsStore.getState().selectedSessionId).toBe('s-1')
      expect(useClaudeSessionsStore.getState().isLoadingDetails).toBe(false)
    })

    it('sets error on failure', async () => {
      mockApiClient.get.mockRejectedValueOnce(new Error('Failed to fetch session details'))

      await useClaudeSessionsStore.getState().fetchSessionDetails('s-1')

      expect(useClaudeSessionsStore.getState().error).toBe('Failed to fetch session details')
      expect(useClaudeSessionsStore.getState().isLoadingDetails).toBe(false)
    })

    it('handles non-Error thrown values', async () => {
      mockApiClient.get.mockRejectedValueOnce(null)

      await useClaudeSessionsStore.getState().fetchSessionDetails('s-1')

      expect(useClaudeSessionsStore.getState().error).toBe('Unknown error')
      expect(useClaudeSessionsStore.getState().isLoadingDetails).toBe(false)
    })

    it('sets isLoadingDetails to true during fetch', async () => {
      let loadingDuringFetch = false
      mockApiClient.get.mockImplementationOnce(() => {
        loadingDuringFetch = useClaudeSessionsStore.getState().isLoadingDetails
        return Promise.resolve({ session_id: 's-1' })
      })

      await useClaudeSessionsStore.getState().fetchSessionDetails('s-1')

      expect(loadingDuringFetch).toBe(true)
    })
  })

  // ── selectSession ──────────────────────────────────────

  describe('selectSession', () => {
    it('deselects when null', () => {
      useClaudeSessionsStore.setState({
        selectedSessionId: 's-1',
        selectedSession: { session_id: 's-1' } as any,
      })

      useClaudeSessionsStore.getState().selectSession(null)

      expect(useClaudeSessionsStore.getState().selectedSessionId).toBeNull()
      expect(useClaudeSessionsStore.getState().selectedSession).toBeNull()
    })

    it('stops existing streaming when selecting null', () => {
      const mockES = { close: vi.fn() }
      useClaudeSessionsStore.setState({ eventSource: mockES as any })

      useClaudeSessionsStore.getState().selectSession(null)

      expect(mockES.close).toHaveBeenCalled()
    })

    it('fetches details and starts streaming when autoRefresh is on', async () => {
      const detail = { session_id: 's-1', status: 'active' }
      mockApiClient.get.mockResolvedValueOnce(detail)

      useClaudeSessionsStore.getState().selectSession('s-1')

      await vi.waitFor(() => {
        expect(useClaudeSessionsStore.getState().selectedSession).toBeTruthy()
      })
      // Streaming should have started
      expect(useClaudeSessionsStore.getState().eventSource).not.toBeNull()
    })

    it('fetches details but does not start streaming when autoRefresh is off', async () => {
      useClaudeSessionsStore.setState({ autoRefresh: false })
      const detail = { session_id: 's-1', status: 'active' }
      mockApiClient.get.mockResolvedValueOnce(detail)

      useClaudeSessionsStore.getState().selectSession('s-1')

      await vi.waitFor(() => {
        expect(useClaudeSessionsStore.getState().selectedSession).toBeTruthy()
      })
      expect(useClaudeSessionsStore.getState().eventSource).toBeNull()
    })
  })

  // ── setAutoRefresh ─────────────────────────────────────

  describe('setAutoRefresh', () => {
    it('starts streaming when enabling with a selected session', () => {
      useClaudeSessionsStore.setState({
        selectedSessionId: 's-1',
        selectedSession: { status: 'active' } as any,
      })

      useClaudeSessionsStore.getState().setAutoRefresh(true)

      expect(useClaudeSessionsStore.getState().autoRefresh).toBe(true)
      expect(useClaudeSessionsStore.getState().eventSource).not.toBeNull()
    })

    it('stops streaming when disabling', () => {
      const mockES = { close: vi.fn() }
      useClaudeSessionsStore.setState({
        eventSource: mockES as any,
        selectedSessionId: 's-1',
      })

      useClaudeSessionsStore.getState().setAutoRefresh(false)

      expect(useClaudeSessionsStore.getState().autoRefresh).toBe(false)
      expect(mockES.close).toHaveBeenCalled()
    })

    it('does not start streaming when enabling without selected session', () => {
      useClaudeSessionsStore.setState({ selectedSessionId: null })

      useClaudeSessionsStore.getState().setAutoRefresh(true)

      expect(useClaudeSessionsStore.getState().eventSource).toBeNull()
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
      mockApiClient.get.mockResolvedValueOnce(data)

      await useClaudeSessionsStore.getState().fetchTranscript('s-1')

      expect(useClaudeSessionsStore.getState().transcriptEntries).toEqual(data.entries)
      expect(useClaudeSessionsStore.getState().transcriptTotalCount).toBe(1)
      expect(useClaudeSessionsStore.getState().isLoadingTranscript).toBe(false)
    })

    it('appends when append=true', async () => {
      useClaudeSessionsStore.setState({
        transcriptEntries: [{ id: 'e-1' } as any],
      })
      mockApiClient.get.mockResolvedValueOnce({
        entries: [{ id: 'e-2' }],
        total_count: 2,
        has_more: false,
        offset: 1,
      })

      await useClaudeSessionsStore.getState().fetchTranscript('s-1', 1, 50, true)

      expect(useClaudeSessionsStore.getState().transcriptEntries).toHaveLength(2)
    })

    it('replaces when append=false (default)', async () => {
      useClaudeSessionsStore.setState({
        transcriptEntries: [{ id: 'e-old' } as any],
      })
      mockApiClient.get.mockResolvedValueOnce({
        entries: [{ id: 'e-new' }],
        total_count: 1,
        has_more: false,
        offset: 0,
      })

      await useClaudeSessionsStore.getState().fetchTranscript('s-1')

      expect(useClaudeSessionsStore.getState().transcriptEntries).toHaveLength(1)
      expect((useClaudeSessionsStore.getState().transcriptEntries[0] as any).id).toBe('e-new')
    })

    it('sets error on failure', async () => {
      mockApiClient.get.mockRejectedValueOnce(new Error('Failed to fetch transcript'))

      await useClaudeSessionsStore.getState().fetchTranscript('s-1')

      expect(useClaudeSessionsStore.getState().error).toBe('Failed to fetch transcript')
      expect(useClaudeSessionsStore.getState().isLoadingTranscript).toBe(false)
    })

    it('handles non-Error thrown values', async () => {
      mockApiClient.get.mockRejectedValueOnce(undefined)

      await useClaudeSessionsStore.getState().fetchTranscript('s-1')

      expect(useClaudeSessionsStore.getState().error).toBe('Unknown error')
      expect(useClaudeSessionsStore.getState().isLoadingTranscript).toBe(false)
    })

    it('passes offset and limit params', async () => {
      mockApiClient.get.mockResolvedValueOnce({
        entries: [],
        total_count: 0,
        has_more: false,
        offset: 10,
      })

      await useClaudeSessionsStore.getState().fetchTranscript('s-1', 10, 25)

      const url = mockApiClient.get.mock.calls[0][0] as string
      expect(url).toContain('offset=10')
      expect(url).toContain('limit=25')
    })
  })

  // ── Delete Actions ─────────────────────────────────────

  describe('delete actions', () => {
    it('deleteSession removes from list', async () => {
      useClaudeSessionsStore.setState({
        sessions: [{ session_id: 's-1' } as any, { session_id: 's-2' } as any],
        totalCount: 2,
      })
      mockApiClient.delete.mockResolvedValueOnce(undefined)

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
      mockApiClient.delete.mockResolvedValueOnce(undefined)

      await useClaudeSessionsStore.getState().deleteSession('s-1')

      expect(useClaudeSessionsStore.getState().selectedSessionId).toBeNull()
      expect(useClaudeSessionsStore.getState().selectedSession).toBeNull()
    })

    it('deleteSession keeps selected if different session deleted', async () => {
      useClaudeSessionsStore.setState({
        sessions: [{ session_id: 's-1' } as any, { session_id: 's-2' } as any],
        selectedSessionId: 's-2',
        selectedSession: { session_id: 's-2' } as any,
        totalCount: 2,
      })
      mockApiClient.delete.mockResolvedValueOnce(undefined)

      await useClaudeSessionsStore.getState().deleteSession('s-1')

      expect(useClaudeSessionsStore.getState().selectedSessionId).toBe('s-2')
      expect(useClaudeSessionsStore.getState().selectedSession).toBeTruthy()
    })

    it('deleteSession returns false on error', async () => {
      mockApiClient.delete.mockRejectedValueOnce(new Error('Not found'))

      const result = await useClaudeSessionsStore.getState().deleteSession('s-1')

      expect(result).toBe(false)
      expect(useClaudeSessionsStore.getState().error).toBe('Not found')
    })

    it('deleteSession handles non-Error thrown values', async () => {
      mockApiClient.delete.mockRejectedValueOnce('crash')

      const result = await useClaudeSessionsStore.getState().deleteSession('s-1')

      expect(result).toBe(false)
      expect(useClaudeSessionsStore.getState().error).toBe('Unknown error')
    })

    it('deleteEmptySessions removes deleted sessions', async () => {
      useClaudeSessionsStore.setState({
        sessions: [
          { session_id: 's-1', message_count: 0 } as any,
          { session_id: 's-2', message_count: 5 } as any,
        ],
        totalCount: 2,
      })
      mockApiClient.delete.mockResolvedValueOnce({ deleted_count: 1, deleted_ids: ['s-1'] })

      const result = await useClaudeSessionsStore.getState().deleteEmptySessions()

      expect(result.deletedCount).toBe(1)
      expect(useClaudeSessionsStore.getState().sessions).toHaveLength(1)
    })

    it('deleteEmptySessions handles error response', async () => {
      mockApiClient.delete.mockRejectedValueOnce(new Error('Delete failed'))

      const result = await useClaudeSessionsStore.getState().deleteEmptySessions()

      expect(result.deletedCount).toBe(0)
      expect(result.deletedIds).toEqual([])
      expect(useClaudeSessionsStore.getState().error).toBe('Delete failed')
    })

    it('deleteEmptySessions handles network error', async () => {
      mockApiClient.delete.mockRejectedValueOnce(new Error('network'))

      const result = await useClaudeSessionsStore.getState().deleteEmptySessions()

      expect(result.deletedCount).toBe(0)
      expect(result.deletedIds).toEqual([])
      expect(useClaudeSessionsStore.getState().error).toBe('network')
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

    it('isGhostSession returns false for empty session (message_count=0)', () => {
      const empty = { message_count: 0, user_message_count: 0, assistant_message_count: 0 } as any
      expect(useClaudeSessionsStore.getState().isGhostSession(empty)).toBe(false)
    })

    it('deleteGhostSessions removes ghost sessions', async () => {
      useClaudeSessionsStore.setState({
        sessions: [
          { session_id: 's-1', message_count: 3, user_message_count: 0, assistant_message_count: 0 } as any,
          { session_id: 's-2', message_count: 5, user_message_count: 2, assistant_message_count: 3 } as any,
        ],
        totalCount: 2,
      })
      mockApiClient.delete.mockResolvedValueOnce({
        deleted_count: 1,
        deleted_ids: ['s-1'],
      })

      const result = await useClaudeSessionsStore.getState().deleteGhostSessions()

      expect(result.deletedCount).toBe(1)
      expect(result.deletedIds).toEqual(['s-1'])
      expect(useClaudeSessionsStore.getState().sessions).toHaveLength(1)
      expect(useClaudeSessionsStore.getState().totalCount).toBe(1)
    })

    it('deleteGhostSessions handles error response', async () => {
      mockApiClient.delete.mockRejectedValueOnce(new Error('Ghost delete failed'))

      const result = await useClaudeSessionsStore.getState().deleteGhostSessions()

      expect(result.deletedCount).toBe(0)
      expect(result.deletedIds).toEqual([])
      expect(useClaudeSessionsStore.getState().error).toBe('Ghost delete failed')
    })

    it('deleteGhostSessions handles network error', async () => {
      mockApiClient.delete.mockRejectedValueOnce(new Error('timeout'))

      const result = await useClaudeSessionsStore.getState().deleteGhostSessions()

      expect(result.deletedCount).toBe(0)
      expect(result.deletedIds).toEqual([])
      expect(useClaudeSessionsStore.getState().error).toBe('timeout')
    })

    it('deleteGhostSessions handles non-Error thrown values', async () => {
      mockApiClient.delete.mockRejectedValueOnce(123)

      const result = await useClaudeSessionsStore.getState().deleteGhostSessions()

      expect(result.deletedCount).toBe(0)
      expect(useClaudeSessionsStore.getState().error).toBe('Unknown error')
    })
  })

  // ── Summary ────────────────────────────────────────────

  describe('generateSummary', () => {
    it('generates and updates session summary', async () => {
      useClaudeSessionsStore.setState({
        sessions: [{ session_id: 's-1', summary: null } as any],
      })
      mockApiClient.post.mockResolvedValueOnce({ summary: 'This session fixed a bug' })

      await useClaudeSessionsStore.getState().generateSummary('s-1')

      expect(useClaudeSessionsStore.getState().sessions[0].summary).toBe('This session fixed a bug')
      expect(useClaudeSessionsStore.getState().generatingSummaryFor).toBeNull()
    })

    it('sets generatingSummaryFor during generation', async () => {
      let generating: string | null = null
      mockApiClient.post.mockImplementationOnce(() => {
        generating = useClaudeSessionsStore.getState().generatingSummaryFor
        return Promise.resolve({ summary: 'done' })
      })
      useClaudeSessionsStore.setState({
        sessions: [{ session_id: 's-1', summary: null } as any],
      })

      await useClaudeSessionsStore.getState().generateSummary('s-1')

      expect(generating).toBe('s-1')
    })

    it('sets error on failure', async () => {
      mockApiClient.post.mockRejectedValueOnce(new Error('Failed to generate summary'))

      await useClaudeSessionsStore.getState().generateSummary('s-1')

      expect(useClaudeSessionsStore.getState().error).toBe('Failed to generate summary')
      expect(useClaudeSessionsStore.getState().generatingSummaryFor).toBeNull()
    })

    it('handles non-Error thrown values', async () => {
      mockApiClient.post.mockRejectedValueOnce(undefined)

      await useClaudeSessionsStore.getState().generateSummary('s-1')

      expect(useClaudeSessionsStore.getState().error).toBe('Unknown error')
      expect(useClaudeSessionsStore.getState().generatingSummaryFor).toBeNull()
    })

    it('does not update unrelated sessions', async () => {
      useClaudeSessionsStore.setState({
        sessions: [
          { session_id: 's-1', summary: null } as any,
          { session_id: 's-2', summary: 'existing' } as any,
        ],
      })
      mockApiClient.post.mockResolvedValueOnce({ summary: 'New summary' })

      await useClaudeSessionsStore.getState().generateSummary('s-1')

      expect(useClaudeSessionsStore.getState().sessions[1].summary).toBe('existing')
    })
  })

  // ── generateSummaryQuiet ───────────────────────────────

  describe('generateSummaryQuiet', () => {
    it('generates summary quietly', async () => {
      useClaudeSessionsStore.setState({
        sessions: [{ session_id: 's-1', summary: null } as any],
      })
      mockApiClient.post.mockResolvedValueOnce({ summary: 'Quiet summary' })

      await useClaudeSessionsStore.getState().generateSummaryQuiet('s-1')

      expect(useClaudeSessionsStore.getState().sessions[0].summary).toBe('Quiet summary')
      expect(useClaudeSessionsStore.getState().generatingSummaryFor).toBeNull()
    })

    it('silently handles error without setting error', async () => {
      mockApiClient.post.mockRejectedValueOnce(new Error('Error'))

      await useClaudeSessionsStore.getState().generateSummaryQuiet('s-1')

      // No error set in state
      expect(useClaudeSessionsStore.getState().error).toBeNull()
      expect(useClaudeSessionsStore.getState().generatingSummaryFor).toBeNull()
    })

    it('silently handles network error without setting error', async () => {
      mockApiClient.post.mockRejectedValueOnce(new Error('network'))

      await useClaudeSessionsStore.getState().generateSummaryQuiet('s-1')

      expect(useClaudeSessionsStore.getState().error).toBeNull()
      expect(useClaudeSessionsStore.getState().generatingSummaryFor).toBeNull()
    })

    it('sets generatingSummaryFor during generation', async () => {
      let generating: string | null = null
      mockApiClient.post.mockImplementationOnce(() => {
        generating = useClaudeSessionsStore.getState().generatingSummaryFor
        return Promise.resolve({ summary: 'done' })
      })
      useClaudeSessionsStore.setState({
        sessions: [{ session_id: 's-1', summary: null } as any],
      })

      await useClaudeSessionsStore.getState().generateSummaryQuiet('s-1')

      expect(generating).toBe('s-1')
    })
  })

  // ── autoGenerateMissingSummaries ────────────────────────

  describe('autoGenerateMissingSummaries', () => {
    it('skips when autoGenerateSummaries is disabled', async () => {
      useClaudeSessionsStore.setState({ autoGenerateSummaries: false })

      await useClaudeSessionsStore.getState().autoGenerateMissingSummaries()

      expect(mockApiClient.get).not.toHaveBeenCalled()
    })

    it('skips when already generating a summary', async () => {
      useClaudeSessionsStore.setState({
        autoGenerateSummaries: true,
        generatingSummaryFor: 's-existing',
      })

      await useClaudeSessionsStore.getState().autoGenerateMissingSummaries()

      expect(mockApiClient.get).not.toHaveBeenCalled()
    })

    it('generates summaries for sessions without one', async () => {
      useClaudeSessionsStore.setState({
        autoGenerateSummaries: true,
        sessions: [{ session_id: 's-1', summary: null } as any],
      })
      // First call: fetch sessions to find those without summary
      mockApiClient.get.mockResolvedValueOnce({
        sessions: [
          { session_id: 's-1', summary: null },
          { session_id: 's-2', summary: 'has one' },
        ],
        total_count: 2,
        filtered_count: 2,
        active_count: 0,
        has_more: false,
        offset: 0,
      })
      // Second call: generateSummaryQuiet for s-1
      mockApiClient.post.mockResolvedValueOnce({ summary: 'Auto generated' })
      // Third call: fetchPendingSummaryCount
      mockApiClient.get.mockResolvedValueOnce({ pending_count: 0 })

      await useClaudeSessionsStore.getState().autoGenerateMissingSummaries()

      // generateSummaryQuiet was called
      expect(mockApiClient.get).toHaveBeenCalledTimes(2) // sessions fetch + pending count
      expect(mockApiClient.post).toHaveBeenCalledTimes(1) // summary generation
    })

    it('silently handles fetch error', async () => {
      useClaudeSessionsStore.setState({ autoGenerateSummaries: true })
      mockApiClient.get.mockRejectedValueOnce(new Error('fail'))

      await useClaudeSessionsStore.getState().autoGenerateMissingSummaries()

      expect(useClaudeSessionsStore.getState().error).toBeNull()
    })

    it('stops generating if autoGenerateSummaries is disabled mid-loop', async () => {
      useClaudeSessionsStore.setState({ autoGenerateSummaries: true })
      // Return 2 sessions without summaries
      mockApiClient.get.mockResolvedValueOnce({
        sessions: [
          { session_id: 's-1', summary: null },
          { session_id: 's-2', summary: null },
        ],
        total_count: 2,
        filtered_count: 2,
        active_count: 0,
        has_more: false,
        offset: 0,
      })
      // For the first generateSummaryQuiet call, disable auto-generate
      mockApiClient.post.mockImplementationOnce(() => {
        useClaudeSessionsStore.setState({ autoGenerateSummaries: false })
        return Promise.resolve({ summary: 'first' })
      })
      // fetchPendingSummaryCount is still called because sessionsWithoutSummary.length > 0
      mockApiClient.get.mockResolvedValueOnce({ pending_count: 1 })

      await useClaudeSessionsStore.getState().autoGenerateMissingSummaries()

      // s-2 was skipped because autoGenerateSummaries was disabled mid-loop
      // Only 1 POST call (for s-1), not 2
      expect(mockApiClient.post).toHaveBeenCalledTimes(1)
    })

    it('does not call fetchPendingSummaryCount when no sessions without summaries', async () => {
      useClaudeSessionsStore.setState({ autoGenerateSummaries: true })
      mockApiClient.get.mockResolvedValueOnce({
        sessions: [{ session_id: 's-1', summary: 'already has one' }],
        total_count: 1,
        filtered_count: 1,
        active_count: 0,
        has_more: false,
        offset: 0,
      })

      await useClaudeSessionsStore.getState().autoGenerateMissingSummaries()

      // Only the sessions fetch, no pending count fetch
      expect(mockApiClient.get).toHaveBeenCalledTimes(1)
    })

    it('includes filter params', async () => {
      useClaudeSessionsStore.setState({
        autoGenerateSummaries: true,
        projectFilter: 'MyProject',
        sourceUserFilter: 'admin',
      })
      mockApiClient.get.mockResolvedValueOnce({
        sessions: [],
        total_count: 0,
        filtered_count: 0,
        active_count: 0,
        has_more: false,
        offset: 0,
      })

      await useClaudeSessionsStore.getState().autoGenerateMissingSummaries()

      const url = mockApiClient.get.mock.calls[0][0] as string
      expect(url).toContain('project=MyProject')
      expect(url).toContain('source_user=admin')
      expect(url).toContain('limit=200')
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

    it('stopStreaming does nothing when no eventSource', () => {
      useClaudeSessionsStore.setState({ eventSource: null })

      // Should not throw
      useClaudeSessionsStore.getState().stopStreaming()

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

    it('startStreaming closes existing connection before creating new one', () => {
      const oldES = { close: vi.fn() }
      useClaudeSessionsStore.setState({ eventSource: oldES as any })

      useClaudeSessionsStore.getState().startStreaming('s-2')

      expect(oldES.close).toHaveBeenCalled()
      const newES = useClaudeSessionsStore.getState().eventSource as unknown as MockEventSource
      expect(newES).not.toBeNull()
      expect(newES.url).toContain('s-2')
    })

    it('session_update event updates selectedSession and sessions list', () => {
      useClaudeSessionsStore.setState({
        sessions: [{ session_id: 's-1', status: 'idle', message_count: 5, summary: 'old' } as any],
        selectedSession: { session_id: 's-1', status: 'idle', summary: 'old' } as any,
      })

      useClaudeSessionsStore.getState().startStreaming('s-1')
      const es = useClaudeSessionsStore.getState().eventSource as unknown as MockEventSource

      const updateData = {
        session_id: 's-1',
        status: 'active',
        message_count: 10,
        tool_call_count: 3,
        last_activity: '2026-01-01T00:00:00Z',
        estimated_cost: 0.5,
        summary: 'New summary',
      }
      es.emit('session_update', { data: JSON.stringify(updateData) })

      const state = useClaudeSessionsStore.getState()
      expect(state.selectedSession?.status).toBe('active')
      expect(state.selectedSession?.summary).toBe('New summary')
      expect(state.sessions[0].status).toBe('active')
      expect(state.sessions[0].message_count).toBe(10)
      expect(state.sessions[0].summary).toBe('New summary')
    })

    it('session_update preserves existing summary when server sends null', () => {
      useClaudeSessionsStore.setState({
        sessions: [{ session_id: 's-1', status: 'idle', summary: 'Keep this' } as any],
        selectedSession: { session_id: 's-1', status: 'idle', summary: 'Keep this' } as any,
      })

      useClaudeSessionsStore.getState().startStreaming('s-1')
      const es = useClaudeSessionsStore.getState().eventSource as unknown as MockEventSource

      es.emit('session_update', {
        data: JSON.stringify({
          session_id: 's-1',
          status: 'active',
          message_count: 10,
          tool_call_count: 0,
          last_activity: '2026-01-01',
          estimated_cost: 0,
          summary: null,
        }),
      })

      expect(useClaudeSessionsStore.getState().selectedSession?.summary).toBe('Keep this')
      expect(useClaudeSessionsStore.getState().sessions[0].summary).toBe('Keep this')
    })

    it('session_update handles invalid JSON gracefully', () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
      useClaudeSessionsStore.getState().startStreaming('s-1')
      const es = useClaudeSessionsStore.getState().eventSource as unknown as MockEventSource

      // Should not throw
      es.emit('session_update', { data: 'invalid json' })

      expect(consoleSpy).toHaveBeenCalled()
      consoleSpy.mockRestore()
    })

    it('session_completed event updates selectedSession', () => {
      useClaudeSessionsStore.setState({
        selectedSession: { session_id: 's-1', status: 'active', summary: 'old' } as any,
      })

      useClaudeSessionsStore.getState().startStreaming('s-1')
      const es = useClaudeSessionsStore.getState().eventSource as unknown as MockEventSource

      es.emit('session_completed', {
        data: JSON.stringify({
          session_id: 's-1',
          status: 'completed',
          summary: 'Final summary',
        }),
      })

      expect(useClaudeSessionsStore.getState().selectedSession?.status).toBe('completed')
      expect(useClaudeSessionsStore.getState().selectedSession?.summary).toBe('Final summary')
    })

    it('session_completed preserves existing summary when server sends null', () => {
      useClaudeSessionsStore.setState({
        selectedSession: { session_id: 's-1', status: 'active', summary: 'Existing' } as any,
      })

      useClaudeSessionsStore.getState().startStreaming('s-1')
      const es = useClaudeSessionsStore.getState().eventSource as unknown as MockEventSource

      es.emit('session_completed', {
        data: JSON.stringify({
          session_id: 's-1',
          status: 'completed',
          summary: null,
        }),
      })

      expect(useClaudeSessionsStore.getState().selectedSession?.summary).toBe('Existing')
    })

    it('session_completed handles invalid JSON gracefully', () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
      useClaudeSessionsStore.getState().startStreaming('s-1')
      const es = useClaudeSessionsStore.getState().eventSource as unknown as MockEventSource

      es.emit('session_completed', { data: 'bad json' })

      expect(consoleSpy).toHaveBeenCalled()
      consoleSpy.mockRestore()
    })

    it('session_ended event stops streaming', () => {
      useClaudeSessionsStore.getState().startStreaming('s-1')
      const es = useClaudeSessionsStore.getState().eventSource as unknown as MockEventSource

      es.emit('session_ended', {})

      expect(useClaudeSessionsStore.getState().eventSource).toBeNull()
    })

    it('error event stops streaming', () => {
      useClaudeSessionsStore.setState({
        selectedSession: { status: 'active' } as any,
      })
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})

      useClaudeSessionsStore.getState().startStreaming('s-1')
      const es = useClaudeSessionsStore.getState().eventSource as unknown as MockEventSource

      es.emit('error', {})

      expect(useClaudeSessionsStore.getState().eventSource).toBeNull()
      expect(warnSpy).toHaveBeenCalledWith('SSE connection closed unexpectedly')
      warnSpy.mockRestore()
    })

    it('error event does not warn for completed sessions', () => {
      useClaudeSessionsStore.setState({
        selectedSession: { status: 'completed' } as any,
      })
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})

      // Force create EventSource by not having status=completed in selectedSession at startStreaming time
      useClaudeSessionsStore.setState({ selectedSession: null })
      useClaudeSessionsStore.getState().startStreaming('s-1')
      // Then set completed status
      useClaudeSessionsStore.setState({
        selectedSession: { status: 'completed' } as any,
      })
      const es = useClaudeSessionsStore.getState().eventSource as unknown as MockEventSource

      es.emit('error', {})

      expect(warnSpy).not.toHaveBeenCalled()
      warnSpy.mockRestore()
    })

    it('error event does not warn when no selectedSession', () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
      useClaudeSessionsStore.setState({ selectedSession: null })

      useClaudeSessionsStore.getState().startStreaming('s-1')
      const es = useClaudeSessionsStore.getState().eventSource as unknown as MockEventSource

      es.emit('error', {})

      expect(warnSpy).not.toHaveBeenCalled()
      warnSpy.mockRestore()
    })

    it('session_update does not update unrelated sessions in list', () => {
      useClaudeSessionsStore.setState({
        sessions: [
          { session_id: 's-1', status: 'idle' } as any,
          { session_id: 's-2', status: 'active' } as any,
        ],
        selectedSession: { session_id: 's-1' } as any,
      })

      useClaudeSessionsStore.getState().startStreaming('s-1')
      const es = useClaudeSessionsStore.getState().eventSource as unknown as MockEventSource

      es.emit('session_update', {
        data: JSON.stringify({
          session_id: 's-1',
          status: 'active',
          message_count: 10,
          tool_call_count: 0,
          last_activity: '2026-01-01',
          estimated_cost: 0,
          summary: null,
        }),
      })

      expect(useClaudeSessionsStore.getState().sessions[1].status).toBe('active')
      expect(useClaudeSessionsStore.getState().sessions[1].session_id).toBe('s-2')
    })
  })

  // ── fetchSourceUsers ───────────────────────────────────

  describe('fetchSourceUsers', () => {
    it('fetches and stores source users', async () => {
      mockApiClient.get.mockResolvedValueOnce({ users: ['user1', 'user2'], current_user: 'user1' })

      await useClaudeSessionsStore.getState().fetchSourceUsers()

      expect(useClaudeSessionsStore.getState().sourceUsers).toEqual(['user1', 'user2'])
      expect(useClaudeSessionsStore.getState().currentUser).toBe('user1')
    })

    it('silently handles error', async () => {
      mockApiClient.get.mockRejectedValueOnce(new Error('fail'))

      await useClaudeSessionsStore.getState().fetchSourceUsers()

      expect(useClaudeSessionsStore.getState().sourceUsers).toEqual([])
      expect(useClaudeSessionsStore.getState().error).toBeNull()
    })

    it('silently handles network error', async () => {
      mockApiClient.get.mockRejectedValueOnce(new Error('network'))

      await useClaudeSessionsStore.getState().fetchSourceUsers()

      expect(useClaudeSessionsStore.getState().error).toBeNull()
    })

    it('handles missing fields in response', async () => {
      mockApiClient.get.mockResolvedValueOnce({})

      await useClaudeSessionsStore.getState().fetchSourceUsers()

      expect(useClaudeSessionsStore.getState().sourceUsers).toEqual([])
      expect(useClaudeSessionsStore.getState().currentUser).toBe('')
    })
  })

  // ── fetchProjects ──────────────────────────────────────

  describe('fetchProjects', () => {
    it('fetches and stores projects', async () => {
      mockApiClient.get.mockResolvedValueOnce({ projects: ['Project-A', 'Project-B'] })

      await useClaudeSessionsStore.getState().fetchProjects()

      expect(useClaudeSessionsStore.getState().allProjects).toEqual(['Project-A', 'Project-B'])
    })

    it('silently handles error', async () => {
      mockApiClient.get.mockRejectedValueOnce(new Error('fail'))

      await useClaudeSessionsStore.getState().fetchProjects()

      expect(useClaudeSessionsStore.getState().allProjects).toEqual([])
      expect(useClaudeSessionsStore.getState().error).toBeNull()
    })

    it('silently handles network error', async () => {
      mockApiClient.get.mockRejectedValueOnce(new Error('auth error'))

      await useClaudeSessionsStore.getState().fetchProjects()

      expect(useClaudeSessionsStore.getState().allProjects).toEqual([])
      expect(useClaudeSessionsStore.getState().error).toBeNull()
    })

    it('handles missing projects field in response', async () => {
      mockApiClient.get.mockResolvedValueOnce({})

      await useClaudeSessionsStore.getState().fetchProjects()

      expect(useClaudeSessionsStore.getState().allProjects).toEqual([])
    })
  })

  // ── fetchPendingSummaryCount ────────────────────────────

  describe('fetchPendingSummaryCount', () => {
    it('fetches and stores pending count', async () => {
      mockApiClient.get.mockResolvedValueOnce({ pending_count: 42 })

      await useClaudeSessionsStore.getState().fetchPendingSummaryCount()

      expect(useClaudeSessionsStore.getState().pendingSummaryCount).toBe(42)
    })

    it('includes projectFilter in URL', async () => {
      useClaudeSessionsStore.setState({ projectFilter: 'TestProj' })
      mockApiClient.get.mockResolvedValueOnce({ pending_count: 0 })

      await useClaudeSessionsStore.getState().fetchPendingSummaryCount()

      const url = mockApiClient.get.mock.calls[0][0] as string
      expect(url).toContain('project=TestProj')
    })

    it('silently handles error', async () => {
      mockApiClient.get.mockRejectedValueOnce(new Error('fail'))

      await useClaudeSessionsStore.getState().fetchPendingSummaryCount()

      expect(useClaudeSessionsStore.getState().pendingSummaryCount).toBe(0)
      expect(useClaudeSessionsStore.getState().error).toBeNull()
    })

    it('silently handles network error', async () => {
      mockApiClient.get.mockRejectedValueOnce(new Error('fail'))

      await useClaudeSessionsStore.getState().fetchPendingSummaryCount()

      expect(useClaudeSessionsStore.getState().error).toBeNull()
    })
  })

  // ── Batch Summaries ────────────────────────────────────

  describe('generateBatchSummaries', () => {
    it('generates batch summaries and updates state', async () => {
      useClaudeSessionsStore.setState({
        sessions: [{ session_id: 's-1', summary: null } as any],
        pendingSummaryCount: 5,
      })
      mockApiClient.post.mockResolvedValueOnce({
        total_processed: 3,
        success_count: 2,
        failed_count: 1,
        generated_summaries: [
          { session_id: 's-1', summary: 'Generated summary' },
        ],
      })

      await useClaudeSessionsStore.getState().generateBatchSummaries(10)

      const state = useClaudeSessionsStore.getState()
      expect(state.batchProgress.total).toBe(3)
      expect(state.batchProgress.processed).toBe(3)
      expect(state.batchProgress.success).toBe(2)
      expect(state.batchProgress.failed).toBe(1)
      expect(state.isBatchGenerating).toBe(false)
      expect(state.batchJustCompleted).toBe(true)
      expect(state.pendingSummaryCount).toBe(3) // 5 - 2
      expect(state.sessions[0].summary).toBe('Generated summary')
    })

    it('skips if already generating', async () => {
      useClaudeSessionsStore.setState({ isBatchGenerating: true })

      await useClaudeSessionsStore.getState().generateBatchSummaries()

      expect(mockApiClient.post).not.toHaveBeenCalled()
    })

    it('handles response with no generated_summaries', async () => {
      useClaudeSessionsStore.setState({
        sessions: [{ session_id: 's-1', summary: null } as any],
        pendingSummaryCount: 1,
      })
      mockApiClient.post.mockResolvedValueOnce({
        total_processed: 0,
        success_count: 0,
        failed_count: 0,
      })

      await useClaudeSessionsStore.getState().generateBatchSummaries()

      const state = useClaudeSessionsStore.getState()
      expect(state.isBatchGenerating).toBe(false)
      expect(state.batchJustCompleted).toBe(true)
      // summary unchanged
      expect(state.sessions[0].summary).toBeNull()
    })

    it('handles empty generated_summaries array', async () => {
      useClaudeSessionsStore.setState({
        sessions: [{ session_id: 's-1', summary: null } as any],
      })
      mockApiClient.post.mockResolvedValueOnce({
        total_processed: 0,
        success_count: 0,
        failed_count: 0,
        generated_summaries: [],
      })

      await useClaudeSessionsStore.getState().generateBatchSummaries()

      expect(useClaudeSessionsStore.getState().isBatchGenerating).toBe(false)
    })

    it('sets error on failure and re-fetches pending count', async () => {
      mockApiClient.post.mockRejectedValueOnce(new Error('Failed to generate batch summaries'))
      // fetchPendingSummaryCount called after error
      mockApiClient.get.mockResolvedValueOnce({ pending_count: 10 })

      await useClaudeSessionsStore.getState().generateBatchSummaries()

      expect(useClaudeSessionsStore.getState().error).toBe('Failed to generate batch summaries')
      expect(useClaudeSessionsStore.getState().isBatchGenerating).toBe(false)
    })

    it('handles non-Error thrown values on failure', async () => {
      mockApiClient.post.mockRejectedValueOnce('crash')
      // fetchPendingSummaryCount called after error
      mockApiClient.get.mockResolvedValueOnce({ pending_count: 0 })

      await useClaudeSessionsStore.getState().generateBatchSummaries()

      expect(useClaudeSessionsStore.getState().error).toBe('Unknown error')
      expect(useClaudeSessionsStore.getState().isBatchGenerating).toBe(false)
    })

    it('pendingSummaryCount does not go below 0', async () => {
      useClaudeSessionsStore.setState({ pendingSummaryCount: 1 })
      mockApiClient.post.mockResolvedValueOnce({
        total_processed: 5,
        success_count: 5,
        failed_count: 0,
        generated_summaries: [],
      })

      await useClaudeSessionsStore.getState().generateBatchSummaries()

      expect(useClaudeSessionsStore.getState().pendingSummaryCount).toBe(0)
    })

    it('uses default limit of 50', async () => {
      mockApiClient.post.mockResolvedValueOnce({
        total_processed: 0,
        success_count: 0,
        failed_count: 0,
      })

      await useClaudeSessionsStore.getState().generateBatchSummaries()

      const url = mockApiClient.post.mock.calls[0][0] as string
      expect(url).toContain('limit=50')
      expect(url).toContain('skip_existing=true')
    })

    it('does not update sessions not in generated_summaries', async () => {
      useClaudeSessionsStore.setState({
        sessions: [
          { session_id: 's-1', summary: null } as any,
          { session_id: 's-2', summary: 'keep' } as any,
        ],
      })
      mockApiClient.post.mockResolvedValueOnce({
        total_processed: 1,
        success_count: 1,
        failed_count: 0,
        generated_summaries: [
          { session_id: 's-1', summary: 'New' },
        ],
      })

      await useClaudeSessionsStore.getState().generateBatchSummaries()

      expect(useClaudeSessionsStore.getState().sessions[1].summary).toBe('keep')
    })
  })
})
