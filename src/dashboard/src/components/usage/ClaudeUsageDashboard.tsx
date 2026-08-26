import { memo, useEffect, useCallback, useState } from 'react'
import { BarChart3, RefreshCw, AlertCircle, CheckCircle2, XCircle, Clock } from 'lucide-react'
import { useClaudeUsageStore } from '../../stores/claudeUsage'
import type { PlanLimitInfo } from '../../types/claudeUsage'
import { apiClient } from '../../services/apiClient'

const REFRESH_INTERVAL = 5 * 60 * 1000 // 5 minutes

interface CodexUsageBreakdown {
  name: string
  tokens: number
  threads: number
}

interface CodexCliUsageResponse {
  available: boolean
  fiveHourTokens: number
  fiveHourThreads: number
  weeklyTokens: number
  weeklyThreads: number
  totalTokens: number
  totalThreads: number
  byModel: CodexUsageBreakdown[]
  message?: string | null
}

interface CodexPlanWindow {
  usedPercent: number
  remainingPercent: number
  windowDurationMins: number | null
  resetsAt: number | null
  resetsAtIso: string | null
  resetsInMinutes: number | null
}

interface CodexPlanLimitSnapshot {
  limitId: string | null
  limitName: string | null
  primary: CodexPlanWindow | null
  secondary: CodexPlanWindow | null
  planType: string | null
  rateLimitReachedType: string | null
}

interface CodexPlanUsageResponse {
  available: boolean
  codexLimit: CodexPlanLimitSnapshot | null
  rateLimitResetCredits: { availableCount?: number } | null
  isCached: boolean
  cacheAgeSeconds: number | null
  message?: string | null
}

interface CodexUsageSummary {
  available: boolean
  fiveHourTokens: number
  fiveHourThreads: number
  weeklyTokens: number
  weeklyThreads: number
  totalTokens: number
  totalThreads: number
  modelCount: number
  message?: string | null
}

