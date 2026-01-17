import { create } from 'zustand'
import type { ClaudeUsageResponse } from '../types/claudeUsage'

const API_BASE = 'http://localhost:8000/api'

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
      const res = await fetch(`${API_BASE}/usage`)

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}))
        throw new Error(errorData.detail || `Failed to fetch usage: ${res.statusText}`)
      }

      const data: ClaudeUsageResponse = await res.json()
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
