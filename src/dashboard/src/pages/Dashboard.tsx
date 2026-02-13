/**
 * Dashboard Component
 *
 * 에이전트 대시보드 - useEffect 의존성 배열 최적화 적용.
 *
 * 수정 내역:
 * - useEffect 의존성 배열에 객체/배열 직접 참조 제거 (무한 리렌더링 방지)
 * - useCallback으로 이벤트 핸들러 메모이제이션
 * - useMemo로 파생 데이터 계산 최적화
 * - API 호출 중복 방지를 위한 ref 활용
 */

import { useEffect, useCallback, useMemo, useRef } from 'react'
import { Activity, CheckCircle, Clock, AlertCircle, RefreshCw } from 'lucide-react'

export interface AgentSummary {
  id: string
  name: string
  status: 'available' | 'busy' | 'offline'
  tools: number
  availableTools: number
}

interface DashboardStats {
  totalAgents: number
  availableAgents: number
  busyAgents: number
  offlineAgents: number
  totalTools: number
  availableTools: number
}

export interface DashboardProps {
  agents?: AgentSummary[]
  onRefresh?: () => Promise<void>
  isLoading?: boolean
  error?: string | null
}

/**
 * calculateStats를 컴포넌트 외부에 정의하여 참조 안정성 확보.
 * 이전에는 컴포넌트 내부에 인라인으로 정의되어 매 렌더에 새 함수가 생성됨.
 */
export function calculateStats(agents: AgentSummary[]): DashboardStats {
  return agents.reduce(
    (acc, agent) => {
      acc.totalAgents++
      acc.totalTools += agent.tools
      acc.availableTools += agent.availableTools

      switch (agent.status) {
        case 'available':
          acc.availableAgents++
          break
        case 'busy':
          acc.busyAgents++
          break
        case 'offline':
          acc.offlineAgents++
          break
      }

      return acc
    },
    {
      totalAgents: 0,
      availableAgents: 0,
      busyAgents: 0,
      offlineAgents: 0,
      totalTools: 0,
      availableTools: 0,
    }
  )
}

export function Dashboard({
  agents = [],
  onRefresh,
  isLoading = false,
  error = null,
}: DashboardProps) {
  // 중복 호출 방지를 위한 ref
  const hasFetchedRef = useRef(false)

  /**
   * [BUG FIX] useCallback으로 래핑하여 참조 안정성 확보.
   * 이전: onRefresh를 직접 useEffect 의존성에 넣어 무한 루프 발생.
   * 수정: useCallback으로 메모이제이션 + ref로 중복 호출 방지.
   */
  const handleRefresh = useCallback(async () => {
    if (onRefresh && !hasFetchedRef.current) {
      hasFetchedRef.current = true
      try {
        await onRefresh()
      } finally {
        // 일정 시간 후 다시 호출 가능하도록
        setTimeout(() => {
          hasFetchedRef.current = false
        }, 5000)
      }
    }
  }, [onRefresh])

  /**
   * [BUG FIX] 초기 데이터 로드.
   * 이전: useEffect(() => { fetchData() }, [fetchData, filters, options])
   *   -> filters/options가 매 렌더에 새 객체로 생성되어 무한 루프.
   * 수정: handleRefresh를 안정적인 콜백으로 사용 + 빈 의존성 배열.
   */
  useEffect(() => {
    handleRefresh()
  }, [handleRefresh])

  /**
   * [BUG FIX] useMemo로 파생 데이터 메모이제이션.
   * 이전: 매 렌더에 새 객체가 생성되어 자식 컴포넌트 리렌더링 유발.
   */
  const stats = useMemo(() => calculateStats(agents), [agents])

  const statusCards = useMemo(
    () => [
      {
        label: 'Total Agents',
        value: stats.totalAgents,
        icon: Activity,
        colorClass: 'text-primary-600 dark:text-primary-400',
        bgClass: 'bg-primary-100 dark:bg-primary-900/30',
      },
      {
        label: 'Available',
        value: stats.availableAgents,
        icon: CheckCircle,
        colorClass: 'text-green-600 dark:text-green-400',
        bgClass: 'bg-green-100 dark:bg-green-900/30',
      },
      {
        label: 'Busy',
        value: stats.busyAgents,
        icon: Clock,
        colorClass: 'text-yellow-600 dark:text-yellow-400',
        bgClass: 'bg-yellow-100 dark:bg-yellow-900/30',
      },
      {
        label: 'Offline',
        value: stats.offlineAgents,
        icon: AlertCircle,
        colorClass: 'text-red-600 dark:text-red-400',
        bgClass: 'bg-red-100 dark:bg-red-900/30',
      },
    ],
    [stats]
  )

  return (
    <div className="flex-1 p-6 overflow-y-auto" role="main" aria-label="Dashboard">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Dashboard</h1>
        <button
          onClick={handleRefresh}
          disabled={isLoading}
          className="flex items-center gap-2 px-3 py-2 text-sm rounded-lg bg-primary-500 text-white hover:bg-primary-600 disabled:opacity-50 transition-colors"
          aria-label="Refresh data"
        >
          <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      </div>

      {/* Error */}
      {error && (
        <div
          className="mb-4 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg text-red-700 dark:text-red-400 text-sm"
          role="alert"
        >
          {error}
        </div>
      )}

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        {statusCards.map((card) => {
          const Icon = card.icon
          return (
            <div
              key={card.label}
              className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4"
            >
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-500 dark:text-gray-400">{card.label}</p>
                  <p className={`text-2xl font-bold ${card.colorClass}`}>{card.value}</p>
                </div>
                <div className={`w-10 h-10 ${card.bgClass} rounded-lg flex items-center justify-center`}>
                  <Icon className={`w-5 h-5 ${card.colorClass}`} />
                </div>
              </div>
            </div>
          )
        })}
      </div>

      {/* Tool Summary */}
      <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-3">
          Tool Summary
        </h2>
        <div className="flex items-center gap-4">
          <div>
            <span className="text-sm text-gray-500 dark:text-gray-400">Available</span>
            <p className="text-xl font-bold text-green-600 dark:text-green-400">
              {stats.availableTools}
            </p>
          </div>
          <div className="text-gray-300 dark:text-gray-600">/</div>
          <div>
            <span className="text-sm text-gray-500 dark:text-gray-400">Total</span>
            <p className="text-xl font-bold text-gray-900 dark:text-white">
              {stats.totalTools}
            </p>
          </div>
          {stats.totalTools > 0 && (
            <div className="flex-1">
              <div className="h-2 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
                <div
                  className="h-full bg-green-500 rounded-full transition-all"
                  style={{
                    width: `${(stats.availableTools / stats.totalTools) * 100}%`,
                  }}
                />
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
