/**
 * RLHF Feedback Store
 *
 * 피드백 수집, 조회, 처리, 데이터셋 관리를 위한 Zustand 스토어입니다.
 */

import { create } from 'zustand'

// ============================================================================
// Types
// ============================================================================

export type FeedbackType = 'implicit' | 'explicit_positive' | 'explicit_negative'
export type FeedbackReason = 'incorrect' | 'incomplete' | 'off_topic' | 'style' | 'performance' | 'other'
export type FeedbackStatus = 'pending' | 'processed' | 'skipped' | 'error'

export interface FeedbackSubmit {
  session_id: string
  task_id: string
  message_id?: string
  feedback_type: FeedbackType
  reason?: FeedbackReason
  reason_detail?: string
  original_output: string
  corrected_output?: string
}

export interface FeedbackEntry {
  id: string
  session_id: string
  task_id: string
  message_id?: string
  feedback_type: FeedbackType
  reason?: FeedbackReason
  reason_detail?: string
  original_output: string
  corrected_output?: string
  agent_id?: string
  project_name?: string
  effort_level?: string
  status: FeedbackStatus
  created_at: string
  processed_at?: string
}

export interface FeedbackStats {
  total_count: number
  by_type: Record<string, number>
  by_reason: Record<string, number>
  by_status: Record<string, number>
  by_agent: Record<string, number>
  positive_rate: number
  implicit_rate: number
}

export interface DatasetStats {
  total_entries: number
  positive_entries: number
  negative_entries: number
  by_agent: Record<string, number>
  by_feedback_type: Record<string, number>
  avg_input_length: number
  avg_output_length: number
  last_updated?: string
}

export interface BatchProcessResult {
  total: number
  processed: number
  skipped: number
  errors: number
}

export interface FeedbackQueryParams {
  session_id?: string
  feedback_type?: FeedbackType
  status?: FeedbackStatus
  agent_id?: string
  start_date?: string
  end_date?: string
  limit?: number
  offset?: number
}

export interface DatasetExportOptions {
  format?: 'jsonl' | 'csv'
  include_negative?: boolean
  include_implicit?: boolean
  agent_filter?: string[]
  start_date?: string
  end_date?: string
}

export interface TaskEvaluationSubmit {
  session_id: string
  task_id: string
  rating: number
  result_accuracy: boolean
  speed_satisfaction: boolean
  comment?: string
  agent_id?: string
  context_summary?: string
  project_name?: string
  effort_level?: string
}

export interface TaskEvaluationResponse {
  id: string
  session_id: string
  task_id: string
  rating: number
  result_accuracy: boolean
  speed_satisfaction: boolean
  comment?: string
  agent_id?: string
  created_at: string
}

// ============================================================================
// Store Interface
// ============================================================================

interface FeedbackState {
  // Data
  feedbacks: FeedbackEntry[]
  stats: FeedbackStats | null
  datasetStats: DatasetStats | null
  selectedFeedbackId: string | null
  taskEvaluations: Record<string, TaskEvaluationResponse>

  // UI State
  isLoading: boolean
  isSubmitting: boolean
  error: string | null

  // Filter State
  filterType: FeedbackType | null
  filterStatus: FeedbackStatus | null
  filterAgentId: string | null

  // Actions
  submitFeedback: (feedback: FeedbackSubmit, agentId?: string) => Promise<FeedbackEntry | null>
  submitTaskEvaluation: (evaluation: TaskEvaluationSubmit) => Promise<TaskEvaluationResponse | null>
  fetchTaskEvaluation: (sessionId: string, taskId: string) => Promise<TaskEvaluationResponse | null>
  fetchFeedbacks: (params?: FeedbackQueryParams) => Promise<void>
  fetchStats: () => Promise<void>
  fetchDatasetStats: () => Promise<void>
  processFeedback: (feedbackId: string) => Promise<BatchProcessResult | null>
  processPendingFeedbacks: (limit?: number) => Promise<BatchProcessResult | null>
  exportDataset: (options?: DatasetExportOptions) => Promise<string | null>
  setSelectedFeedback: (feedbackId: string | null) => void
  setFilterType: (type: FeedbackType | null) => void
  setFilterStatus: (status: FeedbackStatus | null) => void
  setFilterAgentId: (agentId: string | null) => void
  clearError: () => void
  reset: () => void
}

// ============================================================================
// API
// ============================================================================

const API_BASE = 'http://localhost:8000/api/feedback'

// ============================================================================
// Store Implementation
// ============================================================================

