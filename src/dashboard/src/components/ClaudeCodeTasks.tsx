/**
 * Claude Code Tasks component
 *
 * Displays Claude Code sessions on the left, with session details
 * and activity log on the right (split vertically).
 */

import { useClaudeCodeActivityStore } from '../stores/claudeCodeActivity'
import { useClaudeSessionsStore } from '../stores/claudeSessions'
import { ClaudeCodeSessionSelector } from './ClaudeCodeSessionSelector'
import { VerticalSplitPanel } from './VerticalSplitPanel'
import { cn } from '../lib/utils'
import {
  User,
  Bot,
  Wrench,
  CheckCircle,
  AlertTriangle,
  Loader2,
  Info,
  Terminal,
  Clock,
  MessageSquare,
  DollarSign,
} from 'lucide-react'
import type { ActivityEvent, ActivityEventType } from '../types/claudeCodeActivity'

// Activity event icons and colors
const typeIcons: Record<ActivityEventType, typeof User> = {
  user: User,
  assistant: Bot,
  tool_use: Wrench,
  tool_result: CheckCircle,
  error: AlertTriangle,
}

const typeColors: Record<ActivityEventType, string> = {
  user: 'text-blue-500 bg-blue-100 dark:bg-blue-900/30',
  assistant: 'text-purple-500 bg-purple-100 dark:bg-purple-900/30',
  tool_use: 'text-green-500 bg-green-100 dark:bg-green-900/30',
  tool_result: 'text-teal-500 bg-teal-100 dark:bg-teal-900/30',
  error: 'text-red-500 bg-red-100 dark:bg-red-900/30',
}

// Activity event item component
function ActivityEventItem({ event }: { event: ActivityEvent }) {
  const Icon = typeIcons[event.type] || Info
  const colorClass = typeColors[event.type] || typeColors.assistant

  const formatContent = () => {
    if (event.type === 'tool_use') {
      return (
        <div className="space-y-1">
          <span className="text-xs bg-gray-100 dark:bg-gray-800 px-2 py-0.5 rounded">
            {event.tool_name}
          </span>
          {event.tool_input && (
            <pre className="text-xs text-gray-600 dark:text-gray-400 overflow-x-auto max-w-full max-h-20 overflow-y-auto bg-gray-50 dark:bg-gray-900 p-2 rounded">
              {JSON.stringify(event.tool_input, null, 2)}
            </pre>
          )}
        </div>
      )
    }

    if (event.type === 'tool_result') {
      return (
        <pre className="text-xs text-gray-600 dark:text-gray-400 overflow-x-auto max-w-full max-h-20 overflow-y-auto bg-gray-50 dark:bg-gray-900 p-2 rounded">
          {event.tool_result || 'No result'}
        </pre>
      )
    }

    return (
      <p className="text-sm text-gray-900 dark:text-white whitespace-pre-wrap break-words line-clamp-3">
        {event.content || 'No content'}
      </p>
    )
  }

  return (
    <div className="flex items-start gap-2 p-2 bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700">
      <div className={cn('w-6 h-6 rounded flex items-center justify-center shrink-0', colorClass)}>
        <Icon className="w-3 h-3" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1">
          <span className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">
            {event.type.replace('_', ' ')}
          </span>
          <span className="text-xs text-gray-400 dark:text-gray-500">
            {new Date(event.timestamp).toLocaleTimeString()}
          </span>
        </div>
        {formatContent()}
      </div>
    </div>
  )
}

