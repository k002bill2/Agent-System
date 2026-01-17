import { useEffect, useCallback } from 'react'
import { BarChart3, RefreshCw, AlertCircle, CheckCircle2, XCircle } from 'lucide-react'
import { useClaudeUsageStore } from '../../stores/claudeUsage'
import { UsageProgressBar } from './UsageProgressBar'

const REFRESH_INTERVAL = 5 * 60 * 1000 // 5 minutes

export function ClaudeUsageDashboard() {
  const { usage, isLoading, error, lastFetched, fetchUsage, clearError } = useClaudeUsageStore()

  // Fetch on mount and set up auto-refresh
  useEffect(() => {
    fetchUsage()

    const interval = setInterval(() => {
      fetchUsage()
    }, REFRESH_INTERVAL)

    return () => clearInterval(interval)
  }, [fetchUsage])

  const handleRefresh = useCallback(() => {
    clearError()
    fetchUsage()
  }, [fetchUsage, clearError])

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
      <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white flex items-center gap-2">
            <BarChart3 className="w-5 h-5" />
            Claude Code Usage
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
      <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white flex items-center gap-2">
            <BarChart3 className="w-5 h-5" />
            Claude Code Usage
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
      <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white flex items-center gap-2">
            <BarChart3 className="w-5 h-5" />
            Claude Code Usage
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

  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white flex items-center gap-2">
          <BarChart3 className="w-5 h-5" />
          Plan Usage Limits
        </h3>
        <div className="flex items-center gap-2">
          {/* OAuth Status Indicator */}
          {usage.oauthAvailable ? (
            <span className="flex items-center gap-1 text-xs text-green-600 dark:text-green-400" title="Real-time data from Anthropic API">
              <CheckCircle2 className="w-3 h-3" />
              Live
            </span>
          ) : (
            <span className="flex items-center gap-1 text-xs text-yellow-600 dark:text-yellow-400" title={usage.oauthError || 'OAuth not available'}>
              <XCircle className="w-3 h-3" />
              Offline
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

      <div className="space-y-4">
        {/* OAuth Available - Show real plan limits */}
        {usage.oauthAvailable && usage.planLimits.length > 0 ? (
          <>
            {/* Current Session (5-hour limit) */}
            {sessionLimit && (
              <div className="pb-3 border-b border-gray-100 dark:border-gray-700">
                <UsageProgressBar
                  label={sessionLimit.displayName}
                  percentUsed={sessionLimit.utilization}
                  resetInHours={sessionLimit.resetsInHours ?? 0}
                  resetInMinutes={sessionLimit.resetsInMinutes ?? 0}
                />
              </div>
            )}

            {/* Weekly Limits */}
            <div>
              <h4 className="text-sm font-medium text-gray-600 dark:text-gray-400 mb-3">
                Weekly Limits
              </h4>

              <div className="space-y-3">
                {/* All Models (7-day limit) */}
                {allModelsLimit && (
                  <UsageProgressBar
                    label={allModelsLimit.displayName}
                    percentUsed={allModelsLimit.utilization}
                    resetInHours={allModelsLimit.resetsInHours ?? 0}
                    resetInMinutes={allModelsLimit.resetsInMinutes ?? 0}
                  />
                )}

                {/* Sonnet Only (7-day Sonnet limit) */}
                {sonnetLimit && (
                  <UsageProgressBar
                    label={sonnetLimit.displayName}
                    percentUsed={sonnetLimit.utilization}
                    resetInHours={sonnetLimit.resetsInHours ?? 0}
                    resetInMinutes={sonnetLimit.resetsInMinutes ?? 0}
                    showInfo
                    tooltip="Separate limit for Sonnet model usage"
                  />
                )}

                {/* Opus Only (7-day Opus limit) */}
                {opusLimit && (
                  <UsageProgressBar
                    label={opusLimit.displayName}
                    percentUsed={opusLimit.utilization}
                    resetInHours={opusLimit.resetsInHours ?? 0}
                    resetInMinutes={opusLimit.resetsInMinutes ?? 0}
                    showInfo
                    tooltip="Separate limit for Opus model usage"
                  />
                )}
              </div>
            </div>
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
            <p>Showing local token statistics only.</p>
          </div>
        )}

        {/* Weekly Summary (always shown) */}
        <div className="pt-3 border-t border-gray-100 dark:border-gray-700">
          <h4 className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-2">
            Weekly Token Usage (Local)
          </h4>
          <div className="grid grid-cols-3 gap-2 text-center">
            <div>
              <p className="text-lg font-semibold text-gray-900 dark:text-white">
                {formatTokenCount(usage.weeklyTotalTokens)}
              </p>
              <p className="text-xs text-gray-500 dark:text-gray-400">Total</p>
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
