import { useState } from 'react'
import { cn } from '../../lib/utils'
import {
  FolderOpen,
  Check,
  Filter,
  Settings2,
} from 'lucide-react'
import { useOrchestrationStore } from '../../stores/orchestration'
import { useNavigationStore } from '../../stores/navigation'

export function ProjectsPanel() {
  const { projects, selectedProjectId, selectProject } = useOrchestrationStore()
  const { setView } = useNavigationStore()
  const [showFilter, setShowFilter] = useState(false)

  return (
    <div className="h-full flex flex-col bg-white dark:bg-gray-800 border-l border-gray-200 dark:border-gray-700">
      {/* Header */}
      <div className="px-3 py-3 border-b border-gray-200 dark:border-gray-700">
        <div className="flex items-center gap-2">
          <FolderOpen className="w-4 h-4 text-gray-500 dark:text-gray-400" />
          <h2 className="text-sm font-semibold text-gray-900 dark:text-white">
            Projects
          </h2>
        </div>
      </div>

      {/* Filter Button */}
      <div className="px-3 py-2 border-b border-gray-100 dark:border-gray-700/50">
        <button
          onClick={() => setShowFilter(!showFilter)}
          className={cn(
            'flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs',
            'border border-gray-200 dark:border-gray-600',
            'text-gray-600 dark:text-gray-400',
            'hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors',
            showFilter && 'bg-gray-100 dark:bg-gray-700'
          )}
        >
          <Filter className="w-3 h-3" />
          Filter
        </button>
      </div>

      {/* Projects List */}
      <div className="flex-1 overflow-y-auto">
        <div className="py-1">
          {projects.length === 0 ? (
            <div className="px-3 py-6 text-center">
              <FolderOpen className="w-6 h-6 text-gray-300 dark:text-gray-600 mx-auto mb-2" />
              <p className="text-xs text-gray-400 dark:text-gray-500">
                No projects found
              </p>
            </div>
          ) : (
            projects.map((project) => (
              <button
                key={project.id}
                onClick={() => selectProject(selectedProjectId === project.id ? null : project.id)}
                className={cn(
                  'w-full flex items-center gap-2 px-3 py-2 text-left transition-colors',
                  'hover:bg-gray-50 dark:hover:bg-gray-700/50',
                  selectedProjectId === project.id && 'bg-gray-100 dark:bg-gray-700/70'
                )}
              >
                <FolderOpen
                  className={cn(
                    'w-4 h-4 flex-shrink-0',
                    selectedProjectId === project.id
                      ? 'text-primary-500'
                      : 'text-gray-400 dark:text-gray-500'
                  )}
                />
                <div className="flex-1 min-w-0">
                  <div className={cn(
                    'text-xs font-medium truncate',
                    selectedProjectId === project.id
                      ? 'text-gray-900 dark:text-white'
                      : 'text-gray-700 dark:text-gray-300'
                  )}>
                    {project.name}
                  </div>
                  {project.description && (
                    <div className="text-[10px] text-gray-400 dark:text-gray-500 truncate">
                      {project.description}
                    </div>
                  )}
                </div>
                {selectedProjectId === project.id && (
                  <Check className="w-3.5 h-3.5 text-primary-500 flex-shrink-0" />
                )}
              </button>
            ))
          )}
        </div>
      </div>

      {/* Footer - Customize */}
      <div className="px-3 py-2 border-t border-gray-200 dark:border-gray-700">
        <button
          onClick={() => setView('projects')}
          className={cn(
            'w-full flex items-center gap-1.5 px-2 py-1.5 rounded-lg text-xs',
            'text-gray-600 dark:text-gray-400',
            'hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors'
          )}
        >
          <Settings2 className="w-3.5 h-3.5" />
          Manage Projects
        </button>
      </div>
    </div>
  )
}
