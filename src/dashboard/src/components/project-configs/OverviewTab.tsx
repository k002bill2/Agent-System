import { FolderCode, Sparkles, Bot, Server, Webhook, Clock } from 'lucide-react'
import { useProjectConfigsStore } from '../../stores/projectConfigs'

export function OverviewTab() {
  const { selectedProject, isLoadingProject } = useProjectConfigsStore()

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

  const { project, skills, agents, mcp_servers, hooks } = selectedProject

  return (
    <div className="p-6 space-y-6 overflow-y-auto">
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
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1 font-mono">
              {project.project_path}
            </p>
            <div className="flex items-center gap-2 mt-2 text-sm text-gray-500 dark:text-gray-400">
              <Clock className="w-4 h-4" />
              Last modified: {new Date(project.last_modified).toLocaleString()}
            </div>
          </div>
        </div>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
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
          icon={Server}
          label="MCP Servers"
          count={mcp_servers.length}
          subCount={mcp_servers.filter((s) => !s.disabled).length}
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
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Skills List */}
        <div className="bg-white dark:bg-gray-800 rounded-lg p-4 border border-gray-200 dark:border-gray-700">
          <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-3 flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-purple-500" />
            Skills
          </h3>
          <div className="space-y-2">
            {skills.slice(0, 5).map((skill) => (
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
              <p className="text-xs text-gray-500">+{skills.length - 5} more</p>
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
            {agents.slice(0, 5).map((agent) => (
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
              <p className="text-xs text-gray-500">+{agents.length - 5} more</p>
            )}
            {agents.length === 0 && (
              <p className="text-sm text-gray-500">No agents found</p>
            )}
          </div>
        </div>
      </div>
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
