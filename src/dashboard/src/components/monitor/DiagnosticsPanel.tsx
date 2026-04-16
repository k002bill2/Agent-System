import { memo, useEffect, useState } from 'react'
import {
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Wrench,
  Loader2,
  RefreshCw,
  ChevronDown,
  ChevronRight,
  Stethoscope,
} from 'lucide-react'
import { cn } from '../../lib/utils'
import { useDiagnosticsStore } from '../../stores/diagnostics'
import type { DiagnosticStatus, DiagnosticCheck, CategoryResult } from '../../types/diagnostics'

/** Props for DiagnosticsPanel */
interface DiagnosticsPanelProps {
  /** Project ID to diagnose */
  projectId: string
}

const CATEGORY_LABELS: Record<string, string> = {
  workspace: 'Workspace',
  mcp: 'MCP',
  git: 'Git',
  quota: 'Quota',
}

function StatusIcon({ status, className }: { status: DiagnosticStatus; className?: string }) {
  switch (status) {
    case 'healthy':
      return <CheckCircle2 className={cn('w-4 h-4 text-green-500', className)} />
    case 'degraded':
      return <AlertTriangle className={cn('w-4 h-4 text-amber-500', className)} />
    case 'unhealthy':
      return <XCircle className={cn('w-4 h-4 text-red-500', className)} />
  }
}

function StatusBadge({ status, label }: { status: DiagnosticStatus; label: string }) {
  const colors = {
    healthy: 'bg-green-50 text-green-700 border-green-200 dark:bg-green-900/20 dark:text-green-400 dark:border-green-800',
    degraded: 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-900/20 dark:text-amber-400 dark:border-amber-800',
    unhealthy: 'bg-red-50 text-red-700 border-red-200 dark:bg-red-900/20 dark:text-red-400 dark:border-red-800',
  }

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium border',
        colors[status]
      )}
    >
      <StatusIcon status={status} className="w-3 h-3" />
      {label}
    </span>
  )
}

function CheckItem({
  check,
  fixingAction,
  onFix,
}: {
  check: DiagnosticCheck
  fixingAction: string | null
  onFix: (fixAction: string) => void
}) {
  const isFixing = fixingAction === check.fix_action

  return (
    <div className="flex items-center gap-2 py-1.5 px-2 rounded-md hover:bg-gray-50 dark:hover:bg-gray-700/50">
      <StatusIcon status={check.status} />
      <span className="flex-1 text-xs text-gray-700 dark:text-gray-300 truncate">
        {check.message}
      </span>
      {check.fixable && check.fix_action && (
        <button
          onClick={() => onFix(check.fix_action!)}
          disabled={isFixing}
          className={cn(
            'inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium transition-colors',
            'bg-primary-50 text-primary-700 hover:bg-primary-100',
            'dark:bg-primary-900/30 dark:text-primary-400 dark:hover:bg-primary-900/50',
            isFixing && 'opacity-50 cursor-not-allowed'
          )}
          aria-label={`Fix: ${check.message}`}
        >
          {isFixing ? (
            <Loader2 className="w-3 h-3 animate-spin" />
          ) : (
            <Wrench className="w-3 h-3" />
          )}
          Fix
        </button>
      )}
    </div>
  )
}

function CategorySection({
  result,
  fixingAction,
  onFix,
}: {
  result: CategoryResult
  fixingAction: string | null
  onFix: (fixAction: string) => void
}) {
  const hasIssues = result.checks.some((c) => c.status !== 'healthy')
  const [expanded, setExpanded] = useState(hasIssues)

  const label = CATEGORY_LABELS[result.category] ?? result.category

  return (
    <div>
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex items-center gap-2 w-full text-left py-1 hover:bg-gray-50 dark:hover:bg-gray-700/50 rounded px-1"
        aria-label={`Toggle ${label} details`}
      >
        {expanded ? (
          <ChevronDown className="w-3.5 h-3.5 text-gray-400" />
        ) : (
          <ChevronRight className="w-3.5 h-3.5 text-gray-400" />
        )}
        <StatusIcon status={result.status} />
        <span className="text-xs font-medium text-gray-900 dark:text-white">
          {label}
        </span>
        <span className="text-xs text-gray-400">
          ({result.checks.filter((c) => c.status === 'healthy').length}/{result.checks.length})
        </span>
      </button>

      {expanded && (
        <div className="ml-5 mt-0.5 space-y-0.5">
          {result.checks.map((check) => (
            <CheckItem
              key={check.name}
              check={check}
              fixingAction={fixingAction}
              onFix={onFix}
            />
          ))}
        </div>
      )}
    </div>
  )
}

export const DiagnosticsPanel = memo(function DiagnosticsPanel({
  projectId,
}: DiagnosticsPanelProps) {
  const {
    getDiagnostics,
    fetchDiagnostics,
    executeFix,
    isLoading,
    fixingAction,
    error,
    clearError,
  } = useDiagnosticsStore()

  const diagnostics = getDiagnostics(projectId)

  useEffect(() => {
    fetchDiagnostics(projectId)
  }, [projectId, fetchDiagnostics])

  const handleFix = (fixAction: string) => {
    executeFix(projectId, fixAction)
  }

  const categories = diagnostics
    ? Object.values(diagnostics.categories)
    : []

  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-3">
      {/* Header */}
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <Stethoscope className="w-4 h-4 text-gray-500" />
          <h2 className="text-sm font-semibold text-gray-900 dark:text-white">
            Environment Diagnostics
          </h2>
          {diagnostics && (
            <StatusBadge
              status={diagnostics.overall_status}
              label={diagnostics.overall_status}
            />
          )}
        </div>
        <button
          onClick={() => fetchDiagnostics(projectId)}
          disabled={isLoading}
          className={cn(
            'p-1 rounded-md transition-colors',
            'text-gray-400 hover:text-gray-600 hover:bg-gray-100',
            'dark:hover:text-gray-300 dark:hover:bg-gray-700',
            isLoading && 'animate-spin'
          )}
          aria-label="Refresh diagnostics"
        >
          <RefreshCw className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Error */}
      {error && (
        <div className="mb-2 px-2 py-1.5 bg-red-50 dark:bg-red-900/20 rounded text-xs text-red-600 dark:text-red-400 flex items-center justify-between">
          <span>{error}</span>
          <button onClick={clearError} className="text-red-400 hover:text-red-600 ml-2">
            Dismiss
          </button>
        </div>
      )}

      {/* Loading */}
      {isLoading && !diagnostics && (
        <div className="flex items-center justify-center py-4">
          <Loader2 className="w-5 h-5 text-primary-500 animate-spin" />
        </div>
      )}

      {/* Category badges bar */}
      {diagnostics && (
        <div className="flex items-center gap-1.5 mb-2 flex-wrap">
          {categories.map((cat) => (
            <StatusBadge
              key={cat.category}
              status={cat.status}
              label={CATEGORY_LABELS[cat.category] ?? cat.category}
            />
          ))}
        </div>
      )}

      {/* Category details */}
      {diagnostics && (
        <div className="space-y-1">
          {categories.map((cat) => (
            <CategorySection
              key={cat.category}
              result={cat}
              fixingAction={fixingAction}
              onFix={handleFix}
            />
          ))}
        </div>
      )}
    </div>
  )
})

DiagnosticsPanel.displayName = 'DiagnosticsPanel'
