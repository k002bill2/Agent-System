/**
 * Claude Code Sessions - Unified View
 *
 * Combines Activity log and Task board in a single tabbed interface.
 * Left: Session selector | Right: [Activity | Tasks] tab content
 */

import { useState } from 'react'
import { useClaudeCodeActivityStore } from '../stores/claudeCodeActivity'
import { ClaudeCodeSessionSelector } from './ClaudeCodeSessionSelector'
import { TaskBoard } from './TaskBoard'
import { cn } from '../lib/utils'
import {
  User,
  Bot,
  Wrench,
  CheckCircle,
  AlertTriangle,
  Loader2,
  Info,
  Activity,
  ListTodo,
} from 'lucide-react'
import type { ActivityEvent, ActivityEventType } from '../types/claudeCodeActivity'

type TabType = 'activity' | 'tasks'

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

function ActivityEventItem({ event }: { event: ActivityEvent }) {
  const Icon = typeIcons[event.type] || Info
  const colorClass = typeColors[event.type] || typeColors.assistant

  const formatContent = () => {
    if (event.type === 'tool_use') {
      return (
        <div className="space-y-1">
          <span className="font-mono text-xs bg-gray-100 dark:bg-gray-800 px-2 py-0.5 rounded">
            {event.tool_name}
          </span>
          {event.tool_input && (
            <pre className="text-xs text-gray-600 dark:text-gray-400 overflow-x-auto max-w-full max-h-24 overflow-y-auto bg-gray-50 dark:bg-gray-900 p-2 rounded">
              {JSON.stringify(event.tool_input, null, 2)}
            </pre>
          )}
        </div>
      )
    }

    if (event.type === 'tool_result') {
      return (
        <pre className="text-xs text-gray-600 dark:text-gray-400 overflow-x-auto max-w-full max-h-24 overflow-y-auto bg-gray-50 dark:bg-gray-900 p-2 rounded">
          {event.tool_result || 'No result'}
        </pre>
      )
    }

    return (
      <p className="text-sm text-gray-900 dark:text-white whitespace-pre-wrap break-words">
        {event.content || 'No content'}
      </p>
    )
  }

  return (
    <div className="flex items-start gap-3 p-3 bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700">
      <div className={cn('w-8 h-8 rounded-lg flex items-center justify-center shrink-0', colorClass)}>
        <Icon className="w-4 h-4" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1">
          <span className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">
            {event.type.replace('_', ' ')}
          </span>
          <span className="text-gray-300 dark:text-gray-600">|</span>
          <span className="text-xs text-gray-400 dark:text-gray-500">
            {new Date(event.timestamp).toLocaleTimeString()}
          </span>
        </div>
        {formatContent()}
      </div>
    </div>
  )
}

function ActivityLog() {
  const { activeSessionId, activities, isLoadingActivity } = useClaudeCodeActivityStore()

  if (!activeSessionId) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-gray-500 dark:text-gray-400">
        <Info className="w-12 h-12 mb-4 opacity-50" />
        <p>Select a Claude Code session</p>
        <p className="text-sm mt-1">Activity events will appear here</p>
      </div>
    )
  }

  if (isLoadingActivity) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="w-8 h-8 text-gray-400 animate-spin" />
      </div>
    )
  }

  if (activities.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-gray-500 dark:text-gray-400">
        <Info className="w-12 h-12 mb-4 opacity-50" />
        <p>No activity in this session</p>
        <p className="text-sm mt-1">Events will appear as the session progresses</p>
      </div>
    )
  }

  return (
    <div className="p-4 space-y-2 overflow-y-auto h-full">
      {activities.map((event) => (
        <ActivityEventItem key={event.id} event={event} />
      ))}
    </div>
  )
}

export function ClaudeCodeActivity() {
  const [activeTab, setActiveTab] = useState<TabType>('activity')
  const {
    activeSessionId,
    activities,
    tasks,
    error,
    setActiveSession,
    clearError,
  } = useClaudeCodeActivityStore()

  const taskCount = Object.keys(tasks).length

  return (
    <div className="flex-1 flex overflow-hidden min-w-0">
      {/* Left Panel - Session Selector */}
      <div className="w-1/3 min-w-0 border-r border-gray-200 dark:border-gray-700 flex flex-col">
        <div className="p-4 flex-1 overflow-y-auto overflow-x-hidden">
          <ClaudeCodeSessionSelector
            selectedSessionId={activeSessionId}
            onSelect={setActiveSession}
          />
        </div>
      </div>

      {/* Right Panel - Tabbed Content */}
      <div className="w-2/3 min-w-0 flex flex-col overflow-hidden">
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

        {/* Tab Bar */}
        <div className="flex items-center border-b border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-4">
          <button
            onClick={() => setActiveTab('activity')}
            className={cn(
              'flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors',
              activeTab === 'activity'
                ? 'border-primary-500 text-primary-600 dark:text-primary-400'
                : 'border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300'
            )}
          >
            <Activity className="w-4 h-4" />
            Activity
            {activeSessionId && activities.length > 0 && (
              <span className="ml-1 px-1.5 py-0.5 rounded-full text-xs bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300">
                {activities.length}
              </span>
            )}
          </button>
          <button
            onClick={() => setActiveTab('tasks')}
            className={cn(
              'flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors',
              activeTab === 'tasks'
                ? 'border-primary-500 text-primary-600 dark:text-primary-400'
                : 'border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300'
            )}
          >
            <ListTodo className="w-4 h-4" />
            Tasks
            {activeSessionId && taskCount > 0 && (
              <span className="ml-1 px-1.5 py-0.5 rounded-full text-xs bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300">
                {taskCount}
              </span>
            )}
          </button>
        </div>

        {/* Tab Content */}
        <div className="flex-1 overflow-hidden">
          {activeTab === 'activity' ? <ActivityLog /> : <TaskBoard />}
        </div>
      </div>
    </div>
  )
}
