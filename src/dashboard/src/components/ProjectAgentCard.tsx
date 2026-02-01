/**
 * Project Agent Card
 *
 * 프로젝트별 에이전트 설정을 카드 형태로 표시합니다.
 */

import { Bot, Wrench, Settings, FileCode } from 'lucide-react'
import { AgentConfig } from '../stores/projectConfigs'
import { cn } from '../lib/utils'

interface ProjectAgentCardProps {
  agent: AgentConfig
  className?: string
}

export function ProjectAgentCard({ agent, className }: ProjectAgentCardProps) {
  return (
    <div
      className={cn(
        'bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4 transition-all hover:shadow-md',
        className
      )}
    >
      {/* Header */}
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-purple-100 dark:bg-purple-900/30 flex items-center justify-center">
            <Bot className="w-5 h-5 text-purple-600 dark:text-purple-400" />
          </div>
          <div>
            <h3 className="font-medium text-gray-900 dark:text-white">{agent.name}</h3>
            {agent.role && (
              <p className="text-sm text-gray-500 dark:text-gray-400">{agent.role}</p>
            )}
          </div>
        </div>
        {agent.is_shared && (
          <span className="px-2 py-1 bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 text-xs font-medium rounded-full">
            Shared
          </span>
        )}
      </div>

      {/* Description */}
      <p className="text-sm text-gray-600 dark:text-gray-400 mb-4 line-clamp-2">
        {agent.description || 'No description'}
      </p>

      {/* Tools */}
      {agent.tools && agent.tools.length > 0 && (
        <div className="mb-4">
          <div className="flex items-center gap-1.5 mb-2">
            <Wrench className="w-3.5 h-3.5 text-gray-500 dark:text-gray-400" />
            <span className="text-xs text-gray-500 dark:text-gray-400">Tools</span>
          </div>
          <div className="flex flex-wrap gap-1">
            {agent.tools.slice(0, 4).map((tool) => (
              <span
                key={tool}
                className="px-2 py-0.5 bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400 text-xs rounded"
              >
                {tool}
              </span>
            ))}
            {agent.tools.length > 4 && (
              <span className="px-2 py-0.5 bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400 text-xs rounded">
                +{agent.tools.length - 4}
              </span>
            )}
          </div>
        </div>
      )}

      {/* Footer */}
      <div className="flex items-center justify-between pt-3 border-t border-gray-100 dark:border-gray-700">
        <div className="flex items-center gap-1.5 text-xs text-gray-500 dark:text-gray-400">
          <FileCode className="w-3.5 h-3.5" />
          <span className="truncate max-w-[150px]" title={agent.file_path}>
            {agent.file_path.split('/').pop()}
          </span>
        </div>
        {agent.model && (
          <div className="flex items-center gap-1.5 text-xs text-gray-500 dark:text-gray-400">
            <Settings className="w-3.5 h-3.5" />
            <span>{agent.model}</span>
          </div>
        )}
      </div>
    </div>
  )
}
