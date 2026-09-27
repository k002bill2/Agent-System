import { useState, useEffect, useCallback } from 'react'

import {
  ProviderUsage,
  LLMProvider,
  PROVIDER_CONFIG,
  identifyProvider,
} from '../stores/orchestration'
import { useExternalUsageStore } from '../stores/externalUsage'
import type { ExternalUsageSummaryResponse, UsageSummary } from '../stores/externalUsage'
import { DEFAULT_PERIOD_DAYS, summarizeCoverage } from '@/lib/usageCoverage'
import { apiClient } from '@/services/apiClient'

// ─────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────

interface CostBreakdown {
  category: string
  value: string
  provider?: string | null
  /**
   * provider 값이 어디서 왔는지. `'unattributed'` 는 백엔드가 귀속에 실패했다는 뜻이며,
   * 프론트가 모델명으로 다시 추측해서는 안 된다. 구버전 응답에는 없다(`undefined`).
   */
  provider_source?: string | null
  cost: number
  tokens: number
  percentage: number
}

interface CostAnalytics {
  total_cost: number
  total_tokens: number
  avg_cost_per_task: number
  by_agent: CostBreakdown[]
  by_model: CostBreakdown[]
  projected_monthly: number
  /**
   * 백엔드가 이 응답으로 덮은 일수. `fetchCostAnalytics` 는 `time_range=all` 로 부르므로
   * 보통 365 다. 외부 사용량 스토어의 선택 기간(기본 30일)과 **다른 모집단**이라
   * 서로의 라벨로 쓰면 안 된다. 구버전 응답에는 없다(`undefined`).
   *
   * `analytics/types.ts` 의 `CostAnalytics` 와 수기 미러 2벌이다 — 한쪽만 고치면
   * tsc 는 조용히 통과하고 런타임만 어긋난다.
   */
  period_days?: number
}

interface ClaudePlanLimit {
  name: string
  displayName: string
  utilization: number
}

interface ClaudeUsageSnapshot {
  weeklyTotalTokens?: number
  weeklyModelTokens?: Array<{ date: string; tokensByModel: Record<string, number> }>
  weeklyModelTokensSource?: 'stats-cache' | 'jsonl-fallback' | 'empty'
  planLimits?: ClaudePlanLimit[]
  oauthAvailable?: boolean
}

// ─────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────

function formatCost(cost: number): string {
  if (cost === 0) {
    return 'FREE'
  }
  if (cost < 0.01) {
    return `$${cost.toFixed(4)}`
  }
  return `$${cost.toFixed(2)}`
}

function formatTokens(tokens: number): string {
  if (tokens >= 1000000) {
    return `${(tokens / 1000000).toFixed(1)}M`
  }
  if (tokens >= 1000) {
    return `${(tokens / 1000).toFixed(1)}K`
  }
  return tokens.toString()
}

/** Skip system/synthetic models that aren't real LLM calls */
const IGNORED_MODELS = ['unknown', 'synthetic', 'default', 'no model info', 'system-generated']

function isIgnoredModel(value: string): boolean {
  const lower = value.toLowerCase()
  return IGNORED_MODELS.some((m) => lower.includes(m))
}

/** Extract model family: claude-opus-4-8 → opus, gemini-2.0-flash → flash */
function getModelFamily(model: string): string {
  const lower = model.toLowerCase()
  // Claude: claude-{family}-{version}
  const claudeMatch = lower.match(/claude-(\w+)/)
  if (claudeMatch) return claudeMatch[1]
  // Gemini: gemini-{version}-{family}
  const geminiMatch = lower.match(/gemini-[\d.]+-(\w+)/)
  if (geminiMatch) return geminiMatch[1]
  // GPT: gpt-{family}
  const gptMatch = lower.match(/gpt-(\w+)/)
  if (gptMatch) return gptMatch[1]
  return lower
}

function isLLMProvider(value: string | null | undefined): value is LLMProvider {
  return Boolean(value && value in PROVIDER_CONFIG)
}

