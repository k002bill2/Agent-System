/**
 * Claude Code Tasks component
 *
 * Displays tasks extracted from TaskCreate/TaskUpdate tool calls
 * in a Claude Code session.
 */

import { useState } from 'react'
import { useClaudeCodeActivityStore } from '../stores/claudeCodeActivity'
import { ClaudeCodeSessionSelector } from './ClaudeCodeSessionSelector'
import { cn } from '../lib/utils'
import {
  ChevronRight,
  ChevronDown,
  CheckCircle,
  Clock,
  AlertCircle,
  Circle,
  Loader2,
  Info,
  ListTodo,
} from 'lucide-react'
import type { ClaudeCodeTask, ClaudeCodeTaskStatus } from '../types/claudeCodeActivity'

const statusIcons: Record<ClaudeCodeTaskStatus, typeof CheckCircle> = {
  pending: Circle,
  in_progress: Clock,
  completed: CheckCircle,
  failed: AlertCircle,
}

const statusColors: Record<ClaudeCodeTaskStatus, string> = {
  pending: 'text-gray-400',
  in_progress: 'text-blue-500',
  completed: 'text-green-500',
  failed: 'text-red-500',
}

interface TaskNodeProps {
  task: ClaudeCodeTask
  tasks: Record<string, ClaudeCodeTask>
  level?: number
  selectedTaskId: string | null
  onSelect: (id: string) => void
}

function TaskNode({
  task,
  tasks,
  level = 0,
  selectedTaskId,
  onSelect,
}: TaskNodeProps) {
  const [expanded, setExpanded] = useState(true)
  const hasChildren = task.children.length > 0
  const isInProgress = task.status === 'in_progress'
  const StatusIcon = isInProgress ? Loader2 : statusIcons[task.status]

  return (
    <div>
      <div
        className={cn(
          'flex items-center gap-2 px-3 py-2 rounded-lg cursor-pointer transition-colors',
          selectedTaskId === task.id
            ? 'bg-primary-50 dark:bg-primary-900/20'
            : 'hover:bg-gray-100 dark:hover:bg-gray-700'
        )}
        style={{ paddingLeft: `${level * 16 + 12}px` }}
        onClick={() => onSelect(task.id)}
      >
        {hasChildren ? (
          <button
            onClick={(e) => {
              e.stopPropagation()
              setExpanded(!expanded)
            }}
            className="p-0.5 hover:bg-gray-200 dark:hover:bg-gray-600 rounded"
          >
            {expanded ? (
              <ChevronDown className="w-4 h-4 text-gray-500" />
            ) : (
              <ChevronRight className="w-4 h-4 text-gray-500" />
            )}
          </button>
        ) : (
          <div className="w-5" />
        )}
        <StatusIcon
          className={cn(
            'w-4 h-4',
            statusColors[task.status],
            isInProgress && 'animate-spin'
          )}
        />
        <span className="flex-1 text-sm text-gray-900 dark:text-white truncate">
          {task.title}
        </span>
      </div>
      {hasChildren && expanded && (
        <div>
          {task.children.map((childId) => {
            const childTask = tasks[childId]
            if (!childTask) return null
            return (
              <TaskNode
                key={childId}
                task={childTask}
                tasks={tasks}
                level={level + 1}
                selectedTaskId={selectedTaskId}
                onSelect={onSelect}
              />
            )
          })}
        </div>
      )}
    </div>
  )
}

