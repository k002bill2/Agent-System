/**
 * AnalyticsPage 의 API 응답·도메인 타입.
 *
 * index.ts 는 재노출하지 않는다 — 소비자는 AnalyticsPage 하나뿐이다(실측).
 */

export type TimeRange = '1h' | '24h' | '7d' | '30d' | 'all'

export interface OverviewMetrics {
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

export interface TrendDataPoint {
  timestamp: string
  value: number | null
  label: string
}

export interface MultiTrendData {
  time_range: TimeRange
  tasks: TrendDataPoint[]
  success_rate: TrendDataPoint[]
  costs: TrendDataPoint[]
  tokens: TrendDataPoint[]
}

export interface AgentPerformance {
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

export interface CostBreakdown {
  category: string
  value: string
  provider?: string | null
  cost: number
  tokens: number
  percentage: number
}

export interface CostAnalytics {
  time_range: TimeRange
  total_cost: number
  total_tokens: number
  avg_cost_per_task: number
  by_agent: CostBreakdown[]
  by_model: CostBreakdown[]
  projected_monthly: number
}

export interface HeatmapCell {
  day: number
  hour: number
  value: number
}

export interface ActivityHeatmap {
  cells: HeatmapCell[]
  max_value: number
  time_range: TimeRange
}

export interface AnalyticsDashboard {
  overview: OverviewMetrics
  trends: MultiTrendData
  agents: { agents: AgentPerformance[]; time_range: TimeRange }
  costs: CostAnalytics
  activity: ActivityHeatmap
}

export interface ModelTokenBreakdown {
  model: string
  provider: string
  providerLabel: string
  tokens: number
  cost: number
  percentage: number
  color: string
}

// Multi-Project Comparison Types
export interface ProjectTrendSeries {
  project_id: string
  project_name: string
  color: string
  data: TrendDataPoint[]
}

export interface MultiProjectTrendsResponse {
  metric: string
  period: TimeRange
  series: ProjectTrendSeries[]
}

export type CompareMetric = 'tasks' | 'tokens' | 'cost' | 'success_rate'

export interface AgentEvalStats {
  agent_id: string
  avg_rating: number
  accuracy_rate: number
  speed_satisfaction_rate: number
  total_count: number
}

export interface TaskEvalStats {
  avg_rating: number
  accuracy_rate: number
  speed_satisfaction_rate: number
  total_count: number
  by_agent: AgentEvalStats[]
}

export interface TaskEvaluation {
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