// Session detail panel (top section)
function SessionDetailPanel() {
  const { activeSessionId } = useClaudeCodeActivityStore()
  const { sessions } = useClaudeSessionsStore()

  const selectedSession = sessions.find((s) => s.session_id === activeSessionId)

  if (!selectedSession) {
    return (
      <div className="flex items-center justify-center h-full text-gray-500 dark:text-gray-400">
        <Info className="w-5 h-5 mr-2" />
        Select a session to view details
      </div>
    )
  }

  return (
    <div className="p-4 space-y-4">
      {/* Session Header */}
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-lg bg-primary-100 dark:bg-primary-900/30 flex items-center justify-center">
          <Terminal className="w-5 h-5 text-primary-600 dark:text-primary-400" />
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="font-semibold text-gray-900 dark:text-white truncate">
            {selectedSession.project_name || 'Unknown Project'}
          </h3>
          <p className="text-xs text-gray-500 dark:text-gray-400 truncate">
            {selectedSession.slug || selectedSession.session_id}
          </p>
        </div>
        <div className="flex items-center gap-1">
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500"></span>
          </span>
          <span className="text-xs text-green-600 dark:text-green-400 capitalize">
            {selectedSession.status}
          </span>
        </div>
      </div>

      {/* Summary */}
      {selectedSession.summary && (
        <div>
          <label className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">
            Summary
          </label>
          <p className="mt-1 text-sm text-gray-900 dark:text-white">
            {selectedSession.summary}
          </p>
        </div>
      )}

      {/* Stats Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="bg-gray-50 dark:bg-gray-800/50 rounded-lg p-2 text-center">
          <Clock className="w-4 h-4 mx-auto text-gray-400 mb-1" />
          <p className="text-xs text-gray-500 dark:text-gray-400">Last Activity</p>
          <p className="text-sm font-medium text-gray-900 dark:text-white">
            {new Date(selectedSession.last_activity).toLocaleTimeString()}
          </p>
        </div>
        <div className="bg-gray-50 dark:bg-gray-800/50 rounded-lg p-2 text-center">
          <MessageSquare className="w-4 h-4 mx-auto text-blue-400 mb-1" />
          <p className="text-xs text-gray-500 dark:text-gray-400">Messages</p>
          <p className="text-sm font-medium text-gray-900 dark:text-white">
            {selectedSession.message_count}
          </p>
        </div>
        <div className="bg-gray-50 dark:bg-gray-800/50 rounded-lg p-2 text-center">
          <Wrench className="w-4 h-4 mx-auto text-green-400 mb-1" />
          <p className="text-xs text-gray-500 dark:text-gray-400">Tool Calls</p>
          <p className="text-sm font-medium text-gray-900 dark:text-white">
            {selectedSession.tool_call_count}
          </p>
        </div>
        <div className="bg-gray-50 dark:bg-gray-800/50 rounded-lg p-2 text-center">
          <DollarSign className="w-4 h-4 mx-auto text-amber-400 mb-1" />
          <p className="text-xs text-gray-500 dark:text-gray-400">Cost</p>
          <p className="text-sm font-medium text-amber-600 dark:text-amber-400">
            ${selectedSession.estimated_cost.toFixed(3)}
          </p>
        </div>
      </div>
    </div>
  )
}

// Activity log panel (bottom section)
function ActivityLogPanel() {
  const { activeSessionId, activities, isLoadingActivity } = useClaudeCodeActivityStore()

  if (!activeSessionId) {
    return (
      <div className="flex items-center justify-center h-full text-gray-500 dark:text-gray-400">
        <Info className="w-5 h-5 mr-2" />
        Select a session to view activity
      </div>
    )
  }

  if (isLoadingActivity) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="w-6 h-6 text-gray-400 animate-spin" />
      </div>
    )
  }

  if (activities.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-gray-500 dark:text-gray-400">
        <Info className="w-8 h-8 mb-2 opacity-50" />
        <p className="text-sm">No activity in this session</p>
      </div>
    )
  }

  return (
    <div className="p-3 space-y-2 overflow-y-auto h-full">
      {activities.map((event) => (
        <ActivityEventItem key={event.id} event={event} />
      ))}
    </div>
  )
}

export function ClaudeCodeTasks() {
  const {
    activeSessionId,
    error,
    setActiveSession,
    clearError,
  } = useClaudeCodeActivityStore()

  return (
    <div className="flex-1 flex overflow-hidden min-w-0">
      {/* Left Panel - Session List */}
      <div className="w-1/3 min-w-0 border-r border-gray-200 dark:border-gray-700 flex flex-col">
        {/* Error Display */}
        {error && (
          <div className="px-4 py-2 bg-red-50 dark:bg-red-900/20 border-b border-red-200 dark:border-red-800">
            <div className="flex items-center justify-between">
              <span className="text-sm text-red-600 dark:text-red-400">{error}</span>
              <button
                onClick={clearError}
                className="text-xs text-red-500 hover:text-red-700 dark:hover:text-red-300"
              >
                Dismiss
              </button>
            </div>
          </div>
        )}

        {/* Session Selector */}
        <div className="p-4 flex-1 overflow-y-auto overflow-x-hidden">
          <ClaudeCodeSessionSelector
            selectedSessionId={activeSessionId}
            onSelect={setActiveSession}
          />
        </div>
      </div>

      {/* Right Panel - Session Details (top) + Activity Log (bottom) */}
      <div className="w-2/3 min-w-0 flex flex-col overflow-hidden">
        {activeSessionId ? (
          <VerticalSplitPanel
            storageKey="claude-tasks-split-height"
            defaultTopHeight={35}
            minTopHeight={20}
            maxTopHeight={60}
            topContent={<SessionDetailPanel />}
            bottomContent={<ActivityLogPanel />}
          />
        ) : (
          <div className="flex-1 flex items-center justify-center text-gray-500 dark:text-gray-400">
            <Info className="w-5 h-5 mr-2" />
            Select a session to view details
          </div>
        )}
      </div>
    </div>
  )
}
