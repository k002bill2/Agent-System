/**
 * Task Analyzer Store
 *
 * 태스크 분석 결과, 분석 히스토리, 실행 상태, 첨부 파일(이미지/MD)을 관리합니다.
 */

import { create } from 'zustand'
import { apiClient } from '../services/apiClient'
import { useSettingsStore, TERMINAL_DISPLAY_NAMES } from './settings'

const TASK_ANALYZER_TIMEOUT_MS = 180_000

// Types
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
  executionError: string | null

  // UI State
  isLoading: boolean
  error: string | null

  // Image state
  attachedImages: File[]

  // OCR state (key = `${file.name}_${file.size}_${file.lastModified}`)
  ocrStatuses: Record<string, 'processing' | 'done' | 'error'>

  // MD file state
  attachedMdFiles: File[]
  mdReadStatuses: Record<string, 'reading' | 'done' | 'error'>

  // Actions
  analyzeTask: (task: string, context?: Record<string, unknown>, images?: File[]) => Promise<TaskAnalysisResult | null>
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

  // MD File Actions
  setAttachedMdFiles: (files: File[]) => void
  addAttachedMdFiles: (files: File[]) => void
  removeAttachedMdFile: (index: number) => void
  clearAttachedMdFiles: () => void
  setMdReadStatus: (fileKey: string, status: 'reading' | 'done' | 'error') => void
  removeMdReadStatus: (fileKey: string) => void

  // Execution Actions
  executeInTerminal: (analysisId: string, projectId?: string | null, branchName?: string) => Promise<boolean>
  clearExecution: () => void

  // History Actions
  fetchAnalysisHistory: (projectId?: string | null, reset?: boolean) => Promise<void>
  loadMoreHistory: () => Promise<void>
  deleteAnalysis: (id: string) => Promise<boolean>
  selectHistoryItem: (item: TaskAnalysisHistory | null) => void
}

/**
 * 태스크 입력에서 git 브랜치명을 자동 생성.
 * 형식: feature/task-{sanitized}-{yyyyMMddHHmm}
 */
export function generateBranchName(taskInput: string): string {
  const sanitized = taskInput
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .substring(0, 40)
    .replace(/-+$/, '')

  const now = new Date()
  const ts = [
    now.getFullYear(),
    String(now.getMonth() + 1).padStart(2, '0'),
    String(now.getDate()).padStart(2, '0'),
    String(now.getHours()).padStart(2, '0'),
    String(now.getMinutes()).padStart(2, '0'),
  ].join('')

  return `feature/task-${sanitized || 'unnamed'}-${ts}`
}

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

  // Safety Warnings 섹션
  const safetyFlags = (analysis?.analysis as Record<string, unknown>)?.safety_flags as string[] | undefined
  if (safetyFlags && safetyFlags.length > 0) {
    lines.push('## Safety Warnings')
    for (const flag of safetyFlags) {
      lines.push(`- ⚠️ ${flag}`)
    }
    lines.push('')
  }

  const executionPlan = analysis?.execution_plan
  const subtasks = executionPlan?.subtasks || {}
  const parallelGroups = executionPlan?.parallel_groups || []

  // 전체 분석에서 subtask별 task_boundaries 추출
  const analysisSubtasks = (analysis?.analysis as Record<string, unknown>)?.subtasks as Array<Record<string, unknown>> | undefined

  // subtask id → task_boundaries 매핑 구축
  const boundariesMap: Record<string, Record<string, string[]>> = {}
  if (analysisSubtasks) {
    for (const st of analysisSubtasks) {
      const stId = st.id as string | undefined
      const boundaries = st.task_boundaries as Record<string, string[]> | null | undefined
      if (stId && boundaries) {
        boundariesMap[stId] = boundaries
      }
    }
  }

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

        // Task Boundaries 렌더링
        const boundaries = boundariesMap[taskId]
        if (boundaries) {
          if (boundaries.do_not?.length) {
            lines.push(`  - **DO NOT**: ${boundaries.do_not.join('; ')}`)
          }
          if (boundaries.wait_for?.length) {
            lines.push(`  - **WAIT FOR**: ${boundaries.wait_for.join('; ')}`)
          }
          if (boundaries.stop_if?.length) {
            lines.push(`  - **STOP IF**: ${boundaries.stop_if.join('; ')}`)
          }
        }
      }

      lines.push('')
    }
  }

  lines.push(
    '## Instructions',
    '- 위 순서대로 서브태스크를 실행하세요',
    '- 각 서브태스크의 task boundaries(DO NOT/WAIT FOR/STOP IF)를 반드시 준수하세요',
    '- 각 서브태스크 완료 후 결과를 검증하세요',
    '- 가능한 경우 Claude Code 에이전트와 스킬을 활용하세요',
    '- 에러 발생 시 근본 원인을 분석하고 수정하세요',
    '- 모든 변경 후 `tsc --noEmit` (프론트엔드) / `pytest --tb=short` (백엔드) 실행으로 검증하세요',
  )

  return lines.join('\n')
}

