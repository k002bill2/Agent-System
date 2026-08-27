import { create } from 'zustand'
import {
  ClaudeSessionInfo,
  ClaudeSessionDetail,
  ClaudeSessionResponse,
  SessionStatus,
  TranscriptResponse,
} from '../../types/claudeSession'
import { apiClient } from '../../services/apiClient'
import { isApiError } from '../../services/errors'
import { getApiUrl } from '../../config/api'
import type { ClaudeSessionsState, ProviderFilter, SortField, SortOrder } from './types'

// 소비자 실측(2026-08-08): `SortField` 만 패키지 밖에서 쓰인다.
// `SortOrder` 는 쓰이지 않지만 `SortField` 와 짝이라 함께 노출한다.
export type { SortField, SortOrder } from './types'

/** 403 은 "데이터 없음" 이 아니라 권한 부족이다 — 그 구분을 여기서 한 번만 한다. */
const isForbidden = (e: unknown): boolean => isApiError(e) && e.status === 403

/** Claude 세션 목록/상세/스트리밍 상태 관리 스토어. */
export const useClaudeSessionsStore = create<ClaudeSessionsState>((set, get) => ({
  // Initial state
  sessions: [],
  totalCount: 0,
  filteredCount: 0,
  activeCount: 0,
  isLoading: false,

  // Pagination initial state
  offset: 0,
  hasMore: false,
  pageSize: 30,
  isLoadingMore: false,

  selectedSessionId: null,
  selectedSession: null,
  isLoadingDetails: false,

  // Transcript initial state
  transcriptEntries: [],
  transcriptTotalCount: 0,
  transcriptHasMore: false,
  transcriptOffset: 0,
  isLoadingTranscript: false,

  // Sorting initial state
  sortBy: 'last_activity',
  sortOrder: 'desc',

  // Filtering initial state - show all projects by default
  projectFilter: null,
  sourceUserFilter: null,
  searchQuery: '',

  // Source users initial state
  sourceUsers: [],
  currentUser: '',

  // All projects initial state
  allProjects: [],
  projectsFetchError: false,
  providerFilter: 'all',

  autoRefresh: true,
  refreshInterval: 5,

  error: null,
  permissionDenied: false,

  generatingSummaryFor: null,
  autoGenerateSummaries: true,  // Auto-generate summaries by default

  // Batch summary initial state
  isBatchGenerating: false,
  batchJustCompleted: false,
  batchProgress: { total: 0, processed: 0, success: 0, failed: 0 },
  pendingSummaryCount: 0,

  eventSource: null,

  // Actions
  fetchSessions: async (status?: SessionStatus, reset: boolean = true) => {
    const { sortBy, sortOrder, projectFilter, sourceUserFilter, providerFilter, pageSize, autoGenerateSummaries } = get()

    // If reset, start fresh
    if (reset) {
      set({ isLoading: true, error: null, offset: 0, batchJustCompleted: false })
    } else {
      set({ isLoading: true, error: null, batchJustCompleted: false })
    }

    try {
      const currentOffset = reset ? 0 : get().offset
      const params = new URLSearchParams()
      if (status) {
        params.set('status', status)
      }
      if (projectFilter) {
        params.set('project', projectFilter)
      }
      if (sourceUserFilter) {
        params.set('source_user', sourceUserFilter)
      }
      if (providerFilter !== 'all') {
        params.set('provider', providerFilter)
      }
      params.set('sort_by', sortBy)
      params.set('sort_order', sortOrder)
      params.set('offset', currentOffset.toString())
      params.set('limit', pageSize.toString())

      const data = await apiClient.get<ClaudeSessionResponse>(`/api/agent-sessions?${params.toString()}`)
      set({
        sessions: data.sessions,
        totalCount: data.total_count,
        filteredCount: data.filtered_count,
        activeCount: data.active_count,
        hasMore: data.has_more,
        offset: data.offset,
        isLoading: false,
        permissionDenied: false,
      })

      // Trigger auto-generate for missing summaries (non-blocking)
      if (autoGenerateSummaries) {
        get().autoGenerateMissingSummaries()
      }
    } catch (e) {
      const errorMessage = e instanceof Error ? e.message : 'Unknown error'
      // Assignment, not a conditional set: a non-403 failure must also lower
      // the flag, or a stale denial outlives the request that caused it.
      set({ error: errorMessage, isLoading: false, permissionDenied: isForbidden(e) })
    }
  },

  loadMoreSessions: async (status?: SessionStatus) => {
    const { sortBy, sortOrder, projectFilter, sourceUserFilter, providerFilter, pageSize, sessions, hasMore, isLoadingMore } = get()

    // Don't load more if already loading or no more data
    if (isLoadingMore || !hasMore) return

    set({ isLoadingMore: true, error: null })

    try {
      const nextOffset = sessions.length  // Use current loaded count as next offset
      const params = new URLSearchParams()
      if (status) {
        params.set('status', status)
      }
      if (projectFilter) {
        params.set('project', projectFilter)
      }
      if (sourceUserFilter) {
        params.set('source_user', sourceUserFilter)
      }
      if (providerFilter !== 'all') {
        params.set('provider', providerFilter)
      }
      params.set('sort_by', sortBy)
      params.set('sort_order', sortOrder)
      params.set('offset', nextOffset.toString())
      params.set('limit', pageSize.toString())

      const data = await apiClient.get<ClaudeSessionResponse>(`/api/agent-sessions?${params.toString()}`)
      set((state) => ({
        sessions: [...state.sessions, ...data.sessions],
        hasMore: data.has_more,
        offset: data.offset,
        isLoadingMore: false,
      }))
    } catch (e) {
      const errorMessage = e instanceof Error ? e.message : 'Unknown error'
      set({ error: errorMessage, isLoadingMore: false, permissionDenied: isForbidden(e) })
    }
  },

  refreshSessions: async (status?: SessionStatus) => {
    const { sortBy, sortOrder, projectFilter, sourceUserFilter, providerFilter, pageSize, sessions } = get()
    set({ batchJustCompleted: false })

    // Soft refresh: fetch first page and merge with existing data
    try {
      const params = new URLSearchParams()
      if (status) {
        params.set('status', status)
      }
      if (projectFilter) {
        params.set('project', projectFilter)
      }
      if (sourceUserFilter) {
        params.set('source_user', sourceUserFilter)
      }
      if (providerFilter !== 'all') {
        params.set('provider', providerFilter)
      }
      params.set('sort_by', sortBy)
      params.set('sort_order', sortOrder)
      params.set('offset', '0')
      params.set('limit', pageSize.toString())

      const data = await apiClient.get<ClaudeSessionResponse>(`/api/agent-sessions?${params.toString()}`)

      // Merge strategy:
      // 1. New sessions (not in current list) go to the top
      // 2. Existing sessions get updated data
      // 3. Sessions beyond the first page are kept as-is
      const existingIds = new Set(sessions.map(s => s.session_id))
      const newSessions = data.sessions.filter(s => !existingIds.has(s.session_id))
      const updatedExisting = sessions.map(session => {
        const updated = data.sessions.find(s => s.session_id === session.session_id)
        return updated || session
      })

      // Put new sessions at the start (they're the most recent)
      const mergedSessions = [...newSessions, ...updatedExisting]

      // A successful refresh lifts a previous denial; unrelated errors stay put.
      const denialLifted = get().permissionDenied
        ? { permissionDenied: false, error: null }
        : {}

      set({
        sessions: mergedSessions,
        totalCount: data.total_count,
        filteredCount: data.filtered_count,
        activeCount: data.active_count,
        ...denialLifted,
      })
    } catch (e) {
      // A refresh stays quiet about transient failures, but a 403 is not
      // transient — it is the answer, and the surfaces have to show it.
      if (isForbidden(e)) {
        const errorMessage = e instanceof Error ? e.message : 'Unknown error'
        const { permissionDenied, error } = get()
        // This runs on a 5s interval; writing the same denial again would wake
        // every subscriber on each tick.
        if (!permissionDenied || error !== errorMessage) {
          set({ permissionDenied: true, error: errorMessage })
        }
        return
      }
      // Silently fail on refresh - don't show error to user
      console.error('Failed to refresh sessions:', e)
    }
  },

  setSortBy: (field: SortField) => {
    set({ sortBy: field })
    get().fetchSessions()
  },

  setSortOrder: (order: SortOrder) => {
    set({ sortOrder: order })
    get().fetchSessions()
  },

  setProjectFilter: (project: string | null) => {
    set({ projectFilter: project })
    get().fetchSessions()
  },

  setSourceUserFilter: (user: string | null) => {
    set({ sourceUserFilter: user })
    get().fetchSessions()
  },

  setProviderFilter: (provider: ProviderFilter) => {
    set({ providerFilter: provider })
    get().fetchSessions()
  },

  setSearchQuery: (query: string) => {
    set({ searchQuery: query })
  },

  fetchSourceUsers: async () => {
    try {
      const data = await apiClient.get<{ users: string[]; current_user: string }>(`/api/claude-sessions/source-users`)
      set({
        sourceUsers: data.users || [],
        currentUser: data.current_user || '',
      })
    } catch {
      // Silently ignore errors
    }
  },

  fetchProjects: async () => {
    try {
      const data = await apiClient.get<{ projects: string[] }>(`/api/claude-sessions/projects`)
      set({
        allProjects: data.projects || [],
        projectsFetchError: false,
      })
    } catch (e) {
      console.error('Failed to fetch session projects:', e)
      set({ projectsFetchError: true })
    }
  },

  getFilteredSessions: () => {
    const { sessions, searchQuery } = get()
    if (!searchQuery.trim()) {
      return sessions
    }

    const lowerQuery = searchQuery.toLowerCase()
    return sessions.filter((session) => {
      const searchTargets = [
        session.summary,
        session.slug,
        session.session_id,
        session.project_name,
      ]
      return searchTargets.some((target) =>
        target?.toLowerCase().includes(lowerQuery)
      )
    })
  },

  getUniqueProjects: () => {
    const { allProjects, sessions } = get()
    // Return from API if available (includes all sessions)
    if (allProjects.length > 0) {
      return allProjects
    }
    // Fallback to loaded sessions only
    const projects = sessions
      .map((s) => s.project_name)
      .filter((p): p is string => p != null && p !== '')
    return [...new Set(projects)].sort()
  },

  getUniqueSourceUsers: () => {
    const { sessions } = get()
    const users = sessions
      .map((s) => s.source_user)
      .filter((u): u is string => u != null && u !== '')
    return [...new Set(users)].sort()
  },

  isExternalSession: (session: ClaudeSessionInfo) => {
    const { currentUser } = get()
    return session.source_user !== '' && session.source_user !== currentUser
  },

  fetchSessionDetails: async (sessionId: string) => {
    set({ isLoadingDetails: true, error: null })

    try {
      const data = await apiClient.get<ClaudeSessionDetail>(`/api/claude-sessions/${sessionId}`)
      set({
        selectedSession: data,
        selectedSessionId: sessionId,
        isLoadingDetails: false,
      })
    } catch (e) {
      const errorMessage = e instanceof Error ? e.message : 'Unknown error'
      set({ error: errorMessage, isLoadingDetails: false })
    }
  },

  selectSession: (sessionId: string | null) => {
    const { stopStreaming, fetchSessionDetails, startStreaming, autoRefresh } = get()

    // Stop any existing stream
    stopStreaming()

    if (sessionId === null) {
      set({ selectedSessionId: null, selectedSession: null })
      return
    }

    // Fetch details and optionally start streaming
    fetchSessionDetails(sessionId).then(() => {
      if (autoRefresh) {
        startStreaming(sessionId)
      }
    })
  },

  setAutoRefresh: (enabled: boolean) => {
    const { selectedSessionId, startStreaming, stopStreaming } = get()
    set({ autoRefresh: enabled })

    if (enabled && selectedSessionId) {
      startStreaming(selectedSessionId)
    } else {
      stopStreaming()
    }
  },

  setRefreshInterval: (seconds: number) => {
    set({ refreshInterval: seconds })
  },

  clearError: () => {
    // 배너를 닫는 것과 권한이 생기는 것은 다른 사건이다. 거부 사실은 다음
    // 성공 요청에서 내려간다 (Codex [P2]).
    set({ error: null })
  },

  fetchTranscript: async (sessionId: string, offset = 0, limit = 50, append = false) => {
    set({ isLoadingTranscript: true, error: null })

    try {
      const params = new URLSearchParams()
      params.set('offset', offset.toString())
      params.set('limit', limit.toString())

      const data = await apiClient.get<TranscriptResponse>(`/api/claude-sessions/${sessionId}/transcript?${params.toString()}`)
      set((state) => ({
        transcriptEntries: append
          ? [...state.transcriptEntries, ...data.entries]
          : data.entries,
        transcriptTotalCount: data.total_count,
        transcriptHasMore: data.has_more,
        transcriptOffset: data.offset,
        isLoadingTranscript: false,
      }))
    } catch (e) {
      const errorMessage = e instanceof Error ? e.message : 'Unknown error'
      set({ error: errorMessage, isLoadingTranscript: false })
    }
  },

  clearTranscript: () => {
    set({
      transcriptEntries: [],
      transcriptTotalCount: 0,
      transcriptHasMore: false,
      transcriptOffset: 0,
    })
  },

  startStreaming: (sessionId: string) => {
    const { eventSource: existing, stopStreaming, selectedSession } = get()

    // Close existing connection
    if (existing) {
      stopStreaming()
    }

    // Don't start streaming for completed sessions
    if (selectedSession?.status === 'completed' || selectedSession?.provider === 'codex') {
      return
    }

    const eventSource = new EventSource(
      getApiUrl(`/api/claude-sessions/${sessionId}/stream`),
    )

    eventSource.addEventListener('session_update', (event) => {
      try {
        const data: ClaudeSessionDetail = JSON.parse(event.data)
        // Preserve existing summary if server doesn't send one
        const currentSummary = get().selectedSession?.summary
        set({ selectedSession: { ...data, summary: data.summary || currentSummary } })

        // Also update in sessions list (preserve existing summary)
        set((state) => ({
          sessions: state.sessions.map((s) =>
            s.session_id === sessionId
              ? {
                  ...s,
                  status: data.status,
                  message_count: data.message_count,
                  tool_call_count: data.tool_call_count,
                  last_activity: data.last_activity,
                  estimated_cost: data.estimated_cost,
                  summary: data.summary || s.summary,
                }
              : s,
          ),
        }))
      } catch (e) {
        console.error('Failed to parse session update:', e)
      }
    })

    eventSource.addEventListener('session_completed', (event) => {
      try {
        const data: ClaudeSessionDetail = JSON.parse(event.data)
        // Preserve existing summary if server doesn't send one
        const currentSummary = get().selectedSession?.summary
        set({ selectedSession: { ...data, summary: data.summary || currentSummary } })
      } catch (e) {
        console.error('Failed to parse session completed:', e)
      }
      // Keep connection open in case session resumes
    })

    eventSource.addEventListener('session_ended', () => {
      stopStreaming()
    })

    eventSource.addEventListener('error', () => {
      // SSE connection closed - this is normal for completed sessions
      // Only log if we expected the connection to stay open
      const currentSession = get().selectedSession
      if (currentSession && currentSession.status !== 'completed') {
        console.warn('SSE connection closed unexpectedly')
      }
      stopStreaming()
    })

    set({ eventSource })
  },

  stopStreaming: () => {
    const { eventSource } = get()
    if (eventSource) {
      eventSource.close()
      set({ eventSource: null })
    }
  },

  generateSummary: async (sessionId: string) => {
    set({ generatingSummaryFor: sessionId })

    try {
      const data = await apiClient.post<{ summary: string }>(`/api/claude-sessions/${sessionId}/summary`)

      // Update session in list
      set((state) => ({
        sessions: state.sessions.map((s) =>
          s.session_id === sessionId ? { ...s, summary: data.summary } : s
        ),
        generatingSummaryFor: null,
      }))
    } catch (e) {
      const errorMessage = e instanceof Error ? e.message : 'Unknown error'
      set({ error: errorMessage, generatingSummaryFor: null })
    }
  },

  // Quiet version - shows loading state but no error display (for auto-generation)
  generateSummaryQuiet: async (sessionId: string) => {
    set({ generatingSummaryFor: sessionId })

    try {
      const data = await apiClient.post<{ summary: string }>(`/api/claude-sessions/${sessionId}/summary`)

      // Update session in list
      set((state) => ({
        sessions: state.sessions.map((s) =>
          s.session_id === sessionId ? { ...s, summary: data.summary } : s
        ),
        generatingSummaryFor: null,
      }))
    } catch {
      // Silently ignore errors for auto-generation
      set({ generatingSummaryFor: null })
    }
  },

  setAutoGenerateSummaries: (enabled: boolean) => {
    set({ autoGenerateSummaries: enabled })
  },

  // Auto-generate summaries for sessions without one (up to 200 sessions)
  autoGenerateMissingSummaries: async () => {
    const { autoGenerateSummaries, projectFilter, sourceUserFilter, sortBy, sortOrder, generatingSummaryFor } = get()
    if (!autoGenerateSummaries || generatingSummaryFor) return

    // Auto-generation is optimistic background work, not something the user
    // asked for. Without this guard a denied account fires one 403 per session.
    if (get().permissionDenied) return

    try {
      const params = new URLSearchParams()
      if (projectFilter) params.set('project', projectFilter)
      if (sourceUserFilter) params.set('source_user', sourceUserFilter)
      params.set('sort_by', sortBy)
      params.set('sort_order', sortOrder)
      params.set('offset', '0')
      params.set('limit', '200')

      const data = await apiClient.get<ClaudeSessionResponse>(`/api/agent-sessions?${params.toString()}`)
      const sessionsWithoutSummary = data.sessions.filter(
        s => (s.provider || 'claude') === 'claude' && !s.summary,
      )

      // Generate summaries one by one to avoid overwhelming the LLM
      for (const session of sessionsWithoutSummary) {
        if (!get().autoGenerateSummaries) break
        await get().generateSummaryQuiet(session.session_id)
      }

      // Refresh pending count after generation
      if (sessionsWithoutSummary.length > 0) {
        await get().fetchPendingSummaryCount()
      }
    } catch {
      // Silently fail for auto-generation
    }
  },

  // Delete a single session
  deleteSession: async (sessionId: string) => {
    try {
      await apiClient.delete(`/api/claude-sessions/${sessionId}`)

      // Remove from local state
      set((state) => ({
        sessions: state.sessions.filter((s) => s.session_id !== sessionId),
        totalCount: state.totalCount - 1,
        selectedSessionId: state.selectedSessionId === sessionId ? null : state.selectedSessionId,
        selectedSession: state.selectedSessionId === sessionId ? null : state.selectedSession,
      }))

      return true
    } catch (e) {
      const errorMessage = e instanceof Error ? e.message : 'Unknown error'
      set({ error: errorMessage })
      return false
    }
  },

  // Delete all empty sessions
  deleteEmptySessions: async () => {
    try {
      const data = await apiClient.delete<{ deleted_count: number; deleted_ids: string[] }>(`/api/claude-sessions`)
      const deletedIds: string[] = data.deleted_ids || []

      // Remove deleted sessions from local state
      set((state) => ({
        sessions: state.sessions.filter((s) => !deletedIds.includes(s.session_id)),
        totalCount: state.totalCount - deletedIds.length,
      }))

      return { deletedCount: data.deleted_count, deletedIds }
    } catch (e) {
      const errorMessage = e instanceof Error ? e.message : 'Unknown error'
      set({ error: errorMessage })
      return { deletedCount: 0, deletedIds: [] }
    }
  },

  // Get count of empty sessions
  getEmptySessionsCount: () => {
    const { sessions } = get()
    return sessions.filter((s) => (s.provider || 'claude') === 'claude' && s.message_count === 0).length
  },

  // Get count of ghost sessions (message_count > 0 but no real messages)
  getGhostSessionsCount: () => {
    const { sessions } = get()
    return sessions.filter(
      (s) =>
        (s.provider || 'claude') === 'claude' &&
        s.message_count > 0 && s.user_message_count === 0 && s.assistant_message_count === 0
    ).length
  },

  // Check if a session is a ghost session
  isGhostSession: (session: ClaudeSessionInfo) => {
    return (
      (session.provider || 'claude') === 'claude' &&
      session.message_count > 0 &&
      session.user_message_count === 0 &&
      session.assistant_message_count === 0
    )
  },

  // Delete all ghost sessions
  deleteGhostSessions: async () => {
    try {
      const data = await apiClient.delete<{ deleted_count: number; deleted_ids: string[] }>(`/api/claude-sessions/ghost`)
      const deletedIds: string[] = data.deleted_ids || []

      // Remove deleted sessions from local state
      set((state) => ({
        sessions: state.sessions.filter((s) => !deletedIds.includes(s.session_id)),
        totalCount: state.totalCount - deletedIds.length,
      }))

      return { deletedCount: data.deleted_count, deletedIds }
    } catch (e) {
      const errorMessage = e instanceof Error ? e.message : 'Unknown error'
      set({ error: errorMessage })
      return { deletedCount: 0, deletedIds: [] }
    }
  },

  // Fetch count of sessions without summaries
  fetchPendingSummaryCount: async () => {
    try {
      const { projectFilter } = get()
      const params = new URLSearchParams()
      if (projectFilter) params.set('project', projectFilter)
      const data = await apiClient.get<{ pending_count: number }>(`/api/claude-sessions/summaries/pending-count?${params.toString()}`)
      set({ pendingSummaryCount: data.pending_count })
    } catch {
      // Silently ignore errors
    }
  },

  // Generate summaries for multiple sessions at once
  generateBatchSummaries: async (limit = 50) => {
    const { isBatchGenerating } = get()
    if (isBatchGenerating) return

    set({
      isBatchGenerating: true,
      batchProgress: { total: 0, processed: 0, success: 0, failed: 0 },
      error: null,
    })

    try {
      const params = new URLSearchParams()
      params.set('limit', limit.toString())
      params.set('skip_existing', 'true')

      const data = await apiClient.post<{
        total_processed: number
        success_count: number
        failed_count: number
        generated_summaries?: { session_id: string; summary: string }[]
      }>(`/api/claude-sessions/summaries/generate-batch?${params.toString()}`)

      // Update progress and immediately reduce pendingSummaryCount
      const currentPendingCount = get().pendingSummaryCount
      set({
        batchProgress: {
          total: data.total_processed,
          processed: data.total_processed,
          success: data.success_count,
          failed: data.failed_count,
        },
        isBatchGenerating: false,
        batchJustCompleted: true,
        // Immediately update pendingSummaryCount to reflect completed summaries
        pendingSummaryCount: Math.max(0, currentPendingCount - data.success_count),
      })

      // Update sessions in list with new summaries
      if (data.generated_summaries && data.generated_summaries.length > 0) {
        const summaryMap = new Map<string, string>()
        for (const item of data.generated_summaries) {
          summaryMap.set(item.session_id, item.summary)
        }

        set((state) => ({
          sessions: state.sessions.map((s) => {
            const newSummary = summaryMap.get(s.session_id)
            return newSummary ? { ...s, summary: newSummary } : s
          }),
        }))
      }
    } catch (e) {
      const errorMessage = e instanceof Error ? e.message : 'Unknown error'
      set({ error: errorMessage, isBatchGenerating: false })
      // Also re-fetch on error to sync state
      await get().fetchPendingSummaryCount()
    }
  },
}))
