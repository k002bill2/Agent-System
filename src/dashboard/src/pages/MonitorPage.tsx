import { useEffect, useState } from 'react'
import { RefreshCw, Play, AlertCircle, PanelLeftClose, PanelLeft, FolderKanban } from 'lucide-react'
import { cn } from '../lib/utils'
import { HealthOverview, OutputLog, ContextPanel, ResizablePanel, ProjectsPanel } from '../components/monitor'
import { useMonitoringStore } from '../stores/monitoring'
import { useOrchestrationStore } from '../stores/orchestration'

export function MonitorPage() {
  const { selectedProjectId, projects, fetchProjects } = useOrchestrationStore()
  const {
    projectHealth,
    isLoadingHealth,
    runningChecks,
    error,
    fetchProjectHealth,
    runAllChecks,
    clearError,
  } = useMonitoringStore()

  const [showContext, setShowContext] = useState(true)
  const [showProjects, setShowProjects] = useState(true)
  const selectedProject = projects.find((p) => p.id === selectedProjectId)

  // Fetch projects on mount
  useEffect(() => {
    fetchProjects()
  }, [fetchProjects])

  // Fetch health when project changes
  useEffect(() => {
    if (selectedProjectId) {
      fetchProjectHealth(selectedProjectId)
    }
  }, [selectedProjectId, fetchProjectHealth])

  // No project selected - show projects panel for selection
  if (!selectedProjectId || !selectedProject) {
    return (
      <div className="flex-1 flex overflow-hidden">
        {/* Main Content - Prompt to select */}
        <div className="flex-1 flex items-center justify-center p-8">
          <div className="text-center">
            <FolderKanban className="w-12 h-12 text-gray-400 mx-auto mb-4" />
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
              Select a Project
            </h2>
            <p className="text-gray-500 dark:text-gray-400">
              Choose a project from the right panel to view its health status.
            </p>
          </div>
        </div>

        {/* Projects Panel - Always show when no project selected */}
        <ResizablePanel defaultWidth={250} minWidth={250} maxWidth={250}>
          <ProjectsPanel />
        </ResizablePanel>
      </div>
    )
  }

  const isAnyRunning = runningChecks.size > 0

  return (
    <div className="flex-1 flex overflow-hidden">
      {/* Main Content */}
      <div className="flex-1 flex flex-col overflow-hidden p-6 space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
              Project Monitor
            </h1>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
              {selectedProject.name} - {selectedProject.path}
            </p>
          </div>

          <div className="flex items-center gap-3">
            {/* Toggle Projects Panel */}
            <button
              onClick={() => setShowProjects(!showProjects)}
              className={cn(
                'flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-colors',
                'border border-gray-300 dark:border-gray-600',
                'text-gray-700 dark:text-gray-300',
                'hover:bg-gray-100 dark:hover:bg-gray-700',
                showProjects && 'bg-gray-100 dark:bg-gray-700'
              )}
              title={showProjects ? 'Hide Projects' : 'Show Projects'}
            >
              <FolderKanban className="w-4 h-4" />
              Projects
            </button>

            {/* Toggle Context Panel */}
            <button
              onClick={() => setShowContext(!showContext)}
              className={cn(
                'flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-colors',
                'border border-gray-300 dark:border-gray-600',
                'text-gray-700 dark:text-gray-300',
                'hover:bg-gray-100 dark:hover:bg-gray-700',
                showContext && 'bg-gray-100 dark:bg-gray-700'
              )}
              title={showContext ? 'Hide Context' : 'Show Context'}
            >
              {showContext ? (
                <PanelLeftClose className="w-4 h-4" />
              ) : (
                <PanelLeft className="w-4 h-4" />
              )}
              Context
            </button>

            {/* Refresh button */}
            <button
              onClick={() => fetchProjectHealth(selectedProjectId)}
              disabled={isLoadingHealth}
              className={cn(
                'flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-colors',
                'border border-gray-300 dark:border-gray-600',
                'text-gray-700 dark:text-gray-300',
                'hover:bg-gray-100 dark:hover:bg-gray-700',
                isLoadingHealth && 'opacity-50 cursor-not-allowed'
              )}
            >
              <RefreshCw
                className={cn('w-4 h-4', isLoadingHealth && 'animate-spin')}
              />
              Refresh
            </button>

            {/* Run All button */}
            <button
              onClick={() => runAllChecks(selectedProjectId)}
              disabled={isAnyRunning}
              className={cn(
                'flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors whitespace-nowrap',
                'bg-primary-600 hover:bg-primary-700 text-white',
                isAnyRunning && 'opacity-50 cursor-not-allowed'
              )}
            >
              <Play className="w-4 h-4" />
              Run All
            </button>
          </div>
        </div>

        {/* Error banner */}
        {error && (
          <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <AlertCircle className="w-5 h-5 text-red-500" />
              <span className="text-red-700 dark:text-red-400">{error}</span>
            </div>
            <button
              onClick={clearError}
              className="text-red-500 hover:text-red-700 dark:hover:text-red-300"
            >
              Dismiss
            </button>
          </div>
        )}

        {/* Loading state */}
        {isLoadingHealth && !projectHealth && (
          <div className="flex-1 flex items-center justify-center">
            <RefreshCw className="w-8 h-8 text-primary-500 animate-spin" />
          </div>
        )}

        {/* Health overview and logs */}
        {projectHealth && (
          <>
            <HealthOverview health={projectHealth} projectId={selectedProjectId} />

            <div className="flex-1 min-h-0">
              <OutputLog projectId={selectedProjectId} />
            </div>
          </>
        )}
      </div>

      {/* Projects Panel */}
      {showProjects && (
        <ResizablePanel defaultWidth={250} minWidth={250} maxWidth={250}>
          <ProjectsPanel />
        </ResizablePanel>
      )}

      {/* Context Panel */}
      {showContext && (
        <ResizablePanel defaultWidth={520} minWidth={280} maxWidth={800}>
          <ContextPanel projectId={selectedProjectId} />
        </ResizablePanel>
      )}
    </div>
  )
}
