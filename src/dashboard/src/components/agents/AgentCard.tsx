/**
 * AgentCard Component
 *
 * 에이전트 정보를 표시하는 카드 컴포넌트.
 * 에이전트 이름, 상태 배지, 사용 가능한 도구 수, 엔드포인트를 표시합니다.
 */

import { useMemo } from 'react'
import { cn } from '../../lib/utils'
import { Globe, Wrench, Bot } from 'lucide-react'

// ─────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────

export type AgentStatus = 'available' | 'busy' | 'offline'

export interface Agent {
  id: string
  name: string
  status: AgentStatus
  endpoint: string
  totalTools: number
  availableTools: number
  lastUpdated?: string
}

interface AgentCardProps {
  agent: Agent
  onSelect?: (agent: Agent) => void
  isSelected?: boolean
  className?: string
}

// ─────────────────────────────────────────────────────────────
// Status Configuration
// ─────────────────────────────────────────────────────────────

const statusConfig: Record<
  AgentStatus,
  { label: string; badgeClass: string; dotClass: string }
> = {
  available: {
    label: 'Available',
    badgeClass: 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400',
    dotClass: 'bg-green-500',
  },
  busy: {
    label: 'Busy',
    badgeClass: 'bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-400',
    dotClass: 'bg-yellow-500',
  },
  offline: {
    label: 'Offline',
    badgeClass: 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400',
    dotClass: 'bg-red-500',
  },
}

// ─────────────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────────────

export function AgentCard({ agent, onSelect, isSelected, className }: AgentCardProps) {
  const config = statusConfig[agent.status]

  const toolRatio = useMemo(() => {
    if (agent.totalTools === 0) return 0
    return (agent.availableTools / agent.totalTools) * 100
  }, [agent.availableTools, agent.totalTools])

  return (
    <div
      onClick={() => onSelect?.(agent)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          onSelect?.(agent)
        }
      }}
      role="button"
      tabIndex={0}
      aria-label={`Agent ${agent.name}, status: ${agent.status}, ${agent.availableTools} of ${agent.totalTools} tools available`}
      className={cn(
        'bg-white dark:bg-gray-800 rounded-lg border p-4 transition-all cursor-pointer hover:shadow-md',
        isSelected
          ? 'border-primary-500 ring-2 ring-primary-500/20'
          : 'border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600',
        className
      )}
    >
      {/* Header: Name + Status Badge */}
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="w-9 h-9 bg-primary-100 dark:bg-primary-900/30 rounded-lg flex items-center justify-center flex-shrink-0">
            <Bot className="w-4.5 h-4.5 text-primary-600 dark:text-primary-400" />
          </div>
          <h3 className="font-medium text-gray-900 dark:text-white truncate">{agent.name}</h3>
        </div>
        <span
          className={cn(
            'inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium flex-shrink-0',
            config.badgeClass
          )}
          aria-label={`Status: ${config.label}`}
        >
          <span className={cn('w-1.5 h-1.5 rounded-full', config.dotClass)} />
          {config.label}
        </span>
      </div>

      {/* Endpoint */}
      <div className="flex items-start gap-1.5 mb-3">
        <Globe className="w-3.5 h-3.5 text-gray-400 dark:text-gray-500 flex-shrink-0 mt-0.5" />
        <p className="text-sm text-gray-600 dark:text-gray-400 line-clamp-1" aria-label={`Endpoint: ${agent.endpoint}`}>
          {agent.endpoint}
        </p>
      </div>

      {/* Tools */}
      <div className="pt-3 border-t border-gray-100 dark:border-gray-700">
        <div className="flex items-center justify-between mb-1.5">
          <div className="flex items-center gap-1.5">
            <Wrench className="w-3.5 h-3.5 text-gray-500 dark:text-gray-400" />
            <span className="text-xs text-gray-500 dark:text-gray-400">Tools</span>
          </div>
          <span
            className="text-sm font-medium text-gray-900 dark:text-white"
            aria-label={`${agent.availableTools} of ${agent.totalTools} tools available`}
          >
            {agent.availableTools}/{agent.totalTools}
          </span>
        </div>
        <div className="h-1.5 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
          <div
            className={cn(
              'h-full rounded-full transition-all',
              agent.status === 'offline' ? 'bg-gray-400' : 'bg-green-500'
            )}
            style={{ width: `${toolRatio}%` }}
            role="progressbar"
            aria-valuenow={agent.availableTools}
            aria-valuemin={0}
            aria-valuemax={agent.totalTools}
            aria-label="Tool availability"
          />
        </div>
      </div>
    </div>
  )
}
