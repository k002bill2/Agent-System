/** claudeSessions 스토어의 타입 정의.
 *
 * `ClaudeSessionsState` 는 패키지 내부 전용이지만, 액션을 모듈로 승격할 때
 * `SetFn`/`GetFn` 타입이 이것을 참조하므로 export 한다.
 */
import type { AuthenticatedSseClient } from '../../services/authenticatedSse'
import type {
  ClaudeSessionDetail,
  ClaudeSessionInfo,
  SessionStatus,
  TranscriptEntry,
} from '../../types/claudeSession'

export type SortField = 'last_activity' | 'created_at' | 'message_count' | 'estimated_cost' | 'project_name'
export type SortOrder = 'asc' | 'desc'
export type ProviderFilter = 'all' | 'claude' | 'codex'

export interface ClaudeSessionsState {
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
  providerFilter: ProviderFilter
  searchQuery: string

  // Source users
  sourceUsers: string[]
  currentUser: string

  // All projects (from API)
  allProjects: string[]
  projectsFetchError: boolean

  // Auto-refresh
  autoRefresh: boolean
  refreshInterval: number // in seconds

  // Error state
  error: string | null
  /**
   * The session API is admin/manager only. Classifying 403 here — once, in the
   * store — keeps every surface from comparing status codes on its own and
   * drifting apart on what counts as "you may not see this".
   */
  permissionDenied: boolean

  // Actions
  fetchSessions: (status?: SessionStatus, reset?: boolean) => Promise<void>
  loadMoreSessions: (status?: SessionStatus) => Promise<void>
  refreshSessions: (status?: SessionStatus) => Promise<void>
  fetchSourceUsers: () => Promise<void>
  fetchProjects: () => Promise<void>
  setSortBy: (field: SortField) => void
  setSortOrder: (order: SortOrder) => void
  setProjectFilter: (project: string | null) => void
  setSourceUserFilter: (user: string | null) => void
  setProviderFilter: (provider: ProviderFilter) => void
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
  autoGenerateMissingSummaries: () => Promise<void>

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
  batchJustCompleted: boolean
  batchProgress: { total: number; processed: number; success: number; failed: number }
  pendingSummaryCount: number

  // Batch summary actions
  fetchPendingSummaryCount: () => Promise<void>
  generateBatchSummaries: (limit?: number) => Promise<void>

  // SSE connection
  eventSource: AuthenticatedSseClient | null
  startStreaming: (sessionId: string) => void
  stopStreaming: () => void
}
