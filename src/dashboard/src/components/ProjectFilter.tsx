import { useEffect } from 'react'
import { Folder } from 'lucide-react'
import { useNavigationStore } from '../stores/navigation'
import { useOrchestrationStore } from '../stores/orchestration'
import { useAuthStore } from '../stores/auth'
import { cn } from '../lib/utils'

interface ProjectFilterProps {
  className?: string
}

export function ProjectFilter({ className }: ProjectFilterProps) {
  const { projectFilter, setProjectFilter } = useNavigationStore()
  const { projects, fetchProjects } = useOrchestrationStore()
  const isAdmin = useAuthStore((s) => s.user?.is_admin ?? false)

  useEffect(() => {
    if (projects.length === 0) {
      fetchProjects()
    }
  }, [projects.length, fetchProjects])

  // 일반 사용자에게는 비활성 프로젝트 숨김
  const availableProjects = isAdmin
    ? projects
    : projects.filter((p) => p.is_active !== false)

  const selectedProject = projects.find((p) => p.id === projectFilter)

  return (
    <div className={cn('flex items-center gap-2', className)}>
      <Folder className="w-4 h-4 text-gray-500" />
      <select
        value={projectFilter || 'all'}
        onChange={(e) => setProjectFilter(e.target.value === 'all' ? null : e.target.value)}
        className={cn(
          'text-xs bg-transparent border border-gray-200 dark:border-gray-700 rounded-md px-2 py-1',
          projectFilter
            ? 'text-primary-600 dark:text-primary-400 border-primary-300 dark:border-primary-700'
            : 'text-gray-600 dark:text-gray-400'
        )}
      >
        <option value="all">All Projects</option>
        {availableProjects.map((project) => (
          <option key={project.id} value={project.id}>
            {project.name}
          </option>
        ))}
      </select>
      {selectedProject && (
        <span className="text-xs text-primary-500 dark:text-primary-400">
          ({availableProjects.length} project{availableProjects.length !== 1 ? 's' : ''})
        </span>
      )}
    </div>
  )
}

// 작은 배지 형태의 프로젝트 표시 컴포넌트
interface ProjectBadgeProps {
  projectId: string | null
  className?: string
}

export function ProjectBadge({ projectId, className }: ProjectBadgeProps) {
  const { projects } = useOrchestrationStore()
  const { projectFilter } = useNavigationStore()

  if (!projectId) return null

  const project = projects.find((p) => p.id === projectId)
  if (!project) return null

  const isFiltered = projectFilter === projectId

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 px-1.5 py-0.5 text-xs rounded-md',
        isFiltered
          ? 'bg-primary-100 text-primary-700 dark:bg-primary-900/30 dark:text-primary-400'
          : 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-400',
        className
      )}
    >
      <Folder className="w-3 h-3" />
      {project.name}
    </span>
  )
}
