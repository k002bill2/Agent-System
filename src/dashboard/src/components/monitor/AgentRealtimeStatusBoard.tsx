import { memo, useState, useMemo, useCallback } from 'react'
import {
  PlayCircle,
  PauseCircle,
  AlertTriangle,
  CheckCircle2,
  Search,
  RefreshCw,
  Activity,
  ChevronRight,
  Filter,
  Loader2,
  Gauge,
  Timer,
} from 'lucide-react'
import { cn } from '../../lib/utils'
import { useAgentRegistry } from '../../hooks/useAgentRegistry'
import type { Agent } from '../../services/agentService'

// ─────────────────────────────────────────────────────────────
// Types & Constants
// ─────────────────────────────────────────────────────────────

/**
 * Board states map 1:1 onto the registry's `AgentStatus`
 * (`services/agent_registry.py::AgentStatus`). No synthetic state exists —
 * every bucket below is a value the API can actually return.
 */
export type AgentState = 'available' | 'busy' | 'unavailable' | 'error'

const STATE_CONFIG = {
  available: {
    label: '가용',
    color: 'text-emerald-600 dark:text-emerald-400',
    bgColor: 'bg-emerald-50 dark:bg-emerald-950/20',
    borderColor: 'border-emerald-200 dark:border-emerald-800/40',
    strokeColor: '#10b981', // emerald-500
    icon: CheckCircle2,
    pulse: false,
  },
  busy: {
    label: '작업 중',
    color: 'text-blue-500 dark:text-blue-400',
    bgColor: 'bg-blue-50 dark:bg-blue-950/20',
    borderColor: 'border-blue-200 dark:border-blue-800/40',
    strokeColor: '#3b82f6', // blue-500
    icon: PlayCircle,
    pulse: true,
  },
  unavailable: {
    label: '사용 불가',
    color: 'text-amber-500 dark:text-amber-400',
    bgColor: 'bg-amber-50 dark:bg-amber-950/20',
    borderColor: 'border-amber-200 dark:border-amber-800/40',
    strokeColor: '#f59e0b', // amber-500
    icon: PauseCircle,
    pulse: false,
  },
  error: {
    label: '오류',
    color: 'text-rose-500 dark:text-rose-400',
    bgColor: 'bg-rose-50 dark:bg-rose-950/20',
    borderColor: 'border-rose-200 dark:border-rose-800/40',
    strokeColor: '#f43f5e', // rose-500
    icon: AlertTriangle,
    pulse: false,
  },
} as const

const STATE_ORDER: readonly AgentState[] = ['available', 'busy', 'unavailable', 'error']

// ─────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────

/**
 * Narrow the API's free-form `status` string to a board state.
 * Unknown values fall back to `unavailable` rather than being dropped, so a
 * new backend status can never make an agent silently disappear from the board.
 */
function toAgentState(status: string): AgentState {
  switch (status) {
    case 'available':
      return 'available'
    case 'busy':
      return 'busy'
    case 'error':
      return 'error'
    case 'unavailable':
      return 'unavailable'
    default:
      return 'unavailable'
  }
}

/** `success_rate` arrives as a 0..1 ratio.
 *
 * 태스크를 한 번도 실행하지 않은 에이전트는 레지스트리 기본값 `1.0` 을 그대로 내려보낸다
 * (`services/agent_registry.py:95`). 그것을 "100%" 로 그리면 측정된 적 없는 값을 측정값처럼
 * 제시하게 된다 — `formatDuration` 이 `ms <= 0` 에 쓰는 관례와 같이 `—` 로 둔다.
 */
function formatSuccessRate(rate: number, totalTasksCompleted: number): string {
  if (!Number.isFinite(rate) || totalTasksCompleted <= 0) return '—'
  return `${Math.round(rate * 100)}%`
}

function formatDuration(ms: number): string {
  if (!Number.isFinite(ms) || ms <= 0) return '—'
  if (ms < 1000) return `${Math.round(ms)}ms`
  return `${(ms / 1000).toFixed(1)}s`
}

function formatUpdatedAt(epochMs: number): string {
  return new Date(epochMs).toLocaleTimeString('ko-KR', {
    hour: '2-digit',
    minute: '2-digit',
  })
}

// ─────────────────────────────────────────────────────────────
// Sub-components (Memoized)
// ─────────────────────────────────────────────────────────────

interface CircularGaugeProps {
  state: AgentState
  count: number
  total: number
  isSelected: boolean
  onClick: () => void
}

