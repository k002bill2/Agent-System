import { useEffect } from 'react'
import { useOrchestrationStore } from '../stores/orchestration'
import { useClaudeSessionsStore } from '../stores/claudeSessions'
import { Activity, CheckCircle, Clock, AlertCircle, Users, Terminal } from 'lucide-react'
import { CostMonitor } from '../components/CostMonitor'
import { ClaudeUsageDashboard } from '../components/usage/ClaudeUsageDashboard'
import { ProjectConfigStats } from '../components/ProjectConfigStats'

export function DashboardPage() {
  const { tasks, agents } = useOrchestrationStore()
  const { sessions, fetchSessions, isLoading: isLoadingSessions } = useClaudeSessionsStore()

  // Fetch Claude Code sessions on mount
  useEffect(() => {
    fetchSessions()
  }, [fetchSessions])

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

  // Get recent Claude Code sessions (top 5 by last activity)
  const recentSessions = sessions.slice(0, 5)

  return (
    <div className="flex-1 p-6 overflow-y-auto">

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
      <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-4 gap-6 items-stretch">
        {/* Column 1: Agent Status + Cost Monitor (stacked) */}
        <div className="space-y-6">
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
        </div>

        {/* Column 2-3: Claude Code Usage (spans 2 columns) */}
        <div className="xl:col-span-2 h-full">
          <ClaudeUsageDashboard />
        </div>

        {/* Column 4: Recent Claude Code Sessions */}
        <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4 h-full">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
            <Terminal className="w-5 h-5" />
            Recent Sessions
          </h3>
          {isLoadingSessions ? (
            <div className="space-y-2 animate-pulse">
              {[...Array(3)].map((_, i) => (
                <div key={i} className="h-12 bg-gray-100 dark:bg-gray-700 rounded" />
              ))}
            </div>
          ) : recentSessions.length === 0 ? (
            <p className="text-sm text-gray-500 dark:text-gray-400">No recent sessions</p>
          ) : (
            <div className="space-y-2">
              {recentSessions.map((session) => (
                <div
                  key={session.session_id}
                  className="p-2 rounded-lg bg-gray-50 dark:bg-gray-700/50 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                >
                  <div className="flex items-center gap-2 mb-1">
                    {/* Status indicator */}
                    <span
                      className={`w-2 h-2 rounded-full ${
                        session.status === 'active'
                          ? 'bg-green-500 animate-pulse'
                          : session.status === 'idle'
                            ? 'bg-yellow-500'
                            : 'bg-gray-400'
                      }`}
                    />
                    <span className="text-xs text-gray-500 dark:text-gray-400">
                      {new Date(session.last_activity).toLocaleTimeString()}
                    </span>
                    {session.project_name && (
                      <span className="text-xs px-1.5 py-0.5 bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 rounded truncate max-w-[100px]">
                        {session.project_name}
                      </span>
                    )}
                  </div>
                  <p className="text-sm text-gray-700 dark:text-gray-300 line-clamp-1">
                    {session.summary || session.slug || 'No summary'}
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Project Configuration Stats */}
      <ProjectConfigStats />
    </div>
  )
}
