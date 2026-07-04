import { create } from 'zustand'

import { apiClient } from '@/services/apiClient'

export interface LLMUsageBreakdown {
  total_requests: number
  total_input_tokens: number
  total_output_tokens: number
  total_tokens: number
  estimated_cost_usd: number
}

export interface LLMUsageSummary {
  period_start: string
  period_end: string
  total_requests: number
  total_input_tokens: number
  total_output_tokens: number
  total_tokens: number
  estimated_cost_usd: number
  provider_breakdown: Record<string, LLMUsageBreakdown>
  source_breakdown: Record<string, LLMUsageBreakdown>
  member_breakdown: Record<string, LLMUsageBreakdown>
  organization_breakdown: Record<string, LLMUsageBreakdown>
  mode_breakdown: Record<string, LLMUsageBreakdown>
  model_breakdown: Record<string, LLMUsageBreakdown>
  status_breakdown: Record<string, LLMUsageBreakdown>
}

export interface LLMUsageFilters {
  startTime?: string
  endTime?: string
  provider?: string
  mode?: 'cli' | 'api' | 'local' | string
  source?: string
  userId?: string
  organizationId?: string
  projectId?: string
}

interface LLMUsageStore {
  summary: LLMUsageSummary | null
  isLoading: boolean
  error: string | null
  lastFetched: Date | null
  fetchSummary: (filters?: LLMUsageFilters) => Promise<void>
}

function buildSummaryUrl(filters: LLMUsageFilters = {}): string {
  const params = new URLSearchParams()
  if (filters.startTime) params.set('start_time', filters.startTime)
  if (filters.endTime) params.set('end_time', filters.endTime)
  if (filters.provider) params.set('provider', filters.provider)
  if (filters.mode) params.set('mode', filters.mode)
  if (filters.source) params.set('source', filters.source)
  if (filters.userId) params.set('user_id', filters.userId)
  if (filters.organizationId) params.set('organization_id', filters.organizationId)
  if (filters.projectId) params.set('project_id', filters.projectId)

  const qs = params.toString()
  return `/api/llm-usage/summary${qs ? `?${qs}` : ''}`
}

export const useLLMUsageStore = create<LLMUsageStore>((set) => ({
  summary: null,
  isLoading: false,
  error: null,
  lastFetched: null,

  fetchSummary: async (filters = {}) => {
    set({ isLoading: true, error: null })
    try {
      const data = await apiClient.get<LLMUsageSummary>(buildSummaryUrl(filters))
      set({ summary: data, isLoading: false, lastFetched: new Date() })
    } catch (err) {
      set({
        error: err instanceof Error ? err.message : String(err),
        isLoading: false,
      })
    }
  },
}))