const CircularGauge: React.FC<CircularGaugeProps> = memo(({
  state,
  count,
  total,
  isSelected,
  onClick,
}) => {
  const config = STATE_CONFIG[state]
  const Icon = config.icon
  const percentage = total > 0 ? Math.round((count / total) * 100) : 0

  // SVG Gauge calculations (radius = 32, circumference = 2 * pi * r ≈ 201)
  const radius = 32
  const strokeWidth = 5
  const circumference = 2 * Math.PI * radius
  const strokeDashoffset = circumference - (percentage / 100) * circumference

  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={`필터: ${config.label} 상태 에이전트 ${count}개. 선택하려면 누르세요.`}
      aria-pressed={isSelected}
      className={cn(
        'relative flex flex-col items-center justify-center p-4 rounded-xl border transition-all duration-300 cursor-pointer select-none outline-none group',
        config.bgColor,
        config.borderColor,
        isSelected
          ? 'ring-2 ring-primary-500 scale-102 shadow-md dark:shadow-neutral-900/40 border-transparent'
          : 'hover:scale-101 hover:shadow-sm hover:border-gray-300 dark:hover:border-gray-600',
      )}
    >
      {/* SVG Circle Gauge */}
      <div className="relative w-20 h-20 flex items-center justify-center">
        <svg className="w-full h-full transform -rotate-90" viewBox="0 0 80 80">
          {/* Background Track Circle */}
          <circle
            cx="40"
            cy="40"
            r={radius}
            strokeWidth={strokeWidth}
            className="stroke-gray-200 dark:stroke-gray-800"
            fill="transparent"
          />
          {/* Progress Circle */}
          <circle
            cx="40"
            cy="40"
            r={radius}
            strokeWidth={strokeWidth}
            strokeDasharray={circumference}
            strokeDashoffset={strokeDashoffset}
            strokeLinecap="round"
            stroke={config.strokeColor}
            fill="transparent"
            className="transition-all duration-500 ease-out"
          />
        </svg>
        {/* Center Content */}
        <div className="absolute flex flex-col items-center justify-center">
          <Icon className={cn('w-5 h-5 transition-transform duration-300 group-hover:scale-110', config.color)} />
          <span className="text-xs font-semibold text-gray-500 dark:text-gray-400 mt-0.5">
            {percentage}%
          </span>
        </div>
      </div>

      <div className="mt-3 text-center">
        <h4 className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
          {config.label}
        </h4>
        <p className="text-xl font-bold text-gray-900 dark:text-white mt-0.5">
          {count} <span className="text-xs font-normal text-gray-500">개</span>
        </p>
      </div>
    </button>
  )
})
CircularGauge.displayName = 'CircularGauge'

interface AgentActivityCardProps {
  agent: Agent
  onClick?: () => void
  isSelected: boolean
}

