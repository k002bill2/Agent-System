import { cn } from '../../lib/utils'
import { Bot, Code, Shield, ChevronDown, ChevronUp } from 'lucide-react'
import { useState } from 'react'
import { useProjectConfigsStore, AgentConfig } from '../../stores/projectConfigs'

export function AgentsTab() {
  const { selectedProject, isLoadingProject } = useProjectConfigsStore()
  const [expandedAgent, setExpandedAgent] = useState<string | null>(null)

  if (isLoadingProject) {
    return (
      <div className="p-6 space-y-4">
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-24 bg-gray-100 dark:bg-gray-800 rounded-lg animate-pulse" />
        ))}
      </div>
    )
  }

  if (!selectedProject) {
    return (
      <div className="flex items-center justify-center h-full text-gray-500 dark:text-gray-400">
        Select a project to view agents
      </div>
    )
  }

  const { agents } = selectedProject

  // Separate regular and shared agents
  const regularAgents = agents.filter((a) => !a.is_shared)
  const sharedAgents = agents.filter((a) => a.is_shared)

  return (
    <div className="p-6 overflow-y-auto">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white flex items-center gap-2">
          <Bot className="w-5 h-5 text-blue-500" />
          Agents ({agents.length})
        </h3>
      </div>

      {agents.length === 0 ? (
        <div className="text-center py-12 text-gray-500 dark:text-gray-400">
          <Bot className="w-12 h-12 mx-auto mb-3 opacity-50" />
          <p>No agents found in this project</p>
          <p className="text-sm mt-1">
            Create an agent in .claude/agents/your-agent.md
          </p>
        </div>
      ) : (
        <div className="space-y-6">
          {/* Regular Agents */}
          {regularAgents.length > 0 && (
            <div>
              <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">
                Project Agents ({regularAgents.length})
              </h4>
              <div className="space-y-3">
                {regularAgents.map((agent) => (
                  <AgentCard
                    key={agent.agent_id}
                    agent={agent}
                    isExpanded={expandedAgent === agent.agent_id}
                    onToggle={() =>
                      setExpandedAgent(expandedAgent === agent.agent_id ? null : agent.agent_id)
                    }
                  />
                ))}
              </div>
            </div>
          )}

          {/* Shared Agents */}
          {sharedAgents.length > 0 && (
            <div>
              <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-3 flex items-center gap-2">
                <Shield className="w-4 h-4 text-yellow-500" />
                Shared Agents ({sharedAgents.length})
              </h4>
              <div className="space-y-3">
                {sharedAgents.map((agent) => (
                  <AgentCard
                    key={agent.agent_id}
                    agent={agent}
                    isExpanded={expandedAgent === agent.agent_id}
                    onToggle={() =>
                      setExpandedAgent(expandedAgent === agent.agent_id ? null : agent.agent_id)
                    }
                  />
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

interface AgentCardProps {
  agent: AgentConfig
  isExpanded: boolean
  onToggle: () => void
}

function AgentCard({ agent, isExpanded, onToggle }: AgentCardProps) {
  const modelColors: Record<string, string> = {
    opus: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
    sonnet: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
    haiku: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
  }

  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden">
      <button
        onClick={onToggle}
        className="w-full p-4 text-left flex items-start gap-4 hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors"
      >
        <div
          className={cn(
            'p-2 rounded-lg',
            agent.is_shared
              ? 'bg-yellow-100 dark:bg-yellow-900/30'
              : 'bg-blue-100 dark:bg-blue-900/30'
          )}
        >
          <Bot
            className={cn(
              'w-5 h-5',
              agent.is_shared
                ? 'text-yellow-600 dark:text-yellow-400'
                : 'text-blue-600 dark:text-blue-400'
            )}
          />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h4 className="font-medium text-gray-900 dark:text-white">{agent.name}</h4>
            {agent.model && (
              <span
                className={cn(
                  'text-xs px-1.5 py-0.5 rounded font-medium',
                  modelColors[agent.model] || 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-400'
                )}
              >
                {agent.model}
              </span>
            )}
            {agent.role && (
              <span className="text-xs px-1.5 py-0.5 bg-gray-100 dark:bg-gray-700 rounded text-gray-600 dark:text-gray-400">
                {agent.role}
              </span>
            )}
            {agent.is_shared && (
              <span className="text-xs px-1.5 py-0.5 bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-400 rounded">
                shared
              </span>
            )}
          </div>
          {agent.description && (
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1 line-clamp-2">
              {agent.description}
            </p>
          )}
          {agent.tools.length > 0 && (
            <div className="flex items-center gap-1 mt-2 text-xs text-gray-500 dark:text-gray-400">
              <Code className="w-3 h-3" />
              <span>{agent.tools.join(', ')}</span>
            </div>
          )}
        </div>
        {isExpanded ? (
          <ChevronUp className="w-5 h-5 text-gray-400" />
        ) : (
          <ChevronDown className="w-5 h-5 text-gray-400" />
        )}
      </button>

      {isExpanded && agent.ace_capabilities && (
        <div className="border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900 p-4">
          <h5 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
            ACE Capabilities
          </h5>
          <pre className="text-xs text-gray-600 dark:text-gray-400 overflow-x-auto">
            {JSON.stringify(agent.ace_capabilities, null, 2)}
          </pre>
        </div>
      )}
    </div>
  )
}
