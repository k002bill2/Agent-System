import { useEffect, useState } from 'react'
import {
  FolderOpen,
  Plus,
  Link,
  Search,
  MoreVertical,
  Pencil,
  RefreshCw,
  Trash2,
  FileText,
  Database,
  ExternalLink,
  Loader2,
  FileCode,
} from 'lucide-react'
import { cn } from '../lib/utils'
import { useProjectsStore, Project } from '../stores/projects'
import { useNavigationStore } from '../stores/navigation'
import { useProjectConfigsStore } from '../stores/projectConfigs'
import { ProjectFormModal } from '../components/ProjectFormModal'
import { ProjectsGridSkeleton } from '../components/skeletons'
import { ProjectClaudeConfigPanel, DeleteProjectModal } from '../components/projects'

export function ProjectsPage() {
  const {
    projects,
    isLoading,
    error,
    searchQuery,
    selectedProjectId,
    fetchProjects,
    fetchTemplates,
    setSearchQuery,
    openCreateModal,
    openLinkModal,
    openEditModal,
    deleteProject,
    indexProject,
    filteredProjects,
    selectProject,
    getSelectedProject,
    fetchDeletionPreview,
  } = useProjectsStore()

  const { setView } = useNavigationStore()
  const { selectProject: selectConfigProject } = useProjectConfigsStore()

  const [openMenuId, setOpenMenuId] = useState<string | null>(null)
  const [indexingId, setIndexingId] = useState<string | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<Project | null>(null)

  const selectedProject = getSelectedProject()

  useEffect(() => {
    fetchProjects()
    fetchTemplates()
  }, [fetchProjects, fetchTemplates])

  // Handle navigation to Project Configs page
  useEffect(() => {
    const handleNavigate = (e: CustomEvent<{ projectId: string }>) => {
      selectConfigProject(e.detail.projectId)
      setView('project-configs')
    }

    window.addEventListener('navigate-to-project-configs', handleNavigate as EventListener)
    return () => {
      window.removeEventListener('navigate-to-project-configs', handleNavigate as EventListener)
    }
  }, [selectConfigProject, setView])

  const handleDelete = (project: Project) => {
    setDeleteTarget(project)
    setOpenMenuId(null)
  }

  const handleConfirmDelete = async () => {
    if (deleteTarget) {
      await deleteProject(deleteTarget.id)
      setDeleteTarget(null)
    }
  }

  const handleReindex = async (project: Project) => {
    setIndexingId(project.id)
    setOpenMenuId(null)
    await indexProject(project.id)
    setIndexingId(null)
  }

  const displayedProjects = filteredProjects()

  return (
    <div className="flex-1 flex overflow-hidden">
      {/* Main Content */}
      <div className="flex-1 overflow-auto p-6">
      {/* Header */}
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-900 dark:text-white">Projects</h2>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
            Manage your projects and their RAG indexes
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={openLinkModal}
            className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 dark:bg-gray-800 dark:text-gray-200 dark:border-gray-600 dark:hover:bg-gray-700"
          >
            <Link className="w-4 h-4" />
            Link Existing
          </button>
          <button
            onClick={openCreateModal}
            className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-primary-600 rounded-lg hover:bg-primary-700"
          >
            <Plus className="w-4 h-4" />
            Create New
          </button>
        </div>
      </div>

      {/* Search */}
      <div className="mb-6">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
          <input
            type="text"
            placeholder="Search projects..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 dark:bg-gray-800 dark:border-gray-600 dark:text-white"
          />
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-lg text-red-700 dark:bg-red-900/20 dark:border-red-800 dark:text-red-400">
          {error}
        </div>
      )}

      {/* Loading */}
      {isLoading && projects.length === 0 && (
        <ProjectsGridSkeleton />
      )}

      {/* Empty State */}
      {!isLoading && projects.length === 0 && (
        <div className="flex flex-col items-center justify-center h-64 text-gray-500 dark:text-gray-400">
          <FolderOpen className="w-16 h-16 mb-4 opacity-50" />
          <p className="text-lg font-medium">No projects yet</p>
          <p className="text-sm">Create a new project or link an existing one</p>
        </div>
      )}

      {/* Projects Grid */}
      {displayedProjects.length > 0 && (
        <div className={cn(
          'grid gap-4',
          selectedProjectId
            ? 'grid-cols-1 md:grid-cols-2'
            : 'grid-cols-1 md:grid-cols-2 lg:grid-cols-3'
        )}>
          {displayedProjects.map((project) => (
            <div
              key={project.id}
              onClick={() => selectProject(project.id === selectedProjectId ? null : project.id)}
              className={cn(
                'relative bg-white dark:bg-gray-800 rounded-lg border p-4 hover:shadow-md transition-all cursor-pointer',
                selectedProjectId === project.id
                  ? 'border-primary-500 ring-2 ring-primary-200 dark:ring-primary-800'
                  : 'border-gray-200 dark:border-gray-700'
              )}
            >
              {/* Menu Button */}
              <div className="absolute top-3 right-3" onClick={(e) => e.stopPropagation()}>
                <button
                  onClick={() => setOpenMenuId(openMenuId === project.id ? null : project.id)}
                  className="p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-700"
                >
                  <MoreVertical className="w-5 h-5 text-gray-500" />
                </button>

                {/* Dropdown Menu */}
                {openMenuId === project.id && (
                  <>
                    <div
                      className="fixed inset-0 z-10"
                      onClick={() => setOpenMenuId(null)}
                    />
                    <div className="absolute right-0 mt-1 w-40 bg-white dark:bg-gray-800 rounded-lg shadow-lg border border-gray-200 dark:border-gray-700 z-20">
                      <button
                        onClick={() => {
                          openEditModal(project)
                          setOpenMenuId(null)
                        }}
                        className="w-full flex items-center gap-2 px-3 py-2 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700"
                      >
                        <Pencil className="w-4 h-4" />
                        Edit
                      </button>
                      <button
                        onClick={() => handleReindex(project)}
                        disabled={indexingId === project.id}
                        className="w-full flex items-center gap-2 px-3 py-2 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 disabled:opacity-50"
                      >
                        <RefreshCw className={cn('w-4 h-4', indexingId === project.id && 'animate-spin')} />
                        Reindex RAG
                      </button>
                      <button
                        onClick={() => handleDelete(project)}
                        className="w-full flex items-center gap-2 px-3 py-2 text-sm text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20"
                      >
                        <Trash2 className="w-4 h-4" />
                        Remove
                      </button>
                    </div>
                  </>
                )}
              </div>

              {/* Project Icon */}
              <div className="w-10 h-10 rounded-lg bg-primary-100 dark:bg-primary-900/30 flex items-center justify-center mb-3">
                <FolderOpen className="w-5 h-5 text-primary-600 dark:text-primary-400" />
              </div>

              {/* Project Name */}
              <h3 className="font-semibold text-gray-900 dark:text-white mb-1 pr-8">
                {project.name}
              </h3>

              {/* Project ID */}
              <p className="text-xs text-gray-500 dark:text-gray-400 mb-2 font-mono">
                {project.id}
              </p>

              {/* Description */}
              {project.description && (
                <p className="text-sm text-gray-600 dark:text-gray-300 mb-3 line-clamp-2">
                  {project.description}
                </p>
              )}

              {/* Path */}
              <div className="flex items-center gap-1 text-xs text-gray-500 dark:text-gray-400 mb-3">
                <ExternalLink className="w-3 h-3" />
                <span className="truncate" title={project.path}>
                  {project.path}
                </span>
              </div>

              {/* Status Badges */}
              <div className="flex flex-wrap gap-2">
                {/* CLAUDE.md Status */}
                <span
                  className={cn(
                    'inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium',
                    project.has_claude_md
                      ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
                      : 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-400'
                  )}
                >
                  <FileText className="w-3 h-3" />
                  CLAUDE.md
                </span>

                {/* RAG Status */}
                <span
                  className={cn(
                    'inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium',
                    project.vector_store_initialized
                      ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400'
                      : 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-400'
                  )}
                >
                  <Database className="w-3 h-3" />
                  {project.vector_store_initialized ? 'RAG Ready' : 'Not Indexed'}
                </span>

                {/* Indexing indicator */}
                {indexingId === project.id && (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400">
                    <Loader2 className="w-3 h-3 animate-spin" />
                    Indexing...
                  </span>
                )}

                {/* Claude Settings Button */}
                {project.has_claude_md && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      selectProject(project.id)
                    }}
                    className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400 hover:bg-purple-200 dark:hover:bg-purple-900/50 transition-colors"
                    title="Claude 설정 보기"
                  >
                    <FileCode className="w-3 h-3" />
                    Claude
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* No Search Results */}
      {!isLoading && projects.length > 0 && displayedProjects.length === 0 && (
        <div className="flex flex-col items-center justify-center h-64 text-gray-500 dark:text-gray-400">
          <Search className="w-16 h-16 mb-4 opacity-50" />
          <p className="text-lg font-medium">No matching projects</p>
          <p className="text-sm">Try a different search term</p>
        </div>
      )}

      {/* Modal */}
      <ProjectFormModal />
      </div>

      {/* Claude Config Panel */}
      {selectedProject && (
        <ProjectClaudeConfigPanel
          project={selectedProject}
          onClose={() => selectProject(null)}
        />
      )}

      {/* Delete Confirmation Modal */}
      {deleteTarget && (
        <DeleteProjectModal
          project={deleteTarget}
          onClose={() => setDeleteTarget(null)}
          onConfirm={handleConfirmDelete}
          fetchPreview={fetchDeletionPreview}
        />
      )}
    </div>
  )
}
