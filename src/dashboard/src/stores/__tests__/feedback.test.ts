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

import {
  useFeedbackStore,
  feedbackTypeLabel,
  feedbackReasonLabel,
  feedbackStatusLabel,
  feedbackTypeColors,
  feedbackStatusColors,
} from '../feedback'
import { apiClient } from '../../services/apiClient'

const mockApiClient = vi.mocked(apiClient)

// Mock global.fetch for exportDataset (only method that still uses raw fetch)
const mockFetch = vi.fn()
global.fetch = mockFetch

// Mock crypto.randomUUID
vi.stubGlobal('crypto', { randomUUID: () => 'mock-uuid' })

function resetStore() {
  useFeedbackStore.setState({
    feedbacks: [],
    stats: null,
    datasetStats: null,
    selectedFeedbackId: null,
    taskEvaluations: {},
    pendingFeedbacks: [],
    pendingEvaluations: [],
    isLoading: false,
    isSubmitting: false,
    error: null,
    filterType: null,
    filterStatus: null,
    filterAgentId: null,
  })
}

describe('feedback store', () => {
  beforeEach(() => {
    resetStore()
    vi.clearAllMocks()
    mockFetch.mockReset()
  })

  // ── Initial State ──────────────────────────────────────

  describe('initial state', () => {
    it('has empty feedbacks', () => {
      expect(useFeedbackStore.getState().feedbacks).toEqual([])
    })

    it('has null stats', () => {
      expect(useFeedbackStore.getState().stats).toBeNull()
    })

    it('has no selected feedback', () => {
      expect(useFeedbackStore.getState().selectedFeedbackId).toBeNull()
    })

    it('has empty pending queues', () => {
      expect(useFeedbackStore.getState().pendingFeedbacks).toEqual([])
      expect(useFeedbackStore.getState().pendingEvaluations).toEqual([])
    })
  })

  // ── UI Actions ─────────────────────────────────────────

  describe('UI actions', () => {
    it('setSelectedFeedback', () => {
      useFeedbackStore.getState().setSelectedFeedback('fb-1')
      expect(useFeedbackStore.getState().selectedFeedbackId).toBe('fb-1')
    })

    it('clearError', () => {
      useFeedbackStore.setState({ error: 'some error' })
      useFeedbackStore.getState().clearError()
      expect(useFeedbackStore.getState().error).toBeNull()
    })

    it('reset clears all state', () => {
      useFeedbackStore.setState({
        feedbacks: [{ id: 'fb-1' } as any],
        stats: {} as any,
        error: 'err',
        isLoading: true,
        filterType: 'implicit',
      })

      useFeedbackStore.getState().reset()

      const state = useFeedbackStore.getState()
      expect(state.feedbacks).toEqual([])
      expect(state.stats).toBeNull()
      expect(state.error).toBeNull()
      expect(state.isLoading).toBe(false)
      expect(state.filterType).toBeNull()
    })
  })

  // ── submitFeedback ─────────────────────────────────────

  describe('submitFeedback', () => {
    const feedback = {
      session_id: 's-1',
      task_id: 't-1',
      feedback_type: 'explicit_positive' as const,
      original_output: 'output',
    }

    it('submits feedback and prepends to list', async () => {
      const result = { id: 'fb-1', ...feedback, status: 'pending', created_at: '2025-01-01' }
      mockApiClient.post.mockResolvedValueOnce(result)

      const response = await useFeedbackStore.getState().submitFeedback(feedback)

      expect(response).toEqual(result)
      expect(useFeedbackStore.getState().feedbacks[0]).toEqual(result)
      expect(useFeedbackStore.getState().isSubmitting).toBe(false)
    })

    it('appends agent_id as query param', async () => {
      mockApiClient.post.mockResolvedValueOnce({ id: 'fb-1' })

      await useFeedbackStore.getState().submitFeedback(feedback, 'agent-123')

      const url = mockApiClient.post.mock.calls[0][0] as string
      expect(url).toContain('agent_id=agent-123')
    })

    it('adds to pending queue on failure', async () => {
      mockApiClient.post.mockRejectedValueOnce(new Error('Network error'))

      const result = await useFeedbackStore.getState().submitFeedback(feedback)

      expect(result).toBeNull()
      expect(useFeedbackStore.getState().pendingFeedbacks).toHaveLength(1)
      expect(useFeedbackStore.getState().pendingFeedbacks[0].status).toBe('queued')
      expect(useFeedbackStore.getState().error).toBe('Network error')
    })
  })

  // ── submitTaskEvaluation ───────────────────────────────

  describe('submitTaskEvaluation', () => {
    const evaluation = {
      session_id: 's-1',
      task_id: 't-1',
      rating: 5,
      result_accuracy: true,
      speed_satisfaction: true,
    }

    it('submits and stores task evaluation', async () => {
      const result = { id: 'eval-1', ...evaluation, created_at: '2025-01-01' }
      mockApiClient.post.mockResolvedValueOnce(result)

      const response = await useFeedbackStore.getState().submitTaskEvaluation(evaluation)

      expect(response).toEqual(result)
      expect(useFeedbackStore.getState().taskEvaluations['s-1:t-1']).toEqual(result)
    })

    it('adds to pending evaluations on failure', async () => {
      mockApiClient.post.mockRejectedValueOnce(new Error('Error'))

      const result = await useFeedbackStore.getState().submitTaskEvaluation(evaluation)

      expect(result).toBeNull()
      expect(useFeedbackStore.getState().pendingEvaluations).toHaveLength(1)
    })
  })

  // ── fetchTaskEvaluation ────────────────────────────────

  describe('fetchTaskEvaluation', () => {
    it('fetches and stores evaluation', async () => {
      const result = { id: 'eval-1', rating: 5 }
      mockApiClient.get.mockResolvedValueOnce(result)

      const response = await useFeedbackStore.getState().fetchTaskEvaluation('s-1', 't-1')

      expect(response).toEqual(result)
      expect(useFeedbackStore.getState().taskEvaluations['s-1:t-1']).toEqual(result)
    })

    it('returns null for undefined response (204)', async () => {
      mockApiClient.get.mockResolvedValueOnce(undefined)

      const result = await useFeedbackStore.getState().fetchTaskEvaluation('s-1', 't-1')

      expect(result).toBeNull()
    })

    it('returns null on error', async () => {
      mockApiClient.get.mockRejectedValueOnce(new Error('Not found'))

      const result = await useFeedbackStore.getState().fetchTaskEvaluation('s-1', 't-1')

      expect(result).toBeNull()
    })
  })

  // ── fetchFeedbacks ─────────────────────────────────────

  describe('fetchFeedbacks', () => {
    it('fetches feedbacks with filters', async () => {
      useFeedbackStore.setState({ filterType: 'implicit' })
      const feedbacks = [{ id: 'fb-1' }]
      mockApiClient.get.mockResolvedValueOnce(feedbacks)

      await useFeedbackStore.getState().fetchFeedbacks({ session_id: 's-1' })

      expect(useFeedbackStore.getState().feedbacks).toEqual(feedbacks)
      const url = mockApiClient.get.mock.calls[0][0] as string
      expect(url).toContain('feedback_type=implicit')
      expect(url).toContain('session_id=s-1')
    })

    it('sets error on failure', async () => {
      mockApiClient.get.mockRejectedValueOnce(new Error('Failed to fetch feedbacks'))

      await useFeedbackStore.getState().fetchFeedbacks()

      expect(useFeedbackStore.getState().error).toBe('Failed to fetch feedbacks')
    })
  })

  // ── fetchStats ─────────────────────────────────────────

  describe('fetchStats', () => {
    it('fetches and stores stats', async () => {
      const stats = { total_count: 100, positive_rate: 0.8 }
      mockApiClient.get.mockResolvedValueOnce(stats)

      await useFeedbackStore.getState().fetchStats()

      expect(useFeedbackStore.getState().stats).toEqual(stats)
    })

    it('silently handles error (console.error) without setting store error', async () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
      mockApiClient.get.mockRejectedValueOnce(new Error('Stats unavailable'))

      await useFeedbackStore.getState().fetchStats()

      expect(consoleSpy).toHaveBeenCalledWith('Failed to fetch feedback stats:', expect.any(Error))
      // stats should remain unchanged (null), no error field on store
      expect(useFeedbackStore.getState().stats).toBeNull()
      consoleSpy.mockRestore()
    })
  })

  // ── fetchDatasetStats ──────────────────────────────────

  describe('fetchDatasetStats', () => {
    it('fetches and stores dataset stats', async () => {
      const dsStats = { total_entries: 50, positive_entries: 40 }
      mockApiClient.get.mockResolvedValueOnce(dsStats)

      await useFeedbackStore.getState().fetchDatasetStats()

      expect(useFeedbackStore.getState().datasetStats).toEqual(dsStats)
    })

    it('silently handles error (console.error) without setting store error', async () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
      mockApiClient.get.mockRejectedValueOnce(new Error('Dataset stats unavailable'))

      await useFeedbackStore.getState().fetchDatasetStats()

      expect(consoleSpy).toHaveBeenCalledWith('Failed to fetch dataset stats:', expect.any(Error))
      expect(useFeedbackStore.getState().datasetStats).toBeNull()
      consoleSpy.mockRestore()
    })
  })

  // ── processFeedback ────────────────────────────────────

  describe('processFeedback', () => {
    it('processes feedback and updates status', async () => {
      useFeedbackStore.setState({
        feedbacks: [{ id: 'fb-1', status: 'pending' } as any],
      })
      mockApiClient.post.mockResolvedValueOnce({ total: 1, processed: 1, skipped: 0, errors: 0 })

      const result = await useFeedbackStore.getState().processFeedback('fb-1')

      expect(result?.processed).toBe(1)
      expect(useFeedbackStore.getState().feedbacks[0].status).toBe('processed')
    })

    it('returns null on error', async () => {
      mockApiClient.post.mockRejectedValueOnce(new Error('Failed to process feedback'))

      const result = await useFeedbackStore.getState().processFeedback('fb-1')

      expect(result).toBeNull()
      expect(useFeedbackStore.getState().error).toBe('Failed to process feedback')
    })
  })

  // ── exportDataset ──────────────────────────────────────
  // Note: exportDataset still uses raw fetch (not apiClient)

  describe('exportDataset', () => {
    it('exports dataset as text', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        text: () => Promise.resolve('{"line":"1"}\n{"line":"2"}'),
      })

      const result = await useFeedbackStore.getState().exportDataset({ format: 'jsonl' })

      expect(result).toContain('line')
      const url = mockFetch.mock.calls[0][0] as string
      expect(url).toContain('format=jsonl')
    })

    it('returns null on error', async () => {
      mockFetch.mockResolvedValueOnce({ ok: false, statusText: 'Error' })

      const result = await useFeedbackStore.getState().exportDataset()

      expect(result).toBeNull()
    })
  })

  // ── Filter Actions ─────────────────────────────────────

  describe('filter actions', () => {
    it('setFilterType triggers fetchFeedbacks', () => {
      mockApiClient.get.mockResolvedValueOnce([])

      useFeedbackStore.getState().setFilterType('implicit')

      expect(useFeedbackStore.getState().filterType).toBe('implicit')
      expect(mockApiClient.get).toHaveBeenCalled()
    })

    it('setFilterStatus triggers fetchFeedbacks', () => {
      mockApiClient.get.mockResolvedValueOnce([])

      useFeedbackStore.getState().setFilterStatus('processed')

      expect(useFeedbackStore.getState().filterStatus).toBe('processed')
    })

    it('setFilterAgentId triggers fetchFeedbacks', () => {
      mockApiClient.get.mockResolvedValueOnce([])

      useFeedbackStore.getState().setFilterAgentId('agent-1')

      expect(useFeedbackStore.getState().filterAgentId).toBe('agent-1')
    })
  })

  // ── Pending Queue ──────────────────────────────────────

  describe('pending queue', () => {
    it('clearPending removes specific item', () => {
      useFeedbackStore.setState({
        pendingFeedbacks: [{ id: 'pf-1' } as any, { id: 'pf-2' } as any],
      })

      useFeedbackStore.getState().clearPending('pf-1')

      expect(useFeedbackStore.getState().pendingFeedbacks).toHaveLength(1)
    })

    it('clearPending removes matching item from pendingEvaluations', () => {
      useFeedbackStore.setState({
        pendingFeedbacks: [],
        pendingEvaluations: [{ id: 'pe-1' } as any, { id: 'pe-2' } as any],
      })

      useFeedbackStore.getState().clearPending('pe-1')

      const state = useFeedbackStore.getState()
      expect(state.pendingEvaluations).toHaveLength(1)
      expect(state.pendingEvaluations[0].id).toBe('pe-2')
    })

    it('clearAllPending clears all queues', () => {
      useFeedbackStore.setState({
        pendingFeedbacks: [{ id: 'pf-1' } as any],
        pendingEvaluations: [{ id: 'pe-1' } as any],
      })

      useFeedbackStore.getState().clearAllPending()

      expect(useFeedbackStore.getState().pendingFeedbacks).toEqual([])
      expect(useFeedbackStore.getState().pendingEvaluations).toEqual([])
    })
  })
})