export const useFeedbackStore = create<FeedbackState>((set, get) => ({
  // Initial State
  feedbacks: [],
  stats: null,
  datasetStats: null,
  selectedFeedbackId: null,
  taskEvaluations: {},
  isLoading: false,
  isSubmitting: false,
  error: null,
  filterType: null,
  filterStatus: null,
  filterAgentId: null,

  // Actions
  submitFeedback: async (feedback: FeedbackSubmit, agentId?: string) => {
    set({ isSubmitting: true, error: null })

    try {
      let url = API_BASE
      if (agentId) {
        url += `?agent_id=${encodeURIComponent(agentId)}`
      }

      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(feedback),
      })

      if (!response.ok) {
        throw new Error(`Failed to submit feedback: ${response.statusText}`)
      }

      const result = await response.json()

      // 목록에 추가
      set((state) => ({
        feedbacks: [result, ...state.feedbacks],
        isSubmitting: false,
      }))

      return result
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to submit feedback'
      set({ error: message, isSubmitting: false })
      return null
    }
  },

  submitTaskEvaluation: async (evaluation: TaskEvaluationSubmit) => {
    set({ isSubmitting: true, error: null })

    try {
      const response = await fetch(`${API_BASE}/task-evaluation`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(evaluation),
      })

      if (!response.ok) {
        throw new Error(`Failed to submit task evaluation: ${response.statusText}`)
      }

      const result: TaskEvaluationResponse = await response.json()
      const key = `${evaluation.session_id}:${evaluation.task_id}`

      set((state) => ({
        taskEvaluations: { ...state.taskEvaluations, [key]: result },
        isSubmitting: false,
      }))

      return result
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to submit task evaluation'
      set({ error: message, isSubmitting: false })
      return null
    }
  },

  fetchTaskEvaluation: async (sessionId: string, taskId: string) => {
    try {
      const response = await fetch(
        `${API_BASE}/task-evaluation/${encodeURIComponent(sessionId)}/${encodeURIComponent(taskId)}`
      )

      if (response.status === 404) return null
      if (!response.ok) {
        throw new Error(`Failed to fetch task evaluation: ${response.statusText}`)
      }

      const result: TaskEvaluationResponse = await response.json()
      const key = `${sessionId}:${taskId}`

      set((state) => ({
        taskEvaluations: { ...state.taskEvaluations, [key]: result },
      }))

      return result
    } catch (error) {
      console.error('Failed to fetch task evaluation:', error)
      return null
    }
  },

  fetchFeedbacks: async (params?: FeedbackQueryParams) => {
    set({ isLoading: true, error: null })

    try {
      const { filterType, filterStatus, filterAgentId } = get()

      const queryParams = new URLSearchParams()

      // 스토어 필터 적용
      if (filterType) queryParams.append('feedback_type', filterType)
      if (filterStatus) queryParams.append('status', filterStatus)
      if (filterAgentId) queryParams.append('agent_id', filterAgentId)

      // 추가 파라미터 적용
      if (params?.session_id) queryParams.append('session_id', params.session_id)
      if (params?.feedback_type) queryParams.append('feedback_type', params.feedback_type)
      if (params?.status) queryParams.append('status', params.status)
      if (params?.agent_id) queryParams.append('agent_id', params.agent_id)
      if (params?.start_date) queryParams.append('start_date', params.start_date)
      if (params?.end_date) queryParams.append('end_date', params.end_date)
      if (params?.limit) queryParams.append('limit', params.limit.toString())
      if (params?.offset) queryParams.append('offset', params.offset.toString())

      const url = queryParams.toString() ? `${API_BASE}?${queryParams}` : API_BASE
      const response = await fetch(url)

      if (!response.ok) {
        throw new Error(`Failed to fetch feedbacks: ${response.statusText}`)
      }

      const feedbacks = await response.json()
      set({ feedbacks, isLoading: false })
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to fetch feedbacks'
      set({ error: message, isLoading: false })
    }
  },

  fetchStats: async () => {
    try {
      const response = await fetch(`${API_BASE}/stats`)

      if (!response.ok) {
        throw new Error(`Failed to fetch stats: ${response.statusText}`)
      }

      const stats = await response.json()
      set({ stats })
    } catch (error) {
      console.error('Failed to fetch feedback stats:', error)
    }
  },

  fetchDatasetStats: async () => {
    try {
      const response = await fetch(`${API_BASE}/dataset/stats`)

      if (!response.ok) {
        throw new Error(`Failed to fetch dataset stats: ${response.statusText}`)
      }

      const datasetStats = await response.json()
      set({ datasetStats })
    } catch (error) {
      console.error('Failed to fetch dataset stats:', error)
    }
  },

  processFeedback: async (feedbackId: string) => {
    set({ isLoading: true, error: null })

    try {
      const response = await fetch(`${API_BASE}/${feedbackId}/process`, {
        method: 'POST',
      })

      if (!response.ok) {
        throw new Error(`Failed to process feedback: ${response.statusText}`)
      }

      const result: BatchProcessResult = await response.json()

      // 피드백 상태 업데이트
      if (result.processed > 0) {
        set((state) => ({
          feedbacks: state.feedbacks.map((f) =>
            f.id === feedbackId ? { ...f, status: 'processed' as FeedbackStatus } : f
          ),
          isLoading: false,
        }))
      } else {
        set({ isLoading: false })
      }

      return result
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to process feedback'
      set({ error: message, isLoading: false })
      return null
    }
  },

  processPendingFeedbacks: async (limit = 100) => {
    set({ isLoading: true, error: null })

    try {
      const response = await fetch(`${API_BASE}/process-pending?limit=${limit}`, {
        method: 'POST',
      })

      if (!response.ok) {
        throw new Error(`Failed to process pending feedbacks: ${response.statusText}`)
      }

      const result: BatchProcessResult = await response.json()

      // 목록 새로고침
      await get().fetchFeedbacks()
      set({ isLoading: false })

      return result
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to process pending feedbacks'
      set({ error: message, isLoading: false })
      return null
    }
  },

  exportDataset: async (options?: DatasetExportOptions) => {
    set({ isLoading: true, error: null })

    try {
      const queryParams = new URLSearchParams()

      if (options?.format) queryParams.append('format', options.format)
      if (options?.include_negative !== undefined) {
        queryParams.append('include_negative', options.include_negative.toString())
      }
      if (options?.include_implicit !== undefined) {
        queryParams.append('include_implicit', options.include_implicit.toString())
      }
      if (options?.agent_filter?.length) {
        queryParams.append('agent_filter', options.agent_filter.join(','))
      }
      if (options?.start_date) queryParams.append('start_date', options.start_date)
      if (options?.end_date) queryParams.append('end_date', options.end_date)

      const url = `${API_BASE}/dataset/export?${queryParams}`
      const response = await fetch(url)

      if (!response.ok) {
        throw new Error(`Failed to export dataset: ${response.statusText}`)
      }

      const content = await response.text()
      set({ isLoading: false })

      return content
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to export dataset'
      set({ error: message, isLoading: false })
      return null
    }
  },

  setSelectedFeedback: (feedbackId: string | null) => {
    set({ selectedFeedbackId: feedbackId })
  },

  setFilterType: (type: FeedbackType | null) => {
    set({ filterType: type })
    get().fetchFeedbacks()
  },

  setFilterStatus: (status: FeedbackStatus | null) => {
    set({ filterStatus: status })
    get().fetchFeedbacks()
  },

  setFilterAgentId: (agentId: string | null) => {
    set({ filterAgentId: agentId })
    get().fetchFeedbacks()
  },

  clearError: () => {
    set({ error: null })
  },

  reset: () => {
    set({
      feedbacks: [],
      stats: null,
      datasetStats: null,
      selectedFeedbackId: null,
      taskEvaluations: {},
      isLoading: false,
      isSubmitting: false,
      error: null,
      filterType: null,
      filterStatus: null,
      filterAgentId: null,
    })
  },
}))

