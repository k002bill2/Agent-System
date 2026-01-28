/**
 * LLM Router Settings Component
 * Manages LLM providers with auto-switch capabilities
 */

import { useEffect, useState } from 'react'
import { cn } from '../../lib/utils'
import {
  Server,
  Plus,
  Trash2,
  RefreshCw,
  CheckCircle,
  XCircle,
  AlertTriangle,
  Activity,
  Loader2,
  ToggleLeft,
  ToggleRight,
  ChevronDown,
  ChevronUp,
  Zap,
  DollarSign,
  Clock,
} from 'lucide-react'

// ─────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────

type ProviderStatus = 'healthy' | 'degraded' | 'unhealthy' | 'unknown'
type RoutingStrategy = 'priority' | 'round_robin' | 'least_cost' | 'least_latency' | 'fallback_chain'
type ProviderType = 'anthropic' | 'google' | 'openai' | 'ollama'

interface LLMProvider {
  id: string
  provider: ProviderType
  model: string
  api_key: string | null
  base_url: string | null
  enabled: boolean
  priority: number
  max_retries: number
  timeout_seconds: number
  cost_per_1k_input: number
  cost_per_1k_output: number
  status: ProviderStatus
  consecutive_failures: number
  last_health_check: string | null
}

interface RouterConfig {
  strategy: RoutingStrategy
  health_check_interval_seconds: number
  auto_failover: boolean
  max_failover_attempts: number
  cooldown_seconds: number
  enable_fallback: boolean
  fallback_providers: string[]
}

interface HealthCheck {
  provider_id: string
  provider: ProviderType
  model: string
  status: ProviderStatus
  latency_ms: number | null
  error: string | null
  checked_at: string
}

interface RouterStats {
  total_requests: number
  successful_requests: number
  failed_requests: number
  fallback_count: number
  provider_usage: Record<string, number>
  average_latency_ms: number
  total_cost: number
}

// ─────────────────────────────────────────────────────────────
// API Functions
// ─────────────────────────────────────────────────────────────

const API_BASE = import.meta.env.VITE_API_URL || '/api'

async function fetchProviders(): Promise<LLMProvider[]> {
  const res = await fetch(`${API_BASE}/llm-router/providers`)
  if (!res.ok) throw new Error('Failed to fetch providers')
  return res.json()
}

async function fetchRouterConfig(): Promise<RouterConfig> {
  const res = await fetch(`${API_BASE}/llm-router/config`)
  if (!res.ok) throw new Error('Failed to fetch config')
  return res.json()
}

async function updateRouterConfig(config: Partial<RouterConfig>): Promise<RouterConfig> {
  const res = await fetch(`${API_BASE}/llm-router/config`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(config),
  })
  if (!res.ok) throw new Error('Failed to update config')
  return res.json()
}

async function checkHealth(): Promise<HealthCheck[]> {
  const res = await fetch(`${API_BASE}/llm-router/health`)
  if (!res.ok) throw new Error('Failed to check health')
  return res.json()
}

async function fetchStats(): Promise<RouterStats> {
  const res = await fetch(`${API_BASE}/llm-router/stats`)
  if (!res.ok) throw new Error('Failed to fetch stats')
  return res.json()
}

async function toggleProvider(providerId: string): Promise<{ enabled: boolean }> {
  const res = await fetch(`${API_BASE}/llm-router/providers/${providerId}/toggle`, {
    method: 'POST',
  })
  if (!res.ok) throw new Error('Failed to toggle provider')
  return res.json()
}

async function deleteProvider(providerId: string): Promise<void> {
  const res = await fetch(`${API_BASE}/llm-router/providers/${providerId}`, {
    method: 'DELETE',
  })
  if (!res.ok) throw new Error('Failed to delete provider')
}

async function initializeProviders(): Promise<void> {
  const res = await fetch(`${API_BASE}/llm-router/initialize`, {
    method: 'POST',
  })
  if (!res.ok) throw new Error('Failed to initialize providers')
}

// ─────────────────────────────────────────────────────────────
// Components
// ─────────────────────────────────────────────────────────────

const statusIcons: Record<ProviderStatus, typeof CheckCircle> = {
  healthy: CheckCircle,
  degraded: AlertTriangle,
  unhealthy: XCircle,
  unknown: Activity,
}

const statusColors: Record<ProviderStatus, string> = {
  healthy: 'text-green-500',
  degraded: 'text-yellow-500',
  unhealthy: 'text-red-500',
  unknown: 'text-gray-400',
}

const strategyLabels: Record<RoutingStrategy, string> = {
  priority: 'Priority (Highest First)',
  round_robin: 'Round Robin',
  least_cost: 'Least Cost',
  least_latency: 'Lowest Latency',
  fallback_chain: 'Fallback Chain',
}

const providerLabels: Record<ProviderType, string> = {
  anthropic: 'Anthropic (Claude)',
  google: 'Google (Gemini)',
  openai: 'OpenAI (GPT)',
  ollama: 'Ollama (Local)',
}