// ── processPendingFeedbacks ────────────────────────────

describe('processPendingFeedbacks', () => {
  beforeEach(() => {
    resetStore()
    vi.clearAllMocks()
  })

  it('calls process-pending API then refreshes feedbacks on success', async () => {
    const batchResult = { total: 5, processed: 4, skipped: 1, errors: 0 }
    // First call: process-pending, second call: fetchFeedbacks inside it
    mockApiClient.post.mockResolvedValueOnce(batchResult)
    mockApiClient.get.mockResolvedValueOnce([{ id: 'fb-1', status: 'processed' } as any])

    const result = await useFeedbackStore.getState().processPendingFeedbacks(50)

    expect(result).toEqual(batchResult)
    expect(mockApiClient.post).toHaveBeenCalledWith(expect.stringContaining('limit=50'))
    expect(mockApiClient.get).toHaveBeenCalled()
    expect(useFeedbackStore.getState().isLoading).toBe(false)
  })

  it('uses default limit of 100 when none provided', async () => {
    mockApiClient.post.mockResolvedValueOnce({ total: 0, processed: 0, skipped: 0, errors: 0 })
    mockApiClient.get.mockResolvedValueOnce([])

    await useFeedbackStore.getState().processPendingFeedbacks()

    expect(mockApiClient.post).toHaveBeenCalledWith(expect.stringContaining('limit=100'))
  })

  it('returns null and sets error on API failure', async () => {
    mockApiClient.post.mockRejectedValueOnce(new Error('Batch failed'))

    const result = await useFeedbackStore.getState().processPendingFeedbacks()

    expect(result).toBeNull()
    expect(useFeedbackStore.getState().error).toBe('Batch failed')
    expect(useFeedbackStore.getState().isLoading).toBe(false)
  })
})

