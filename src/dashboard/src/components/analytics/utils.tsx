/**
 * AnalyticsPage 의 포매팅·집계 헬퍼.
 *
 * .ts 가 아니라 .tsx 인 이유는 renderAosModelSourceBadge 가 JSX 를 반환하기
 * 때문이다. 이름을 바꾸거나 컴포넌트로 승격하는 것은 판단 작업이라 Task 3a
 * (기계적 이동)의 범위가 아니다.
 */

import type { ExternalUsageSummaryResponse } from '@/stores/externalUsage'
import { PROVIDER_COLORS, PROVIDER_LABELS } from './constants'
import type {
  AgentPerformance,
  CostBreakdown,
  ModelTokenBreakdown,
  MultiProjectTrendsResponse,
  TimeRange,
  TrendDataPoint,
} from './types'

export function formatNumber(num: number): string {
  if (num >= 1_000_000) return `${(num / 1_000_000).toFixed(1)}M`
  if (num >= 1_000) return `${(num / 1_000).toFixed(1)}K`
  return num.toString()
}

export function formatTokenCount(value: number): string {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`
  if (value >= 1_000) return `${(value / 1_000).toFixed(1)}K`
  return String(value)
}

export function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`
  return `${(ms / 60000).toFixed(1)}m`
}

export function formatTrendLabel(timestamp: string, timeRange: TimeRange): string {
  const date = new Date(timestamp)
  switch (timeRange) {
    case '1h':
      return date.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })
    case '24h':
      return date.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })
    case '7d':
      return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
    case '30d':
      return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
    case 'all':
      return date.toLocaleDateString('en-US', { year: '2-digit', month: 'short' })
    default:
      return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  }
}

export function formatTrendData(
  data: TrendDataPoint[],
  timeRange: TimeRange = '7d',
): { label: string; value: number | undefined }[] {
  return data.map((d) => ({
    label: formatTrendLabel(d.timestamp, timeRange),
    value: d.value ?? undefined, // null → undefined for Recharts gap handling
  }))
}

/**
 * Transform multi-project series data for Recharts
 * Converts from series-based to date-based format
 */
export function transformMultiSeriesData(
  response: MultiProjectTrendsResponse
): Record<string, string | number | null>[] {
  const dateMap = new Map<string, Record<string, string | number | null>>()

  response.series.forEach((series) => {
    series.data.forEach((point) => {
      const dateKey = formatTrendLabel(point.timestamp, response.period)
      const existing = dateMap.get(dateKey) || { date: dateKey }
      existing[series.project_id] = point.value
      dateMap.set(dateKey, existing)
    })
  })

  return Array.from(dateMap.values())
}

export function buildModelTokenBreakdown(
  models: CostBreakdown[],
  externalSummary: ExternalUsageSummaryResponse | null,
): ModelTokenBreakdown[] {
  const grouped = new Map<string, ModelTokenBreakdown>()

  const addEntry = (
    modelName: string | null | undefined,
    providerValue: string | null | undefined,
    tokens: number,
    cost: number,
  ) => {
    if (tokens <= 0) return
    const model = modelName?.trim() || 'unknown'
    const provider = normalizeProvider(providerValue, model)
    const key = `${provider}:${model}`
    const existing = grouped.get(key)

    if (existing) {
      existing.tokens += tokens
      existing.cost += cost
      return
    }

    grouped.set(key, {
      model,
      provider,
      providerLabel: PROVIDER_LABELS[provider] ?? provider,
      tokens,
      cost,
      percentage: 0,
      color: PROVIDER_COLORS[provider] ?? PROVIDER_COLORS.unknown,
    })
  }

  models.forEach((model) => {
    addEntry(model.value, model.provider, model.tokens, model.cost)
  })

  externalSummary?.records.forEach((record) => {
    addEntry(record.model, record.provider, record.total_tokens, record.cost_usd)
  })

  const entries = Array.from(grouped.values())
  const totalTokens = entries.reduce((sum, entry) => sum + entry.tokens, 0)
  return entries
    .map((entry) => ({
      ...entry,
      percentage: totalTokens > 0 ? Math.round((entry.tokens / totalTokens) * 1000) / 10 : 0,
    }))
    .sort((a, b) => b.tokens - a.tokens)
}

export function filterAttributedModelPerformance(agents: AgentPerformance[]): AgentPerformance[] {
  return agents.filter((agent) => {
    const modelName = agent.agent_name.trim().toLowerCase()
    return !(
      modelName === 'unknown (no model info)'
      && agent.total_tokens === 0
      && agent.total_cost === 0
    )
  })
}

export function normalizeProvider(provider: string | null | undefined, modelName: string): string {
  const explicit = provider?.trim().toLowerCase()
  if (explicit) {
    if (explicit === 'codex') return 'codex_cli'
    if (explicit === 'claude') return 'anthropic'
    if (explicit === 'gemini' || explicit === 'vertex' || explicit === 'google_gemini') {
      return 'google'
    }
    return explicit
  }

  const model = modelName.toLowerCase()
  if (model.includes('codex')) return 'codex_cli'
  if (model.includes('claude')) return 'anthropic'
  if (model.includes('gpt') || model.includes('openai')) return 'openai'
  if (model.includes('gemini') || model.includes('vertex')) return 'google'
  if (model.includes('ollama') || model.includes('llama') || model.includes('mistral')) {
    return 'ollama'
  }
  return 'unknown'
}

export function renderAosModelSourceBadge(models: ModelTokenBreakdown[]): React.ReactNode {
  if (models.length === 0) return null
  const providers = Array.from(new Set(models.map((model) => model.providerLabel)))
  const label = providers.length === 1 ? providers[0] : `${providers.length} providers`

  return (
    <span
      className="text-[11px] px-2 py-0.5 rounded-full bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-200 whitespace-nowrap"
      title="AOS analytics costs.by_model 기준의 모델별 LLM 사용량입니다."
    >
      AOS 집계: {label}
    </span>
  )
}

export function truncateModelLabel(modelName: string): string {
  return modelName.length > 18 ? `${modelName.slice(0, 17)}...` : modelName
}