/**
 * 백엔드가 "귀속 불가" 라고 표시한 항목을 모으는 그룹 키.
 * `LLMProvider` 유니온에는 넣지 않는다 — `PROVIDER_CONFIG`/`PROVIDER_COLORS` 조회가 깨진다.
 * provider 값은 `'unknown'`(⚪ 회색 엔트리)을 재사용하고 구분은 키와 라벨이 한다.
 */
const UNATTRIBUTED_KEY = 'unattributed'
const UNATTRIBUTED_LABEL = 'Unattributed (출처 미확인)'
const UNATTRIBUTED_ARIA_LABEL = '출처를 확인할 수 없는 사용량'

type ExternalCostState = 'known' | 'partial' | 'unknown'

/**
 * provider 별 `cost_state` 를 하나로 접는다.
 * `cost_state` 가 아예 없는 구버전 응답은 기존 동작대로 `'known'` 으로 둔다.
 */
function deriveExternalCostState(summary: ExternalUsageSummaryResponse | null): ExternalCostState {
  const states = (summary?.providers ?? [])
    .map((provider) => provider.cost_state)
    .filter((state): state is NonNullable<UsageSummary['cost_state']> => Boolean(state))

  if (states.length === 0) return 'known'
  if (states.every((state) => state === 'known')) return 'known'
  if (states.every((state) => state === 'unknown')) return 'unknown'
  return 'partial'
}

/**
 * `formatCost` 는 0 을 'FREE' 로 렌더한다. "모름"과 "0" 을 구분해야 하는 라벨에서는
 * 금액을 그대로 써야 하므로 별도 포매터를 쓴다.
 */
function formatExternalCost(cost: number): string {
  if (cost < 0.01) return `$${cost.toFixed(4)}`
  return `$${cost.toFixed(2)}`
}

interface ExternalCostLabel {
  text: string
  ariaLabel: string
}

/**
 * 헤더/요약에 붙는 외부 사용량 비용 라벨.
 * 내부 요약의 추정 비용을 프로바이더 청구액인 것처럼 `(실제:)` 로 부르지 않는다.
 *
 * `summary.total_cost_usd` 는 reconciliation 에 `compared` 행이 있어도 **여전히**
 * 내부 추정 합계다 (청구 총계는 `reconciliation.provider_billing_total_cost_usd` 라는
 * 별개 값이다). 그래서 이 숫자에는 어떤 경우에도 `(실제 청구:)` 라벨을 붙이지 않는다.
 */
function buildExternalCostLabel(
  summary: ExternalUsageSummaryResponse | null,
): ExternalCostLabel | null {
  if (!summary) return null

  const cost = summary.total_cost_usd ?? 0
  const amount = formatExternalCost(cost)

  const costState = deriveExternalCostState(summary)
  if (costState === 'unknown') {
    return {
      text: '(비용 미측정)',
      ariaLabel: '비용이 측정되지 않았습니다. 0 달러라는 뜻이 아닙니다.',
    }
  }
  if (costState === 'partial') {
    return {
      text: `(내부 추정 합계: ${amount} · 일부 미측정)`,
      ariaLabel: `내부 추정 합계 ${amount}, 일부 레코드는 비용이 측정되지 않았습니다`,
    }
  }
  return {
    text: `(내부 추정 합계: ${amount})`,
    ariaLabel: `내부 추정 합계 ${amount}`,
  }
}

/**
 * 분석 집계가 실제로 덮은 기간 라벨. 외부 사용량 기간과 시각적으로 섞이지 않도록
 * `AOS 집계` 접두어를 붙인다. 백엔드가 기간을 안 보내면 기간을 주장하지 않는다(`null`).
 */
function formatAnalyticsPeriod(periodDays: number | null | undefined): string | null {
  if (typeof periodDays !== 'number' || !Number.isFinite(periodDays) || periodDays <= 0) {
    return null
  }
  return `최근 ${periodDays}일`
}