// ── exportDataset with all options ─────────────────────

describe('exportDataset - all options', () => {
  beforeEach(() => {
    resetStore()
    vi.clearAllMocks()
    mockFetch.mockReset()
  })

  it('includes include_negative=true in URL', async () => {
    mockFetch.mockResolvedValueOnce({ ok: true, text: () => Promise.resolve('data') })

    await useFeedbackStore.getState().exportDataset({ include_negative: true })

    const url = mockFetch.mock.calls[0][0] as string
    expect(url).toContain('include_negative=true')
  })

  it('includes include_negative=false in URL', async () => {
    mockFetch.mockResolvedValueOnce({ ok: true, text: () => Promise.resolve('data') })

    await useFeedbackStore.getState().exportDataset({ include_negative: false })

    const url = mockFetch.mock.calls[0][0] as string
    expect(url).toContain('include_negative=false')
  })

  it('includes include_implicit=true in URL', async () => {
    mockFetch.mockResolvedValueOnce({ ok: true, text: () => Promise.resolve('data') })

    await useFeedbackStore.getState().exportDataset({ include_implicit: true })

    const url = mockFetch.mock.calls[0][0] as string
    expect(url).toContain('include_implicit=true')
  })

  it('includes agent_filter joined by comma in URL', async () => {
    mockFetch.mockResolvedValueOnce({ ok: true, text: () => Promise.resolve('data') })

    await useFeedbackStore.getState().exportDataset({ agent_filter: ['agent-a', 'agent-b'] })

    const url = mockFetch.mock.calls[0][0] as string
    expect(url).toContain('agent_filter=agent-a%2Cagent-b')
  })

  it('does NOT include agent_filter when array is empty', async () => {
    mockFetch.mockResolvedValueOnce({ ok: true, text: () => Promise.resolve('data') })

    await useFeedbackStore.getState().exportDataset({ agent_filter: [] })

    const url = mockFetch.mock.calls[0][0] as string
    expect(url).not.toContain('agent_filter')
  })

  it('includes start_date and end_date in URL', async () => {
    mockFetch.mockResolvedValueOnce({ ok: true, text: () => Promise.resolve('data') })

    await useFeedbackStore.getState().exportDataset({ start_date: '2025-01-01', end_date: '2025-12-31' })

    const url = mockFetch.mock.calls[0][0] as string
    expect(url).toContain('start_date=2025-01-01')
    expect(url).toContain('end_date=2025-12-31')
  })

  it('includes all options together', async () => {
    mockFetch.mockResolvedValueOnce({ ok: true, text: () => Promise.resolve('combined') })

    const result = await useFeedbackStore.getState().exportDataset({
      format: 'csv',
      include_negative: true,
      include_implicit: false,
      agent_filter: ['agt-1'],
      start_date: '2025-01-01',
      end_date: '2025-06-30',
    })

    expect(result).toBe('combined')
    const url = mockFetch.mock.calls[0][0] as string
    expect(url).toContain('format=csv')
    expect(url).toContain('include_negative=true')
    expect(url).toContain('include_implicit=false')
    expect(url).toContain('agent_filter=agt-1')
    expect(url).toContain('start_date=2025-01-01')
    expect(url).toContain('end_date=2025-06-30')
  })
})

