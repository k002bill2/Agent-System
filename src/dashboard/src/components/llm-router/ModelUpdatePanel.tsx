import { memo, useState, useCallback, useEffect } from 'react'
import {
  RefreshCw,
  Clock,
  CheckCircle,
  XCircle,
  AlertTriangle,
  Loader2,
  Download,
  ChevronDown,
  ChevronUp,
} from 'lucide-react'
import { useSettingsStore } from '../../stores/settings'
import { useAuthStore } from '../../stores/auth'
import { cn } from '../../lib/utils'

interface UpdateCheckResult {
  provider: string
  status: string
  models_discovered: number
  new_models_found: number
  updates_found: number
  errors: string[]
}

interface UpdateHistoryEntry {
  id: string
  provider: string
  status: string
  models_discovered: number
  new_models_found: number
  updates_found: number
  updates_applied: number
  is_manual: boolean
  changes: {
    new?: Array<{ model_id: string; info?: Record<string, unknown> }>
    updated?: Array<{ model_id: string; field?: string; old?: unknown; new?: unknown }>
    errors?: string[]
  } | null
  error_message: string | null
  triggered_by: string | null
  checked_at: string | null
}

interface UpdateStatus {
  enabled: boolean
  check_interval_hours: number
  last_check: {
    checked_at: string
    provider: string
    status: string
    new_models_found: number
    updates_found: number
  } | null
  configured_providers: string[]
}

const PROVIDER_COLORS: Record<string, string> = {
  anthropic: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',
  google: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
  openai: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400',
}

function ProviderBadge({ provider }: { provider: string }) {
  const colors = PROVIDER_COLORS[provider] ?? 'bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300'
  return (
    <span className={cn('inline-flex items-center px-2 py-0.5 rounded text-xs font-medium', colors)}>
      {provider.charAt(0).toUpperCase() + provider.slice(1)}
    </span>
  )
}

function StatusIcon({ status }: { status: string }) {
  switch (status) {
    case 'success':
      return <CheckCircle className="w-4 h-4 text-green-500" />
    case 'partial':
      return <AlertTriangle className="w-4 h-4 text-yellow-500" />
    case 'failed':
      return <XCircle className="w-4 h-4 text-red-500" />
    default:
      return null
  }
}

function formatTimeAgo(isoString: string): string {
  const diff = Date.now() - new Date(isoString).getTime()
  const minutes = Math.floor(diff / 60000)
  if (minutes < 1) return 'just now'
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  return `${days}d ago`
}