const AgentActivityCard: React.FC<AgentActivityCardProps> = memo(({
  agent,
  onClick,
  isSelected,
}) => {
  const state = toAgentState(agent.status)
  const config = STATE_CONFIG[state]
  const StatusIcon = config.icon

  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={`에이전트 ${agent.name}, 상태 ${config.label}, 성공률 ${formatSuccessRate(agent.success_rate, agent.total_tasks_completed)} (완료 ${agent.total_tasks_completed}건)`}
      aria-pressed={isSelected}
      className={cn(
        'p-4 bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700/60 rounded-xl transition-all duration-300 cursor-pointer select-none outline-none group relative overflow-hidden',
        'hover:-translate-y-0.5 hover:shadow-md dark:hover:shadow-neutral-900/50 hover:border-gray-200 dark:hover:border-gray-600',
        isSelected && 'ring-2 ring-primary-500 border-transparent dark:bg-gray-800/80'
      )}
    >
      {/* Busy State Background Glow */}
      {state === 'busy' && (
        <span className="absolute top-0 right-0 w-24 h-24 bg-blue-500/5 dark:bg-blue-400/5 rounded-full blur-2xl -mr-4 -mt-4 transition-opacity group-hover:opacity-100" />
      )}

      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
        {/* Name & Status */}
        <div className="flex items-start gap-3 min-w-0">
          <div className="relative mt-0.5 flex-shrink-0">
            <StatusIcon className={cn('w-5 h-5', config.color, config.pulse && 'animate-pulse')} />
            {state === 'busy' && (
              <span className="absolute top-0 right-0 w-2.5 h-2.5 bg-blue-500 dark:bg-blue-400 rounded-full animate-ping" />
            )}
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h4 className="text-sm font-semibold text-gray-900 dark:text-white truncate">
                {agent.name}
              </h4>
              <span className={cn(
                'px-1.5 py-0.5 text-[9px] font-semibold rounded-md uppercase tracking-wider',
                config.bgColor,
                config.color
              )}>
                {config.label}
              </span>
              {/*
                `is_available` is an independent signal from `status`: the
                registry returns available-but-saturated agents (status
                'available', is_available false) when concurrency is maxed out.
                Only surface the badge when the two disagree.
              */}
              {state === 'available' && !agent.is_available && (
                <span
                  className="px-1.5 py-0.5 text-[9px] font-semibold rounded-md uppercase tracking-wider bg-amber-50 text-amber-600 dark:bg-amber-950/20 dark:text-amber-400"
                  title="상태는 가용이지만 동시 작업 한도에 도달해 신규 배정을 받을 수 없습니다."
                >
                  배정 불가
                </span>
              )}
              {agent.category && (
                <span className="px-1.5 py-0.5 text-[9px] font-medium rounded-md bg-gray-100 text-gray-500 dark:bg-gray-700/60 dark:text-gray-400">
                  {agent.category}
                </span>
              )}
            </div>
            {agent.description && (
              <p className="text-[10px] text-gray-400 dark:text-gray-500 line-clamp-1 mt-1">
                {agent.description}
              </p>
            )}
          </div>
        </div>

        {/* Registry metrics — all read straight from the API response */}
        <div className="flex items-center gap-4 text-xs text-gray-500 dark:text-gray-400 justify-between md:justify-end border-t md:border-t-0 pt-2.5 md:pt-0 border-gray-100 dark:border-gray-700/50">
          <div className="flex items-center gap-1.5" title="완료한 태스크 수">
            <CheckCircle2 className="w-3.5 h-3.5 text-gray-400" />
            <span className="font-semibold text-gray-700 dark:text-gray-300">
              {agent.total_tasks_completed}
            </span>
            <span className="text-[10px] text-gray-400">완료</span>
          </div>

          <div className="flex items-center gap-1.5" title="성공률">
            <Gauge className="w-3.5 h-3.5 text-gray-400" />
            <span className="text-[10px]">{formatSuccessRate(agent.success_rate, agent.total_tasks_completed)}</span>
          </div>

          {/* `avg_execution_time_ms` 는 레지스트리에 등록될 때 적히는 **정적 추정치**다
              (`services/agent_registry.py:82`, 시드 이후 갱신하는 코드가 없다 — 실행마다
              갱신되는 `success_rate`·`total_tasks_completed` 와 다르다). 측정값처럼
              보이지 않도록 "예상" 으로 표기한다. */}
          <div className="flex items-center gap-1.5" title="예상 실행 시간 (레지스트리 등록값, 실측 아님)">
            <Timer className="w-3.5 h-3.5 text-gray-400" />
            <span className="text-[10px]">~{formatDuration(agent.avg_execution_time_ms)}</span>
          </div>

          <ChevronRight className="w-4 h-4 text-gray-400 opacity-0 -translate-x-1 transition-all group-hover:opacity-100 group-hover:translate-x-0 hidden md:block" />
        </div>
      </div>
    </button>
  )
})
AgentActivityCard.displayName = 'AgentActivityCard'


// ─────────────────────────────────────────────────────────────
// Presentational sections
//
// 보드가 데이터 배선(훅)과 표현을 한 함수에 담고 있으면 함수 하나가 250 줄을
// 넘어 저장소 한도(함수 50 줄)를 크게 벗어나고, 상태별 화면을 따로 테스트하기도
// 어렵다. 아래는 전부 순수 표현 컴포넌트다 — 상태를 갖지 않고 props 만 읽는다.
// ─────────────────────────────────────────────────────────────

interface BoardHeaderProps {
  lastUpdatedAt: number | null
  isRefreshing: boolean
  onRefresh: () => void
}