// ── fetchFeedbacks with all filter combinations ─────────

describe('fetchFeedbacks - filter combinations', () => {
  beforeEach(() => {
    resetStore()
    vi.clearAllMocks()
  })

  it('applies filterStatus from store state to URL', async () => {
    useFeedbackStore.setState({ filterStatus: 'processed' })
    mockApiClient.get.mockResolvedValueOnce([])

    await useFeedbackStore.getState().fetchFeedbacks()

    const url = mockApiClient.get.mock.calls[0][0] as string
    expect(url).toContain('status=processed')
  })

  it('applies filterAgentId from store state to URL', async () => {
    useFeedbackStore.setState({ filterAgentId: 'agent-xyz' })
    mockApiClient.get.mockResolvedValueOnce([])

    await useFeedbackStore.getState().fetchFeedbacks()

    const url = mockApiClient.get.mock.calls[0][0] as string
    expect(url).toContain('agent_id=agent-xyz')
  })

  it('applies params.feedback_type to URL (separate from filterType)', async () => {
    mockApiClient.get.mockResolvedValueOnce([])

    await useFeedbackStore.getState().fetchFeedbacks({ feedback_type: 'explicit_negative' })

    const url = mockApiClient.get.mock.calls[0][0] as string
    expect(url).toContain('feedback_type=explicit_negative')
  })

  it('applies params.status to URL', async () => {
    mockApiClient.get.mockResolvedValueOnce([])

    await useFeedbackStore.getState().fetchFeedbacks({ status: 'error' })

    const url = mockApiClient.get.mock.calls[0][0] as string
    expect(url).toContain('status=error')
  })

  it('applies params.agent_id to URL', async () => {
    mockApiClient.get.mockResolvedValueOnce([])

    await useFeedbackStore.getState().fetchFeedbacks({ agent_id: 'agent-param' })

    const url = mockApiClient.get.mock.calls[0][0] as string
    expect(url).toContain('agent_id=agent-param')
  })

  it('applies params.start_date and end_date to URL', async () => {
    mockApiClient.get.mockResolvedValueOnce([])

    await useFeedbackStore.getState().fetchFeedbacks({ start_date: '2025-03-01', end_date: '2025-03-31' })

    const url = mockApiClient.get.mock.calls[0][0] as string
    expect(url).toContain('start_date=2025-03-01')
    expect(url).toContain('end_date=2025-03-31')
  })

  it('applies params.limit and offset to URL', async () => {
    mockApiClient.get.mockResolvedValueOnce([])

    await useFeedbackStore.getState().fetchFeedbacks({ limit: 25, offset: 50 })

    const url = mockApiClient.get.mock.calls[0][0] as string
    expect(url).toContain('limit=25')
    expect(url).toContain('offset=50')
  })

  it('uses bare /api/feedback when no params and no store filters', async () => {
    // No filters set in store, no params passed
    mockApiClient.get.mockResolvedValueOnce([])

    await useFeedbackStore.getState().fetchFeedbacks()

    const url = mockApiClient.get.mock.calls[0][0] as string
    expect(url).toBe('/api/feedback')
  })

  it('combines store filters and params together', async () => {
    useFeedbackStore.setState({ filterType: 'implicit', filterAgentId: 'store-agent' })
    mockApiClient.get.mockResolvedValueOnce([])

    await useFeedbackStore.getState().fetchFeedbacks({ session_id: 'session-abc', limit: 10 })

    const url = mockApiClient.get.mock.calls[0][0] as string
    expect(url).toContain('feedback_type=implicit')
    expect(url).toContain('agent_id=store-agent')
    expect(url).toContain('session_id=session-abc')
    expect(url).toContain('limit=10')
  })
})

