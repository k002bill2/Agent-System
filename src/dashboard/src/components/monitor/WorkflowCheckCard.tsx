import { cn } from '../../lib/utils'
import {
  CheckCircle2,
  XCircle,
  Loader2,
  Clock,
  Play,
  Workflow,
} from 'lucide-react'
import { WorkflowCheck } from '../../types/monitoring'

interface WorkflowCheckCardProps {
  workflow: WorkflowCheck
  isRunning: boolean
  onRun: () => void
  onClick: () => void
  isSelected: boolean
}

export function WorkflowCheckCard({
  workflow,
  isRunning,
  onRun,
  onClick,
  isSelected,
}: WorkflowCheckCardProps) {
  const getStatusIcon = () => {
    if (isRunning) {
      return <Loader2 className="w-4 h-4 text-blue-500 animate-spin flex-shrink-0" />
    }
    switch (workflow.status) {
      case 'success':
        return <CheckCircle2 className="w-4 h-4 text-green-500 flex-shrink-0" />
      case 'failure':
        return <XCircle className="w-4 h-4 text-red-500 flex-shrink-0" />
      case 'idle':
      default:
        return <Clock className="w-4 h-4 text-gray-400 flex-shrink-0" />
    }
  }

  const getStatusText = () => {
    if (isRunning) return 'Running...'
    switch (workflow.status) {
      case 'success':
        return 'Completed'
      case 'failure':
        return 'Failed'
      case 'idle':
      default:
        return 'Not run'
    }
  }

  const getBorderColor = () => {
    if (isRunning) return 'border-blue-300 dark:border-blue-700'
    switch (workflow.status) {
      case 'success':
        return 'border-green-300 dark:border-green-700'
      case 'failure':
        return 'border-red-300 dark:border-red-700'
      case 'idle':
      default:
        return 'border-gray-200 dark:border-gray-700'
    }
  }

  const formatDuration = (seconds: number | null) => {
    if (seconds === null) return null
    if (seconds < 1) return `${Math.round(seconds * 1000)}ms`
    return `${seconds.toFixed(1)}s`
  }

  const duration = formatDuration(workflow.lastRunDuration)

  return (
    <div
      className={cn(
        'flex items-center gap-2.5 rounded-lg border px-3 py-2 transition-all cursor-pointer',
        'hover:bg-gray-50 dark:hover:bg-gray-700',
        getBorderColor(),
        isSelected && 'ring-2 ring-primary-500 ring-offset-1 dark:ring-offset-gray-800'
      )}
      onClick={onClick}
    >
      {getStatusIcon()}

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <Workflow className="w-3.5 h-3.5 text-gray-400 dark:text-gray-500 flex-shrink-0" />
          <span
            className="text-sm font-medium text-gray-900 dark:text-white truncate"
            title={workflow.name}
          >
            {workflow.name}
          </span>
          <span className="text-xs text-gray-400 dark:text-gray-500">
            {getStatusText()}
          </span>
          {duration && (
            <span className="text-xs text-gray-400 dark:text-gray-500">
              {duration}
            </span>
          )}
        </div>
      </div>

      <button
        onClick={(e) => {
          e.stopPropagation()
          onRun()
        }}
        disabled={isRunning}
        className={cn(
          'p-1 rounded-md transition-colors flex-shrink-0',
          isRunning
            ? 'text-gray-300 dark:text-gray-600 cursor-not-allowed'
            : 'text-primary-500 hover:bg-primary-50 dark:hover:bg-gray-600'
        )}
        title={`Run ${workflow.name}`}
      >
        <Play className="w-3.5 h-3.5" />
      </button>
    </div>
  )
}
