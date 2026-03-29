import { useState, useRef, useEffect, useCallback } from 'react'
import { cn } from '../lib/utils'
import {
  ALLOWED_IMAGE_TYPES,
  MAX_IMAGES,
  MAX_MD_FILES,
  getFileKey,
  removeOcrBlock,
  removeMdBlock,
  isMdFile,
  isImageFile,
  readTextFile,
  validateMdFile,
} from '../lib/fileAttachment'
import { useOrchestrationStore } from '../stores/orchestration'
import { useNavigationStore } from '../stores/navigation'
import { useAgentsStore } from '../stores/agents'
import { Send, Loader2, ChevronDown, FolderGit2, ImagePlus, FileText, X, CheckCircle2, AlertCircle } from 'lucide-react'

export function ChatInput() {
  const [input, setInput] = useState('')
  const [isDropdownOpen, setIsDropdownOpen] = useState(false)
  const [images, setImages] = useState<File[]>([])
  const [mdFiles, setMdFiles] = useState<File[]>([])
  const [isDragOver, setIsDragOver] = useState(false)
  const [ocrStatuses, setOcrStatuses] = useState<Record<string, 'processing' | 'done' | 'error'>>({})
  const [mdReadStatuses, setMdReadStatuses] = useState<Record<string, 'reading' | 'done' | 'error'>>({})
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const dropdownRef = useRef<HTMLDivElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const mdFileInputRef = useRef<HTMLInputElement>(null)

  const isProcessing = useOrchestrationStore(s => s.isProcessing)
  const connected = useOrchestrationStore(s => s.connected)
  const projects = useOrchestrationStore(s => s.projects)
  const selectedProjectId = useOrchestrationStore(s => s.selectedProjectId)
  const selectProject = useOrchestrationStore(s => s.selectProject)
  const fetchProjects = useOrchestrationStore(s => s.fetchProjects)
  const reconnect = useOrchestrationStore(s => s.reconnect)

  const setView = useNavigationStore(s => s.setView)
  const setProjectFilter = useNavigationStore(s => s.setProjectFilter)
  const setPendingTaskInput = useNavigationStore(s => s.setPendingTaskInput)
  const setAttachedImages = useAgentsStore(s => s.setAttachedImages)
  const setAttachedMdFiles = useAgentsStore(s => s.setAttachedMdFiles)
  const extractTextFromImage = useAgentsStore(s => s.extractTextFromImage)

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
    // 이미지가 있으면 agents store에 먼저 설정
    if (images.length > 0) {
      setAttachedImages(images)
      setImages([])
      setOcrStatuses({})
    }
    // MD 파일이 있으면 agents store에 설정
    if (mdFiles.length > 0) {
      setAttachedMdFiles(mdFiles)
      setMdFiles([])
      setMdReadStatuses({})
    }
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

  // OCR 트리거
  const triggerOcr = useCallback((file: File) => {
    const fileKey = getFileKey(file)
    setOcrStatuses(prev => ({ ...prev, [fileKey]: 'processing' }))

    extractTextFromImage(file).then(text => {
      if (text !== null && text.trim().length > 0) {
        setInput(prev => `${prev}${prev ? '\n\n' : ''}[이미지 OCR: ${file.name}]\n${text.trim()}`)
        setOcrStatuses(prev => ({ ...prev, [fileKey]: 'done' }))
      } else if (text !== null) {
        setOcrStatuses(prev => ({ ...prev, [fileKey]: 'done' }))
      } else {
        setOcrStatuses(prev => ({ ...prev, [fileKey]: 'error' }))
      }
    })
  }, [extractTextFromImage])

  // Image handling
  const addImages = useCallback((files: FileList | File[]) => {
    const validFiles = Array.from(files).filter(f => ALLOWED_IMAGE_TYPES.includes(f.type))
    if (validFiles.length === 0) return
    setImages(prev => [...prev, ...validFiles].slice(0, MAX_IMAGES))

    // 각 비-SVG 이미지에 대해 비동기 OCR 실행
    for (const file of validFiles) {
      if (file.type === 'image/svg+xml') continue
      triggerOcr(file)
    }
  }, [triggerOcr])

  // MD file handling
  const addMdFiles = useCallback((files: FileList | File[]) => {
    const validMdFiles = Array.from(files).filter(isMdFile)
    if (validMdFiles.length === 0) return

    const accepted: File[] = []
    for (const file of validMdFiles) {
      const error = validateMdFile(file, mdFiles.length + accepted.length)
      if (error) {
        console.warn(error)
        continue
      }
      accepted.push(file)
    }
    if (accepted.length === 0) return
    setMdFiles(prev => [...prev, ...accepted].slice(0, MAX_MD_FILES))

    for (const file of accepted) {
      const fileKey = getFileKey(file)
      setMdReadStatuses(prev => ({ ...prev, [fileKey]: 'reading' }))

      readTextFile(file).then(content => {
        setInput(prev => `${prev}${prev ? '\n\n' : ''}[문서: ${file.name}]\n${content}`)
        setMdReadStatuses(prev => ({ ...prev, [fileKey]: 'done' }))
      }).catch(() => {
        setMdReadStatuses(prev => ({ ...prev, [fileKey]: 'error' }))
      })
    }
  }, [mdFiles.length])

  const handleMdFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      addMdFiles(e.target.files)
    }
    e.target.value = ''
  }, [addMdFiles])

  const handlePaste = useCallback((e: React.ClipboardEvent) => {
    const items = e.clipboardData.items
    const imageFiles: File[] = []
    for (let i = 0; i < items.length; i++) {
      if (items[i].type.startsWith('image/')) {
        const file = items[i].getAsFile()
        if (file) imageFiles.push(file)
      }
    }
    if (imageFiles.length > 0) {
      e.preventDefault()
      addImages(imageFiles)
    }
  }, [addImages])

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragOver(true)
  }, [])

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragOver(false)
  }, [])

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragOver(false)
    if (e.dataTransfer.files.length > 0) {
      const files = Array.from(e.dataTransfer.files)
      const imageFiles = files.filter(isImageFile)
      const droppedMdFiles = files.filter(isMdFile)
      if (imageFiles.length > 0) addImages(imageFiles)
      if (droppedMdFiles.length > 0) addMdFiles(droppedMdFiles)
    }
  }, [addImages, addMdFiles])

  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      addImages(e.target.files)
    }
    e.target.value = ''
  }, [addImages])

  return (
    <div className="border-t border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-4">
      <div className="max-w-4xl mx-auto">
        <form
          autoComplete="off"
          onSubmit={(e) => { e.preventDefault(); handleSubmit(); }}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          className={cn(
            'flex flex-col gap-2 p-3 rounded-xl border-2 transition-colors',
            isDragOver
              ? 'border-primary-400 dark:border-primary-500 bg-primary-50/50 dark:bg-primary-900/10'
              : 'border-gray-200 dark:border-gray-600 focus-within:border-primary-500 dark:focus-within:border-primary-400'
          )}
        >
          {/* Image Previews (above input row) */}
          {images.length > 0 && (
            <div className="flex flex-wrap gap-1.5 px-1">
              {images.map((file, idx) => {
                const status = ocrStatuses[getFileKey(file)]
                return (
                  <div
                    key={`${file.name}-${idx}`}
                    className="relative group w-12 h-12 rounded-lg overflow-hidden border border-gray-200 dark:border-gray-600 bg-gray-100 dark:bg-gray-800 flex-shrink-0"
                  >
                    <img
                      src={URL.createObjectURL(file)}
                      alt={file.name}
                      className="w-full h-full object-cover"
                      onLoad={(e) => URL.revokeObjectURL((e.target as HTMLImageElement).src)}
                    />
                    <button
                      type="button"
                      onClick={() => {
                        const key = getFileKey(file)
                        setOcrStatuses(prev => { const { [key]: _, ...rest } = prev; return rest })
                        setInput(prev => removeOcrBlock(prev, file.name))
                        setImages(prev => prev.filter((_, i) => i !== idx))
                      }}
                      className="absolute -top-0.5 -right-0.5 w-4 h-4 bg-red-500 text-white rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity shadow-sm"
                    >
                      <X className="w-2.5 h-2.5" />
                    </button>
                    {/* OCR 상태 오버레이 */}
                    {status === 'processing' && (
                      <div className="absolute bottom-0 right-0 p-0.5 bg-blue-500 rounded-tl-md" title="OCR 처리 중...">
                        <Loader2 className="w-2.5 h-2.5 text-white animate-spin" />
                      </div>
                    )}
                    {status === 'done' && (
                      <div className="absolute bottom-0 right-0 p-0.5 bg-green-500 rounded-tl-md" title="OCR 완료">
                        <CheckCircle2 className="w-2.5 h-2.5 text-white" />
                      </div>
                    )}
                    {status === 'error' && (
                      <button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); triggerOcr(file) }}
                        className="absolute bottom-0 right-0 p-0.5 bg-red-500 rounded-tl-md hover:bg-red-600 transition-colors"
                        title="OCR 실패 - 클릭하여 재시도"
                      >
                        <AlertCircle className="w-2.5 h-2.5 text-white" />
                      </button>
                    )}
                  </div>
                )
              })}
              <button
                type="button"
                onClick={() => {
                  // 모든 이미지의 OCR 텍스트 + MD 텍스트 제거
                  setInput(prev => {
                    let text = prev
                    for (const file of images) text = removeOcrBlock(text, file.name)
                    for (const file of mdFiles) text = removeMdBlock(text, file.name)
                    return text
                  })
                  setImages([])
                  setOcrStatuses({})
                  setMdFiles([])
                  setMdReadStatuses({})
                }}
                className="text-[10px] text-gray-400 hover:text-red-400 self-end pb-1 transition-colors"
              >
                전체 삭제
              </button>
            </div>
          )}

          {/* MD File Previews */}
          {mdFiles.length > 0 && (
            <div className="flex flex-wrap gap-1.5 px-1">
              {mdFiles.map((file, idx) => {
                const status = mdReadStatuses[getFileKey(file)]
                return (
                  <div
                    key={`md-${file.name}-${idx}`}
                    className="relative group flex items-center gap-1 px-2 py-1 rounded-lg border border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-800 text-[11px]"
                  >
                    <FileText className="w-3 h-3 text-blue-500 flex-shrink-0" />
                    <span className="text-gray-700 dark:text-gray-300 max-w-[100px] truncate">{file.name}</span>
                    {status === 'reading' && <Loader2 className="w-2.5 h-2.5 text-blue-500 animate-spin" />}
                    {status === 'done' && <CheckCircle2 className="w-2.5 h-2.5 text-green-500" />}
                    {status === 'error' && <AlertCircle className="w-2.5 h-2.5 text-red-500" />}
                    <button
                      type="button"
                      onClick={() => {
                        const key = getFileKey(file)
                        setMdReadStatuses(prev => { const { [key]: _, ...rest } = prev; return rest })
                        setInput(prev => removeMdBlock(prev, file.name))
                        setMdFiles(prev => prev.filter((_, i) => i !== idx))
                      }}
                      className="w-3.5 h-3.5 flex items-center justify-center rounded-full bg-red-500 text-white opacity-0 group-hover:opacity-100 transition-opacity"
                    >
                      <X className="w-2 h-2" />
                    </button>
                  </div>
                )
              })}
            </div>
          )}

          {/* Drag overlay */}
          {isDragOver && (
            <div className="flex items-center justify-center gap-2 py-2 text-sm text-primary-500 dark:text-primary-400">
              <ImagePlus className="w-4 h-4" />
              이미지 또는 MD 문서를 여기에 놓으세요
            </div>
          )}

          <div className="flex items-center gap-3">
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
            onPaste={handlePaste}
            placeholder="Describe the task you want to analyze... (이미지/MD 문서 첨부 가능)"
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

          {/* Hidden file inputs */}
          <input
            ref={fileInputRef}
            type="file"
            accept={ALLOWED_IMAGE_TYPES.join(',')}
            multiple
            onChange={handleFileSelect}
            className="hidden"
          />
          <input
            ref={mdFileInputRef}
            type="file"
            accept=".md,.markdown"
            multiple
            onChange={handleMdFileSelect}
            className="hidden"
          />

          <div className="flex items-center gap-1 self-center">
            {/* Image attach button */}
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={images.length >= MAX_IMAGES}
              className={cn(
                'p-2 rounded-lg transition-colors',
                images.length >= MAX_IMAGES
                  ? 'text-gray-300 dark:text-gray-600 cursor-not-allowed'
                  : 'text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700'
              )}
              title={images.length >= MAX_IMAGES ? `최대 ${MAX_IMAGES}개` : '이미지 첨부'}
            >
              <ImagePlus className="w-5 h-5" />
            </button>
            {/* MD attach button */}
            <button
              type="button"
              onClick={() => mdFileInputRef.current?.click()}
              disabled={mdFiles.length >= MAX_MD_FILES}
              className={cn(
                'p-2 rounded-lg transition-colors',
                mdFiles.length >= MAX_MD_FILES
                  ? 'text-gray-300 dark:text-gray-600 cursor-not-allowed'
                  : 'text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700'
              )}
              title={mdFiles.length >= MAX_MD_FILES ? `최대 ${MAX_MD_FILES}개` : 'MD 문서 첨부'}
            >
              <FileText className="w-5 h-5" />
            </button>
            <button
              type="button"
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
          </div>{/* close input row */}
        </form>

        <div className="flex items-center justify-between mt-2 px-1">
          <span className="text-xs text-gray-400 dark:text-gray-500">
            Press <kbd className="px-1 py-0.5 rounded bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400 text-[10px]">Enter</kbd> to analyze, <kbd className="px-1 py-0.5 rounded bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400 text-[10px]">Shift+Enter</kbd> for new line, <kbd className="px-1 py-0.5 rounded bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400 text-[10px]">Ctrl+V</kbd> to paste images
          </span>
          {(images.length > 0 || mdFiles.length > 0) && (
            <span className="text-xs text-primary-500 dark:text-primary-400">
              {images.length > 0 && `${images.length}개 이미지`}
              {images.length > 0 && mdFiles.length > 0 && ', '}
              {mdFiles.length > 0 && `${mdFiles.length}개 문서`}
              {' '}첨부됨
            </span>
          )}
        </div>
      </div>
    </div>
  )
}