const BoardHeader: React.FC<BoardHeaderProps> = memo(({ lastUpdatedAt, isRefreshing, onRefresh }) => (
    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
      <div>
        <div className="flex items-center gap-2">
          <Activity className="w-5 h-5 text-primary-500" />
          <h2 className="text-lg font-bold text-gray-900 dark:text-white">
            Agent 실시간 상태 모니터링 현황판
          </h2>
        </div>
        <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
          에이전트 레지스트리에 등록된 에이전트의 상태와 실행 지표를 조회합니다.
        </p>
      </div>
      {/* Refresh control & last-updated stamp */}
      <div className="flex items-center gap-2 bg-white dark:bg-zinc-800 px-3 py-1.5 rounded-lg border border-gray-200/80 dark:border-zinc-700/60 text-xs">
        <span className="font-medium text-gray-500 dark:text-gray-400">
          {lastUpdatedAt !== null ? `마지막 갱신 ${formatUpdatedAt(lastUpdatedAt)}` : '갱신 이력 없음'}
        </span>
        <button
          type="button"
          onClick={onRefresh}
          disabled={isRefreshing}
          className="ml-1 hover:bg-gray-100 dark:hover:bg-zinc-700 p-1 rounded transition-colors text-gray-400 hover:text-gray-700 dark:hover:text-zinc-200 disabled:opacity-50 disabled:cursor-not-allowed"
          aria-label="에이전트 목록 새로고침"
        >
          <RefreshCw className={cn('w-3.5 h-3.5', isRefreshing && 'animate-spin')} />
        </button>
      </div>
    </div>
))
BoardHeader.displayName = 'BoardHeader'

const RegistryLoading: React.FC = memo(() => (
      <div
        role="status"
        className="flex flex-col items-center justify-center py-12 px-4 border border-dashed border-gray-200 dark:border-zinc-800 rounded-xl text-center bg-white dark:bg-zinc-800/20"
      >
        <Loader2 className="w-8 h-8 text-primary-500 animate-spin mb-3" />
        <p className="text-xs font-semibold text-gray-500 dark:text-gray-400">
          에이전트 목록을 불러오는 중...
        </p>
      </div>
))
RegistryLoading.displayName = 'RegistryLoading'

interface RegistryErrorProps {
  error: string | null
  isRefreshing: boolean
  onRetry: () => void
}

const RegistryErrorPanel: React.FC<RegistryErrorProps> = memo(({ error, isRefreshing, onRetry }) => (
      <div
        role="alert"
        className="flex flex-col items-center justify-center py-12 px-4 border border-rose-200 dark:border-rose-800/50 rounded-xl text-center bg-rose-50 dark:bg-rose-950/20"
      >
        <AlertTriangle className="w-8 h-8 text-rose-500 dark:text-rose-400 mb-3" />
        <p className="text-xs font-semibold text-rose-700 dark:text-rose-400">
          에이전트 목록을 불러오지 못했습니다
        </p>
        {error && (
          <p className="text-[10px] text-rose-600/80 dark:text-rose-400/70 mt-1">{error}</p>
        )}
        <button
          type="button"
          onClick={onRetry}
          disabled={isRefreshing}
          className="mt-4 px-3 py-1.5 text-[10px] font-semibold rounded-lg bg-rose-100 text-rose-700 hover:bg-rose-200 dark:bg-rose-900/40 dark:text-rose-300 dark:hover:bg-rose-900/60 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          aria-label="에이전트 목록 다시 불러오기"
        >
          다시 시도
        </button>
      </div>
))
RegistryErrorPanel.displayName = 'RegistryErrorPanel'

const StaleDataBanner: React.FC<RegistryErrorProps> = memo(({ error, isRefreshing, onRetry }) => (
      <div
        role="alert"
        className="flex items-center gap-2 px-3 py-2 mb-3 rounded-lg border border-rose-200 dark:border-rose-800/50 bg-rose-50 dark:bg-rose-950/20"
      >
        <AlertTriangle className="w-4 h-4 shrink-0 text-rose-500 dark:text-rose-400" />
        <p className="flex-1 text-[10px] text-rose-700 dark:text-rose-400">
          갱신에 실패해 이전 목록을 보여 주고 있습니다{error ? ` — ${error}` : ''}
        </p>
        <button
          type="button"
          onClick={onRetry}
          disabled={isRefreshing}
          className="px-2 py-1 text-[10px] font-semibold rounded-md bg-rose-100 text-rose-700 hover:bg-rose-200 dark:bg-rose-900/40 dark:text-rose-300 dark:hover:bg-rose-900/60 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          aria-label="에이전트 목록 다시 불러오기"
        >
          다시 시도
        </button>
      </div>
))
StaleDataBanner.displayName = 'StaleDataBanner'

interface RegistryEmptyProps {
  isRefreshing: boolean
  onRefresh: () => void
}

