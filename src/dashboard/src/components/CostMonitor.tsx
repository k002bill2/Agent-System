import { useState, useEffect, useCallback } from 'react'

import {
  ProviderUsage,
  LLMProvider,
  PROVIDER_CONFIG,
  identifyProvider,
} from '../stores/orchestration'
import { useExternalUsageStore } from '../stores/externalUsage'

const API_BASE = import.meta.env.VITE_API_URL || '/api'

// ─────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────

interface CostBreakdown {
  category: string
  value: string
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

/** Group by_model entries into provider-level usage. */
function groupByProvider(byModel: CostBreakdown[]): Record<string, ProviderUsage> {
  const result: Record<string, ProviderUsage> = {}

  for (const entry of byModel) {
    if (isIgnoredModel(entry.value)) continue

    const provider = identifyProvider(entry.value)
    const key = provider === 'unknown' ? `unknown:${entry.value}` : provider
    const existing = result[key]

    if (existing) {
      existing.totalTokens += entry.tokens
      existing.costUsd += entry.cost
      existing.callCount += 1
    } else {
      result[key] = {
        provider,
        displayName: provider === 'unknown' ? entry.value : PROVIDER_CONFIG[provider].displayName,
        inputTokens: 0,
        outputTokens: 0,
        totalTokens: entry.tokens,
        costUsd: entry.cost,
        callCount: 1,
      }
    }
  }

  return result
}

async function fetchCostAnalytics(): Promise<CostAnalytics> {
  const res = await fetch(`${API_BASE}/analytics/costs?time_range=all`)
  if (!res.ok) throw new Error('Failed to fetch cost analytics')
  return res.json()
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
}

function ProviderCard({ usage }: ProviderCardProps) {
  const colors = PROVIDER_COLORS[usage.provider]
  const config = PROVIDER_CONFIG[usage.provider]

  return (
    <div
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
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // External usage (actual API billing)
  const { summary: externalSummary, fetchSummary: fetchExternalSummary } = useExternalUsageStore()

  const loadData = useCallback(async () => {
    try {
      setLoading(true)
      setError(null)
      const result = await fetchCostAnalytics()
      setData(result)
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
  const actualCost = externalSummary?.total_cost_usd ?? null

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
        </div>
        <div>
          <div className="text-2xl font-bold text-green-600 dark:text-green-400">
            {formatCost(totalCost)}
          </div>
          <div className="text-xs text-gray-500 dark:text-gray-400">
            Total Cost
            {actualCost !== null && (
              <span className="ml-1 text-amber-600 dark:text-amber-400">
                (실제: {formatCost(actualCost)})
              </span>
            )}
          </div>
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
              <ProviderCard key={provider} usage={usage} />
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
  const { summary: externalSummary, fetchSummary: fetchExternalSummary } = useExternalUsageStore()

  useEffect(() => {
    fetchCostAnalytics()
      .then(setData)
      .catch(() => {/* silent fail for badge */})
    fetchExternalSummary()
  }, [fetchExternalSummary])

  if (!data || data.total_tokens === 0) return null

  const providerUsage = groupByProvider(data.by_model)
  const providerEntries = Object.values(providerUsage)
  const actualCost = externalSummary?.total_cost_usd ?? null

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
      {actualCost !== null && actualCost > 0 && (
        <>
          <span className="text-amber-600 dark:text-amber-400 font-medium">
            (실제: {formatCost(actualCost)})
          </span>
        </>
      )}
    </div>
  )
}
