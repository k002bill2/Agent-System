/**
 * AnalyticsPage 의 API 호출 레이어.
 *
 * 계획서 인벤토리는 이 구간을 "타입·상수"에 묶었으나 실제로는 세 번째 층이다 —
 * Task 1(NotificationRuleEditor)에서와 같은 오차라 같은 처방(api 분리)을 쓴다.
 */

import { apiClient } from '@/services/apiClient'
import type { TaskAnalysisHistory } from '@/stores/agents'
import type {
  AnalyticsDashboard,
  CompareMetric,
  MultiProjectTrendsResponse,
  TaskEvalStats,
  TaskEvaluation,
  TimeRange,
} from './types'

export async function fetchDashboard(timeRange: TimeRange, projectId?: string): Promise<AnalyticsDashboard> {
  const params = new URLSearchParams({ time_range: timeRange })
  if (projectId) params.append('project_id', projectId)
  return apiClient.get<AnalyticsDashboard>(`/api/analytics/dashboard?${params}`)
}

export async function fetchTaskEvalStats(projectId?: string): Promise<TaskEvalStats> {
  const params = new URLSearchParams()
  if (projectId) params.set('project_id', projectId)
  const qs = params.toString()
  return apiClient.get<TaskEvalStats>(`/api/feedback/task-evaluation/stats${qs ? `?${qs}` : ''}`)
}

export async function fetchTaskEvalList(
  agentId?: string,
  limit = 50,
  projectId?: string,
): Promise<TaskEvaluation[]> {
  const params = new URLSearchParams({ limit: String(limit) })
  if (agentId) params.set('agent_id', agentId)
  if (projectId) params.set('project_id', projectId)
  return apiClient.get<TaskEvaluation[]>(`/api/feedback/task-evaluation/list?${params}`)
}

export async function fetchAnalysisDetail(analysisId: string): Promise<TaskAnalysisHistory | null> {
  try {
    return await apiClient.get<TaskAnalysisHistory>(`/api/agents/orchestrate/analyses/${analysisId}`)
  } catch {
    return null
  }
}

export async function fetchMultiProjectTrends(
  projectIds: string[],
  metric: CompareMetric,
  timeRange: TimeRange
): Promise<MultiProjectTrendsResponse> {
  const params = new URLSearchParams({ metric, time_range: timeRange })
  projectIds.forEach((id) => params.append('project_ids', id))
  return apiClient.get<MultiProjectTrendsResponse>(`/api/analytics/trends/compare?${params}`)
}
