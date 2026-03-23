import { useEffect } from 'react'
import { useOrchestrationStore } from '../stores/orchestration'
import { useClaudeSessionsStore } from '../stores/claudeSessions'
import { Users, Terminal, FolderOpen, MessageSquare, Zap } from 'lucide-react'
import { CostMonitor } from '../components/CostMonitor'
import { ClaudeUsageDashboard } from '../components/usage/ClaudeUsageDashboard'
import { ConfigStatsCard, ConfigChartCard } from '../components/ProjectConfigStats'
import { ProcessMonitorWidget } from '../components/ProcessMonitorWidget'
import { useNavigationStore } from '../stores/navigation'

function formatTimeAgo(date: Date): string {
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffMin = Math.floor(diffMs / 60000)
  if (diffMin < 1) return 'Just now'
  if (diffMin < 60) return `${diffMin}m ago`
  const diffHr = Math.floor(diffMin / 60)
  if (diffHr < 24) return `${diffHr}h ago`
  const diffDay = Math.floor(diffHr / 24)
  return `${diffDay}d ago`
}

export function DashboardPage() {
  const agents = useOrchestrationStore(s => s.agents)
  const sessions = useClaudeSessionsStore(s => s.sessions)
  const fetchSessions = useClaudeSessionsStore(s => s.fetchSessions)
  const isLoadingSessions = useClaudeSessionsStore(s => s.isLoading)
  const selectSession = useClaudeSessionsStore(s => s.selectSession)
  const setView = useNavigationStore(s => s.setView)

  // Fetch Claude Code sessions on mount
  useEffect(() => {
    fetchSessions()
  }, [fetchSessions])

  const agentStats = Object.values(agents).reduce(
    (acc, agent) => {
      acc.total++
      if (agent.status === 'in_progress') acc.active++
      else acc.idle++
      return acc
    },
    { total: 0, active: 0, idle: 0 }
  )

  // Session-based stats
  const activeSessions = sessions.filter(s => s.status === 'active').length
  const uniqueProjects = new Set(sessions.filter(s => s.project_name && s.project_name !== '-').map(s => s.project_name)).size
  const totalMessages = sessions.reduce((sum, s) => sum + (s.message_count || 0), 0)
  const lastSession = sessions.length > 0 ? sessions[0] : null
  const lastActivityText = lastSession
    ? formatTimeAgo(new Date(lastSession.last_activity))
    : 'No sessions'

  // Get recent Claude Code sessions (top 10 by last activity)
  const recentSessions = sessions.slice(0, 10)

  return (
    <div className="flex-1 p-6 overflow-y-auto">

      {/* Stats Grid - Claude Sessions Overview */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        {/* Total Sessions */}
        <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-500 dark:text-gray-400">Total Sessions</p>
              <p className="text-2xl font-bold text-gray-900 dark:text-white">{sessions.length}</p>
            </div>
            <div className="w-10 h-10 bg-primary-100 dark:bg-primary-900/30 rounded-lg flex items-center justify-center">
              <Terminal className="w-5 h-5 text-primary-600 dark:text-primary-400" />
            </div>
          </div>
        </div>

        {/* Active Sessions */}
        <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-500 dark:text-gray-400">Active Sessions</p>
              <p className="text-2xl font-bold text-green-600 dark:text-green-400">{activeSessions}</p>
            </div>
            <div className="w-10 h-10 bg-green-100 dark:bg-green-900/30 rounded-lg flex items-center justify-center">
              <Zap className="w-5 h-5 text-green-600 dark:text-green-400" />
            </div>
          </div>
        </div>

        {/* Projects */}
        <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-500 dark:text-gray-400">Session Projects</p>
              <p className="text-2xl font-bold text-blue-600 dark:text-blue-400">{uniqueProjects}</p>
            </div>
            <div className="w-10 h-10 bg-blue-100 dark:bg-blue-900/30 rounded-lg flex items-center justify-center">
              <FolderOpen className="w-5 h-5 text-blue-600 dark:text-blue-400" />
            </div>
          </div>
        </div>

        {/* Total Messages / Last Activity */}
        <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-500 dark:text-gray-400">Session Messages</p>
              <p className="text-2xl font-bold text-purple-600 dark:text-purple-400">{totalMessages.toLocaleString()}</p>
              <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">{lastActivityText}</p>
            </div>
            <div className="w-10 h-10 bg-purple-100 dark:bg-purple-900/30 rounded-lg flex items-center justify-center">
              <MessageSquare className="w-5 h-5 text-purple-600 dark:text-purple-400" />
            </div>
          </div>
        </div>
      </div>

      {/* Agent Stats, Cost Monitor, Claude Usage & Recent Activity */}
      <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-4 gap-6 items-start">
        {/* Column 1: Agent Status + Process Monitor + Cost Monitor (stacked) */}
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

          {/* Process Monitor */}
          <ProcessMonitorWidget />

          {/* Cost Monitor */}
          <CostMonitor />
        </div>

        {/* Column 2-3: Claude Code Usage + Config Stats (spans 2 columns) */}
        <div className="xl:col-span-2 space-y-4">
          <ClaudeUsageDashboard />
          <ConfigStatsCard />
          <ConfigChartCard />
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
                  className="p-2 rounded-lg bg-gray-50 dark:bg-gray-700/50 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors cursor-pointer"
                  onClick={() => {
                    selectSession(session.session_id)
                    setView('claude-sessions')
                  }}
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
                    {session.project_name && session.project_name !== '-' && (
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
    </div>
  )
}
