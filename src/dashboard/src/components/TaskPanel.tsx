import { cn } from '../lib/utils'
import { useOrchestrationStore, Task, TaskStatus } from '../stores/orchestration'
import {
  CheckCircle2,
  Circle,
  Clock,
  XCircle,
  ChevronRight,
  Loader2,
} from 'lucide-react'

const statusConfig: Record<TaskStatus, { icon: typeof Circle; color: string; label: string }> = {
  pending: { icon: Circle, color: 'text-gray-400', label: 'Pending' },
  in_progress: { icon: Loader2, color: 'text-blue-500', label: 'In Progress' },
  completed: { icon: CheckCircle2, color: 'text-green-500', label: 'Completed' },
  failed: { icon: XCircle, color: 'text-red-500', label: 'Failed' },
  cancelled: { icon: XCircle, color: 'text-gray-500', label: 'Cancelled' },
}

interface TaskNodeProps {
  task: Task
  depth: number
  allTasks: Record<string, Task>
}

function TaskNode({ task, depth, allTasks }: TaskNodeProps) {
  const config = statusConfig[task.status]
  const Icon = config.icon
  const hasChildren = task.children.length > 0

  return (
    <div>
      <div
        className={cn(
          'flex items-center gap-2 px-3 py-2 hover:bg-gray-50 dark:hover:bg-gray-700/50 rounded-lg cursor-pointer transition-colors',
          depth > 0 && 'ml-6'
        )}
        style={{ paddingLeft: `${depth * 16 + 12}px` }}
      >
        {hasChildren && (
          <ChevronRight className="w-4 h-4 text-gray-400 flex-shrink-0" />
        )}
        <Icon
          className={cn(
            'w-4 h-4 flex-shrink-0',
            config.color,
            task.status === 'in_progress' && 'animate-spin'
          )}
        />
        <span className="flex-1 text-sm text-gray-900 dark:text-white truncate">
          {task.title}
        </span>
        <span className="text-xs text-gray-500 dark:text-gray-400">
          {config.label}
        </span>
      </div>

      {/* Render children */}
      {hasChildren &&
        task.children.map((childId) => {
          const childTask = allTasks[childId]
          if (!childTask) return null
          return (
            <TaskNode
              key={childId}
              task={childTask}
              depth={depth + 1}
              allTasks={allTasks}
            />
          )
        })}
    </div>
  )
}

export function TaskPanel() {
  const { tasks, rootTaskId, isProcessing } = useOrchestrationStore()
  // Filter out deleted tasks
  const taskList = Object.values(tasks).filter((t) => !t.isDeleted)
  const rootTask = rootTaskId && tasks[rootTaskId] && !tasks[rootTaskId].isDeleted
    ? tasks[rootTaskId]
    : null

  return (
    <div className="w-80 border-r border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 flex flex-col">
      {/* Header */}
      <div className="h-12 flex items-center justify-between px-4 border-b border-gray-200 dark:border-gray-700">
        <h2 className="font-medium text-gray-900 dark:text-white">Task Tree</h2>
        {isProcessing && (
          <div className="flex items-center gap-2 text-sm text-blue-600 dark:text-blue-400">
            <Loader2 className="w-4 h-4 animate-spin" />
            Processing
          </div>
        )}
      </div>

      {/* Task Tree */}
      <div className="flex-1 overflow-y-auto scrollbar-thin p-2">
        {taskList.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center px-4">
            <Clock className="w-12 h-12 text-gray-300 dark:text-gray-600 mb-3" />
            <p className="text-sm text-gray-500 dark:text-gray-400">
              No tasks yet
            </p>
            <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">
              Send a message to start orchestration
            </p>
          </div>
        ) : rootTask ? (
          <TaskNode task={rootTask} depth={0} allTasks={tasks} />
        ) : (
          taskList.map((task) => (
            <TaskNode key={task.id} task={task} depth={0} allTasks={tasks} />
          ))
        )}
      </div>

      {/* Stats */}
      <div className="h-12 border-t border-gray-200 dark:border-gray-700 flex items-center justify-around text-xs text-gray-500 dark:text-gray-400">
        <div className="flex items-center gap-1">
          <span className="w-2 h-2 rounded-full bg-gray-400" />
          {taskList.filter((t) => t.status === 'pending').length} Pending
        </div>
        <div className="flex items-center gap-1">
          <span className="w-2 h-2 rounded-full bg-blue-500" />
          {taskList.filter((t) => t.status === 'in_progress').length} Active
        </div>
        <div className="flex items-center gap-1">
          <span className="w-2 h-2 rounded-full bg-green-500" />
          {taskList.filter((t) => t.status === 'completed').length} Done
        </div>
      </div>
    </div>
  )
}
