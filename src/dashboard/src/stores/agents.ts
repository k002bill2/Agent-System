/**
 * Agent Registry Store
 *
 * 등록된 에이전트 목록, 상태, 통계를 관리합니다.
 */

import { create } from 'zustand'

// Types
export type AgentCategory = 'development' | 'orchestration' | 'quality' | 'research'
export type AgentStatus = 'available' | 'busy' | 'unavailable' | 'error'

export interface AgentCapability {
  name: string
  description: string
  keywords: string[]
  priority: number
}

export interface Agent {
  id: string
  name: string
  description: string
  category: AgentCategory
  status: AgentStatus
  capabilities: AgentCapability[]
  specializations: string[]
  estimated_cost_per_task: number
  avg_execution_time_ms: number
  total_tasks_completed: number
  success_rate: number
  is_available: boolean
}

export interface AgentRegistryStats {
  total_agents: number
  available_agents: number
  busy_agents: number
  by_category: Record<string, number>
  total_tasks_completed: number
  avg_success_rate: number
}

export interface AgentSearchResult {
  agent: Agent
  score: number
}

export interface TaskAnalysisResult {
  success: boolean
  analysis?: {
    type: string
    analysis: {
      complexity_score: number
      effort_level: string
      requires_decomposition: boolean
      context_summary: string
      key_requirements: string[]
    }
    execution_plan: {
      strategy: string
      execution_order: string[]
      parallel_groups: string[][]
      subtasks: Record<string, {
        title: string
        agent: string | null
        dependencies: string[]
        effort: string
      }>
    }
    subtask_count: number
    strategy: string
  }
  error?: string
  execution_time_ms: number
  analysis_id?: string
}

// History types
export interface TaskAnalysisHistory {
  id: string
  project_id: string | null
  task_input: string
  success: boolean
  analysis: TaskAnalysisResult['analysis'] | null
  error: string | null
  execution_time_ms: number
  complexity_score: number | null
  effort_level: string | null
  subtask_count: number | null
  strategy: string | null
  created_at: string
}

interface AgentsState {
  // Data
  agents: Agent[]
  stats: AgentRegistryStats | null
  searchResults: AgentSearchResult[]
  lastAnalysis: TaskAnalysisResult | null

  // History Data
  analysisHistory: TaskAnalysisHistory[]
  historyLoading: boolean
  historyTotal: number
  historyHasMore: boolean
  historyProjectFilter: string | null
  selectedHistoryId: string | null

  // UI State
  isLoading: boolean
  error: string | null
  selectedAgentId: string | null
  categoryFilter: AgentCategory | null

  // Actions
  fetchAgents: (category?: AgentCategory, availableOnly?: boolean) => Promise<void>
  fetchStats: () => Promise<void>
  searchAgents: (query: string, category?: AgentCategory) => Promise<void>
  analyzeTask: (task: string, context?: Record<string, unknown>) => Promise<TaskAnalysisResult | null>
  setSelectedAgent: (agentId: string | null) => void
  setCategoryFilter: (category: AgentCategory | null) => void
  clearError: () => void

  // History Actions
  fetchAnalysisHistory: (projectId?: string | null, reset?: boolean) => Promise<void>
  loadMoreHistory: () => Promise<void>
  deleteAnalysis: (id: string) => Promise<boolean>
  selectHistoryItem: (item: TaskAnalysisHistory | null) => void
}

const API_BASE = 'http://localhost:8000/api'