function TaskDetailPanel({ task }: { task: ClaudeCodeTask }) {
  const StatusIcon = task.status === 'in_progress' ? Loader2 : statusIcons[task.status]

  return (
    <div className="p-6 space-y-4">
      <div>
        <label className="text-sm font-medium text-gray-500 dark:text-gray-400">
          Status
        </label>
        <div className="flex items-center gap-2 mt-1">
          <StatusIcon
            className={cn(
              'w-4 h-4',
              statusColors[task.status],
              task.status === 'in_progress' && 'animate-spin'
            )}
          />
          <span className="text-gray-900 dark:text-white capitalize">
            {task.status.replace('_', ' ')}
          </span>
        </div>
      </div>

      {task.active_form && (
        <div>
          <label className="text-sm font-medium text-gray-500 dark:text-gray-400">
            Active Form
          </label>
          <p className="mt-1 text-sm text-blue-600 dark:text-blue-400 flex items-center gap-2">
            <Loader2 className="w-4 h-4 animate-spin" />
            {task.active_form}
          </p>
        </div>
      )}

      <div>
        <label className="text-sm font-medium text-gray-500 dark:text-gray-400">
          Description
        </label>
        <p className="mt-1 text-gray-900 dark:text-white whitespace-pre-wrap text-sm">
          {task.description || 'No description'}
        </p>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="text-sm font-medium text-gray-500 dark:text-gray-400">
            Created
          </label>
          <p className="mt-1 text-xs text-gray-900 dark:text-white">
            {new Date(task.created_at).toLocaleString()}
          </p>
        </div>
        <div>
          <label className="text-sm font-medium text-gray-500 dark:text-gray-400">
            Updated
          </label>
          <p className="mt-1 text-xs text-gray-900 dark:text-white">
            {new Date(task.updated_at).toLocaleString()}
          </p>
        </div>
      </div>
    </div>
  )
}

export function ClaudeCodeTasks() {
  const {
    activeSessionId,
    tasks,
    rootTaskIds,
    isLoadingTasks,
    error,
    setActiveSession,
    clearError,
  } = useClaudeCodeActivityStore()

  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null)
  const selectedTask = selectedTaskId ? tasks[selectedTaskId] : null

  return (
    <div className="flex-1 flex overflow-hidden">
      {/* Left Panel - Task Tree */}
      <div className="w-1/2 border-r border-gray-200 dark:border-gray-700 flex flex-col">
        {/* Session Selector */}
        <div className="p-4 border-b border-gray-200 dark:border-gray-700">
          <ClaudeCodeSessionSelector
            selectedSessionId={activeSessionId}
            onSelect={setActiveSession}
          />
        </div>

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

        {/* Task Tree */}
        <div className="flex-1 overflow-y-auto p-2">
          {!activeSessionId ? (
            <div className="flex flex-col items-center justify-center py-12 text-gray-500 dark:text-gray-400">
              <ListTodo className="w-12 h-12 mb-4 opacity-50" />
              <p>Select a Claude Code session</p>
              <p className="text-sm mt-1">Tasks will appear here</p>
            </div>
          ) : isLoadingTasks ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-8 h-8 text-gray-400 animate-spin" />
            </div>
          ) : rootTaskIds.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-gray-500 dark:text-gray-400">
              <ListTodo className="w-12 h-12 mb-4 opacity-50" />
              <p>No tasks in this session</p>
              <p className="text-sm mt-1">Tasks created with TaskCreate will appear here</p>
            </div>
          ) : (
            rootTaskIds.map((taskId) => {
              const task = tasks[taskId]
              if (!task) return null
              return (
                <TaskNode
                  key={taskId}
                  task={task}
                  tasks={tasks}
                  selectedTaskId={selectedTaskId}
                  onSelect={setSelectedTaskId}
                />
              )
            })
          )}
        </div>
      </div>

      {/* Right Panel - Task Details */}
      <div className="w-1/2 flex flex-col overflow-hidden">
        {selectedTask ? (
          <>
            <div className="px-4 py-3 border-b border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800">
              <h3 className="text-base font-semibold text-gray-900 dark:text-white truncate">
                {selectedTask.title}
              </h3>
            </div>
            <div className="flex-1 overflow-y-auto">
              <TaskDetailPanel task={selectedTask} />
            </div>
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center text-gray-500 dark:text-gray-400">
            <Info className="w-5 h-5 mr-2" />
            Select a task to view details
          </div>
        )}
      </div>
    </div>
  )
}
