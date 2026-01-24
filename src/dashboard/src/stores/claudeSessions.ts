import { create } from 'zustand'
import {
  ClaudeSessionInfo,
  ClaudeSessionDetail,
  ClaudeSessionResponse,
  SessionStatus,
  TranscriptEntry,
  TranscriptResponse,
} from '../types/claudeSession'

const API_BASE = '/api'

export type SortField = 'last_activity' | 'created_at' | 'message_count' | 'estimated_cost' | 'project_name'
export type SortOrder = 'asc' | 'desc'

interface ClaudeSessionsState {
  // Session list
  sessions: ClaudeSessionInfo[]
  totalCount: number
  filteredCount: number  // Count after filtering (for pagination)
  activeCount: number
  isLoading: boolean

  // Pagination state
  offset: number
  hasMore: boolean
  pageSize: number
  isLoadingMore: boolean

  // Selected session details
  selectedSessionId: string | null
  selectedSession: ClaudeSessionDetail | null
  isLoadingDetails: boolean

  // Transcript state
  transcriptEntries: TranscriptEntry[]
  transcriptTotalCount: number
  transcriptHasMore: boolean
  transcriptOffset: number
  isLoadingTranscript: boolean

  // Sorting
  sortBy: SortField
  sortOrder: SortOrder

  // Filtering
  projectFilter: string | null
  sourceUserFilter: string | null
  searchQuery: string

  // Source users
  sourceUsers: string[]
  currentUser: string

  // Auto-refresh
  autoRefresh: boolean
  refreshInterval: number // in seconds

  // Error state
  error: string | null

  // Actions
  fetchSessions: (status?: SessionStatus, reset?: boolean) => Promise<void>
  loadMoreSessions: (status?: SessionStatus) => Promise<void>
  refreshSessions: (status?: SessionStatus) => Promise<void>
  fetchSourceUsers: () => Promise<void>
  setSortBy: (field: SortField) => void
  setSortOrder: (order: SortOrder) => void
  setProjectFilter: (project: string | null) => void
  setSourceUserFilter: (user: string | null) => void
  setSearchQuery: (query: string) => void
  getFilteredSessions: () => ClaudeSessionInfo[]
  getUniqueProjects: () => string[]
  getUniqueSourceUsers: () => string[]
  isExternalSession: (session: ClaudeSessionInfo) => boolean
  fetchSessionDetails: (sessionId: string) => Promise<void>
  fetchTranscript: (sessionId: string, offset?: number, limit?: number, append?: boolean) => Promise<void>
  clearTranscript: () => void
  selectSession: (sessionId: string | null) => void
  setAutoRefresh: (enabled: boolean) => void
  setRefreshInterval: (seconds: number) => void
  clearError: () => void
  generateSummary: (sessionId: string) => Promise<void>
  generateSummaryQuiet: (sessionId: string) => Promise<void>
  setAutoGenerateSummaries: (enabled: boolean) => void

  // Delete actions
  deleteSession: (sessionId: string) => Promise<boolean>
  deleteEmptySessions: () => Promise<{ deletedCount: number; deletedIds: string[] }>
  deleteGhostSessions: () => Promise<{ deletedCount: number; deletedIds: string[] }>
  getEmptySessionsCount: () => number
  getGhostSessionsCount: () => number
  isGhostSession: (session: ClaudeSessionInfo) => boolean

  // Summary generation state
  generatingSummaryFor: string | null
  autoGenerateSummaries: boolean

  // Batch summary generation state
  isBatchGenerating: boolean
  batchProgress: { total: number; processed: number; success: number; failed: number }
  pendingSummaryCount: number

  // Batch summary actions
  fetchPendingSummaryCount: () => Promise<void>
  generateBatchSummaries: (limit?: number) => Promise<void>

