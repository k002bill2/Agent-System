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
  image_paths: string[] | null
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

  // Execution State
  executingAnalysisId: string | null
  executionSessionId: string | null
  executionError: string | null

  // UI State
  isLoading: boolean
  error: string | null
  selectedAgentId: string | null
  categoryFilter: AgentCategory | null

  // Image state
  attachedImages: File[]

  // OCR state (key = `${file.name}_${file.size}_${file.lastModified}`)
  ocrStatuses: Record<string, 'processing' | 'done' | 'error'>

  // Actions
  fetchAgents: (category?: AgentCategory, availableOnly?: boolean) => Promise<void>
  fetchStats: () => Promise<void>
  searchAgents: (query: string, category?: AgentCategory) => Promise<void>
  analyzeTask: (task: string, context?: Record<string, unknown>, images?: File[]) => Promise<TaskAnalysisResult | null>
  setSelectedAgent: (agentId: string | null) => void
  setCategoryFilter: (category: AgentCategory | null) => void
  clearError: () => void
  setAttachedImages: (images: File[]) => void
  addAttachedImages: (images: File[]) => void
  removeAttachedImage: (index: number) => void
  clearAttachedImages: () => void

  // OCR Actions
  extractTextFromImage: (file: File) => Promise<string | null>
  setOcrStatus: (fileKey: string, status: 'processing' | 'done' | 'error') => void
  removeOcrStatus: (fileKey: string) => void
  clearOcrStatuses: () => void

  // Execution Actions
  executeAnalysis: (analysisId: string, projectId?: string | null) => Promise<string | null>
  executeWithWarp: (analysisId: string, projectId?: string | null) => Promise<boolean>
  clearExecution: () => void

  // History Actions
  fetchAnalysisHistory: (projectId?: string | null, reset?: boolean) => Promise<void>
  loadMoreHistory: () => Promise<void>
  deleteAnalysis: (id: string) => Promise<boolean>
  selectHistoryItem: (item: TaskAnalysisHistory | null) => void
}

const API_BASE = 'http://localhost:8000/api'

/**
 * 분석 결과를 Claude Code CLI 프롬프트로 변환.
 * (백엔드 TmuxService.build_claude_prompt의 프론트엔드 포팅)
 */
function buildClaudePrompt(analysis: TaskAnalysisResult['analysis'], taskInput: string): string {
  const lines = [
    '# Execution Plan (from Task Analyzer)',
    '',
    '## Task',
    taskInput,
    '',
  ]

  const executionPlan = analysis?.execution_plan
  const subtasks = executionPlan?.subtasks || {}
  const parallelGroups = executionPlan?.parallel_groups || []

  if (parallelGroups.length > 0) {
    lines.push('## Subtasks (순서대로 실행)')
    lines.push('')

    for (let groupIdx = 0; groupIdx < parallelGroups.length; groupIdx++) {
      const group = parallelGroups[groupIdx]
      const isParallel = group.length > 1
      let stepLabel = `### Step ${groupIdx + 1}`
      if (isParallel) {
        stepLabel += ' (Parallel)'
      }
      lines.push(stepLabel)

      for (const taskId of group) {
        const subtask = subtasks[taskId]
        if (!subtask) continue
        const title = subtask.title || taskId
        const effort = subtask.effort || 'medium'
        const agent = subtask.agent
        const deps = subtask.dependencies || []

        let line = `- **${taskId}**: ${title} (effort: ${effort})`
        if (agent) {
          line += ` [agent: ${agent}]`
        }
        lines.push(line)
        if (deps.length > 0) {
          lines.push(`  - depends on: ${deps.join(', ')}`)
        }
      }

      lines.push('')
    }
  }

  lines.push(
    '## Instructions',
    '- 위 순서대로 서브태스크를 실행하세요',
    '- 각 서브태스크 완료 후 결과를 검증하세요',
    '- 가능한 경우 Claude Code 에이전트와 스킬을 활용하세요',
    '- 에러 발생 시 근본 원인을 분석하고 수정하세요',
  )

  return lines.join('\n')
}

