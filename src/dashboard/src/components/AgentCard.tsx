/**
 * Agent Card Component
 *
 * Agent Registry에 등록된 에이전트 정보를 표시하는 카드 컴포넌트
 */

import { cn } from '../lib/utils'
import { Agent, AgentStatus, AgentCategory } from '../stores/agents'
import {
  Bot,
  CheckCircle,
  Clock,
  AlertCircle,
  Circle,
  Cpu,
  Code,
  TestTube,
  Layers,
  Sparkles,
  Gauge,
  Search,
} from 'lucide-react'

// 카테고리별 아이콘
const categoryIcons: Record<AgentCategory, typeof Bot> = {
  development: Code,
  orchestration: Layers,
  quality: TestTube,
  research: Search,
}

// 카테고리별 색상
const categoryColors: Record<AgentCategory, string> = {
  development: 'bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400',
  orchestration: 'bg-purple-100 dark:bg-purple-900/30 text-purple-600 dark:text-purple-400',
  quality: 'bg-green-100 dark:bg-green-900/30 text-green-600 dark:text-green-400',
  research: 'bg-amber-100 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400',
}

// 상태별 아이콘
const statusIcons: Record<AgentStatus, typeof CheckCircle> = {
  available: CheckCircle,
  busy: Clock,
  unavailable: Circle,
  error: AlertCircle,
}

// 상태별 색상
const statusColors: Record<AgentStatus, string> = {
  available: 'text-green-500',
  busy: 'text-blue-500',
  unavailable: 'text-gray-400',
  error: 'text-red-500',
}

interface AgentCardProps {
  agent: Agent
  isSelected?: boolean
  onClick?: () => void
}

export function AgentCard({ agent, isSelected, onClick }: AgentCardProps) {
  const CategoryIcon = categoryIcons[agent.category]
  const StatusIcon = statusIcons[agent.status]

  return (
    <div
      onClick={onClick}
      className={cn(
        'bg-white dark:bg-gray-800 rounded-lg border p-4 transition-all cursor-pointer hover:shadow-md',
        isSelected
          ? 'border-primary-500 ring-2 ring-primary-500/20'
          : 'border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600'
      )}
    >
      {/* Header */}
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-3">
          <div className={cn('w-10 h-10 rounded-lg flex items-center justify-center', categoryColors[agent.category])}>
            <CategoryIcon className="w-5 h-5" />
          </div>
          <div>
            <h3 className="font-medium text-gray-900 dark:text-white">{agent.name}</h3>
            <p className="text-xs text-gray-500 dark:text-gray-400 capitalize">{agent.category}</p>
          </div>
        </div>
        <div className="flex items-center gap-1.5">
          <StatusIcon className={cn('w-4 h-4', statusColors[agent.status])} />
          <span className={cn('text-xs font-medium capitalize', statusColors[agent.status])}>
            {agent.status}
          </span>
        </div>
      </div>

      {/* Description */}
      <p className="text-sm text-gray-600 dark:text-gray-400 mb-3 line-clamp-2">
        {agent.description}
      </p>

      {/* Specializations */}
      {agent.specializations.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mb-3">
          {agent.specializations.slice(0, 3).map((spec) => (
            <span
              key={spec}
              className="px-2 py-0.5 bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400 text-xs rounded-full"
            >
              {spec}
            </span>
          ))}
          {agent.specializations.length > 3 && (
            <span className="px-2 py-0.5 text-gray-500 dark:text-gray-400 text-xs">
              +{agent.specializations.length - 3}
            </span>
          )}
        </div>
      )}

      {/* Stats */}
      <div className="grid grid-cols-3 gap-2 pt-3 border-t border-gray-100 dark:border-gray-700">
        <div className="text-center">
          <div className="flex items-center justify-center gap-1 text-gray-500 dark:text-gray-400 mb-1">
            <Cpu className="w-3 h-3" />
          </div>
          <p className="text-xs text-gray-600 dark:text-gray-400">{agent.total_tasks_completed}</p>
          <p className="text-[10px] text-gray-400 dark:text-gray-500">Tasks</p>
        </div>
        <div className="text-center">
          <div className="flex items-center justify-center gap-1 text-gray-500 dark:text-gray-400 mb-1">
            <Gauge className="w-3 h-3" />
          </div>
          <p className="text-xs text-gray-600 dark:text-gray-400">{(agent.success_rate * 100).toFixed(0)}%</p>
          <p className="text-[10px] text-gray-400 dark:text-gray-500">Success</p>
        </div>
        <div className="text-center">
          <div className="flex items-center justify-center gap-1 text-gray-500 dark:text-gray-400 mb-1">
            <Sparkles className="w-3 h-3" />
          </div>
          <p className="text-xs text-gray-600 dark:text-gray-400">${agent.estimated_cost_per_task.toFixed(3)}</p>
          <p className="text-[10px] text-gray-400 dark:text-gray-500">Cost</p>
        </div>
      </div>

      {/* Capabilities Preview */}
      {agent.capabilities.length > 0 && (
        <div className="mt-3 pt-3 border-t border-gray-100 dark:border-gray-700">
          <p className="text-xs text-gray-500 dark:text-gray-400 mb-1.5">
            Capabilities ({agent.capabilities.length})
          </p>
          <div className="space-y-1">
            {agent.capabilities.slice(0, 2).map((cap) => (
              <div key={cap.name} className="text-xs text-gray-600 dark:text-gray-400 truncate">
                • {cap.name}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
