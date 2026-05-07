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
  AreaChart,
  Area,
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
  FolderOpen,
  GitCompare,
  ThumbsUp,
  Star,
  Gauge,
  MessageSquare,
  ChevronDown,
  ChevronRight,
  ArrowRight,
  GitBranch,
  Loader2,
  FileText,
} from 'lucide-react'
import { cn } from '../lib/utils'
import { computeHeatmapAlpha } from '../lib/heatmap'
import { useProjectsStore, Project } from '../stores/projects'
import { useClaudeUsageStore } from '../stores/claudeUsage'
import { useExternalUsageStore } from '../stores/externalUsage'
import { useAuthStore } from '../stores/auth'
import { ProjectMultiSelect } from '../components/analytics/ProjectMultiSelect'
import type { TaskAnalysisHistory } from '../stores/agents'

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
  value: number | null
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

// Multi-Project Comparison Types
interface ProjectTrendSeries {
  project_id: string
  project_name: string
  color: string
  data: TrendDataPoint[]
}

interface MultiProjectTrendsResponse {
  metric: string
  period: TimeRange
  series: ProjectTrendSeries[]
}

type CompareMetric = 'tasks' | 'tokens' | 'cost' | 'success_rate'

interface AgentEvalStats {
  agent_id: string
  avg_rating: number
  accuracy_rate: number
  speed_satisfaction_rate: number
  total_count: number
}

interface TaskEvalStats {
  avg_rating: number
  accuracy_rate: number
  speed_satisfaction_rate: number
  total_count: number
  by_agent: AgentEvalStats[]
}

interface TaskEvaluation {
  id: string
  session_id: string
  task_id: string
  rating: number
  result_accuracy: boolean
  speed_satisfaction: boolean
  comment: string | null
  agent_id: string | null
  created_at: string
}

// ─────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────

const API_BASE = import.meta.env.VITE_API_URL || '/api'

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

async function fetchDashboard(timeRange: TimeRange, projectId?: string): Promise<AnalyticsDashboard> {
  const params = new URLSearchParams({ time_range: timeRange })
  if (projectId) params.append('project_id', projectId)
  const res = await fetch(`${API_BASE}/analytics/dashboard?${params}`)
  if (!res.ok) throw new Error('Failed to fetch analytics')
  return res.json()
}

async function fetchTaskEvalStats(projectId?: string): Promise<TaskEvalStats> {
  const params = new URLSearchParams()
  if (projectId) params.set('project_id', projectId)
  const qs = params.toString()
  const res = await fetch(`${API_BASE}/feedback/task-evaluation/stats${qs ? `?${qs}` : ''}`)
  if (!res.ok) throw new Error('Failed to fetch evaluation stats')
  return res.json()
}

async function fetchTaskEvalList(
  agentId?: string,
  limit = 50,
  projectId?: string,
): Promise<TaskEvaluation[]> {
  const params = new URLSearchParams({ limit: String(limit) })
  if (agentId) params.set('agent_id', agentId)
  if (projectId) params.set('project_id', projectId)
  const res = await fetch(`${API_BASE}/feedback/task-evaluation/list?${params}`)
  if (!res.ok) throw new Error('Failed to fetch evaluation list')
  return res.json()
}

async function fetchAnalysisDetail(analysisId: string): Promise<TaskAnalysisHistory | null> {
  try {
    const res = await fetch(`${API_BASE}/agents/orchestrate/analyses/${analysisId}`)
    if (!res.ok) return null
    return res.json()
  } catch {
    return null
  }
}

// Effort level colors (matches TaskAnalyzer)
const effortColors: Record<string, string> = {
  quick: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
  medium: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400',
  thorough: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
}

// Strategy icons (matches TaskAnalyzer)
const strategyIcons: Record<string, typeof GitBranch> = {
  sequential: ArrowRight,
  parallel: Zap,
  mixed: GitBranch,
}

async function fetchMultiProjectTrends(
  projectIds: string[],
  metric: CompareMetric,
  timeRange: TimeRange
): Promise<MultiProjectTrendsResponse> {
  const params = new URLSearchParams({ metric, time_range: timeRange })
  projectIds.forEach((id) => params.append('project_ids', id))
  const res = await fetch(`${API_BASE}/analytics/trends/compare?${params}`)
  if (!res.ok) throw new Error('Failed to fetch multi-project trends')
  return res.json()
}

// ─────────────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────────────

