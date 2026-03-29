import { useEffect, useRef } from 'react'
import { useWorkflowStore } from '../../stores/workflows'
import { X, RotateCcw, StopCircle } from 'lucide-react'
import { cn } from '../../lib/utils'

export function WorkflowRunLogs() {
  const { activeRun, runLogs, cancelRun, retryRun, setActiveRun, stopLogStream } = useWorkflowStore()
  const bottomRef = useRef<HTMLDivElement>(null)

  const logs = activeRun ? (runLogs[activeRun.id] || []) : []

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [logs.length])

  if (!activeRun) return null

  const isActive = activeRun.status === 'running' || activeRun.status === 'queued'

  return (
    <div className="flex flex-col h-full bg-gray-900">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-gray-700">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-white">Run Logs</span>
          <span className={cn(
            'text-xs px-1.5 py-0.5 rounded',
            activeRun.status === 'completed' && 'bg-green-900/50 text-green-400',
            activeRun.status === 'failed' && 'bg-red-900/50 text-red-400',
            activeRun.status === 'running' && 'bg-blue-900/50 text-blue-400',
            activeRun.status === 'queued' && 'bg-yellow-900/50 text-yellow-400',
            activeRun.status === 'cancelled' && 'bg-gray-700 text-gray-400',
          )}>
            {activeRun.status}
          </span>
        </div>
        <div className="flex items-center gap-1">
          {isActive && (
            <button
              onClick={() => cancelRun(activeRun.id)}
              className="p-1 text-gray-400 hover:text-red-400 transition-colors"
              title="Cancel"
            >
              <StopCircle className="w-4 h-4" />
            </button>
          )}
          {(activeRun.status === 'failed' || activeRun.status === 'cancelled') && (
            <button
              onClick={() => retryRun(activeRun.id)}
              className="p-1 text-gray-400 hover:text-blue-400 transition-colors"
              title="Retry"
            >
              <RotateCcw className="w-4 h-4" />
            </button>
          )}
          <button
            onClick={() => { setActiveRun(null); stopLogStream() }}
            className="p-1 text-gray-400 hover:text-white transition-colors"
            title="Close"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Log Content */}
      <div className="flex-1 overflow-y-auto p-3 font-mono text-xs">
        {logs.length === 0 ? (
          <div className="text-gray-500">Waiting for logs...</div>
        ) : (
          logs.map((log, i) => (
            <div
              key={i}
              className={cn(
                'py-0.5',
                log.level === 'error' && 'text-red-400',
                log.level === 'warning' && 'text-yellow-400',
                log.level === 'step' && 'text-gray-300',
                log.level === 'job' && 'text-blue-400 font-semibold',
                log.level === 'run' && 'text-green-400 font-semibold',
                !['error', 'warning', 'step', 'job', 'run'].includes(log.level) && 'text-gray-400',
              )}
            >
              <span className="text-gray-600 mr-2">
                {new Date(log.timestamp).toLocaleTimeString()}
              </span>
              {log.message}
            </div>
          ))
        )}
        <div ref={bottomRef} />
      </div>
    </div>
  )
}
