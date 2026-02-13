import { useEffect } from 'react'
import { useWorkflowStore } from '../../stores/workflows'
import { useProjectsStore } from '../../stores/projects'
import { WorkflowDAG } from './WorkflowDAG'
import { WorkflowRunsTable } from './WorkflowRunsTable'
import { Play, Trash2, Code, FolderKanban } from 'lucide-react'

export function WorkflowDetail() {
  const {
    workflows,
    selectedWorkflowId,
    runs,
    isRunning,
    fetchRuns,
    triggerRun,
    deleteWorkflow,
    setShowYamlEditor,
  } = useWorkflowStore()

  const { projects } = useProjectsStore()

  const workflow = workflows.find(w => w.id === selectedWorkflowId)

  useEffect(() => {
    if (workflow?.id) {
      fetchRuns(workflow.id)
    }
  }, [workflow?.id, fetchRuns])

  if (!workflow) return null

  const workflowRuns = runs[workflow.id] || []
  const project = workflow.project_id ? projects.find(p => p.id === workflow.project_id) : null

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h2 className="text-xl font-bold text-gray-900 dark:text-white">{workflow.name}</h2>
          {workflow.description && (
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">{workflow.description}</p>
          )}
          <div className="flex items-center gap-3 mt-2 text-xs text-gray-500 dark:text-gray-400">
            <span>v{workflow.version}</span>
            <span>Jobs: {Object.keys(workflow.definition.jobs || {}).length}</span>
            {project && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-blue-50 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400">
                <FolderKanban className="w-3 h-3" />
                {project.name}
              </span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowYamlEditor(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-700 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
          >
            <Code className="w-4 h-4" />
            YAML
          </button>
          <button
            onClick={() => triggerRun(workflow.id)}
            disabled={isRunning || workflow.status !== 'active'}
            className="flex items-center gap-1.5 px-4 py-1.5 text-sm text-white bg-green-600 rounded-lg hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            <Play className="w-4 h-4" />
            {isRunning ? 'Running...' : 'Run'}
          </button>
          <button
            onClick={() => {
              if (confirm('이 워크플로우를 삭제하시겠습니까?')) {
                deleteWorkflow(workflow.id)
              }
            }}
            className="p-1.5 text-gray-400 hover:text-red-500 transition-colors"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* DAG Visualization */}
      <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4">
        <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">Pipeline</h3>
        <WorkflowDAG definition={workflow.definition} />
      </div>

      {/* Runs Table */}
      <div>
        <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">Run History</h3>
        <WorkflowRunsTable runs={workflowRuns} />
      </div>
    </div>
  )
}
