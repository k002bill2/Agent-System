import { create } from 'zustand'
import { apiClient } from '../services/apiClient'

export interface ExternalProviderConfig {
  provider: string
  enabled: boolean
  api_key_masked: string | null
  org_id: string | null
  last_sync_at: string | null
  error_message: string | null
}

export interface UnifiedUsageRecord {
  id: string
  provider: string
  timestamp: string
  bucket_width: string
  input_tokens: number
  output_tokens: number
  total_tokens: number
  cost_usd: number
  request_count: number
  model: string | null
  user_id: string | null
  user_email: string | null
  project_id: string | null
  code_suggestions: number | null
  code_acceptances: number | null
  acceptance_rate: number | null
  collected_at: string
}

export interface UsageSummary {
  provider: string
  period_start: string
  period_end: string
  total_input_tokens: number
  total_output_tokens: number
  total_cost_usd: number
  total_requests: number
  model_breakdown: Record<string, number>
  member_breakdown: Record<string, number>
}

export interface ExternalUsageSummaryResponse {
  providers: UsageSummary[]
  total_cost_usd: number
  records: UnifiedUsageRecord[]
  period_start: string
  period_end: string
}

interface ExternalUsageStore {
  summary: ExternalUsageSummaryResponse | null
  providers: ExternalProviderConfig[]
  isLoading: boolean
  error: string | null
  lastFetched: Date | null

  fetchSummary: (startTime?: string, endTime?: string, providerList?: string[]) => Promise<void>
  fetchProviders: () => Promise<void>
  syncProvider: (provider?: string) => Promise<{ synced_records: number }>
}

export const useExternalUsageStore = create<ExternalUsageStore>((set, get) => ({
  summary: null,
  providers: [],
  isLoading: false,
  error: null,
  lastFetched: null,

  fetchSummary: async (startTime?: string, endTime?: string, providerList?: string[]) => {
    set({ isLoading: true, error: null })
    try {
      const params = new URLSearchParams()
      if (startTime) params.set('start_time', startTime)
      if (endTime) params.set('end_time', endTime)
      if (providerList) {
        providerList.forEach(p => params.append('providers', p))
      }
      const qs = params.toString()
      const url = `/api/external-usage/summary${qs ? `?${qs}` : ''}`
      const data = await apiClient.get<ExternalUsageSummaryResponse>(url)
      set({ summary: data, lastFetched: new Date(), isLoading: false })
    } catch (err) {
      set({ error: (err as Error).message, isLoading: false })
    }
  },

  fetchProviders: async () => {
    try {
      const data = await apiClient.get<ExternalProviderConfig[]>('/api/external-usage/providers')
      set({ providers: data })
    } catch (err) {
      set({ error: (err as Error).message })
    }
  },

  syncProvider: async (provider?: string) => {
    set({ isLoading: true, error: null })
    try {
      const body = provider ? { provider } : {}
      const result = await apiClient.post<{ synced_records: number }>('/api/external-usage/sync', body)
      // Refresh summary after sync
      await get().fetchSummary()
      set({ isLoading: false })
      return result
    } catch (err) {
      set({ error: (err as Error).message, isLoading: false })
      return { synced_records: 0 }
    }
  },
}))