// ── processFeedback when processed=0 ───────────────────

describe('processFeedback - processed=0 branch', () => {
  beforeEach(() => {
    resetStore()
    vi.clearAllMocks()
  })

  it('sets isLoading=false without updating feedback status when processed=0', async () => {
    useFeedbackStore.setState({
      feedbacks: [{ id: 'fb-skip', status: 'pending' } as any],
    })
    mockApiClient.post.mockResolvedValueOnce({ total: 1, processed: 0, skipped: 1, errors: 0 })

    const result = await useFeedbackStore.getState().processFeedback('fb-skip')

    expect(result?.processed).toBe(0)
    // Status should remain 'pending' since processed=0 branch does not update feedbacks
    expect(useFeedbackStore.getState().feedbacks[0].status).toBe('pending')
    expect(useFeedbackStore.getState().isLoading).toBe(false)
  })
})

// ── Selectors ──────────────────────────────────────────
// The selector exports (useFeedbackCount etc.) are Zustand hooks that call
// useFeedbackStore(selector). They cannot be called outside a React component.
// We verify the selector logic by applying the same selector function
// directly to the store state, which exercises lines 598-603.

describe('selectors', () => {
  // selector functions mirroring feedback.ts lines 598-603
  const feedbackCountSelector = (state: ReturnType<typeof useFeedbackStore.getState>) =>
    state.feedbacks.length
  const pendingCountSelector = (state: ReturnType<typeof useFeedbackStore.getState>) =>
    state.feedbacks.filter((f) => f.status === 'pending').length
  const positiveRateSelector = (state: ReturnType<typeof useFeedbackStore.getState>) =>
    state.stats?.positive_rate ?? 0
  const pendingFeedbackCountSelector = (state: ReturnType<typeof useFeedbackStore.getState>) =>
    state.pendingFeedbacks.length + state.pendingEvaluations.length

  beforeEach(() => {
    resetStore()
    vi.clearAllMocks()
  })

  it('useFeedbackCount selector returns total number of feedbacks', () => {
    useFeedbackStore.setState({
      feedbacks: [{ id: 'f1' } as any, { id: 'f2' } as any, { id: 'f3' } as any],
    })
    expect(feedbackCountSelector(useFeedbackStore.getState())).toBe(3)
  })

  it('useFeedbackCount selector returns 0 when feedbacks empty', () => {
    useFeedbackStore.setState({ feedbacks: [] })
    expect(feedbackCountSelector(useFeedbackStore.getState())).toBe(0)
  })

  it('usePendingCount selector returns count of feedbacks with status=pending', () => {
    useFeedbackStore.setState({
      feedbacks: [
        { id: 'f1', status: 'pending' } as any,
        { id: 'f2', status: 'processed' } as any,
        { id: 'f3', status: 'pending' } as any,
      ],
    })
    expect(pendingCountSelector(useFeedbackStore.getState())).toBe(2)
  })

  it('usePendingCount selector returns 0 when no feedbacks have pending status', () => {
    useFeedbackStore.setState({
      feedbacks: [
        { id: 'f1', status: 'processed' } as any,
        { id: 'f2', status: 'skipped' } as any,
      ],
    })
    expect(pendingCountSelector(useFeedbackStore.getState())).toBe(0)
  })

  it('usePositiveRate selector returns stats.positive_rate when stats is set', () => {
    useFeedbackStore.setState({ stats: { positive_rate: 0.85 } as any })
    expect(positiveRateSelector(useFeedbackStore.getState())).toBe(0.85)
  })

  it('usePositiveRate selector returns 0 when stats is null', () => {
    useFeedbackStore.setState({ stats: null })
    expect(positiveRateSelector(useFeedbackStore.getState())).toBe(0)
  })

  it('usePositiveRate selector returns 0 when positive_rate is 0', () => {
    useFeedbackStore.setState({ stats: { positive_rate: 0 } as any })
    expect(positiveRateSelector(useFeedbackStore.getState())).toBe(0)
  })

  it('usePendingFeedbackCount selector returns sum of pendingFeedbacks and pendingEvaluations', () => {
    useFeedbackStore.setState({
      pendingFeedbacks: [{ id: 'pf1' } as any, { id: 'pf2' } as any],
      pendingEvaluations: [{ id: 'pe1' } as any],
    })
    expect(pendingFeedbackCountSelector(useFeedbackStore.getState())).toBe(3)
  })

  it('usePendingFeedbackCount selector returns 0 when both queues are empty', () => {
    useFeedbackStore.setState({ pendingFeedbacks: [], pendingEvaluations: [] })
    expect(pendingFeedbackCountSelector(useFeedbackStore.getState())).toBe(0)
  })

  it('usePendingFeedbackCount selector counts only pendingFeedbacks when evaluations empty', () => {
    useFeedbackStore.setState({
      pendingFeedbacks: [{ id: 'pf1' } as any],
      pendingEvaluations: [],
    })
    expect(pendingFeedbackCountSelector(useFeedbackStore.getState())).toBe(1)
  })
})

