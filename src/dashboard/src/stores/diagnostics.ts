import { create } from 'zustand'
import { apiClient } from '../services/apiClient'
import type {
  ProjectDiagnostics,
  FixResult,
} from '../types/diagnostics'

interface DiagnosticsState {
  /** Diagnostics result per project */
  diagnosticsMap: Record<string, ProjectDiagnostics>
  isLoading: boolean
  /** Fix action currently executing (fix_action ID) */
  fixingAction: string | null
  error: string | null

  // Actions
  fetchDiagnostics: (projectId: string) => Promise<void>
  executeFix: (projectId: string, fixAction: string, params?: Record<string, unknown>) => Promise<void>
  getDiagnostics: (projectId: string) => ProjectDiagnostics | null
  clearError: () => void
}

export const useDiagnosticsStore = create<DiagnosticsState>((set, get) => ({
  diagnosticsMap: {},
  isLoading: false,
  fixingAction: null,
  error: null,

  getDiagnostics: (projectId: string) => {
    return get().diagnosticsMap[projectId] ?? null
  },

  fetchDiagnostics: async (projectId: string) => {
    set({ isLoading: true, error: null })
    try {
      const data = await apiClient.get<ProjectDiagnostics>(
        `/api/projects/${projectId}/diagnostics`
      )
      set((state) => ({
        diagnosticsMap: { ...state.diagnosticsMap, [projectId]: data },
        isLoading: false,
      }))
    } catch (e) {
      set({
        isLoading: false,
        error: e instanceof Error ? e.message : 'Failed to fetch diagnostics',
      })
    }
  },

  executeFix: async (projectId: string, fixAction: string, params?: Record<string, unknown>) => {
    set({ fixingAction: fixAction, error: null })
    try {
      const result = await apiClient.post<FixResult>(
        `/api/projects/${projectId}/diagnostics/fix`,
        { fix_action: fixAction, params: params ?? {} }
      )
      if (result.diagnostics) {
        set((state) => ({
          diagnosticsMap: { ...state.diagnosticsMap, [projectId]: result.diagnostics! },
          fixingAction: null,
        }))
      } else {
        set({ fixingAction: null })
      }
    } catch (e) {
      set({
        fixingAction: null,
        error: e instanceof Error ? e.message : 'Fix action failed',
      })
    }
  },

  clearError: () => set({ error: null }),
}))
