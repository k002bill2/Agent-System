import { useState } from 'react'
import { cn } from '../lib/utils'
import { useOrchestrationStore, Task, TaskStatus } from '../stores/orchestration'
import {
  CheckCircle2,
  Circle,
  Clock,
  XCircle,
  ChevronRight,
  Loader2,
  Pause,
  Play,
} from 'lucide-react'
import { FeedbackButton } from './feedback/FeedbackButton'
import { TaskEvaluationCard } from './feedback/TaskEvaluationCard'

const statusConfig: Record<TaskStatus, { icon: typeof Circle; color: string; label: string }> = {
  pending: { icon: Circle, color: 'text-gray-400', label: 'Pending' },
  in_progress: { icon: Loader2, color: 'text-blue-500', label: 'In Progress' },
  paused: { icon: Pause, color: 'text-yellow-500', label: 'Paused' },
  completed: { icon: CheckCircle2, color: 'text-green-500', label: 'Completed' },
  failed: { icon: XCircle, color: 'text-red-500', label: 'Failed' },
  cancelled: { icon: XCircle, color: 'text-gray-500', label: 'Cancelled' },
}

interface TaskNodeProps {
  task: Task
  depth: number
  allTasks: Record<string, Task>
  sessionId: string | null
}

function TaskNode({ task, depth, allTasks, sessionId }: TaskNodeProps) {
  const pauseTask = useOrchestrationStore(s => s.pauseTask)
  const resumeTask = useOrchestrationStore(s => s.resumeTask)
  const [actionLoading, setActionLoading] = useState(false)
  const config = statusConfig[task.status]
  const Icon = config.icon
  const hasChildren = task.children.length > 0
  const showFeedback = task.status === 'completed' && sessionId

  // Can pause if pending or in_progress
  const canPause = ['pending', 'in_progress'].includes(task.status)
  // Can resume if paused
  const canResume = task.status === 'paused'

  // result를 문자열로 변환
  const getResultOutput = (): string => {
    if (!task.result) return task.description
    if (typeof task.result === 'string') return task.result
    return JSON.stringify(task.result)
  }

  const handlePause = async (e: React.MouseEvent) => {
    e.stopPropagation()
    setActionLoading(true)
    await pauseTask(task.id)
    setActionLoading(false)
  }

  const handleResume = async (e: React.MouseEvent) => {
    e.stopPropagation()
    setActionLoading(true)
    await resumeTask(task.id)
    setActionLoading(false)
  }

  return (
    <div>
      <div
        className={cn(
          'flex items-center gap-2 px-3 py-2 hover:bg-gray-50 dark:hover:bg-gray-700/50 rounded-lg cursor-pointer transition-colors group',
          depth > 0 && 'ml-6',
          task.status === 'paused' && 'bg-yellow-50 dark:bg-yellow-900/10'
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

        {/* Pause/Resume buttons */}
        {canPause && (
          <button
            onClick={handlePause}
            disabled={actionLoading}
            className="opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-yellow-100 dark:hover:bg-yellow-900/30 text-yellow-600 dark:text-yellow-400 transition-opacity"
            title="Pause task"
          >
            {actionLoading ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Pause className="w-3.5 h-3.5" />
            )}
          </button>
        )}
        {canResume && (
          <button
            onClick={handleResume}
            disabled={actionLoading}
            className="p-1 rounded hover:bg-green-100 dark:hover:bg-green-900/30 text-green-600 dark:text-green-400 transition-opacity"
            title="Resume task"
          >
            {actionLoading ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Play className="w-3.5 h-3.5" />
            )}
          </button>
        )}

        {/* Feedback Button for completed tasks */}
        {showFeedback && (
          <FeedbackButton
            sessionId={sessionId}
            taskId={task.id}
            output={getResultOutput()}
            size="sm"
          />
        )}
      </div>

      {/* Pause reason tooltip */}
      {task.pauseReason && (
        <div
          className="ml-6 text-xs text-yellow-600 dark:text-yellow-400 px-3 py-1"
          style={{ paddingLeft: `${depth * 16 + 36}px` }}
        >
          Paused: {task.pauseReason}
        </div>
      )}

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
              sessionId={sessionId}
            />
          )
        })}
    </div>
  )
}

export function TaskPanel() {
  const tasks = useOrchestrationStore(s => s.tasks)
  const rootTaskId = useOrchestrationStore(s => s.rootTaskId)
  const isProcessing = useOrchestrationStore(s => s.isProcessing)
  const sessionId = useOrchestrationStore(s => s.sessionId)
  const selectedProjectId = useOrchestrationStore(s => s.selectedProjectId)
  const projects = useOrchestrationStore(s => s.projects)
  const currentProjectName = selectedProjectId ? (projects.find(p => p.id === selectedProjectId)?.name || undefined) : undefined
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
          <TaskNode task={rootTask} depth={0} allTasks={tasks} sessionId={sessionId} />
        ) : (
          taskList.map((task) => (
            <TaskNode key={task.id} task={task} depth={0} allTasks={tasks} sessionId={sessionId} />
          ))
        )}
      </div>

      {/* Task Evaluation - shown when root task is completed */}
      {rootTask && rootTask.status === 'completed' && sessionId && (
        <div className="px-3 py-2 border-t border-gray-200 dark:border-gray-700">
          <TaskEvaluationCard sessionId={sessionId} taskId={rootTask.id} contextSummary={rootTask.description?.slice(0, 200)} projectName={currentProjectName} />
        </div>
      )}

      {/* Stats */}
      <div className="h-14 border-t border-gray-200 dark:border-gray-700 flex flex-wrap items-center justify-around gap-1 px-2 text-xs text-gray-500 dark:text-gray-400">
        <div className="flex items-center gap-1">
          <span className="w-2 h-2 rounded-full bg-gray-400" />
          {taskList.filter((t) => t.status === 'pending').length} Pending
        </div>
        <div className="flex items-center gap-1">
          <span className="w-2 h-2 rounded-full bg-blue-500" />
          {taskList.filter((t) => t.status === 'in_progress').length} Active
        </div>
        <div className="flex items-center gap-1">
          <span className="w-2 h-2 rounded-full bg-yellow-500" />
          {taskList.filter((t) => t.status === 'paused').length} Paused
        </div>
        <div className="flex items-center gap-1">
          <span className="w-2 h-2 rounded-full bg-green-500" />
          {taskList.filter((t) => t.status === 'completed').length} Done
        </div>
      </div>
    </div>
  )
}
