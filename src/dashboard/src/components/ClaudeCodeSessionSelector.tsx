/**
 * Claude Code Session Selector component
 *
 * Shows active Claude Code sessions as cards for easy selection.
 */

import { useEffect } from 'react'
import { Terminal, Clock, Activity, MessageSquare, Wrench, RefreshCw } from 'lucide-react'
import { useClaudeSessionsStore } from '../stores/claudeSessions'
import { cn } from '../lib/utils'

interface ClaudeCodeSessionSelectorProps {
  selectedSessionId: string | null
  onSelect: (sessionId: string | null) => void
  className?: string
}

export function ClaudeCodeSessionSelector({
  selectedSessionId,
  onSelect,
  className,
}: ClaudeCodeSessionSelectorProps) {
  const { sessions, isLoading, fetchSessions, refreshSessions } = useClaudeSessionsStore()

  // Fetch sessions on mount
  useEffect(() => {
    fetchSessions('active') // Only fetch active sessions
  }, [fetchSessions])

  // Auto-refresh every 5 seconds
  useEffect(() => {
    const interval = setInterval(() => {
      refreshSessions('active')
    }, 5000)
    return () => clearInterval(interval)
  }, [refreshSessions])

  // Filter active sessions only
  const activeSessions = sessions.filter((s) => s.status === 'active')

  // Format relative time
  const formatRelativeTime = (dateString: string) => {
    const date = new Date(dateString)
    const now = new Date()
    const diffMs = now.getTime() - date.getTime()
    const diffSecs = Math.floor(diffMs / 1000)
    const diffMins = Math.floor(diffMs / 60000)

    if (diffSecs < 60) return `${diffSecs}s ago`
    if (diffMins < 60) return `${diffMins}m ago`
    return `${Math.floor(diffMins / 60)}h ago`
  }

  // Handle refresh
  const handleRefresh = () => {
    fetchSessions('active')
  }

  return (
    <div className={cn('space-y-3', className)}>
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400">
          <Activity className="w-4 h-4 text-green-500" />
          <span>Active Sessions ({activeSessions.length})</span>
        </div>
        <button
          onClick={handleRefresh}
          disabled={isLoading}
          className={cn(
            'p-1.5 rounded-md text-gray-400 hover:text-gray-600 hover:bg-gray-100',
            'dark:hover:text-gray-300 dark:hover:bg-gray-700 transition-colors',
            isLoading && 'animate-spin'
          )}
          title="Refresh"
        >
          <RefreshCw className="w-4 h-4" />
        </button>
      </div>

      {/* Session Cards - with max height and scroll */}
      {isLoading && activeSessions.length === 0 ? (
        <div className="flex items-center justify-center py-8 text-gray-400">
          <RefreshCw className="w-5 h-5 animate-spin mr-2" />
          Loading sessions...
        </div>
      ) : activeSessions.length === 0 ? (
        <div className="text-center py-8 text-gray-500 dark:text-gray-400 bg-gray-50 dark:bg-gray-800/50 rounded-lg border border-dashed border-gray-300 dark:border-gray-600">
          <Terminal className="w-10 h-10 mx-auto mb-2 opacity-40" />
          <p className="text-sm">No active Claude Code sessions</p>
          <p className="text-xs mt-1 text-gray-400">Start a session in your terminal</p>
        </div>
      ) : (
        <div className="grid gap-2">
          {activeSessions.map((session) => (
            <button
              key={session.session_id}
              onClick={() => onSelect(
                selectedSessionId === session.session_id ? null : session.session_id
              )}
              className={cn(
                'w-full text-left p-3 rounded-lg border transition-all',
                'hover:shadow-md',
                selectedSessionId === session.session_id
                  ? 'border-primary-500 bg-primary-50 dark:bg-primary-900/20 ring-1 ring-primary-500'
                  : 'border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 hover:border-gray-300 dark:hover:border-gray-600'
              )}
            >
              {/* Project Name & Status */}
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <Terminal className="w-4 h-4 text-gray-500" />
                  <span className="font-medium text-gray-900 dark:text-white truncate max-w-[200px]">
                    {session.project_name || 'Unknown Project'}
                  </span>
                </div>
                <div className="flex items-center gap-1">
                  <span className="relative flex h-2 w-2">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500"></span>
                  </span>
                  <span className="text-xs text-green-600 dark:text-green-400">Active</span>
                </div>
              </div>

              {/* Summary or Slug */}
              {session.summary ? (
                <p className="text-sm text-gray-600 dark:text-gray-300 truncate mb-2">
                  {session.summary}
                </p>
              ) : session.slug ? (
                <p className="text-xs text-gray-400 dark:text-gray-500 font-mono mb-2">
                  {session.slug}
                </p>
              ) : null}

              {/* Stats */}
              <div className="flex items-center gap-4 text-xs text-gray-500 dark:text-gray-400">
                <div className="flex items-center gap-1">
                  <Clock className="w-3 h-3" />
                  <span>{formatRelativeTime(session.last_activity)}</span>
                </div>
                <div className="flex items-center gap-1">
                  <MessageSquare className="w-3 h-3" />
                  <span>{session.message_count}</span>
                </div>
                <div className="flex items-center gap-1">
                  <Wrench className="w-3 h-3" />
                  <span>{session.tool_call_count}</span>
                </div>
                {session.estimated_cost > 0 && (
                  <span className="text-amber-600 dark:text-amber-400">
                    ${session.estimated_cost.toFixed(3)}
                  </span>
                )}
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
