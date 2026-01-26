import { useEffect, useState, useCallback } from 'react'
import { cn } from '../../lib/utils'
import { AlertCircle, AlertTriangle, Info } from 'lucide-react'

export type ContextUsageLevel = 'normal' | 'warning' | 'critical'

export interface ContextUsage {
  current_tokens: number
  max_tokens: number
  percentage: number
  level: ContextUsageLevel
  provider: string
  model: string
  warning_threshold: number
  critical_threshold: number
  system_tokens: number
  message_tokens: number
  task_tokens: number
  rag_tokens: number
}

interface ContextWindowMeterProps {
  sessionId: string | null
  refreshInterval?: number // ms, default 30000 (30s)
  compact?: boolean // Show compact view
  className?: string
}

const levelColors: Record<ContextUsageLevel, string> = {
  normal: 'text-green-500',
  warning: 'text-yellow-500',
  critical: 'text-red-500',
}

const levelBgColors: Record<ContextUsageLevel, string> = {
  normal: 'bg-green-500',
  warning: 'bg-yellow-500',
  critical: 'bg-red-500',
}

const levelIcons: Record<ContextUsageLevel, typeof Info> = {
  normal: Info,
  warning: AlertTriangle,
  critical: AlertCircle,
}

export function ContextWindowMeter({
  sessionId,
  refreshInterval = 30000,
  compact = false,
  className,
}: ContextWindowMeterProps) {
  const [usage, setUsage] = useState<ContextUsage | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [showDetails, setShowDetails] = useState(false)

  const fetchUsage = useCallback(async () => {
    if (!sessionId) {
      setUsage(null)
      return
    }

    setLoading(true)
    setError(null)

    try {
      const res = await fetch(`/api/sessions/${sessionId}/context-usage`)
      if (!res.ok) {
        if (res.status === 404) {
          setUsage(null)
          return
        }
        throw new Error('Failed to fetch context usage')
      }
      const data = await res.json()
      setUsage(data)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unknown error')
    } finally {
      setLoading(false)
    }
  }, [sessionId])

  // Initial fetch and periodic refresh
  useEffect(() => {
    fetchUsage()
    const interval = setInterval(fetchUsage, refreshInterval)
    return () => clearInterval(interval)
  }, [fetchUsage, refreshInterval])

  if (!sessionId) {
    return null
  }

  if (error) {
    return (
      <div className={cn('text-xs text-red-500', className)}>
        Context: Error
      </div>
    )
  }

  if (!usage) {
    return (
      <div className={cn('text-xs text-gray-400', className)}>
        {loading ? 'Loading...' : 'No data'}
      </div>
    )
  }

  const Icon = levelIcons[usage.level]
  const percentage = Math.min(usage.percentage, 100)

  // Compact view - just percentage and color indicator
  if (compact) {
    return (
      <div
        className={cn(
          'flex items-center gap-1.5 cursor-pointer',
          className
        )}
        onClick={() => setShowDetails(!showDetails)}
        title={`Context: ${usage.current_tokens.toLocaleString()} / ${usage.max_tokens.toLocaleString()} tokens (${percentage.toFixed(1)}%)`}
      >
        <div className="relative w-8 h-8">
          <svg className="w-8 h-8 transform -rotate-90" viewBox="0 0 32 32">
            {/* Background circle */}
            <circle
              cx="16"
              cy="16"
              r="12"
              fill="none"
              stroke="currentColor"
              strokeWidth="4"
              className="text-gray-200 dark:text-gray-700"
            />
            {/* Progress circle */}
            <circle
              cx="16"
              cy="16"
              r="12"
              fill="none"
              stroke="currentColor"
              strokeWidth="4"
              strokeDasharray={`${(percentage / 100) * 75.4} 75.4`}
              strokeLinecap="round"
              className={levelBgColors[usage.level]}
            />
          </svg>
          <span className={cn('absolute inset-0 flex items-center justify-center text-[10px] font-medium', levelColors[usage.level])}>
            {Math.round(percentage)}%
          </span>
        </div>
      </div>
    )
  }

  // Full view
  return (
    <div className={cn('space-y-2', className)}>
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Icon className={cn('w-4 h-4', levelColors[usage.level])} />
          <span className="text-sm font-medium text-gray-900 dark:text-white">
            Context Window
          </span>
        </div>
        <span className={cn('text-sm font-medium', levelColors[usage.level])}>
          {percentage.toFixed(1)}%
        </span>
      </div>

      {/* Progress bar */}
      <div className="h-2 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
        <div
          className={cn('h-full transition-all duration-300', levelBgColors[usage.level])}
          style={{ width: `${percentage}%` }}
        />
      </div>

      {/* Stats */}
      <div className="flex justify-between text-xs text-gray-500 dark:text-gray-400">
        <span>{usage.current_tokens.toLocaleString()} tokens</span>
        <span>{usage.max_tokens.toLocaleString()} max</span>
      </div>

      {/* Provider info */}
      <div className="text-xs text-gray-400 dark:text-gray-500">
        {usage.provider} / {usage.model}
      </div>

      {/* Breakdown toggle */}
      <button
        onClick={() => setShowDetails(!showDetails)}
        className="text-xs text-blue-500 hover:text-blue-600 dark:text-blue-400"
      >
        {showDetails ? 'Hide breakdown' : 'Show breakdown'}
      </button>

      {/* Detailed breakdown */}
      {showDetails && (
        <div className="space-y-1 pt-2 border-t border-gray-200 dark:border-gray-700">
          <BreakdownRow
            label="System"
            tokens={usage.system_tokens}
            total={usage.current_tokens}
          />
          <BreakdownRow
            label="Messages"
            tokens={usage.message_tokens}
            total={usage.current_tokens}
          />
          <BreakdownRow
            label="Tasks"
            tokens={usage.task_tokens}
            total={usage.current_tokens}
          />
          <BreakdownRow
            label="RAG"
            tokens={usage.rag_tokens}
            total={usage.current_tokens}
          />
        </div>
      )}

      {/* Warning message */}
      {usage.level !== 'normal' && (
        <div className={cn(
          'text-xs p-2 rounded',
          usage.level === 'warning' && 'bg-yellow-50 text-yellow-700 dark:bg-yellow-900/20 dark:text-yellow-400',
          usage.level === 'critical' && 'bg-red-50 text-red-700 dark:bg-red-900/20 dark:text-red-400'
        )}>
          {usage.level === 'warning' && 'Context usage is getting high. Consider completing the current task.'}
          {usage.level === 'critical' && 'Context limit approaching! Complete or start a new session.'}
        </div>
      )}
    </div>
  )
}

interface BreakdownRowProps {
  label: string
  tokens: number
  total: number
}

function BreakdownRow({ label, tokens, total }: BreakdownRowProps) {
  const percentage = total > 0 ? (tokens / total) * 100 : 0

  return (
    <div className="flex items-center gap-2 text-xs">
      <span className="w-16 text-gray-500 dark:text-gray-400">{label}</span>
      <div className="flex-1 h-1.5 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
        <div
          className="h-full bg-blue-500"
          style={{ width: `${percentage}%` }}
        />
      </div>
      <span className="w-16 text-right text-gray-600 dark:text-gray-300">
        {tokens.toLocaleString()}
      </span>
    </div>
  )
}

export default ContextWindowMeter
