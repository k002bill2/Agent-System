import { useOrchestrationStore } from '../stores/orchestration'
import { Activity, CheckCircle, Clock, AlertCircle, Users, Zap } from 'lucide-react'
import { CostMonitor } from '../components/CostMonitor'
import { ClaudeUsageDashboard } from '../components/usage/ClaudeUsageDashboard'

export function DashboardPage() {
  const { sessionId, connected, tasks, agents, messages } = useOrchestrationStore()

  // Filter out deleted tasks for statistics
  const activeTasks = Object.values(tasks).filter((t) => !t.isDeleted)

  const taskStats = activeTasks.reduce(
    (acc, task) => {
      acc.total++
      if (task.status === 'completed') acc.completed++
      else if (task.status === 'in_progress') acc.inProgress++
      else if (task.status === 'failed') acc.failed++
      else acc.pending++
      return acc
    },
    { total: 0, completed: 0, inProgress: 0, failed: 0, pending: 0 }
  )

  const agentStats = Object.values(agents).reduce(
    (acc, agent) => {
      acc.total++
      if (agent.status === 'in_progress') acc.active++
      else acc.idle++
      return acc
    },
    { total: 0, active: 0, idle: 0 }
  )

  const recentMessages = messages.slice(-5).reverse()

  return (
    <div className="flex-1 p-6 overflow-y-auto">
      {/* Session Info */}
      <div className="mb-6">
        <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-2">Dashboard</h2>
        <div className="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400">
          <div className={`w-2 h-2 rounded-full ${connected ? 'bg-green-500' : 'bg-gray-400'}`} />
          <span>{connected ? 'Connected' : 'Disconnected'}</span>
          {sessionId && (
            <>
              <span className="mx-2">|</span>
              <span>Session: {sessionId.slice(0, 8)}...</span>
            </>
          )}
        </div>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        {/* Total Tasks */}
        <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-500 dark:text-gray-400">Total Tasks</p>
              <p className="text-2xl font-bold text-gray-900 dark:text-white">{taskStats.total}</p>
            </div>
            <div className="w-10 h-10 bg-primary-100 dark:bg-primary-900/30 rounded-lg flex items-center justify-center">
              <Activity className="w-5 h-5 text-primary-600 dark:text-primary-400" />
            </div>
          </div>
        </div>

        {/* In Progress */}
        <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-500 dark:text-gray-400">In Progress</p>
              <p className="text-2xl font-bold text-blue-600 dark:text-blue-400">{taskStats.inProgress}</p>
            </div>
            <div className="w-10 h-10 bg-blue-100 dark:bg-blue-900/30 rounded-lg flex items-center justify-center">
              <Clock className="w-5 h-5 text-blue-600 dark:text-blue-400" />
            </div>
          </div>
        </div>

        {/* Completed */}
        <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-500 dark:text-gray-400">Completed</p>
              <p className="text-2xl font-bold text-green-600 dark:text-green-400">{taskStats.completed}</p>
            </div>
            <div className="w-10 h-10 bg-green-100 dark:bg-green-900/30 rounded-lg flex items-center justify-center">
              <CheckCircle className="w-5 h-5 text-green-600 dark:text-green-400" />
            </div>
          </div>
        </div>

        {/* Failed */}
        <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-500 dark:text-gray-400">Failed</p>
              <p className="text-2xl font-bold text-red-600 dark:text-red-400">{taskStats.failed}</p>
            </div>
            <div className="w-10 h-10 bg-red-100 dark:bg-red-900/30 rounded-lg flex items-center justify-center">
              <AlertCircle className="w-5 h-5 text-red-600 dark:text-red-400" />
            </div>
          </div>
        </div>
      </div>

      {/* Agent Stats, Cost Monitor, Claude Usage & Recent Activity */}
      <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-4 gap-6">
        {/* Agent Status */}
        <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
            <Users className="w-5 h-5" />
            Agent Status
          </h3>
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-600 dark:text-gray-400">Total Agents</span>
              <span className="font-medium text-gray-900 dark:text-white">{agentStats.total}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-600 dark:text-gray-400">Active</span>
              <span className="font-medium text-green-600 dark:text-green-400">{agentStats.active}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-600 dark:text-gray-400">Idle</span>
              <span className="font-medium text-gray-500 dark:text-gray-400">{agentStats.idle}</span>
            </div>
          </div>
        </div>

        {/* Cost Monitor */}
        <CostMonitor />

        {/* Claude Code Usage */}
        <ClaudeUsageDashboard />

        {/* Recent Activity */}
        <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
            <Zap className="w-5 h-5" />
            Recent Activity
          </h3>
          {recentMessages.length === 0 ? (
            <p className="text-sm text-gray-500 dark:text-gray-400">No recent activity</p>
          ) : (
            <div className="space-y-2">
              {recentMessages.map((msg) => (
                <div key={msg.id} className="text-sm">
                  <span className="text-gray-400 dark:text-gray-500">
                    {new Date(msg.timestamp).toLocaleTimeString()}
                  </span>
                  <span className="mx-2 text-gray-300 dark:text-gray-600">|</span>
                  <span className="text-gray-700 dark:text-gray-300 line-clamp-1">{msg.content}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
