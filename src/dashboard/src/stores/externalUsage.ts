import { create } from 'zustand'
import { apiClient } from '../services/apiClient'
import { DEFAULT_PERIOD_DAYS } from '../lib/usageCoverage'

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
  /** 비용이 실제로 측정됐는지 여부. `cost_usd === 0` 과 "모름" 을 구분한다. */
  cost_state?: 'known' | 'unknown'
  /** 이 레코드가 수집된 경로 (`internal_ledger` | `claude_session_snapshot` | ...). */
  collection_source?: string
  /** 원본이 보고한 측정 방법. */
  measurement_method?: string | null
  /** 단가 출처. `unpriced` 는 가격표가 없어 비용을 산출하지 못한 상태. */
  price_source?: 'table' | 'fallback' | 'unpriced' | null
  /** timestamp 의 의미. 스냅샷은 세션 누계를 마지막 활동일에 배치한다. */
  date_basis?: 'event' | 'session_last_activity'
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
  /** 이 요약이 만들어진 수집 경로. */
  collection_source?: string
  /** 요약 전체의 비용 측정 상태. */
  cost_state?: 'known' | 'partial' | 'unknown'
  /** 비용이 측정된 레코드 수. */
  known_cost_requests?: number
  /** 비용이 NULL 이던 레코드 수. */
  unknown_cost_requests?: number
  /** `total_requests` 의 단위. Claude 의 requests 와 Codex 의 requests 는 같은 단위가 아니다. */
  request_unit?: 'ledger_record' | 'session' | 'unknown'
  /** user_id 가 없어 사용자에 귀속되지 않은 레코드 수. */
  unattributed_member_requests?: number
  /** 비용은 합계에 포함되지만 단가표에 없는 모델이라 기본 단가로 추정된 레코드 수. */
  fallback_priced_requests?: number
  /** `null` 은 "미수집" 이며 `0` 이 아니다. */
  cache_read_tokens?: number | null
  /** `null` 은 "미수집" 이며 `0` 이 아니다. */
  cache_creation_tokens?: number | null
}

export interface UsageSourceCoverage {
  collection_source: string
  provider: string
  record_count: number
  request_unit: string
  cost_state: string
  date_basis: string
  note?: string | null
}

export interface UsageCoverage {
  requested_start: string
  requested_end: string
  period_days: number
  sources: UsageSourceCoverage[]
}

export interface UsageReconciliationComparison {
  provider: string
  internal_total_tokens: number
  internal_total_cost_usd: number
  internal_total_requests: number
  provider_billing_total_tokens: number
  provider_billing_total_cost_usd: number
  provider_billing_total_requests: number
  delta_tokens: number
  delta_cost_usd: number
  status: string
}

export interface UsageReconciliationSummary {
  primary_source: string
  provider_billing_enabled: boolean
  internal_total_tokens: number
  internal_total_cost_usd: number
  internal_total_requests: number
  provider_billing_total_tokens: number
  provider_billing_total_cost_usd: number
  provider_billing_total_requests: number
  provider_billing_record_count: number
  comparisons: UsageReconciliationComparison[]
}

export interface ExternalUsageSummaryResponse {
  providers: UsageSummary[]
  total_cost_usd: number
  records: UnifiedUsageRecord[]
  period_start: string
  period_end: string
  reconciliation?: UsageReconciliationSummary | null
  /** 수집 범위·provenance. 구버전 응답에는 없다. */
  coverage?: UsageCoverage | null
}

/** 헤더 배지와 상세 페이지가 공유하는 기간 선택 상태. */
export interface UsagePeriod {
  days: number
}

interface ExternalUsageStore {
  summary: ExternalUsageSummaryResponse | null
  providers: ExternalProviderConfig[]
  isLoading: boolean
  error: string | null
  lastFetched: Date | null
  /** 선택된 조회 기간. 헤더 배지와 상세 페이지의 단일 소스. */
  period: UsagePeriod | null

  setPeriod: (days: number) => void
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
  period: { days: DEFAULT_PERIOD_DAYS },

  setPeriod: (days: number) => {
    set({ period: { days } })
  },

  fetchSummary: async (startTime?: string, endTime?: string, providerList?: string[]) => {
    set({ isLoading: true, error: null })
    try {
      // 인자를 주지 않으면 저장된 기간을 쓴다. 경계 시각은 호출 시점에 다시 계산한다 —
      // 미리 굳혀두면 sync 이후 재조회가 낡은 창을 요청한다.
      const period = get().period
      const resolvedEnd = endTime ?? (period ? new Date().toISOString() : undefined)
      const resolvedStart =
        startTime ??
        (period ? new Date(Date.now() - period.days * 86_400_000).toISOString() : undefined)

      const params = new URLSearchParams()
      if (resolvedStart) params.set('start_time', resolvedStart)
      if (resolvedEnd) params.set('end_time', resolvedEnd)
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
