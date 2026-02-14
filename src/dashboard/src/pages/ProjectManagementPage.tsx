import { useEffect, useState } from 'react'
import {
  Plus,
  Search,
  Pencil,
  Trash2,
  RotateCcw,
  FolderOpen,
  FolderX,
  X,
  Check,
  AlertCircle,
} from 'lucide-react'
import { cn } from '../lib/utils'
import { useProjectConfigsStore, DBProject } from '../stores/projectConfigs'

export function ProjectManagementPage() {
  const {
    dbProjects,
    isLoadingDBProjects,
    error,
    clearError,
    fetchDBProjects,
    createDBProject,
    updateDBProject,
    deleteDBProject,
    restoreDBProject,
  } = useProjectConfigsStore()

  const [searchQuery, setSearchQuery] = useState('')
  const [showInactive, setShowInactive] = useState(false)
  const [showCreateForm, setShowCreateForm] = useState(false)
  const [editingProject, setEditingProject] = useState<DBProject | null>(null)

  // Create form state
  const [createName, setCreateName] = useState('')
  const [createDescription, setCreateDescription] = useState('')
  const [createPath, setCreatePath] = useState('')
  const [isCreating, setIsCreating] = useState(false)

  // Edit form state
  const [editName, setEditName] = useState('')
  const [editDescription, setEditDescription] = useState('')
  const [editPath, setEditPath] = useState('')
  const [isSaving, setIsSaving] = useState(false)

  useEffect(() => {
    fetchDBProjects()
  }, [fetchDBProjects])

  // Filter projects
  const filtered = dbProjects.filter((p) => {
    if (!showInactive && !p.is_active) return false
    if (searchQuery) {
      const q = searchQuery.toLowerCase()
      return (
        p.name.toLowerCase().includes(q) ||
        p.slug.toLowerCase().includes(q) ||
        (p.description && p.description.toLowerCase().includes(q)) ||
        (p.path && p.path.toLowerCase().includes(q))
      )
    }
    return true
  })

  const activeCount = dbProjects.filter((p) => p.is_active).length
  const inactiveCount = dbProjects.filter((p) => !p.is_active).length

  const handleCreate = async () => {
    if (!createName.trim()) return
    setIsCreating(true)
    const success = await createDBProject({
      name: createName.trim(),
      description: createDescription.trim() || undefined,
      path: createPath.trim() || undefined,
    })
    setIsCreating(false)
    if (success) {
      setCreateName('')
      setCreateDescription('')
      setCreatePath('')
      setShowCreateForm(false)
    }
  }

  const handleStartEdit = (project: DBProject) => {
    setEditingProject(project)
    setEditName(project.name)
    setEditDescription(project.description || '')
    setEditPath(project.path || '')
  }

  const handleSaveEdit = async () => {
    if (!editingProject || !editName.trim()) return
    setIsSaving(true)
    const success = await updateDBProject(editingProject.id, {
      name: editName.trim(),
      description: editDescription.trim() || undefined,
      path: editPath.trim() || undefined,
    })
    setIsSaving(false)
    if (success) {
      setEditingProject(null)
    }
  }

  const handleDelete = async (project: DBProject) => {
    if (confirm(`"${project.name}" 프로젝트를 비활성화하시겠습니까?`)) {
      await deleteDBProject(project.id)
    }
  }

  const handleRestore = async (project: DBProject) => {
    await restoreDBProject(project.id)
  }

  return (
    <div className="flex-1 overflow-auto p-6">
      {/* Header */}
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-900 dark:text-white">
            Project Registry
          </h2>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
            DB 등록 프로젝트를 관리합니다. Claude Sessions, Project Configs에서 이 목록을 참조합니다.
          </p>
        </div>
        <button
          onClick={() => setShowCreateForm(true)}
          className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-primary-600 rounded-lg hover:bg-primary-700"
        >
          <Plus className="w-4 h-4" />
          Add Project
        </button>
      </div>

      {/* Error */}
      {error && (
        <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-lg text-red-700 dark:bg-red-900/20 dark:border-red-800 dark:text-red-400 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4" />
            {error}
          </div>
          <button onClick={clearError} className="text-red-500 hover:text-red-700">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Search + Filter */}
      <div className="mb-6 flex items-center gap-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
          <input
            type="text"
            placeholder="Search projects..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 dark:bg-gray-800 dark:border-gray-600 dark:text-white"
          />
        </div>
        <div className="flex items-center gap-3 text-sm">
          <span className="text-gray-500 dark:text-gray-400">
            Active: <span className="font-medium text-gray-900 dark:text-white">{activeCount}</span>
          </span>
          {inactiveCount > 0 && (
            <label className="flex items-center gap-2 text-gray-500 dark:text-gray-400 cursor-pointer">
              <input
                type="checkbox"
                checked={showInactive}
                onChange={(e) => setShowInactive(e.target.checked)}
                className="rounded border-gray-300 text-primary-600 focus:ring-primary-500"
              />
              Show inactive ({inactiveCount})
            </label>
          )}
        </div>
      </div>

      {/* Create Form */}
      {showCreateForm && (
        <div className="mb-6 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-5">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
            New Project
          </h3>
          <div className="space-y-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Name <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={createName}
                onChange={(e) => setCreateName(e.target.value)}
                placeholder="e.g. Agent-System"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 dark:bg-gray-700 dark:border-gray-600 dark:text-white"
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleCreate()
                  if (e.key === 'Escape') setShowCreateForm(false)
                }}
                autoFocus
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Description
              </label>
              <input
                type="text"
                value={createDescription}
                onChange={(e) => setCreateDescription(e.target.value)}
                placeholder="Optional description"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 dark:bg-gray-700 dark:border-gray-600 dark:text-white"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Path
              </label>
              <input
                type="text"
                value={createPath}
                onChange={(e) => setCreatePath(e.target.value)}
                placeholder="e.g. /Users/you/Work/Project"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 dark:bg-gray-700 dark:border-gray-600 dark:text-white"
              />
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                경로 지정 시 Project Configs에서 해당 디렉토리의 Claude 설정을 자동 스캔합니다.
              </p>
            </div>
            <div className="flex items-center gap-2 pt-2">
              <button
                onClick={handleCreate}
                disabled={isCreating || !createName.trim()}
                className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-primary-600 rounded-lg hover:bg-primary-700 disabled:opacity-50"
              >
                {isCreating ? 'Creating...' : 'Create'}
              </button>
              <button
                onClick={() => {
                  setShowCreateForm(false)
                  setCreateName('')
                  setCreateDescription('')
                  setCreatePath('')
                }}
                className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Loading */}
      {isLoadingDBProjects && dbProjects.length === 0 && (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div
              key={i}
              className="h-20 bg-gray-100 dark:bg-gray-800 rounded-lg animate-pulse"
            />
          ))}
        </div>
      )}

      {/* Empty State */}
      {!isLoadingDBProjects && dbProjects.length === 0 && (
        <div className="flex flex-col items-center justify-center h-64 text-gray-500 dark:text-gray-400">
          <FolderOpen className="w-16 h-16 mb-4 opacity-50" />
          <p className="text-lg font-medium">No projects registered</p>
          <p className="text-sm">Add a project to manage Claude sessions and configs</p>
        </div>
      )}

      {/* Project List */}
      <div className="space-y-3">
        {filtered.map((project) => (
          <div
            key={project.id}
            className={cn(
              'bg-white dark:bg-gray-800 border rounded-lg p-4 transition-colors',
              project.is_active
                ? 'border-gray-200 dark:border-gray-700'
                : 'border-gray-200 dark:border-gray-700 opacity-60'
            )}
          >
            {editingProject?.id === project.id ? (
              /* Edit Mode */
              <div className="space-y-3">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">
                      Name
                    </label>
                    <input
                      type="text"
                      value={editName}
                      onChange={(e) => setEditName(e.target.value)}
                      className="w-full px-3 py-1.5 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 dark:bg-gray-700 dark:border-gray-600 dark:text-white"
                      autoFocus
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">
                      Description
                    </label>
                    <input
                      type="text"
                      value={editDescription}
                      onChange={(e) => setEditDescription(e.target.value)}
                      className="w-full px-3 py-1.5 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 dark:bg-gray-700 dark:border-gray-600 dark:text-white"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">
                      Path
                    </label>
                    <input
                      type="text"
                      value={editPath}
                      onChange={(e) => setEditPath(e.target.value)}
                      className="w-full px-3 py-1.5 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 dark:bg-gray-700 dark:border-gray-600 dark:text-white"
                    />
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={handleSaveEdit}
                    disabled={isSaving || !editName.trim()}
                    className="flex items-center gap-1 px-3 py-1.5 text-sm font-medium text-white bg-primary-600 rounded-lg hover:bg-primary-700 disabled:opacity-50"
                  >
                    <Check className="w-3.5 h-3.5" />
                    {isSaving ? 'Saving...' : 'Save'}
                  </button>
                  <button
                    onClick={() => setEditingProject(null)}
                    className="flex items-center gap-1 px-3 py-1.5 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg"
                  >
                    <X className="w-3.5 h-3.5" />
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              /* View Mode */
              <div className="flex items-start justify-between">
                <div className="flex items-start gap-4">
                  <div
                    className={cn(
                      'p-2.5 rounded-lg',
                      project.is_active
                        ? 'bg-primary-100 dark:bg-primary-900/30'
                        : 'bg-gray-100 dark:bg-gray-700'
                    )}
                  >
                    {project.is_active ? (
                      <FolderOpen className="w-5 h-5 text-primary-600 dark:text-primary-400" />
                    ) : (
                      <FolderX className="w-5 h-5 text-gray-400" />
                    )}
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="font-semibold text-gray-900 dark:text-white">
                        {project.name}
                      </h3>
                      <span className="text-xs font-mono text-gray-400 dark:text-gray-500">
                        {project.slug}
                      </span>
                      {!project.is_active && (
                        <span className="px-2 py-0.5 text-xs font-medium bg-gray-100 text-gray-500 dark:bg-gray-700 dark:text-gray-400 rounded-full">
                          Inactive
                        </span>
                      )}
                    </div>
                    {project.description && (
                      <p className="text-sm text-gray-600 dark:text-gray-300 mt-0.5">
                        {project.description}
                      </p>
                    )}
                    <div className="flex items-center gap-4 mt-1.5 text-xs text-gray-500 dark:text-gray-400">
                      {project.path && (
                        <span className="font-mono truncate max-w-md" title={project.path}>
                          {project.path}
                        </span>
                      )}
                      {project.created_at && (
                        <span>
                          Created {new Date(project.created_at).toLocaleDateString()}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-1">
                  {project.is_active ? (
                    <>
                      <button
                        onClick={() => handleStartEdit(project)}
                        className="p-2 text-gray-400 hover:text-primary-600 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
                        title="Edit"
                      >
                        <Pencil className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => handleDelete(project)}
                        className="p-2 text-gray-400 hover:text-red-600 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
                        title="Deactivate"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </>
                  ) : (
                    <button
                      onClick={() => handleRestore(project)}
                      className="flex items-center gap-1 px-3 py-1.5 text-sm font-medium text-primary-600 hover:bg-primary-50 dark:hover:bg-primary-900/20 rounded-lg transition-colors"
                      title="Restore"
                    >
                      <RotateCcw className="w-4 h-4" />
                      Restore
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>
        ))}
      </div>

      {/* No Search Results */}
      {!isLoadingDBProjects && dbProjects.length > 0 && filtered.length === 0 && (
        <div className="flex flex-col items-center justify-center h-40 text-gray-500 dark:text-gray-400">
          <Search className="w-10 h-10 mb-3 opacity-50" />
          <p className="text-sm">No matching projects</p>
        </div>
      )}
    </div>
  )
}
