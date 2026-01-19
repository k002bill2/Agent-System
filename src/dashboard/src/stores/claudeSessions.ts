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
  activeCount: number
  isLoading: boolean

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

  // Auto-refresh
  autoRefresh: boolean
  refreshInterval: number // in seconds

  // Error state
  error: string | null

  // Actions
  fetchSessions: (status?: SessionStatus) => Promise<void>
  setSortBy: (field: SortField) => void
  setSortOrder: (order: SortOrder) => void
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

  // Summary generation state
  generatingSummaryFor: string | null
  autoGenerateSummaries: boolean

  // SSE connection
  eventSource: EventSource | null
  startStreaming: (sessionId: string) => void
  stopStreaming: () => void
}

export const useClaudeSessionsStore = create<ClaudeSessionsState>((set, get) => ({
  // Initial state
  sessions: [],
  totalCount: 0,
  activeCount: 0,
  isLoading: false,

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

  autoRefresh: true,
  refreshInterval: 5,

  error: null,

  generatingSummaryFor: null,
  autoGenerateSummaries: true,  // Auto-generate summaries by default

  eventSource: null,

  // Actions
  fetchSessions: async (status?: SessionStatus) => {
    const { sortBy, sortOrder, autoGenerateSummaries } = get()
    set({ isLoading: true, error: null })

    try {
      const params = new URLSearchParams()
      if (status) {
        params.set('status', status)
      }
      params.set('sort_by', sortBy)
      params.set('sort_order', sortOrder)

      const res = await fetch(`${API_BASE}/claude-sessions?${params.toString()}`)
      if (!res.ok) {
        throw new Error(`Failed to fetch sessions: ${res.statusText}`)
      }

      const data: ClaudeSessionResponse = await res.json()
      set({
        sessions: data.sessions,
        totalCount: data.total_count,
        activeCount: data.active_count,
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

  setSortBy: (field: SortField) => {
    set({ sortBy: field })
    get().fetchSessions()
  },

  setSortOrder: (order: SortOrder) => {
    set({ sortOrder: order })
    get().fetchSessions()
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
}))
