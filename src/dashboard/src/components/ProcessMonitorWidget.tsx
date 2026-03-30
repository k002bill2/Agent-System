import { useState, useEffect, useCallback } from 'react'
import { Cpu, Trash2, RefreshCw } from 'lucide-react'

interface ProcessInfo {
  pid: number
  version: string
  terminal: string
  is_foreground: boolean
  is_current: boolean
  cpu_time: string
  memory_mb: number
}

interface ProcessListResponse {
  processes: ProcessInfo[]
  total_count: number
  foreground_count: number
  background_count: number
}

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:8000'

export function ProcessMonitorWidget() {
  const [processes, setProcesses] = useState<ProcessInfo[]>([])
  const [totalCount, setTotalCount] = useState(0)
  const [foregroundCount, setForegroundCount] = useState(0)
  const [backgroundCount, setBackgroundCount] = useState(0)
  const [loading, setLoading] = useState(false)
  const [cleaning, setCleaning] = useState(false)

  const fetchProcesses = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch(`${API_BASE}/api/claude-sessions/processes`)
      if (!res.ok) return
      const data: ProcessListResponse = await res.json()
      setProcesses(data.processes)
      setTotalCount(data.total_count)
      setForegroundCount(data.foreground_count)
      setBackgroundCount(data.background_count)
    } catch {
      // Silently fail for dashboard widget
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchProcesses()
    // Auto-refresh every 30 seconds
    const interval = setInterval(fetchProcesses, 30000)
    return () => clearInterval(interval)
  }, [fetchProcesses])

  const handleCleanup = async () => {
    setCleaning(true)
    try {
      const res = await fetch(`${API_BASE}/api/claude-sessions/processes/cleanup-stale`, {
        method: 'POST',
      })
      if (res.ok) {
        await fetchProcesses()
      }
    } catch {
      // Silently fail
    } finally {
      setCleaning(false)
    }
  }

  // Calculate total memory usage
  const totalMemoryMb = processes.reduce((sum, p) => sum + p.memory_mb, 0)

  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white flex items-center gap-2">
          <Cpu className="w-5 h-5" />
          Claude Processes
        </h3>
        <button
          onClick={fetchProcesses}
          disabled={loading}
          className="p-1.5 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 rounded transition-colors"
          title="Refresh"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      <div className="space-y-3">
        {/* Stats */}
        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between p-2 bg-gray-50 dark:bg-gray-700/50 rounded">
            <span className="text-sm text-gray-600 dark:text-gray-400">Total</span>
            <span className="text-lg font-bold text-gray-900 dark:text-white">{totalCount}</span>
          </div>
          <div className="flex items-center justify-between p-2 bg-green-50 dark:bg-green-900/20 rounded">
            <span className="text-sm text-gray-600 dark:text-gray-400">Active</span>
            <span className="text-lg font-bold text-green-600 dark:text-green-400">{foregroundCount}</span>
          </div>
          <div className="flex items-center justify-between p-2 bg-yellow-50 dark:bg-yellow-900/20 rounded">
            <span className="text-sm text-gray-600 dark:text-gray-400">Stale</span>
            <span className="text-lg font-bold text-yellow-600 dark:text-yellow-400">{backgroundCount}</span>
          </div>
        </div>

        {/* Memory usage */}
        <div className="flex items-center justify-between text-sm">
          <span className="text-gray-600 dark:text-gray-400">Total Memory</span>
          <span className="font-medium text-gray-900 dark:text-white">
            {totalMemoryMb > 1024
              ? `${(totalMemoryMb / 1024).toFixed(1)} GB`
              : `${totalMemoryMb.toFixed(0)} MB`}
          </span>
        </div>

        {/* Cleanup button */}
        {backgroundCount > 0 && (
          <button
            onClick={handleCleanup}
            disabled={cleaning}
            className="w-full flex items-center justify-center gap-2 px-3 py-2 text-sm bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-300 rounded-lg hover:bg-orange-200 dark:hover:bg-orange-900/50 transition-colors disabled:opacity-50"
          >
            <Trash2 className="w-4 h-4" />
            {cleaning ? 'Cleaning...' : `Cleanup ${backgroundCount} Stale Processes`}
          </button>
        )}

        {/* Process list preview */}
        {processes.length > 0 && (
          <div className="mt-3 pt-3 border-t border-gray-200 dark:border-gray-700">
            <p className="text-xs text-gray-500 dark:text-gray-400 mb-2">Recent processes</p>
            <div className="space-y-1.5">
              {processes.slice(0, 3).map((proc) => (
                <div
                  key={proc.pid}
                  className="flex items-center justify-between text-xs"
                >
                  <div className="flex items-center gap-2">
                    <span
                      className={`w-2 h-2 rounded-full ${
                        proc.is_current
                          ? 'bg-blue-500'
                          : proc.is_foreground
                            ? 'bg-green-500'
                            : 'bg-yellow-500'
                      }`}
                    />
                    <span className="text-gray-700 dark:text-gray-300">
                      {proc.pid}
                    </span>
                    <span className="text-gray-500 dark:text-gray-400">
                      v{proc.version}
                    </span>
                  </div>
                  <span className="text-gray-500 dark:text-gray-400">
                    {proc.cpu_time}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
