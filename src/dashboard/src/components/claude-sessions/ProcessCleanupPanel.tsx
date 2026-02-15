import { useState, useEffect, useCallback } from 'react'

interface ProcessInfo {
  pid: number
  version: string
  terminal: string
  state: string
  started: string
  cpu_time: string
  memory_mb: number
  is_foreground: boolean
  is_current: boolean
  command: string
}

interface ProcessListResponse {
  processes: ProcessInfo[]
  total_count: number
  foreground_count: number
  background_count: number
}

interface ProcessKillResponse {
  success: boolean
  killed: number[]
  failed: { pid: number; error: string }[]
  protected: number[]
  message: string
}

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:8000'

export function ProcessCleanupPanel() {
  const [processes, setProcesses] = useState<ProcessInfo[]>([])
  const [totalCount, setTotalCount] = useState(0)
  const [foregroundCount, setForegroundCount] = useState(0)
  const [backgroundCount, setBackgroundCount] = useState(0)
  const [loading, setLoading] = useState(false)
  const [cleaning, setCleaning] = useState(false)
  const [selectedPids, setSelectedPids] = useState<Set<number>>(new Set())
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  const fetchProcesses = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch(`${API_BASE}/api/claude-sessions/processes`)
      if (!res.ok) throw new Error('Failed to fetch processes')
      const data: ProcessListResponse = await res.json()
      setProcesses(data.processes)
      setTotalCount(data.total_count)
      setForegroundCount(data.foreground_count)
      setBackgroundCount(data.background_count)
    } catch (err) {
      setMessage({ type: 'error', text: String(err) })
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchProcesses()
  }, [fetchProcesses])

  const handleCleanupStale = async () => {
    setCleaning(true)
    setMessage(null)
    try {
      const res = await fetch(`${API_BASE}/api/claude-sessions/processes/cleanup-stale`, {
        method: 'POST',
      })
      if (!res.ok) throw new Error('Cleanup failed')
      const data: ProcessKillResponse = await res.json()
      setMessage({
        type: data.success ? 'success' : 'error',
        text: data.message,
      })
      // Refresh process list
      await fetchProcesses()
    } catch (err) {
      setMessage({ type: 'error', text: String(err) })
    } finally {
      setCleaning(false)
    }
  }

  const handleKillSelected = async () => {
    if (selectedPids.size === 0) return

    setCleaning(true)
    setMessage(null)
    try {
      const res = await fetch(`${API_BASE}/api/claude-sessions/processes/kill`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pids: Array.from(selectedPids) }),
      })
      if (!res.ok) throw new Error('Kill failed')
      const data: ProcessKillResponse = await res.json()
      setMessage({
        type: data.success ? 'success' : 'error',
        text: data.message,
      })
      setSelectedPids(new Set())
      // Refresh process list
      await fetchProcesses()
    } catch (err) {
      setMessage({ type: 'error', text: String(err) })
    } finally {
      setCleaning(false)
    }
  }

  const toggleSelect = (pid: number, process: ProcessInfo) => {
    // Don't allow selecting current or foreground processes
    if (process.is_current || process.is_foreground) return

    const newSelected = new Set(selectedPids)
    if (newSelected.has(pid)) {
      newSelected.delete(pid)
    } else {
      newSelected.add(pid)
    }
    setSelectedPids(newSelected)
  }

  const selectAllBackground = () => {
    const backgroundPids = processes
      .filter((p) => !p.is_foreground && !p.is_current)
      .map((p) => p.pid)
    setSelectedPids(new Set(backgroundPids))
  }

  const clearSelection = () => {
    setSelectedPids(new Set())
  }

  // Parse CPU time to minutes for display
  const formatCpuTime = (cpuTime: string): string => {
    const parts = cpuTime.split(':')
    if (parts.length === 2) {
      const minutes = parseInt(parts[0], 10)
      if (minutes >= 60) {
        const hours = Math.floor(minutes / 60)
        const mins = minutes % 60
        return `${hours}h ${mins}m`
      }
      return `${minutes}m`
    }
    return cpuTime
  }

  return (
    <div className="p-4 bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
            Claude Code Processes
          </h3>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            {totalCount} total ({foregroundCount} active, {backgroundCount} background)
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={fetchProcesses}
            disabled={loading}
            className="px-3 py-1.5 text-sm bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded hover:bg-gray-200 dark:hover:bg-gray-600 disabled:opacity-50"
          >
            {loading ? 'Loading...' : 'Refresh'}
          </button>
          <button
            onClick={handleCleanupStale}
            disabled={cleaning || backgroundCount === 0}
            className="px-3 py-1.5 text-sm bg-orange-500 text-white rounded hover:bg-orange-600 disabled:opacity-50"
          >
            {cleaning ? 'Cleaning...' : `Cleanup ${backgroundCount} Stale`}
          </button>
        </div>
      </div>

      {/* Message */}
      {message && (
        <div
          className={`mb-4 px-3 py-2 rounded text-sm ${
            message.type === 'success'
              ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300'
              : 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300'
          }`}
        >
          {message.text}
        </div>
      )}

      {/* Selection controls */}
      {backgroundCount > 0 && (
        <div className="flex items-center gap-2 mb-3 text-sm">
          <button
            onClick={selectAllBackground}
            className="text-blue-600 dark:text-blue-400 hover:underline"
          >
            Select all background
          </button>
          {selectedPids.size > 0 && (
            <>
              <span className="text-gray-400">|</span>
              <button
                onClick={clearSelection}
                className="text-gray-600 dark:text-gray-400 hover:underline"
              >
                Clear selection
              </button>
              <span className="text-gray-400">|</span>
              <button
                onClick={handleKillSelected}
                disabled={cleaning}
                className="text-red-600 dark:text-red-400 hover:underline"
              >
                Kill {selectedPids.size} selected
              </button>
            </>
          )}
        </div>
      )}

      {/* Process list */}
      <div className="space-y-2 max-h-[400px] overflow-y-auto">
        {processes.map((proc) => (
          <div
            key={proc.pid}
            onClick={() => toggleSelect(proc.pid, proc)}
            className={`p-3 rounded-lg border transition-colors ${
              proc.is_current
                ? 'bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800'
                : proc.is_foreground
                  ? 'bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800'
                  : selectedPids.has(proc.pid)
                    ? 'bg-red-50 dark:bg-red-900/20 border-red-300 dark:border-red-700 cursor-pointer'
                    : 'bg-gray-50 dark:bg-gray-700/50 border-gray-200 dark:border-gray-600 cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-700'
            }`}
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                {/* Checkbox for selectable processes */}
                {!proc.is_current && !proc.is_foreground && (
                  <input
                    type="checkbox"
                    checked={selectedPids.has(proc.pid)}
                    onChange={() => toggleSelect(proc.pid, proc)}
                    onClick={(e) => e.stopPropagation()}
                    className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                  />
                )}

                {/* PID and status badges */}
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-sm font-medium text-gray-900 dark:text-white">
                      PID {proc.pid}
                    </span>
                    {proc.is_current && (
                      <span className="px-1.5 py-0.5 text-xs bg-blue-100 dark:bg-blue-800 text-blue-700 dark:text-blue-200 rounded">
                        Current
                      </span>
                    )}
                    {proc.is_foreground && !proc.is_current && (
                      <span className="px-1.5 py-0.5 text-xs bg-green-100 dark:bg-green-800 text-green-700 dark:text-green-200 rounded">
                        Active
                      </span>
                    )}
                    {!proc.is_foreground && !proc.is_current && (
                      <span className="px-1.5 py-0.5 text-xs bg-yellow-100 dark:bg-yellow-800 text-yellow-700 dark:text-yellow-200 rounded">
                        Background
                      </span>
                    )}
                  </div>
                  <div className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                    {proc.version && proc.version !== 'unknown' ? `v${proc.version}` : '-'} · {proc.terminal && proc.terminal !== '??' ? proc.terminal : '-'} · Started {proc.started}
                  </div>
                </div>
              </div>

              {/* Resource usage */}
              <div className="text-right">
                <div className="text-sm font-medium text-gray-700 dark:text-gray-300">
                  {formatCpuTime(proc.cpu_time)} CPU
                </div>
                <div className="text-xs text-gray-500 dark:text-gray-400">
                  {proc.memory_mb.toFixed(0)} MB
                </div>
              </div>
            </div>
          </div>
        ))}

        {processes.length === 0 && !loading && (
          <div className="text-center py-8 text-gray-500 dark:text-gray-400">
            No Claude Code processes found
          </div>
        )}
      </div>
    </div>
  )
}
