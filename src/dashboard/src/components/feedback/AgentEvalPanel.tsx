/**
 * Agent Evaluation Panel
 *
 * 에이전트별 평가 통계 및 상세 내역을 표시하는 패널입니다.
 */

import { useEffect, useState } from 'react'
import {
  Star,
  TrendingUp,
  TrendingDown,
  ThumbsUp,
  ThumbsDown,
  Users,
  RefreshCw,
  BarChart3,
} from 'lucide-react'
import { cn } from '../../lib/utils'

// ─────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────

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

// ─────────────────────────────────────────────────────────────
// API
// ─────────────────────────────────────────────────────────────

const API_BASE = 'http://localhost:8000/api/feedback'

async function fetchEvalStats(): Promise<TaskEvalStats> {
  const res = await fetch(`${API_BASE}/task-evaluation/stats`)
  if (!res.ok) throw new Error('Failed to fetch evaluation stats')
  return res.json()
}

// ─────────────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────────────

export function AgentEvalPanel() {
  const [stats, setStats] = useState<TaskEvalStats | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [selectedAgent, setSelectedAgent] = useState<string | null>(null)

  const loadStats = async () => {
    try {
      setLoading(true)
      setError(null)
      const data = await fetchEvalStats()
      setStats(data)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadStats()
  }, [])

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <RefreshCw className="w-6 h-6 animate-spin text-gray-400" />
      </div>
    )
  }

  if (error) {
    return (
      <div className="text-center py-12">
        <p className="text-red-500">{error}</p>
        <button
          onClick={loadStats}
          className="mt-2 text-sm text-blue-500 hover:underline"
        >
          다시 시도
        </button>
      </div>
    )
  }

  if (!stats || stats.total_count === 0) {
    return (
      <div className="text-center py-12 text-gray-500 dark:text-gray-400">
        <BarChart3 className="w-12 h-12 mx-auto mb-3 opacity-50" />
        <p>아직 평가 데이터가 없습니다.</p>
        <p className="text-sm mt-1">Playground에서 메시지에 평가를 남겨보세요.</p>
      </div>
    )
  }

  const selectedAgentStats = selectedAgent
    ? stats.by_agent.find((a) => a.agent_id === selectedAgent)
    : null

  return (
    <div className="space-y-6">
      {/* Overall Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard
          label="총 평가"
          value={stats.total_count.toString()}
          icon={ThumbsUp}
          color="blue"
        />
        <StatCard
          label="평균 만족도"
          value={`${stats.avg_rating.toFixed(1)} / 5`}
          icon={Star}
          color={stats.avg_rating >= 4 ? 'green' : stats.avg_rating >= 3 ? 'amber' : 'red'}
        />
        <StatCard
          label="정확도"
          value={`${(stats.accuracy_rate * 100).toFixed(0)}%`}
          icon={stats.accuracy_rate >= 0.7 ? TrendingUp : TrendingDown}
          color={stats.accuracy_rate >= 0.8 ? 'green' : stats.accuracy_rate >= 0.5 ? 'amber' : 'red'}
        />
        <StatCard
          label="속도 만족도"
          value={`${(stats.speed_satisfaction_rate * 100).toFixed(0)}%`}
          icon={stats.speed_satisfaction_rate >= 0.7 ? TrendingUp : TrendingDown}
          color={stats.speed_satisfaction_rate >= 0.8 ? 'green' : 'amber'}
        />
      </div>

      {/* Agent Breakdown */}
      {stats.by_agent.length > 0 && (
        <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700">
          <div className="px-4 py-3 border-b border-gray-200 dark:border-gray-700 flex items-center gap-2">
            <Users className="w-4 h-4 text-gray-400" />
            <h3 className="text-sm font-medium text-gray-900 dark:text-white">
              에이전트별 평가
            </h3>
          </div>

          <div className="divide-y divide-gray-200 dark:divide-gray-700">
            {stats.by_agent
              .sort((a, b) => b.avg_rating - a.avg_rating)
              .map((agent) => (
                <button
                  key={agent.agent_id}
                  onClick={() =>
                    setSelectedAgent(
                      selectedAgent === agent.agent_id ? null : agent.agent_id
                    )
                  }
                  className={cn(
                    'w-full px-4 py-3 flex items-center gap-4 hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors text-left',
                    selectedAgent === agent.agent_id && 'bg-blue-50 dark:bg-blue-900/20'
                  )}
                >
                  {/* Agent name */}
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-gray-900 dark:text-white truncate">
                      {agent.agent_id}
                    </div>
                    <div className="text-xs text-gray-500 dark:text-gray-400">
                      {agent.total_count}건 평가
                    </div>
                  </div>

                  {/* Rating bar */}
                  <div className="flex items-center gap-2 w-32">
                    <div className="flex-1 h-2 bg-gray-200 dark:bg-gray-600 rounded-full overflow-hidden">
                      <div
                        className={cn(
                          'h-full rounded-full transition-all',
                          agent.avg_rating >= 4
                            ? 'bg-green-500'
                            : agent.avg_rating >= 3
                            ? 'bg-yellow-500'
                            : 'bg-red-500'
                        )}
                        style={{ width: `${(agent.avg_rating / 5) * 100}%` }}
                      />
                    </div>
                    <span
                      className={cn(
                        'text-sm font-medium w-8 text-right',
                        agent.avg_rating >= 4
                          ? 'text-green-600 dark:text-green-400'
                          : agent.avg_rating >= 3
                          ? 'text-yellow-600 dark:text-yellow-400'
                          : 'text-red-600 dark:text-red-400'
                      )}
                    >
                      {agent.avg_rating.toFixed(1)}
                    </span>
                  </div>

                  {/* Accuracy */}
                  <div className="text-right w-16">
                    <div className="text-xs text-gray-500 dark:text-gray-400">정확도</div>
                    <div
                      className={cn(
                        'text-sm font-medium',
                        agent.accuracy_rate >= 0.8
                          ? 'text-green-600 dark:text-green-400'
                          : agent.accuracy_rate >= 0.5
                          ? 'text-yellow-600 dark:text-yellow-400'
                          : 'text-red-600 dark:text-red-400'
                      )}
                    >
                      {(agent.accuracy_rate * 100).toFixed(0)}%
                    </div>
                  </div>

                  {/* Speed */}
                  <div className="text-right w-16">
                    <div className="text-xs text-gray-500 dark:text-gray-400">속도</div>
                    <div
                      className={cn(
                        'text-sm font-medium',
                        agent.speed_satisfaction_rate >= 0.8
                          ? 'text-green-600 dark:text-green-400'
                          : 'text-yellow-600 dark:text-yellow-400'
                      )}
                    >
                      {(agent.speed_satisfaction_rate * 100).toFixed(0)}%
                    </div>
                  </div>
                </button>
              ))}
          </div>

          {/* Selected Agent Detail */}
          {selectedAgentStats && (
            <div className="px-4 py-4 border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50">
              <h4 className="text-sm font-medium text-gray-900 dark:text-white mb-3">
                {selectedAgentStats.agent_id} 상세
              </h4>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <MiniStat
                  label="평균 평점"
                  value={selectedAgentStats.avg_rating.toFixed(2)}
                  max="/5"
                />
                <MiniStat
                  label="정확도"
                  value={`${(selectedAgentStats.accuracy_rate * 100).toFixed(1)}%`}
                />
                <MiniStat
                  label="속도 만족"
                  value={`${(selectedAgentStats.speed_satisfaction_rate * 100).toFixed(1)}%`}
                />
                <MiniStat
                  label="총 평가 수"
                  value={selectedAgentStats.total_count.toString()}
                />
              </div>

              {/* Sentiment indicator */}
              <div className="mt-3 flex items-center gap-2">
                <span className="text-xs text-gray-500 dark:text-gray-400">종합:</span>
                {selectedAgentStats.avg_rating >= 4 ? (
                  <span className="inline-flex items-center gap-1 text-xs text-green-600 dark:text-green-400 bg-green-50 dark:bg-green-900/20 px-2 py-0.5 rounded-full">
                    <ThumbsUp className="w-3 h-3" />
                    우수
                  </span>
                ) : selectedAgentStats.avg_rating >= 3 ? (
                  <span className="inline-flex items-center gap-1 text-xs text-yellow-600 dark:text-yellow-400 bg-yellow-50 dark:bg-yellow-900/20 px-2 py-0.5 rounded-full">
                    보통
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 text-xs text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 px-2 py-0.5 rounded-full">
                    <ThumbsDown className="w-3 h-3" />
                    개선 필요
                  </span>
                )}
              </div>
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

interface StatCardProps {
  label: string
  value: string
  icon: typeof Star
  color: 'blue' | 'green' | 'red' | 'amber'
}

function StatCard({ label, value, icon: Icon, color }: StatCardProps) {
  const colorClasses = {
    blue: 'bg-blue-100 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400',
    green: 'bg-green-100 text-green-600 dark:bg-green-900/30 dark:text-green-400',
    red: 'bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400',
    amber: 'bg-amber-100 text-amber-600 dark:bg-amber-900/30 dark:text-amber-400',
  }

  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-3">
      <div className="flex items-center justify-between mb-1">
        <span className="text-xs text-gray-500 dark:text-gray-400">{label}</span>
        <div className={cn('p-1.5 rounded-md', colorClasses[color])}>
          <Icon className="w-3.5 h-3.5" />
        </div>
      </div>
      <div className="text-lg font-bold text-gray-900 dark:text-white">{value}</div>
    </div>
  )
}

interface MiniStatProps {
  label: string
  value: string
  max?: string
}

function MiniStat({ label, value, max }: MiniStatProps) {
  return (
    <div className="text-center">
      <div className="text-xs text-gray-500 dark:text-gray-400 mb-0.5">{label}</div>
      <div className="text-sm font-semibold text-gray-900 dark:text-white">
        {value}
        {max && <span className="text-gray-400 font-normal">{max}</span>}
      </div>
    </div>
  )
}