function getClaudeWeeklyTokens(usage: ClaudeUsageSnapshot | null): number {
  if (!usage) return 0
  if (usage.weeklyTotalTokens && usage.weeklyTotalTokens > 0) {
    return usage.weeklyTotalTokens
  }
  return (usage.weeklyModelTokens ?? []).reduce((total, day) => (
    total + Object.values(day.tokensByModel).reduce((sum, tokens) => sum + tokens, 0)
  ), 0)
}

function getClaudePlanLabel(usage: ClaudeUsageSnapshot | null): string {
  if (!usage) return 'Unavailable'
  const sevenDay = usage.planLimits?.find((limit) => limit.name === 'sevenDay')
  if (sevenDay) return `7d ${Math.round(sevenDay.utilization)}%`
  return usage.oauthAvailable ? 'Live' : 'Local'
}

function getClaudeSourceLabel(usage: ClaudeUsageSnapshot | null): string {
  if (!usage) return 'No data'
  if (usage.weeklyModelTokensSource === 'jsonl-fallback') return 'JSONL'
  if (usage.weeklyModelTokensSource === 'stats-cache') return 'Cache'
  return 'No data'
}

/** Group by_model entries into provider-level usage. */
function groupByProvider(byModel: CostBreakdown[]): Record<string, ProviderUsage> {
  const result: Record<string, ProviderUsage> = {}
  const families: Record<string, Set<string>> = {}

  for (const entry of byModel) {
    // 백엔드가 "귀속 불가" 라고 말한 항목은 IGNORED_MODELS 스킵보다 먼저 처리한다.
    // 스킵 목록의 'unknown'·'synthetic'·'system-generated' 는 백엔드가 unattributed 로
    // 표시하는 모델 문자열과 정확히 겹쳐서, 뒤에 두면 그룹이 통째로 사라진다.
    const isUnattributed = entry.provider_source === UNATTRIBUTED_KEY
    if (!isUnattributed && isIgnoredModel(entry.value)) continue

    let key: string
    let provider: LLMProvider
    let displayName: string

    if (isUnattributed) {
      // 백엔드가 모른다고 한 것을 identifyProvider 로 다시 추측하지 않는다.
      key = UNATTRIBUTED_KEY
      provider = 'unknown'
      displayName = UNATTRIBUTED_LABEL
    } else if (isLLMProvider(entry.provider)) {
      provider = entry.provider
      key = provider === 'unknown' ? `unknown:${entry.value}` : provider
      displayName = provider === 'unknown' ? entry.value : PROVIDER_CONFIG[provider].displayName
    } else if (entry.provider_source == null) {
      // provider_source 자체가 없는 구버전 페이로드에서만 모델명 추론을 유지한다.
      provider = identifyProvider(entry.value)
      key = provider === 'unknown' ? `unknown:${entry.value}` : provider
      displayName = provider === 'unknown' ? entry.value : PROVIDER_CONFIG[provider].displayName
    } else {
      key = UNATTRIBUTED_KEY
      provider = 'unknown'
      displayName = UNATTRIBUTED_LABEL
    }

    const family = getModelFamily(entry.value)
    const existing = result[key]

    if (!families[key]) families[key] = new Set()
    families[key].add(family)

    if (existing) {
      existing.totalTokens += entry.tokens
      existing.costUsd += entry.cost
    } else {
      result[key] = {
        provider,
        displayName,
        inputTokens: 0,
        outputTokens: 0,
        totalTokens: entry.tokens,
        costUsd: entry.cost,
        callCount: 1,
      }
    }
  }

  // Set callCount to number of unique model families
  for (const [key, usage] of Object.entries(result)) {
    usage.callCount = families[key]?.size ?? 1
  }

  return result
}

async function fetchCostAnalytics(): Promise<CostAnalytics> {
  return apiClient.get<CostAnalytics>('/api/analytics/costs?time_range=all')
}

async function fetchClaudeUsage(): Promise<ClaudeUsageSnapshot> {
  return apiClient.get<ClaudeUsageSnapshot>('/api/usage')
}

// ─────────────────────────────────────────────────────────────
// Provider color mapping for Tailwind classes
// ─────────────────────────────────────────────────────────────

