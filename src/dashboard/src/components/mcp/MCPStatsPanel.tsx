/**
 * MCP Stats Panel Component
 *
 * MCP Manager 통계를 표시하는 패널 컴포넌트
 */

import { cn } from '../../lib/utils'
import { MCPManagerStats, MCPServerType } from '../../stores/mcp'
import { Server, Play, Wrench, FolderOpen, Github, Globe, Database, Settings } from 'lucide-react'

// 서버 타입별 아이콘
const serverTypeIcons: Record<MCPServerType, typeof Server> = {
  filesystem: FolderOpen,
  github: Github,
  playwright: Globe,
  sqlite: Database,
  custom: Settings,
}

// 서버 타입별 색상
const serverTypeBgColors: Record<MCPServerType, string> = {
  filesystem: 'bg-blue-500',
  github: 'bg-gray-800 dark:bg-gray-500',
  playwright: 'bg-green-500',
  sqlite: 'bg-amber-500',
  custom: 'bg-purple-500',
}

interface MCPStatsPanelProps {
  stats: MCPManagerStats | null
  isLoading?: boolean
}

export function MCPStatsPanel({ stats, isLoading }: MCPStatsPanelProps) {
  if (isLoading) {
    return (
      <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-6">
        <div className="animate-pulse space-y-4">
          <div className="h-6 bg-gray-200 dark:bg-gray-700 rounded w-1/3" />
          <div className="grid grid-cols-3 gap-4">
            {[...Array(3)].map((_, i) => (
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
      label: 'Total Servers',
      value: stats.total_servers,
      icon: Server,
      color: 'text-gray-600 dark:text-gray-400',
      bgColor: 'bg-gray-100 dark:bg-gray-700',
    },
    {
      label: 'Running',
      value: stats.running_servers,
      icon: Play,
      color: 'text-green-600 dark:text-green-400',
      bgColor: 'bg-green-100 dark:bg-green-900/30',
    },
    {
      label: 'Total Tools',
      value: stats.total_tools,
      icon: Wrench,
      color: 'text-blue-600 dark:text-blue-400',
      bgColor: 'bg-blue-100 dark:bg-blue-900/30',
    },
  ]

  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-6">
      <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
        <Server className="w-5 h-5 text-blue-500" />
        MCP Manager Stats
      </h3>

      {/* Main Stats */}
      <div className="grid grid-cols-3 gap-4 mb-6">
        {statCards.map((stat) => (
          <div key={stat.label} className={cn('rounded-lg p-4', stat.bgColor)}>
            <div className="flex items-center gap-2 mb-2">
              <stat.icon className={cn('w-4 h-4', stat.color)} />
              <span className="text-sm text-gray-600 dark:text-gray-400">{stat.label}</span>
            </div>
            <p className={cn('text-2xl font-bold', stat.color)}>{stat.value}</p>
          </div>
        ))}
      </div>

      {/* Server Type Distribution */}
      {stats.servers_by_type && Object.keys(stats.servers_by_type).length > 0 && (
        <div>
          <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">
            Servers by Type
          </h4>
          <div className="space-y-2">
            {Object.entries(stats.servers_by_type).map(([type, count]) => {
              const serverType = type as MCPServerType
              const Icon = serverTypeIcons[serverType] || Settings
              const percentage = stats.total_servers > 0 ? (count / stats.total_servers) * 100 : 0

              return (
                <div key={type} className="flex items-center gap-3">
                  <div className="w-24 flex items-center gap-2">
                    <Icon className="w-4 h-4 text-gray-500 dark:text-gray-400" />
                    <span className="text-sm text-gray-600 dark:text-gray-400 capitalize">{type}</span>
                  </div>
                  <div className="flex-1 h-2 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
                    <div
                      className={cn(
                        'h-full rounded-full transition-all',
                        serverTypeBgColors[serverType] || 'bg-gray-500'
                      )}
                      style={{ width: `${percentage}%` }}
                    />
                  </div>
                  <span className="text-sm text-gray-600 dark:text-gray-400 w-8 text-right">{count}</span>
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
