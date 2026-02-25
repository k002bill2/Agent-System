/**
 * Task Board component
 *
 * Displays tasks grouped by status (Pending, In Progress, Completed, Failed)
 * with collapsible groups and task cards.
 */

import { useClaudeCodeActivityStore } from '../stores/claudeCodeActivity'
import { useClaudeSessionsStore } from '../stores/claudeSessions'
import { cn } from '../lib/utils'
import {
  Clock,
  Loader2,
  CheckCircle2,
  XCircle,
  ChevronDown,
  ChevronRight,
  Info,
  Terminal,
  MessageSquare,
  Wrench,
  DollarSign,
  ListTodo,
  User,
  FileCode,
  GitBranch,
  Search,
  PenTool,
  TerminalSquare,
} from 'lucide-react'
import { useMemo, useState } from 'react'
import type { ActivityEvent, ClaudeCodeTask, ClaudeCodeTaskStatus } from '../types/claudeCodeActivity'

const statusConfig: Record<
  ClaudeCodeTaskStatus,
  { label: string; icon: typeof Clock; color: string; bgColor: string; badgeColor: string }
> = {
  pending: {
    label: 'Pending',
    icon: Clock,
    color: 'text-gray-500',
    bgColor: 'bg-gray-50 dark:bg-gray-800/50',
    badgeColor: 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300',
  },
  in_progress: {
    label: 'In Progress',
    icon: Loader2,
    color: 'text-blue-500',
    bgColor: 'bg-blue-50 dark:bg-blue-900/20',
    badgeColor: 'bg-blue-100 text-blue-600 dark:bg-blue-900/40 dark:text-blue-300',
  },
  completed: {
    label: 'Completed',
    icon: CheckCircle2,
    color: 'text-green-500',
    bgColor: 'bg-green-50 dark:bg-green-900/20',
    badgeColor: 'bg-green-100 text-green-600 dark:bg-green-900/40 dark:text-green-300',
  },
  failed: {
    label: 'Failed',
    icon: XCircle,
    color: 'text-red-500',
    bgColor: 'bg-red-50 dark:bg-red-900/20',
    badgeColor: 'bg-red-100 text-red-600 dark:bg-red-900/40 dark:text-red-300',
  },
}

const STATUS_ORDER: ClaudeCodeTaskStatus[] = ['in_progress', 'pending', 'completed', 'failed']

function TaskCard({ task, allTasks }: { task: ClaudeCodeTask; allTasks: Record<string, ClaudeCodeTask> }) {
  const config = statusConfig[task.status]
  const parentTask = task.parent_id ? allTasks[task.parent_id] : null
  const childCount = task.children.length

  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-3 hover:border-gray-300 dark:hover:border-gray-600 transition-colors">
      {/* Header: title + status badge */}
      <div className="flex items-start gap-2">
        <div className="flex-1 min-w-0">
          <h4 className="text-sm font-medium text-gray-900 dark:text-white truncate">
            {task.title}
          </h4>
          {task.description && (
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1 line-clamp-2">
              {task.description}
            </p>
          )}
        </div>
        <span className={cn('px-2 py-0.5 rounded-full text-xs font-medium shrink-0', config.badgeColor)}>
          {config.label}
        </span>
      </div>

      {/* Meta info */}
      <div className="flex items-center gap-3 mt-2 text-xs text-gray-400 dark:text-gray-500">
        <span>{new Date(task.updated_at).toLocaleTimeString()}</span>
        {task.active_form && task.status === 'in_progress' && (
          <span className="text-blue-400 dark:text-blue-500 italic truncate">
            {task.active_form}
          </span>
        )}
      </div>

      {/* Relationships */}
      {(parentTask || childCount > 0) && (
        <div className="flex items-center gap-3 mt-2 text-xs text-gray-400 dark:text-gray-500">
          {parentTask && (
            <span className="truncate" title={`Parent: ${parentTask.title}`}>
              Parent: {parentTask.title}
            </span>
          )}
          {childCount > 0 && (
            <span>{childCount} subtask{childCount > 1 ? 's' : ''}</span>
          )}
        </div>
      )}
    </div>
  )
}