const PROVIDER_COLORS: Record<LLMProvider, { bg: string; border: string; text: string; bar: string }> = {
  google: {
    bg: 'bg-blue-50 dark:bg-blue-900/20',
    border: 'border-blue-200 dark:border-blue-800',
    text: 'text-blue-600 dark:text-blue-400',
    bar: 'bg-blue-500',
  },
  anthropic: {
    bg: 'bg-orange-50 dark:bg-orange-900/20',
    border: 'border-orange-200 dark:border-orange-800',
    text: 'text-orange-600 dark:text-orange-400',
    bar: 'bg-orange-500',
  },
  ollama: {
    bg: 'bg-green-50 dark:bg-green-900/20',
    border: 'border-green-200 dark:border-green-800',
    text: 'text-green-600 dark:text-green-400',
    bar: 'bg-green-500',
  },
  openai: {
    bg: 'bg-purple-50 dark:bg-purple-900/20',
    border: 'border-purple-200 dark:border-purple-800',
    text: 'text-purple-600 dark:text-purple-400',
    bar: 'bg-purple-500',
  },
  codex_cli: {
    bg: 'bg-purple-50 dark:bg-purple-900/20',
    border: 'border-purple-200 dark:border-purple-800',
    text: 'text-purple-600 dark:text-purple-400',
    bar: 'bg-purple-500',
  },
  claude_cli: {
    bg: 'bg-orange-50 dark:bg-orange-900/20',
    border: 'border-orange-200 dark:border-orange-800',
    text: 'text-orange-600 dark:text-orange-400',
    bar: 'bg-orange-500',
  },
  unknown: {
    bg: 'bg-gray-50 dark:bg-gray-900/20',
    border: 'border-gray-200 dark:border-gray-700',
    text: 'text-gray-600 dark:text-gray-400',
    bar: 'bg-gray-500',
  },
}

// ─────────────────────────────────────────────────────────────
// Components
// ─────────────────────────────────────────────────────────────

interface ProviderCardProps {
  usage: ProviderUsage
  /** groupByProvider 가 쓴 그룹 키. `unattributed` 면 접근성 라벨을 바꾼다. */
  groupKey?: string
}

interface SourceRowProps {
  label: string
  value: string
  meta: string
}

function SourceRow({ label, value, meta }: SourceRowProps) {
  return (
    <div className="flex items-center justify-between rounded-md border border-gray-100 dark:border-gray-700 px-3 py-2">
      <div>
        <div className="text-sm font-medium text-gray-900 dark:text-white">{label}</div>
        <div className="text-xs text-gray-500 dark:text-gray-400">{meta}</div>
      </div>
      <div className="text-sm font-semibold text-gray-900 dark:text-white">{value}</div>
    </div>
  )
}

function ProviderCard({ usage, groupKey }: ProviderCardProps) {
  const colors = PROVIDER_COLORS[usage.provider]
  const config = PROVIDER_CONFIG[usage.provider]
  const isUnattributed = groupKey === UNATTRIBUTED_KEY

  return (
    <div
      role="group"
      aria-label={isUnattributed ? UNATTRIBUTED_ARIA_LABEL : `${usage.displayName} 사용량`}
      className={`p-3 rounded-lg border ${colors.bg} ${colors.border} transition-all hover:shadow-sm`}
    >
      <div className="flex items-center gap-2 mb-2">
        <span className="text-lg">{config.icon}</span>
        <span className={`text-sm font-medium ${colors.text}`}>
          {usage.displayName}
        </span>
      </div>
      <div className="space-y-1">
        <div className="text-xl font-bold text-gray-900 dark:text-white">
          {formatTokens(usage.totalTokens)}
        </div>
        <div className={`text-sm font-medium ${usage.costUsd === 0 ? 'text-green-600 dark:text-green-400' : colors.text}`}>
          {formatCost(usage.costUsd)}
        </div>
        <div className="text-xs text-gray-500 dark:text-gray-400">
          {usage.callCount} model{usage.callCount !== 1 ? 's' : ''}
        </div>
      </div>
    </div>
  )
}