export function AnalyticsPage() {
  const [timeRange, setTimeRange] = useState<TimeRange>('7d')
  const [selectedProjectId, setSelectedProjectId] = useState<string>('')
  const [data, setData] = useState<AnalyticsDashboard | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [lastFetchedAt, setLastFetchedAt] = useState<Date | null>(null)

  // Multi-project comparison state
  const [compareProjectIds, setCompareProjectIds] = useState<string[]>([])
  const [compareMetric, setCompareMetric] = useState<CompareMetric>('tasks')
  const [compareData, setCompareData] = useState<MultiProjectTrendsResponse | null>(null)
  const [compareLoading, setCompareLoading] = useState(false)
  const [evalStats, setEvalStats] = useState<TaskEvalStats | null>(null)
  const [evalList, setEvalList] = useState<TaskEvaluation[]>([])
  const [evalFilterAgent, setEvalFilterAgent] = useState<string>('')
  const [showEvalList, setShowEvalList] = useState(true)

  // Expandable evaluation detail state
  const [expandedEvalId, setExpandedEvalId] = useState<string | null>(null)
  const [evalDetail, setEvalDetail] = useState<TaskAnalysisHistory | null>(null)
  const [evalDetailLoading, setEvalDetailLoading] = useState(false)

  // Get projects from store
  const { projects, fetchProjects } = useProjectsStore()
  const isAdmin = useAuthStore((s) => s.user?.is_admin ?? false)
  const visibleProjects = isAdmin
    ? projects
    : projects.filter((p: Project) => p.is_active !== false)

  // Get Claude usage data from store
  const { usage: claudeUsage, fetchUsage } = useClaudeUsageStore()

  // Get external (actual API billing) usage data
  const { summary: externalSummary, fetchSummary: fetchExternalSummary } = useExternalUsageStore()

  // Fetch projects on mount
  useEffect(() => {
    fetchProjects()
  }, [fetchProjects])

  // Fetch Claude usage on mount
  useEffect(() => {
    fetchUsage()
  }, [fetchUsage])

  // Fetch external usage on mount
  useEffect(() => {
    fetchExternalSummary()
  }, [fetchExternalSummary])

  useEffect(() => {
    loadData()
  }, [timeRange, selectedProjectId]) // eslint-disable-line react-hooks/exhaustive-deps

  // 짧은 시간 범위(1h, 24h)에서만 60초 자동 폴링.
  // 백그라운드 탭에서는 정지(배터리/네트워크 절약), 큰 윈도우(7d/30d/all)는 변동성 낮아 제외.
  useEffect(() => {
    if (timeRange !== '1h' && timeRange !== '24h') return
    const id = window.setInterval(() => {
      if (!document.hidden) loadData()
    }, 60_000)
    return () => window.clearInterval(id)
  }, [timeRange, selectedProjectId]) // eslint-disable-line react-hooks/exhaustive-deps

  // Load multi-project comparison data when selection changes
  useEffect(() => {
    if (compareProjectIds.length >= 2) {
      loadCompareData()
    } else {
      setCompareData(null)
    }
  }, [compareProjectIds, compareMetric, timeRange]) // eslint-disable-line react-hooks/exhaustive-deps

  const loadData = async () => {
    try {
      setLoading(true)
      const projectIdParam = selectedProjectId || undefined
      const [result, evalResult, evalListResult] = await Promise.all([
        fetchDashboard(timeRange, projectIdParam),
        fetchTaskEvalStats(projectIdParam).catch(() => null),
        fetchTaskEvalList(evalFilterAgent || undefined, 50, projectIdParam).catch(() => []),
      ])
      setData(result)
      setEvalStats(evalResult)
      setEvalList(evalListResult)
      setError(null)
      setLastFetchedAt(new Date())
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setLoading(false)
    }
  }

  const loadCompareData = async () => {
    if (compareProjectIds.length < 2) return
    try {
      setCompareLoading(true)
      const result = await fetchMultiProjectTrends(compareProjectIds, compareMetric, timeRange)
      setCompareData(result)
    } catch (e) {
      console.error('Failed to load compare data:', e)
      setCompareData(null)
    } finally {
      setCompareLoading(false)
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

        {/* Filters */}
        <div className="flex items-center gap-4">
          {/* Project Selector */}
          <div className="flex items-center gap-2">
            <FolderOpen className="w-4 h-4 text-gray-400" />
            <select
              value={selectedProjectId}
              onChange={(e) => setSelectedProjectId(e.target.value)}
              className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-sm min-w-[160px]"
            >
              <option value="">전체 프로젝트</option>
              {visibleProjects.map((project) => (
                <option key={project.id} value={project.id}>
                  {project.name}
                </option>
              ))}
            </select>
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
          </div>

          {lastFetchedAt && (
            <span
              className="text-xs text-gray-500 dark:text-gray-400 tabular-nums"
              title={`마지막 갱신: ${lastFetchedAt.toLocaleString('ko-KR')}`}
            >
              갱신 {lastFetchedAt.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
              {(timeRange === '1h' || timeRange === '24h') && (
                <span className="ml-1 text-gray-400">· 자동 60초</span>
              )}
            </span>
          )}
          <button
            onClick={loadData}
            aria-label="새로고침"
            className="p-2 text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg"
          >
            <RefreshCw className={cn('w-4 h-4', loading && 'animate-spin')} />
          </button>
        </div>
      </div>

      {/* Overview Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <MetricCard
          title="Total Sessions"
          value={data.overview.total_sessions}
          icon={Zap}
          color="blue"
          subtitle={`${data.overview.completed_tasks} completed, ${data.overview.total_tasks} tool calls`}
        />
        <MetricCard
          title="Success Rate"
          value={`${data.overview.success_rate.toFixed(1)}%`}
          icon={data.overview.success_rate >= 90 ? TrendingUp : TrendingDown}
          color={data.overview.success_rate >= 90 ? 'green' : 'red'}
          subtitle={`${data.overview.failed_tasks} failed`}
        />
        <CostComparisonCard
          estimatedCost={data.overview.total_cost}
          estimatedTokens={data.overview.total_tokens}
          actualCost={externalSummary?.total_cost_usd ?? null}
        />
        <MetricCard
          title="Avg Duration"
          value={formatDuration(data.overview.avg_task_duration_ms)}
          icon={Clock}
          color="purple"
          subtitle={`${data.overview.active_sessions} active sessions`}
        />
      </div>

      {/* User Feedback Stats */}
      {evalStats && evalStats.total_count > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
          <MetricCard
            title="평가 수"
            value={evalStats.total_count}
            icon={ThumbsUp}
            color="blue"
            subtitle="총 평가 횟수"
          />
          <MetricCard
            title="평균 만족도"
            value={`${evalStats.avg_rating.toFixed(1)} / 5`}
            icon={Star}
            color={evalStats.avg_rating >= 4 ? 'green' : evalStats.avg_rating >= 3 ? 'amber' : 'red'}
            subtitle={`${(evalStats.avg_rating / 5 * 100).toFixed(0)}%`}
          />
          <MetricCard
            title="정확도"
            value={`${(evalStats.accuracy_rate * 100).toFixed(1)}%`}
            icon={TrendingUp}
            color={evalStats.accuracy_rate >= 0.8 ? 'green' : 'amber'}
            subtitle="결과가 정확했다고 응답"
          />
          <MetricCard
            title="속도 만족도"
            value={`${(evalStats.speed_satisfaction_rate * 100).toFixed(1)}%`}
            icon={Gauge}
            color={evalStats.speed_satisfaction_rate >= 0.8 ? 'green' : 'amber'}
            subtitle="속도가 적절했다고 응답"
          />
        </div>
      )}

      {/* Charts Row 1 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
        {/* Task Trend */}
        <ChartCard title="Task Volume" icon={BarChart3}>
          <ResponsiveContainer width="100%" height={250}>
            <LineChart data={formatTrendData(data.trends.tasks, timeRange)}>
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
                  borderRadius: '12px',
                  padding: '8px 12px',
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
            <LineChart data={formatTrendData(data.trends.success_rate, timeRange)}>
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
                  borderRadius: '12px',
                  padding: '8px 12px',
                }}
                formatter={(value) => [
                  value != null ? `${Number(value).toFixed(1)}%` : 'No data',
                  'Success Rate',
                ]}
              />
              <Line
                type="monotone"
                dataKey="value"
                stroke={CHART_COLORS[1]}
                strokeWidth={2}
                dot={false}
                connectNulls
              />
            </LineChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>

      {/* Token Usage Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
        {/* Token Usage Trend */}
        <ChartCard title="Token Usage Trend" icon={Zap}>
          <ResponsiveContainer width="100%" height={250}>
            <AreaChart data={formatTrendData(data.trends.tokens, timeRange)}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-gray-200 dark:stroke-gray-700" />
              <XAxis
                dataKey="label"
                tick={{ fontSize: 12 }}
                className="text-gray-500"
              />
              <YAxis
                tick={{ fontSize: 12 }}
                className="text-gray-500"
                tickFormatter={formatTokenCount}
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: 'var(--tooltip-bg, #fff)',
                  borderColor: 'var(--tooltip-border, #e5e7eb)',
                  borderRadius: '12px',
                  padding: '8px 12px',
                }}
                formatter={(value) => [formatTokenCount(Number(value)), 'Tokens']}
              />
              <Area
                type="monotone"
                dataKey="value"
                stroke={CHART_COLORS[4]}
                fill={CHART_COLORS[4]}
                fillOpacity={0.3}
              />
            </AreaChart>
          </ResponsiveContainer>
        </ChartCard>

        {/* Model Token Breakdown (Weekly) */}
        <ChartCard
          title="Model Token Breakdown (7 Days)"
          icon={Users}
          headerExtra={renderTokenSourceBadge(claudeUsage)}
        >
          {claudeUsage?.weeklyModelTokens && claudeUsage.weeklyModelTokens.length > 0 ? (
            <ResponsiveContainer width="100%" height={250}>
              <BarChart data={transformModelTokensData(claudeUsage.weeklyModelTokens)}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-gray-200 dark:stroke-gray-700" />
                <XAxis
                  dataKey="date"
                  tick={{ fontSize: 12 }}
                  className="text-gray-500"
                />
                <YAxis
                  tick={{ fontSize: 12 }}
                  className="text-gray-500"
                  tickFormatter={formatTokenCount}
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: 'var(--tooltip-bg, #fff)',
                    borderColor: 'var(--tooltip-border, #e5e7eb)',
                  }}
                  formatter={(value) => [formatTokenCount(Number(value)), 'Tokens']}
                />
                <Legend />
                {extractModelNames(claudeUsage.weeklyModelTokens).map((modelName, index) => (
                  <Bar
                    key={modelName}
                    dataKey={modelName}
                    stackId="tokens"
                    fill={CHART_COLORS[index % CHART_COLORS.length]}
                  />
                ))}
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-[250px] flex items-center justify-center text-gray-500 dark:text-gray-400">
              <div className="text-center">
                <Zap className="w-12 h-12 mx-auto mb-2 opacity-50" />
                <p>No model token data available</p>
              </div>
            </div>
          )}
        </ChartCard>
      </div>

      {/* Charts Row 2 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
        {/* Cost by Model */}
        <ChartCard title="Cost by Model" icon={DollarSign}>
          <ResponsiveContainer width="100%" height={250}>
            <PieChart>
              <Pie
                data={data.costs.by_model}
                cx="35%"
                cy="50%"
                innerRadius={70}
                outerRadius={90}
                paddingAngle={2}
                dataKey="cost"
                nameKey="value"
                label={({ value }) => `$${value.toFixed(2)}`}
              >
                {data.costs.by_model.map((_, index) => (
                  <Cell key={index} fill={CHART_COLORS[index % CHART_COLORS.length]} />
                ))}
              </Pie>
              <Tooltip
                contentStyle={{
                  backgroundColor: 'var(--tooltip-bg, #fff)',
                  borderColor: 'var(--tooltip-border, #e5e7eb)',
                  borderRadius: '12px',
                  padding: '8px 12px',
                }}
                formatter={(value) => [`$${Number(value).toFixed(2)}`, 'Cost']}
              />
              <Legend
                layout="vertical"
                align="right"
                verticalAlign="middle"
                wrapperStyle={{ fontSize: '12px', paddingLeft: '8px', left: '60%' }}
              />
            </PieChart>
          </ResponsiveContainer>
        </ChartCard>

        {/* Model Performance */}
        <ChartCard title="Model Performance" icon={Users}>
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
                contentStyle={{
                  backgroundColor: 'var(--tooltip-bg, #fff)',
                  borderColor: 'var(--tooltip-border, #e5e7eb)',
                  borderRadius: '12px',
                  padding: '8px 12px',
                }}
                formatter={(value) => [`${Number(value).toFixed(1)}%`, 'Success Rate']}
              />
              <Bar dataKey="success_rate" fill={CHART_COLORS[1]} radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>

      {/* Multi-Project Comparison + Activity Heatmap Row (3:1) */}
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6 mb-6">
      <ChartCard title="프로젝트 비교" icon={GitCompare} className="lg:col-span-3">
        <div className="space-y-4">
          {/* Controls */}
          <div className="flex flex-wrap items-center gap-4">
            <div className="flex-1 min-w-[200px]">
              <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">
                프로젝트 선택 (2-5개)
              </label>
              <ProjectMultiSelect
                projects={visibleProjects.map((p: Project) => ({ id: p.id, name: p.name }))}
                selectedIds={compareProjectIds}
                onChange={setCompareProjectIds}
                maxSelections={5}
                placeholder="비교할 프로젝트 선택..."
              />
            </div>
            <div>
              <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">
                메트릭
              </label>
              <select
                value={compareMetric}
                onChange={(e) => setCompareMetric(e.target.value as CompareMetric)}
                className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-sm min-w-[140px]"
              >
                <option value="tasks">Tasks</option>
                <option value="tokens">Tokens</option>
                <option value="cost">Cost</option>
                <option value="success_rate">Success Rate</option>
              </select>
            </div>
          </div>

          {/* Chart or Placeholder */}
          {compareProjectIds.length < 2 ? (
            <div className="h-[250px] flex items-center justify-center text-gray-500 dark:text-gray-400">
              <div className="text-center">
                <GitCompare className="w-12 h-12 mx-auto mb-2 opacity-50" />
                <p>2개 이상의 프로젝트를 선택하면 비교 차트가 표시됩니다</p>
              </div>
            </div>
          ) : compareLoading ? (
            <div className="h-[250px] flex items-center justify-center">
              <RefreshCw className="w-6 h-6 animate-spin text-gray-400" />
            </div>
          ) : compareData ? (
            <ResponsiveContainer width="100%" height={250}>
              <LineChart data={transformMultiSeriesData(compareData)}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-gray-200 dark:stroke-gray-700" />
                <XAxis
                  dataKey="date"
                  tick={{ fontSize: 12 }}
                  className="text-gray-500"
                />
                <YAxis
                  tick={{ fontSize: 12 }}
                  className="text-gray-500"
                  domain={compareMetric === 'success_rate' ? [0, 100] : ['auto', 'auto']}
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: 'var(--tooltip-bg, #fff)',
                    borderColor: 'var(--tooltip-border, #e5e7eb)',
                    borderRadius: '12px',
                    padding: '8px 12px',
                  }}
                  formatter={(value, name) => {
                    const numValue = Number(value)
                    if (compareMetric === 'cost') return [`$${numValue.toFixed(2)}`, name]
                    if (compareMetric === 'success_rate') return [`${Math.round(numValue)}%`, name]
                    if (compareMetric === 'tokens') return [formatNumber(numValue), name]
                    return [Math.round(numValue), name]
                  }}
                />
                <Legend />
                {compareData.series.map((series) => (
                  <Line
                    key={series.project_id}
                    type="monotone"
                    dataKey={series.project_id}
                    name={series.project_name}
                    stroke={series.color}
                    strokeWidth={2}
                    dot={false}
                  />
                ))}
              </LineChart>
            </ResponsiveContainer>
          ) : null}
        </div>
      </ChartCard>

      {/* Activity Heatmap */}
      <ChartCard title="Activity Heatmap" icon={Calendar} className="lg:col-span-1">
        <ActivityHeatmapChart data={data.activity} />
      </ChartCard>
      </div>

      {/* Model Details Table */}
      <ChartCard title="Model Details" icon={Users} className="mb-6">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-gray-500 dark:text-gray-400 border-b border-gray-200 dark:border-gray-700">
                <th className="pb-3 font-medium">Model</th>
                <th className="pb-3 font-medium text-right">Tasks</th>
                <th className="pb-3 font-medium text-right">Success</th>
                <th className="pb-3 font-medium text-right">Avg Duration</th>
                <th className="pb-3 font-medium text-right">Tokens</th>
                <th className="pb-3 font-medium text-right">Cost</th>
                <th className="pb-3 font-medium text-right">Rating</th>
                <th className="pb-3 font-medium text-right">Accuracy</th>
                <th className="pb-3 font-medium text-right">Evals</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
              {data.agents.agents.map((agent) => {
                const agentEval = evalStats?.by_agent?.find(
                  (a) => a.agent_id === agent.agent_id ||
                    a.agent_id === agent.agent_name.toLowerCase().replace(/\s+/g, '-')
                )
                return (
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
                    <td className="py-3 text-right">
                      {agentEval ? (
                        <span className={cn(
                          agentEval.avg_rating >= 4 ? 'text-green-600' :
                          agentEval.avg_rating >= 3 ? 'text-yellow-600' : 'text-red-600'
                        )}>
                          {agentEval.avg_rating.toFixed(1)}
                        </span>
                      ) : (
                        <span className="text-gray-400">-</span>
                      )}
                    </td>
                    <td className="py-3 text-right">
                      {agentEval ? (
                        <span className={cn(
                          agentEval.accuracy_rate >= 0.8 ? 'text-green-600' :
                          agentEval.accuracy_rate >= 0.5 ? 'text-yellow-600' : 'text-red-600'
                        )}>
                          {(agentEval.accuracy_rate * 100).toFixed(0)}%
                        </span>
                      ) : (
                        <span className="text-gray-400">-</span>
                      )}
                    </td>
                    <td className="py-3 text-right text-gray-500">
                      {agentEval ? agentEval.total_count : '-'}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </ChartCard>

      {/* Evaluation List with Comments */}
      {evalList.length > 0 && (
        <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 mb-6">
          <div
            className="flex items-center justify-between px-5 py-3 border-b border-gray-200 dark:border-gray-700 cursor-pointer"
            onClick={() => setShowEvalList(!showEvalList)}
          >
            <div className="flex items-center gap-2">
              {showEvalList ? (
                <ChevronDown className="w-4 h-4 text-gray-500" />
              ) : (
                <ChevronRight className="w-4 h-4 text-gray-500" />
              )}
              <MessageSquare className="w-4 h-4 text-blue-500" />
              <h3 className="text-sm font-semibold text-gray-900 dark:text-white">
                최근 평가 ({evalList.length})
              </h3>
            </div>
            {/* Agent filter */}
            <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
              <select
                value={evalFilterAgent}
                onChange={(e) => {
                  setEvalFilterAgent(e.target.value)
                  fetchTaskEvalList(e.target.value || undefined, 50, selectedProjectId || undefined).then(setEvalList).catch(() => {})
                }}
                className="text-xs px-2 py-1 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
              >
                <option value="">전체 에이전트</option>
                {Array.from(new Set(evalList.map(e => e.agent_id).filter(Boolean))).map(aid => (
                  <option key={aid} value={aid!}>{aid}</option>
                ))}
              </select>
            </div>
          </div>

          {showEvalList && (
            <div className="divide-y divide-gray-100 dark:divide-gray-700 max-h-[500px] overflow-y-auto">
              {evalList.map((evaluation) => {
                const isExpanded = expandedEvalId === evaluation.id
                const isTaskAnalyzer = evaluation.session_id === 'task-analyzer'

                return (
                  <div key={evaluation.id}>
                    <div
                      className={cn(
                        'px-5 py-3 transition-colors',
                        isTaskAnalyzer ? 'cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700/30' : '',
                        isExpanded && 'border-l-2 border-primary-500 bg-primary-50/50 dark:bg-primary-900/10'
                      )}
                      onClick={async () => {
                        if (!isTaskAnalyzer) return
                        if (isExpanded) {
                          setExpandedEvalId(null)
                          setEvalDetail(null)
                          return
                        }
                        setExpandedEvalId(evaluation.id)
                        setEvalDetailLoading(true)
                        setEvalDetail(null)
                        const detail = await fetchAnalysisDetail(evaluation.task_id)
                        setEvalDetail(detail)
                        setEvalDetailLoading(false)
                      }}
                    >
                      <div className="flex items-center justify-between mb-1">
                        <div className="flex items-center gap-2">
                          {/* Expand icon for task-analyzer evals */}
                          {isTaskAnalyzer && (
                            isExpanded
                              ? <ChevronDown className="w-3.5 h-3.5 text-primary-500 flex-shrink-0" />
                              : <ChevronRight className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />
                          )}
                          {/* Rating stars */}
                          <div className="flex items-center gap-0.5">
                            {[1, 2, 3, 4, 5].map((star) => (
                              <Star
                                key={star}
                                className={cn(
                                  'w-3.5 h-3.5',
                                  star <= evaluation.rating
                                    ? 'text-yellow-500 fill-yellow-500'
                                    : 'text-gray-300 dark:text-gray-600'
                                )}
                              />
                            ))}
                          </div>
                          {/* Accuracy / Speed badges */}
                          <span className={cn(
                            'text-xs px-1.5 py-0.5 rounded',
                            evaluation.result_accuracy
                              ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
                              : 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'
                          )}>
                            {evaluation.result_accuracy ? '정확' : '부정확'}
                          </span>
                          <span className={cn(
                            'text-xs px-1.5 py-0.5 rounded',
                            evaluation.speed_satisfaction
                              ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400'
                              : 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400'
                          )}>
                            {evaluation.speed_satisfaction ? '빠름' : '느림'}
                          </span>
                          {evaluation.agent_id && (
                            <span className="text-xs px-1.5 py-0.5 rounded bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400">
                              {evaluation.agent_id}
                            </span>
                          )}
                        </div>
                        <span className="text-xs text-gray-400">
                          {new Date(evaluation.created_at).toLocaleString('ko-KR', {
                            month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
                          })}
                        </span>
                      </div>
                      {evaluation.comment && (
                        <p className="text-sm text-gray-700 dark:text-gray-300 mt-1 pl-1">
                          &ldquo;{evaluation.comment}&rdquo;
                        </p>
                      )}
                      {!evaluation.comment && (
                        <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5 pl-1 italic">
                          코멘트 없음
                        </p>
                      )}
                      <div className="text-xs text-gray-400 dark:text-gray-500 mt-1 pl-1">
                        {evaluation.task_id.slice(0, 8)}... / {evaluation.session_id.slice(0, 8)}...
                      </div>
                    </div>

                    {/* Expanded Analysis Detail */}
                    {isExpanded && (
                      <div className="px-5 pb-4">
                        {evalDetailLoading && (
                          <div className="flex items-center justify-center py-8">
                            <Loader2 className="w-5 h-5 animate-spin text-primary-500" />
                            <span className="ml-2 text-sm text-gray-500">분석 데이터 로딩 중...</span>
                          </div>
                        )}

                        {!evalDetailLoading && !evalDetail && (
                          <div className="py-6 text-center text-sm text-gray-400 dark:text-gray-500">
                            분석 데이터를 찾을 수 없습니다.
                          </div>
                        )}

                        {!evalDetailLoading && evalDetail && (
                          <EvalDetailView detail={evalDetail} />
                        )}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}
     
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

interface CostComparisonCardProps {
  estimatedCost: number
  estimatedTokens: number
  actualCost: number | null
}

function CostComparisonCard({ estimatedCost, estimatedTokens, actualCost }: CostComparisonCardProps) {
  const formatCostValue = (cost: number): string => {
    if (cost === 0) return 'FREE'
    if (cost < 0.01) return `$${cost.toFixed(4)}`
    return `$${cost.toFixed(2)}`
  }

  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4">
      <div className="flex items-center justify-between mb-2">
        <span className="text-sm text-gray-500 dark:text-gray-400">Total Cost</span>
        <div className={cn('p-2 rounded-lg', 'bg-amber-100 text-amber-600 dark:bg-amber-900/30 dark:text-amber-400')}>
          <DollarSign className="w-4 h-4" />
        </div>
      </div>
      <div className="text-2xl font-bold text-gray-900 dark:text-white">
        {formatCostValue(estimatedCost)}
      </div>
      <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">
        {formatNumber(estimatedTokens)} tokens
        {actualCost !== null && (
          <span className="ml-1 text-amber-600 dark:text-amber-400">
            (실제 과금: {formatCostValue(actualCost)})
          </span>
        )}
      </div>
    </div>
  )
}

interface ChartCardProps {
  title: string
  icon: typeof BarChart3
  children: React.ReactNode
  className?: string
  headerExtra?: React.ReactNode
}

function ChartCard({ title, icon: Icon, children, className, headerExtra }: ChartCardProps) {
  return (
    <div
      className={cn(
        'bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-8',
        className
      )}
    >
      <div className="flex items-center justify-between mb-4 gap-2">
        <h3 className="text-sm font-medium text-gray-900 dark:text-white flex items-center gap-2">
          <Icon className="w-4 h-4 text-gray-400" />
          {title}
        </h3>
        {headerExtra}
      </div>
      {children}
    </div>
  )
}

function EvalDetailView({ detail }: { detail: TaskAnalysisHistory }) {
  const analysis = detail.analysis

  return (
    <div className="bg-gray-50 dark:bg-gray-900 rounded-lg p-4 space-y-4 mt-2">
      {/* Task Input */}
      <div className="flex items-start gap-2">
        <FileText className="w-4 h-4 text-gray-400 mt-0.5 flex-shrink-0" />
        <div>
          <p className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">태스크 입력</p>
          <p className="text-sm text-gray-700 dark:text-gray-300 whitespace-pre-wrap line-clamp-3">
            {detail.task_input}
          </p>
        </div>
      </div>

      {/* Analysis Summary 4-grid */}
      {analysis && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div className="bg-white dark:bg-gray-800 rounded-lg p-3 border border-gray-200 dark:border-gray-700">
              <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">Complexity</p>
              <p className="text-lg font-semibold text-gray-900 dark:text-white">
                {analysis.analysis?.complexity_score ?? detail.complexity_score ?? '-'}/10
              </p>
            </div>
            <div className="bg-white dark:bg-gray-800 rounded-lg p-3 border border-gray-200 dark:border-gray-700">
              <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">Effort Level</p>
              {(analysis.analysis?.effort_level || detail.effort_level) ? (
                <span className={cn('px-2 py-1 rounded-full text-xs font-medium', effortColors[analysis.analysis?.effort_level || detail.effort_level || ''])}>
                  {analysis.analysis?.effort_level || detail.effort_level}
                </span>
              ) : (
                <span className="text-sm text-gray-400">-</span>
              )}
            </div>
            <div className="bg-white dark:bg-gray-800 rounded-lg p-3 border border-gray-200 dark:border-gray-700">
              <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">Subtasks</p>
              <p className="text-lg font-semibold text-gray-900 dark:text-white">
                {analysis.subtask_count ?? detail.subtask_count ?? '-'}
              </p>
            </div>
            <div className="bg-white dark:bg-gray-800 rounded-lg p-3 border border-gray-200 dark:border-gray-700">
              <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">Strategy</p>
              <div className="flex items-center gap-1">
                {(() => {
                  const strategy = analysis.strategy || detail.strategy || ''
                  const StrategyIcon = strategyIcons[strategy] || GitBranch
                  return <StrategyIcon className="w-4 h-4 text-primary-500" />
                })()}
                <span className="text-sm font-medium text-gray-900 dark:text-white capitalize">
                  {analysis.strategy || detail.strategy || '-'}
                </span>
              </div>
            </div>
          </div>

          {/* Context Summary */}
          {analysis.analysis?.context_summary && (
            <div className="bg-white dark:bg-gray-800 rounded-lg p-3 border border-gray-200 dark:border-gray-700">
              <h4 className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1.5">Context Summary</h4>
              <p className="text-sm text-gray-600 dark:text-gray-400">
                {analysis.analysis.context_summary}
              </p>
            </div>
          )}

          {/* Key Requirements */}
          {analysis.analysis?.key_requirements && analysis.analysis.key_requirements.length > 0 && (
            <div>
              <h4 className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-2">Key Requirements</h4>
              <div className="flex flex-wrap gap-1.5">
                {analysis.analysis.key_requirements.map((req, i) => (
                  <span
                    key={i}
                    className="px-2 py-0.5 bg-primary-100 dark:bg-primary-900/30 text-primary-700 dark:text-primary-400 text-xs rounded-full"
                  >
                    {req}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Execution Plan */}
          {analysis.execution_plan?.parallel_groups && analysis.execution_plan.parallel_groups.length > 0 && (
            <div>
              <h4 className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-2">Execution Plan</h4>
              <div className="space-y-2">
                {analysis.execution_plan.parallel_groups.map((group, groupIndex) => (
                  <div key={groupIndex}>
                    <div className="flex items-center gap-2 mb-1.5">
                      <span className="text-xs font-medium text-gray-500 dark:text-gray-400">
                        Step {groupIndex + 1}
                      </span>
                      {group.length > 1 && (
                        <span className="px-1.5 py-0.5 bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 text-[10px] rounded-full flex items-center gap-0.5">
                          <Zap className="w-2.5 h-2.5" />
                          Parallel
                        </span>
                      )}
                    </div>
                    <div className={cn('grid gap-2', group.length > 1 ? 'grid-cols-1 md:grid-cols-2' : 'grid-cols-1')}>
                      {group.map((taskId) => {
                        const subtask = analysis.execution_plan?.subtasks[taskId]
                        if (!subtask) return null
                        return (
                          <div
                            key={taskId}
                            className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-2.5"
                          >
                            <div className="flex items-start justify-between mb-1">
                              <h5 className="text-xs font-medium text-gray-900 dark:text-white">
                                {subtask.title}
                              </h5>
                              <span className={cn('px-1.5 py-0.5 text-[10px] rounded-full flex-shrink-0 ml-2', effortColors[subtask.effort])}>
                                {subtask.effort}
                              </span>
                            </div>
                            {subtask.agent && (
                              <div className="flex items-center gap-1 text-[10px] text-gray-500 dark:text-gray-400">
                                <Users className="w-2.5 h-2.5" />
                                <span>{subtask.agent}</span>
                              </div>
                            )}
                          </div>
                        )
                      })}
                    </div>
                    {groupIndex < analysis.execution_plan!.parallel_groups.length - 1 && (
                      <div className="flex justify-center my-1">
                        <ChevronRight className="w-4 h-4 text-gray-300 dark:text-gray-600 rotate-90" />
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}

      {/* Fallback for no analysis data */}
      {!analysis && (
        <div className="text-sm text-gray-500 dark:text-gray-400">
          <p>분석 결과: {detail.success ? '성공' : '실패'}</p>
          {detail.error && <p className="text-red-500 mt-1">{detail.error}</p>}
          {detail.execution_time_ms > 0 && (
            <p className="mt-1">실행 시간: {detail.execution_time_ms}ms</p>
          )}
        </div>
      )}
    </div>
  )
}

function ActivityHeatmapChart({ data }: { data: ActivityHeatmap }) {
  const cellHeight = 16
  const isDark = document.documentElement.classList.contains('dark')
  const emptyColor = isDark ? '#171f2a' : '#e5e7eb'

  return (
    <div className="w-full overflow-hidden">
      <div className="flex gap-1 w-full">
        {/* Hour labels */}
        <div className="flex flex-col gap-[2px] text-[10px] text-gray-500 pr-1 flex-shrink-0 w-8">
          {Array.from({ length: 24 }, (_, i) => (
            <div
              key={i}
              style={{ height: cellHeight }}
              className="flex items-center justify-end leading-none"
            >
              {i % 6 === 0 ? `${i}:00` : ''}
            </div>
          ))}
        </div>

        {/* Heatmap grid */}
        {Array.from({ length: 7 }, (_, day) => (
          <div key={day} className="flex flex-col gap-[2px] flex-1 min-w-0">
            {Array.from({ length: 24 }, (_, hour) => {
              const cell = data.cells.find((c) => c.day === day && c.hour === hour)
              const value = cell?.value || 0
              const alpha = computeHeatmapAlpha(value, data.max_value)

              return (
                <div
                  key={hour}
                  style={{
                    height: cellHeight,
                    backgroundColor: alpha === 0
                      ? emptyColor
                      : `rgba(59, 130, 246, ${alpha})`,
                  }}
                  className="w-full rounded-sm cursor-pointer hover:ring-2 hover:ring-blue-400"
                  title={`${DAY_LABELS[day]} ${hour}:00 - ${value} sessions`}
                />
              )
            })}
            <div className="text-[10px] text-gray-500 text-center mt-1 truncate">
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
                ? emptyColor
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

function formatTokenCount(value: number): string {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`
  if (value >= 1_000) return `${(value / 1_000).toFixed(1)}K`
  return String(value)
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`
  return `${(ms / 60000).toFixed(1)}m`
}

function formatTrendLabel(timestamp: string, timeRange: TimeRange): string {
  const date = new Date(timestamp)
  switch (timeRange) {
    case '1h':
      return date.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })
    case '24h':
      return date.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })
    case '7d':
      return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
    case '30d':
      return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
    case 'all':
      return date.toLocaleDateString('en-US', { year: '2-digit', month: 'short' })
    default:
      return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  }
}

function formatTrendData(
  data: TrendDataPoint[],
  timeRange: TimeRange = '7d',
): { label: string; value: number | undefined }[] {
  return data.map((d) => ({
    label: formatTrendLabel(d.timestamp, timeRange),
    value: d.value ?? undefined, // null → undefined for Recharts gap handling
  }))
}

/**
 * Transform multi-project series data for Recharts
 * Converts from series-based to date-based format
 */
function transformMultiSeriesData(
  response: MultiProjectTrendsResponse
): Record<string, string | number | null>[] {
  const dateMap = new Map<string, Record<string, string | number | null>>()

  response.series.forEach((series) => {
    series.data.forEach((point) => {
      const dateKey = formatTrendLabel(point.timestamp, response.period)
      const existing = dateMap.get(dateKey) || { date: dateKey }
      existing[series.project_id] = point.value
      dateMap.set(dateKey, existing)
    })
  })

  return Array.from(dateMap.values())
}

/**
 * Render a small status badge above the Model Token Breakdown chart that
 * tells the user *why* the data looks the way it does — silent fallback is
 * confusing, especially when stats-cache.json has gone stale upstream.
 */
function renderTokenSourceBadge(
  usage: import('../types/claudeUsage').ClaudeUsageResponse | null
): React.ReactNode {
  if (!usage) return null
  const source = usage.weeklyModelTokensSource
  const ageDays = usage.statsCacheAgeDays ?? null

  if (source === 'jsonl-fallback') {
    const ageHint = ageDays != null && ageDays > 0 ? ` (Claude 캐시 ${ageDays}일 stale)` : ''
    return (
      <span
        className="text-[11px] px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200 whitespace-nowrap"
        title={`stats-cache.json이 갱신되지 않아 세션 JSONL에서 직접 집계했습니다${ageHint}.`}
      >
        세션 로그 기반{ageHint}
      </span>
    )
  }

  if (ageDays != null && ageDays >= 2) {
    return (
      <span
        className="text-[11px] px-2 py-0.5 rounded-full bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300 whitespace-nowrap"
        title="Claude Code의 stats-cache.json이 며칠째 갱신되지 않았습니다."
      >
        캐시 {ageDays}일 stale
      </span>
    )
  }

  return null
}

/**
 * Transform model tokens data for stacked bar chart
 * Converts from DailyModelTokens[] to Recharts format
 */
function transformModelTokensData(
  data: { date: string; tokensByModel: Record<string, number> }[]
): Record<string, string | number>[] {
  return data.map((day) => {
    const dateKey = new Date(day.date).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
    })
    return {
      date: dateKey,
      ...day.tokensByModel,
    }
  })
}

/**
 * Extract all unique model names from weekly model tokens data
 */
function extractModelNames(
  data: { date: string; tokensByModel: Record<string, number> }[]
): string[] {
  const modelNamesSet = new Set<string>()
  data.forEach((day) => {
    Object.keys(day.tokensByModel).forEach((modelName) => {
      modelNamesSet.add(modelName)
    })
  })
  return Array.from(modelNamesSet)
}

export default AnalyticsPage
