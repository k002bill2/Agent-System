/**
 * The session API is admin/manager only, so a `role="user"` account gets 403
 * from every one of these calls. The store used to keep only `e.message`,
 * which left the surfaces unable to tell "you may not see this" apart from
 * "there is nothing here" — they all rendered an empty state.
 *
 * These tests pin the classification to the store, not the surfaces: one
 * `permissionDenied` flag that consumers read, instead of three components
 * each comparing a status code and drifting apart.
 */
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
import { ApiError, ApiErrorCode } from '../../services/errors'

const mockApiClient = vi.mocked(apiClient)

const emptyResponse = {
  sessions: [],
  total_count: 0,
  filtered_count: 0,
  active_count: 0,
  has_more: false,
  offset: 0,
}

const forbidden = () =>
  new ApiError({ message: 'Forbidden', status: 403, code: ApiErrorCode.FORBIDDEN })

const serverError = () =>
  new ApiError({
    message: 'Boom',
    status: 500,
    code: ApiErrorCode.INTERNAL_SERVER_ERROR,
  })

beforeEach(() => {
  vi.clearAllMocks()
  useClaudeSessionsStore.setState({
    sessions: [],
    totalCount: 0,
    filteredCount: 0,
    activeCount: 0,
    isLoading: false,
    isLoadingMore: false,
    offset: 0,
    hasMore: false,
    error: null,
    permissionDenied: false,
    // Auto-generation issues its own request; keep it out of these assertions.
    autoGenerateSummaries: false,
  })
})

describe('claudeSessions store — permission classification', () => {
  it('marks a 403 from fetchSessions as denied permission', async () => {
    mockApiClient.get.mockRejectedValueOnce(forbidden())

    await useClaudeSessionsStore.getState().fetchSessions()

    const state = useClaudeSessionsStore.getState()
    expect(state.permissionDenied).toBe(true)
    expect(state.error).not.toBeNull()
    expect(state.isLoading).toBe(false)
  })

  it('does not mark other failures as denied permission', async () => {
    mockApiClient.get.mockRejectedValueOnce(serverError())

    await useClaudeSessionsStore.getState().fetchSessions()

    const state = useClaudeSessionsStore.getState()
    expect(state.permissionDenied).toBe(false)
    expect(state.error).not.toBeNull()
  })

  /**
   * A denial that only hides the list leaves `SessionDetails`,
   * `ClaudeCodeTasks` and the SSE stream showing data the account may no
   * longer read — the mid-session demotion case (Codex [P1]).
   */
  it('drops cached session data and stops streaming on a 403', async () => {
    const close = vi.fn()
    useClaudeSessionsStore.setState({
      sessions: [{ session_id: 's1' }] as never,
      selectedSessionId: 's1',
      selectedSession: { session_id: 's1' } as never,
      transcriptEntries: [{ type: 'user' }] as never,
      totalCount: 1,
      activeCount: 1,
      eventSource: { close } as never,
    })
    mockApiClient.get.mockRejectedValueOnce(forbidden())

    await useClaudeSessionsStore.getState().fetchSessions()

    const state = useClaudeSessionsStore.getState()
    expect(state.permissionDenied).toBe(true)
    expect(state.sessions).toEqual([])
    expect(state.selectedSession).toBeNull()
    expect(state.selectedSessionId).toBeNull()
    expect(state.transcriptEntries).toEqual([])
    expect(state.eventSource).toBeNull()
    expect(close).toHaveBeenCalled()
  })

  it('marks a 403 from loadMoreSessions as denied permission', async () => {
    useClaudeSessionsStore.setState({ hasMore: true, sessions: [] })
    mockApiClient.get.mockRejectedValueOnce(forbidden())

    await useClaudeSessionsStore.getState().loadMoreSessions()

    expect(useClaudeSessionsStore.getState().permissionDenied).toBe(true)
  })

  /**
   * The flag that never comes back down is worse than the bug it replaces: an
   * admin who catches a single 403 would see a permanent "no permission"
   * screen. This is the transition a one-call assertion cannot see.
   */
  it('clears the flag once a call succeeds again', async () => {
    mockApiClient.get.mockRejectedValueOnce(forbidden())
    await useClaudeSessionsStore.getState().fetchSessions()
    expect(useClaudeSessionsStore.getState().permissionDenied).toBe(true)

    mockApiClient.get.mockResolvedValueOnce(emptyResponse)
    await useClaudeSessionsStore.getState().fetchSessions()

    const state = useClaudeSessionsStore.getState()
    expect(state.permissionDenied).toBe(false)
    expect(state.error).toBeNull()
  })

  /**
   * `clearError` is what the error banner's dismiss button calls. Dismissing a
   * message is not the same event as being granted access — clearing the flag
   * there drops the surfaces straight back to "No sessions found", which is
   * the bug this change exists to remove. The denial lifts on the next
   * successful request, not on a dismissal.
   */
  it('keeps the denial when the error banner is dismissed', () => {
    useClaudeSessionsStore.setState({ error: 'Forbidden', permissionDenied: true })

    useClaudeSessionsStore.getState().clearError()

    const state = useClaudeSessionsStore.getState()
    expect(state.error).toBeNull()
    expect(state.permissionDenied).toBe(true)
  })
})

