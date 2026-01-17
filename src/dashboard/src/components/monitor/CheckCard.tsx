import { cn } from '../../lib/utils'
import {
  CheckCircle2,
  XCircle,
  Loader2,
  Clock,
  Play,
} from 'lucide-react'
import { CheckType, CheckStatus, CHECK_TYPE_LABELS } from '../../types/monitoring'

interface CheckCardProps {
  checkType: CheckType
  status: CheckStatus
  exitCode: number | null
  durationMs: number | null
  isRunning: boolean
  onRun: () => void
  onClick: () => void
  isSelected: boolean
}

export function CheckCard({
  checkType,
  status,
  exitCode,
  durationMs,
  isRunning,
  onRun,
  onClick,
  isSelected,
}: CheckCardProps) {
  const getStatusIcon = () => {
    if (isRunning) {
      return <Loader2 className="w-5 h-5 text-blue-500 animate-spin" />
    }
    switch (status) {
      case 'success':
        return <CheckCircle2 className="w-5 h-5 text-green-500" />
      case 'failure':
        return <XCircle className="w-5 h-5 text-red-500" />
      case 'idle':
      default:
        return <Clock className="w-5 h-5 text-gray-400" />
    }
  }

  const getStatusText = () => {
    if (isRunning) return 'Running...'
    switch (status) {
      case 'success':
        return 'Pass'
      case 'failure':
        return `Failed (${exitCode})`
      case 'idle':
      default:
        return 'Not run'
    }
  }

  const getStatusColor = () => {
    if (isRunning) return 'bg-blue-50 border-blue-200 dark:bg-blue-900/20 dark:border-blue-800'
    switch (status) {
      case 'success':
        return 'bg-green-50 border-green-200 dark:bg-green-900/20 dark:border-green-800'
      case 'failure':
        return 'bg-red-50 border-red-200 dark:bg-red-900/20 dark:border-red-800'
      case 'idle':
      default:
        return 'bg-gray-50 border-gray-200 dark:bg-gray-800/50 dark:border-gray-700'
    }
  }

  const formatDuration = (ms: number | null) => {
    if (ms === null) return '-'
    if (ms < 1000) return `${ms}ms`
    return `${(ms / 1000).toFixed(1)}s`
  }

  return (
    <div
      className={cn(
        'relative rounded-lg border-2 p-4 transition-all cursor-pointer',
        getStatusColor(),
        isSelected && 'ring-2 ring-primary-500 ring-offset-2'
      )}
      onClick={onClick}
    >
      {/* Header */}
      <div className="flex items-center justify-between mb-2">
        <h3 className="font-semibold text-gray-900 dark:text-white">
          {CHECK_TYPE_LABELS[checkType]}
        </h3>
        {getStatusIcon()}
      </div>

      {/* Status */}
      <p className="text-sm text-gray-600 dark:text-gray-400 mb-2">
        {getStatusText()}
      </p>

      {/* Duration */}
      {durationMs !== null && (
        <p className="text-xs text-gray-500 dark:text-gray-500">
          {formatDuration(durationMs)}
        </p>
      )}

      {/* Run button */}
      <button
        onClick={(e) => {
          e.stopPropagation()
          onRun()
        }}
        disabled={isRunning}
        className={cn(
          'absolute bottom-2 right-2 p-1.5 rounded-full transition-colors',
          isRunning
            ? 'bg-gray-200 dark:bg-gray-700 cursor-not-allowed'
            : 'bg-primary-100 hover:bg-primary-200 dark:bg-primary-900/30 dark:hover:bg-primary-900/50'
        )}
        title={`Run ${CHECK_TYPE_LABELS[checkType]}`}
      >
        <Play
          className={cn(
            'w-4 h-4',
            isRunning ? 'text-gray-400' : 'text-primary-600 dark:text-primary-400'
          )}
        />
      </button>
    </div>
  )
}
