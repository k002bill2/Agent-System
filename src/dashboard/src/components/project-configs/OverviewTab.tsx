import { useState } from 'react'
import { FolderCode, Sparkles, Bot, Server, Webhook, Terminal, ScrollText, Brain, Clock, Trash2, Loader2 } from 'lucide-react'
import { useProjectConfigsStore } from '../../stores/projectConfigs'

export function OverviewTab() {
  const { selectedProject, isLoadingProject, removeProject, selectProject } = useProjectConfigsStore()
  const [isRemoving, setIsRemoving] = useState(false)
  const [showConfirm, setShowConfirm] = useState(false)
  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({})

  const toggleSection = (section: string) => {
    setExpandedSections((prev) => ({ ...prev, [section]: !prev[section] }))
  }

  if (isLoadingProject) {
    return (
      <div className="p-6 space-y-6">
        <div className="h-24 bg-gray-100 dark:bg-gray-800 rounded-lg animate-pulse" />
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-24 bg-gray-100 dark:bg-gray-800 rounded-lg animate-pulse" />
          ))}
        </div>
      </div>
    )
  }

  if (!selectedProject) {
    return (
      <div className="flex items-center justify-center h-full text-gray-500 dark:text-gray-400">
        Select a project to view details
      </div>
    )
  }

  const { project, skills, agents, mcp_servers, user_mcp_servers, hooks, commands, rules, memories } = selectedProject
  const totalMCPCount = mcp_servers.length + (user_mcp_servers?.length || 0)
  const enabledMCPCount = mcp_servers.filter((s) => !s.disabled).length +
    (user_mcp_servers?.filter((s) => !s.disabled).length || 0)

  return (
    <div className="p-6 h-full space-y-6 overflow-y-auto">
      {/* Project Header */}
      <div className="bg-white dark:bg-gray-800 rounded-lg p-6 border border-gray-200 dark:border-gray-700">
        <div className="flex items-start gap-4">
          <div className="p-3 bg-primary-100 dark:bg-primary-900/30 rounded-lg">
            <FolderCode className="w-6 h-6 text-primary-600 dark:text-primary-400" />
          </div>
          <div className="flex-1">
            <h2 className="text-xl font-semibold text-gray-900 dark:text-white">
              {project.project_name}
            </h2>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
              {project.project_path}
            </p>
            <div className="flex items-center gap-2 mt-2 text-sm text-gray-500 dark:text-gray-400">
              <Clock className="w-4 h-4" />
              Last modified: {new Date(project.last_modified).toLocaleString()}
            </div>
          </div>
          {/* Remove Button */}
          <button
            onClick={() => setShowConfirm(true)}
            disabled={isRemoving}
            className="p-2 text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors disabled:opacity-50"
            title="Remove from list"
          >
            {isRemoving ? (
              <Loader2 className="w-5 h-5 animate-spin" />
            ) : (
              <Trash2 className="w-5 h-5" />
            )}
          </button>
        </div>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-4">
        <StatCard
          icon={Sparkles}
          label="Skills"
          count={skills.length}
          color="text-purple-600 dark:text-purple-400"
          bgColor="bg-purple-100 dark:bg-purple-900/30"
        />
        <StatCard
          icon={Bot}
          label="Agents"
          count={agents.length}
          color="text-blue-600 dark:text-blue-400"
          bgColor="bg-blue-100 dark:bg-blue-900/30"
        />
        <StatCard
          icon={Terminal}
          label="Commands"
          count={commands.length}
          color="text-teal-600 dark:text-teal-400"
          bgColor="bg-teal-100 dark:bg-teal-900/30"
        />
        <StatCard
          icon={ScrollText}
          label="Rules"
          count={rules?.length ?? 0}
          color="text-amber-600 dark:text-amber-400"
          bgColor="bg-amber-100 dark:bg-amber-900/30"
        />
        <StatCard
          icon={Brain}
          label="Memory"
          count={memories?.length ?? 0}
          color="text-rose-600 dark:text-rose-400"
          bgColor="bg-rose-100 dark:bg-rose-900/30"
        />
        <StatCard
          icon={Server}
          label="MCP Servers"
          count={totalMCPCount}
          subCount={enabledMCPCount}
          subLabel="enabled"
          color="text-green-600 dark:text-green-400"
          bgColor="bg-green-100 dark:bg-green-900/30"
        />
        <StatCard
          icon={Webhook}
          label="Hooks"
          count={hooks.length}
          color="text-orange-600 dark:text-orange-400"
          bgColor="bg-orange-100 dark:bg-orange-900/30"
        />
      </div>

      {/* Quick Lists */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {/* Skills List */}
        <div className="bg-white dark:bg-gray-800 rounded-lg p-4 border border-gray-200 dark:border-gray-700">
          <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-3 flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-purple-500" />
            Skills
          </h3>
          <div className="space-y-2">
            {(expandedSections.skills ? skills : skills.slice(0, 5)).map((skill) => (
              <div
                key={skill.skill_id}
                className="text-sm text-gray-600 dark:text-gray-300 flex items-center gap-2"
              >
                <span className="font-medium">{skill.name}</span>
                {skill.model && (
                  <span className="text-xs px-1.5 py-0.5 bg-gray-100 dark:bg-gray-700 rounded">
                    {skill.model}
                  </span>
                )}
              </div>
            ))}
            {skills.length > 5 && (
              <button
                onClick={() => toggleSection('skills')}
                className="text-xs text-primary-500 hover:text-primary-400 cursor-pointer transition-colors"
              >
                {expandedSections.skills ? 'Show less' : `+${skills.length - 5} more`}
              </button>
            )}
            {skills.length === 0 && (
              <p className="text-sm text-gray-500">No skills found</p>
            )}
          </div>
        </div>

        {/* Agents List */}
        <div className="bg-white dark:bg-gray-800 rounded-lg p-4 border border-gray-200 dark:border-gray-700">
          <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-3 flex items-center gap-2">
            <Bot className="w-4 h-4 text-blue-500" />
            Agents
          </h3>
          <div className="space-y-2">
            {(expandedSections.agents ? agents : agents.slice(0, 5)).map((agent) => (
              <div
                key={agent.agent_id}
                className="text-sm text-gray-600 dark:text-gray-300 flex items-center gap-2"
              >
                <span className="font-medium">{agent.name}</span>
                {agent.is_shared && (
                  <span className="text-xs px-1.5 py-0.5 bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-400 rounded">
                    shared
                  </span>
                )}
                {agent.model && (
                  <span className="text-xs px-1.5 py-0.5 bg-gray-100 dark:bg-gray-700 rounded">
                    {agent.model}
                  </span>
                )}
              </div>
            ))}
            {agents.length > 5 && (
              <button
                onClick={() => toggleSection('agents')}
                className="text-xs text-primary-500 hover:text-primary-400 cursor-pointer transition-colors"
              >
                {expandedSections.agents ? 'Show less' : `+${agents.length - 5} more`}
              </button>
            )}
            {agents.length === 0 && (
              <p className="text-sm text-gray-500">No agents found</p>
            )}
          </div>
        </div>

        {/* Commands List */}
        <div className="bg-white dark:bg-gray-800 rounded-lg p-4 border border-gray-200 dark:border-gray-700">
          <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-3 flex items-center gap-2">
            <Terminal className="w-4 h-4 text-teal-500" />
            Commands
          </h3>
          <div className="space-y-2">
            {(expandedSections.commands ? commands : commands.slice(0, 5)).map((cmd) => (
              <div
                key={cmd.command_id}
                className="text-sm text-gray-600 dark:text-gray-300 flex items-center gap-2"
              >
                <span className="font-medium">/{cmd.command_id}</span>
                {cmd.description && (
                  <span className="text-xs text-gray-500 dark:text-gray-400 truncate">
                    {cmd.description}
                  </span>
                )}
              </div>
            ))}
            {commands.length > 5 && (
              <button
                onClick={() => toggleSection('commands')}
                className="text-xs text-primary-500 hover:text-primary-400 cursor-pointer transition-colors"
              >
                {expandedSections.commands ? 'Show less' : `+${commands.length - 5} more`}
              </button>
            )}
            {commands.length === 0 && (
              <p className="text-sm text-gray-500">No commands found</p>
            )}
          </div>
        </div>

        {/* Rules List */}
        <div className="bg-white dark:bg-gray-800 rounded-lg p-4 border border-gray-200 dark:border-gray-700">
          <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-3 flex items-center gap-2">
            <ScrollText className="w-4 h-4 text-amber-500" />
            Rules
          </h3>
          <div className="space-y-2">
            {(expandedSections.rules ? (rules ?? []) : (rules ?? []).slice(0, 5)).map((rule) => (
              <div
                key={rule.rule_id}
                className="text-sm text-gray-600 dark:text-gray-300 flex items-center gap-2"
              >
                <span className="font-medium">{rule.name}</span>
                {rule.is_global && (
                  <span className="text-xs px-1.5 py-0.5 bg-teal-100 dark:bg-teal-900/30 text-teal-700 dark:text-teal-400 rounded">
                    global
                  </span>
                )}
              </div>
            ))}
            {(rules?.length ?? 0) > 5 && (
              <button
                onClick={() => toggleSection('rules')}
                className="text-xs text-primary-500 hover:text-primary-400 cursor-pointer transition-colors"
              >
                {expandedSections.rules ? 'Show less' : `+${(rules?.length ?? 0) - 5} more`}
              </button>
            )}
            {(rules?.length ?? 0) === 0 && (
              <p className="text-sm text-gray-500">No rules found</p>
            )}
          </div>
        </div>

        {/* Memory List */}
        <div className="bg-white dark:bg-gray-800 rounded-lg p-4 border border-gray-200 dark:border-gray-700">
          <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-3 flex items-center gap-2">
            <Brain className="w-4 h-4 text-rose-500" />
            Memory
          </h3>
          <div className="space-y-2">
            {(expandedSections.memory ? (memories ?? []) : (memories ?? []).slice(0, 5)).map((memory) => (
              <div
                key={memory.memory_id}
                className="text-sm text-gray-600 dark:text-gray-300 flex items-center gap-2"
              >
                <span className="font-medium">{memory.name}</span>
                <span className="text-xs px-1.5 py-0.5 bg-gray-100 dark:bg-gray-700 rounded">
                  {memory.memory_type}
                </span>
              </div>
            ))}
            {(memories?.length ?? 0) > 5 && (
              <button
                onClick={() => toggleSection('memory')}
                className="text-xs text-primary-500 hover:text-primary-400 cursor-pointer transition-colors"
              >
                {expandedSections.memory ? 'Show less' : `+${(memories?.length ?? 0) - 5} more`}
              </button>
            )}
            {(memories?.length ?? 0) === 0 && (
              <p className="text-sm text-gray-500">No memory entries found</p>
            )}
          </div>
        </div>
      </div>

      {/* Remove Confirmation Modal */}
      {showConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/50" onClick={() => setShowConfirm(false)} />
          <div className="relative bg-white dark:bg-gray-800 rounded-lg shadow-xl w-full max-w-md mx-4 p-6">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
              Remove Project from List?
            </h3>
            <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
              This will remove <span className="font-medium text-gray-700 dark:text-gray-300">{project.project_name}</span> from the monitoring list.
            </p>
            <div className="p-3 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg mb-4">
              <p className="text-sm text-green-700 dark:text-green-400">
                Your source files will NOT be deleted.
              </p>
            </div>
            <div className="flex justify-end gap-3">
              <button
                onClick={() => setShowConfirm(false)}
                className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 dark:bg-gray-700 dark:text-gray-200 dark:border-gray-600 dark:hover:bg-gray-600"
              >
                Cancel
              </button>
              <button
                onClick={async () => {
                  setIsRemoving(true)
                  setShowConfirm(false)
                  await removeProject(project.project_id)
                  selectProject(null)
                  setIsRemoving(false)
                }}
                className="px-4 py-2 text-sm font-medium text-white bg-red-600 hover:bg-red-700 rounded-lg"
              >
                Remove
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

interface StatCardProps {
  icon: React.ComponentType<{ className?: string }>
  label: string
  count: number
  subCount?: number
  subLabel?: string
  color: string
  bgColor: string
}

function StatCard({ icon: Icon, label, count, subCount, subLabel, color, bgColor }: StatCardProps) {
  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg p-4 border border-gray-200 dark:border-gray-700">
      <div className="flex items-center gap-3">
        <div className={`p-2 rounded-lg ${bgColor}`}>
          <Icon className={`w-5 h-5 ${color}`} />
        </div>
        <div>
          <p className="text-2xl font-bold text-gray-900 dark:text-white">{count}</p>
          <p className="text-xs text-gray-500 dark:text-gray-400">
            {label}
            {subCount !== undefined && subLabel && (
              <span className="ml-1">({subCount} {subLabel})</span>
            )}
          </p>
        </div>
      </div>
    </div>
  )
}
