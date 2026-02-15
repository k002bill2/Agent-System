import { useState, useEffect, useRef, useMemo } from 'react'
import {
  Clock,
  Terminal,
  CheckSquare,
  AlertTriangle,
  Activity,
  TrendingUp,
  RefreshCw,
  BarChart3,
  ArrowUpRight,
  ArrowDownRight,
  Minus,
} from 'lucide-react'
import { AuditLogTable } from '../components/audit/AuditLogTable'
import { useAuditStore } from '../stores/audit'
import { useOrchestrationStore } from '../stores/orchestration'
import { cn } from '../lib/utils'

export function AuditPage() {
  const { sessionId, projects, fetchProjects } = useOrchestrationStore()
  const [filterBySession, setFilterBySession] = useState(false)
  const [selectedProjectId, setSelectedProjectId] = useState<string>('')
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
    if (projects.length === 0) fetchProjects()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Handle session/project filter toggle - skip first mount
  useEffect(() => {
    if (isFirstMount.current) {
      isFirstMount.current = false
      return
    }

    const newFilter: Record<string, string> = {}
    if (filterBySession && sessionId) {
      newFilter.session_id = sessionId
    }
    if (selectedProjectId) {
      newFilter.project_id = selectedProjectId
    }

    if (Object.keys(newFilter).length > 0) {
      setFilter(newFilter)
      fetchStats(filterBySession ? sessionId || undefined : undefined)
    } else {
      clearFilter()
      fetchStats()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filterBySession, sessionId, selectedProjectId])

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
          {/* Project filter */}
          <select
            value={selectedProjectId}
            onChange={(e) => setSelectedProjectId(e.target.value)}
            className="px-3 py-1.5 text-sm rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300"
          >
            <option value="">All Projects</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>

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

          {/* Session filter toggle */}
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

      {/* Activity & Type Breakdown - Redesigned */}
      {(stats?.recent_trend?.length || stats?.actions_by_type) && (
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-4 mb-6">
          {/* Recent Activity - Area Chart */}
          {stats?.recent_trend && stats.recent_trend.length > 0 && (
            <div className="lg:col-span-3 bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-5">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2.5">
                  <div className="p-1.5 bg-blue-50 dark:bg-blue-900/30 rounded-lg">
                    <TrendingUp className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                  </div>
                  <div>
                    <h3 className="font-semibold text-gray-900 dark:text-white text-sm">Recent Activity</h3>
                    <p className="text-xs text-gray-500 dark:text-gray-400">Last {stats.recent_trend.length} days</p>
                  </div>
                </div>
                <TrendIndicator trend={stats.recent_trend} />
              </div>

              {stats.recent_trend.length === 1 ? (
                <div className="flex items-center justify-center py-6">
                  <div className="text-center">
                    <p className="text-4xl font-bold text-blue-600 dark:text-blue-400">
                      {stats.recent_trend[0].count}
                    </p>
                    <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                      {new Date(stats.recent_trend[0].date).toLocaleDateString('ko-KR', {
                        year: 'numeric', month: 'long', day: 'numeric'
                      })}
                    </p>
                  </div>
                </div>
              ) : (
                <ActivityChart trend={stats.recent_trend} />
              )}
            </div>
          )}

          {/* Action Breakdown - Horizontal Bar Chart */}
          {stats?.actions_by_type && Object.keys(stats.actions_by_type).length > 0 && (
            <div className="lg:col-span-2 bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-5">
              <div className="flex items-center gap-2.5 mb-4">
                <div className="p-1.5 bg-purple-50 dark:bg-purple-900/30 rounded-lg">
                  <BarChart3 className="w-4 h-4 text-purple-600 dark:text-purple-400" />
                </div>
                <div>
                  <h3 className="font-semibold text-gray-900 dark:text-white text-sm">Actions by Type</h3>
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    {Object.keys(stats.actions_by_type).length} types
                  </p>
                </div>
              </div>
              <ActionBreakdown data={stats.actions_by_type} />
            </div>
          )}
        </div>
      )}

      {/* Audit Log Table */}
      <AuditLogTable
        sessionId={filterBySession ? sessionId || undefined : undefined}
        projectId={selectedProjectId || undefined}
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

// --- Recent Activity Sub-components ---

/** SVG area chart for activity trend */
function ActivityChart({ trend }: { trend: { date: string; count: number }[] }) {
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null)

  const chartWidth = 100
  const chartHeight = 40
  const padding = { top: 2, bottom: 0, left: 0, right: 0 }
  const innerW = chartWidth - padding.left - padding.right
  const innerH = chartHeight - padding.top - padding.bottom

  const maxCount = Math.max(...trend.map(t => t.count), 1)

  const points = trend.map((item, idx) => ({
    x: padding.left + (idx / Math.max(trend.length - 1, 1)) * innerW,
    y: padding.top + innerH - (item.count / maxCount) * innerH,
    ...item,
  }))

  // Smooth path using cubic bezier
  const linePath = points.reduce((path, p, i) => {
    if (i === 0) return `M ${p.x} ${p.y}`
    const prev = points[i - 1]
    const cpx = (prev.x + p.x) / 2
    return `${path} C ${cpx} ${prev.y}, ${cpx} ${p.y}, ${p.x} ${p.y}`
  }, '')

  const areaPath = `${linePath} L ${points[points.length - 1].x} ${chartHeight} L ${points[0].x} ${chartHeight} Z`

  return (
    <div>
      {/* Chart area with relative positioning for overlays */}
      <div className="relative">
        <svg
          viewBox={`0 0 ${chartWidth} ${chartHeight}`}
          className="w-full h-28"
          preserveAspectRatio="none"
          onMouseLeave={() => setHoveredIdx(null)}
        >
          <defs>
            <linearGradient id="areaGradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="rgb(59, 130, 246)" stopOpacity="0.3" />
              <stop offset="100%" stopColor="rgb(59, 130, 246)" stopOpacity="0.02" />
            </linearGradient>
            <linearGradient id="lineGradient" x1="0" y1="0" x2="1" y2="0">
              <stop offset="0%" stopColor="rgb(96, 165, 250)" />
              <stop offset="100%" stopColor="rgb(59, 130, 246)" />
            </linearGradient>
          </defs>

          {/* Area fill */}
          <path d={areaPath} fill="url(#areaGradient)" />

          {/* Line */}
          <path
            d={linePath}
            fill="none"
            stroke="url(#lineGradient)"
            strokeWidth="0.6"
            strokeLinecap="round"
            strokeLinejoin="round"
          />

          {/* Interactive hit areas */}
          {points.map((p, idx) => (
            <rect
              key={idx}
              x={idx === 0 ? 0 : (points[idx - 1].x + p.x) / 2}
              y={0}
              width={
                idx === 0
                  ? (points[1]?.x ?? chartWidth) / 2
                  : idx === points.length - 1
                    ? chartWidth - (points[idx - 1].x + p.x) / 2
                    : ((points[idx + 1]?.x ?? p.x) - (points[idx - 1]?.x ?? p.x)) / 2
              }
              height={chartHeight}
              fill="transparent"
              onMouseEnter={() => setHoveredIdx(idx)}
              className="cursor-crosshair"
            />
          ))}

          {/* Vertical guide line */}
          {hoveredIdx !== null && points[hoveredIdx] && (
            <line
              x1={points[hoveredIdx].x}
              y1={0}
              x2={points[hoveredIdx].x}
              y2={chartHeight}
              stroke="rgb(59, 130, 246)"
              strokeWidth="0.3"
              strokeDasharray="1 1"
              opacity={0.5}
            />
          )}
        </svg>

        {/* Hover dot - HTML element for perfect circle (SVG distorts due to preserveAspectRatio=none) */}
        {hoveredIdx !== null && points[hoveredIdx] && (
          <div
            className="absolute pointer-events-none z-10 w-3 h-3 rounded-full bg-white border-2 border-blue-500 shadow-md shadow-blue-500/30"
            style={{
              left: `${(points[hoveredIdx].x / chartWidth) * 100}%`,
              top: `${(points[hoveredIdx].y / chartHeight) * 100}%`,
              transform: 'translate(-50%, -50%)',
            }}
          />
        )}

        {/* Tooltip */}
        {hoveredIdx !== null && points[hoveredIdx] && (
          <div
            className="absolute -top-2 pointer-events-none z-20 bg-gray-900 dark:bg-gray-700 text-white text-xs rounded-lg px-2.5 py-1.5 shadow-lg"
            style={{
              left: `clamp(40px, ${(points[hoveredIdx].x / chartWidth) * 100}%, calc(100% - 40px))`,
              transform: 'translate(-50%, -100%)',
            }}
          >
            <p className="font-semibold">{points[hoveredIdx].count.toLocaleString()} actions</p>
            <p className="text-gray-300 text-[10px]">
              {new Date(points[hoveredIdx].date).toLocaleDateString('ko-KR', {
                month: 'long', day: 'numeric'
              })}
            </p>
          </div>
        )}
      </div>

      {/* X-axis labels */}
      <div className="flex justify-between mt-1.5 px-0.5">
        {trend.map((item, idx) => {
          // Show only first, middle, last labels to avoid clutter
          const showLabel = idx === 0 || idx === trend.length - 1 || idx === Math.floor(trend.length / 2)
          return (
            <span
              key={idx}
              className={cn(
                'text-[10px] text-gray-400 dark:text-gray-500',
                !showLabel && 'invisible',
                hoveredIdx === idx && 'text-blue-500 dark:text-blue-400 font-medium'
              )}
            >
              {new Date(item.date).toLocaleDateString('ko-KR', { month: 'numeric', day: 'numeric' })}
            </span>
          )
        })}
      </div>
    </div>
  )
}

/** Trend indicator showing percent change */
function TrendIndicator({ trend }: { trend: { date: string; count: number }[] }) {
  const trendInfo = useMemo(() => {
    if (trend.length < 2) return null
    const mid = Math.floor(trend.length / 2)
    const firstHalf = trend.slice(0, mid).reduce((s, t) => s + t.count, 0)
    const secondHalf = trend.slice(mid).reduce((s, t) => s + t.count, 0)
    if (firstHalf === 0 && secondHalf === 0) return { change: 0, direction: 'flat' as const }
    if (firstHalf === 0) return { change: 100, direction: 'up' as const }
    const change = Math.round(((secondHalf - firstHalf) / firstHalf) * 100)
    return {
      change: Math.abs(change),
      direction: change > 0 ? 'up' as const : change < 0 ? 'down' as const : 'flat' as const,
    }
  }, [trend])

  if (!trendInfo) return null

  const config = {
    up: { icon: ArrowUpRight, color: 'text-emerald-600 dark:text-emerald-400', bg: 'bg-emerald-50 dark:bg-emerald-900/30' },
    down: { icon: ArrowDownRight, color: 'text-red-500 dark:text-red-400', bg: 'bg-red-50 dark:bg-red-900/30' },
    flat: { icon: Minus, color: 'text-gray-500 dark:text-gray-400', bg: 'bg-gray-50 dark:bg-gray-700' },
  }
  const { icon: Icon, color, bg } = config[trendInfo.direction]

  return (
    <div className={cn('flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium', bg, color)}>
      <Icon className="w-3 h-3" />
      <span>{trendInfo.change}%</span>
    </div>
  )
}

/** Color palette for action breakdown bars */
const breakdownColors = [
  { bar: 'bg-blue-500', text: 'text-blue-700 dark:text-blue-300' },
  { bar: 'bg-purple-500', text: 'text-purple-700 dark:text-purple-300' },
  { bar: 'bg-emerald-500', text: 'text-emerald-700 dark:text-emerald-300' },
  { bar: 'bg-amber-500', text: 'text-amber-700 dark:text-amber-300' },
  { bar: 'bg-rose-500', text: 'text-rose-700 dark:text-rose-300' },
  { bar: 'bg-cyan-500', text: 'text-cyan-700 dark:text-cyan-300' },
  { bar: 'bg-indigo-500', text: 'text-indigo-700 dark:text-indigo-300' },
  { bar: 'bg-orange-500', text: 'text-orange-700 dark:text-orange-300' },
]

/** Horizontal bar chart for action type breakdown */
function ActionBreakdown({ data }: { data: Record<string, number> }) {
  const sorted = Object.entries(data).sort((a, b) => b[1] - a[1]).slice(0, 6)
  const maxVal = sorted[0]?.[1] ?? 1
  const total = sorted.reduce((s, [, v]) => s + v, 0)

  return (
    <div className="space-y-2.5">
      {sorted.map(([action, count], idx) => {
        const pct = Math.round((count / total) * 100)
        const barWidth = (count / maxVal) * 100
        const color = breakdownColors[idx % breakdownColors.length]

        return (
          <div key={action} className="group">
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs text-gray-600 dark:text-gray-400 truncate max-w-[60%] capitalize">
                {action.replace(/_/g, ' ')}
              </span>
              <div className="flex items-center gap-2">
                <span className={cn('text-xs font-semibold tabular-nums', color.text)}>
                  {count.toLocaleString()}
                </span>
                <span className="text-[10px] text-gray-400 dark:text-gray-500 w-8 text-right tabular-nums">
                  {pct}%
                </span>
              </div>
            </div>
            <div className="h-1.5 bg-gray-100 dark:bg-gray-700 rounded-full overflow-hidden">
              <div
                className={cn(
                  'h-full rounded-full transition-all duration-500 ease-out',
                  color.bar,
                  'group-hover:opacity-80'
                )}
                style={{ width: `${barWidth}%` }}
              />
            </div>
          </div>
        )
      })}
    </div>
  )
}

export default AuditPage