  // SSE connection
  eventSource: EventSource | null
  startStreaming: (sessionId: string) => void
  stopStreaming: () => void
}

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

  // Filtering initial state
  projectFilter: null,
  sourceUserFilter: null,
  searchQuery: '',

  // Source users initial state
  sourceUsers: [],
  currentUser: '',

  autoRefresh: true,
  refreshInterval: 5,

  error: null,

  generatingSummaryFor: null,
  autoGenerateSummaries: true,  // Auto-generate summaries by default

  // Batch summary initial state
  isBatchGenerating: false,
  batchProgress: { total: 0, processed: 0, success: 0, failed: 0 },
  pendingSummaryCount: 0,

  eventSource: null,

  // Actions
  fetchSessions: async (status?: SessionStatus, reset: boolean = true) => {
    const { sortBy, sortOrder, projectFilter, sourceUserFilter, pageSize, autoGenerateSummaries } = get()

    // If reset, start fresh
    if (reset) {
      set({ isLoading: true, error: null, offset: 0 })
    } else {
      set({ isLoading: true, error: null })
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
      params.set('sort_by', sortBy)
      params.set('sort_order', sortOrder)
      params.set('offset', currentOffset.toString())
      params.set('limit', pageSize.toString())

      const res = await fetch(`${API_BASE}/claude-sessions?${params.toString()}`)
      if (!res.ok) {
        throw new Error(`Failed to fetch sessions: ${res.statusText}`)
      }

      const data: ClaudeSessionResponse = await res.json()
      set({
        sessions: data.sessions,
        totalCount: data.total_count,
        filteredCount: data.filtered_count,
        activeCount: data.active_count,
        hasMore: data.has_more,
        offset: data.offset,
        isLoading: false,
      })

      // Auto-generate summaries for sessions without one
      if (autoGenerateSummaries) {
        const sessionsWithoutSummary = data.sessions.filter(s => !s.summary)
        // Generate summaries one by one to avoid overwhelming the LLM
        for (const session of sessionsWithoutSummary) {
          await get().generateSummaryQuiet(session.session_id)
        }
      }
    } catch (e) {
      const errorMessage = e instanceof Error ? e.message : 'Unknown error'
      set({ error: errorMessage, isLoading: false })
    }
  },

  loadMoreSessions: async (status?: SessionStatus) => {
    const { sortBy, sortOrder, projectFilter, sourceUserFilter, pageSize, sessions, hasMore, isLoadingMore } = get()

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
      params.set('sort_by', sortBy)
      params.set('sort_order', sortOrder)
      params.set('offset', nextOffset.toString())
      params.set('limit', pageSize.toString())

      const res = await fetch(`${API_BASE}/claude-sessions?${params.toString()}`)
      if (!res.ok) {
        throw new Error(`Failed to load more sessions: ${res.statusText}`)
      }

      const data: ClaudeSessionResponse = await res.json()
      set((state) => ({
        sessions: [...state.sessions, ...data.sessions],
        hasMore: data.has_more,
        offset: data.offset,
        isLoadingMore: false,
      }))
    } catch (e) {
      const errorMessage = e instanceof Error ? e.message : 'Unknown error'
      set({ error: errorMessage, isLoadingMore: false })
    }
  },

  refreshSessions: async (status?: SessionStatus) => {
    const { sortBy, sortOrder, projectFilter, sourceUserFilter, pageSize, sessions } = get()

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
      params.set('sort_by', sortBy)
      params.set('sort_order', sortOrder)
      params.set('offset', '0')
      params.set('limit', pageSize.toString())

      const res = await fetch(`${API_BASE}/claude-sessions?${params.toString()}`)
      if (!res.ok) {
        throw new Error(`Failed to refresh sessions: ${res.statusText}`)
      }

      const data: ClaudeSessionResponse = await res.json()

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

      set({
        sessions: mergedSessions,
        totalCount: data.total_count,
        filteredCount: data.filtered_count,
        activeCount: data.active_count,
      })
    } catch (e) {
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

  setSearchQuery: (query: string) => {
    set({ searchQuery: query })
  },

  fetchSourceUsers: async () => {
    try {
      const res = await fetch(`${API_BASE}/claude-sessions/source-users`)
      if (!res.ok) {
        return
      }

      const data = await res.json()
      set({
        sourceUsers: data.users || [],
        currentUser: data.current_user || '',
      })
    } catch {
      // Silently ignore errors
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
    const { sessions } = get()
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
      const res = await fetch(`${API_BASE}/claude-sessions/${sessionId}`)
      if (!res.ok) {
        throw new Error(`Failed to fetch session details: ${res.statusText}`)
      }

      const data: ClaudeSessionDetail = await res.json()
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
    set({ error: null })
  },

  fetchTranscript: async (sessionId: string, offset = 0, limit = 50, append = false) => {
    set({ isLoadingTranscript: true, error: null })

    try {
      const params = new URLSearchParams()
      params.set('offset', offset.toString())
      params.set('limit', limit.toString())

      const res = await fetch(`${API_BASE}/claude-sessions/${sessionId}/transcript?${params.toString()}`)
      if (!res.ok) {
        throw new Error(`Failed to fetch transcript: ${res.statusText}`)
      }

      const data: TranscriptResponse = await res.json()
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
    if (selectedSession?.status === 'completed') {
      return
    }

    const eventSource = new EventSource(
      `${API_BASE}/claude-sessions/${sessionId}/stream`,
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
      const res = await fetch(`${API_BASE}/claude-sessions/${sessionId}/summary`, {
        method: 'POST',
      })
      if (!res.ok) {
        throw new Error(`Failed to generate summary: ${res.statusText}`)
      }

      const data = await res.json()

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
      const res = await fetch(`${API_BASE}/claude-sessions/${sessionId}/summary`, {
        method: 'POST',
      })
      if (!res.ok) {
        set({ generatingSummaryFor: null })
        return
      }

      const data = await res.json()

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

  // Delete a single session
  deleteSession: async (sessionId: string) => {
    try {
      const res = await fetch(`${API_BASE}/claude-sessions/${sessionId}`, {
        method: 'DELETE',
      })
      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.detail || 'Failed to delete session')
      }

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
      const res = await fetch(`${API_BASE}/claude-sessions`, {
        method: 'DELETE',
      })
      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.detail || 'Failed to delete empty sessions')
      }

      const data = await res.json()
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
    return sessions.filter((s) => s.message_count === 0).length
  },

  // Get count of ghost sessions (message_count > 0 but no real messages)
  getGhostSessionsCount: () => {
    const { sessions } = get()
    return sessions.filter(
      (s) => s.message_count > 0 && s.user_message_count === 0 && s.assistant_message_count === 0
    ).length
  },

  // Check if a session is a ghost session
  isGhostSession: (session: ClaudeSessionInfo) => {
    return (
      session.message_count > 0 &&
      session.user_message_count === 0 &&
      session.assistant_message_count === 0
    )
  },

  // Delete all ghost sessions
  deleteGhostSessions: async () => {
    try {
      const res = await fetch(`${API_BASE}/claude-sessions/ghost`, {
        method: 'DELETE',
      })
      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.detail || 'Failed to delete ghost sessions')
      }

      const data = await res.json()
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
      const res = await fetch(`${API_BASE}/claude-sessions/summaries/pending-count`)
      if (!res.ok) return

      const data = await res.json()
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

      const res = await fetch(`${API_BASE}/claude-sessions/summaries/generate-batch?${params.toString()}`, {
        method: 'POST',
      })

      if (!res.ok) {
        throw new Error(`Failed to generate batch summaries: ${res.statusText}`)
      }

      const data = await res.json()

      // Update progress
      set({
        batchProgress: {
          total: data.total_processed,
          processed: data.total_processed,
          success: data.success_count,
          failed: data.failed_count,
        },
        isBatchGenerating: false,
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

      // Re-fetch pending count from server to get accurate count
      await get().fetchPendingSummaryCount()
    } catch (e) {
      const errorMessage = e instanceof Error ? e.message : 'Unknown error'
      set({ error: errorMessage, isBatchGenerating: false })
      // Also re-fetch on error to sync state
      await get().fetchPendingSummaryCount()
    }
  },
}))
