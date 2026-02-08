/**
 * Agents Page
 *
 * Agent Registry의 등록된 에이전트, 통계, 태스크 분석 UI를 표시합니다.
 */

import { useEffect, useState, useMemo } from 'react'
import { useOrchestrationStore, TaskStatus, Project } from '../stores/orchestration'
import { useAgentsStore, AgentCategory } from '../stores/agents'
import { useNavigationStore } from '../stores/navigation'
import { useProjectConfigsStore } from '../stores/projectConfigs'
import { cn } from '../lib/utils'
import { ProjectFilter, ProjectBadge } from '../components/ProjectFilter'
import { AgentCard } from '../components/AgentCard'
import { AgentStatsPanel } from '../components/AgentStatsPanel'
import { TaskAnalyzer } from '../components/TaskAnalyzer'
import { MCPManagerTab } from '../components/mcp/MCPManagerTab'
import { FeedbackHistoryPanel, DatasetPanel, AgentEvalPanel } from '../components/feedback'
import { useFeedbackStore } from '../stores/feedback'
import { ProjectAgentCard } from '../components/ProjectAgentCard'
import {
  Bot,
  CheckCircle,
  Clock,
  AlertCircle,
  Circle,
  XCircle,
  Pause,
  Code,
  Layers,
  TestTube,
  Search,
  Filter,
  RefreshCw,
  Sparkles,
  Server,
  MessageSquare,
} from 'lucide-react'

// Orchestration agent status icons
const statusIcons: Record<TaskStatus, typeof CheckCircle> = {
  pending: Circle,
  in_progress: Clock,
  completed: CheckCircle,
  failed: AlertCircle,
  cancelled: XCircle,
  paused: Pause,
}

const statusColors: Record<TaskStatus, string> = {
  pending: 'text-gray-400',
  in_progress: 'text-blue-500',
  completed: 'text-green-500',
  failed: 'text-red-500',
  cancelled: 'text-gray-500',
  paused: 'text-yellow-500',
}

const statusBgColors: Record<TaskStatus, string> = {
  pending: 'bg-gray-100 dark:bg-gray-700',
  in_progress: 'bg-blue-100 dark:bg-blue-900/30',
  completed: 'bg-green-100 dark:bg-green-900/30',
  failed: 'bg-red-100 dark:bg-red-900/30',
  cancelled: 'bg-gray-100 dark:bg-gray-700',
  paused: 'bg-yellow-100 dark:bg-yellow-900/30',
}

// Category filter options
const categoryOptions: { value: AgentCategory | null; label: string; icon: typeof Code }[] = [
  { value: null, label: 'All', icon: Bot },
  { value: 'development', label: 'Development', icon: Code },
  { value: 'orchestration', label: 'Orchestration', icon: Layers },
  { value: 'quality', label: 'Quality', icon: TestTube },
  { value: 'research', label: 'Research', icon: Search },
]

type TabType = 'registry' | 'analyzer' | 'active' | 'mcp' | 'feedback'