// ============================================================================
// Selectors
// ============================================================================

export const useFeedbackCount = () => useFeedbackStore((state) => state.feedbacks.length)
export const usePendingCount = () =>
  useFeedbackStore((state) => state.feedbacks.filter((f) => f.status === 'pending').length)
export const usePositiveRate = () => useFeedbackStore((state) => state.stats?.positive_rate ?? 0)

// ============================================================================
// Helper Functions
// ============================================================================

export const feedbackTypeLabel: Record<FeedbackType, string> = {
  implicit: 'Implicit (수정)',
  explicit_positive: 'Positive 👍',
  explicit_negative: 'Negative 👎',
}

export const feedbackReasonLabel: Record<FeedbackReason, string> = {
  incorrect: '결과가 틀림',
  incomplete: '불완전한 결과',
  off_topic: '주제에서 벗어남',
  style: '스타일/형식 문제',
  performance: '성능 문제',
  other: '기타',
}

export const feedbackStatusLabel: Record<FeedbackStatus, string> = {
  pending: '대기 중',
  processed: '처리됨',
  skipped: '건너뜀',
  error: '오류',
}

export const feedbackTypeColors: Record<FeedbackType, string> = {
  implicit: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400',
  explicit_positive: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400',
  explicit_negative: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400',
}

export const feedbackStatusColors: Record<FeedbackStatus, string> = {
  pending: 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300',
  processed: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400',
  skipped: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400',
  error: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400',
}