const RegistryEmpty: React.FC<RegistryEmptyProps> = memo(({ isRefreshing, onRefresh }) => (
      <div className="flex flex-col items-center justify-center py-12 px-4 border border-dashed border-gray-200 dark:border-zinc-800 rounded-xl text-center bg-white dark:bg-zinc-800/20">
        <Activity className="w-8 h-8 text-gray-300 dark:text-gray-700 mb-3" />
        <p className="text-xs font-semibold text-gray-500 dark:text-gray-400">
          등록된 에이전트가 없습니다
        </p>
        <p className="text-[10px] text-gray-400 dark:text-gray-500 mt-1">
          레지스트리에 에이전트가 등록되면 이곳에 표시됩니다.
        </p>
        <button
          type="button"
          onClick={onRefresh}
          disabled={isRefreshing}
          className="mt-4 px-3 py-1.5 text-[10px] font-semibold rounded-lg bg-gray-100 text-gray-600 hover:bg-gray-200 dark:bg-zinc-800 dark:text-gray-300 dark:hover:bg-zinc-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          aria-label="에이전트 목록 새로고침"
        >
          새로고침
        </button>
      </div>
))
RegistryEmpty.displayName = 'RegistryEmpty'

interface BoardContentProps {
  agents: Agent[]
  filteredAgents: Agent[]
  stateCounts: Record<AgentState, number>
  selectedStateFilter: 'all' | AgentState
  onStateGaugeClick: (next: AgentState) => void
  onResetStateFilter: () => void
  searchQuery: string
  onSearchQueryChange: (next: string) => void
  selectedCardId: string | null
  onCardClick: (id: string) => void
}

const BoardContent: React.FC<BoardContentProps> = memo(({
  agents,
  filteredAgents,
  stateCounts,
  selectedStateFilter,
  onStateGaugeClick,
  onResetStateFilter,
  searchQuery,
  onSearchQueryChange,
  selectedCardId,
  onCardClick,
}) => (
      <>
        {/* SVG Circular Gauges Row */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {STATE_ORDER.map((gaugeState) => (
            <CircularGauge
              key={gaugeState}
              state={gaugeState}
              count={stateCounts[gaugeState]}
              total={agents.length}
              isSelected={selectedStateFilter === gaugeState}
              onClick={() => onStateGaugeClick(gaugeState)}
            />
          ))}
        </div>
        {/* Filter / Search Bar */}
        <div className="flex flex-col sm:flex-row gap-3 sm:items-center justify-between bg-white dark:bg-zinc-800/80 p-3 rounded-xl border border-gray-100 dark:border-zinc-800">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-3 top-2.5 w-4 h-4 text-gray-400" />
            <input
              type="text"
              placeholder="에이전트 이름, 설명, 또는 카테고리 검색..."
              value={searchQuery}
              onChange={(e) => onSearchQueryChange(e.target.value)}
              className="w-full pl-9 pr-4 py-1.5 text-xs bg-slate-50/50 dark:bg-zinc-900/60 border border-gray-200 dark:border-zinc-700/60 rounded-lg focus:outline-none focus:ring-1 focus:ring-primary-500 focus:border-primary-500 text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 transition-shadow"
              aria-label="에이전트 이름, 설명, 카테고리 검색"
            />
          </div>
          {/* Filter Quick Reset */}
          <div className="flex items-center gap-2 self-end sm:self-auto">
            {selectedStateFilter !== 'all' && (
              <button
                type="button"
                onClick={onResetStateFilter}
                className="text-[10px] font-semibold text-primary-500 hover:text-primary-600 flex items-center gap-1 px-2 py-1 rounded hover:bg-primary-50 dark:hover:bg-primary-950/20 transition-colors"
                aria-label="상태 필터 초기화"
              >
                <Filter className="w-3 h-3" />
                필터 초기화
              </button>
            )}
            <span className="text-[10px] text-gray-400 dark:text-gray-500 font-medium">
              조회된 에이전트: {filteredAgents.length} / {agents.length} 개
            </span>
          </div>
        </div>
        {/* Agents List */}
        <div className="flex flex-col gap-2.5 max-h-[380px] overflow-y-auto pr-1 select-none">
          {filteredAgents.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-10 px-4 border border-dashed border-gray-200 dark:border-zinc-800 rounded-xl text-center bg-white dark:bg-zinc-800/20">
              <Search className="w-8 h-8 text-gray-300 dark:text-gray-700 mb-2.5" />
              <p className="text-xs font-semibold text-gray-500 dark:text-gray-400">
                일치하는 에이전트가 없습니다
              </p>
              <p className="text-[10px] text-gray-400 dark:text-gray-500 mt-1">
                검색어나 상단 상태 필터를 조정해 보세요.
              </p>
            </div>
          ) : (
            filteredAgents.map((agent) => (
              <AgentActivityCard
                key={agent.id}
                agent={agent}
                isSelected={selectedCardId === agent.id}
                onClick={() => onCardClick(agent.id)}
              />
            ))
          )}
        </div>
      </>
))
BoardContent.displayName = 'BoardContent'


