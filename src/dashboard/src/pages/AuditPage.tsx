import { useState, useEffect, useRef } from 'react'
import {
  Clock,
  Terminal,
  CheckSquare,
  AlertTriangle,
  Activity,
  TrendingUp,
  RefreshCw,
} from 'lucide-react'
import { AuditLogTable } from '../components/audit/AuditLogTable'
import { useAuditStore } from '../stores/audit'
import { useOrchestrationStore } from '../stores/orchestration'
import { cn } from '../lib/utils'

export function AuditPage() {
  const { sessionId } = useOrchestrationStore()
  const [filterBySession, setFilterBySession] = useState(false)
  const isFirstMount = useRef(true)

  const {
    stats,
    isLoadingStats,
    fetchLogs,
    fetchStats,
    setFilter,
    clearFilter,
    refresh,
  } = useAuditStore()

  // Initial load - only run once on mount
  useEffect(() => {
    fetchLogs()
    fetchStats()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Handle session filter toggle - skip first mount
  useEffect(() => {
    if (isFirstMount.current) {
      isFirstMount.current = false
      return
    }

    if (filterBySession && sessionId) {
      setFilter({ session_id: sessionId })
      fetchStats(sessionId)
    } else {
      clearFilter()
      fetchStats()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filterBySession, sessionId])

  const handleRefresh = () => {
    refresh()
  }

  return (
    <div className="flex-1 p-6 overflow-y-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
            Audit Trail
          </h1>
          <p className="text-gray-500 dark:text-gray-400">
            Track all system actions and changes
          </p>
        </div>

        <div className="flex items-center gap-4">
          {/* Refresh button */}
          <button
            onClick={handleRefresh}
            className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
            title="Refresh"
          >
            <RefreshCw className={cn(
              'w-5 h-5 text-gray-500',
              isLoadingStats && 'animate-spin'
            )} />
          </button>

          {/* Filter toggle */}
          {sessionId && (
            <label className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-300">
              <input
                type="checkbox"
                checked={filterBySession}
                onChange={(e) => setFilterBySession(e.target.checked)}
                className="rounded border-gray-300 dark:border-gray-600"
              />
              Show only current session
            </label>
          )}
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
        <SummaryCard
          title="Total Actions"
          value={stats?.total_actions ?? 0}
          description="All recorded actions"
          icon={Activity}
          loading={isLoadingStats}
        />
        <SummaryCard
          title="Tool Executions"
          value={stats?.tool_executions ?? 0}
          description="Commands and tools"
          icon={Terminal}
          loading={isLoadingStats}
          iconColor="text-blue-500"
        />
        <SummaryCard
          title="Approvals"
          value={stats?.approvals ?? 0}
          description="HITL decisions"
          icon={CheckSquare}
          loading={isLoadingStats}
          iconColor="text-green-500"
        />
        <SummaryCard
          title="Errors"
          value={stats?.errors ?? 0}
          description="Failed operations"
          icon={AlertTriangle}
          loading={isLoadingStats}
          iconColor="text-red-500"
          valueColor={stats?.errors ? 'text-red-500' : undefined}
        />
      </div>

      {/* Activity & Type Breakdown - Side by Side */}
      {(stats?.recent_trend?.length || stats?.actions_by_type) && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-6">
          {/* Recent Activity */}
          {stats?.recent_trend && stats.recent_trend.length > 0 && (
            <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4">
              <div className="flex items-center gap-2 mb-3">
                <TrendingUp className="w-4 h-4 text-gray-500" />
                <h3 className="font-medium text-gray-900 dark:text-white text-sm">Recent Activity</h3>
              </div>
              {stats.recent_trend.length === 1 ? (
                // Single day - show summary instead of bar
                <div className="flex items-center justify-between">
                  <span className="text-gray-600 dark:text-gray-400">
                    {new Date(stats.recent_trend[0].date).toLocaleDateString('ko-KR', {
                      year: 'numeric', month: 'long', day: 'numeric'
                    })}
                  </span>
                  <span className="text-2xl font-bold text-blue-600 dark:text-blue-400">
                    {stats.recent_trend[0].count}
                    <span className="text-sm font-normal text-gray-500 ml-1">actions</span>
                  </span>
                </div>
              ) : (
                // Multiple days - show bar chart
                <div className="flex items-end gap-1 h-16">
                  {stats.recent_trend.map((item, idx) => {
                    const maxCount = Math.max(...stats.recent_trend.map(t => t.count))
                    const height = maxCount > 0 ? (item.count / maxCount) * 100 : 0
                    return (
                      <div key={idx} className="flex-1 flex flex-col items-center gap-1">
                        <div
                          className="w-full bg-blue-500 rounded-t transition-all hover:bg-blue-600"
                          style={{ height: `${height}%`, minHeight: item.count > 0 ? '4px' : '0' }}
                          title={`${item.date}: ${item.count} actions`}
                        />
                        <span className="text-[10px] text-gray-500 truncate max-w-full">
                          {new Date(item.date).toLocaleDateString('ko-KR', { month: 'numeric', day: 'numeric' })}
                        </span>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          )}

          {/* Action Breakdown */}
          {stats?.actions_by_type && Object.keys(stats.actions_by_type).length > 0 && (
            <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4">
              <h3 className="font-medium text-gray-900 dark:text-white text-sm mb-3">Actions by Type</h3>
              <div className="flex flex-wrap gap-1.5">
                {Object.entries(stats.actions_by_type)
                  .sort((a, b) => b[1] - a[1])
                  .slice(0, 8)
                  .map(([action, count]) => (
                    <span
                      key={action}
                      className="px-2 py-0.5 text-xs rounded-full bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300"
                    >
                      {action.replace(/_/g, ' ')}: <strong>{count}</strong>
                    </span>
                  ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Audit Log Table */}
      <AuditLogTable
        sessionId={filterBySession ? sessionId || undefined : undefined}
        className="shadow-sm"
      />
    </div>
  )
}

interface SummaryCardProps {
  title: string
  value: string | number
  description: string
  icon: typeof Clock
  loading?: boolean
  iconColor?: string
  valueColor?: string
}

function SummaryCard({
  title,
  value,
  description,
  icon: Icon,
  loading,
  iconColor = 'text-gray-300 dark:text-gray-600',
  valueColor = 'text-gray-900 dark:text-white',
}: SummaryCardProps) {
  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm text-gray-500 dark:text-gray-400">{title}</p>
          <p className={cn('text-2xl font-bold', valueColor)}>
            {loading ? (
              <span className="inline-block w-8 h-6 bg-gray-200 dark:bg-gray-700 animate-pulse rounded" />
            ) : (
              typeof value === 'number' ? value.toLocaleString() : value
            )}
          </p>
          <p className="text-xs text-gray-400 dark:text-gray-500">{description}</p>
        </div>
        <Icon className={cn('w-8 h-8', iconColor)} />
      </div>
    </div>
  )
}

export default AuditPage
