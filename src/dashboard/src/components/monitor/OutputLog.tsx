import { useEffect, useRef } from 'react'
import { cn } from '../../lib/utils'
import { Terminal, Trash2 } from 'lucide-react'
import { ALL_CHECK_TYPES, CheckType } from '../../types/monitoring'
import { useMonitoringStore } from '../../stores/monitoring'

interface OutputLogProps {
  projectId: string
}

/** Get label for a check type, using dynamic config or defaults */
function useCheckLabels(projectId: string): Record<CheckType, string> {
  const { getCheckLabel } = useMonitoringStore()
  return {
    test: getCheckLabel(projectId, 'test'),
    lint: getCheckLabel(projectId, 'lint'),
    typecheck: getCheckLabel(projectId, 'typecheck'),
    build: getCheckLabel(projectId, 'build'),
  }
}

/** Check if view is a standard CheckType */
function isCheckType(view: string): view is CheckType {
  return ALL_CHECK_TYPES.includes(view as CheckType)
}

export function OutputLog({ projectId }: OutputLogProps) {
  const {
    checkLogs,
    activeLogView,
    setActiveLogView,
    clearLogs,
    workflowChecks,
    workflowLogs,
    clearWorkflowLogs,
  } = useMonitoringStore()
  const checkLabels = useCheckLabels(projectId)
  const logContainerRef = useRef<HTMLDivElement>(null)

  // Check if current view is a workflow ID
  const isWorkflowView = activeLogView !== 'all' && !isCheckType(activeLogView)

  // Get logs based on active view, filtered by current project
  const getDisplayLogs = () => {
    if (activeLogView === 'all') {
      // Combine all check logs + workflow logs, sorted by timestamp
      const allCheckLogs = ALL_CHECK_TYPES.flatMap((ct) =>
        checkLogs[ct]
          .filter((log) => log.projectId === projectId)
          .map((log) => ({ ...log, label: checkLabels[ct] }))
      )
      const allWfLogs = Object.entries(workflowLogs).flatMap(([wfId, logs]) => {
        const wf = workflowChecks.find((w) => w.id === wfId)
        return logs.map((log) => ({ ...log, label: wf?.name || wfId }))
      })
      return [...allCheckLogs, ...allWfLogs].sort(
        (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
      )
    }

    if (isWorkflowView) {
      // Workflow logs
      return (workflowLogs[activeLogView] || []).map((log) => {
        const wf = workflowChecks.find((w) => w.id === activeLogView)
        return { ...log, label: wf?.name || activeLogView }
      })
    }

    // Standard check type logs
    return checkLogs[activeLogView as CheckType]
      .filter((log) => log.projectId === projectId)
      .map((log) => ({ ...log, label: checkLabels[activeLogView as CheckType] }))
  }

  const displayLogs = getDisplayLogs()

  // Auto-scroll to bottom when new logs appear
  useEffect(() => {
    if (logContainerRef.current) {
      logContainerRef.current.scrollTop = logContainerRef.current.scrollHeight
    }
  }, [displayLogs.length])

  const handleClear = () => {
    if (activeLogView === 'all') {
      clearLogs()
      clearWorkflowLogs()
    } else if (isWorkflowView) {
      clearWorkflowLogs(activeLogView)
    } else {
      clearLogs(activeLogView as CheckType)
    }
  }

  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 flex flex-col h-full min-h-[300px]">
      {/* Header */}
      <div className="border-b border-gray-200 dark:border-gray-700">
        {/* Title + Clear button row */}
        <div className="flex items-center justify-between px-4 pt-2 pb-1">
          <div className="flex items-center gap-2">
            <Terminal className="w-5 h-5 text-gray-500" />
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
              Output Log
            </h2>
          </div>
          {/* Clear button */}
          <button
            onClick={handleClear}
            className="p-1.5 rounded hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
            title="Clear logs"
          >
            <Trash2 className="w-4 h-4 text-gray-500" />
          </button>
        </div>

        {/* Tabs row - scrollable */}
        <div className="px-4 pb-2 overflow-x-auto">
          <div className="flex items-center rounded-lg bg-gray-100 dark:bg-gray-700 p-1 w-fit min-w-full">
            {/* Standard tabs */}
            <button
              onClick={() => setActiveLogView('all')}
              className={cn(
                'px-3 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap',
                activeLogView === 'all'
                  ? 'bg-white dark:bg-gray-600 text-gray-900 dark:text-white shadow-sm'
                  : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white'
              )}
            >
              All
            </button>
            {ALL_CHECK_TYPES.map((ct) => (
              <button
                key={ct}
                onClick={() => setActiveLogView(ct)}
                className={cn(
                  'px-3 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap',
                  activeLogView === ct
                    ? 'bg-white dark:bg-gray-600 text-gray-900 dark:text-white shadow-sm'
                    : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white'
                )}
              >
                {checkLabels[ct]}
              </button>
            ))}

            {/* Workflow tabs (with divider) */}
            {workflowChecks.length > 0 && (
              <>
                <div className="w-px h-5 bg-gray-300 dark:bg-gray-600 mx-1 shrink-0" />
                {workflowChecks.map((wc) => (
                  <button
                    key={wc.id}
                    onClick={() => setActiveLogView(wc.id)}
                    className={cn(
                      'px-3 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap',
                      activeLogView === wc.id
                        ? 'bg-white dark:bg-gray-600 text-gray-900 dark:text-white shadow-sm'
                        : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white'
                    )}
                  >
                    {wc.name}
                  </button>
                ))}
              </>
            )}
          </div>
        </div>
      </div>

      {/* Log content */}
      <div
        ref={logContainerRef}
        className="flex-1 overflow-auto p-4 font-mono text-sm bg-gray-900 dark:bg-gray-950"
      >
        {displayLogs.length === 0 ? (
          <div className="text-gray-500 text-center py-8">
            No logs yet. Run a check to see output here.
          </div>
        ) : (
          <div className="space-y-0.5">
            {displayLogs.map((log, index) => (
              <div
                key={`${log.timestamp}-${index}`}
                className={cn(
                  'leading-relaxed whitespace-pre-wrap break-all',
                  log.isStderr ? 'text-red-400' : 'text-green-400',
                  log.text.startsWith('>>>') && 'text-yellow-400 font-semibold'
                )}
              >
                {activeLogView === 'all' && (
                  <span className="text-gray-500 mr-2">
                    [{log.label}]
                  </span>
                )}
                {log.text}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