describe('claudeSessions store — refreshSessions stays quiet except for 403', () => {
  it('keeps swallowing transient refresh failures', async () => {
    mockApiClient.get.mockRejectedValueOnce(serverError())

    await useClaudeSessionsStore.getState().refreshSessions()

    const state = useClaudeSessionsStore.getState()
    expect(state.error).toBeNull()
    expect(state.permissionDenied).toBe(false)
  })

  it('surfaces a 403 even on a background refresh', async () => {
    mockApiClient.get.mockRejectedValueOnce(forbidden())

    await useClaudeSessionsStore.getState().refreshSessions()

    const state = useClaudeSessionsStore.getState()
    expect(state.permissionDenied).toBe(true)
    expect(state.error).not.toBeNull()
  })

  /**
   * ClaudeCodeSessionSelector refreshes every 5 seconds, so a repeated denial
   * must not keep rewriting the same values — components that select `error`
   * or `permissionDenied` would re-render on every tick.
   *
   * The assertion counts writes to the denial slice specifically, not
   * notifications: `refreshSessions` opens with an unconditional
   * `set({ batchJustCompleted: false })`, so subscribers wake either way. That
   * is pre-existing behaviour and out of scope here.
   */
  it('does not rewrite the denial when it is unchanged', async () => {
    mockApiClient.get.mockRejectedValue(forbidden())
    await useClaudeSessionsStore.getState().refreshSessions()

    let denialWrites = 0
    const unsubscribe = useClaudeSessionsStore.subscribe((state, previous) => {
      if (
        state.permissionDenied !== previous.permissionDenied ||
        state.error !== previous.error
      ) {
        denialWrites += 1
      }
    })
    await useClaudeSessionsStore.getState().refreshSessions()
    unsubscribe()

    expect(denialWrites).toBe(0)
  })

  /**
   * `ClaudeSessionsPage` renders `error` as a dismissible banner. If the 5s
   * refresh rewrites the error after a dismissal, closing the banner does
   * nothing — it returns on the next tick. The denial itself is carried by the
   * flag, so the banner only has to be raised once.
   */
  it('does not resurrect a banner the user dismissed', async () => {
    mockApiClient.get.mockRejectedValue(forbidden())
    await useClaudeSessionsStore.getState().refreshSessions()
    useClaudeSessionsStore.getState().clearError()

    await useClaudeSessionsStore.getState().refreshSessions()

    const state = useClaudeSessionsStore.getState()
    expect(state.error).toBeNull()
    expect(state.permissionDenied).toBe(true)
  })

  it('clears the denial when a refresh succeeds', async () => {
    useClaudeSessionsStore.setState({ permissionDenied: true, error: 'Forbidden' })
    mockApiClient.get.mockResolvedValueOnce(emptyResponse)

    await useClaudeSessionsStore.getState().refreshSessions()

    expect(useClaudeSessionsStore.getState().permissionDenied).toBe(false)
  })
})

describe('claudeSessions store — auto-generation backs off when denied', () => {
  it('does not call the API while permission is denied', async () => {
    useClaudeSessionsStore.setState({
      permissionDenied: true,
      autoGenerateSummaries: true,
    })

    await useClaudeSessionsStore.getState().autoGenerateMissingSummaries()

    expect(mockApiClient.get).not.toHaveBeenCalled()
  })
})