// ─────────────────────────────────────────────────────────────
// Main Component
// ─────────────────────────────────────────────────────────────

interface AgentRealtimeStatusBoardProps {
  /** Select agent callback */
  onAgentSelect?: (agentId: string) => void
  /** Style utility classes */
  className?: string
}

export const AgentRealtimeStatusBoard: React.FC<AgentRealtimeStatusBoardProps> = memo(({
  onAgentSelect,
  className,
}) => {
  const { agents, state, error, lastUpdatedAt, isRefreshing, refresh } = useAgentRegistry()

  const [selectedStateFilter, setSelectedStateFilter] = useState<'all' | AgentState>('all')
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedCardId, setSelectedCardId] = useState<string | null>(null)

  // Count agents per state for the gauges
  const stateCounts = useMemo(() => {
    const counts: Record<AgentState, number> = {
      available: 0,
      busy: 0,
      unavailable: 0,
      error: 0,
    }
    agents.forEach((agent) => {
      counts[toAgentState(agent.status)]++
    })
    return counts
  }, [agents])

  // Filtered agents based on search & status gauges
  const filteredAgents = useMemo(() => {
    const query = searchQuery.trim().toLowerCase()
    return agents.filter((agent) => {
      const matchesSearch =
        query === '' ||
        agent.name.toLowerCase().includes(query) ||
        agent.description.toLowerCase().includes(query) ||
        agent.category.toLowerCase().includes(query)

      const matchesStatus =
        selectedStateFilter === 'all' || toAgentState(agent.status) === selectedStateFilter

      return matchesSearch && matchesStatus
    })
  }, [agents, searchQuery, selectedStateFilter])

  const handleStateGaugeClick = useCallback((next: AgentState) => {
    setSelectedStateFilter((prev) => (prev === next ? 'all' : next))
  }, [])

  const handleResetStateFilter = useCallback(() => {
    setSelectedStateFilter('all')
  }, [])

  const handleCardClick = useCallback((id: string) => {
    setSelectedCardId((prev) => (prev === id ? null : id))
    onAgentSelect?.(id)
  }, [onAgentSelect])

  const isEmpty = state === 'ready' && agents.length === 0

  return (
    <section
      aria-label="Agent 실시간 상태 모니터링 현황판"
      aria-busy={isRefreshing}
      className={cn(
        'flex flex-col gap-6 w-full bg-slate-50/60 dark:bg-zinc-900/40 p-6 rounded-2xl border border-gray-200/60 dark:border-zinc-800/80 transition-colors backdrop-blur-sm',
        className
      )}
    >
      <BoardHeader
        lastUpdatedAt={lastUpdatedAt}
        isRefreshing={isRefreshing}
        onRefresh={refresh}
      />

      {state === 'loading' && <RegistryLoading />}

      {/* 전면 에러 패널은 보여 줄 데이터가 아예 없을 때만. 데이터가 있으면
          목록을 유지하고 배너로 알린다 — 목록을 비우면 "에이전트 없음" 과
          구분되지 않는다. */}
      {state === 'error' && agents.length === 0 && (
        <RegistryErrorPanel error={error} isRefreshing={isRefreshing} onRetry={refresh} />
      )}

      {state === 'error' && agents.length > 0 && (
        <StaleDataBanner error={error} isRefreshing={isRefreshing} onRetry={refresh} />
      )}

      {isEmpty && <RegistryEmpty isRefreshing={isRefreshing} onRefresh={refresh} />}

      {state !== 'loading' && agents.length > 0 && (
        <BoardContent
          agents={agents}
          filteredAgents={filteredAgents}
          stateCounts={stateCounts}
          selectedStateFilter={selectedStateFilter}
          onStateGaugeClick={handleStateGaugeClick}
          onResetStateFilter={handleResetStateFilter}
          searchQuery={searchQuery}
          onSearchQueryChange={setSearchQuery}
          selectedCardId={selectedCardId}
          onCardClick={handleCardClick}
        />
      )}

    </section>
  )
})

AgentRealtimeStatusBoard.displayName = 'AgentRealtimeStatusBoard'
