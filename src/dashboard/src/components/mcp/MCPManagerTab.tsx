/**
 * MCP Manager Tab Component
 *
 * MCP 서버 관리 탭 - 통계, 서버 목록, 도구 호출 UI를 조합
 */

import { useEffect, useMemo } from 'react'
import { cn } from '../../lib/utils'
import { useMCPStore, MCPServerStatus } from '../../stores/mcp'
import { MCPStatsPanel } from './MCPStatsPanel'
import { MCPServerCard } from './MCPServerCard'
import { MCPToolCaller } from './MCPToolCaller'
import { Server, Filter, RefreshCw, AlertCircle } from 'lucide-react'

// 상태 필터 옵션
const statusFilterOptions: { value: MCPServerStatus | null; label: string }[] = [
  { value: null, label: 'All' },
  { value: 'running', label: 'Running' },
  { value: 'stopped', label: 'Stopped' },
  { value: 'error', label: 'Error' },
]

export function MCPManagerTab() {
  const {
    servers,
    stats,
    isLoading,
    error,
    selectedServerId,
    statusFilter,
    fetchServers,
    fetchStats,
    fetchServerTools,
    startServer,
    stopServer,
    restartServer,
    setSelectedServer,
    setStatusFilter,
    clearError,
  } = useMCPStore()

  // 초기 데이터 로드
  useEffect(() => {
    fetchServers()
    fetchStats()
  }, [fetchServers, fetchStats])

  // 실행 중인 서버의 도구 목록 로드
  useEffect(() => {
    servers.forEach((server) => {
      if (server.status === 'running' && (!server.tools || server.tools.length === 0)) {
        fetchServerTools(server.id)
      }
    })
  }, [servers, fetchServerTools])

  // 필터링된 서버 목록
  const filteredServers = useMemo(() => {
    if (!statusFilter) return servers
    return servers.filter((server) => server.status === statusFilter)
  }, [servers, statusFilter])

  const handleRefresh = async () => {
    await Promise.all([fetchServers(), fetchStats()])
  }

  const handleStartServer = async (serverId: string) => {
    await startServer(serverId)
  }

  const handleStopServer = async (serverId: string) => {
    await stopServer(serverId)
  }

  const handleRestartServer = async (serverId: string) => {
    await restartServer(serverId)
  }

  return (
    <div className="space-y-6">
      {/* Stats Panel */}
      <MCPStatsPanel stats={stats} isLoading={isLoading} />

      {/* Error Banner */}
      {error && (
        <div className="p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
          <div className="flex items-center gap-2 text-red-600 dark:text-red-400">
            <AlertCircle className="w-4 h-4" />
            <span className="text-sm">{error}</span>
            <button onClick={clearError} className="ml-auto text-red-500 hover:text-red-600 text-sm">
              Dismiss
            </button>
          </div>
        </div>
      )}

      {/* Filter & Refresh */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Filter className="w-4 h-4 text-gray-500 dark:text-gray-400" />
          <div className="flex gap-1">
            {statusFilterOptions.map((option) => (
              <button
                key={option.value ?? 'all'}
                onClick={() => setStatusFilter(option.value)}
                className={cn(
                  'px-3 py-1.5 rounded-lg text-sm font-medium transition-colors',
                  statusFilter === option.value
                    ? 'bg-primary-100 dark:bg-primary-900/30 text-primary-700 dark:text-primary-400'
                    : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700'
                )}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>

        <button
          onClick={handleRefresh}
          disabled={isLoading}
          className={cn(
            'p-2 rounded-lg border border-gray-200 dark:border-gray-700 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors',
            isLoading && 'opacity-50 cursor-not-allowed'
          )}
        >
          <RefreshCw className={cn('w-4 h-4 text-gray-600 dark:text-gray-400', isLoading && 'animate-spin')} />
        </button>
      </div>

      {/* Main Content */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Server Cards (2/3) */}
        <div className="lg:col-span-2">
          {isLoading ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {[...Array(4)].map((_, i) => (
                <div
                  key={i}
                  className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4 animate-pulse"
                >
                  <div className="flex items-center gap-3 mb-3">
                    <div className="w-10 h-10 bg-gray-200 dark:bg-gray-700 rounded-lg" />
                    <div className="flex-1">
                      <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-24 mb-1" />
                      <div className="h-3 bg-gray-200 dark:bg-gray-700 rounded w-16" />
                    </div>
                  </div>
                  <div className="h-8 bg-gray-200 dark:bg-gray-700 rounded mb-3" />
                  <div className="h-10 bg-gray-200 dark:bg-gray-700 rounded" />
                </div>
              ))}
            </div>
          ) : filteredServers.length === 0 ? (
            <div className="text-center py-12 text-gray-500 dark:text-gray-400">
              <Server className="w-12 h-12 mx-auto mb-4 opacity-50" />
              <p>No servers found</p>
              <p className="text-sm mt-1">
                {statusFilter ? `No servers with status "${statusFilter}"` : 'No MCP servers configured'}
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {filteredServers.map((server) => (
                <MCPServerCard
                  key={server.id}
                  server={server}
                  isSelected={selectedServerId === server.id}
                  onClick={() => setSelectedServer(selectedServerId === server.id ? null : server.id)}
                  onStart={() => handleStartServer(server.id)}
                  onStop={() => handleStopServer(server.id)}
                  onRestart={() => handleRestartServer(server.id)}
                />
              ))}
            </div>
          )}
        </div>

        {/* Tool Caller (1/3) */}
        <div className="lg:col-span-1">
          <MCPToolCaller servers={servers} />
        </div>
      </div>
    </div>
  )
}
