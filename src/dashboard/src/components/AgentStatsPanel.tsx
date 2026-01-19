/**
 * Agent Stats Panel Component
 *
 * Agent Registry 통계를 표시하는 패널 컴포넌트
 */

import { cn } from '../lib/utils'
import { AgentRegistryStats } from '../stores/agents'
import { Bot, CheckCircle, Clock, Code, Layers, TestTube, Search, Gauge, Trophy } from 'lucide-react'

// 카테고리별 아이콘
const categoryIcons: Record<string, typeof Bot> = {
  development: Code,
  orchestration: Layers,
  quality: TestTube,
  research: Search,
}

// 카테고리별 색상
const categoryBgColors: Record<string, string> = {
  development: 'bg-blue-500',
  orchestration: 'bg-purple-500',
  quality: 'bg-green-500',
  research: 'bg-amber-500',
}

interface AgentStatsPanelProps {
  stats: AgentRegistryStats | null
  isLoading?: boolean
}

export function AgentStatsPanel({ stats, isLoading }: AgentStatsPanelProps) {
  if (isLoading) {
    return (
      <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-6">
        <div className="animate-pulse space-y-4">
          <div className="h-6 bg-gray-200 dark:bg-gray-700 rounded w-1/3" />
          <div className="grid grid-cols-4 gap-4">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="h-20 bg-gray-200 dark:bg-gray-700 rounded" />
            ))}
          </div>
        </div>
      </div>
    )
  }

  if (!stats) {
    return null
  }

  const statCards = [
    {
      label: 'Total Agents',
      value: stats.total_agents,
      icon: Bot,
      color: 'text-gray-600 dark:text-gray-400',
      bgColor: 'bg-gray-100 dark:bg-gray-700',
    },
    {
      label: 'Available',
      value: stats.available_agents,
      icon: CheckCircle,
      color: 'text-green-600 dark:text-green-400',
      bgColor: 'bg-green-100 dark:bg-green-900/30',
    },
    {
      label: 'Busy',
      value: stats.busy_agents,
      icon: Clock,
      color: 'text-blue-600 dark:text-blue-400',
      bgColor: 'bg-blue-100 dark:bg-blue-900/30',
    },
    {
      label: 'Avg Success',
      value: `${(stats.avg_success_rate * 100).toFixed(0)}%`,
      icon: Gauge,
      color: 'text-purple-600 dark:text-purple-400',
      bgColor: 'bg-purple-100 dark:bg-purple-900/30',
    },
  ]

  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-6">
      <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
        <Trophy className="w-5 h-5 text-amber-500" />
        Agent Registry Stats
      </h3>

      {/* Main Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        {statCards.map((stat) => (
          <div
            key={stat.label}
            className={cn('rounded-lg p-4', stat.bgColor)}
          >
            <div className="flex items-center gap-2 mb-2">
              <stat.icon className={cn('w-4 h-4', stat.color)} />
              <span className="text-sm text-gray-600 dark:text-gray-400">{stat.label}</span>
            </div>
            <p className={cn('text-2xl font-bold', stat.color)}>{stat.value}</p>
          </div>
        ))}
      </div>

      {/* Category Distribution */}
      <div>
        <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">
          Agents by Category
        </h4>
        <div className="space-y-2">
          {Object.entries(stats.by_category).map(([category, count]) => {
            const Icon = categoryIcons[category] || Bot
            const percentage = stats.total_agents > 0 ? (count / stats.total_agents) * 100 : 0

            return (
              <div key={category} className="flex items-center gap-3">
                <div className="w-24 flex items-center gap-2">
                  <Icon className="w-4 h-4 text-gray-500 dark:text-gray-400" />
                  <span className="text-sm text-gray-600 dark:text-gray-400 capitalize">
                    {category}
                  </span>
                </div>
                <div className="flex-1 h-2 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
                  <div
                    className={cn('h-full rounded-full transition-all', categoryBgColors[category] || 'bg-gray-500')}
                    style={{ width: `${percentage}%` }}
                  />
                </div>
                <span className="text-sm text-gray-600 dark:text-gray-400 w-8 text-right">
                  {count}
                </span>
              </div>
            )
          })}
        </div>
      </div>

      {/* Total Tasks */}
      <div className="mt-4 pt-4 border-t border-gray-200 dark:border-gray-700">
        <div className="flex items-center justify-between">
          <span className="text-sm text-gray-600 dark:text-gray-400">
            Total Tasks Completed
          </span>
          <span className="text-lg font-semibold text-gray-900 dark:text-white">
            {stats.total_tasks_completed.toLocaleString()}
          </span>
        </div>
      </div>
    </div>
  )
}
