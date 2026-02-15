import { useState, useEffect, useCallback } from 'react'
import { AlertCircle, AlertTriangle, Info, ChevronDown, ChevronUp, X } from 'lucide-react'
import { cn } from '../../lib/utils'
import { classifyGitError, type GitErrorSeverity } from '../../utils/gitErrorMessages'

interface GitAlertProps {
  error: string
  onClose: () => void
  className?: string
}

const SEVERITY_STYLES: Record<
  GitErrorSeverity,
  { container: string; icon: string; title: string; close: string }
> = {
  error: {
    container: 'bg-red-50 border-red-200 dark:bg-red-900/20 dark:border-red-800',
    icon: 'text-red-500 dark:text-red-400',
    title: 'text-red-800 dark:text-red-300',
    close: 'text-red-400 hover:text-red-600 dark:hover:text-red-300',
  },
  warning: {
    container: 'bg-amber-50 border-amber-200 dark:bg-amber-900/20 dark:border-amber-800',
    icon: 'text-amber-500 dark:text-amber-400',
    title: 'text-amber-800 dark:text-amber-300',
    close: 'text-amber-400 hover:text-amber-600 dark:hover:text-amber-300',
  },
  info: {
    container: 'bg-blue-50 border-blue-200 dark:bg-blue-900/20 dark:border-blue-800',
    icon: 'text-blue-500 dark:text-blue-400',
    title: 'text-blue-800 dark:text-blue-300',
    close: 'text-blue-400 hover:text-blue-600 dark:hover:text-blue-300',
  },
}

const SEVERITY_ICONS: Record<GitErrorSeverity, typeof AlertCircle> = {
  error: AlertCircle,
  warning: AlertTriangle,
  info: Info,
}

/** Auto-dismiss 타이머 (ms). error는 수동 닫기만 가능. */
const AUTO_DISMISS_MS: Record<GitErrorSeverity, number | null> = {
  error: null,
  warning: 8000,
  info: 5000,
}

export function GitAlert({ error, onClose, className }: GitAlertProps) {
  const [showSolution, setShowSolution] = useState(false)
  const errorInfo = classifyGitError(error)
  const styles = SEVERITY_STYLES[errorInfo.severity]
  const Icon = SEVERITY_ICONS[errorInfo.severity]

  const handleClose = useCallback(() => {
    onClose()
  }, [onClose])

  // Auto-dismiss timer
  useEffect(() => {
    const timeout = AUTO_DISMISS_MS[errorInfo.severity]
    if (!timeout) return

    const timer = setTimeout(handleClose, timeout)
    return () => clearTimeout(timer)
  }, [errorInfo.severity, handleClose])

  return (
    <div
      className={cn('border rounded-lg p-4', styles.container, className)}
      role="alert"
    >
      <div className="flex items-start gap-3">
        <Icon className={cn('w-5 h-5 flex-shrink-0 mt-0.5', styles.icon)} />

        <div className="flex-1 min-w-0">
          {/* Title */}
          <p className={cn('text-sm font-semibold', styles.title)}>
            {errorInfo.title}
          </p>

          {/* Description */}
          <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
            {errorInfo.description}
          </p>

          {/* Solution (collapsible) */}
          <button
            onClick={() => setShowSolution((v) => !v)}
            className="mt-2 flex items-center gap-1 text-xs font-medium text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 transition-colors"
          >
            {showSolution ? (
              <ChevronUp className="w-3.5 h-3.5" />
            ) : (
              <ChevronDown className="w-3.5 h-3.5" />
            )}
            해결 방법
          </button>

          {showSolution && (
            <p className="mt-1.5 text-sm text-gray-600 dark:text-gray-400 pl-5 border-l-2 border-gray-200 dark:border-gray-600">
              {errorInfo.solution}
            </p>
          )}

          {/* Raw error for unknown category */}
          {errorInfo.category === 'unknown' && (
            <details className="mt-2">
              <summary className="text-xs text-gray-400 dark:text-gray-500 cursor-pointer hover:text-gray-600 dark:hover:text-gray-400">
                원본 에러 메시지
              </summary>
              <pre className="mt-1 text-xs text-gray-500 dark:text-gray-500 whitespace-pre-wrap break-all bg-gray-100 dark:bg-gray-800 rounded p-2">
                {errorInfo.rawError}
              </pre>
            </details>
          )}
        </div>

        {/* Close button */}
        <button
          onClick={handleClose}
          className={cn('flex-shrink-0 p-0.5 rounded transition-colors', styles.close)}
          aria-label="닫기"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
    </div>
  )
}
