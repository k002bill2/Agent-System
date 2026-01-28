import { useState } from 'react'
import {
  useOrchestrationStore,
  ProviderUsage,
  LLMProvider,
  PROVIDER_CONFIG,
} from '../stores/orchestration'

// Demo data for UI preview (only shown when no real data exists)
const DEMO_PROVIDER_USAGE: Record<LLMProvider, ProviderUsage> = {
  google: {
    provider: 'google',
    displayName: 'Google Gemini',
    inputTokens: 32150,
    outputTokens: 13050,
    totalTokens: 45200,
    costUsd: 0.0012,
    callCount: 5,
  },
  anthropic: {
    provider: 'anthropic',
    displayName: 'Anthropic Claude',
    inputTokens: 58000,
    outputTokens: 22100,
    totalTokens: 80100,
    costUsd: 0.0222,
    callCount: 12,
  },
  ollama: {
    provider: 'ollama',
    displayName: 'Ollama (Local)',
    inputTokens: 0,
    outputTokens: 0,
    totalTokens: 0,
    costUsd: 0,
    callCount: 0,
  },
  openai: {
    provider: 'openai',
    displayName: 'OpenAI GPT',
    inputTokens: 0,
    outputTokens: 0,
    totalTokens: 0,
    costUsd: 0,
    callCount: 0,
  },
  unknown: {
    provider: 'unknown',
    displayName: 'Unknown',
    inputTokens: 0,
    outputTokens: 0,
    totalTokens: 0,
    costUsd: 0,
    callCount: 0,
  },
}


function formatCost(cost: number): string {
  if (cost === 0) {
    return 'FREE'
  }
  if (cost < 0.001) {
    return `$${(cost * 1000).toFixed(4)}m`
  }
  return `$${cost.toFixed(4)}`
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

// Provider color mapping for Tailwind classes
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
          {config.displayName}
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
          {usage.callCount} call{usage.callCount !== 1 ? 's' : ''}
        </div>
      </div>
    </div>
  )
}


export function CostMonitor() {
  const { providerUsage, totalCost } = useOrchestrationStore()
  const [showDemo, setShowDemo] = useState(false)

  // Use demo data when toggled or when no real data exists
  const hasRealData = Object.keys(providerUsage).length > 0
  const useDemo = showDemo || (!hasRealData && import.meta.env.DEV)

  const effectiveProviderUsage = useDemo
    ? Object.fromEntries(
        Object.entries(DEMO_PROVIDER_USAGE).filter(([, v]) => v.totalTokens > 0)
      ) as Record<LLMProvider, ProviderUsage>
    : providerUsage
  const effectiveTotalCost = useDemo ? 0.0234 : totalCost

  const providers = Object.entries(effectiveProviderUsage) as [LLMProvider, ProviderUsage][]
  const totalTokens = providers.reduce((sum, [, usage]) => sum + usage.totalTokens, 0)

  // Sort providers by total tokens (descending)
  const sortedProviders = [...providers].sort((a, b) => b[1].totalTokens - a[1].totalTokens)

  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-4">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-semibold text-gray-900 dark:text-white flex items-center gap-2">
          <span>LLM Provider Usage</span>
          {useDemo && (
            <span className="text-xs px-1.5 py-0.5 bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-400 rounded">
              Demo
            </span>
          )}
        </h3>
        {import.meta.env.DEV && (
          <button
            onClick={() => setShowDemo(!showDemo)}
            className="text-xs px-2 py-1 rounded bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
          >
            {showDemo ? 'Hide Demo' : 'Show Demo'}
          </button>
        )}
      </div>

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
            {formatCost(effectiveTotalCost)}
          </div>
          <div className="text-xs text-gray-500 dark:text-gray-400">
            Total Cost
          </div>
        </div>
      </div>

      {/* Provider Cards */}
      {sortedProviders.length > 0 ? (
        <div className="mb-4">
          <h4 className="text-xs font-medium text-gray-700 dark:text-gray-300 uppercase tracking-wider mb-3">
            By Provider
          </h4>
          <div className="grid grid-cols-2 gap-3">
            {sortedProviders.map(([provider, usage]) => (
              <ProviderCard key={provider} usage={usage} />
            ))}
          </div>
        </div>
      ) : null}

    </div>
  )
}

export function CostBadge() {
  const { totalCost, tokenUsage, providerUsage } = useOrchestrationStore()

  const totalTokens = Object.values(tokenUsage).reduce(
    (sum, usage) => sum + usage.total_tokens,
    0
  )

  // Get active provider icons
  const activeProviders = Object.keys(providerUsage) as LLMProvider[]

  if (totalTokens === 0) return null

  return (
    <div className="flex items-center gap-2 px-2 py-1 bg-gray-100 dark:bg-gray-700 rounded-md text-xs">
      {/* Provider icons */}
      {activeProviders.length > 0 && (
        <span className="flex items-center gap-0.5">
          {activeProviders.slice(0, 3).map((provider) => (
            <span key={provider} title={PROVIDER_CONFIG[provider].displayName}>
              {PROVIDER_CONFIG[provider].icon}
            </span>
          ))}
          {activeProviders.length > 3 && (
            <span className="text-gray-500">+{activeProviders.length - 3}</span>
          )}
        </span>
      )}
      <span className="text-gray-600 dark:text-gray-400">
        {formatTokens(totalTokens)} tokens
      </span>
      <span className="text-gray-400 dark:text-gray-500">|</span>
      <span className="text-green-600 dark:text-green-400 font-medium">
        {formatCost(totalCost)}
      </span>
    </div>
  )
}