/** 에이전트 레지스트리 및 태스크 분석 상태 관리 스토어. */
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

  // Execution state
  executingAnalysisId: null,
  executionSessionId: null,
  executionError: null,

  // Image state
  attachedImages: [],
  ocrStatuses: {},

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

  analyzeTask: async (task: string, context?: Record<string, unknown>, images?: File[]) => {
    set({ isLoading: true, error: null })

    const attachedImages = images || get().attachedImages

    try {
      let response: Response

      if (attachedImages.length > 0) {
        // Use multipart/form-data endpoint when images are attached
        const formData = new FormData()
        formData.append('task', task)
        if (context) {
          formData.append('context', JSON.stringify(context))
        }
        for (const img of attachedImages) {
          formData.append('images', img)
        }

        response = await fetch(`${API_BASE}/agents/orchestrate/analyze-with-images`, {
          method: 'POST',
          body: formData,
        })
      } else {
        // Use JSON endpoint when no images
        response = await fetch(`${API_BASE}/agents/orchestrate/analyze`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ task, context: context || null }),
        })
      }

      if (!response.ok) {
        throw new Error(`Failed to analyze task: ${response.statusText}`)
      }

      const result: TaskAnalysisResult = await response.json()
      set({ lastAnalysis: result, isLoading: false, attachedImages: [], ocrStatuses: {} })

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

  setAttachedImages: (images: File[]) => {
    set({ attachedImages: images })
  },

  addAttachedImages: (images: File[]) => {
    const current = get().attachedImages
    // Max 5 images
    const combined = [...current, ...images].slice(0, 5)
    set({ attachedImages: combined })
  },

  removeAttachedImage: (index: number) => {
    const current = get().attachedImages
    set({ attachedImages: current.filter((_, i) => i !== index) })
  },

  clearAttachedImages: () => {
    set({ attachedImages: [], ocrStatuses: {} })
  },

  // OCR Actions
  extractTextFromImage: async (file: File) => {
    try {
      const formData = new FormData()
      formData.append('image', file)

      const response = await fetch(`${API_BASE}/agents/ocr`, {
        method: 'POST',
        body: formData,
      })

      if (!response.ok) {
        throw new Error(`OCR failed: ${response.statusText}`)
      }

      const result = await response.json()

      if (!result.success) {
        console.error('OCR error:', result.error)
        return null
      }

      return result.text as string
    } catch (error) {
      console.error('OCR request failed:', error)
      return null
    }
  },

  setOcrStatus: (fileKey: string, status: 'processing' | 'done' | 'error') => {
    set((state) => ({
      ocrStatuses: { ...state.ocrStatuses, [fileKey]: status },
    }))
  },

  removeOcrStatus: (fileKey: string) => {
    set((state) => {
      const { [fileKey]: _, ...rest } = state.ocrStatuses
      return { ocrStatuses: rest }
    })
  },

  clearOcrStatuses: () => {
    set({ ocrStatuses: {} })
  },

  // Execution Actions
  executeAnalysis: async (analysisId: string, projectId?: string | null) => {
    set({ executingAnalysisId: analysisId, executionError: null })

    try {
      const response = await fetch(`${API_BASE}/agents/orchestrate/execute-analysis`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          analysis_id: analysisId,
          project_id: projectId || null,
        }),
      })

      if (!response.ok) {
        throw new Error(`Failed to execute analysis: ${response.statusText}`)
      }

      const result = await response.json()

      if (!result.success) {
        set({
          executingAnalysisId: null,
          executionError: result.error || 'Execution failed',
        })
        return null
      }

      set({ executionSessionId: result.session_id })
      return result.session_id as string
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Failed to execute analysis'
      set({
        executingAnalysisId: null,
        executionError: errorMsg,
      })
      return null
    }
  },

  // Execute analysis via Warp terminal with Claude CLI
  executeWithWarp: async (analysisId: string, projectId?: string | null) => {
    set({ executingAnalysisId: analysisId, executionError: null })

    try {
      // 1. 분석 결과 조회
      const analysisResp = await fetch(`${API_BASE}/agents/orchestrate/analyses/${analysisId}`)
      if (!analysisResp.ok) {
        throw new Error(`분석 결과를 찾을 수 없습니다 (${analysisResp.status})`)
      }
      const analysisData = await analysisResp.json()

      // 2. 분석 → 프롬프트 텍스트 변환 (프론트엔드에서 수행)
      const prompt = buildClaudePrompt(analysisData.analysis, analysisData.task_input)

      // 3. project_id로 project 찾기 (path 필요)
      const pid = projectId || analysisData.project_id
      if (!pid) {
        throw new Error('프로젝트가 선택되지 않았습니다')
      }

      // 4. Warp 터미널 열기 (use_claude_cli: true로 expect 스크립트 활용)
      const warpResp = await fetch(`${API_BASE}/warp/open`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          project_id: pid,
          command: prompt,
          title: `Task: ${analysisData.task_input?.substring(0, 40) || 'Analysis'}`,
          new_window: false, // Prefer tab in existing Warp window
          use_claude_cli: true,
          image_paths: analysisData.image_paths || null,
        }),
      })

      if (!warpResp.ok) {
        const errData = await warpResp.json().catch(() => ({ detail: warpResp.statusText }))
        throw new Error(errData.detail || errData.error || `Warp 실행 실패 (${warpResp.status})`)
      }

      const warpResult = await warpResp.json()

      if (!warpResult.success) {
        throw new Error(warpResult.error || 'Warp 터미널을 열 수 없습니다')
      }

      set({ executingAnalysisId: null })
      return true
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Warp 실행에 실패했습니다'
      set({
        executingAnalysisId: null,
        executionError: errorMsg,
      })
      return false
    }
  },

  clearExecution: () => {
    set({
      executingAnalysisId: null,
      executionSessionId: null,
      executionError: null,
    })
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
