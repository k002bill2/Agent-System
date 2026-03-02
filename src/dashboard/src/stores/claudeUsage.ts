import { create } from 'zustand'
import { apiClient } from '../services/apiClient'
import type { ClaudeUsageResponse } from '../types/claudeUsage'

interface ClaudeUsageState {
  // Data
  usage: ClaudeUsageResponse | null
  isLoading: boolean
  error: string | null
  lastFetched: Date | null

  // Actions
  fetchUsage: () => Promise<void>
  clearError: () => void
}

/** Claude 사용량 데이터 조회 스토어. */
export const useClaudeUsageStore = create<ClaudeUsageState>((set, get) => ({
  usage: null,
  isLoading: false,
  error: null,
  lastFetched: null,

  fetchUsage: async () => {
    // Avoid duplicate requests
    const { isLoading } = get()
    if (isLoading) return

    set({ isLoading: true, error: null })

    try {
      const data = await apiClient.get<ClaudeUsageResponse>('/api/usage')
      set({
        usage: data,
        isLoading: false,
        lastFetched: new Date(),
      })
    } catch (e) {
      const errorMessage = e instanceof Error ? e.message : 'Unknown error'
      set({
        error: errorMessage,
        isLoading: false,
      })
    }
  },

  clearError: () => {
    set({ error: null })
  },
}))
