/**
 * Project Multi-Select Component
 * Allows selecting multiple projects for comparison in analytics charts
 */

import { useState, useRef, useEffect } from 'react'
import { Check, ChevronDown, X } from 'lucide-react'
import { cn } from '../../lib/utils'

export interface Project {
  id: string
  name: string
}

interface ProjectMultiSelectProps {
  projects: Project[]
  selectedIds: string[]
  onChange: (ids: string[]) => void
  maxSelections?: number
  placeholder?: string
  className?: string
}

export function ProjectMultiSelect({
  projects,
  selectedIds,
  onChange,
  maxSelections = 5,
  placeholder = '프로젝트 선택...',
  className,
}: ProjectMultiSelectProps) {
  const [isOpen, setIsOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  // Color palette matching backend
  const COLORS = ['#8884d8', '#82ca9d', '#ffc658', '#ff7300', '#00C49F']

  const toggleProject = (projectId: string) => {
    if (selectedIds.includes(projectId)) {
      onChange(selectedIds.filter((id) => id !== projectId))
    } else if (selectedIds.length < maxSelections) {
      onChange([...selectedIds, projectId])
    }
  }

  const removeProject = (projectId: string, e: React.MouseEvent) => {
    e.stopPropagation()
    onChange(selectedIds.filter((id) => id !== projectId))
  }

  const selectedProjects = projects.filter((p) => selectedIds.includes(p.id))

  return (
    <div ref={containerRef} className={cn('relative', className)}>
      {/* Trigger button */}
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="w-full min-w-[200px] px-3 py-2 flex items-center justify-between gap-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-sm hover:border-gray-400 dark:hover:border-gray-500 transition-colors"
      >
        <div className="flex-1 flex flex-wrap gap-1 items-center min-h-[20px]">
          {selectedProjects.length === 0 ? (
            <span className="text-gray-500">{placeholder}</span>
          ) : (
            selectedProjects.map((project, idx) => (
              <span
                key={project.id}
                className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs bg-gray-100 dark:bg-gray-700 text-gray-800 dark:text-gray-200"
              >
                <span
                  className="w-2 h-2 rounded-full"
                  style={{ backgroundColor: COLORS[idx % COLORS.length] }}
                />
                <span className="max-w-[80px] truncate">{project.name}</span>
                <button
                  type="button"
                  onClick={(e) => removeProject(project.id, e)}
                  className="hover:text-red-500 transition-colors"
                >
                  <X className="w-3 h-3" />
                </button>
              </span>
            ))
          )}
        </div>
        <ChevronDown
          className={cn(
            'w-4 h-4 text-gray-400 transition-transform',
            isOpen && 'transform rotate-180'
          )}
        />
      </button>

      {/* Dropdown */}
      {isOpen && (
        <div className="absolute z-50 mt-1 w-full max-h-60 overflow-auto bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg">
          {projects.length === 0 ? (
            <div className="px-3 py-2 text-sm text-gray-500">프로젝트가 없습니다</div>
          ) : (
            projects.map((project) => {
              const isSelected = selectedIds.includes(project.id)
              const selectedIndex = selectedIds.indexOf(project.id)
              const canSelect = isSelected || selectedIds.length < maxSelections

              return (
                <button
                  key={project.id}
                  type="button"
                  onClick={() => canSelect && toggleProject(project.id)}
                  disabled={!canSelect}
                  className={cn(
                    'w-full px-3 py-2 flex items-center gap-2 text-left text-sm transition-colors',
                    isSelected
                      ? 'bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300'
                      : canSelect
                      ? 'hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-900 dark:text-white'
                      : 'text-gray-400 dark:text-gray-500 cursor-not-allowed'
                  )}
                >
                  {/* Color indicator or checkbox */}
                  <span
                    className={cn(
                      'w-4 h-4 flex items-center justify-center rounded border',
                      isSelected
                        ? 'border-blue-500 bg-blue-500'
                        : 'border-gray-300 dark:border-gray-600'
                    )}
                  >
                    {isSelected && <Check className="w-3 h-3 text-white" />}
                  </span>

                  {/* Color dot for selected items */}
                  {isSelected && (
                    <span
                      className="w-3 h-3 rounded-full"
                      style={{ backgroundColor: COLORS[selectedIndex % COLORS.length] }}
                    />
                  )}

                  <span className="flex-1 truncate">{project.name}</span>
                </button>
              )
            })
          )}

          {/* Max selection notice */}
          {selectedIds.length >= maxSelections && (
            <div className="px-3 py-2 text-xs text-gray-500 border-t border-gray-200 dark:border-gray-700">
              최대 {maxSelections}개 프로젝트까지 선택 가능합니다
            </div>
          )}
        </div>
      )}
    </div>
  )
}

export default ProjectMultiSelect
