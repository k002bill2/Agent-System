import { useState, useMemo, useRef, useEffect } from 'react'
import { Search, Filter, ChevronDown, ChevronRight, Copy, X } from 'lucide-react'
import type { WorkflowLog } from '../../types/workflow'

interface EnhancedRunLogsProps {
  logs: WorkflowLog[]
  isStreaming?: boolean
}

type LogLevel = 'all' | 'error' | 'warning' | 'info' | 'step' | 'job' | 'run'

const LEVEL_COLORS: Record<string, string> = {
  error: 'text-red-400',
  warning: 'text-yellow-400',
  step: 'text-blue-400',
  job: 'text-purple-400',
  run: 'text-green-400',
  info: 'text-gray-400',
}

export function EnhancedRunLogs({ logs, isStreaming = false }: EnhancedRunLogsProps) {
  const [search, setSearch] = useState('')
  const [levelFilter, setLevelFilter] = useState<LogLevel>('all')
  const [collapsedJobs, setCollapsedJobs] = useState<Set<string>>(new Set())
  const [showFilter, setShowFilter] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)

  // Auto-scroll to bottom when streaming
  useEffect(() => {
    if (isStreaming && bottomRef.current) {
      bottomRef.current.scrollIntoView({ behavior: 'smooth' })
    }
  }, [logs.length, isStreaming])

  const filteredLogs = useMemo(() => {
    let result = logs
    if (levelFilter !== 'all') {
      result = result.filter(l => l.level === levelFilter)
    }
    if (search) {
      const q = search.toLowerCase()
      result = result.filter(l => l.message.toLowerCase().includes(q))
    }
    return result
  }, [logs, levelFilter, search])

  const toggleJob = (jobName: string) => {
    setCollapsedJobs(prev => {
      const next = new Set(prev)
      if (next.has(jobName)) next.delete(jobName)
      else next.add(jobName)
      return next
    })
  }

  const copyLogs = async () => {
    const text = filteredLogs.map(l => `[${l.timestamp}] [${l.level}] ${l.message}`).join('\n')
    await navigator.clipboard.writeText(text)
  }

  const errorCount = logs.filter(l => l.level === 'error').length

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="p-2 border-b border-gray-200 dark:border-gray-700 space-y-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300">Logs</h3>
            {isStreaming && (
              <span className="flex items-center gap-1 text-xs text-green-500">
                <span className="w-1.5 h-1.5 bg-green-500 rounded-full animate-pulse" />
                Live
              </span>
            )}
            {errorCount > 0 && (
              <span className="text-xs px-1.5 py-0.5 bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400 rounded">
                {errorCount} error{errorCount > 1 ? 's' : ''}
              </span>
            )}
          </div>
          <div className="flex items-center gap-1">
            <button
              onClick={() => setShowFilter(!showFilter)}
              className={`p-1 rounded ${showFilter ? 'bg-gray-200 dark:bg-gray-600' : 'hover:bg-gray-100 dark:hover:bg-gray-700'}`}
            >
              <Filter className="w-3.5 h-3.5 text-gray-500" />
            </button>
            <button onClick={copyLogs} className="p-1 hover:bg-gray-100 dark:hover:bg-gray-700 rounded">
              <Copy className="w-3.5 h-3.5 text-gray-500" />
            </button>
          </div>
        </div>

        {showFilter && (
          <div className="space-y-1.5">
            <div className="relative">
              <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-gray-400" />
              <input
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Search logs..."
                className="w-full pl-7 pr-2 py-1 text-xs bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-600 rounded"
              />
              {search && (
                <button onClick={() => setSearch('')} className="absolute right-2 top-1/2 -translate-y-1/2">
                  <X className="w-3 h-3 text-gray-400" />
                </button>
              )}
            </div>
            <div className="flex flex-wrap gap-1">
              {(['all', 'error', 'warning', 'job', 'step', 'run'] as LogLevel[]).map(level => (
                <button
                  key={level}
                  onClick={() => setLevelFilter(level)}
                  className={`px-1.5 py-0.5 text-xs rounded ${
                    levelFilter === level
                      ? 'bg-primary-100 dark:bg-primary-900 text-primary-700 dark:text-primary-300'
                      : 'text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700'
                  }`}
                >
                  {level}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Logs */}
      <div className="flex-1 overflow-auto p-2 font-mono text-xs space-y-0.5">
        {filteredLogs.length === 0 ? (
          <p className="text-gray-400 text-center py-4">
            {logs.length === 0 ? 'No logs yet...' : 'No matching logs'}
          </p>
        ) : (
          filteredLogs.map((log, i) => {
            const isJobLog = log.level === 'job'
            const isCollapsed = isJobLog && collapsedJobs.has(log.message)

            return (
              <div
                key={i}
                className={`flex items-start gap-1.5 px-1 py-0.5 rounded hover:bg-gray-50 dark:hover:bg-gray-800 ${
                  log.level === 'error' ? 'bg-red-50/50 dark:bg-red-900/10' : ''
                }`}
              >
                {isJobLog && (
                  <button onClick={() => toggleJob(log.message)} className="mt-0.5 flex-shrink-0">
                    {isCollapsed ? (
                      <ChevronRight className="w-3 h-3 text-gray-400" />
                    ) : (
                      <ChevronDown className="w-3 h-3 text-gray-400" />
                    )}
                  </button>
                )}
                <span className="text-gray-500 flex-shrink-0 w-16">
                  {new Date(log.timestamp).toLocaleTimeString('en', { hour12: false })}
                </span>
                <span className={`flex-shrink-0 w-10 ${LEVEL_COLORS[log.level] || 'text-gray-400'}`}>
                  [{log.level}]
                </span>
                <span className="text-gray-300 dark:text-gray-400 break-all">{log.message}</span>
              </div>
            )
          })
        )}
        <div ref={bottomRef} />
      </div>
    </div>
  )
}
