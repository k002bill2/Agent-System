import { useOrchestrationStore, TaskStatus } from '../stores/orchestration'
import { useNavigationStore } from '../stores/navigation'
import { cn } from '../lib/utils'
import { ProjectFilter, ProjectBadge } from '../components/ProjectFilter'
import { Bot, CheckCircle, Clock, AlertCircle, Circle, XCircle } from 'lucide-react'

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

const statusBgColors: Record<TaskStatus, string> = {
  pending: 'bg-gray-100 dark:bg-gray-700',
  in_progress: 'bg-blue-100 dark:bg-blue-900/30',
  completed: 'bg-green-100 dark:bg-green-900/30',
  failed: 'bg-red-100 dark:bg-red-900/30',
  cancelled: 'bg-gray-100 dark:bg-gray-700',
}

export function AgentsPage() {
  const { agents, tasks, activeAgentId, sessionProjectId } = useOrchestrationStore()
  const { projectFilter } = useNavigationStore()

  const agentList = Object.values(agents)

  // 프로젝트 필터 적용 (현재는 단일 세션이므로 sessionProjectId로 필터)
  const filteredAgentList = projectFilter
    ? (sessionProjectId === projectFilter ? agentList : [])
    : agentList

  return (
    <div className="flex-1 p-6 overflow-y-auto">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-xl font-semibold text-gray-900 dark:text-white">Agents</h2>
        <ProjectFilter />
      </div>

      {filteredAgentList.length === 0 ? (
        <div className="text-center py-12 text-gray-500 dark:text-gray-400">
          <Bot className="w-12 h-12 mx-auto mb-4 opacity-50" />
          <p>No agents available</p>
          <p className="text-sm mt-1">Agents will appear here when they are active</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredAgentList.map((agent) => {
            const Icon = statusIcons[agent.status]
            const currentTask = agent.currentTask ? tasks[agent.currentTask] : null
            const isActive = activeAgentId === agent.id

            return (
              <div
                key={agent.id}
                className={cn(
                  'bg-white dark:bg-gray-800 rounded-lg border p-4 transition-all',
                  isActive
                    ? 'border-primary-500 ring-2 ring-primary-500/20'
                    : 'border-gray-200 dark:border-gray-700'
                )}
              >
                {/* Header */}
                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-center gap-3">
                    <div
                      className={cn(
                        'w-10 h-10 rounded-lg flex items-center justify-center',
                        statusBgColors[agent.status]
                      )}
                    >
                      <Bot className={cn('w-5 h-5', statusColors[agent.status])} />
                    </div>
                    <div>
                      <h3 className="font-medium text-gray-900 dark:text-white">{agent.name}</h3>
                      <p className="text-sm text-gray-500 dark:text-gray-400">{agent.role}</p>
                    </div>
                  </div>
                  <div className="flex flex-col items-end gap-1">
                    {isActive && (
                      <span className="px-2 py-1 bg-primary-100 dark:bg-primary-900/30 text-primary-700 dark:text-primary-400 text-xs font-medium rounded-full">
                        Active
                      </span>
                    )}
                    {!projectFilter && <ProjectBadge projectId={sessionProjectId} />}
                  </div>
                </div>

                {/* Status */}
                <div className="flex items-center gap-2 mb-3">
                  <Icon className={cn('w-4 h-4', statusColors[agent.status])} />
                  <span className="text-sm text-gray-600 dark:text-gray-400 capitalize">
                    {agent.status.replace('_', ' ')}
                  </span>
                </div>

                {/* Current Task */}
                {currentTask && (
                  <div className="bg-gray-50 dark:bg-gray-900 rounded-lg p-3">
                    <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">Current Task</p>
                    <p className="text-sm text-gray-900 dark:text-white truncate">
                      {currentTask.title}
                    </p>
                  </div>
                )}

                {!currentTask && agent.status === 'in_progress' && (
                  <div className="bg-gray-50 dark:bg-gray-900 rounded-lg p-3">
                    <p className="text-xs text-gray-500 dark:text-gray-400">Processing...</p>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
