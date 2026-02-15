import { useState, useEffect } from 'react'
import { useWorkflowStore } from '../../stores/workflows'
import { useProjectsStore } from '../../stores/projects'
import { X, FolderKanban, AlertCircle } from 'lucide-react'

const SAMPLE_YAML = `name: CI Pipeline
description: Run tests and build

on:
  manual: {}

jobs:
  lint:
    runs_on: local
    steps:
      - name: Run linter
        run: echo "Linting..."

  test:
    runs_on: local
    needs:
      - lint
    steps:
      - name: Run tests
        run: echo "Testing..."

  build:
    runs_on: local
    needs:
      - test
    steps:
      - name: Build project
        run: echo "Building..."
`

export function WorkflowCreateModal() {
  const { createWorkflow, setShowCreateModal, isLoading, error, workflows } = useWorkflowStore()
  const { projects, fetchProjects } = useProjectsStore()
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [projectId, setProjectId] = useState<string>('')
  const [yamlContent, setYamlContent] = useState(SAMPLE_YAML)
  const [showProjectError, setShowProjectError] = useState(false)
  const [duplicateConfirmed, setDuplicateConfirmed] = useState(false)

  const workflowName = name || 'New Workflow'
  const isDuplicate = projectId && workflows.some(
    w => w.project_id === projectId && w.name === workflowName
  )

  useEffect(() => {
    fetchProjects()
  }, [fetchProjects])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!projectId) {
      setShowProjectError(true)
      return
    }
    if (isDuplicate && !duplicateConfirmed) {
      return
    }
    await createWorkflow({
      name: workflowName,
      description,
      yaml_content: yamlContent,
      project_id: projectId,
    })
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-2xl w-full max-w-2xl max-h-[80vh] overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-gray-700">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white">새 워크플로우 생성</h2>
          <button onClick={() => setShowCreateModal(false)} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4 overflow-y-auto max-h-[calc(80vh-130px)]">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">이름</label>
            <input
              type="text"
              value={name}
              onChange={e => { setName(e.target.value); setDuplicateConfirmed(false) }}
              placeholder="CI Pipeline"
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm focus:ring-2 focus:ring-primary-500 focus:border-transparent"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">설명</label>
            <input
              type="text"
              value={description}
              onChange={e => setDescription(e.target.value)}
              placeholder="Optional description"
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm focus:ring-2 focus:ring-primary-500 focus:border-transparent"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              <FolderKanban className="w-4 h-4 inline-block mr-1 -mt-0.5" />
              프로젝트 <span className="text-red-500">*</span>
            </label>
            <select
              value={projectId}
              onChange={e => {
                setProjectId(e.target.value)
                setShowProjectError(false)
                setDuplicateConfirmed(false)
              }}
              className={`w-full px-3 py-2 border rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm focus:ring-2 focus:ring-primary-500 focus:border-transparent ${
                showProjectError
                  ? 'border-red-400 dark:border-red-500'
                  : 'border-gray-300 dark:border-gray-600'
              }`}
            >
              <option value="">프로젝트를 선택하세요</option>
              {projects.map(p => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
            {showProjectError && (
              <p className="mt-1 text-xs text-red-500 flex items-center gap-1">
                <AlertCircle className="w-3 h-3" />
                프로젝트를 선택해주세요
              </p>
            )}
          </div>

          {isDuplicate && !duplicateConfirmed && (
            <div className="p-3 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg">
              <p className="text-sm text-amber-700 dark:text-amber-400 flex items-center gap-1.5">
                <AlertCircle className="w-4 h-4 flex-shrink-0" />
                이 프로젝트에 &quot;{workflowName}&quot; 워크플로우가 이미 존재합니다.
              </p>
              <div className="flex gap-2 mt-2">
                <button
                  type="button"
                  onClick={() => setDuplicateConfirmed(true)}
                  className="px-3 py-1 text-xs bg-amber-600 text-white rounded hover:bg-amber-700"
                >
                  그래도 생성
                </button>
                <button
                  type="button"
                  onClick={() => setProjectId('')}
                  className="px-3 py-1 text-xs bg-gray-200 dark:bg-gray-600 text-gray-700 dark:text-gray-300 rounded hover:bg-gray-300 dark:hover:bg-gray-500"
                >
                  다른 프로젝트 선택
                </button>
              </div>
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Workflow Definition (YAML)
            </label>
            <textarea
              value={yamlContent}
              onChange={e => setYamlContent(e.target.value)}
              rows={16}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-gray-50 dark:bg-gray-900 text-gray-900 dark:text-white text-sm font-mono focus:ring-2 focus:ring-primary-500 focus:border-transparent"
              spellCheck={false}
            />
          </div>

          {error && (
            <div className="text-sm text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 px-3 py-2 rounded-lg">
              {error}
            </div>
          )}

          <div className="flex justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={() => setShowCreateModal(false)}
              className="px-4 py-2 text-sm text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-700 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
            >
              취소
            </button>
            <button
              type="submit"
              disabled={isLoading || (!!isDuplicate && !duplicateConfirmed)}
              className="px-4 py-2 text-sm text-white bg-primary-600 rounded-lg hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {isLoading ? '생성 중...' : '생성'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
