import { useEffect, useState } from 'react'
import { useWorkflowStore } from '../stores/workflows'
import { useProjectsStore } from '../stores/projects'
import { WorkflowList } from '../components/workflows/WorkflowList'
import { WorkflowDetail } from '../components/workflows/WorkflowDetail'
import { WorkflowRunLogs } from '../components/workflows/WorkflowRunLogs'
import { WorkflowCreateModal } from '../components/workflows/WorkflowCreateModal'
import { SecretsManager } from '../components/workflows/SecretsManager'
import { TemplateGallery } from '../components/workflows/TemplateGallery'
import { WorkflowYamlModal } from '../components/workflows/WorkflowYamlModal'
import { Plus, RefreshCw, Shield, LayoutTemplate, FolderKanban } from 'lucide-react'

export function WorkflowsPage() {
  const {
    selectedWorkflowId,
    activeRun,
    isLoading,
    showCreateModal,
    showYamlEditor,
    showSecretsManager,
    showTemplateGallery,
    fetchWorkflows,
    setShowCreateModal,
    setShowSecretsManager,
    setShowTemplateGallery,
    createWorkflow,
  } = useWorkflowStore()

  const { projects, fetchProjects } = useProjectsStore()
  const [filterProjectId, setFilterProjectId] = useState<string>('')

  useEffect(() => {
    fetchProjects()
  }, [fetchProjects])

  useEffect(() => {
    fetchWorkflows(filterProjectId || undefined)
  }, [fetchWorkflows, filterProjectId])

  return (
    <div className="flex-1 flex overflow-hidden">
      {/* Workflow List Panel */}
      <div className="w-96 border-r border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 flex flex-col">
        <div className="p-3 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-300">Workflows</h2>
          <div className="flex items-center gap-1">
            <button
              onClick={() => setShowTemplateGallery(true)}
              className="p-1.5 text-gray-500 hover:text-primary-600 hover:bg-gray-100 dark:hover:bg-gray-700 rounded transition-colors"
              title="Templates"
            >
              <LayoutTemplate className="w-4 h-4" />
            </button>
            <button
              onClick={() => setShowSecretsManager(true)}
              className="p-1.5 text-gray-500 hover:text-primary-600 hover:bg-gray-100 dark:hover:bg-gray-700 rounded transition-colors"
              title="Secrets"
            >
              <Shield className="w-4 h-4" />
            </button>
            <button
              onClick={() => fetchWorkflows()}
              className="p-1.5 text-gray-500 hover:text-primary-600 hover:bg-gray-100 dark:hover:bg-gray-700 rounded transition-colors"
              title="Refresh"
            >
              <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
            </button>
            <button
              onClick={() => setShowCreateModal(true)}
              className="p-1.5 text-gray-500 hover:text-primary-600 hover:bg-gray-100 dark:hover:bg-gray-700 rounded transition-colors"
              title="New Workflow"
            >
              <Plus className="w-4 h-4" />
            </button>
          </div>
        </div>
        {/* Project Filter */}
        <div className="px-3 py-2 border-b border-gray-200 dark:border-gray-700">
          <div className="flex items-center gap-1.5">
            <FolderKanban className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />
            <select
              value={filterProjectId}
              onChange={e => setFilterProjectId(e.target.value)}
              className="flex-1 text-xs bg-transparent border-none text-gray-600 dark:text-gray-400 focus:ring-0 cursor-pointer p-0"
            >
              <option value="">모든 프로젝트</option>
              {projects.map(p => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          </div>
        </div>
        <WorkflowList />
      </div>

      {/* Main Content */}
      <div className="flex-1 flex overflow-hidden">
        {selectedWorkflowId ? (
          <>
            <div className={`flex-1 overflow-auto ${activeRun ? 'border-r border-gray-200 dark:border-gray-700' : ''}`}>
              <WorkflowDetail />
            </div>
            {activeRun && (
              <div className="w-96 flex-shrink-0 overflow-hidden">
                <WorkflowRunLogs />
              </div>
            )}
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center text-gray-500 dark:text-gray-400">
            <div className="text-center">
              <p className="text-lg mb-2">워크플로우를 선택하거나 새로 만드세요</p>
              <button
                onClick={() => setShowCreateModal(true)}
                className="px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors text-sm"
              >
                + 새 워크플로우
              </button>
            </div>
          </div>
        )}
      </div>

      {showCreateModal && <WorkflowCreateModal />}
      {showYamlEditor && <WorkflowYamlModal />}
      {showSecretsManager && <SecretsManager onClose={() => setShowSecretsManager(false)} />}
      {showTemplateGallery && (
        <TemplateGallery
          onSelect={async (tpl, projectId) => {
            await createWorkflow({ name: tpl.name, yaml_content: tpl.yaml_content, project_id: projectId })
            setShowTemplateGallery(false)
            fetchWorkflows()
          }}
          onClose={() => setShowTemplateGallery(false)}
        />
      )}
    </div>
  )
}