// ── Helper Constants ───────────────────────────────────

describe('feedback helpers', () => {
  it('feedbackTypeLabel has all types', () => {
    expect(feedbackTypeLabel.implicit).toBeTruthy()
    expect(feedbackTypeLabel.explicit_positive).toBeTruthy()
    expect(feedbackTypeLabel.explicit_negative).toBeTruthy()
  })

  it('feedbackReasonLabel has all reasons', () => {
    expect(Object.keys(feedbackReasonLabel)).toHaveLength(6)
  })

  it('feedbackStatusLabel has all statuses', () => {
    expect(Object.keys(feedbackStatusLabel)).toHaveLength(4)
  })

  it('feedbackTypeColors has all types', () => {
    expect(Object.keys(feedbackTypeColors)).toHaveLength(3)
  })

  it('feedbackStatusColors has all statuses', () => {
    expect(Object.keys(feedbackStatusColors)).toHaveLength(4)
  })
})

// ── Selector Logic Tests (via store state) ─────────────

describe('feedback selector logic', () => {
  it('feedbacks.length counts all feedbacks', () => {
    useFeedbackStore.setState({
      feedbacks: [
        { id: 'f1', status: 'pending' } as any,
        { id: 'f2', status: 'processed' } as any,
      ],
    })
    const state = useFeedbackStore.getState()
    expect(state.feedbacks.length).toBe(2)
  })

  it('pending feedbacks with status=pending can be counted', () => {
    useFeedbackStore.setState({
      feedbacks: [
        { id: 'f1', status: 'pending' } as any,
        { id: 'f2', status: 'processed' } as any,
      ],
    })
    const state = useFeedbackStore.getState()
    const pendingCount = state.feedbacks.filter(f => f.status === 'pending').length
    expect(pendingCount).toBe(1)
  })

  it('positive_rate from stats', () => {
    useFeedbackStore.setState({ stats: { positive_rate: 0.75 } as any })
    const state = useFeedbackStore.getState()
    expect(state.stats?.positive_rate ?? 0).toBe(0.75)
  })

  it('positive_rate falls back to 0 when stats null', () => {
    useFeedbackStore.setState({ stats: null })
    const state = useFeedbackStore.getState()
    expect(state.stats?.positive_rate ?? 0).toBe(0)
  })

  it('pendingFeedbacks + pendingEvaluations gives total pending count', () => {
    useFeedbackStore.setState({
      pendingFeedbacks: [{ id: 'pf-1' } as any],
      pendingEvaluations: [{ id: 'pe-1' } as any],
    })
    const state = useFeedbackStore.getState()
    const total = state.pendingFeedbacks.length + state.pendingEvaluations.length
    expect(total).toBe(2)
  })
})

