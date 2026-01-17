import { useState } from 'react'
import { useOrchestrationStore, Task, TaskStatus } from '../stores/orchestration'
import { useNavigationStore } from '../stores/navigation'
import { cn } from '../lib/utils'
import { VerticalSplitPanel } from '../components/VerticalSplitPanel'
import { ProjectFilter, ProjectBadge } from '../components/ProjectFilter'
import {
  ChevronRight,
  ChevronDown,
  CheckCircle,
  Clock,
  AlertCircle,
  Circle,
  XCircle,
  Filter,
  SplitSquareVertical,
} from 'lucide-react'

const statusFilters: { label: string; value: TaskStatus | 'all' }[] = [
  { label: 'All', value: 'all' },
  { label: 'Pending', value: 'pending' },
  { label: 'In Progress', value: 'in_progress' },
  { label: 'Completed', value: 'completed' },
  { label: 'Failed', value: 'failed' },
]

const statusIcons: Record<TaskStatus, typeof CheckCircle> = {
  pending: Circle,
  in_progress: Clock,
  completed: CheckCircle,
  failed: AlertCircle,
  cancelled: XCircle,
}

const statusColors: Record<TaskStatus, string> = {
  pending: 'text-gray-400',
  in_progress: 'text-blue-500',
  completed: 'text-green-500',
  failed: 'text-red-500',
  cancelled: 'text-gray-500',
}

function TaskNode({
  task,
  tasks,
  level = 0,
  selectedTaskId,
  onSelect,
  sessionProjectId,
  showProjectBadge = false,
}: {
  task: Task
  tasks: Record<string, Task>
  level?: number
  selectedTaskId: string | null
  onSelect: (id: string) => void
  sessionProjectId: string | null
  showProjectBadge?: boolean
}) {
  const [expanded, setExpanded] = useState(true)
  const hasChildren = task.children.length > 0
  const StatusIcon = statusIcons[task.status] || Circle

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
        <StatusIcon className={cn('w-4 h-4', statusColors[task.status])} />
        <span className="flex-1 text-sm text-gray-900 dark:text-white truncate">{task.title}</span>
        {showProjectBadge && level === 0 && (
          <ProjectBadge projectId={sessionProjectId} />
        )}
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
                sessionProjectId={sessionProjectId}
                showProjectBadge={showProjectBadge}
              />
            )
          })}
        </div>
      )}
    </div>
  )
}

