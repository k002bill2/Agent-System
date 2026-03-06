import { useEffect, useState } from 'react'
import {
  Plus,
  Search,
  Pencil,
  FolderOpen,
  FolderX,
  X,
  Check,
  AlertCircle,
} from 'lucide-react'
import { cn } from '../lib/utils'
import { useProjectConfigsStore, DBProject } from '../stores/projectConfigs'
import { useProjectAccessStore } from '@/stores/projectAccess'
import { useAuthStore } from '../stores/auth'
import { ProjectMembersContent } from '@/components/project-management/ProjectMembersContent'
import { ServiceStatusBar } from '@/components/project-management/ServiceStatusBar'

type DetailTab = 'info' | 'members'

const DETAIL_TABS: { id: DetailTab; label: string }[] = [
  { id: 'info', label: '정보' },
  { id: 'members', label: '멤버' },
]

export function ProjectManagementPage() {
  const {
    dbProjects,
    isLoadingDBProjects,
    error,
    clearError,
    fetchDBProjects,
    fetchAllDBProjects,
    createDBProject,
    updateDBProject,
    toggleDBProjectActive,
  } = useProjectConfigsStore()

  const { fetchMembers } = useProjectAccessStore()
  const currentUser = useAuthStore((s) => s.user)
  const isSystemAdmin = currentUser?.is_admin ?? false
  const canCreateProject = isSystemAdmin || (currentUser?.is_org_admin ?? false)
  const [togglingIds, setTogglingIds] = useState<Set<string>>(new Set())

  const [searchQuery, setSearchQuery] = useState('')
  const [showInactive, setShowInactive] = useState(true)
  const [showCreateForm, setShowCreateForm] = useState(false)
  const [editingProject, setEditingProject] = useState<DBProject | null>(null)
  const [selectedProject, setSelectedProject] = useState<DBProject | null>(null)
  const [activeDetailTab, setActiveDetailTab] = useState<DetailTab>('info')

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
    // 시스템 admin: 전체 프로젝트 (비활성 포함), 그 외: 접근 권한 기반 필터링
    if (isSystemAdmin) {
      fetchAllDBProjects()
    } else {
      fetchDBProjects()
    }
  }, [isSystemAdmin, fetchAllDBProjects, fetchDBProjects])

  // Filter projects
  const filtered = dbProjects.filter((p) => {
    if (!showInactive && !p.is_active) return false
    if (searchQuery) {
      const q = searchQuery.toLowerCase()
      return (
        p.name.toLowerCase().includes(q) ||
        (p.slug && p.slug.toLowerCase().includes(q)) ||
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

  const handleToggleActive = async (project: DBProject) => {
    setTogglingIds((prev) => new Set(prev).add(project.id))
    await toggleDBProjectActive(project.id)
    setTogglingIds((prev) => {
      const next = new Set(prev)
      next.delete(project.id)
      return next
    })
  }

  const renderDetailPanel = () => {
    if (!selectedProject) return null

    return (
      <div className="w-96 border-l border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 flex flex-col overflow-hidden">
        {/* Panel Header */}
        <div className="p-4 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between">
          <div>
            <h3 className="font-semibold text-gray-900 dark:text-white text-sm">
              {selectedProject.name}
            </h3>
            <p className="text-xs text-gray-500 dark:text-gray-400 font-mono">
              {selectedProject.slug}
            </p>
          </div>
          <button
            onClick={() => setSelectedProject(null)}
            className="p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-gray-200 dark:border-gray-700">
          {DETAIL_TABS.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveDetailTab(tab.id)}
              className={cn(
                'flex-1 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors',
                activeDetailTab === tab.id
                  ? 'border-primary-500 text-primary-600 dark:text-primary-400'
                  : 'border-transparent text-gray-500 hover:text-gray-700 dark:hover:text-gray-300'
              )}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Tab Content */}
        <div className="flex-1 overflow-auto p-4">
          {activeDetailTab === 'info' && (
            <div className="space-y-3 text-sm">
              {selectedProject.description && (
                <div>
                  <p className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">설명</p>
                  <p className="text-gray-700 dark:text-gray-300">{selectedProject.description}</p>
                </div>
              )}
              {selectedProject.path && (
                <div>
                  <p className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">경로</p>
                  <p className="text-gray-700 dark:text-gray-300 font-mono text-xs break-all">
                    {selectedProject.path}
                  </p>
                </div>
              )}
              <div>
                <p className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">상태</p>
                <span
                  className={cn(
                    'px-2 py-0.5 rounded text-xs font-medium',
                    selectedProject.is_active
                      ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
                      : 'bg-gray-100 text-gray-500 dark:bg-gray-700 dark:text-gray-400'
                  )}
                >
                  {selectedProject.is_active ? 'Active' : 'Inactive'}
                </span>
              </div>
              {selectedProject.created_at && (
                <div>
                  <p className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">생성일</p>
                  <p className="text-gray-700 dark:text-gray-300">
                    {new Date(selectedProject.created_at).toLocaleDateString('ko-KR')}
                  </p>
                </div>
              )}
            </div>
          )}
          {activeDetailTab === 'members' && (
            <ProjectMembersContent projectId={selectedProject.id} projectName={selectedProject.name} />
          )}
        </div>
      </div>
    )
  }

  return (
    <div className="flex-1 flex overflow-hidden">
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* Sticky top section */}
      <div className="flex-shrink-0 px-6 pt-6 pb-2 bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-700">
        {/* Header */}
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-bold text-gray-900 dark:text-white">
              Project Registry
            </h2>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
              DB 등록 프로젝트를 관리합니다. Claude Sessions, Project Configs에서 이 목록을 참조합니다.
            </p>
          </div>
          {canCreateProject && (
            <button
              onClick={() => setShowCreateForm(true)}
              className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-primary-600 rounded-lg hover:bg-primary-700"
            >
              <Plus className="w-4 h-4" />
              Add Project
            </button>
          )}
        </div>

        {/* Infrastructure Status */}
        <div className="mb-3">
          <ServiceStatusBar
            projectPath={selectedProject?.path}
            projectName={selectedProject?.name}
          />
        </div>

        {/* Error */}
        {error && (
          <div className="mb-3 p-4 bg-red-50 border border-red-200 rounded-lg text-red-700 dark:bg-red-900/20 dark:border-red-800 dark:text-red-400 flex items-center justify-between">
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
        <div className="mb-2 flex items-center gap-4">
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
      </div>

      {/* Scrollable project list */}
      <div className="flex-1 overflow-auto px-6 py-4">

      {/* Create Form */}
      {canCreateProject && showCreateForm && (
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
            onClick={() => {
              if (editingProject?.id !== project.id) {
                const isDeselecting = selectedProject?.id === project.id
                setSelectedProject(isDeselecting ? null : project)
                setActiveDetailTab('info')
                if (!isDeselecting) {
                  fetchMembers(project.id)  // 프로젝트 전환 시 즉시 멤버 초기화 & 프리패치
                }
              }
            }}
            className={cn(
              'bg-white dark:bg-gray-800 border rounded-lg p-4 transition-colors cursor-pointer',
              project.is_active
                ? 'border-gray-200 dark:border-gray-700'
                : 'border-gray-200 dark:border-gray-700 opacity-60',
              selectedProject?.id === project.id
                ? 'ring-2 ring-primary-500'
                : 'hover:border-gray-300 dark:hover:border-gray-600'
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
                <div className="flex items-center gap-2">
                  {project.is_active && (
                    <button
                      onClick={() => handleStartEdit(project)}
                      className="p-2 text-gray-400 hover:text-primary-600 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
                      title="Edit"
                    >
                      <Pencil className="w-4 h-4" />
                    </button>
                  )}
                  {/* Toggle switch */}
                  <button
                    onClick={() => handleToggleActive(project)}
                    disabled={togglingIds.has(project.id)}
                    title={project.is_active ? 'Deactivate project' : 'Activate project'}
                    className={cn(
                      'relative inline-flex h-5 w-9 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-1 disabled:opacity-50 disabled:cursor-not-allowed',
                      project.is_active
                        ? 'bg-green-500 hover:bg-green-600'
                        : 'bg-gray-300 dark:bg-gray-600 hover:bg-gray-400 dark:hover:bg-gray-500'
                    )}
                  >
                    <span
                      className={cn(
                        'inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow transition-transform',
                        project.is_active ? 'translate-x-4' : 'translate-x-0.5'
                      )}
                    />
                  </button>
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
    </div>
    {renderDetailPanel()}
    </div>
  )
}