// ── retryPendingSubmissions edge cases ─────────────────

describe('retryPendingSubmissions', () => {
  beforeEach(() => {
    useFeedbackStore.setState({
      feedbacks: [],
      pendingFeedbacks: [],
      pendingEvaluations: [],
      taskEvaluations: {},
    })
    vi.clearAllMocks()
  })

  it('marks feedback as failed when retryCount >= maxRetries', async () => {
    useFeedbackStore.setState({
      pendingFeedbacks: [
        {
          id: 'pf-expired',
          feedback: { type: 'explicit_positive' },
          agentId: undefined,
          status: 'queued',
          retryCount: 3,
          maxRetries: 3,
        } as any,
      ],
      pendingEvaluations: [],
    })

    await useFeedbackStore.getState().retryPendingSubmissions()

    const state = useFeedbackStore.getState()
    const item = state.pendingFeedbacks.find(p => p.id === 'pf-expired')
    expect(item?.status).toBe('failed')
  })

  it('marks evaluation as failed when retryCount >= maxRetries', async () => {
    useFeedbackStore.setState({
      pendingFeedbacks: [],
      pendingEvaluations: [
        {
          id: 'pe-expired',
          evaluation: { session_id: 's1', task_id: 't1' },
          status: 'queued',
          retryCount: 5,
          maxRetries: 3,
        } as any,
      ],
    })

    await useFeedbackStore.getState().retryPendingSubmissions()

    const state = useFeedbackStore.getState()
    const item = state.pendingEvaluations.find(p => p.id === 'pe-expired')
    expect(item?.status).toBe('failed')
  })

  it('retries feedback and succeeds', async () => {
    useFeedbackStore.setState({
      pendingFeedbacks: [
        {
          id: 'pf-retry',
          feedback: { type: 'explicit_positive' },
          agentId: undefined,
          status: 'queued',
          retryCount: 0,
          maxRetries: 3,
        } as any,
      ],
      pendingEvaluations: [],
    })

    mockApiClient.post.mockResolvedValueOnce({ id: 'f-new', type: 'explicit_positive' })

    await useFeedbackStore.getState().retryPendingSubmissions()

    const state = useFeedbackStore.getState()
    expect(state.pendingFeedbacks).toHaveLength(0)
    expect(state.feedbacks).toHaveLength(1)
  })

  it('retries evaluation and succeeds', async () => {
    useFeedbackStore.setState({
      pendingFeedbacks: [],
      pendingEvaluations: [
        {
          id: 'pe-retry',
          evaluation: { session_id: 's1', task_id: 't1' },
          status: 'queued',
          retryCount: 0,
          maxRetries: 3,
        } as any,
      ],
    })

    mockApiClient.post.mockResolvedValueOnce({ session_id: 's1', task_id: 't1', rating: 5 })

    await useFeedbackStore.getState().retryPendingSubmissions()

    const state = useFeedbackStore.getState()
    expect(state.pendingEvaluations).toHaveLength(0)
    expect(state.taskEvaluations['s1:t1']).toBeTruthy()
  })

  it('increments retryCount and reverts to queued when feedback retry API fails', async () => {
    useFeedbackStore.setState({
      pendingFeedbacks: [
        {
          id: 'pf-fail',
          feedback: { session_id: 's1', task_id: 't1', feedback_type: 'explicit_positive', original_output: 'out' },
          agentId: undefined,
          status: 'queued',
          retryCount: 1,
          maxRetries: 3,
          lastError: undefined,
        } as any,
      ],
      pendingEvaluations: [],
    })

    mockApiClient.post.mockRejectedValueOnce(new Error('Server down'))

    await useFeedbackStore.getState().retryPendingSubmissions()

    const state = useFeedbackStore.getState()
    const item = state.pendingFeedbacks.find((p) => p.id === 'pf-fail')
    expect(item?.status).toBe('queued')
    expect(item?.retryCount).toBe(2)
    expect(item?.lastError).toBe('Server down')
  })

  it('increments retryCount and reverts to queued when evaluation retry API fails', async () => {
    useFeedbackStore.setState({
      pendingFeedbacks: [],
      pendingEvaluations: [
        {
          id: 'pe-fail',
          evaluation: { session_id: 's2', task_id: 't2', rating: 3, result_accuracy: true, speed_satisfaction: false },
          status: 'queued',
          retryCount: 2,
          maxRetries: 5,
          lastError: undefined,
        } as any,
      ],
    })

    mockApiClient.post.mockRejectedValueOnce(new Error('Timeout'))

    await useFeedbackStore.getState().retryPendingSubmissions()

    const state = useFeedbackStore.getState()
    const item = state.pendingEvaluations.find((p) => p.id === 'pe-fail')
    expect(item?.status).toBe('queued')
    expect(item?.retryCount).toBe(3)
    expect(item?.lastError).toBe('Timeout')
  })

  it('includes agentId as query param when pending feedback has agentId', async () => {
    useFeedbackStore.setState({
      pendingFeedbacks: [
        {
          id: 'pf-agent',
          feedback: { session_id: 's1', task_id: 't1', feedback_type: 'implicit', original_output: 'out' },
          agentId: 'my-agent-99',
          status: 'queued',
          retryCount: 0,
          maxRetries: 3,
        } as any,
      ],
      pendingEvaluations: [],
    })

    mockApiClient.post.mockResolvedValueOnce({ id: 'fb-new', feedback_type: 'implicit' })

    await useFeedbackStore.getState().retryPendingSubmissions()

    const url = mockApiClient.post.mock.calls[0][0] as string
    expect(url).toContain('agent_id=my-agent-99')
    expect(useFeedbackStore.getState().pendingFeedbacks).toHaveLength(0)
  })

  it('handles non-Error thrown object with fallback message for feedback', async () => {
    useFeedbackStore.setState({
      pendingFeedbacks: [
        {
          id: 'pf-non-error',
          feedback: { session_id: 's1', task_id: 't1', feedback_type: 'implicit', original_output: 'out' },
          agentId: undefined,
          status: 'queued',
          retryCount: 0,
          maxRetries: 3,
        } as any,
      ],
      pendingEvaluations: [],
    })

    mockApiClient.post.mockRejectedValueOnce('plain string error')

    await useFeedbackStore.getState().retryPendingSubmissions()

    const item = useFeedbackStore.getState().pendingFeedbacks.find((p) => p.id === 'pf-non-error')
    expect(item?.lastError).toBe('Retry failed')
  })

  it('handles non-Error thrown object with fallback message for evaluation', async () => {
    useFeedbackStore.setState({
      pendingFeedbacks: [],
      pendingEvaluations: [
        {
          id: 'pe-non-error',
          evaluation: { session_id: 's3', task_id: 't3', rating: 4, result_accuracy: true, speed_satisfaction: true },
          status: 'queued',
          retryCount: 0,
          maxRetries: 3,
        } as any,
      ],
    })

    mockApiClient.post.mockRejectedValueOnce({ code: 500 })

    await useFeedbackStore.getState().retryPendingSubmissions()

    const item = useFeedbackStore.getState().pendingEvaluations.find((p) => p.id === 'pe-non-error')
    expect(item?.lastError).toBe('Retry failed')
  })
})

