import { cn } from '../../lib/utils'
import { FolderCode, Plus, X, Trash2 } from 'lucide-react'
import { useState, useEffect } from 'react'
import { useProjectConfigsStore, ProjectInfo } from '../../stores/projectConfigs'

export function ProjectList() {
  const {
    projects,
    selectedProjectId,
    selectProject,
    createDBProject,
    deleteDBProject,
    fetchDBProjects,
    dbProjects,
    isLoading,
  } = useProjectConfigsStore()

  const [showAddProject, setShowAddProject] = useState(false)
  const [newName, setNewName] = useState('')
  const [newDescription, setNewDescription] = useState('')
  const [newPath, setNewPath] = useState('')
  const [isAdding, setIsAdding] = useState(false)

  useEffect(() => {
    fetchDBProjects()
  }, [fetchDBProjects])

  const handleAddProject = async () => {
    if (!newName.trim()) return

    setIsAdding(true)
    const success = await createDBProject({
      name: newName.trim(),
      description: newDescription.trim() || undefined,
      path: newPath.trim() || undefined,
    })
    setIsAdding(false)

    if (success) {
      setNewName('')
      setNewDescription('')
      setNewPath('')
      setShowAddProject(false)
    }
  }

  const handleDeleteProject = async (e: React.MouseEvent, projectId: string) => {
    e.stopPropagation()
    // Find matching DB project by name
    const configProject = projects.find(p => p.project_id === projectId)
    if (!configProject) return

    const dbProject = dbProjects.find(p => p.name === configProject.project_name)
    if (!dbProject) return

    if (confirm(`"${dbProject.name}" 프로젝트를 비활성화하시겠습니까?`)) {
      await deleteDBProject(dbProject.id)
    }
  }

  if (isLoading) {
    return (
      <div className="p-4 space-y-2">
        {[1, 2, 3].map((i) => (
          <div
            key={i}
            className="h-16 bg-gray-100 dark:bg-gray-800 rounded-lg animate-pulse"
          />
        ))}
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full">
      <div className="p-3 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-gray-900 dark:text-white">
          Projects ({projects.length})
        </h3>
        <button
          onClick={() => setShowAddProject(!showAddProject)}
          className="p-1 text-gray-500 hover:text-primary-600 hover:bg-gray-100 dark:hover:bg-gray-700 rounded"
          title="Add project"
        >
          {showAddProject ? <X className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
        </button>
      </div>

      {showAddProject && (
        <div className="p-3 border-b border-gray-200 dark:border-gray-700 space-y-2">
          <input
            type="text"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="Project name *"
            className="w-full px-2 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleAddProject()
              if (e.key === 'Escape') setShowAddProject(false)
            }}
          />
          <input
            type="text"
            value={newDescription}
            onChange={(e) => setNewDescription(e.target.value)}
            placeholder="Description (optional)"
            className="w-full px-2 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
          />
          <input
            type="text"
            value={newPath}
            onChange={(e) => setNewPath(e.target.value)}
            placeholder="Path (optional, e.g. /Users/you/project)"
            className="w-full px-2 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
          />
          <button
            onClick={handleAddProject}
            disabled={isAdding || !newName.trim()}
            className="w-full px-3 py-1.5 text-sm bg-primary-600 text-white rounded hover:bg-primary-700 disabled:opacity-50"
          >
            {isAdding ? 'Adding...' : 'Add Project'}
          </button>
        </div>
      )}

      <div className="flex-1 overflow-y-auto p-2 space-y-1">
        {projects.map((project) => (
          <ProjectCard
            key={project.project_id}
            project={project}
            isSelected={selectedProjectId === project.project_id}
            onClick={() => selectProject(project.project_id)}
            onDelete={(e) => handleDeleteProject(e, project.project_id)}
            canDelete={dbProjects.some(p => p.name === project.project_name)}
          />
        ))}

        {projects.length === 0 && (
          <div className="p-4 text-center text-gray-500 dark:text-gray-400 text-sm">
            No projects found.
            <br />
            Add a project above.
          </div>
        )}
      </div>
    </div>
  )
}

interface ProjectCardProps {
  project: ProjectInfo
  isSelected: boolean
  onClick: () => void
  onDelete: (e: React.MouseEvent) => void
  canDelete: boolean
}

function ProjectCard({ project, isSelected, onClick, onDelete, canDelete }: ProjectCardProps) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'w-full text-left p-3 rounded-lg transition-colors group',
        isSelected
          ? 'bg-primary-50 dark:bg-primary-900/20 border border-primary-200 dark:border-primary-800'
          : 'hover:bg-gray-100 dark:hover:bg-gray-800 border border-transparent'
      )}
    >
      <div className="flex items-start gap-3">
        <div
          className={cn(
            'p-2 rounded-lg',
            isSelected
              ? 'bg-primary-100 dark:bg-primary-800'
              : 'bg-gray-100 dark:bg-gray-700'
          )}
        >
          <FolderCode
            className={cn(
              'w-4 h-4',
              isSelected
                ? 'text-primary-600 dark:text-primary-400'
                : 'text-gray-500 dark:text-gray-400'
            )}
          />
        </div>
        <div className="flex-1 min-w-0">
          <p
            className={cn(
              'text-sm font-medium truncate',
              isSelected
                ? 'text-primary-700 dark:text-primary-300'
                : 'text-gray-900 dark:text-white'
            )}
          >
            {project.project_name}
          </p>
          <div className="flex items-center gap-2 mt-1 text-xs text-gray-500 dark:text-gray-400">
            {project.skill_count > 0 && (
              <span>{project.skill_count} skills</span>
            )}
            {project.agent_count > 0 && (
              <span>{project.agent_count} agents</span>
            )}
            {project.mcp_server_count > 0 && (
              <span>{project.mcp_server_count} MCP</span>
            )}
          </div>
        </div>
        {canDelete && (
          <button
            onClick={onDelete}
            className="p-1 opacity-0 group-hover:opacity-100 text-gray-400 hover:text-red-500 transition-opacity"
            title="Remove project"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        )}
      </div>
    </button>
  )
}
