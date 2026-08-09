/**
 * Analytics Page
 * Dashboard for viewing metrics, trends, and performance data
 */

import { useEffect, useState } from 'react'
import {
  LineChart,
  Line,
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
  Loader2,
} from 'lucide-react'
import { cn } from '../lib/utils'
import { useProjectsStore, Project } from '../stores/projects'
import { useExternalUsageStore } from '../stores/externalUsage'
import { useAuthStore } from '../stores/auth'
import { ProjectMultiSelect } from '../components/analytics/ProjectMultiSelect'
import type { TaskAnalysisHistory } from '../stores/agents'
import {
  fetchAnalysisDetail,
  fetchDashboard,
  fetchMultiProjectTrends,
  fetchTaskEvalList,
  fetchTaskEvalStats,
} from '../components/analytics/api'
import { TIME_RANGES } from '../components/analytics/constants'
import type {
  AnalyticsDashboard,
  CompareMetric,
  MultiProjectTrendsResponse,
  TaskEvalStats,
  TaskEvaluation,
  TimeRange,
} from '../components/analytics/types'
import {
  buildModelTokenBreakdown,
  filterAttributedModelPerformance,
  formatDuration,
  formatNumber,
  transformMultiSeriesData,
} from '../components/analytics/utils'
import { ActivityHeatmapChart } from '../components/analytics/ActivityHeatmapChart'
import { ChartCard } from '../components/analytics/ChartCard'
import { CostComparisonCard } from '../components/analytics/CostComparisonCard'
import { EvalDetailView } from '../components/analytics/EvalDetailView'
import { MetricCard } from '../components/analytics/MetricCard'
import { CostPerformanceRow } from '../components/analytics/CostPerformanceRow'
import { TokenUsageRow } from '../components/analytics/TokenUsageRow'
import { TrendChartsRow } from '../components/analytics/TrendChartsRow'

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

  // Get external (actual API billing) usage data
  const { summary: externalSummary, fetchSummary: fetchExternalSummary } = useExternalUsageStore()

  // Fetch projects on mount
  useEffect(() => {
    fetchProjects()
  }, [fetchProjects])

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

  const modelTokenBreakdown = buildModelTokenBreakdown(data.costs.by_model, externalSummary)
  const modelPerformanceData = filterAttributedModelPerformance(data.agents.agents)

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

      <TrendChartsRow trends={data.trends} timeRange={timeRange} />

      <TokenUsageRow
        trends={data.trends}
        timeRange={timeRange}
        modelTokenBreakdown={modelTokenBreakdown}
      />

      <CostPerformanceRow
        costsByModel={data.costs.by_model}
        modelPerformanceData={modelPerformanceData}
      />

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
            <ResponsiveContainer width="100%" height={250} debounce={80}>
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
              {modelPerformanceData.map((agent) => {
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

