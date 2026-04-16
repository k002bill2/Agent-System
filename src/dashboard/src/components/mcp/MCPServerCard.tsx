/**
 * MCP Server Card Component
 *
 * MCP 서버 정보를 표시하고 제어하는 카드 컴포넌트
 */

import { useState } from 'react'
import { cn } from '../../lib/utils'
import { MCPServer, MCPServerStatus, MCPServerType } from '../../stores/mcp'
import {
  Server,
  Play,
  Square,
  RotateCw,
  FolderOpen,
  Code2,
  Globe,
  Database,
  Settings,
  ChevronDown,
  ChevronUp,
  Wrench,
  AlertCircle,
  Clock,
} from 'lucide-react'

// 서버 타입별 아이콘
const serverTypeIcons: Record<MCPServerType, typeof Server> = {
  filesystem: FolderOpen,
  github: Code2,
  playwright: Globe,
  sqlite: Database,
  custom: Settings,
}

// 서버 타입별 색상
const serverTypeColors: Record<MCPServerType, string> = {
  filesystem: 'bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400',
  github: 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400',
  playwright: 'bg-green-100 dark:bg-green-900/30 text-green-600 dark:text-green-400',
  sqlite: 'bg-amber-100 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400',
  custom: 'bg-purple-100 dark:bg-purple-900/30 text-purple-600 dark:text-purple-400',
}

// 상태별 색상
const statusColors: Record<MCPServerStatus, string> = {
  running: 'text-green-500',
  stopped: 'text-gray-400',
  starting: 'text-blue-500',
  error: 'text-red-500',
}

const statusBgColors: Record<MCPServerStatus, string> = {
  running: 'bg-green-100 dark:bg-green-900/30',
  stopped: 'bg-gray-100 dark:bg-gray-700',
  starting: 'bg-blue-100 dark:bg-blue-900/30',
  error: 'bg-red-100 dark:bg-red-900/30',
}

const statusLabels: Record<MCPServerStatus, string> = {
  running: 'Running',
  stopped: 'Stopped',
  starting: 'Starting...',
  error: 'Error',
}

interface MCPServerCardProps {
  server: MCPServer
  isSelected?: boolean
  onClick?: () => void
  onStart?: () => Promise<void>
  onStop?: () => Promise<void>
  onRestart?: () => Promise<void>
}

