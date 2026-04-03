/**
 * Task Analyzer Component
 *
 * Lead Orchestrator를 사용한 태스크 분석 UI
 * 2-Column Layout: 좌측(입력+결과), 우측(히스토리)
 */

import { useState, useEffect, useRef, useCallback } from 'react'
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
import { useAgentsStore, TaskAnalysisHistory, generateBranchName } from '../stores/agents'
import { Project, useOrchestrationStore } from '../stores/orchestration'
import { useNavigationStore } from '../stores/navigation'
import { TaskEvaluationCard } from './feedback/TaskEvaluationCard'
import { TerminalSelector } from './TerminalSelector'
import {
  Sparkles,
  Loader2,
  ChevronRight,
  GitBranch,
  Users,
  Zap,
  AlertCircle,
  Clock,
  ArrowRight,
  Folder,
  History,
  Trash2,
  CheckCircle2,
  XCircle,
  ChevronDown,
  FolderOpen,
  Terminal,
  SquareTerminal,
  ImagePlus,
  FileText,
  X,
} from 'lucide-react'

// 노력 수준 색상
const effortColors: Record<string, string> = {
  quick: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
  medium: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400',
  thorough: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
}

// 전략 아이콘
const strategyIcons: Record<string, typeof GitBranch> = {
  sequential: ArrowRight,
  parallel: Zap,
  mixed: GitBranch,
}

interface TaskAnalyzerProps {
  projectFilter: string | null
  selectedProject: Project | undefined
}

// Relative time formatting
function formatRelativeTime(dateString: string): string {
  // Backend stores UTC via datetime.utcnow() but without 'Z' suffix.
  // Without 'Z', JS Date() parses as local time. Append 'Z' to fix.
  const normalized = dateString.includes('Z') || dateString.includes('+')
    ? dateString
    : dateString + 'Z'
  const date = new Date(normalized)
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffSec = Math.floor(diffMs / 1000)
  const diffMin = Math.floor(diffSec / 60)
  const diffHour = Math.floor(diffMin / 60)
  const diffDay = Math.floor(diffHour / 24)

  if (diffSec < 60) return '방금 전'
  if (diffMin < 60) return `${diffMin}분 전`
  if (diffHour < 24) return `${diffHour}시간 전`
  if (diffDay < 7) return `${diffDay}일 전`
  return date.toLocaleDateString('ko-KR')
}

