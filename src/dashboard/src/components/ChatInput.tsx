import { useState, useRef, useEffect } from 'react'
import { cn } from '../lib/utils'
import { useOrchestrationStore } from '../stores/orchestration'
import { Send, StopCircle, Loader2, ChevronDown, FolderGit2, Terminal } from 'lucide-react'

export function ChatInput() {
  const [input, setInput] = useState('')
  const [isDropdownOpen, setIsDropdownOpen] = useState(false)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const dropdownRef = useRef<HTMLDivElement>(null)

  const {
    sendMessage,
    cancelTask,
    isProcessing,
    connected,
    projects,
    selectedProjectId,
    selectProject,
    fetchProjects,
    reconnect,
    openInWarp,
    checkWarpStatus,
    warpInstalled,
    warpLoading,
  } = useOrchestrationStore()

  // Auto-resize textarea
  useEffect(() => {
    const textarea = textareaRef.current
    if (textarea) {
      textarea.style.height = 'auto'
      textarea.style.height = `${Math.min(textarea.scrollHeight, 200)}px`
    }
  }, [input])

  // Fetch projects and check Warp status on mount
  useEffect(() => {
    fetchProjects()
    checkWarpStatus()
  }, [fetchProjects, checkWarpStatus])

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
    if (!input.trim() || isProcessing || !connected) return
    sendMessage(input.trim())
    setInput('')
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSubmit()
    }
  }

  const handleWarpOpen = async () => {
    if (!selectedProjectId) return
    const result = await openInWarp()
    if (!result.success && result.error) {
      console.error('Failed to open Warp:', result.error)
      // TODO: Show toast notification
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
            connected
              ? 'border-gray-200 dark:border-gray-600 focus-within:border-primary-500 dark:focus-within:border-primary-400'
              : 'border-red-300 dark:border-red-700 bg-red-50 dark:bg-red-900/20'
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
            placeholder={
              connected
                ? 'Describe the task you want to orchestrate...'
                : 'Connecting to server...'
            }
            disabled={!connected}
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
              'focus:outline-none scrollbar-thin',
              !connected && 'cursor-not-allowed opacity-50'
            )}
          />

          <div className="flex items-center gap-2 self-center">
            {/* Warp Terminal Button */}
            {warpInstalled && (
              <button
                type="button"
                onClick={handleWarpOpen}
                disabled={!selectedProjectId || warpLoading}
                title={
                  !selectedProjectId
                    ? 'Select a project first'
                    : warpLoading
                    ? 'Opening Warp...'
                    : 'Open in Warp terminal'
                }
                className={cn(
                  'flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium transition-colors',
                  'border border-gray-200 dark:border-gray-600',
                  selectedProjectId && !warpLoading
                    ? 'hover:bg-gray-50 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300 cursor-pointer'
                    : 'text-gray-400 dark:text-gray-500 cursor-not-allowed opacity-50',
                  'focus:outline-none focus:ring-2 focus:ring-primary-500'
                )}
              >
                {warpLoading ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Terminal className="w-4 h-4" />
                )}
                <span className="hidden sm:inline">Warp</span>
              </button>
            )}

            {isProcessing ? (
              <button
                onClick={cancelTask}
                className="p-2 rounded-lg bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400 hover:bg-red-200 dark:hover:bg-red-900/50 transition-colors"
                title="Cancel"
              >
                <StopCircle className="w-5 h-5" />
              </button>
            ) : (
              <button
                onClick={handleSubmit}
                disabled={!input.trim() || !connected}
                className={cn(
                  'p-2 rounded-lg transition-colors',
                  input.trim() && connected
                    ? 'bg-primary-500 text-white hover:bg-primary-600'
                    : 'bg-gray-100 dark:bg-gray-700 text-gray-400 cursor-not-allowed'
                )}
                title="Send"
              >
                {isProcessing ? (
                  <Loader2 className="w-5 h-5 animate-spin" />
                ) : (
                  <Send className="w-5 h-5" />
                )}
              </button>
            )}
          </div>
        </form>

        <div className="flex items-center justify-between mt-2 px-1">
          <span className="text-xs text-gray-400 dark:text-gray-500">
            Press <kbd className="px-1 py-0.5 rounded bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400 font-mono text-[10px]">Enter</kbd> to send, <kbd className="px-1 py-0.5 rounded bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400 font-mono text-[10px]">Shift+Enter</kbd> for new line
          </span>
          <span className={cn(
            'text-xs',
            connected ? 'text-green-500' : 'text-red-500'
          )}>
            {connected ? '● Connected' : '○ Disconnected'}
          </span>
        </div>
      </div>
    </div>
  )
}