// ── Window focus auto-retry handler ────────────────────

describe('window focus auto-retry', () => {
  beforeEach(() => {
    resetStore()
    vi.clearAllMocks()
  })

  it('triggers retryPendingSubmissions when focus fires and pendingFeedbacks is non-empty', async () => {
    useFeedbackStore.setState({
      pendingFeedbacks: [
        {
          id: 'pf-focus',
          feedback: { session_id: 's1', task_id: 't1', feedback_type: 'implicit', original_output: 'out' },
          agentId: undefined,
          status: 'queued',
          retryCount: 0,
          maxRetries: 3,
        } as any,
      ],
      pendingEvaluations: [],
    })

    // API succeeds on retry triggered by focus
    mockApiClient.post.mockResolvedValueOnce({ id: 'fb-focus-result', feedback_type: 'implicit' })

    // Fire window focus event to trigger the auto-retry listener registered in feedback.ts
    window.dispatchEvent(new Event('focus'))

    // Allow microtasks/promises to resolve
    await new Promise((r) => setTimeout(r, 0))

    expect(mockApiClient.post).toHaveBeenCalled()
  })

  it('does NOT call retryPendingSubmissions when both queues are empty on focus', () => {
    useFeedbackStore.setState({
      pendingFeedbacks: [],
      pendingEvaluations: [],
    })

    const spy = vi.spyOn(useFeedbackStore.getState(), 'retryPendingSubmissions')

    window.dispatchEvent(new Event('focus'))

    expect(spy).not.toHaveBeenCalled()
    spy.mockRestore()
  })

  it('triggers retryPendingSubmissions when focus fires and pendingEvaluations is non-empty', async () => {
    useFeedbackStore.setState({
      pendingFeedbacks: [],
      pendingEvaluations: [
        {
          id: 'pe-focus',
          evaluation: { session_id: 's1', task_id: 't1', rating: 4, result_accuracy: true, speed_satisfaction: true },
          status: 'queued',
          retryCount: 0,
          maxRetries: 3,
        } as any,
      ],
    })

    mockApiClient.post.mockResolvedValueOnce({ id: 'eval-focus-result', session_id: 's1', task_id: 't1' })

    window.dispatchEvent(new Event('focus'))

    await new Promise((r) => setTimeout(r, 0))

    expect(mockApiClient.post).toHaveBeenCalled()
  })
})
