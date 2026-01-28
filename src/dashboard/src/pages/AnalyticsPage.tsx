/**
 * Analytics Page
 * Dashboard for viewing metrics, trends, and performance data
 */

import { useEffect, useState } from 'react'
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts'
import {
  BarChart3,
  TrendingUp,
  TrendingDown,
  DollarSign,
  Zap,
  Clock,
  RefreshCw,
  Calendar,
  Users,
  AlertTriangle,
} from 'lucide-react'
import { cn } from '../lib/utils'

// ─────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────

type TimeRange = '1h' | '24h' | '7d' | '30d' | 'all'

interface OverviewMetrics {
  total_sessions: number
  active_sessions: number
  total_tasks: number
  completed_tasks: number
  failed_tasks: number
  pending_tasks: number
  success_rate: number
  total_tokens: number
  total_cost: number
  avg_task_duration_ms: number
  approvals_pending: number
  approvals_granted: number
  approvals_denied: number
}

interface TrendDataPoint {
  timestamp: string
  value: number
  label: string
}

interface MultiTrendData {
  time_range: TimeRange
  tasks: TrendDataPoint[]
  success_rate: TrendDataPoint[]
  costs: TrendDataPoint[]
  tokens: TrendDataPoint[]
}

interface AgentPerformance {
  agent_id: string
  agent_name: string
  category: string
  total_tasks: number
  completed_tasks: number
  failed_tasks: number
  success_rate: number
  avg_duration_ms: number
  total_tokens: number
  total_cost: number
}

interface CostBreakdown {
  category: string
  value: string
  cost: number
  tokens: number
  percentage: number
}

interface CostAnalytics {
  time_range: TimeRange
  total_cost: number
  total_tokens: number
  avg_cost_per_task: number
  by_agent: CostBreakdown[]
  by_model: CostBreakdown[]
  projected_monthly: number
}

interface HeatmapCell {
  day: number
  hour: number
  value: number
}

interface ActivityHeatmap {
  cells: HeatmapCell[]
  max_value: number
  time_range: TimeRange
}

interface AnalyticsDashboard {
  overview: OverviewMetrics
  trends: MultiTrendData
  agents: { agents: AgentPerformance[]; time_range: TimeRange }
  costs: CostAnalytics
  activity: ActivityHeatmap
}

// ─────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────

const API_BASE = 'http://localhost:8000/api'

const TIME_RANGES: { label: string; value: TimeRange }[] = [
  { label: '1 Hour', value: '1h' },
  { label: '24 Hours', value: '24h' },
  { label: '7 Days', value: '7d' },
  { label: '30 Days', value: '30d' },
  { label: 'All Time', value: 'all' },
]

const CHART_COLORS = [
  '#3B82F6', // blue
  '#10B981', // green
  '#F59E0B', // amber
  '#EF4444', // red
  '#8B5CF6', // purple
  '#EC4899', // pink
  '#06B6D4', // cyan
]

const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

// ─────────────────────────────────────────────────────────────
// API
// ─────────────────────────────────────────────────────────────

async function fetchDashboard(timeRange: TimeRange): Promise<AnalyticsDashboard> {
  const res = await fetch(`${API_BASE}/analytics/dashboard?time_range=${timeRange}`)
  if (!res.ok) throw new Error('Failed to fetch analytics')
  return res.json()
}

// ─────────────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────────────