export function ClaudeUsageDashboard() {
  const { usage, isLoading, error, lastFetched, fetchUsage, clearError } = useClaudeUsageStore()
  const [codexUsage, setCodexUsage] = useState<CodexUsageSummary | null>(null)
  const [codexPlan, setCodexPlan] = useState<CodexPlanUsageResponse | null>(null)
  const [isCodexLoading, setIsCodexLoading] = useState(false)

  const fetchCodexUsage = useCallback(async (forceRefresh = false) => {
    setIsCodexLoading(true)
    try {
      const cacheBuster = `t=${Date.now()}`
      const planPath = forceRefresh
        ? `/api/usage/codex-plan?refresh=true&${cacheBuster}`
        : `/api/usage/codex-plan?${cacheBuster}`
      const [planResult, localResult] = await Promise.allSettled([
        apiClient.get<CodexPlanUsageResponse>(planPath, {
          timeout: 15_000,
        }),
        apiClient.get<CodexCliUsageResponse>('/api/usage/codex-cli', {
          timeout: 10_000,
        }),
      ])

      setCodexPlan(planResult.status === 'fulfilled' ? planResult.value : null)

      if (localResult.status === 'fulfilled') {
        const data = localResult.value
        setCodexUsage({
          available: data.available,
          fiveHourTokens: data.fiveHourTokens,
          fiveHourThreads: data.fiveHourThreads,
          weeklyTokens: data.weeklyTokens,
          weeklyThreads: data.weeklyThreads,
          totalTokens: data.totalTokens,
          totalThreads: data.totalThreads,
          modelCount: data.byModel.filter((model) => model.tokens > 0).length,
          message: data.message,
        })
      } else {
        setCodexUsage(null)
      }
    } finally {
      setIsCodexLoading(false)
    }
  }, [])

  const refreshAllUsage = useCallback((forceRefresh = false) => {
    fetchUsage(forceRefresh)
    fetchCodexUsage(forceRefresh)
  }, [fetchUsage, fetchCodexUsage])

  // Fetch on mount and set up auto-refresh
  useEffect(() => {
    refreshAllUsage()

    const interval = setInterval(() => {
      refreshAllUsage()
    }, REFRESH_INTERVAL)

    return () => clearInterval(interval)
  }, [refreshAllUsage])

  const handleRefresh = useCallback(() => {
    clearError()
    refreshAllUsage(true)
  }, [refreshAllUsage, clearError])

  // Format number with K/M suffix
  const formatTokenCount = (count: number) => {
    if (count >= 1_000_000) {
      return `${(count / 1_000_000).toFixed(1)}M`
    }
    if (count >= 1_000) {
      return `${(count / 1_000).toFixed(1)}K`
    }
    return count.toString()
  }

  // Error state
  if (error) {
    return (
      <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4 h-full">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white flex items-center gap-2">
            <BarChart3 className="w-5 h-5" />
            Plan Usage Limits
          </h3>
          <button
            onClick={handleRefresh}
            disabled={isLoading}
            className="p-1.5 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 rounded transition-colors"
          >
            <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
          </button>
        </div>
        <div className="flex items-center gap-2 text-sm text-red-600 dark:text-red-400">
          <AlertCircle className="w-4 h-4" />
          <span>{error}</span>
        </div>
      </div>
    )
  }

  // Loading state
  if (isLoading && !usage) {
    return (
      <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4 h-full">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white flex items-center gap-2">
            <BarChart3 className="w-5 h-5" />
            Plan Usage Limits
          </h3>
          <RefreshCw className="w-4 h-4 animate-spin text-gray-400" />
        </div>
        <div className="space-y-4 animate-pulse">
          <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-3/4" />
          <div className="h-2 bg-gray-200 dark:bg-gray-700 rounded" />
          <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-1/2" />
          <div className="h-2 bg-gray-200 dark:bg-gray-700 rounded" />
        </div>
      </div>
    )
  }

  // Empty state
  if (!usage) {
    return (
      <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4 h-full">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white flex items-center gap-2">
            <BarChart3 className="w-5 h-5" />
            Plan Usage Limits
          </h3>
        </div>
        <p className="text-sm text-gray-500 dark:text-gray-400">
          No usage data available
        </p>
      </div>
    )
  }

  // Find plan limits by name
  const sessionLimit = usage.planLimits.find(l => l.name === 'fiveHour')
  const allModelsLimit = usage.planLimits.find(l => l.name === 'sevenDay')
  const sonnetLimit = usage.planLimits.find(l => l.name === 'sevenDaySonnet')
  const opusLimit = usage.planLimits.find(l => l.name === 'sevenDayOpus')
  const codexLimit = codexPlan?.available ? codexPlan.codexLimit : null
  // Codex 사용량 창은 슬롯 위치(primary/secondary)가 아니라 창 길이(windowDurationMins)로 라벨을 정한다.
  // OpenAI가 5시간창을 제거하면서 앱서버가 주간창 하나만 primary 슬롯에 반환하는 등 슬롯 매핑이 유동적이기 때문.
  const codexWindows = [codexLimit?.primary, codexLimit?.secondary].filter(
    (window): window is CodexPlanWindow => window != null,
  )
  // Placeholders only make sense once Anthropic answered at all. When OAuth
  // itself is down the yellow banner above the grid already says so, and
  // placeholders would state the same failure a second time.
  // The backend sets oauthAvailable only on paths where upstream actually
  // responded, so it alone is the signal - gating on planLimits.length would
  // re-hide both cards in the very case this placeholder exists for (upstream
  // answered but omitted every core limit).
  const claudeLimitsExpected = usage.oauthAvailable
  const codexWeeklyTokens = codexUsage?.weeklyTokens ?? 0
  const combinedWeeklyTokens = usage.weeklyTotalTokens + codexWeeklyTokens
  const secondaryLimits = [sonnetLimit, opusLimit].filter(Boolean) as PlanLimitInfo[]

  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4 h-full flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white flex items-center gap-2">
          <BarChart3 className="w-5 h-5" />
          Plan Usage Limits
        </h3>
        <div className="flex items-center gap-2">
          {codexPlan?.available ? (
            <span
              className="flex items-center gap-1 text-xs text-green-600 dark:text-green-400"
              title={codexPlan.isCached ? 'Cached Codex plan data' : 'ChatGPT Codex plan data'}
            >
              <CheckCircle2 className="w-3 h-3" />
              Codex {codexPlan.isCached ? 'Cached' : 'Live'}
            </span>
          ) : isCodexLoading ? (
            <span className="flex items-center gap-1 text-xs text-blue-600 dark:text-blue-400">
              <RefreshCw className="w-3 h-3 animate-spin" />
              Codex
            </span>
          ) : (
            <span
              className="flex items-center gap-1 text-xs text-yellow-600 dark:text-yellow-400"
              title={codexPlan?.message || 'Codex plan limits unavailable'}
            >
              <XCircle className="w-3 h-3" />
              Codex Offline
            </span>
          )}
          {/* Claude OAuth Status Indicator */}
          {usage.oauthAvailable ? (
            usage.isCached ? (
              <span className="flex items-center gap-1 text-xs text-blue-600 dark:text-blue-400" title={`Cached data (${usage.cacheAgeMinutes ?? 0}m ago)`}>
                <Clock className="w-3 h-3" />
                Claude Cached
              </span>
            ) : (
              <span className="flex items-center gap-1 text-xs text-green-600 dark:text-green-400" title="Real-time data from Anthropic API">
                <CheckCircle2 className="w-3 h-3" />
                Claude Live
              </span>
            )
          ) : (
            <span className="flex items-center gap-1 text-xs text-yellow-600 dark:text-yellow-400" title={usage.oauthError || 'OAuth not available'}>
              <XCircle className="w-3 h-3" />
              Claude Offline
            </span>
          )}
          {lastFetched && (
            <span className="text-xs text-gray-400 dark:text-gray-500">
              {lastFetched.toLocaleTimeString()}
            </span>
          )}
          <button
            onClick={handleRefresh}
            disabled={isLoading}
            className="p-1.5 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 rounded transition-colors"
            title="Refresh"
          >
            <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      <div className="space-y-4 flex-1 flex flex-col">
        {/* OAuth Available - Show real plan limits */}
        {usage.oauthAvailable && usage.planLimits.length > 0 ? (
          <>
            {/* Cached data notice */}
            {usage.isCached && (
              <div className="flex items-center gap-2 text-xs text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/20 px-2 py-1.5 rounded">
                <Clock className="w-3 h-3" />
                <span>Using cached data ({usage.cacheAgeMinutes}m ago) - API temporarily unavailable</span>
              </div>
            )}
          </>
        ) : (
          /* Fallback - OAuth not available, show local stats */
          <div className="text-sm text-gray-500 dark:text-gray-400">
            <div className="flex items-center gap-2 mb-3 p-2 bg-yellow-50 dark:bg-yellow-900/20 rounded">
              <AlertCircle className="w-4 h-4 text-yellow-600 dark:text-yellow-400" />
              <span className="text-yellow-700 dark:text-yellow-300">
                {usage.oauthError || 'Plan limits unavailable'}
              </span>
            </div>
            <p>Claude plan limits unavailable; Codex plan limits are checked separately.</p>
          </div>
        )}

        <div>
          <h4 className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-2">
            ChatGPT Codex & Claude Plan Limits
          </h4>
          <div className="grid grid-cols-2 sm:grid-cols-1 xl:grid-cols-2 gap-3">
            <ClaudeLimitMetric
              label="Claude Session"
              limit={sessionLimit}
              showPlaceholder={claudeLimitsExpected}
            />
            <ClaudeLimitMetric
              label="Claude Weekly"
              limit={allModelsLimit}
              showPlaceholder={claudeLimitsExpected}
            />
            {codexWindows.length > 0 ? (
              codexWindows.map((window, idx) => (
                <UsageRadialMetric
                  key={window.windowDurationMins ?? idx}
                  label={formatCodexWindowLabel(window)}
                  value={`${Math.round(window.usedPercent)}% used`}
                  detail={formatCodexPlanDetail(window, codexLimit?.planType)}
                  percent={window.usedPercent}
                  tone={getCodexUsedTone(window.usedPercent)}
                />
              ))
            ) : (
              <UsageRadialMetric
                label="Codex"
                value={isCodexLoading ? '...' : 'Unavailable'}
                detail={formatCodexPlanUnavailable(codexPlan, isCodexLoading)}
                percent={0}
                tone="yellow"
                centerText={isCodexLoading ? '...' : 'N/A'}
              />
            )}
          </div>

          {codexPlan?.available && codexPlan.rateLimitResetCredits?.availableCount !== undefined && (
            <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">
              Codex reset credits: {codexPlan.rateLimitResetCredits.availableCount}
            </p>
          )}

          {secondaryLimits.length > 0 && (
            <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-2">
              {secondaryLimits.map((limit) => (
                <LimitPill key={limit.name} limit={limit} />
              ))}
            </div>
          )}
        </div>

        {/* Weekly Summary (always shown) */}
        <div className="pt-3 border-t border-gray-100 dark:border-gray-700">
          <h4 className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-2">
            Local Token Usage (diagnostic)
          </h4>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-center">
            <div>
              <p className="text-lg font-semibold text-gray-900 dark:text-white">
                {formatTokenCount(combinedWeeklyTokens)}
              </p>
              <p className="text-xs text-gray-500 dark:text-gray-400">Total</p>
            </div>
            <div>
              <p className="text-lg font-semibold text-purple-600 dark:text-purple-400">
                {isCodexLoading ? '...' : formatTokenCount(codexWeeklyTokens)}
              </p>
              <p className="text-xs text-gray-500 dark:text-gray-400">Codex</p>
            </div>
            <div>
              <p className="text-lg font-semibold text-blue-600 dark:text-blue-400">
                {formatTokenCount(usage.weeklySonnetTokens)}
              </p>
              <p className="text-xs text-gray-500 dark:text-gray-400">Sonnet</p>
            </div>
            <div>
              <p className="text-lg font-semibold text-purple-600 dark:text-purple-400">
                {formatTokenCount(usage.weeklyOpusTokens)}
              </p>
              <p className="text-xs text-gray-500 dark:text-gray-400">Opus</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

type UsageTone = 'blue' | 'yellow' | 'red' | 'purple'

const RADIAL_STROKE_CLASS: Record<UsageTone, string> = {
  blue: 'stroke-primary-500',
  yellow: 'stroke-yellow-500',
  red: 'stroke-red-500',
  purple: 'stroke-purple-500',
}

const RADIAL_TEXT_CLASS: Record<UsageTone, string> = {
  blue: 'text-primary-600 dark:text-primary-400',
  yellow: 'text-yellow-600 dark:text-yellow-400',
  red: 'text-red-600 dark:text-red-400',
  purple: 'text-purple-600 dark:text-purple-400',
}

/**
 * Claude 플랜 limit 카드. 상류 응답에 해당 limit 이 없으면 카드를 조용히
 * 생략하지 않고 "Unavailable" 로 명시한다 — 무음 생략은 상류 장애를
 * 프론트엔드 버그처럼 보이게 만든다(2026-08-26 sevenDay 누락 사례).
 */
const ClaudeLimitMetric = memo(({
  label,
  limit,
  showPlaceholder,
}: {
  label: string
  limit: PlanLimitInfo | undefined
  showPlaceholder: boolean
}) => {
  if (limit) {
    return (
      <UsageRadialMetric
        label={label}
        value={`${Math.round(limit.utilization)}%`}
        detail={`${formatResetTime(limit)} reset`}
        percent={limit.utilization}
        tone={getLimitTone(limit.utilization)}
      />
    )
  }

  if (!showPlaceholder) return null

  return (
    <UsageRadialMetric
      label={label}
      value="Unavailable"
      detail="Not included in the latest Anthropic response"
      percent={0}
      tone="yellow"
      centerText="N/A"
    />
  )
})

ClaudeLimitMetric.displayName = 'ClaudeLimitMetric'

function UsageRadialMetric({
  label,
  value,
  detail,
  percent,
  tone,
  centerText,
}: {
  label: string
  value: string
  detail: string
  percent: number
  tone: UsageTone
  centerText?: string
}) {
  const radius = 28
  const circumference = 2 * Math.PI * radius
  const safePercent = Math.max(0, Math.min(100, percent))
  const dashLength = (safePercent / 100) * circumference

  return (
    <div className="rounded-md bg-gray-50 dark:bg-gray-900/40 px-3 py-2.5">
      <div className="flex items-center gap-3">
        <div className="relative h-16 w-16 flex-shrink-0">
          <svg className="h-16 w-16 -rotate-90" viewBox="0 0 72 72" aria-hidden="true">
            <circle
              cx="36"
              cy="36"
              r={radius}
              className="fill-none stroke-gray-200 dark:stroke-gray-700"
              strokeWidth="7"
            />
            <circle
              cx="36"
              cy="36"
              r={radius}
              className={`fill-none ${RADIAL_STROKE_CLASS[tone]} transition-all duration-300`}
              strokeWidth="7"
              strokeLinecap="round"
              strokeDasharray={`${dashLength} ${circumference - dashLength}`}
            />
          </svg>
          <div className="absolute inset-0 flex items-center justify-center">
            <span className={`text-xs font-semibold ${RADIAL_TEXT_CLASS[tone]}`}>
              {centerText ?? `${Math.round(safePercent)}%`}
            </span>
          </div>
        </div>
        <div className="min-w-0">
          <p className="text-xs font-medium text-gray-500 dark:text-gray-400">{label}</p>
          <p className="text-base font-semibold text-gray-900 dark:text-white">
            {value}
          </p>
          <p className="text-xs text-gray-500 dark:text-gray-400" title={detail}>
            {detail}
          </p>
        </div>
      </div>
    </div>
  )
}

function LimitPill({ limit }: { limit: PlanLimitInfo }) {
  const tone = getLimitTone(limit.utilization)
  return (
    <div className="flex items-center justify-between rounded-md bg-gray-50 dark:bg-gray-900/40 px-3 py-2">
      <div className="min-w-0">
        <p className="truncate text-xs font-medium text-gray-700 dark:text-gray-300">
          {limit.displayName}
        </p>
        <p className="text-xs text-gray-500 dark:text-gray-400">
          {formatResetTime(limit)} reset
        </p>
      </div>
      <span className={`text-sm font-semibold ${RADIAL_TEXT_CLASS[tone]}`}>
        {Math.round(limit.utilization)}%
      </span>
    </div>
  )
}

function formatResetTime(limit: PlanLimitInfo): string {
  const hours = Math.floor(limit.resetsInHours ?? 0)
  const mins = Math.floor(limit.resetsInMinutes ?? 0)

  if (hours >= 24) {
    const days = Math.floor(hours / 24)
    const remainingHours = hours % 24
    return `${days}d ${remainingHours}h`
  }

  if (hours > 0) return `${hours}h ${mins}m`
  return `${mins}m`
}

function getLimitTone(percentUsed: number): UsageTone {
  if (percentUsed >= 90) return 'red'
  if (percentUsed >= 70) return 'yellow'
  return 'blue'
}

/**
 * Codex 창은 Claude 카드와 같은 "소요량" 임계치(70/90%)를 쓰되,
 * 안전 구간 색만 purple 로 남겨 같은 그리드에서 프로바이더를 구분한다.
 */
function getCodexUsedTone(percentUsed: number): UsageTone {
  if (percentUsed >= 90) return 'red'
  if (percentUsed >= 70) return 'yellow'
  return 'purple'
}

/**
 * Codex 사용량 창 라벨을 창 길이(windowDurationMins) 기준으로 결정한다.
 * 슬롯 위치(primary/secondary)는 OpenAI 정책 변화에 따라 유동적이므로 데이터 속성으로 라벨링한다.
 * 300분→"Codex 5h", 10080분(7일)→"Codex Weekly", 그 외는 시간/일 단위로 일반화.
 */
function formatCodexWindowLabel(window: CodexPlanWindow): string {
  const mins = window.windowDurationMins
  if (mins == null) return 'Codex'
  if (mins === 10080) return 'Codex Weekly'
  if (mins < 60 * 24) return `Codex ${Math.round(mins / 60)}h`
  return `Codex ${Math.round(mins / (60 * 24))}d`
}

function formatCodexPlanDetail(window: CodexPlanWindow, planType?: string | null): string {
  const pieces = [
    `${Math.round(window.remainingPercent)}% left`,
    `${formatCodexWindowReset(window)} reset`,
  ]
  if (planType) {
    pieces.unshift(formatPlanName(planType))
  }
  return pieces.join(' / ')
}

function formatCodexWindowReset(window: CodexPlanWindow): string {
  const minutes = Math.floor(window.resetsInMinutes ?? 0)

  if (minutes <= 0) return 'soon'
  if (minutes >= 60 * 24) {
    const days = Math.floor(minutes / (60 * 24))
    const hours = Math.floor((minutes % (60 * 24)) / 60)
    return `${days}d ${hours}h`
  }
  if (minutes >= 60) {
    const hours = Math.floor(minutes / 60)
    const remainingMinutes = minutes % 60
    return `${hours}h ${remainingMinutes}m`
  }
  return `${minutes}m`
}

function formatPlanName(planType: string): string {
  if (!planType) return ''
  return planType.charAt(0).toUpperCase() + planType.slice(1)
}

function formatCodexPlanUnavailable(
  codexPlan: CodexPlanUsageResponse | null,
  isLoading: boolean
): string {
  if (isLoading) return 'Loading ChatGPT Codex plan'
  if (!codexPlan) return 'ChatGPT Codex plan unavailable'
  if (!codexPlan.available) return codexPlan.message || 'ChatGPT Codex plan unavailable'

  return 'ChatGPT Codex plan unavailable'
}