export const useAgentsStore = create<AgentsState>((set, get) => ({
  // Initial state
  agents: [],
  stats: null,
  searchResults: [],
  lastAnalysis: null,

  // History state
  analysisHistory: [],
  historyLoading: false,
  historyTotal: 0,
  historyHasMore: false,
  historyProjectFilter: null,
  selectedHistoryId: null,

  // UI state
  isLoading: false,
  error: null,
  selectedAgentId: null,
  categoryFilter: null,

  // Actions
  fetchAgents: async (category?: AgentCategory, availableOnly: boolean = false) => {
    set({ isLoading: true, error: null })

    try {
      let url = `${API_BASE}/agents`
      const params = new URLSearchParams()

      if (category) {
        params.append('category', category)
      }
      if (availableOnly) {
        params.append('available_only', 'true')
      }

      if (params.toString()) {
        url += `?${params.toString()}`
      }

      const response = await fetch(url)

      if (!response.ok) {
        throw new Error(`Failed to fetch agents: ${response.statusText}`)
      }

      const agents: Agent[] = await response.json()
      set({ agents, isLoading: false })
    } catch (error) {
      set({
        error: error instanceof Error ? error.message : 'Failed to fetch agents',
        isLoading: false,
      })
    }
  },

  fetchStats: async () => {
    try {
      const response = await fetch(`${API_BASE}/agents/stats`)

      if (!response.ok) {
        throw new Error(`Failed to fetch stats: ${response.statusText}`)
      }

      const stats: AgentRegistryStats = await response.json()
      set({ stats })
    } catch (error) {
      console.error('Failed to fetch agent stats:', error)
    }
  },

  searchAgents: async (query: string, category?: AgentCategory) => {
    set({ isLoading: true, error: null })

    try {
      const response = await fetch(`${API_BASE}/agents/search`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query,
          category: category || null,
          limit: 10,
        }),
      })

      if (!response.ok) {
        throw new Error(`Failed to search agents: ${response.statusText}`)
      }

      const results: AgentSearchResult[] = await response.json()
      set({ searchResults: results, isLoading: false })
    } catch (error) {
      set({
        error: error instanceof Error ? error.message : 'Failed to search agents',
        isLoading: false,
      })
    }
  },

  analyzeTask: async (task: string, context?: Record<string, unknown>) => {
    set({ isLoading: true, error: null })

    try {
      const response = await fetch(`${API_BASE}/agents/orchestrate/analyze`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ task, context: context || null }),
      })

      if (!response.ok) {
        throw new Error(`Failed to analyze task: ${response.statusText}`)
      }

      const result: TaskAnalysisResult = await response.json()
      set({ lastAnalysis: result, isLoading: false })

      // Refresh history after successful analysis
      const projectId = context?.project_id as string | undefined
      get().fetchAnalysisHistory(projectId, true)

      return result
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Failed to analyze task'
      set({
        error: errorMsg,
        isLoading: false,
        lastAnalysis: { success: false, error: errorMsg, execution_time_ms: 0 },
      })
      return null
    }
  },

  setSelectedAgent: (agentId: string | null) => {
    set({ selectedAgentId: agentId })
  },

  setCategoryFilter: (category: AgentCategory | null) => {
    set({ categoryFilter: category })
    // 필터 변경 시 다시 fetch
    get().fetchAgents(category || undefined)
  },

  clearError: () => {
    set({ error: null })
  },

  // History Actions
  fetchAnalysisHistory: async (projectId?: string | null, reset: boolean = false) => {
    const state = get()

    // If reset or project filter changed, clear existing history
    if (reset || projectId !== state.historyProjectFilter) {
      set({
        analysisHistory: [],
        historyTotal: 0,
        historyHasMore: false,
        historyProjectFilter: projectId ?? null,
      })
    }

    set({ historyLoading: true })

    try {
      const params = new URLSearchParams()
      if (projectId) {
        params.append('project_id', projectId)
      }
      params.append('limit', '20')
      params.append('offset', '0')

      const response = await fetch(`${API_BASE}/agents/orchestrate/analyses?${params.toString()}`)

      if (!response.ok) {
        throw new Error(`Failed to fetch analysis history: ${response.statusText}`)
      }

      const data = await response.json()
      set({
        analysisHistory: data.items,
        historyTotal: data.total,
        historyHasMore: data.has_more,
        historyLoading: false,
      })
    } catch (error) {
      console.error('Failed to fetch analysis history:', error)
      set({ historyLoading: false })
    }
  },

  loadMoreHistory: async () => {
    const state = get()
    if (state.historyLoading || !state.historyHasMore) return

    set({ historyLoading: true })

    try {
      const params = new URLSearchParams()
      if (state.historyProjectFilter) {
        params.append('project_id', state.historyProjectFilter)
      }
      params.append('limit', '20')
      params.append('offset', String(state.analysisHistory.length))

      const response = await fetch(`${API_BASE}/agents/orchestrate/analyses?${params.toString()}`)

      if (!response.ok) {
        throw new Error(`Failed to load more history: ${response.statusText}`)
      }

      const data = await response.json()
      set({
        analysisHistory: [...state.analysisHistory, ...data.items],
        historyTotal: data.total,
        historyHasMore: data.has_more,
        historyLoading: false,
      })
    } catch (error) {
      console.error('Failed to load more history:', error)
      set({ historyLoading: false })
    }
  },

  deleteAnalysis: async (id: string) => {
    try {
      const response = await fetch(`${API_BASE}/agents/orchestrate/analyses/${id}`, {
        method: 'DELETE',
      })

      if (!response.ok) {
        throw new Error(`Failed to delete analysis: ${response.statusText}`)
      }

      // Remove from local state and clear selection if deleted item was selected
      set((state) => ({
        analysisHistory: state.analysisHistory.filter((item) => item.id !== id),
        historyTotal: state.historyTotal - 1,
        selectedHistoryId: state.selectedHistoryId === id ? null : state.selectedHistoryId,
        lastAnalysis: state.selectedHistoryId === id ? null : state.lastAnalysis,
      }))

      return true
    } catch (error) {
      console.error('Failed to delete analysis:', error)
      return false
    }
  },

  selectHistoryItem: (item: TaskAnalysisHistory | null) => {
    if (!item) {
      set({ selectedHistoryId: null, lastAnalysis: null })
      return
    }

    // Convert history item to TaskAnalysisResult format
    const result: TaskAnalysisResult = {
      success: item.success,
      analysis: item.analysis ?? undefined,
      error: item.error ?? undefined,
      execution_time_ms: item.execution_time_ms,
      analysis_id: item.id,
    }

    set({
      selectedHistoryId: item.id,
      lastAnalysis: result,
    })
  },
}))
