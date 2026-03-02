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
  })

  // ── fetchDatasetStats ──────────────────────────────────

  describe('fetchDatasetStats', () => {
    it('fetches and stores dataset stats', async () => {
      const dsStats = { total_entries: 50, positive_entries: 40 }
      mockApiClient.get.mockResolvedValueOnce(dsStats)

      await useFeedbackStore.getState().fetchDatasetStats()

      expect(useFeedbackStore.getState().datasetStats).toEqual(dsStats)
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
})