export function AgentsPage() {
  // Orchestration store (active agents)
  const { agents: orchestrationAgents, tasks, activeAgentId, sessionProjectId } = useOrchestrationStore()
  const { projectFilter } = useNavigationStore()

  // Agent Registry store
  const {
    agents: registryAgents,
    stats,
    isLoading,
    error,
    selectedAgentId,
    categoryFilter,
    fetchAgents,
    fetchStats,
    setSelectedAgent,
    setCategoryFilter,
    clearError,
  } = useAgentsStore()

  // Project Configs store (for project-specific agents)
  const {
    allAgents: projectAgents,
    fetchAllAgents,
    isLoadingAll: isLoadingProjectAgents,
  } = useProjectConfigsStore()

  // Feedback store (for count)
  const { feedbacks, fetchFeedbacks } = useFeedbackStore()

  // Local state
  const [activeTab, setActiveTab] = useState<TabType>('registry')

  // Fetch agents and stats on mount
  useEffect(() => {
    fetchAgents()
    fetchStats()
    fetchFeedbacks()
    fetchAllAgents()
  }, [fetchAgents, fetchStats, fetchFeedbacks, fetchAllAgents])

  // Get selected project info from orchestration store
  const { projects } = useOrchestrationStore()
  const selectedProject = useMemo(() =>
    projects.find(p => p.id === projectFilter),
    [projects, projectFilter]
  )

  // Filter project agents by selected project path
  // Note: project-configs uses path-based IDs like "-Users-younghwankang-Work-Agent-System"
  // while orchestration uses custom IDs like "agent-orchestration"
  const filteredProjectAgents = useMemo(() => {
    if (!projectFilter || !selectedProject) return []
    // Convert path to project-configs ID format (replace / with -)
    const configProjectId = selectedProject.path.replace(/\//g, '-')
    return projectAgents.filter((agent) => agent.project_id === configProjectId)
  }, [projectAgents, projectFilter, selectedProject])

  // Orchestration agents
  const agentList = Object.values(orchestrationAgents)
  const filteredOrchestrationAgents = projectFilter
    ? sessionProjectId === projectFilter
      ? agentList
      : []
    : agentList

  const handleRefresh = () => {
    fetchAgents(categoryFilter || undefined)
    fetchStats()
    fetchAllAgents()
  }

  // Determine which agents to show based on project filter
  const isProjectFiltered = !!projectFilter
  const displayAgentCount = isProjectFiltered ? filteredProjectAgents.length : registryAgents.length + projectAgents.length

  const pendingFeedbackCount = feedbacks.filter((f) => f.status === 'pending').length

  const tabs = [
    { id: 'registry' as const, label: 'Agent Registry', icon: Bot, count: displayAgentCount },
    { id: 'analyzer' as const, label: 'Task Analyzer', icon: Sparkles },
    { id: 'active' as const, label: 'Active Agents', icon: Clock, count: filteredOrchestrationAgents.length },
    { id: 'mcp' as const, label: 'MCP Manager', icon: Server },
    { id: 'feedback' as const, label: 'Feedback', icon: MessageSquare, count: pendingFeedbackCount || undefined },
  ]

  return (
    <div className="flex-1 p-6 overflow-y-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-xl font-semibold text-gray-900 dark:text-white">Agents</h2>
        <div className="flex items-center gap-3">
          <button
            onClick={handleRefresh}
            disabled={isLoading}
            className={cn(
              'p-2 rounded-lg border border-gray-200 dark:border-gray-700 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors',
              isLoading && 'opacity-50 cursor-not-allowed'
            )}
          >
            <RefreshCw className={cn('w-4 h-4 text-gray-600 dark:text-gray-400', isLoading && 'animate-spin')} />
          </button>
          <ProjectFilter />
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-6 bg-gray-100 dark:bg-gray-800 rounded-lg p-1">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={cn(
              'flex-1 flex items-center justify-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-colors',
              activeTab === tab.id
                ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm'
                : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white'
            )}
          >
            <tab.icon className="w-4 h-4" />
            {tab.label}
            {tab.count !== undefined && tab.count > 0 && (
              <span className="px-1.5 py-0.5 bg-gray-200 dark:bg-gray-600 text-gray-600 dark:text-gray-300 text-xs rounded-full">
                {tab.count}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Error Banner */}
      {error && (
        <div className="mb-6 p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
          <div className="flex items-center gap-2 text-red-600 dark:text-red-400">
            <AlertCircle className="w-4 h-4" />
            <span className="text-sm">{error}</span>
            <button onClick={clearError} className="ml-auto text-red-500 hover:text-red-600 text-sm">
              Dismiss
            </button>
          </div>
        </div>
      )}

      {/* Tab Content */}
      {activeTab === 'registry' && (
        <div className="space-y-6">
          {/* Stats Panel - only show for global view */}
          {!isProjectFiltered && <AgentStatsPanel stats={stats} isLoading={isLoading} />}

          {/* Project Filter Info */}
          {isProjectFiltered && (
            <div className="bg-primary-50 dark:bg-primary-900/20 border border-primary-200 dark:border-primary-800 rounded-lg p-4">
              <p className="text-sm text-primary-700 dark:text-primary-300">
                프로젝트별 에이전트 설정을 표시합니다. 전체 에이전트를 보려면 "All Projects"를 선택하세요.
              </p>
            </div>
          )}

          {/* Category Filter - only show for global view */}
          {!isProjectFiltered && (
            <div className="flex items-center gap-2">
              <Filter className="w-4 h-4 text-gray-500 dark:text-gray-400" />
              <div className="flex gap-1">
                {categoryOptions.map((option) => (
                  <button
                    key={option.value ?? 'all'}
                    onClick={() => setCategoryFilter(option.value)}
                    className={cn(
                      'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors',
                      categoryFilter === option.value
                        ? 'bg-primary-100 dark:bg-primary-900/30 text-primary-700 dark:text-primary-400'
                        : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700'
                    )}
                  >
                    <option.icon className="w-3.5 h-3.5" />
                    {option.label}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Agent Grid */}
          {(isLoading || isLoadingProjectAgents) ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {[...Array(6)].map((_, i) => (
                <div key={i} className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4 animate-pulse">
                  <div className="flex items-center gap-3 mb-3">
                    <div className="w-10 h-10 bg-gray-200 dark:bg-gray-700 rounded-lg" />
                    <div className="flex-1">
                      <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-24 mb-1" />
                      <div className="h-3 bg-gray-200 dark:bg-gray-700 rounded w-16" />
                    </div>
                  </div>
                  <div className="h-10 bg-gray-200 dark:bg-gray-700 rounded mb-3" />
                  <div className="grid grid-cols-3 gap-2">
                    <div className="h-12 bg-gray-200 dark:bg-gray-700 rounded" />
                    <div className="h-12 bg-gray-200 dark:bg-gray-700 rounded" />
                    <div className="h-12 bg-gray-200 dark:bg-gray-700 rounded" />
                  </div>
                </div>
              ))}
            </div>
          ) : isProjectFiltered ? (
            // Project-specific agents view
            filteredProjectAgents.length === 0 ? (
              <div className="text-center py-12 text-gray-500 dark:text-gray-400">
                <Bot className="w-12 h-12 mx-auto mb-4 opacity-50" />
                <p>이 프로젝트에 등록된 에이전트가 없습니다</p>
                <p className="text-sm mt-1">
                  Project Configs에서 에이전트를 추가할 수 있습니다
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {filteredProjectAgents.map((agent) => (
                  <ProjectAgentCard
                    key={agent.agent_id}
                    agent={agent}
                  />
                ))}
              </div>
            )
          ) : registryAgents.length === 0 ? (
            <div className="text-center py-12 text-gray-500 dark:text-gray-400">
              <Bot className="w-12 h-12 mx-auto mb-4 opacity-50" />
              <p>No agents found</p>
              <p className="text-sm mt-1">
                {categoryFilter
                  ? `No agents in the "${categoryFilter}" category`
                  : 'No agents registered in the system'}
              </p>
            </div>
          ) : (
            <div className="space-y-6">
              {/* Global Registry Agents */}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {registryAgents.map((agent) => (
                  <AgentCard
                    key={agent.id}
                    agent={agent}
                    isSelected={selectedAgentId === agent.id}
                    onClick={() => setSelectedAgent(selectedAgentId === agent.id ? null : agent.id)}
                  />
                ))}
              </div>

              {/* Project Agents Section */}
              {projectAgents.length > 0 && (
                <>
                  <div className="flex items-center gap-2 pt-2">
                    <div className="h-px flex-1 bg-gray-200 dark:bg-gray-700" />
                    <span className="text-sm font-medium text-gray-500 dark:text-gray-400">
                      Project Agents ({projectAgents.length})
                    </span>
                    <div className="h-px flex-1 bg-gray-200 dark:bg-gray-700" />
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {projectAgents.map((agent) => (
                      <ProjectAgentCard
                        key={`${agent.project_id}-${agent.agent_id}`}
                        agent={agent}
                      />
                    ))}
                  </div>
                </>
              )}
            </div>
          )}
        </div>
      )}

      {activeTab === 'analyzer' && (
        <TaskAnalyzer
          projectFilter={projectFilter}
          selectedProject={selectedProject}
        />
      )}

      {activeTab === 'active' && (
        <div>
          {filteredOrchestrationAgents.length === 0 ? (
            <div className="text-center py-12 text-gray-500 dark:text-gray-400">
              <Bot className="w-12 h-12 mx-auto mb-4 opacity-50" />
              <p>No active agents</p>
              <p className="text-sm mt-1">Agents will appear here when they are processing tasks</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {filteredOrchestrationAgents.map((agent) => {
                const Icon = statusIcons[agent.status]
                const currentTask = agent.currentTask ? tasks[agent.currentTask] : null
                const isActive = activeAgentId === agent.id

                return (
                  <div
                    key={agent.id}
                    className={cn(
                      'bg-white dark:bg-gray-800 rounded-lg border p-4 transition-all',
                      isActive
                        ? 'border-primary-500 ring-2 ring-primary-500/20'
                        : 'border-gray-200 dark:border-gray-700'
                    )}
                  >
                    {/* Header */}
                    <div className="flex items-start justify-between mb-3">
                      <div className="flex items-center gap-3">
                        <div
                          className={cn(
                            'w-10 h-10 rounded-lg flex items-center justify-center',
                            statusBgColors[agent.status]
                          )}
                        >
                          <Bot className={cn('w-5 h-5', statusColors[agent.status])} />
                        </div>
                        <div>
                          <h3 className="font-medium text-gray-900 dark:text-white">{agent.name}</h3>
                          <p className="text-sm text-gray-500 dark:text-gray-400">{agent.role}</p>
                        </div>
                      </div>
                      <div className="flex flex-col items-end gap-1">
                        {isActive && (
                          <span className="px-2 py-1 bg-primary-100 dark:bg-primary-900/30 text-primary-700 dark:text-primary-400 text-xs font-medium rounded-full">
                            Active
                          </span>
                        )}
                        {!projectFilter && <ProjectBadge projectId={sessionProjectId} />}
                      </div>
                    </div>

                    {/* Status */}
                    <div className="flex items-center gap-2 mb-3">
                      <Icon className={cn('w-4 h-4', statusColors[agent.status])} />
                      <span className="text-sm text-gray-600 dark:text-gray-400 capitalize">
                        {agent.status.replace('_', ' ')}
                      </span>
                    </div>

                    {/* Current Task */}
                    {currentTask && (
                      <div className="bg-gray-50 dark:bg-gray-900 rounded-lg p-3">
                        <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">Current Task</p>
                        <p className="text-sm text-gray-900 dark:text-white truncate">{currentTask.title}</p>
                      </div>
                    )}

                    {!currentTask && agent.status === 'in_progress' && (
                      <div className="bg-gray-50 dark:bg-gray-900 rounded-lg p-3">
                        <p className="text-xs text-gray-500 dark:text-gray-400">Processing...</p>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}

      {activeTab === 'mcp' && (
        <MCPManagerTab
          projectFilter={projectFilter}
          selectedProject={selectedProject}
        />
      )}

      {activeTab === 'feedback' && (
        <div className="space-y-6">
          {/* Sub-tabs for History and Dataset */}
          <FeedbackTabContent
            projectFilter={projectFilter}
            selectedProject={selectedProject}
          />
        </div>
      )}
    </div>
  )
}

// ============================================================================
// Feedback Tab Content (with sub-tabs)
// ============================================================================

interface FeedbackTabContentProps {
  projectFilter: string | null
  selectedProject: Project | undefined
}

function FeedbackTabContent({ projectFilter, selectedProject }: FeedbackTabContentProps) {
  const [subTab, setSubTab] = useState<'history' | 'dataset' | 'evaluations'>('history')

  const subTabs = [
    { id: 'history' as const, label: 'Feedback History' },
    { id: 'evaluations' as const, label: 'Agent Evaluations' },
    { id: 'dataset' as const, label: 'Dataset' },
  ]

  return (
    <div className="space-y-4">
      {/* Project Filter Info */}
      {projectFilter && selectedProject && (
        <div className="bg-primary-50 dark:bg-primary-900/20 border border-primary-200 dark:border-primary-800 rounded-lg p-4">
          <p className="text-sm text-primary-700 dark:text-primary-300">
            프로젝트 "{selectedProject.name}"의 피드백을 표시합니다.
          </p>
        </div>
      )}

      {/* Sub-tabs */}
      <div className="flex gap-2">
        {subTabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setSubTab(tab.id)}
            className={cn(
              'px-4 py-2 rounded-lg text-sm font-medium transition-colors',
              subTab === tab.id
                ? 'bg-primary-100 dark:bg-primary-900/30 text-primary-700 dark:text-primary-400'
                : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700'
            )}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Content */}
      {subTab === 'history' && <FeedbackHistoryPanel />}
      {subTab === 'evaluations' && <AgentEvalPanel />}
      {subTab === 'dataset' && <DatasetPanel />}
    </div>
  )
}