export function AnalyticsPage() {
  const [timeRange, setTimeRange] = useState<TimeRange>('7d')
  const [data, setData] = useState<AnalyticsDashboard | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    loadData()
  }, [timeRange]) // eslint-disable-line react-hooks/exhaustive-deps

  const loadData = async () => {
    try {
      setLoading(true)
      const result = await fetchDashboard(timeRange)
      setData(result)
      setError(null)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setLoading(false)
    }
  }

  if (loading && !data) {
    return (
      <div className="flex-1 p-6 flex items-center justify-center">
        <RefreshCw className="w-8 h-8 animate-spin text-gray-400" />
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex-1 p-6 flex items-center justify-center">
        <div className="text-center">
          <AlertTriangle className="w-12 h-12 text-red-500 mx-auto mb-4" />
          <p className="text-gray-600 dark:text-gray-400">{error}</p>
          <button
            onClick={loadData}
            className="mt-4 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
          >
            Retry
          </button>
        </div>
      </div>
    )
  }

  if (!data) return null

  return (
    <div className="flex-1 p-6 overflow-y-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
            <BarChart3 className="w-6 h-6" />
            Analytics Dashboard
          </h1>
          <p className="text-gray-500 dark:text-gray-400">
            Monitor performance, costs, and trends
          </p>
        </div>

        {/* Time Range Selector */}
        <div className="flex items-center gap-2">
          <Calendar className="w-4 h-4 text-gray-400" />
          <select
            value={timeRange}
            onChange={(e) => setTimeRange(e.target.value as TimeRange)}
            className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-sm"
          >
            {TIME_RANGES.map((tr) => (
              <option key={tr.value} value={tr.value}>
                {tr.label}
              </option>
            ))}
          </select>
          <button
            onClick={loadData}
            className="p-2 text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg"
          >
            <RefreshCw className={cn('w-4 h-4', loading && 'animate-spin')} />
          </button>
        </div>
      </div>

      {/* Overview Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <MetricCard
          title="Total Tasks"
          value={data.overview.total_tasks}
          icon={Zap}
          color="blue"
          subtitle={`${data.overview.completed_tasks} completed`}
        />
        <MetricCard
          title="Success Rate"
          value={`${data.overview.success_rate.toFixed(1)}%`}
          icon={data.overview.success_rate >= 90 ? TrendingUp : TrendingDown}
          color={data.overview.success_rate >= 90 ? 'green' : 'red'}
          subtitle={`${data.overview.failed_tasks} failed`}
        />
        <MetricCard
          title="Total Cost"
          value={`$${data.overview.total_cost.toFixed(2)}`}
          icon={DollarSign}
          color="amber"
          subtitle={`${formatNumber(data.overview.total_tokens)} tokens`}
        />
        <MetricCard
          title="Avg Duration"
          value={formatDuration(data.overview.avg_task_duration_ms)}
          icon={Clock}
          color="purple"
          subtitle={`${data.overview.active_sessions} active sessions`}
        />
      </div>

      {/* Charts Row 1 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
        {/* Task Trend */}
        <ChartCard title="Task Volume" icon={BarChart3}>
          <ResponsiveContainer width="100%" height={250}>
            <LineChart data={formatTrendData(data.trends.tasks)}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-gray-200 dark:stroke-gray-700" />
              <XAxis
                dataKey="label"
                tick={{ fontSize: 12 }}
                className="text-gray-500"
              />
              <YAxis tick={{ fontSize: 12 }} className="text-gray-500" />
              <Tooltip
                contentStyle={{
                  backgroundColor: 'var(--tooltip-bg, #fff)',
                  borderColor: 'var(--tooltip-border, #e5e7eb)',
                }}
              />
              <Line
                type="monotone"
                dataKey="value"
                stroke={CHART_COLORS[0]}
                strokeWidth={2}
                dot={false}
              />
            </LineChart>
          </ResponsiveContainer>
        </ChartCard>

        {/* Success Rate Trend */}
        <ChartCard title="Success Rate Trend" icon={TrendingUp}>
          <ResponsiveContainer width="100%" height={250}>
            <LineChart data={formatTrendData(data.trends.success_rate)}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-gray-200 dark:stroke-gray-700" />
              <XAxis
                dataKey="label"
                tick={{ fontSize: 12 }}
                className="text-gray-500"
              />
              <YAxis
                domain={[0, 100]}
                tick={{ fontSize: 12 }}
                className="text-gray-500"
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: 'var(--tooltip-bg, #fff)',
                  borderColor: 'var(--tooltip-border, #e5e7eb)',
                }}
                formatter={(value) => [`${Number(value).toFixed(1)}%`, 'Success Rate']}
              />
              <Line
                type="monotone"
                dataKey="value"
                stroke={CHART_COLORS[1]}
                strokeWidth={2}
                dot={false}
              />
            </LineChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>

      {/* Charts Row 2 */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
        {/* Cost by Agent */}
        <ChartCard title="Cost by Agent" icon={DollarSign}>
          <ResponsiveContainer width="100%" height={250}>
            <PieChart>
              <Pie
                data={data.costs.by_agent}
                cx="50%"
                cy="50%"
                innerRadius={60}
                outerRadius={80}
                paddingAngle={2}
                dataKey="cost"
                nameKey="value"
                label={({ value }) => `$${value.toFixed(2)}`}
              >
                {data.costs.by_agent.map((_, index) => (
                  <Cell key={index} fill={CHART_COLORS[index % CHART_COLORS.length]} />
                ))}
              </Pie>
              <Tooltip
                formatter={(value) => [`$${Number(value).toFixed(2)}`, 'Cost']}
              />
              <Legend />
            </PieChart>
          </ResponsiveContainer>
        </ChartCard>

        {/* Agent Performance */}
        <ChartCard title="Agent Performance" icon={Users} className="lg:col-span-2">
          <ResponsiveContainer width="100%" height={250}>
            <BarChart data={data.agents.agents} layout="vertical">
              <CartesianGrid strokeDasharray="3 3" className="stroke-gray-200 dark:stroke-gray-700" />
              <XAxis type="number" domain={[0, 100]} tick={{ fontSize: 12 }} />
              <YAxis
                type="category"
                dataKey="agent_name"
                width={150}
                tick={{ fontSize: 11 }}
              />
              <Tooltip
                formatter={(value) => [`${Number(value).toFixed(1)}%`, 'Success Rate']}
              />
              <Bar dataKey="success_rate" fill={CHART_COLORS[1]} radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>

      {/* Activity Heatmap */}
      <ChartCard title="Activity Heatmap" icon={Calendar} className="mb-6">
        <ActivityHeatmapChart data={data.activity} />
      </ChartCard>

      {/* Agent Table */}
      <ChartCard title="Agent Details" icon={Users}>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-gray-500 dark:text-gray-400 border-b border-gray-200 dark:border-gray-700">
                <th className="pb-3 font-medium">Agent</th>
                <th className="pb-3 font-medium text-right">Tasks</th>
                <th className="pb-3 font-medium text-right">Success</th>
                <th className="pb-3 font-medium text-right">Avg Duration</th>
                <th className="pb-3 font-medium text-right">Tokens</th>
                <th className="pb-3 font-medium text-right">Cost</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
              {data.agents.agents.map((agent) => (
                <tr key={agent.agent_id} className="text-gray-900 dark:text-white">
                  <td className="py-3">
                    <div className="font-medium">{agent.agent_name}</div>
                    <div className="text-xs text-gray-500">{agent.category}</div>
                  </td>
                  <td className="py-3 text-right">
                    <span className="text-green-600">{agent.completed_tasks}</span>
                    {' / '}
                    <span className="text-gray-500">{agent.total_tasks}</span>
                  </td>
                  <td className="py-3 text-right">
                    <span
                      className={cn(
                        agent.success_rate >= 95
                          ? 'text-green-600'
                          : agent.success_rate >= 90
                          ? 'text-yellow-600'
                          : 'text-red-600'
                      )}
                    >
                      {agent.success_rate.toFixed(1)}%
                    </span>
                  </td>
                  <td className="py-3 text-right text-gray-500">
                    {formatDuration(agent.avg_duration_ms)}
                  </td>
                  <td className="py-3 text-right text-gray-500">
                    {formatNumber(agent.total_tokens)}
                  </td>
                  <td className="py-3 text-right font-medium">
                    ${agent.total_cost.toFixed(2)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </ChartCard>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────
// Sub-components
// ─────────────────────────────────────────────────────────────

interface MetricCardProps {
  title: string
  value: string | number
  icon: typeof Zap
  color: 'blue' | 'green' | 'red' | 'amber' | 'purple'
  subtitle?: string
}

function MetricCard({ title, value, icon: Icon, color, subtitle }: MetricCardProps) {
  const colorClasses = {
    blue: 'bg-blue-100 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400',
    green: 'bg-green-100 text-green-600 dark:bg-green-900/30 dark:text-green-400',
    red: 'bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400',
    amber: 'bg-amber-100 text-amber-600 dark:bg-amber-900/30 dark:text-amber-400',
    purple: 'bg-purple-100 text-purple-600 dark:bg-purple-900/30 dark:text-purple-400',
  }

  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4">
      <div className="flex items-center justify-between mb-2">
        <span className="text-sm text-gray-500 dark:text-gray-400">{title}</span>
        <div className={cn('p-2 rounded-lg', colorClasses[color])}>
          <Icon className="w-4 h-4" />
        </div>
      </div>
      <div className="text-2xl font-bold text-gray-900 dark:text-white">{value}</div>
      {subtitle && (
        <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">{subtitle}</div>
      )}
    </div>
  )
}

interface ChartCardProps {
  title: string
  icon: typeof BarChart3
  children: React.ReactNode
  className?: string
}

function ChartCard({ title, icon: Icon, children, className }: ChartCardProps) {
  return (
    <div
      className={cn(
        'bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4',
        className
      )}
    >
      <h3 className="text-sm font-medium text-gray-900 dark:text-white flex items-center gap-2 mb-4">
        <Icon className="w-4 h-4 text-gray-400" />
        {title}
      </h3>
      {children}
    </div>
  )
}

function ActivityHeatmapChart({ data }: { data: ActivityHeatmap }) {
  const cellSize = 16

  return (
    <div className="overflow-x-auto">
      <div className="flex gap-1">
        {/* Hour labels */}
        <div className="flex flex-col gap-[2px] text-xs text-gray-500 pr-2">
          {Array.from({ length: 24 }, (_, i) => (
            <div
              key={i}
              style={{ height: cellSize }}
              className="flex items-center justify-end"
            >
              {i % 6 === 0 ? `${i}:00` : ''}
            </div>
          ))}
        </div>

        {/* Heatmap grid */}
        {Array.from({ length: 7 }, (_, day) => (
          <div key={day} className="flex flex-col gap-[2px]">
            {Array.from({ length: 24 }, (_, hour) => {
              const cell = data.cells.find((c) => c.day === day && c.hour === hour)
              const value = cell?.value || 0
              const intensity = data.max_value > 0 ? value / data.max_value : 0

              return (
                <div
                  key={hour}
                  style={{
                    width: cellSize,
                    height: cellSize,
                    backgroundColor: intensity === 0
                      ? 'var(--heatmap-empty, #e5e7eb)'
                      : `rgba(59, 130, 246, ${0.2 + intensity * 0.8})`,
                  }}
                  className="rounded-sm cursor-pointer hover:ring-2 hover:ring-blue-400"
                  title={`${DAY_LABELS[day]} ${hour}:00 - ${value} tasks`}
                />
              )
            })}
            <div className="text-xs text-gray-500 text-center mt-1">
              {DAY_LABELS[day]}
            </div>
          </div>
        ))}
      </div>

      {/* Legend */}
      <div className="flex items-center gap-2 mt-4 text-xs text-gray-500">
        <span>Less</span>
        {[0, 0.25, 0.5, 0.75, 1].map((intensity, i) => (
          <div
            key={i}
            style={{
              width: 12,
              height: 12,
              backgroundColor: intensity === 0
                ? 'var(--heatmap-empty, #e5e7eb)'
                : `rgba(59, 130, 246, ${0.2 + intensity * 0.8})`,
            }}
            className="rounded-sm"
          />
        ))}
        <span>More</span>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────
// Utilities
// ─────────────────────────────────────────────────────────────

function formatNumber(num: number): string {
  if (num >= 1_000_000) return `${(num / 1_000_000).toFixed(1)}M`
  if (num >= 1_000) return `${(num / 1_000).toFixed(1)}K`
  return num.toString()
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`
  return `${(ms / 60000).toFixed(1)}m`
}

function formatTrendData(data: TrendDataPoint[]): { label: string; value: number }[] {
  return data.map((d) => ({
    label: new Date(d.timestamp).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
    }),
    value: d.value,
  }))
}

export default AnalyticsPage
