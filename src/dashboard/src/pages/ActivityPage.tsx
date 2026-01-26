import { useState } from 'react'
import { useOrchestrationStore } from '../stores/orchestration'
import { useNavigationStore } from '../stores/navigation'
import { useClaudeCodeActivityStore } from '../stores/claudeCodeActivity'
import { cn } from '../lib/utils'
import { ProjectFilter, ProjectBadge } from '../components/ProjectFilter'
import { DataSourceToggle } from '../components/DataSourceToggle'
import { ClaudeCodeActivity } from '../components/ClaudeCodeActivity'
import {
  Filter,
  User,
  Bot,
  AlertTriangle,
  Info,
  Lightbulb,
  Zap,
  Trash2,
} from 'lucide-react'

const typeFilters = [
  { label: 'All', value: 'all' },
  { label: 'User', value: 'user' },
  { label: 'System', value: 'system' },
  { label: 'Thinking', value: 'thinking' },
  { label: 'Action', value: 'action' },
  { label: 'Error', value: 'error' },
]

const typeIcons: Record<string, typeof User> = {
  user: User,
  system: Info,
  thinking: Lightbulb,
  action: Zap,
  error: AlertTriangle,
}

const typeColors: Record<string, string> = {
  user: 'text-blue-500 bg-blue-100 dark:bg-blue-900/30',
  system: 'text-gray-500 bg-gray-100 dark:bg-gray-700',
  thinking: 'text-purple-500 bg-purple-100 dark:bg-purple-900/30',
  action: 'text-green-500 bg-green-100 dark:bg-green-900/30',
  error: 'text-red-500 bg-red-100 dark:bg-red-900/30',
}

function AOSActivity() {
  const { messages, agents, sessionProjectId } = useOrchestrationStore()
  const { projectFilter } = useNavigationStore()
  const [typeFilter, setTypeFilter] = useState<string>('all')
  const [agentFilter, setAgentFilter] = useState<string>('all')

  const agentList = Object.values(agents)

  // Filter by project (single session, so use sessionProjectId)
  const projectFilteredMessages = projectFilter
    ? (sessionProjectId === projectFilter ? messages : [])
    : messages

  const filteredMessages = projectFilteredMessages.filter((msg) => {
    if (typeFilter !== 'all' && msg.type !== typeFilter) return false
    if (agentFilter !== 'all' && msg.agentId !== agentFilter) return false
    return true
  })

  const clearMessages = () => {
    console.log('Clear messages')
  }

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* Filters */}
      <div className="p-4 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between">
        <div className="flex items-center gap-4">
          {/* Type Filter */}
          <div className="flex items-center gap-2">
            <Filter className="w-4 h-4 text-gray-500" />
            <div className="flex gap-1">
              {typeFilters.map((f) => (
                <button
                  key={f.value}
                  onClick={() => setTypeFilter(f.value)}
                  className={cn(
                    'px-2 py-1 text-xs rounded-md transition-colors',
                    typeFilter === f.value
                      ? 'bg-primary-100 text-primary-700 dark:bg-primary-900/30 dark:text-primary-400'
                      : 'text-gray-600 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-700'
                  )}
                >
                  {f.label}
                </button>
              ))}
            </div>
          </div>

          {/* Agent Filter */}
          {agentList.length > 0 && (
            <div className="flex items-center gap-2">
              <Bot className="w-4 h-4 text-gray-500" />
              <select
                value={agentFilter}
                onChange={(e) => setAgentFilter(e.target.value)}
                className="text-xs bg-transparent border border-gray-200 dark:border-gray-700 rounded-md px-2 py-1 text-gray-600 dark:text-gray-400"
              >
                <option value="all">All Agents</option>
                {agentList.map((agent) => (
                  <option key={agent.id} value={agent.id}>
                    {agent.name}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Project Filter */}
          <ProjectFilter />
        </div>

        {/* Clear Button */}
        <button
          onClick={clearMessages}
          className="flex items-center gap-1 px-2 py-1 text-xs text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300 transition-colors"
        >
          <Trash2 className="w-3 h-3" />
          Clear
        </button>
      </div>

      {/* Message List */}
      <div className="flex-1 overflow-y-auto p-4 space-y-2">
        {filteredMessages.length === 0 ? (
          <div className="text-center py-12 text-gray-500 dark:text-gray-400">
            <Info className="w-12 h-12 mx-auto mb-4 opacity-50" />
            <p>No activity to display</p>
            <p className="text-sm mt-1">Messages will appear here as agents work</p>
          </div>
        ) : (
          filteredMessages.map((msg) => {
            const Icon = typeIcons[msg.type] || Info
            const colorClass = typeColors[msg.type] || typeColors.system
            const agent = msg.agentId ? agents[msg.agentId] : null

            return (
              <div
                key={msg.id}
                className="flex items-start gap-3 p-3 bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700"
              >
                <div className={cn('w-8 h-8 rounded-lg flex items-center justify-center', colorClass)}>
                  <Icon className="w-4 h-4" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">
                      {msg.type}
                    </span>
                    {agent && (
                      <>
                        <span className="text-gray-300 dark:text-gray-600">|</span>
                        <span className="text-xs text-gray-500 dark:text-gray-400">
                          {agent.name}
                        </span>
                      </>
                    )}
                    <span className="text-gray-300 dark:text-gray-600">|</span>
                    <span className="text-xs text-gray-400 dark:text-gray-500">
                      {new Date(msg.timestamp).toLocaleTimeString()}
                    </span>
                    {!projectFilter && sessionProjectId && (
                      <>
                        <span className="text-gray-300 dark:text-gray-600">|</span>
                        <ProjectBadge projectId={sessionProjectId} />
                      </>
                    )}
                  </div>
                  <p className="text-sm text-gray-900 dark:text-white whitespace-pre-wrap break-words">
                    {msg.content}
                  </p>
                </div>
              </div>
            )
          })
        )}
      </div>
    </div>
  )
}

export function ActivityPage() {
  const { dataSource, setDataSource } = useClaudeCodeActivityStore()

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* Data Source Toggle Header */}
      <div className="px-4 py-3 border-b border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800">
        <DataSourceToggle
          value={dataSource}
          onChange={setDataSource}
        />
      </div>

      {/* Content based on data source */}
      {dataSource === 'aos' ? (
        <AOSActivity />
      ) : (
        <ClaudeCodeActivity />
      )}
    </div>
  )
}