export function MCPServerCard({
  server,
  isSelected,
  onClick,
  onStart,
  onStop,
  onRestart,
}: MCPServerCardProps) {
  const [isExpanded, setIsExpanded] = useState(false)
  const [isActionLoading, setIsActionLoading] = useState(false)

  const TypeIcon = serverTypeIcons[server.type] || Settings

  const handleStart = async (e: React.MouseEvent) => {
    e.stopPropagation()
    if (onStart) {
      setIsActionLoading(true)
      await onStart()
      setIsActionLoading(false)
    }
  }

  const handleStop = async (e: React.MouseEvent) => {
    e.stopPropagation()
    if (onStop) {
      setIsActionLoading(true)
      await onStop()
      setIsActionLoading(false)
    }
  }

  const handleRestart = async (e: React.MouseEvent) => {
    e.stopPropagation()
    if (onRestart) {
      setIsActionLoading(true)
      await onRestart()
      setIsActionLoading(false)
    }
  }

  const toggleExpand = (e: React.MouseEvent) => {
    e.stopPropagation()
    setIsExpanded(!isExpanded)
  }

  return (
    <div
      onClick={onClick}
      className={cn(
        'bg-white dark:bg-gray-800 rounded-lg border p-4 transition-all cursor-pointer hover:shadow-md',
        isSelected
          ? 'border-primary-500 ring-2 ring-primary-500/20'
          : 'border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600'
      )}
    >
      {/* Header */}
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-3">
          <div className={cn('w-10 h-10 rounded-lg flex items-center justify-center', serverTypeColors[server.type])}>
            <TypeIcon className="w-5 h-5" />
          </div>
          <div>
            <h3 className="font-medium text-gray-900 dark:text-white">{server.name}</h3>
            <p className="text-xs text-gray-500 dark:text-gray-400 capitalize">{server.type}</p>
          </div>
        </div>

        {/* Status Badge */}
        <div className={cn('flex items-center gap-1.5 px-2 py-1 rounded-full', statusBgColors[server.status])}>
          {server.status === 'starting' ? (
            <Clock className={cn('w-3 h-3 animate-spin', statusColors[server.status])} />
          ) : server.status === 'error' ? (
            <AlertCircle className={cn('w-3 h-3', statusColors[server.status])} />
          ) : (
            <div className={cn('w-2 h-2 rounded-full', server.status === 'running' ? 'bg-green-500 animate-pulse' : 'bg-gray-400')} />
          )}
          <span className={cn('text-xs font-medium', statusColors[server.status])}>
            {statusLabels[server.status]}
          </span>
        </div>
      </div>

      {/* Server Info */}
      {server.status === 'running' && (
        <div className="mb-3 space-y-1">
          {server.pid && (
            <p className="text-xs text-gray-500 dark:text-gray-400">
              PID: <span className="">{server.pid}</span>
            </p>
          )}
          {server.started_at && (
            <p className="text-xs text-gray-500 dark:text-gray-400">
              Started: {new Date(server.started_at).toLocaleTimeString()}
            </p>
          )}
        </div>
      )}

      {/* Error Message */}
      {server.status === 'error' && server.last_error && (
        <div className="mb-3 p-2 bg-red-50 dark:bg-red-900/20 rounded-lg">
          <p className="text-xs text-red-600 dark:text-red-400">{server.last_error}</p>
        </div>
      )}

      {/* Action Buttons */}
      <div className="flex items-center gap-2 mb-3">
        {server.status === 'stopped' || server.status === 'error' ? (
          <button
            onClick={handleStart}
            disabled={isActionLoading}
            className={cn(
              'flex items-center gap-1.5 px-3 py-1.5 bg-green-100 dark:bg-green-900/30 text-green-600 dark:text-green-400',
              'rounded-lg text-sm font-medium hover:bg-green-200 dark:hover:bg-green-900/50 transition-colors',
              isActionLoading && 'opacity-50 cursor-not-allowed'
            )}
          >
            <Play className="w-3.5 h-3.5" />
            Start
          </button>
        ) : server.status === 'running' ? (
          <>
            <button
              onClick={handleStop}
              disabled={isActionLoading}
              className={cn(
                'flex items-center gap-1.5 px-3 py-1.5 bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400',
                'rounded-lg text-sm font-medium hover:bg-red-200 dark:hover:bg-red-900/50 transition-colors',
                isActionLoading && 'opacity-50 cursor-not-allowed'
              )}
            >
              <Square className="w-3.5 h-3.5" />
              Stop
            </button>
            <button
              onClick={handleRestart}
              disabled={isActionLoading}
              className={cn(
                'flex items-center gap-1.5 px-3 py-1.5 bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400',
                'rounded-lg text-sm font-medium hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors',
                isActionLoading && 'opacity-50 cursor-not-allowed'
              )}
            >
              <RotateCw className={cn('w-3.5 h-3.5', isActionLoading && 'animate-spin')} />
              Restart
            </button>
          </>
        ) : null}
      </div>

      {/* Tools Section */}
      {server.tools && server.tools.length > 0 && (
        <div className="border-t border-gray-100 dark:border-gray-700 pt-3">
          <button
            onClick={toggleExpand}
            className="flex items-center justify-between w-full text-sm text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white transition-colors"
          >
            <div className="flex items-center gap-1.5">
              <Wrench className="w-3.5 h-3.5" />
              <span>Tools ({server.tools.length})</span>
            </div>
            {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </button>

          {isExpanded && (
            <div className="mt-2 space-y-1.5 max-h-40 overflow-y-auto">
              {server.tools.map((tool) => (
                <div
                  key={tool.name}
                  className="p-2 bg-gray-50 dark:bg-gray-900 rounded-lg"
                >
                  <p className="text-xs font-medium text-gray-900 dark:text-white">{tool.name}</p>
                  <p className="text-xs text-gray-500 dark:text-gray-400 truncate">{tool.description}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* No Tools */}
      {(!server.tools || server.tools.length === 0) && server.status === 'running' && (
        <div className="border-t border-gray-100 dark:border-gray-700 pt-3">
          <p className="text-xs text-gray-500 dark:text-gray-400">No tools available</p>
        </div>
      )}
    </div>
  )
}