export function TaskAnalyzer({ projectFilter, selectedProject }: TaskAnalyzerProps) {
  const {
    analyzeTask,
    lastAnalysis,
    isLoading,
    error,
    clearError,
    // History
    analysisHistory,
    historyLoading,
    historyHasMore,
    historyTotal,
    fetchAnalysisHistory,
    loadMoreHistory,
    deleteAnalysis,
    selectHistoryItem,
    selectedHistoryId,
    // Terminal & Execution
    terminalType,
    executingAnalysisId,
    executionSessionId,
    executionError,
    executeInTerminal,
    clearExecution,
    // Images
    attachedImages,
    addAttachedImages,
    removeAttachedImage,
    clearAttachedImages,
    // OCR
    ocrStatuses,
    extractTextFromImage,
    setOcrStatus,
    removeOcrStatus,
    // MD files
    attachedMdFiles,
    addAttachedMdFiles,
    removeAttachedMdFile,
    clearAttachedMdFiles,
    mdReadStatuses,
    setMdReadStatus,
    removeMdReadStatus,
  } = useAgentsStore()
  const { projects } = useOrchestrationStore()
  const { pendingTaskInput, setPendingTaskInput } = useNavigationStore()
  const [taskInput, setTaskInput] = useState('')
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [isDragOver, setIsDragOver] = useState(false)
  const [showBranchConfirm, setShowBranchConfirm] = useState(false)
  const [branchName, setBranchName] = useState('')
  const pendingProcessedRef = useRef(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const mdFileInputRef = useRef<HTMLInputElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  // Create a map for quick project name lookup
  const projectMap = new Map(projects.map(p => [p.id, p]))

  // Fetch history on mount and when project filter changes
  useEffect(() => {
    fetchAnalysisHistory(projectFilter, true)
  }, [projectFilter, fetchAnalysisHistory])

  // ChatInput에서 전달된 pendingTaskInput 처리
  useEffect(() => {
    if (pendingTaskInput && !pendingProcessedRef.current) {
      pendingProcessedRef.current = true
      setTaskInput(pendingTaskInput)
      setPendingTaskInput(null)
      // 프로젝트 컨텍스트와 함께 자동 분석 시작
      const context = selectedProject
        ? { project_id: projectFilter, project_name: selectedProject.name, project_path: selectedProject.path }
        : undefined
      // Clear history selection
      if (selectedHistoryId) {
        selectHistoryItem(null)
      }
      analyzeTask(pendingTaskInput.trim(), context)
    }
    if (!pendingTaskInput) {
      pendingProcessedRef.current = false
    }
  }, [pendingTaskInput, setPendingTaskInput, selectedProject, projectFilter, analyzeTask, selectedHistoryId, selectHistoryItem])

  const handleAnalyze = async () => {
    if (!taskInput.trim() || isLoading) return
    // Clear history selection when running new analysis
    if (selectedHistoryId) {
      selectHistoryItem(null)
    }
    // Include project context in analysis
    const context = selectedProject ? { project_id: projectFilter, project_name: selectedProject.name, project_path: selectedProject.path } : undefined
    await analyzeTask(taskInput.trim(), context)
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey && !e.repeat) {
      e.preventDefault()
      handleAnalyze()
    }
  }

  const handleDelete = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation() // Prevent triggering select when clicking delete
    setDeletingId(id)
    await deleteAnalysis(id)
    setDeletingId(null)
  }

  const handleSelect = (item: TaskAnalysisHistory) => {
    // Toggle selection - if already selected, deselect
    if (selectedHistoryId === item.id) {
      selectHistoryItem(null)
    } else {
      selectHistoryItem(item)
    }
  }

  const handleExecute = () => {
    const analysisId = lastAnalysis?.analysis_id
    if (!analysisId || executingAnalysisId) return

    const autoName = generateBranchName(taskInput || 'task')
    setBranchName(autoName)
    setShowBranchConfirm(true)
  }

  const handleConfirmExecute = async () => {
    const analysisId = lastAnalysis?.analysis_id
    if (!analysisId) return

    setShowBranchConfirm(false)
    await executeInTerminal(analysisId, projectFilter, branchName || undefined)
  }

  // Image handling + OCR
  const triggerOcr = useCallback((file: File) => {
    const fileKey = getFileKey(file)
    setOcrStatus(fileKey, 'processing')

    extractTextFromImage(file).then(text => {
      if (text !== null && text.trim().length > 0) {
        setTaskInput(prev => `${prev}\n\n[이미지 OCR: ${file.name}]\n${text.trim()}`)
        setOcrStatus(fileKey, 'done')
      } else if (text !== null) {
        // 텍스트 없는 이미지 - 에러 아닌 정상 완료
        setOcrStatus(fileKey, 'done')
      } else {
        setOcrStatus(fileKey, 'error')
      }
    })
  }, [extractTextFromImage, setOcrStatus])

  const handleImageFiles = useCallback((files: FileList | File[]) => {
    const validFiles = Array.from(files).filter(f => ALLOWED_IMAGE_TYPES.includes(f.type))
    if (validFiles.length === 0) return
    addAttachedImages(validFiles)

    // 각 비-SVG 이미지에 대해 비동기 OCR 실행
    for (const file of validFiles) {
      if (file.type === 'image/svg+xml') continue
      triggerOcr(file)
    }
  }, [addAttachedImages, triggerOcr])

  const handleRemoveImage = useCallback((idx: number) => {
    const file = attachedImages[idx]
    if (file) {
      removeOcrStatus(getFileKey(file))
      setTaskInput(prev => removeOcrBlock(prev, file.name))
    }
    removeAttachedImage(idx)
  }, [attachedImages, removeAttachedImage, removeOcrStatus])

  // MD file handling (must be before handleDrop)
  const handleMdFiles = useCallback((files: FileList | File[]) => {
    const mdFileList = Array.from(files).filter(isMdFile)
    if (mdFileList.length === 0) return

    const validFiles: File[] = []
    for (const file of mdFileList) {
      const error = validateMdFile(file, attachedMdFiles.length + validFiles.length)
      if (error) {
        console.warn(error)
        continue
      }
      validFiles.push(file)
    }

    if (validFiles.length === 0) return
    addAttachedMdFiles(validFiles)

    // 각 파일 읽기
    for (const file of validFiles) {
      const fileKey = getFileKey(file)
      setMdReadStatus(fileKey, 'reading')

      readTextFile(file).then(content => {
        setTaskInput(prev => `${prev}${prev ? '\n\n' : ''}[문서: ${file.name}]\n${content}`)
        setMdReadStatus(fileKey, 'done')
      }).catch(() => {
        setMdReadStatus(fileKey, 'error')
      })
    }
  }, [attachedMdFiles.length, addAttachedMdFiles, setMdReadStatus])

  const handleRemoveMdFile = useCallback((idx: number) => {
    const file = attachedMdFiles[idx]
    if (file) {
      removeMdReadStatus(getFileKey(file))
      setTaskInput(prev => removeMdBlock(prev, file.name))
    }
    removeAttachedMdFile(idx)
  }, [attachedMdFiles, removeAttachedMdFile, removeMdReadStatus])

  const handleMdFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      handleMdFiles(e.target.files)
    }
    e.target.value = ''
  }, [handleMdFiles])

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
      handleImageFiles(imageFiles)
    }
  }, [handleImageFiles])

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
      const mdDropFiles = files.filter(isMdFile)
      if (imageFiles.length > 0) handleImageFiles(imageFiles)
      if (mdDropFiles.length > 0) handleMdFiles(mdDropFiles)
    }
  }, [handleImageFiles, handleMdFiles])

  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      handleImageFiles(e.target.files)
    }
    // Reset input to allow re-selecting same file
    e.target.value = ''
  }, [handleImageFiles])

  return (
    <div className="flex flex-col lg:flex-row gap-4 flex-1 min-h-0">
      {/* Left Column: Input + Results */}
      <div className="flex-1 min-w-0 overflow-y-auto">
        <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700">
          {/* Header */}
          <div className="p-4 border-b border-gray-200 dark:border-gray-700">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white flex items-center gap-2">
                <Sparkles className="w-5 h-5 text-purple-500" />
                Task Analyzer
              </h3>
              {selectedProject && (
                <span className="inline-flex items-center gap-1.5 px-2 py-1 bg-primary-100 dark:bg-primary-900/30 text-primary-700 dark:text-primary-400 text-xs rounded-full">
                  <Folder className="w-3 h-3" />
                  {selectedProject.name}
                </span>
              )}
            </div>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
              {selectedProject
                ? `"${selectedProject.name}" 프로젝트 컨텍스트에서 태스크를 분석합니다`
                : 'Analyze complex tasks and see how Lead Orchestrator would decompose them'}
            </p>
          </div>

          {/* Input */}
          <div
            className={cn(
              'p-4 border-b border-gray-200 dark:border-gray-700 transition-colors',
              isDragOver && 'bg-primary-50 dark:bg-primary-900/10 border-primary-300 dark:border-primary-700'
            )}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
          >
            <textarea
              ref={textareaRef}
              value={taskInput}
              onChange={(e) => setTaskInput(e.target.value)}
              onKeyDown={handleKeyDown}
              onPaste={handlePaste}
              placeholder="Enter a task to analyze... (이미지/MD 문서를 붙여넣기하거나 드래그하세요)"
              className="w-full px-3 py-2 border border-gray-200 dark:border-gray-600 rounded-lg bg-gray-50 dark:bg-gray-900 text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-primary-500 resize-none text-sm"
              rows={10}
            />

            {/* Image Previews */}
            {attachedImages.length > 0 && (
              <div className="flex flex-wrap gap-2 mt-2">
                {attachedImages.map((file, idx) => {
                  const ocrStatus = ocrStatuses[getFileKey(file)]
                  return (
                    <div
                      key={`${file.name}-${idx}`}
                      className="relative group w-16 h-16 rounded-lg overflow-hidden border border-gray-200 dark:border-gray-600 bg-gray-100 dark:bg-gray-800"
                    >
                      <img
                        src={URL.createObjectURL(file)}
                        alt={file.name}
                        className="w-full h-full object-cover"
                        onLoad={(e) => URL.revokeObjectURL((e.target as HTMLImageElement).src)}
                      />
                      <button
                        onClick={() => handleRemoveImage(idx)}
                        className="absolute -top-1 -right-1 w-5 h-5 bg-red-500 text-white rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity shadow-sm"
                        title="이미지 제거"
                      >
                        <X className="w-3 h-3" />
                      </button>
                      <div className="absolute bottom-0 left-0 right-0 bg-black/50 text-white text-[8px] px-1 truncate">
                        {file.name}
                      </div>
                      {/* OCR 상태 오버레이 */}
                      {ocrStatus === 'processing' && (
                        <div className="absolute bottom-0 right-0 p-0.5 bg-blue-500 rounded-tl-md" title="OCR 처리 중...">
                          <Loader2 className="w-3 h-3 text-white animate-spin" />
                        </div>
                      )}
                      {ocrStatus === 'done' && (
                        <div className="absolute bottom-0 right-0 p-0.5 bg-green-500 rounded-tl-md" title="OCR 완료">
                          <CheckCircle2 className="w-3 h-3 text-white" />
                        </div>
                      )}
                      {ocrStatus === 'error' && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation()
                            triggerOcr(file)
                          }}
                          className="absolute bottom-0 right-0 p-0.5 bg-red-500 rounded-tl-md hover:bg-red-600 transition-colors"
                          title="OCR 실패 - 클릭하여 재시도"
                        >
                          <AlertCircle className="w-3 h-3 text-white" />
                        </button>
                      )}
                    </div>
                  )
                })}
              </div>
            )}

            {/* MD File Previews */}
            {attachedMdFiles.length > 0 && (
              <div className="flex flex-wrap gap-2 mt-2">
                {attachedMdFiles.map((file, idx) => {
                  const readStatus = mdReadStatuses[getFileKey(file)]
                  return (
                    <div
                      key={`md-${file.name}-${idx}`}
                      className="relative group flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-800 text-xs"
                    >
                      <FileText className="w-3.5 h-3.5 text-blue-500 flex-shrink-0" />
                      <span className="text-gray-700 dark:text-gray-300 max-w-[120px] truncate">{file.name}</span>
                      {readStatus === 'reading' && (
                        <Loader2 className="w-3 h-3 text-blue-500 animate-spin flex-shrink-0" />
                      )}
                      {readStatus === 'done' && (
                        <CheckCircle2 className="w-3 h-3 text-green-500 flex-shrink-0" />
                      )}
                      {readStatus === 'error' && (
                        <AlertCircle className="w-3 h-3 text-red-500 flex-shrink-0" />
                      )}
                      <button
                        onClick={() => handleRemoveMdFile(idx)}
                        className="w-4 h-4 flex items-center justify-center rounded-full bg-red-500 text-white opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0"
                        title="문서 제거"
                      >
                        <X className="w-2.5 h-2.5" />
                      </button>
                    </div>
                  )
                })}
              </div>
            )}

            {/* Drag overlay hint */}
            {isDragOver && (
              <div className="mt-2 py-3 border-2 border-dashed border-primary-400 dark:border-primary-600 rounded-lg text-center text-sm text-primary-600 dark:text-primary-400">
                <ImagePlus className="w-5 h-5 mx-auto mb-1" />
                이미지 또는 MD 문서를 여기에 놓으세요
              </div>
            )}

            <div className="flex items-center justify-between mt-3">
              <div className="flex items-center gap-2">
                {/* File inputs (hidden) */}
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
                <button
                  onClick={() => fileInputRef.current?.click()}
                  disabled={attachedImages.length >= MAX_IMAGES}
                  className={cn(
                    'p-2 rounded-lg transition-colors flex items-center gap-1.5 text-xs',
                    attachedImages.length >= MAX_IMAGES
                      ? 'text-gray-300 dark:text-gray-600 cursor-not-allowed'
                      : 'text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 hover:text-gray-700 dark:hover:text-gray-300'
                  )}
                  title={attachedImages.length >= MAX_IMAGES ? `최대 ${MAX_IMAGES}개` : '이미지 첨부'}
                >
                  <ImagePlus className="w-4 h-4" />
                  <span>이미지</span>
                </button>
                <button
                  onClick={() => mdFileInputRef.current?.click()}
                  disabled={attachedMdFiles.length >= MAX_MD_FILES}
                  className={cn(
                    'p-2 rounded-lg transition-colors flex items-center gap-1.5 text-xs',
                    attachedMdFiles.length >= MAX_MD_FILES
                      ? 'text-gray-300 dark:text-gray-600 cursor-not-allowed'
                      : 'text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 hover:text-gray-700 dark:hover:text-gray-300'
                  )}
                  title={attachedMdFiles.length >= MAX_MD_FILES ? `최대 ${MAX_MD_FILES}개` : 'MD 문서 첨부'}
                >
                  <FileText className="w-4 h-4" />
                  <span>문서</span>
                </button>
                {(attachedImages.length > 0 || attachedMdFiles.length > 0) && (
                  <button
                    onClick={() => {
                      setTaskInput(prev => {
                        let text = prev
                        for (const file of attachedImages) text = removeOcrBlock(text, file.name)
                        for (const file of attachedMdFiles) text = removeMdBlock(text, file.name)
                        return text
                      })
                      clearAttachedImages()
                      clearAttachedMdFiles()
                    }}
                    className="text-xs text-gray-400 hover:text-red-500 dark:hover:text-red-400 transition-colors"
                  >
                    전체 삭제
                  </button>
                )}
                {attachedImages.length > 0 && (
                  <span className="text-xs text-gray-400 dark:text-gray-500">
                    {attachedImages.length}/{MAX_IMAGES}
                  </span>
                )}
                {attachedMdFiles.length > 0 && (
                  <span className="text-xs text-gray-400 dark:text-gray-500">
                    {attachedMdFiles.length}/{MAX_MD_FILES} 문서
                  </span>
                )}
              </div>
              <button
                onClick={handleAnalyze}
                disabled={isLoading || !taskInput.trim()}
                className={cn(
                  'px-4 py-2 rounded-lg font-medium flex items-center gap-2 transition-colors',
                  isLoading || !taskInput.trim()
                    ? 'bg-gray-200 dark:bg-gray-700 text-gray-400 cursor-not-allowed'
                    : 'bg-primary-500 hover:bg-primary-600 text-white'
                )}
              >
                {isLoading ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Analyzing...
                  </>
                ) : (
                  <>
                    <Sparkles className="w-4 h-4" />
                    Analyze Task
                  </>
                )}
              </button>
            </div>
          </div>

          {/* Error */}
          {error && (
            <div className="p-4 bg-red-50 dark:bg-red-900/20 border-b border-red-200 dark:border-red-800">
              <div className="flex items-center gap-2 text-red-600 dark:text-red-400">
                <AlertCircle className="w-4 h-4" />
                <span className="text-sm">{error}</span>
                <button
                  onClick={clearError}
                  className="ml-auto text-red-500 hover:text-red-600 text-sm"
                >
                  Dismiss
                </button>
              </div>
            </div>
          )}

          {/* Results */}
          {lastAnalysis && lastAnalysis.success && lastAnalysis.analysis && (
            <div className="p-4 space-y-4">
              {/* History indicator */}
              {selectedHistoryId && (
                <div className="flex items-center justify-between pb-3 border-b border-gray-200 dark:border-gray-700">
                  <div className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400">
                    <History className="w-4 h-4" />
                    <span>히스토리에서 불러온 분석 결과</span>
                  </div>
                  <button
                    onClick={() => selectHistoryItem(null)}
                    className="text-xs text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"
                  >
                    닫기
                  </button>
                </div>
              )}

              {/* Analysis Summary */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <div className="bg-gray-50 dark:bg-gray-900 rounded-lg p-3">
                  <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">Complexity</p>
                  <p className="text-lg font-semibold text-gray-900 dark:text-white">
                    {lastAnalysis.analysis.analysis.complexity_score}/10
                  </p>
                </div>
                <div className="bg-gray-50 dark:bg-gray-900 rounded-lg p-3">
                  <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">Effort Level</p>
                  <span className={cn('px-2 py-1 rounded-full text-xs font-medium', effortColors[lastAnalysis.analysis.analysis.effort_level])}>
                    {lastAnalysis.analysis.analysis.effort_level}
                  </span>
                </div>
                <div className="bg-gray-50 dark:bg-gray-900 rounded-lg p-3">
                  <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">Subtasks</p>
                  <p className="text-lg font-semibold text-gray-900 dark:text-white">
                    {lastAnalysis.analysis.subtask_count}
                  </p>
                </div>
                <div className="bg-gray-50 dark:bg-gray-900 rounded-lg p-3">
                  <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">Strategy</p>
                  <div className="flex items-center gap-1">
                    {(() => {
                      const StrategyIcon = strategyIcons[lastAnalysis.analysis.strategy] || GitBranch
                      return <StrategyIcon className="w-4 h-4 text-primary-500" />
                    })()}
                    <span className="text-sm font-medium text-gray-900 dark:text-white capitalize">
                      {lastAnalysis.analysis.strategy}
                    </span>
                  </div>
                </div>
              </div>

              {/* Context Summary */}
              <div className="bg-gray-50 dark:bg-gray-900 rounded-lg p-4">
                <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Context Summary
                </h4>
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  {lastAnalysis.analysis.analysis.context_summary}
                </p>
              </div>

              {/* Key Requirements */}
              {lastAnalysis.analysis.analysis.key_requirements.length > 0 && (
                <div>
                  <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    Key Requirements
                  </h4>
                  <div className="flex flex-wrap gap-2">
                    {lastAnalysis.analysis.analysis.key_requirements.map((req, i) => (
                      <span
                        key={i}
                        className="px-2 py-1 bg-primary-100 dark:bg-primary-900/30 text-primary-700 dark:text-primary-400 text-xs rounded-full"
                      >
                        {req}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* Execution Plan */}
              <div>
                <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">
                  Execution Plan
                </h4>

                {/* Parallel Groups */}
                {lastAnalysis.analysis.execution_plan.parallel_groups.length > 0 && (
                  <div className="space-y-3">
                    {lastAnalysis.analysis.execution_plan.parallel_groups.map((group, groupIndex) => (
                      <div key={groupIndex} className="relative">
                        <div className="flex items-center gap-2 mb-2">
                          <span className="text-xs font-medium text-gray-500 dark:text-gray-400">
                            Step {groupIndex + 1}
                          </span>
                          {group.length > 1 && (
                            <span className="px-2 py-0.5 bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 text-xs rounded-full flex items-center gap-1">
                              <Zap className="w-3 h-3" />
                              Parallel
                            </span>
                          )}
                        </div>
                        <div className={cn('grid gap-2', group.length > 1 ? 'grid-cols-1 md:grid-cols-2' : 'grid-cols-1')}>
                          {group.map((taskId) => {
                            const subtask = lastAnalysis.analysis?.execution_plan.subtasks[taskId]
                            if (!subtask) return null

                            return (
                              <div
                                key={taskId}
                                className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-3"
                              >
                                <div className="flex items-start justify-between mb-2">
                                  <h5 className="text-sm font-medium text-gray-900 dark:text-white">
                                    {subtask.title}
                                  </h5>
                                  <span className={cn('px-2 py-0.5 text-xs rounded-full', effortColors[subtask.effort])}>
                                    {subtask.effort}
                                  </span>
                                </div>
                                {subtask.agent && (
                                  <div className="flex items-center gap-1.5 text-xs text-gray-500 dark:text-gray-400">
                                    <Users className="w-3 h-3" />
                                    <span>{subtask.agent}</span>
                                  </div>
                                )}
                                {subtask.dependencies.length > 0 && (
                                  <div className="mt-2 flex items-center gap-1 text-xs text-gray-400 dark:text-gray-500">
                                    <GitBranch className="w-3 h-3" />
                                    <span>Depends on: {subtask.dependencies.join(', ')}</span>
                                  </div>
                                )}
                              </div>
                            )
                          })}
                        </div>
                        {groupIndex < lastAnalysis.analysis!.execution_plan.parallel_groups.length - 1 && (
                          <div className="flex justify-center my-2">
                            <ChevronRight className="w-5 h-5 text-gray-300 dark:text-gray-600 rotate-90" />
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Execution Time + Execute Button */}
              <div className="pt-3 border-t border-gray-200 dark:border-gray-700 flex items-center justify-between text-sm text-gray-500 dark:text-gray-400">
                <div className="flex items-center gap-1">
                  <Clock className="w-4 h-4" />
                  <span>Analysis completed in {lastAnalysis.execution_time_ms}ms</span>
                </div>
                <div className="flex items-center gap-3">
                  {lastAnalysis.analysis.analysis.requires_decomposition && (
                    <div className="flex items-center gap-1 text-amber-600 dark:text-amber-400">
                      <AlertCircle className="w-4 h-4" />
                      <span>Task requires decomposition</span>
                    </div>
                  )}
                  {/* Terminal Selector + Execute Button */}
                  {lastAnalysis.analysis_id && (
                    <div className="flex items-center gap-2">
                      <TerminalSelector />
                      <div className="relative">
                        <button
                          onClick={handleExecute}
                          disabled={!!executingAnalysisId || isLoading || !projectFilter}
                          title={!projectFilter ? '프로젝트를 먼저 선택하세요' : `${terminalType === 'warp' ? 'Warp' : 'Tmux'} 터미널에서 Claude Code 실행`}
                          className={cn(
                            'px-3 py-1.5 rounded-lg font-medium text-xs flex items-center gap-1.5 transition-colors',
                            executingAnalysisId || !projectFilter
                              ? 'bg-gray-200 dark:bg-gray-700 text-gray-400 cursor-not-allowed'
                              : 'bg-green-500 hover:bg-green-600 text-white'
                          )}
                        >
                          {executingAnalysisId ? (
                            <>
                              <Loader2 className="w-3.5 h-3.5 animate-spin" />
                              {terminalType === 'warp' ? 'Opening Warp...' : 'Starting Tmux...'}
                            </>
                          ) : (
                            <>
                              <Terminal className="w-3.5 h-3.5" />
                              Execute with Claude Code
                            </>
                          )}
                        </button>

                        {/* Branch Confirm Popover */}
                        {showBranchConfirm && (
                          <div className="absolute bottom-full right-0 mb-2 w-80 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 rounded-lg shadow-lg p-4 z-50">
                            <div className="flex items-center gap-2 mb-3">
                              <GitBranch className="w-4 h-4 text-primary-500" />
                              <span className="text-sm font-medium text-gray-900 dark:text-white">Feature Branch에서 실행</span>
                            </div>
                            <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">Branch name</label>
                            <input
                              type="text"
                              value={branchName}
                              onChange={(e) => setBranchName(e.target.value)}
                              className="w-full px-2 py-1.5 text-xs border border-gray-200 dark:border-gray-600 rounded bg-gray-50 dark:bg-gray-900 text-gray-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-primary-500"
                              aria-label="Branch name"
                            />
                            <div className="flex justify-end gap-2 mt-3">
                              <button
                                onClick={() => setShowBranchConfirm(false)}
                                className="px-3 py-1.5 text-xs rounded-md bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
                              >
                                Cancel
                              </button>
                              <button
                                onClick={handleConfirmExecute}
                                disabled={!branchName.trim()}
                                className="px-3 py-1.5 text-xs rounded-md bg-green-500 hover:bg-green-600 text-white font-medium disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                              >
                                Execute
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Tmux Session Info Banner */}
              {executionSessionId && terminalType === 'tmux' && (
                <div className="flex items-center gap-2 p-3 rounded-lg bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400 text-sm">
                  <SquareTerminal className="w-4 h-4 flex-shrink-0" />
                  <span>
                    Tmux 세션 시작됨: <code className="px-1 py-0.5 rounded bg-blue-100 dark:bg-blue-900/40 text-xs">{executionSessionId}</code>
                  </span>
                  <span className="text-xs text-blue-400 dark:text-blue-500">
                    tmux attach -t {executionSessionId}
                  </span>
                  <button
                    onClick={clearExecution}
                    className="ml-auto text-xs hover:underline"
                    aria-label="Dismiss tmux session info"
                  >
                    Dismiss
                  </button>
                </div>
              )}

              {/* Execution Error */}
              {executionError && (
                <div className="flex items-center gap-2 p-3 rounded-lg bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 text-sm">
                  <AlertCircle className="w-4 h-4 flex-shrink-0" />
                  <span>{executionError}</span>
                  <button
                    onClick={clearExecution}
                    className="ml-auto text-xs hover:underline"
                  >
                    Dismiss
                  </button>
                </div>
              )}

            </div>
          )}

          {/* Empty State */}
          {!lastAnalysis && !isLoading && (
            <div className="p-8 text-center text-gray-500 dark:text-gray-400">
              <Sparkles className="w-12 h-12 mx-auto mb-3 opacity-30" />
              <p>Enter a task above to see how it would be analyzed and decomposed</p>
            </div>
          )}
        </div>
      </div>

      {/* Vertical Divider */}
      <div className="hidden lg:block w-px bg-gray-200 dark:bg-gray-700 flex-shrink-0" />

      {/* Right Column: Analysis History */}
      <div className="w-full lg:w-72 xl:w-80 flex-shrink-0 overflow-y-auto">
        <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 flex flex-col">
          {/* History Header */}
          <div className="p-4 border-b border-gray-200 dark:border-gray-700">
            <h3 className="text-sm font-semibold text-gray-900 dark:text-white flex items-center gap-2">
              <History className="w-4 h-4 text-gray-500" />
              Analysis History
              {historyTotal > 0 && (
                <span className="ml-auto text-xs font-normal text-gray-500 dark:text-gray-400">
                  {historyTotal}개
                </span>
              )}
            </h3>
          </div>

          {/* History List */}
          <div className="flex-1 overflow-y-auto">
            {analysisHistory.length > 0 ? (
              <div className="divide-y divide-gray-100 dark:divide-gray-700">
                {analysisHistory.map((item) => (
                  <HistoryItem
                    key={item.id}
                    item={item}
                    projectName={item.project_id ? projectMap.get(item.project_id)?.name : undefined}
                    onDelete={handleDelete}
                    onSelect={handleSelect}
                    isDeleting={deletingId === item.id}
                    isSelected={selectedHistoryId === item.id}
                  />
                ))}
              </div>
            ) : historyLoading ? (
              <div className="p-8 text-center text-gray-500 dark:text-gray-400">
                <Loader2 className="w-6 h-6 mx-auto mb-2 animate-spin opacity-50" />
                <p className="text-sm">Loading history...</p>
              </div>
            ) : (
              <div className="p-8 text-center text-gray-500 dark:text-gray-400">
                <History className="w-8 h-8 mx-auto mb-2 opacity-30" />
                <p className="text-sm">No analysis history yet</p>
                <p className="text-xs mt-1 opacity-70">분석을 실행하면 여기에 기록됩니다</p>
              </div>
            )}
          </div>

          {/* Load More */}
          {historyHasMore && (
            <div className="p-3 border-t border-gray-200 dark:border-gray-700">
              <button
                onClick={loadMoreHistory}
                disabled={historyLoading}
                className={cn(
                  'w-full py-2 px-4 rounded-lg text-sm font-medium flex items-center justify-center gap-2 transition-colors',
                  historyLoading
                    ? 'bg-gray-100 dark:bg-gray-800 text-gray-400 cursor-not-allowed'
                    : 'bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300'
                )}
              >
                {historyLoading ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Loading...
                  </>
                ) : (
                  <>
                    <ChevronDown className="w-4 h-4" />
                    Load More
                  </>
                )}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// History Item Component
interface HistoryItemProps {
  item: TaskAnalysisHistory
  projectName?: string
  onDelete: (id: string, e: React.MouseEvent) => void
  onSelect: (item: TaskAnalysisHistory) => void
  isDeleting: boolean
  isSelected: boolean
}

function HistoryItem({ item, projectName, onDelete, onSelect, isDeleting, isSelected }: HistoryItemProps) {
  return (
    <div
      onClick={() => onSelect(item)}
      className={cn(
        'p-3 transition-colors group cursor-pointer',
        isSelected
          ? 'bg-primary-50 dark:bg-primary-900/20 border-l-2 border-primary-500'
          : 'hover:bg-gray-50 dark:hover:bg-gray-800/50 border-l-2 border-transparent'
      )}
    >
      <div className="flex items-start gap-2">
        {/* Status Icon */}
        <div className="mt-0.5 flex-shrink-0">
          {item.success ? (
            <CheckCircle2 className={cn(
              'w-4 h-4',
              isSelected ? 'text-primary-500' : 'text-green-500'
            )} />
          ) : (
            <XCircle className="w-4 h-4 text-red-500" />
          )}
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          <p className={cn(
            'text-sm truncate',
            isSelected
              ? 'text-primary-700 dark:text-primary-300 font-medium'
              : 'text-gray-900 dark:text-white'
          )} title={item.task_input}>
            {item.task_input}
          </p>

          <div className="flex flex-wrap items-center gap-2 mt-1 text-xs text-gray-500 dark:text-gray-400">
            <span>{formatRelativeTime(item.created_at)}</span>

            {projectName && (
              <span className="inline-flex items-center gap-1 px-1.5 py-0.5 bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400 rounded text-[10px] font-medium">
                <FolderOpen className="w-2.5 h-2.5" />
                {projectName}
              </span>
            )}

            {item.success && item.effort_level && (
              <span className={cn(
                'px-1.5 py-0.5 rounded-full text-[10px] font-medium',
                effortColors[item.effort_level]
              )}>
                {item.effort_level}
              </span>
            )}
          </div>

          {/* Error message for failed analyses */}
          {!item.success && item.error && (
            <p className="mt-1 text-xs text-red-500 dark:text-red-400 truncate" title={item.error}>
              {item.error}
            </p>
          )}

          {/* Evaluation - 선택된 성공 항목에만 표시 */}
          {isSelected && item.success && (
            <div className="mt-2 pt-1.5 border-t border-gray-200 dark:border-gray-700" onClick={(e) => e.stopPropagation()}>
              <TaskEvaluationCard
                sessionId="task-analyzer"
                taskId={item.id}
                contextSummary={item.task_input}
                effortLevel={item.effort_level || undefined}
                projectName={projectName}
              />
            </div>
          )}
        </div>

        {/* Delete Button */}
        <button
          onClick={(e) => onDelete(item.id, e)}
          disabled={isDeleting}
          className={cn(
            'p-1 rounded transition-colors flex-shrink-0',
            isSelected ? 'opacity-100' : 'opacity-0 group-hover:opacity-100',
            isDeleting
              ? 'cursor-not-allowed'
              : 'hover:bg-red-100 dark:hover:bg-red-900/30 text-gray-400 hover:text-red-500 dark:hover:text-red-400'
          )}
          title="Delete analysis"
        >
          {isDeleting ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
          ) : (
            <Trash2 className="w-3.5 h-3.5" />
          )}
        </button>
      </div>
    </div>
  )
}