const ModelUpdatePanel = memo(function ModelUpdatePanel() {
  const { backendUrl } = useSettingsStore()
  const [status, setStatus] = useState<UpdateStatus | null>(null)
  const [history, setHistory] = useState<UpdateHistoryEntry[]>([])
  const [checkResults, setCheckResults] = useState<UpdateCheckResult[] | null>(null)
  const [loading, setLoading] = useState(false)
  const [checking, setChecking] = useState(false)
  const [showHistory, setShowHistory] = useState(false)

  const fetchStatus = useCallback(async () => {
    try {
      setLoading(true)
      const res = await fetch(`${backendUrl}/api/llm/models/update-status`)
      if (res.ok) {
        setStatus(await res.json())
      }
    } catch {
      // silently fail
    } finally {
      setLoading(false)
    }
  }, [backendUrl])

  const fetchHistory = useCallback(async () => {
    try {
      const res = await fetch(`${backendUrl}/api/llm/models/update-history?limit=10`)
      if (res.ok) {
        setHistory(await res.json())
      }
    } catch {
      // silently fail
    }
  }, [backendUrl])

  useEffect(() => {
    fetchStatus()
  }, [fetchStatus])

  const handleCheckUpdates = useCallback(async () => {
    try {
      setChecking(true)
      setCheckResults(null)
      const token = useAuthStore.getState().accessToken
      const res = await fetch(`${backendUrl}/api/llm/models/check-updates`, {
        method: 'POST',
        headers: {
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
      })
      if (res.ok) {
        const data = await res.json()
        setCheckResults(data)
        // Refresh status after check
        await fetchStatus()
      } else if (res.status === 403) {
        setCheckResults([{
          provider: 'all',
          status: 'failed',
          models_discovered: 0,
          new_models_found: 0,
          updates_found: 0,
          errors: ['Admin access required'],
        }])
      } else {
        const errText = await res.text()
        setCheckResults([{
          provider: 'all',
          status: 'failed',
          models_discovered: 0,
          new_models_found: 0,
          updates_found: 0,
          errors: [errText || `HTTP ${res.status}`],
        }])
      }
    } catch (err) {
      setCheckResults([{
        provider: 'all',
        status: 'failed',
        models_discovered: 0,
        new_models_found: 0,
        updates_found: 0,
        errors: [err instanceof Error ? err.message : 'Network error'],
      }])
    } finally {
      setChecking(false)
    }
  }, [backendUrl, fetchStatus])

  const handleToggleHistory = useCallback(async () => {
    if (!showHistory) {
      await fetchHistory()
    }
    setShowHistory(prev => !prev)
  }, [showHistory, fetchHistory])

  const totalNew = checkResults?.reduce((sum, r) => sum + r.new_models_found, 0) ?? 0
  const totalUpdates = checkResults?.reduce((sum, r) => sum + r.updates_found, 0) ?? 0

  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4">
      <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-4 flex items-center gap-2">
        <Download className="w-5 h-5" />
        Model Version Updates
      </h3>

      <div className="space-y-4">
        {/* Status Summary */}
        {loading ? (
          <div className="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400">
            <Loader2 className="w-4 h-4 animate-spin" />
            Loading status...
          </div>
        ) : status ? (
          <div className="space-y-2">
            {/* Enabled/Disabled + Interval */}
            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-600 dark:text-gray-400">Auto-check</span>
              <span className="text-sm text-gray-900 dark:text-white">
                {status.enabled
                  ? `Every ${status.check_interval_hours}h`
                  : 'Disabled (DB required)'}
              </span>
            </div>

            {/* Configured Providers */}
            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-600 dark:text-gray-400">Providers</span>
              <div className="flex gap-1">
                {status.configured_providers.length > 0
                  ? status.configured_providers.map(p => (
                      <ProviderBadge key={p} provider={p} />
                    ))
                  : <span className="text-sm text-gray-400">None configured</span>}
              </div>
            </div>

            {/* Last Check */}
            {status.last_check && (
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-600 dark:text-gray-400">Last check</span>
                <div className="flex items-center gap-2">
                  <StatusIcon status={status.last_check.status} />
                  <span className="text-sm text-gray-900 dark:text-white">
                    {formatTimeAgo(status.last_check.checked_at)}
                  </span>
                  {(status.last_check.new_models_found > 0 || status.last_check.updates_found > 0) && (
                    <span className="text-xs px-1.5 py-0.5 bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400 rounded">
                      {status.last_check.new_models_found} new, {status.last_check.updates_found} updated
                    </span>
                  )}
                </div>
              </div>
            )}
          </div>
        ) : (
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Unable to load update status
          </p>
        )}

        {/* Check Now Button */}
        <button
          onClick={handleCheckUpdates}
          disabled={checking}
          className="w-full px-4 py-2 text-sm font-medium bg-primary-600 text-white rounded-lg hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2"
          aria-label="Check for model updates"
        >
          {checking ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              Checking providers...
            </>
          ) : (
            <>
              <RefreshCw className="w-4 h-4" />
              Check for Updates
            </>
          )}
        </button>

        {/* Check Results */}
        {checkResults && (() => {
          const allFailed = checkResults.every(r => r.status === 'failed')
          const anyFailed = checkResults.some(r => r.status === 'failed')
          const allSuccess = checkResults.every(r => r.status === 'success')
          const firstError = checkResults.find(r => r.status === 'failed')?.errors[0]
          const summary = allFailed
            ? (firstError ?? 'Check failed')
            : anyFailed
              ? `Partial: ${totalNew} new, ${totalUpdates} updated (some providers failed)`
              : totalNew > 0 || totalUpdates > 0
                ? `Found ${totalNew} new model${totalNew !== 1 ? 's' : ''}, ${totalUpdates} update${totalUpdates !== 1 ? 's' : ''}`
                : 'All models up to date'
          return (
          <div className="space-y-2 p-3 rounded-lg bg-gray-50 dark:bg-gray-900">
            {/* Summary */}
            <div className="flex items-center gap-2 text-sm">
              {allSuccess ? (
                <CheckCircle className="w-4 h-4 text-green-500" />
              ) : allFailed ? (
                <XCircle className="w-4 h-4 text-red-500" />
              ) : (
                <AlertTriangle className="w-4 h-4 text-yellow-500" />
              )}
              <span className="text-gray-900 dark:text-white font-medium">{summary}</span>
            </div>

            {/* Per-provider details */}
            {checkResults.map(result => (
              <div key={result.provider} className="flex items-center justify-between text-sm">
                <div className="flex items-center gap-2">
                  <StatusIcon status={result.status} />
                  <ProviderBadge provider={result.provider} />
                </div>
                <span className="text-gray-500 dark:text-gray-400">
                  {result.status === 'failed'
                    ? result.errors[0] ?? 'Failed'
                    : `${result.models_discovered} models`}
                </span>
              </div>
            ))}
          </div>
          )
        })()}

        {/* History Toggle */}
        <button
          onClick={handleToggleHistory}
          className="w-full flex items-center justify-between px-3 py-2 text-sm text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700 rounded-lg transition-colors"
          aria-label="Toggle update history"
        >
          <div className="flex items-center gap-2">
            <Clock className="w-4 h-4" />
            Update History
          </div>
          {showHistory ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
        </button>

        {/* History List */}
        {showHistory && (
          <div className="space-y-2 max-h-64 overflow-y-auto">
            {history.length === 0 ? (
              <p className="text-sm text-gray-400 dark:text-gray-500 text-center py-4">
                No update history yet
              </p>
            ) : (
              history.map(entry => (
                <div
                  key={entry.id}
                  className="flex items-center justify-between p-2 rounded-lg bg-gray-50 dark:bg-gray-900 text-sm"
                >
                  <div className="flex items-center gap-2">
                    <StatusIcon status={entry.status} />
                    <ProviderBadge provider={entry.provider} />
                    {entry.is_manual && (
                      <span className="text-xs text-gray-400">(manual)</span>
                    )}
                  </div>
                  <div className="flex items-center gap-3">
                    {(entry.new_models_found > 0 || entry.updates_found > 0) && (
                      <span className="text-xs text-blue-600 dark:text-blue-400">
                        +{entry.new_models_found} new, {entry.updates_found} upd
                      </span>
                    )}
                    <span className="text-xs text-gray-400 dark:text-gray-500">
                      {entry.checked_at ? formatTimeAgo(entry.checked_at) : '—'}
                    </span>
                  </div>
                </div>
              ))
            )}
          </div>
        )}
      </div>
    </div>
  )
})

ModelUpdatePanel.displayName = 'ModelUpdatePanel'

export { ModelUpdatePanel }