export function CostMonitor() {
  const [data, setData] = useState<CostAnalytics | null>(null)
  const [claudeUsage, setClaudeUsage] = useState<ClaudeUsageSnapshot | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // External usage (actual API billing)
  const { summary: externalSummary, fetchSummary: fetchExternalSummary } = useExternalUsageStore()

  const loadData = useCallback(async () => {
    try {
      setLoading(true)
      setError(null)
      const [result, claude] = await Promise.all([
        fetchCostAnalytics(),
        fetchClaudeUsage().catch(() => null),
      ])
      setData(result)
      setClaudeUsage(claude)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadData()
    fetchExternalSummary()
  }, [loadData, fetchExternalSummary])

  const providerUsage = data ? groupByProvider(data.by_model) : {}
  const providers = Object.entries(providerUsage) as [string, ProviderUsage][]
  const sortedProviders = [...providers]
    .filter(([, u]) => u.totalTokens > 0 || u.costUsd > 0)
    .sort((a, b) => b[1].totalTokens - a[1].totalTokens)

  const totalTokens = data?.total_tokens ?? 0
  const totalCost = data?.total_cost ?? 0
  const analyticsPeriod = formatAnalyticsPeriod(data?.period_days)
  const externalCostLabel = buildExternalCostLabel(externalSummary)
  const runtimeProviders = sortedProviders
    .map(([, usage]) => usage.displayName)
    .join(', ') || 'No data'
  const claudeWeeklyTokens = getClaudeWeeklyTokens(claudeUsage)

  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-4">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-semibold text-gray-900 dark:text-white">
          LLM Provider Usage
        </h3>
        <button
          onClick={loadData}
          disabled={loading}
          className="text-xs text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 disabled:opacity-50"
          aria-label="Refresh LLM usage data"
        >
          {loading ? '...' : '↻'}
        </button>
      </div>

      {error && (
        <div className="text-xs text-red-500 dark:text-red-400 mb-3">
          {error}
        </div>
      )}

      {/* Total Summary */}
      <div className="grid grid-cols-2 gap-4 mb-4 p-3 bg-gray-50 dark:bg-gray-700/50 rounded-lg">
        <div>
          <div className="text-2xl font-bold text-gray-900 dark:text-white">
            {formatTokens(totalTokens)}
          </div>
          <div className="text-xs text-gray-500 dark:text-gray-400">
            Total Tokens
          </div>
          {analyticsPeriod && (
            <div
              className="text-[11px] text-gray-400 dark:text-gray-500"
              aria-label={`AOS 집계 기간 ${analyticsPeriod}`}
            >
              AOS 집계 {analyticsPeriod}
            </div>
          )}
        </div>
        <div>
          <div className="text-2xl font-bold text-green-600 dark:text-green-400">
            {formatCost(totalCost)}
          </div>
          <div className="text-xs text-gray-500 dark:text-gray-400">
            Total Cost
            {externalCostLabel && (
              <span
                className="ml-1 text-amber-600 dark:text-amber-400"
                aria-label={externalCostLabel.ariaLabel}
              >
                {externalCostLabel.text}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Source Split */}
      <div className="mb-4">
        <h4 className="text-xs font-medium text-gray-700 dark:text-gray-300 uppercase tracking-wider mb-3">
          By Source
        </h4>
        <div className="space-y-2">
          <SourceRow
            label="AOS Runtime"
            value={formatTokens(totalTokens)}
            meta={`${runtimeProviders} · ${formatCost(totalCost)}`}
          />
          <SourceRow
            label="Claude Code"
            value={claudeUsage ? formatTokens(claudeWeeklyTokens) : loading ? '...' : '0'}
            meta={`${getClaudePlanLabel(claudeUsage)} · ${getClaudeSourceLabel(claudeUsage)}`}
          />
        </div>
      </div>

      {/* Provider Cards */}
      <div className="mb-4">
        <h4 className="text-xs font-medium text-gray-700 dark:text-gray-300 uppercase tracking-wider mb-3">
          By Provider
        </h4>
        {sortedProviders.length > 0 ? (
          <div className="grid grid-cols-2 gap-3">
            {sortedProviders.map(([provider, usage]) => (
              <ProviderCard key={provider} usage={usage} groupKey={provider} />
            ))}
          </div>
        ) : (
          <div className="text-center py-4 text-gray-500 dark:text-gray-400 text-sm">
            {loading ? 'Loading...' : 'No provider usage data yet'}
          </div>
        )}
      </div>

    </div>
  )
}

export function CostBadge() {
  const [data, setData] = useState<CostAnalytics | null>(null)
  const {
    summary: externalSummary,
    fetchSummary: fetchExternalSummary,
    period,
  } = useExternalUsageStore()

  useEffect(() => {
    fetchCostAnalytics()
      .then(setData)
      .catch(() => {/* silent fail for badge */})
    fetchExternalSummary()
  }, [fetchExternalSummary])

  if (!data || data.total_tokens === 0) return null

  const providerUsage = groupByProvider(data.by_model)
  const providerEntries = Object.values(providerUsage)
  // 분석 총계의 기간은 백엔드 응답에서 온다. 아래 `periodDays`(외부 사용량 스토어)와
  // 다른 값이며, 하나를 다른 하나의 라벨로 재사용하지 않는다.
  const analyticsPeriod = formatAnalyticsPeriod(data.period_days)
  // `actualCost > 0` 게이트를 두지 않는다 — 비용이 전부 미측정이면 배지가 통째로
  // 사라져 "데이터 없음" 처럼 보이던 결함(감사 §2 계열)이 그것이다.
  const externalCostLabel = buildExternalCostLabel(externalSummary)
  // 기간·수집 범위는 store 단일 소스에서 읽는다. 상세 페이지와 같은 값을 본다.
  const periodDays = period?.days ?? DEFAULT_PERIOD_DAYS
  const coverageText = summarizeCoverage(externalSummary?.coverage)

  return (
    <div className="flex items-center gap-2 px-2 py-1 bg-gray-100 dark:bg-gray-700 rounded-md text-xs">
      {/* Provider icons */}
      {providerEntries.length > 0 && (
        <span className="flex items-center gap-0.5">
          {providerEntries.slice(0, 3).map((usage) => (
            <span key={usage.displayName} title={usage.displayName}>
              {PROVIDER_CONFIG[usage.provider].icon}
            </span>
          ))}
          {providerEntries.length > 3 && (
            <span className="text-gray-500">+{providerEntries.length - 3}</span>
          )}
        </span>
      )}
      <span className="text-gray-600 dark:text-gray-400">
        {formatTokens(data.total_tokens)} tokens
      </span>
      <span className="text-gray-400 dark:text-gray-500">|</span>
      <span className="text-green-600 dark:text-green-400 font-medium">
        {formatCost(data.total_cost)}
      </span>
      {analyticsPeriod && (
        <span
          className="text-gray-500 dark:text-gray-400"
          aria-label={`AOS 집계 기간 ${analyticsPeriod}`}
        >
          AOS 집계 {analyticsPeriod}
        </span>
      )}
      {externalCostLabel && (
        <span
          className="text-amber-600 dark:text-amber-400 font-medium"
          aria-label={externalCostLabel.ariaLabel}
        >
          {externalCostLabel.text}
        </span>
      )}
      <span className="text-gray-400 dark:text-gray-500">|</span>
      <span
        className="text-gray-500 dark:text-gray-400"
        aria-label={`조회 기간 최근 ${periodDays}일`}
        title={coverageText ? `수집 범위: ${coverageText}` : undefined}
      >
        최근 {periodDays}일
      </span>
      {coverageText && (
        <span className="hidden lg:inline text-gray-400 dark:text-gray-500" aria-label={`수집 범위 ${coverageText}`}>
          {coverageText}
        </span>
      )}
    </div>
  )
}
