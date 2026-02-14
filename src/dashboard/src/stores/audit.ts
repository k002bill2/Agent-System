/**
 * Audit Trail Store
 *
 * Zustand store for managing audit logs state
 */

import { create } from 'zustand'
import { API_BASE_URL } from '../config/api'

// Types
export interface AuditLogEntry {
  id: string
  session_id: string | null
  user_id: string | null
  action: string
  resource_type: string
  resource_id: string | null
  old_value: Record<string, unknown> | null
  new_value: Record<string, unknown> | null
  changes: Record<string, unknown> | null
  agent_id: string | null
  ip_address: string | null
  user_agent: string | null
  metadata: Record<string, unknown>
  status: string
  error_message: string | null
  created_at: string
}

export interface AuditLogFilter {
  session_id?: string
  user_id?: string
  action?: string
  resource_type?: string
  status?: string
  start_date?: string
  end_date?: string
}

export interface AuditStats {
  total_actions: number
  tool_executions: number
  approvals: number
  errors: number
  actions_by_type: Record<string, number>
  actions_by_status: Record<string, number>
  recent_trend: { date: string; count: number }[]
}

interface AuditState {
  // Data
  logs: AuditLogEntry[]
  total: number
  stats: AuditStats | null

  // UI State
  isLoading: boolean
  isLoadingStats: boolean
  error: string | null

  // Pagination
  page: number
  pageSize: number

  // Filters
  filter: AuditLogFilter

  // Actions
  fetchLogs: () => Promise<void>
  fetchStats: (sessionId?: string) => Promise<void>
  setFilter: (filter: Partial<AuditLogFilter>) => void
  clearFilter: () => void
  setPage: (page: number) => void
  refresh: () => Promise<void>
}

/** 감사 로그 상태 관리 스토어 (조회, 필터, 통계). */
export const useAuditStore = create<AuditState>((set, get) => ({
  // Initial state
  logs: [],
  total: 0,
  stats: null,
  isLoading: false,
  isLoadingStats: false,
  error: null,
  page: 0,
  pageSize: 20,
  filter: {},

  // Fetch audit logs
  fetchLogs: async () => {
    const { filter, page, pageSize } = get()
    set({ isLoading: true, error: null })

    try {
      const params = new URLSearchParams()

      if (filter.session_id) params.set('session_id', filter.session_id)
      if (filter.user_id) params.set('user_id', filter.user_id)
      if (filter.action) params.set('action', filter.action)
      if (filter.resource_type) params.set('resource_type', filter.resource_type)
      if (filter.status) params.set('status', filter.status)
      if (filter.start_date) params.set('start_date', filter.start_date)
      if (filter.end_date) params.set('end_date', filter.end_date)

      params.set('limit', String(pageSize))
      params.set('offset', String(page * pageSize))

      const response = await fetch(`${API_BASE_URL}/api/audit?${params}`)

      if (!response.ok) {
        throw new Error('Failed to fetch audit logs')
      }

      const data = await response.json()

      set({
        logs: data.logs,
        total: data.total,
        isLoading: false,
      })
    } catch (error) {
      set({
        error: error instanceof Error ? error.message : 'Unknown error',
        isLoading: false,
      })
    }
  },

  // Fetch audit stats
  fetchStats: async (sessionId?: string) => {
    set({ isLoadingStats: true })

    try {
      const params = new URLSearchParams()
      if (sessionId) params.set('session_id', sessionId)

      const response = await fetch(`${API_BASE_URL}/api/audit/stats?${params}`)

      if (!response.ok) {
        // If stats endpoint doesn't exist, calculate from logs
        const { logs, total } = get()
        const toolExecutions = logs.filter(l => l.action.includes('tool_executed')).length
        const approvals = logs.filter(l => l.action.includes('approval')).length
        const errors = logs.filter(l => l.status === 'failed').length

        set({
          stats: {
            total_actions: total,
            tool_executions: toolExecutions,
            approvals: approvals,
            errors: errors,
            actions_by_type: {},
            actions_by_status: {},
            recent_trend: [],
          },
          isLoadingStats: false,
        })
        return
      }

      const data = await response.json()
      set({ stats: data, isLoadingStats: false })
    } catch {
      // Fallback: calculate stats locally
      const { logs, total } = get()
      const toolExecutions = logs.filter(l => l.action.includes('tool_executed')).length
      const approvals = logs.filter(l => l.action.includes('approval')).length
      const errors = logs.filter(l => l.status === 'failed').length

      set({
        stats: {
          total_actions: total,
          tool_executions: toolExecutions,
          approvals: approvals,
          errors: errors,
          actions_by_type: {},
          actions_by_status: {},
          recent_trend: [],
        },
        isLoadingStats: false,
      })
    }
  },

  // Set filter
  setFilter: (newFilter) => {
    set((state) => ({
      filter: { ...state.filter, ...newFilter },
      page: 0, // Reset to first page on filter change
    }))
    get().fetchLogs()
  },

  // Clear filters
  clearFilter: () => {
    set({ filter: {}, page: 0 })
    get().fetchLogs()
  },

  // Set page
  setPage: (page) => {
    set({ page })
    get().fetchLogs()
  },

  // Refresh all data
  refresh: async () => {
    const { filter } = get()
    await Promise.all([
      get().fetchLogs(),
      get().fetchStats(filter.session_id),
    ])
  },
}))

export default useAuditStore