/** 태스크 분석 상태 관리 스토어. */
export const useAgentsStore = create<AgentsState>((set, get) => ({
  // Initial state
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
  executionError: null,

  // Image state
  attachedImages: [],
  ocrStatuses: {},

  // MD file state
  attachedMdFiles: [],
  mdReadStatuses: {},

  // UI state
  isLoading: false,
  error: null,

  // Actions
  analyzeTask: async (task: string, context?: Record<string, unknown>, images?: File[]) => {
    set({ isLoading: true, error: null })

    const attachedImages = images || get().attachedImages

    try {
      let result: TaskAnalysisResult

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

        result = await apiClient.post<TaskAnalysisResult>(
          '/api/agents/orchestrate/analyze-with-images',
          formData,
          { timeout: TASK_ANALYZER_TIMEOUT_MS, skipRetry: true }
        )
      } else {
        // Use JSON endpoint when no images
        result = await apiClient.post<TaskAnalysisResult>(
          '/api/agents/orchestrate/analyze',
          {
            task,
            context: context || null,
          },
          { timeout: TASK_ANALYZER_TIMEOUT_MS }
        )
      }

      set({ lastAnalysis: result, isLoading: false, attachedImages: [], ocrStatuses: {}, attachedMdFiles: [], mdReadStatuses: {} })

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

  // MD File Actions
  setAttachedMdFiles: (files: File[]) => {
    set({ attachedMdFiles: files })
  },

  addAttachedMdFiles: (files: File[]) => {
    const current = get().attachedMdFiles
    const combined = [...current, ...files].slice(0, 3)
    set({ attachedMdFiles: combined })
  },

  removeAttachedMdFile: (index: number) => {
    const current = get().attachedMdFiles
    set({ attachedMdFiles: current.filter((_, i) => i !== index) })
  },

  clearAttachedMdFiles: () => {
    set({ attachedMdFiles: [], mdReadStatuses: {} })
  },

  setMdReadStatus: (fileKey: string, status: 'reading' | 'done' | 'error') => {
    set((state) => ({
      mdReadStatuses: { ...state.mdReadStatuses, [fileKey]: status },
    }))
  },

  removeMdReadStatus: (fileKey: string) => {
    set((state) => {
      const { [fileKey]: _, ...rest } = state.mdReadStatuses
      return { mdReadStatuses: rest }
    })
  },

  // OCR Actions
  extractTextFromImage: async (file: File) => {
    try {
      const formData = new FormData()
      formData.append('image', file)

      const result = await apiClient.post<{ success: boolean; text?: string; error?: string }>(
        '/api/agents/ocr',
        formData,
        { skipRetry: true }
      )

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
  // Execute analysis via selected terminal with Claude CLI
  executeInTerminal: async (analysisId: string, projectId?: string | null, branchName?: string) => {
    const terminal = useSettingsStore.getState().preferredTerminal
    const terminalName = TERMINAL_DISPLAY_NAMES[terminal]
    set({ executingAnalysisId: analysisId, executionError: null })

    try {
      // 1. 분석 결과 조회
      const analysisData = await apiClient.get<{
        analysis: TaskAnalysisResult['analysis']
        task_input: string
        project_id?: string
        image_paths?: string[]
      }>(`/api/agents/orchestrate/analyses/${analysisId}`)

      // 2. 분석 → 프롬프트 텍스트 변환
      const prompt = buildClaudePrompt(analysisData.analysis, analysisData.task_input)

      // 3. project_id
      const pid = projectId || analysisData.project_id
      if (!pid) {
        throw new Error('프로젝트가 선택되지 않았습니다')
      }

      // 4. 선택된 터미널로 실행
      const result = await apiClient.post<{ success: boolean; terminal: string; error?: string }>('/api/terminal/execute', {
        terminal,
        project_id: pid,
        command: prompt,
        title: `Task: ${analysisData.task_input?.substring(0, 40) || 'Analysis'}`,
        image_paths: analysisData.image_paths || null,
        branch_name: branchName || null,
        use_claude_cli: true,
      })

      if (!result.success) {
        throw new Error(result.error || `${terminalName} 실행에 실패했습니다`)
      }

      set({ executingAnalysisId: null })
      return true
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : `${terminalName} 실행에 실패했습니다`
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

      const data = await apiClient.get<{ items: TaskAnalysisHistory[]; total: number; has_more: boolean }>(
        `/api/agents/orchestrate/analyses?${params.toString()}`
      )
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

      const data = await apiClient.get<{ items: TaskAnalysisHistory[]; total: number; has_more: boolean }>(
        `/api/agents/orchestrate/analyses?${params.toString()}`
      )
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
      await apiClient.delete(`/api/agents/orchestrate/analyses/${id}`)

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