function StatusGroup({
  status,
  tasks,
  allTasks,
  defaultExpanded = true,
}: {
  status: ClaudeCodeTaskStatus
  tasks: ClaudeCodeTask[]
  allTasks: Record<string, ClaudeCodeTask>
  defaultExpanded?: boolean
}) {
  const [expanded, setExpanded] = useState(defaultExpanded)
  const config = statusConfig[status]
  const Icon = config.icon

  if (tasks.length === 0) return null

  return (
    <div className="mb-4">
      {/* Group header */}
      <button
        onClick={() => setExpanded(!expanded)}
        className={cn(
          'w-full flex items-center gap-2 px-3 py-2 rounded-lg transition-colors',
          config.bgColor,
          'hover:opacity-80'
        )}
      >
        {expanded ? (
          <ChevronDown className="w-4 h-4 text-gray-400 shrink-0" />
        ) : (
          <ChevronRight className="w-4 h-4 text-gray-400 shrink-0" />
        )}
        <Icon className={cn('w-4 h-4 shrink-0', config.color, status === 'in_progress' && 'animate-spin')} />
        <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
          {config.label}
        </span>
        <span className={cn('ml-auto px-2 py-0.5 rounded-full text-xs font-medium', config.badgeColor)}>
          {tasks.length}
        </span>
      </button>

      {/* Task cards */}
      {expanded && (
        <div className="mt-2 space-y-2 pl-2">
          {tasks.map((task) => (
            <TaskCard key={task.id} task={task} allTasks={allTasks} />
          ))}
        </div>
      )}
    </div>
  )
}

/** Session detail card shown above the task board */
function SessionDetailCard() {
  const { activeSessionId } = useClaudeCodeActivityStore()
  const { sessions } = useClaudeSessionsStore()

  const session = sessions.find((s) => s.session_id === activeSessionId)

  if (!session) return null

  return (
    <div className="p-4 border-b border-gray-200 dark:border-gray-700">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-lg bg-primary-100 dark:bg-primary-900/30 flex items-center justify-center">
          <Terminal className="w-5 h-5 text-primary-600 dark:text-primary-400" />
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="font-semibold text-gray-900 dark:text-white truncate">
            {session.project_name || 'Unknown Project'}
          </h3>
          <p className="text-xs text-gray-500 dark:text-gray-400 font-mono truncate">
            {session.slug || session.session_id}
          </p>
        </div>
        <div className="flex items-center gap-1">
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />
            <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500" />
          </span>
          <span className="text-xs text-green-600 dark:text-green-400 capitalize">
            {session.status}
          </span>
        </div>
      </div>

      {session.summary && (
        <p className="mt-2 text-sm text-gray-700 dark:text-gray-300">{session.summary}</p>
      )}

      {/* Stats */}
      <div className="grid grid-cols-4 gap-2 mt-3">
        <div className="bg-gray-50 dark:bg-gray-800/50 rounded-lg p-2 text-center">
          <Clock className="w-3.5 h-3.5 mx-auto text-gray-400 mb-0.5" />
          <p className="text-xs text-gray-500 dark:text-gray-400">Last</p>
          <p className="text-xs font-medium text-gray-900 dark:text-white">
            {new Date(session.last_activity).toLocaleTimeString()}
          </p>
        </div>
        <div className="bg-gray-50 dark:bg-gray-800/50 rounded-lg p-2 text-center">
          <MessageSquare className="w-3.5 h-3.5 mx-auto text-blue-400 mb-0.5" />
          <p className="text-xs text-gray-500 dark:text-gray-400">Msgs</p>
          <p className="text-xs font-medium text-gray-900 dark:text-white">{session.message_count}</p>
        </div>
        <div className="bg-gray-50 dark:bg-gray-800/50 rounded-lg p-2 text-center">
          <Wrench className="w-3.5 h-3.5 mx-auto text-green-400 mb-0.5" />
          <p className="text-xs text-gray-500 dark:text-gray-400">Tools</p>
          <p className="text-xs font-medium text-gray-900 dark:text-white">{session.tool_call_count}</p>
        </div>
        <div className="bg-gray-50 dark:bg-gray-800/50 rounded-lg p-2 text-center">
          <DollarSign className="w-3.5 h-3.5 mx-auto text-amber-400 mb-0.5" />
          <p className="text-xs text-gray-500 dark:text-gray-400">Cost</p>
          <p className="text-xs font-medium text-amber-600 dark:text-amber-400">
            ${session.estimated_cost.toFixed(3)}
          </p>
        </div>
      </div>
    </div>
  )
}

/** Tool icon mapping for common tools */
const toolIconMap: Record<string, typeof Wrench> = {
  Read: FileCode,
  Edit: PenTool,
  Write: PenTool,
  Grep: Search,
  Glob: Search,
  Bash: TerminalSquare,
  Task: GitBranch,
}

