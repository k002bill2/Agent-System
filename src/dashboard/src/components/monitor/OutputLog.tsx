import { useEffect, useRef } from 'react'
import { cn } from '../../lib/utils'
import { Terminal, Trash2 } from 'lucide-react'
import { ALL_CHECK_TYPES, CHECK_TYPE_LABELS } from '../../types/monitoring'
import { useMonitoringStore } from '../../stores/monitoring'

interface OutputLogProps {
  projectId?: string
}

export function OutputLog(_props: OutputLogProps) {
  const { checkLogs, activeLogView, setActiveLogView, clearLogs } = useMonitoringStore()
  const logContainerRef = useRef<HTMLDivElement>(null)

  // Get logs based on active view
  const getDisplayLogs = () => {
    if (activeLogView === 'all') {
      // Combine all logs and sort by timestamp
      const allLogs = ALL_CHECK_TYPES.flatMap((ct) =>
        checkLogs[ct].map((log) => ({ ...log, checkType: ct }))
      )
      return allLogs.sort(
        (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
      )
    }
    return checkLogs[activeLogView].map((log) => ({ ...log, checkType: activeLogView }))
  }

  const displayLogs = getDisplayLogs()

  // Auto-scroll to bottom when new logs appear
  useEffect(() => {
    if (logContainerRef.current) {
      logContainerRef.current.scrollTop = logContainerRef.current.scrollHeight
    }
  }, [displayLogs.length])

  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 flex flex-col h-full min-h-[300px]">
      {/* Header with tabs */}
      <div className="flex items-center justify-between border-b border-gray-200 dark:border-gray-700 px-4 py-2">
        <div className="flex items-center gap-2">
          <Terminal className="w-5 h-5 text-gray-500" />
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
            Output Log
          </h2>
        </div>

        <div className="flex items-center gap-2">
          {/* Tab buttons */}
          <div className="flex rounded-lg bg-gray-100 dark:bg-gray-700 p-1">
            <button
              onClick={() => setActiveLogView('all')}
              className={cn(
                'px-3 py-1 text-xs font-medium rounded-md transition-colors',
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
                  'px-3 py-1 text-xs font-medium rounded-md transition-colors',
                  activeLogView === ct
                    ? 'bg-white dark:bg-gray-600 text-gray-900 dark:text-white shadow-sm'
                    : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white'
                )}
              >
                {CHECK_TYPE_LABELS[ct]}
              </button>
            ))}
          </div>

          {/* Clear button */}
          <button
            onClick={() => clearLogs(activeLogView === 'all' ? undefined : activeLogView)}
            className="p-1.5 rounded hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
            title="Clear logs"
          >
            <Trash2 className="w-4 h-4 text-gray-500" />
          </button>
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
                    [{CHECK_TYPE_LABELS[log.checkType]}]
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