export function TasksPage() {
  const { tasks, sessionProjectId } = useOrchestrationStore()
  const { projectFilter } = useNavigationStore()
  const [filter, setFilter] = useState<TaskStatus | 'all'>('all')
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null)
  const [isSplitMode, setIsSplitMode] = useState(true)

  const taskList = Object.values(tasks)
  const rootTasks = taskList.filter((t) => t.parentId === null)

  // 프로젝트 필터 적용 (현재는 단일 세션이므로 sessionProjectId로 필터)
  const projectFilteredTasks = projectFilter
    ? rootTasks.filter(() => sessionProjectId === projectFilter)
    : rootTasks

  const filteredRootTasks =
    filter === 'all' ? projectFilteredTasks : projectFilteredTasks.filter((t) => t.status === filter)

  const selectedTask = selectedTaskId ? tasks[selectedTaskId] : null

  const renderStatusIcon = (status: TaskStatus) => {
    const IconComponent = statusIcons[status] || Circle
    return <IconComponent className={cn('w-4 h-4', statusColors[status] || 'text-gray-400')} />
  }

  return (
    <div className="flex-1 flex overflow-hidden">
      <div className="w-1/2 border-r border-gray-200 dark:border-gray-700 flex flex-col">
        <div className="p-4 border-b border-gray-200 dark:border-gray-700">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-2">
              <Filter className="w-4 h-4 text-gray-500" />
              <div className="flex gap-1">
                {statusFilters.map((f) => (
                  <button
                    key={f.value}
                    onClick={() => setFilter(f.value)}
                    className={cn(
                      'px-2 py-1 text-xs rounded-md transition-colors',
                      filter === f.value
                        ? 'bg-primary-100 text-primary-700 dark:bg-primary-900/30 dark:text-primary-400'
                        : 'text-gray-600 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-700'
                    )}
                  >
                    {f.label}
                  </button>
                ))}
              </div>
            </div>
            <ProjectFilter />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-2">
          {filteredRootTasks.length === 0 ? (
            <div className="p-4 text-center text-gray-500 dark:text-gray-400">
              No tasks found
            </div>
          ) : (
            filteredRootTasks.map((task) => (
              <TaskNode
                key={task.id}
                task={task}
                tasks={tasks}
                selectedTaskId={selectedTaskId}
                onSelect={setSelectedTaskId}
                sessionProjectId={sessionProjectId}
                showProjectBadge={!projectFilter}
              />
            ))
          )}
        </div>
      </div>

      <div className="w-1/2 flex flex-col overflow-hidden">
        {selectedTask ? (
          <>
            {/* Split Mode Toggle Header */}
            <div className="flex items-center justify-between px-4 py-2 border-b border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800">
              <h3 className="text-base font-semibold text-gray-900 dark:text-white truncate flex-1">
                {selectedTask.title}
              </h3>
              <button
                onClick={() => setIsSplitMode(!isSplitMode)}
                className={cn(
                  'p-1.5 rounded transition-colors ml-2',
                  isSplitMode
                    ? 'bg-primary-100 text-primary-600 dark:bg-primary-900/30 dark:text-primary-400'
                    : 'hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-500'
                )}
                title={isSplitMode ? 'Split 모드 끄기' : 'Split 모드 켜기'}
              >
                <SplitSquareVertical className="w-4 h-4" />
              </button>
            </div>

            {isSplitMode ? (
              <VerticalSplitPanel
                storageKey="task-detail-split-height"
                defaultTopHeight={45}
                minTopHeight={25}
                maxTopHeight={75}
                topContent={
                  <div className="p-4 space-y-4">
                    <div>
                      <label className="text-sm font-medium text-gray-500 dark:text-gray-400">
                        Status
                      </label>
                      <div className="flex items-center gap-2 mt-1">
                        {renderStatusIcon(selectedTask.status)}
                        <span className="text-gray-900 dark:text-white capitalize">
                          {selectedTask.status.replace('_', ' ')}
                        </span>
                      </div>
                    </div>

                    <div>
                      <label className="text-sm font-medium text-gray-500 dark:text-gray-400">
                        Description
                      </label>
                      <p className="mt-1 text-gray-900 dark:text-white whitespace-pre-wrap text-sm">
                        {selectedTask.description || 'No description'}
                      </p>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="text-sm font-medium text-gray-500 dark:text-gray-400">
                          Created
                        </label>
                        <p className="mt-1 text-xs text-gray-900 dark:text-white">
                          {new Date(selectedTask.createdAt).toLocaleString()}
                        </p>
                      </div>
                      <div>
                        <label className="text-sm font-medium text-gray-500 dark:text-gray-400">
                          Updated
                        </label>
                        <p className="mt-1 text-xs text-gray-900 dark:text-white">
                          {new Date(selectedTask.updatedAt).toLocaleString()}
                        </p>
                      </div>
                    </div>
                  </div>
                }
                bottomContent={
                  <div className="p-4 space-y-4">
                    {selectedTask.error && (
                      <div>
                        <label className="text-sm font-medium text-red-500">Error</label>
                        <p className="mt-1 text-red-600 dark:text-red-400 text-sm bg-red-50 dark:bg-red-900/20 p-3 rounded-lg">
                          {selectedTask.error}
                        </p>
                      </div>
                    )}

                    {selectedTask.result !== undefined && selectedTask.result !== null ? (
                      <pre className="text-sm text-gray-900 dark:text-white bg-gray-50 dark:bg-gray-900 p-3 rounded-lg overflow-x-auto">
                        {JSON.stringify(selectedTask.result, null, 2)}
                      </pre>
                    ) : (
                      <div className="flex items-center justify-center h-full text-gray-400 dark:text-gray-500 text-sm">
                        결과 없음
                      </div>
                    )}
                  </div>
                }
              />
            ) : (
              /* Single Panel Mode */
              <div className="flex-1 overflow-y-auto p-6">
                <div className="space-y-4">
                  <div>
                    <label className="text-sm font-medium text-gray-500 dark:text-gray-400">
                      Status
                    </label>
                    <div className="flex items-center gap-2 mt-1">
                      {renderStatusIcon(selectedTask.status)}
                      <span className="text-gray-900 dark:text-white capitalize">
                        {selectedTask.status.replace('_', ' ')}
                      </span>
                    </div>
                  </div>

                  <div>
                    <label className="text-sm font-medium text-gray-500 dark:text-gray-400">
                      Description
                    </label>
                    <p className="mt-1 text-gray-900 dark:text-white whitespace-pre-wrap">
                      {selectedTask.description || 'No description'}
                    </p>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="text-sm font-medium text-gray-500 dark:text-gray-400">
                        Created
                      </label>
                      <p className="mt-1 text-sm text-gray-900 dark:text-white">
                        {new Date(selectedTask.createdAt).toLocaleString()}
                      </p>
                    </div>
                    <div>
                      <label className="text-sm font-medium text-gray-500 dark:text-gray-400">
                        Updated
                      </label>
                      <p className="mt-1 text-sm text-gray-900 dark:text-white">
                        {new Date(selectedTask.updatedAt).toLocaleString()}
                      </p>
                    </div>
                  </div>

                  {selectedTask.error && (
                    <div>
                      <label className="text-sm font-medium text-red-500">Error</label>
                      <p className="mt-1 text-red-600 dark:text-red-400 text-sm bg-red-50 dark:bg-red-900/20 p-3 rounded-lg">
                        {selectedTask.error}
                      </p>
                    </div>
                  )}

                  {selectedTask.result !== undefined && selectedTask.result !== null && (
                    <div>
                      <label className="text-sm font-medium text-gray-500 dark:text-gray-400">
                        Result
                      </label>
                      <pre className="mt-1 text-sm text-gray-900 dark:text-white bg-gray-50 dark:bg-gray-900 p-3 rounded-lg overflow-x-auto">
                        {JSON.stringify(selectedTask.result, null, 2)}
                      </pre>
                    </div>
                  )}
                </div>
              </div>
            )}
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center text-gray-500 dark:text-gray-400">
            Select a task to view details
          </div>
        )}
      </div>
    </div>
  )
}