/** Derive tool usage stats and user prompts from activities */
function useActivitySummary(activities: ActivityEvent[]) {
  return useMemo(() => {
    const toolCounts: Record<string, number> = {}
    const userPrompts: { content: string; timestamp: string }[] = []

    for (const event of activities) {
      if (event.type === 'tool_use' && event.tool_name) {
        toolCounts[event.tool_name] = (toolCounts[event.tool_name] || 0) + 1
      }
      if (event.type === 'user' && event.content) {
        // Filter out system/internal messages (XML tags, empty commands)
        const content = event.content.trim()
        if (
          content.startsWith('<') ||
          content.length === 0
        ) {
          continue
        }
        userPrompts.push({
          content,
          timestamp: event.timestamp,
        })
      }
    }

    // Sort tools by count descending
    const sortedTools = Object.entries(toolCounts)
      .sort(([, a], [, b]) => b - a)

    return { sortedTools, userPrompts, totalToolCalls: Object.values(toolCounts).reduce((a, b) => a + b, 0) }
  }, [activities])
}

/** Shows tool usage and user prompt timeline when no explicit tasks exist */
function ActivitySummaryView() {
  const { activities } = useClaudeCodeActivityStore()
  const { sortedTools, userPrompts, totalToolCalls } = useActivitySummary(activities)

  if (activities.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center flex-1 text-gray-500 dark:text-gray-400">
        <ListTodo className="w-12 h-12 mb-4 opacity-50" />
        <p>No activity yet</p>
        <p className="text-sm mt-1">Activity will appear as the session progresses</p>
      </div>
    )
  }

  return (
    <div className="flex-1 overflow-y-auto p-4 space-y-4">
      {/* Tool Usage Summary */}
      {sortedTools.length > 0 && (
        <div>
          <h3 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2">
            Tool Usage ({totalToolCalls} calls)
          </h3>
          <div className="grid grid-cols-2 gap-2">
            {sortedTools.map(([name, count]) => {
              const Icon = toolIconMap[name] || Wrench
              return (
                <div
                  key={name}
                  className="flex items-center gap-2 bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 px-3 py-2"
                >
                  <Icon className="w-3.5 h-3.5 text-gray-400 shrink-0" />
                  <span className="text-sm text-gray-700 dark:text-gray-300 truncate font-mono">{name}</span>
                  <span className="ml-auto text-xs font-medium text-gray-500 dark:text-gray-400 bg-gray-100 dark:bg-gray-700 px-1.5 py-0.5 rounded-full">
                    {count}
                  </span>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* User Prompt Timeline */}
      {userPrompts.length > 0 && (
        <div>
          <h3 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2">
            User Prompts ({userPrompts.length})
          </h3>
          <div className="space-y-2">
            {userPrompts.map((prompt, idx) => (
              <div
                key={idx}
                className="flex items-start gap-2 bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-3"
              >
                <User className="w-4 h-4 text-blue-500 shrink-0 mt-0.5" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-gray-900 dark:text-white line-clamp-2">{prompt.content}</p>
                  <span className="text-xs text-gray-400 dark:text-gray-500">
                    {new Date(prompt.timestamp).toLocaleTimeString()}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

export function TaskBoard() {
  const { activeSessionId, tasks, isLoadingTasks } = useClaudeCodeActivityStore()

  if (!activeSessionId) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-gray-500 dark:text-gray-400">
        <Info className="w-12 h-12 mb-4 opacity-50" />
        <p>Select a Claude Code session</p>
        <p className="text-sm mt-1">Task board will appear here</p>
      </div>
    )
  }

  if (isLoadingTasks) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="w-8 h-8 text-gray-400 animate-spin" />
      </div>
    )
  }

  const taskList = Object.values(tasks)

  if (taskList.length === 0) {
    return (
      <div className="flex flex-col h-full overflow-hidden">
        <SessionDetailCard />
        <ActivitySummaryView />
      </div>
    )
  }

  // Group tasks by status
  const grouped = STATUS_ORDER.reduce(
    (acc, status) => {
      acc[status] = taskList.filter((t) => t.status === status)
      return acc
    },
    {} as Record<ClaudeCodeTaskStatus, ClaudeCodeTask[]>
  )

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <SessionDetailCard />
      <div className="flex-1 overflow-y-auto p-4">
        {STATUS_ORDER.map((status) => (
          <StatusGroup
            key={status}
            status={status}
            tasks={grouped[status]}
            allTasks={tasks}
            defaultExpanded={status === 'in_progress' || status === 'pending'}
          />
        ))}
      </div>
    </div>
  )
}
