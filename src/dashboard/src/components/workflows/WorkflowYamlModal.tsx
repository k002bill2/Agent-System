import { useState, useEffect } from 'react'
import { X, Save, FolderKanban } from 'lucide-react'
import { YamlEditor } from './YamlEditor'
import { useWorkflowStore } from '../../stores/workflows'
import { useProjectsStore } from '../../stores/projects'

export function WorkflowYamlModal() {
  const {
    workflows,
    selectedWorkflowId,
    updateWorkflow,
    setShowYamlEditor,
    fetchWorkflows,
  } = useWorkflowStore()

  const { projects, fetchProjects } = useProjectsStore()

  const workflow = workflows.find(w => w.id === selectedWorkflowId)
  const [yamlContent, setYamlContent] = useState(workflow?.yaml_content || '')
  const [name, setName] = useState(workflow?.name || '')
  const [description, setDescription] = useState(workflow?.description || '')
  const [projectId, setProjectId] = useState<string | null>(workflow?.project_id || null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetchProjects()
  }, [fetchProjects])

  if (!workflow) return null

  const handleSave = async () => {
    setSaving(true)
    setError(null)
    try {
      await updateWorkflow(workflow.id, {
        name,
        description,
        yaml_content: yamlContent,
        project_id: projectId,
      })
      await fetchWorkflows()
      setShowYamlEditor(false)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-2xl w-full max-w-3xl max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-700">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
            워크플로우 편집
          </h3>
          <button
            onClick={() => setShowYamlEditor(false)}
            className="p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-auto p-4 space-y-4">
          {/* Name */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              이름
            </label>
            <input
              type="text"
              value={name}
              onChange={e => setName(e.target.value)}
              className="w-full px-3 py-2 text-sm rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-primary-500 focus:border-transparent"
            />
          </div>

          {/* Description */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              설명
            </label>
            <input
              type="text"
              value={description}
              onChange={e => setDescription(e.target.value)}
              className="w-full px-3 py-2 text-sm rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-primary-500 focus:border-transparent"
            />
          </div>

          {/* Project */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              <FolderKanban className="w-4 h-4 inline-block mr-1 -mt-0.5" />
              프로젝트
            </label>
            <select
              value={projectId || ''}
              onChange={e => setProjectId(e.target.value || null)}
              className="w-full px-3 py-2 text-sm rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-primary-500 focus:border-transparent"
            >
              <option value="">프로젝트 없음</option>
              {projects.map(p => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          </div>

          {/* YAML Editor */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              YAML 정의
            </label>
            <YamlEditor value={yamlContent} onChange={setYamlContent} />
          </div>

          {error && (
            <p className="text-sm text-red-500">{error}</p>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 p-4 border-t border-gray-200 dark:border-gray-700">
          <button
            onClick={() => setShowYamlEditor(false)}
            className="px-4 py-2 text-sm text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-700 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
          >
            취소
          </button>
          <button
            onClick={handleSave}
            disabled={saving || !name.trim() || !yamlContent.trim()}
            className="flex items-center gap-1.5 px-4 py-2 text-sm text-white bg-primary-600 rounded-lg hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            <Save className="w-4 h-4" />
            {saving ? '저장 중...' : '저장'}
          </button>
        </div>
      </div>
    </div>
  )
}
