/**
 * AgentCard Component
 *
 * 에이전트 정보를 카드 형태로 표시하는 컴포넌트.
 * 이름, 상태 배지, 도구 가용률, 엔드포인트를 시각적으로 보여줍니다.
 */

import { memo, useCallback, useMemo } from 'react'
import { cn } from '../../lib/utils'

// ─────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────

/** 에이전트 상태 */
export type AgentStatus = 'available' | 'busy' | 'offline'

/** 에이전트 정보 */
export interface Agent {
  readonly id: string
  readonly name: string
  readonly status: AgentStatus
  readonly endpoint: string
  readonly totalTools: number
  readonly availableTools: number
  readonly lastUpdated?: string
}

/** AgentCard 컴포넌트 Props */
interface AgentCardProps {
  /** 표시할 에이전트 정보 */
  readonly agent: Agent
  /** 카드 클릭(선택) 시 호출되는 콜백 */
  readonly onSelect?: (agent: Agent) => void
  /** 선택 상태 표시 여부 */
  readonly isSelected?: boolean
  /** 추가 CSS 클래스 */
  readonly className?: string
}

// ─────────────────────────────────────────────────────────────
// Status Configuration (불변 맵)
// ─────────────────────────────────────────────────────────────

interface StatusStyle {
  readonly label: string
  readonly badge: string
  readonly dot: string
}

const STATUS_STYLES: Readonly<Record<AgentStatus, StatusStyle>> = Object.freeze({
  available: {
    label: '사용 가능',
    badge: 'bg-green-50 text-green-700 dark:bg-green-900/30 dark:text-green-400',
    dot: 'bg-green-500',
  },
  busy: {
    label: '사용 중',
    badge: 'bg-amber-50 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',
    dot: 'bg-amber-500',
  },
  offline: {
    label: '오프라인',
    badge: 'bg-red-50 text-red-700 dark:bg-red-900/30 dark:text-red-400',
    dot: 'bg-red-500',
  },
})

// ─────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────

function computeToolPercent(available: number, total: number): number {
  if (total <= 0) return 0
  return Math.round((available / total) * 100)
}

// ─────────────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────────────

export const AgentCard = memo(function AgentCard({
  agent,
  onSelect,
  isSelected = false,
  className,
}: AgentCardProps) {
  const style = STATUS_STYLES[agent.status]

  const toolPercent = useMemo(
    () => computeToolPercent(agent.availableTools, agent.totalTools),
    [agent.availableTools, agent.totalTools],
  )

  const handleClick = useCallback(() => {
    onSelect?.(agent)
  }, [onSelect, agent])

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault()
        onSelect?.(agent)
      }
    },
    [onSelect, agent],
  )

  return (
    <article
      onClick={handleClick}
      onKeyDown={handleKeyDown}
      role="button"
      tabIndex={0}
      aria-label={`에이전트 ${agent.name}, 상태: ${style.label}, 도구 ${agent.availableTools}/${agent.totalTools} 사용 가능`}
      className={cn(
        'group relative rounded-xl border p-4 transition-all duration-200 cursor-pointer',
        'bg-white dark:bg-gray-800',
        'hover:shadow-md dark:hover:shadow-gray-900/40',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 focus-visible:ring-offset-2',
        isSelected
          ? 'border-primary-500 ring-2 ring-primary-500/20 shadow-sm'
          : 'border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600',
        className,
      )}
    >
      {/* Header */}
      <div className="flex items-center justify-between gap-3 mb-3">
        <h3 className="text-sm font-semibold text-gray-900 dark:text-white truncate">
          {agent.name}
        </h3>

        <span
          className={cn(
            'inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium shrink-0',
            style.badge,
          )}
          aria-label={`상태: ${style.label}`}
        >
          <span
            className={cn('h-1.5 w-1.5 rounded-full', style.dot)}
            aria-hidden="true"
          />
          {style.label}
        </span>
      </div>

      {/* Endpoint */}
      <p
        className="text-xs text-gray-500 dark:text-gray-400 truncate mb-4"
        title={agent.endpoint}
        aria-label={`엔드포인트: ${agent.endpoint}`}
      >
        {agent.endpoint}
      </p>

      {/* Tool availability */}
      <div className="space-y-1.5">
        <div className="flex items-center justify-between">
          <span className="text-xs text-gray-500 dark:text-gray-400">
            도구
          </span>
          <span className="text-xs font-medium text-gray-700 dark:text-gray-300">
            {agent.availableTools} / {agent.totalTools}
          </span>
        </div>

        <div
          className="h-1.5 w-full overflow-hidden rounded-full bg-gray-100 dark:bg-gray-700"
          role="progressbar"
          aria-valuenow={agent.availableTools}
          aria-valuemin={0}
          aria-valuemax={agent.totalTools}
          aria-label="도구 가용률"
        >
          <div
            className={cn(
              'h-full rounded-full transition-[width] duration-300',
              agent.status === 'offline'
                ? 'bg-gray-400 dark:bg-gray-500'
                : 'bg-primary-500 dark:bg-primary-400',
            )}
            style={{ width: `${toolPercent}%` }}
          />
        </div>
      </div>
    </article>
  )
})

AgentCard.displayName = 'AgentCard'
