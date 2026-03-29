import { memo, useState, useCallback, useEffect } from 'react'
import {
  Server,
  RefreshCw,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  ChevronDown,
  ChevronRight,
  ExternalLink,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { useInfraStatusStore, ServiceStatus } from '@/stores/infraStatus'

// ─────────────────────────────────────────────────────────────
// Status helpers
// ─────────────────────────────────────────────────────────────

function statusIcon(status: ServiceStatus['status']) {
  switch (status) {
    case 'running':
      return <CheckCircle2 className="w-4 h-4 text-green-500" />
    case 'stopped':
      return <XCircle className="w-4 h-4 text-gray-400" />
    case 'conflict':
      return <AlertTriangle className="w-4 h-4 text-amber-500" />
  }
}

function statusDotColor(status: ServiceStatus['status']) {
  switch (status) {
    case 'running':
      return 'bg-green-500'
    case 'stopped':
      return 'bg-gray-400'
    case 'conflict':
      return 'bg-amber-500'
  }
}

function isClickableUrl(service: ServiceStatus) {
  return service.status === 'running' && service.url.startsWith('http')
}

// ─────────────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────────────

interface ServiceStatusBarProps {
  /** Project path to scan for docker-compose. null = default AOS services. */
  projectPath?: string | null
  /** Project name for display */
  projectName?: string | null
}

export const ServiceStatusBar: React.FC<ServiceStatusBarProps> = memo(({
  projectPath,
  projectName,
}) => {
  const { services, hasConflicts, isLoading, error, fetchStatus, currentProjectPath } =
    useInfraStatusStore()
  const [isExpanded, setIsExpanded] = useState(false)

  // Re-fetch when project changes
  useEffect(() => {
    const newPath = projectPath ?? null
    if (newPath !== currentProjectPath) {
      fetchStatus(newPath)
    }
  }, [projectPath, currentProjectPath, fetchStatus])

  const handleRefresh = useCallback(() => {
    fetchStatus(projectPath ?? null)
  }, [fetchStatus, projectPath])

  const runningCount = services.filter((s) => s.status === 'running').length
  const totalCount = services.length

  // Not loaded yet
  if (totalCount === 0 && !isLoading && !error) {
    return null
  }

  const summaryColor = hasConflicts
    ? 'text-amber-600 dark:text-amber-400'
    : runningCount === totalCount
      ? 'text-green-600 dark:text-green-400'
      : 'text-gray-500 dark:text-gray-400'

  const summaryDot = hasConflicts
    ? 'bg-amber-500'
    : runningCount === totalCount
      ? 'bg-green-500'
      : 'bg-gray-400'

  const label = projectName ? `${projectName} Services` : 'Infrastructure'

  return (
    <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg">
      {/* Collapsed header */}
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full flex items-center justify-between px-4 py-2.5 text-sm hover:bg-gray-50 dark:hover:bg-gray-700 rounded-lg transition-colors"
      >
        <div className="flex items-center gap-2.5">
          <Server className="w-4 h-4 text-gray-500 dark:text-gray-400" />
          <span className="font-medium text-gray-700 dark:text-gray-300">{label}</span>
          {!isLoading && (
            <>
              <span className={cn('w-2 h-2 rounded-full', summaryDot)} />
              <span className={cn('text-xs font-medium', summaryColor)}>
                {runningCount}/{totalCount} running
              </span>
            </>
          )}
          {isLoading && <span className="text-xs text-gray-400">Loading...</span>}
          {error && !isLoading && <span className="text-xs text-red-500">Error</span>}
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={(e) => {
              e.stopPropagation()
              handleRefresh()
            }}
            disabled={isLoading}
            className="p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 disabled:opacity-50 rounded transition-colors"
            title="Refresh status"
          >
            <RefreshCw className={cn('w-3.5 h-3.5', isLoading && 'animate-spin')} />
          </button>
          {isExpanded ? (
            <ChevronDown className="w-4 h-4 text-gray-400" />
          ) : (
            <ChevronRight className="w-4 h-4 text-gray-400" />
          )}
        </div>
      </button>

      {/* Expanded grid */}
      {isExpanded && (
        <div className="px-4 pb-3 pt-1">
          {error && (
            <div className="mb-3 text-xs text-red-500 dark:text-red-400">{error}</div>
          )}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2">
            {services.map((service) => (
              <div
                key={`${service.name}-${service.port}`}
                className={cn(
                  'flex flex-col gap-1 p-2.5 rounded-lg border text-xs',
                  service.status === 'running'
                    ? 'border-green-200 bg-green-50 dark:border-green-900/50 dark:bg-green-900/20'
                    : service.status === 'conflict'
                      ? 'border-amber-200 bg-amber-50 dark:border-amber-900/50 dark:bg-amber-900/20'
                      : 'border-gray-200 bg-gray-50 dark:border-gray-700 dark:bg-gray-800',
                )}
              >
                <div className="flex items-center justify-between">
                  <span className="font-medium text-gray-900 dark:text-white truncate">
                    {service.name}
                  </span>
                  {statusIcon(service.status)}
                </div>
                <div className="flex items-center gap-1">
                  <span
                    className={cn(
                      'w-1.5 h-1.5 rounded-full flex-shrink-0',
                      statusDotColor(service.status),
                    )}
                  />
                  {isClickableUrl(service) ? (
                    <a
                      href={service.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={(e) => e.stopPropagation()}
                      className="text-primary-600 dark:text-primary-400 hover:underline truncate flex items-center gap-0.5"
                    >
                      :{service.port}
                      <ExternalLink className="w-2.5 h-2.5 flex-shrink-0" />
                    </a>
                  ) : (
                    <span className="text-gray-500 dark:text-gray-400 truncate">
                      :{service.port}
                    </span>
                  )}
                </div>
                {service.status === 'conflict' && service.process_name && (
                  <div
                    className="text-amber-600 dark:text-amber-400 truncate"
                    title={`PID: ${service.pid}`}
                  >
                    {service.process_name} (PID: {service.pid})
                  </div>
                )}
                {service.status === 'running' && service.process_name && (
                  <div
                    className="text-gray-400 dark:text-gray-500 truncate"
                    title={`PID: ${service.pid}`}
                  >
                    {service.process_name}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
})

ServiceStatusBar.displayName = 'ServiceStatusBar'
