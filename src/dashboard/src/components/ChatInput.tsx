import { useState, useRef, useEffect } from 'react'
import { cn } from '../lib/utils'
import { useOrchestrationStore } from '../stores/orchestration'
import { useNavigationStore } from '../stores/navigation'
import { Send, Loader2, ChevronDown, FolderGit2 } from 'lucide-react'

export function ChatInput() {
  const [input, setInput] = useState('')
  const [isDropdownOpen, setIsDropdownOpen] = useState(false)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const dropdownRef = useRef<HTMLDivElement>(null)

  const {
    isProcessing,
    connected,
    projects,
    selectedProjectId,
    selectProject,
    fetchProjects,
    reconnect,
  } = useOrchestrationStore()

  const { setView, setProjectFilter, setPendingTaskInput } = useNavigationStore()

  // Auto-resize textarea
  useEffect(() => {
    const textarea = textareaRef.current
    if (textarea) {
      textarea.style.height = 'auto'
      textarea.style.height = `${Math.min(textarea.scrollHeight, 200)}px`
    }
  }, [input])

  // Fetch projects on mount
  useEffect(() => {
    fetchProjects()
  }, [fetchProjects])

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsDropdownOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const selectedProject = projects.find(p => p.id === selectedProjectId)

  const handleProjectSelect = (projectId: string | null) => {
    selectProject(projectId)
    setIsDropdownOpen(false)
    // 프로젝트 변경 시 세션 재연결
    if (connected) {
      reconnect()
    }
  }

  const handleSubmit = () => {
    if (!input.trim() || isProcessing) return
    // navigation store에 프로젝트 설정 + 입력값 저장 → Task Analyzer로 이동
    setProjectFilter(selectedProjectId)
    setPendingTaskInput(input.trim())
    setView('agents')
    setInput('')
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSubmit()
    }
  }

  return (
    <div className="border-t border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-4">
      <div className="max-w-4xl mx-auto">
        <form
          autoComplete="off"
          onSubmit={(e) => { e.preventDefault(); handleSubmit(); }}
          className={cn(
            'flex items-center gap-3 p-3 rounded-xl border-2 transition-colors',
            'border-gray-200 dark:border-gray-600 focus-within:border-primary-500 dark:focus-within:border-primary-400'
          )}
        >
          {/* Project Selector */}
          <div ref={dropdownRef} className="relative">
            <button
              type="button"
              onClick={() => setIsDropdownOpen(!isDropdownOpen)}
              className={cn(
                'flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-colors',
                'border border-gray-200 dark:border-gray-600',
                'hover:bg-gray-50 dark:hover:bg-gray-700',
                'focus:outline-none focus:ring-2 focus:ring-primary-500',
                selectedProjectId
                  ? 'text-gray-900 dark:text-white bg-gray-50 dark:bg-gray-700'
                  : 'text-gray-500 dark:text-gray-400'
              )}
            >
              <FolderGit2 className="w-4 h-4" />
              <span className="max-w-[120px] truncate">
                {selectedProject?.name || 'Select Project'}
              </span>
              <ChevronDown className={cn(
                'w-4 h-4 transition-transform',
                isDropdownOpen && 'rotate-180'
              )} />
            </button>

            {/* Dropdown Menu */}
            {isDropdownOpen && (
              <div className="absolute bottom-full left-0 mb-2 w-64 py-1 bg-white dark:bg-gray-800 rounded-lg shadow-lg border border-gray-200 dark:border-gray-700 z-50 max-h-64 overflow-y-auto">
                {/* No Project Option */}
                <button
                  type="button"
                  onClick={() => handleProjectSelect(null)}
                  className={cn(
                    'w-full flex items-center gap-3 px-4 py-2 text-left text-sm transition-colors',
                    'hover:bg-gray-100 dark:hover:bg-gray-700',
                    !selectedProjectId && 'bg-primary-50 dark:bg-primary-900/20 text-primary-600 dark:text-primary-400'
                  )}
                >
                  <div className="w-8 h-8 rounded-lg bg-gray-100 dark:bg-gray-700 flex items-center justify-center">
                    <FolderGit2 className="w-4 h-4 text-gray-400" />
                  </div>
                  <div>
                    <div className="font-medium text-gray-900 dark:text-white">No Project</div>
                    <div className="text-xs text-gray-500">General orchestration</div>
                  </div>
                </button>

                {projects.length > 0 && (
                  <div className="border-t border-gray-200 dark:border-gray-700 my-1" />
                )}

                {/* Project List */}
                {projects.map((project) => (
                  <button
                    key={project.id}
                    type="button"
                    onClick={() => handleProjectSelect(project.id)}
                    className={cn(
                      'w-full flex items-center gap-3 px-4 py-2 text-left text-sm transition-colors',
                      'hover:bg-gray-100 dark:hover:bg-gray-700',
                      selectedProjectId === project.id && 'bg-primary-50 dark:bg-primary-900/20'
                    )}
                  >
                    <div className={cn(
                      'w-8 h-8 rounded-lg flex items-center justify-center',
                      project.has_claude_md
                        ? 'bg-green-100 dark:bg-green-900/30'
                        : 'bg-gray-100 dark:bg-gray-700'
                    )}>
                      <FolderGit2 className={cn(
                        'w-4 h-4',
                        project.has_claude_md
                          ? 'text-green-600 dark:text-green-400'
                          : 'text-gray-400'
                      )} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className={cn(
                        'font-medium truncate',
                        selectedProjectId === project.id
                          ? 'text-primary-600 dark:text-primary-400'
                          : 'text-gray-900 dark:text-white'
                      )}>
                        {project.name}
                      </div>
                      <div className="text-xs text-gray-500 truncate">
                        {project.description || project.path}
                      </div>
                    </div>
                    {project.has_claude_md && (
                      <span className="text-xs px-1.5 py-0.5 rounded bg-green-100 dark:bg-green-900/30 text-green-600 dark:text-green-400">
                        CLAUDE.md
                      </span>
                    )}
                  </button>
                ))}

                {projects.length === 0 && (
                  <div className="px-4 py-3 text-sm text-gray-500 text-center">
                    No projects found
                  </div>
                )}
              </div>
            )}
          </div>

          <textarea
            ref={textareaRef}
            name="task-input-no-autocomplete"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Describe the task you want to analyze..."
            rows={1}
            autoComplete="new-password"
            autoCorrect="off"
            autoCapitalize="off"
            spellCheck={false}
            data-form-type="other"
            data-lpignore="true"
            data-1p-ignore="true"
            className={cn(
              'flex-1 resize-none bg-transparent text-sm text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500',
              'focus:outline-none scrollbar-thin'
            )}
          />

          <div className="flex items-center gap-2 self-center">
            <button
              onClick={handleSubmit}
              disabled={!input.trim()}
              className={cn(
                'p-2 rounded-lg transition-colors',
                input.trim()
                  ? 'bg-primary-500 text-white hover:bg-primary-600'
                  : 'bg-gray-100 dark:bg-gray-700 text-gray-400 cursor-not-allowed'
              )}
              title="Analyze Task"
            >
              {isProcessing ? (
                <Loader2 className="w-5 h-5 animate-spin" />
              ) : (
                <Send className="w-5 h-5" />
              )}
            </button>
          </div>
        </form>

        <div className="flex items-center justify-between mt-2 px-1">
          <span className="text-xs text-gray-400 dark:text-gray-500">
            Press <kbd className="px-1 py-0.5 rounded bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400 font-mono text-[10px]">Enter</kbd> to analyze, <kbd className="px-1 py-0.5 rounded bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400 font-mono text-[10px]">Shift+Enter</kbd> for new line
          </span>
        </div>
      </div>
    </div>
  )
}