export function LLMRouterSettings() {
  const [providers, setProviders] = useState<LLMProvider[]>([])
  const [config, setConfig] = useState<RouterConfig | null>(null)
  const [stats, setStats] = useState<RouterStats | null>(null)
  const [loading, setLoading] = useState(true)
  const [checkingHealth, setCheckingHealth] = useState(false)
  const [expandedProvider, setExpandedProvider] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  // Fetch data on mount
  useEffect(() => {
    loadData()
  }, [])

  const loadData = async () => {
    try {
      setLoading(true)
      setError(null)
      const [providersData, configData, statsData] = await Promise.all([
        fetchProviders(),
        fetchRouterConfig(),
        fetchStats(),
      ])
      setProviders(providersData)
      setConfig(configData)
      setStats(statsData)
    } catch {
      setError('Failed to load LLM Router data')
    } finally {
      setLoading(false)
    }
  }

  const handleCheckHealth = async () => {
    try {
      setCheckingHealth(true)
      await checkHealth()
      await loadData()
    } catch {
      setError('Failed to check health')
    } finally {
      setCheckingHealth(false)
    }
  }

  const handleToggleProvider = async (providerId: string) => {
    try {
      await toggleProvider(providerId)
      await loadData()
    } catch {
      setError('Failed to toggle provider')
    }
  }

  const handleDeleteProvider = async (providerId: string) => {
    if (!confirm('Are you sure you want to delete this provider?')) return
    try {
      await deleteProvider(providerId)
      await loadData()
    } catch {
      setError('Failed to delete provider')
    }
  }

  const handleInitialize = async () => {
    try {
      await initializeProviders()
      await loadData()
    } catch {
      setError('Failed to initialize providers')
    }
  }

  const handleStrategyChange = async (strategy: RoutingStrategy) => {
    try {
      await updateRouterConfig({ strategy })
      await loadData()
    } catch {
      setError('Failed to update strategy')
    }
  }

  const handleToggleAutoFailover = async () => {
    if (!config) return
    try {
      await updateRouterConfig({ auto_failover: !config.auto_failover })
      await loadData()
    } catch {
      setError('Failed to toggle auto-failover')
    }
  }

  if (loading) {
    return (
      <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4">
        <div className="flex items-center justify-center py-8">
          <Loader2 className="w-6 h-6 animate-spin text-primary-500" />
        </div>
      </div>
    )
  }

  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-medium text-gray-900 dark:text-white flex items-center gap-2">
          <Zap className="w-5 h-5" />
          LLM Auto-Switch
        </h3>
        <div className="flex items-center gap-2">
          <button
            onClick={handleCheckHealth}
            disabled={checkingHealth}
            className="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors disabled:opacity-50"
          >
            {checkingHealth ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <RefreshCw className="w-4 h-4" />
            )}
            Health Check
          </button>
          <button
            onClick={handleInitialize}
            className="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-primary-100 text-primary-700 dark:bg-primary-900/30 dark:text-primary-400 rounded-lg hover:bg-primary-200 dark:hover:bg-primary-900/50 transition-colors"
          >
            <Plus className="w-4 h-4" />
            Initialize
          </button>
        </div>
      </div>

      {error && (
        <div className="mb-4 p-3 bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 rounded-lg text-sm">
          {error}
        </div>
      )}

      {/* Stats Overview */}
      {stats && (
        <div className="grid grid-cols-4 gap-3 mb-4">
          <div className="p-3 bg-gray-50 dark:bg-gray-900/50 rounded-lg">
            <div className="text-xs text-gray-500 dark:text-gray-400">Total Requests</div>
            <div className="text-lg font-semibold text-gray-900 dark:text-white">
              {stats.total_requests.toLocaleString()}
            </div>
          </div>
          <div className="p-3 bg-gray-50 dark:bg-gray-900/50 rounded-lg">
            <div className="text-xs text-gray-500 dark:text-gray-400">Success Rate</div>
            <div className="text-lg font-semibold text-green-600 dark:text-green-400">
              {stats.total_requests > 0
                ? ((stats.successful_requests / stats.total_requests) * 100).toFixed(1)
                : 0}%
            </div>
          </div>
          <div className="p-3 bg-gray-50 dark:bg-gray-900/50 rounded-lg">
            <div className="text-xs text-gray-500 dark:text-gray-400">Avg Latency</div>
            <div className="text-lg font-semibold text-gray-900 dark:text-white">
              {stats.average_latency_ms.toFixed(0)}ms
            </div>
          </div>
          <div className="p-3 bg-gray-50 dark:bg-gray-900/50 rounded-lg">
            <div className="text-xs text-gray-500 dark:text-gray-400">Fallbacks</div>
            <div className="text-lg font-semibold text-yellow-600 dark:text-yellow-400">
              {stats.fallback_count}
            </div>
          </div>
        </div>
      )}

      {/* Routing Strategy */}
      {config && (
        <div className="mb-4 p-3 bg-gray-50 dark:bg-gray-900/50 rounded-lg">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
              Routing Strategy
            </span>
            <div className="flex items-center gap-2">
              <span className="text-xs text-gray-500">Auto-Failover</span>
              <button
                onClick={handleToggleAutoFailover}
                className={cn(
                  'relative inline-flex h-5 w-9 items-center rounded-full transition-colors',
                  config.auto_failover ? 'bg-primary-600' : 'bg-gray-300 dark:bg-gray-600'
                )}
              >
                <span
                  className={cn(
                    'inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform',
                    config.auto_failover ? 'translate-x-4' : 'translate-x-1'
                  )}
                />
              </button>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            {(Object.keys(strategyLabels) as RoutingStrategy[]).map((strategy) => (
              <button
                key={strategy}
                onClick={() => handleStrategyChange(strategy)}
                className={cn(
                  'px-3 py-1.5 text-xs rounded-lg transition-colors',
                  config.strategy === strategy
                    ? 'bg-primary-100 text-primary-700 dark:bg-primary-900/30 dark:text-primary-400'
                    : 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-600'
                )}
              >
                {strategyLabels[strategy]}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Providers List */}
      <div className="space-y-2">
        <div className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
          Providers ({providers.length})
        </div>

        {providers.length === 0 ? (
          <div className="text-center py-8 text-gray-500 dark:text-gray-400">
            <Server className="w-8 h-8 mx-auto mb-2 opacity-50" />
            <p className="text-sm">No providers configured</p>
            <p className="text-xs mt-1">Click Initialize to add providers from environment variables</p>
          </div>
        ) : (
          providers.map((provider) => {
            const StatusIcon = statusIcons[provider.status]
            const isExpanded = expandedProvider === provider.id

            return (
              <div
                key={provider.id}
                className="border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden"
              >
                {/* Header */}
                <div
                  className="flex items-center justify-between p-3 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700/50"
                  onClick={() => setExpandedProvider(isExpanded ? null : provider.id)}
                >
                  <div className="flex items-center gap-3">
                    <StatusIcon className={cn('w-4 h-4', statusColors[provider.status])} />
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-gray-900 dark:text-white text-sm">
                          {providerLabels[provider.provider]}
                        </span>
                        {!provider.enabled && (
                          <span className="px-1.5 py-0.5 text-xs bg-gray-100 text-gray-500 dark:bg-gray-700 dark:text-gray-400 rounded">
                            Disabled
                          </span>
                        )}
                      </div>
                      <div className="text-xs text-gray-500 dark:text-gray-400">
                        {provider.model}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-gray-500 dark:text-gray-400">
                      Priority: {provider.priority}
                    </span>
                    {isExpanded ? (
                      <ChevronUp className="w-4 h-4 text-gray-400" />
                    ) : (
                      <ChevronDown className="w-4 h-4 text-gray-400" />
                    )}
                  </div>
                </div>

                {/* Expanded Details */}
                {isExpanded && (
                  <div className="border-t border-gray-200 dark:border-gray-700 p-3 bg-gray-50 dark:bg-gray-900/50">
                    <div className="grid grid-cols-2 gap-3 text-sm">
                      <div className="flex items-center gap-2">
                        <Clock className="w-4 h-4 text-gray-400" />
                        <span className="text-gray-500 dark:text-gray-400">Timeout:</span>
                        <span className="text-gray-900 dark:text-white">{provider.timeout_seconds}s</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <RefreshCw className="w-4 h-4 text-gray-400" />
                        <span className="text-gray-500 dark:text-gray-400">Retries:</span>
                        <span className="text-gray-900 dark:text-white">{provider.max_retries}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <DollarSign className="w-4 h-4 text-gray-400" />
                        <span className="text-gray-500 dark:text-gray-400">Cost (In/Out):</span>
                        <span className="text-gray-900 dark:text-white">
                          ${provider.cost_per_1k_input}/${provider.cost_per_1k_output}
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        <Activity className="w-4 h-4 text-gray-400" />
                        <span className="text-gray-500 dark:text-gray-400">Failures:</span>
                        <span className={cn(
                          provider.consecutive_failures > 0 ? 'text-red-500' : 'text-gray-900 dark:text-white'
                        )}>
                          {provider.consecutive_failures}
                        </span>
                      </div>
                    </div>

                    {/* Actions */}
                    <div className="flex items-center gap-2 mt-3 pt-3 border-t border-gray-200 dark:border-gray-700">
                      <button
                        onClick={(e) => {
                          e.stopPropagation()
                          handleToggleProvider(provider.id)
                        }}
                        className="flex items-center gap-1.5 px-2 py-1 text-xs bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300 rounded hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
                      >
                        {provider.enabled ? (
                          <>
                            <ToggleRight className="w-4 h-4" />
                            Disable
                          </>
                        ) : (
                          <>
                            <ToggleLeft className="w-4 h-4" />
                            Enable
                          </>
                        )}
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation()
                          handleDeleteProvider(provider.id)
                        }}
                        className="flex items-center gap-1.5 px-2 py-1 text-xs text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded transition-colors"
                      >
                        <Trash2 className="w-4 h-4" />
                        Delete
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )
          })
        )}
      </div>
    </div>
  )
}

export default LLMRouterSettings
