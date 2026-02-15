import { useEffect } from 'react'
import { cn } from '../lib/utils'
import { LayoutGrid, Sparkles, Bot, Server, Webhook, Terminal, RefreshCw, AlertCircle } from 'lucide-react'
import {
  ProjectList,
  OverviewTab,
  SkillsTab,
  AgentsTab,
  MCPTab,
  HooksTab,
  CommandsTab,
} from '../components/project-configs'
import { useProjectConfigsStore, TabType } from '../stores/projectConfigs'

const tabs: { id: TabType; label: string; icon: typeof LayoutGrid }[] = [
  { id: 'overview', label: 'Overview', icon: LayoutGrid },
  { id: 'skills', label: 'Skills', icon: Sparkles },
  { id: 'agents', label: 'Agents', icon: Bot },
  { id: 'commands', label: 'Commands', icon: Terminal },
  { id: 'mcp', label: 'MCP', icon: Server },
  { id: 'hooks', label: 'Hooks', icon: Webhook },
]

export function ProjectConfigsPage() {
  const fetchProjects = useProjectConfigsStore(s => s.fetchProjects)
  const startStreaming = useProjectConfigsStore(s => s.startStreaming)
  const stopStreaming = useProjectConfigsStore(s => s.stopStreaming)
  const activeTab = useProjectConfigsStore(s => s.activeTab)
  const setActiveTab = useProjectConfigsStore(s => s.setActiveTab)
  const error = useProjectConfigsStore(s => s.error)
  const clearError = useProjectConfigsStore(s => s.clearError)
  const refresh = useProjectConfigsStore(s => s.refresh)
  const isLoading = useProjectConfigsStore(s => s.isLoading)
  const selectedProject = useProjectConfigsStore(s => s.selectedProject)

  useEffect(() => {
    fetchProjects()
    startStreaming()

    return () => {
      stopStreaming()
    }
  }, [fetchProjects, startStreaming, stopStreaming])

  const renderTabContent = () => {
    switch (activeTab) {
      case 'overview':
        return <OverviewTab />
      case 'skills':
        return <SkillsTab />
      case 'agents':
        return <AgentsTab />
      case 'mcp':
        return <MCPTab />
      case 'commands':
        return <CommandsTab />
      case 'hooks':
        return <HooksTab />
      default:
        return <OverviewTab />
    }
  }

  return (
    <div className="flex-1 flex overflow-hidden">
      {/* Project List Sidebar */}
      <div className="w-72 border-r border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 flex flex-col">
        <ProjectList />
      </div>

      {/* Main Content */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Error Banner */}
        {error && (
          <div className="bg-red-50 dark:bg-red-900/20 border-b border-red-200 dark:border-red-800 px-4 py-2 flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-red-500" />
            <span className="text-sm text-red-700 dark:text-red-400 flex-1">{error}</span>
            <button
              onClick={clearError}
              className="text-red-500 hover:text-red-700 text-sm font-medium"
            >
              Dismiss
            </button>
          </div>
        )}

        {/* Tab Bar */}
        <div className="border-b border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800">
          <div className="flex items-center justify-between px-4">
            <div className="flex -mb-px">
              {tabs.map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={cn(
                    'flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-colors',
                    activeTab === tab.id
                      ? 'border-primary-500 text-primary-600 dark:text-primary-400'
                      : 'border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300'
                  )}
                >
                  <tab.icon className="w-4 h-4" />
                  {tab.label}
                  {tab.id === 'skills' && selectedProject?.skills?.length ? (
                    <span className="ml-1 text-xs bg-gray-100 dark:bg-gray-700 px-1.5 py-0.5 rounded">
                      {selectedProject.skills.length}
                    </span>
                  ) : null}
                  {tab.id === 'agents' && selectedProject?.agents?.length ? (
                    <span className="ml-1 text-xs bg-gray-100 dark:bg-gray-700 px-1.5 py-0.5 rounded">
                      {selectedProject.agents.length}
                    </span>
                  ) : null}
                  {tab.id === 'mcp' && selectedProject?.mcp_servers?.length ? (
                    <span className="ml-1 text-xs bg-gray-100 dark:bg-gray-700 px-1.5 py-0.5 rounded">
                      {selectedProject.mcp_servers.length}
                    </span>
                  ) : null}
                  {tab.id === 'commands' && selectedProject?.commands?.length ? (
                    <span className="ml-1 text-xs bg-gray-100 dark:bg-gray-700 px-1.5 py-0.5 rounded">
                      {selectedProject.commands.length}
                    </span>
                  ) : null}
                  {tab.id === 'hooks' && selectedProject?.hooks?.length ? (
                    <span className="ml-1 text-xs bg-gray-100 dark:bg-gray-700 px-1.5 py-0.5 rounded">
                      {selectedProject.hooks.length}
                    </span>
                  ) : null}
                </button>
              ))}
            </div>

            {/* Refresh Button */}
            <button
              onClick={refresh}
              disabled={isLoading}
              className={cn(
                'p-2 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300 rounded transition-colors',
                isLoading && 'animate-spin'
              )}
              title="Refresh"
            >
              <RefreshCw className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Tab Content */}
        <div className="flex-1 overflow-hidden bg-gray-50 dark:bg-gray-900">
          {renderTabContent()}
        </div>
      </div>
    </div>
  )
}
