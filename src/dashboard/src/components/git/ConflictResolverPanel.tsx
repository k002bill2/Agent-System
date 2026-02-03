import { useState, useEffect } from 'react'
import {
  X,
  AlertTriangle,
  CheckCircle2,
  FileCode,
  GitMerge,
  RotateCcw,
  Loader2,
} from 'lucide-react'
import { cn } from '../../lib/utils'
import type {
  ConflictFile,
  ResolutionStrategy,
  MergeStatus,
} from '../../stores/git'

interface ConflictResolverPanelProps {
  conflictFiles: ConflictFile[]
  mergeStatus: MergeStatus | null
  sourceBranch: string
  targetBranch: string
  isResolving: boolean
  onResolve: (
    filePath: string,
    strategy: ResolutionStrategy,
    customContent?: string
  ) => Promise<boolean>
  onAbort: () => Promise<boolean>
  onComplete: (message?: string) => Promise<boolean>
  onClose: () => void
}

export function ConflictResolverPanel({
  conflictFiles,
  mergeStatus,
  sourceBranch,
  targetBranch,
  isResolving,
  onResolve,
  onAbort,
  onComplete,
  onClose,
}: ConflictResolverPanelProps) {
  const [selectedFile, setSelectedFile] = useState<ConflictFile | null>(null)
  const [strategy, setStrategy] = useState<ResolutionStrategy>('ours')
  const [customContent, setCustomContent] = useState('')
  const [resolvedFiles, setResolvedFiles] = useState<Set<string>>(new Set())
  const [commitMessage, setCommitMessage] = useState('')
  const [isAborting, setIsAborting] = useState(false)
  const [isCompleting, setIsCompleting] = useState(false)

  // Select first file by default
  useEffect(() => {
    if (conflictFiles.length > 0 && !selectedFile) {
      setSelectedFile(conflictFiles[0])
    }
  }, [conflictFiles, selectedFile])

  // Update custom content when selecting a file or changing strategy
  useEffect(() => {
    if (selectedFile) {
      if (strategy === 'ours') {
        setCustomContent(selectedFile.our_content)
      } else if (strategy === 'theirs') {
        setCustomContent(selectedFile.their_content)
      }
      // For custom, keep the current content as user may be editing
    }
  }, [selectedFile, strategy])

  const handleResolve = async () => {
    if (!selectedFile) return

    const content = strategy === 'custom' ? customContent : undefined
    const success = await onResolve(selectedFile.path, strategy, content)

    if (success) {
      setResolvedFiles((prev) => new Set(prev).add(selectedFile.path))
      // Move to next unresolved file
      const nextFile = conflictFiles.find(
        (f) => f.path !== selectedFile.path && !resolvedFiles.has(f.path)
      )
      if (nextFile) {
        setSelectedFile(nextFile)
        setStrategy('ours')
      } else {
        setSelectedFile(null)
      }
    }
  }

  const handleAbort = async () => {
    setIsAborting(true)
    const success = await onAbort()
    if (success) {
      onClose()
    }
    setIsAborting(false)
  }

  const handleComplete = async () => {
    setIsCompleting(true)
    const message =
      commitMessage.trim() ||
      `Merge branch '${sourceBranch}' into ${targetBranch}`
    const success = await onComplete(message)
    if (success) {
      onClose()
    }
    setIsCompleting(false)
  }

  const allResolved =
    conflictFiles.length === 0 ||
    conflictFiles.every((f) => resolvedFiles.has(f.path))
  const canComplete = mergeStatus?.can_commit || allResolved

  return (
    <div className="fixed inset-0 z-50 flex bg-black/50">
      <div className="flex flex-1 m-4 bg-white dark:bg-gray-800 rounded-xl shadow-xl overflow-hidden">
        {/* Sidebar - File List */}
        <div className="w-64 border-r border-gray-200 dark:border-gray-700 flex flex-col">
          <div className="p-4 border-b border-gray-200 dark:border-gray-700">
            <h3 className="text-sm font-semibold text-gray-900 dark:text-white">
              충돌 파일 ({conflictFiles.length})
            </h3>
          </div>
          <div className="flex-1 overflow-y-auto">
            {conflictFiles.map((file) => {
              const isResolved = resolvedFiles.has(file.path)
              const isSelected = selectedFile?.path === file.path
              return (
                <button
                  key={file.path}
                  onClick={() => {
                    setSelectedFile(file)
                    setStrategy('ours')
                  }}
                  className={cn(
                    'w-full flex items-center gap-2 px-4 py-2 text-left text-sm transition-colors',
                    isSelected
                      ? 'bg-primary-50 dark:bg-primary-900/20 text-primary-700 dark:text-primary-300'
                      : 'hover:bg-gray-50 dark:hover:bg-gray-700',
                    isResolved && 'opacity-50'
                  )}
                >
                  {isResolved ? (
                    <CheckCircle2 className="w-4 h-4 text-green-500 flex-shrink-0" />
                  ) : (
                    <AlertTriangle className="w-4 h-4 text-red-500 flex-shrink-0" />
                  )}
                  <span className="truncate font-mono text-xs">
                    {file.path}
                  </span>
                </button>
              )
            })}
            {conflictFiles.length === 0 && (
              <div className="p-4 text-sm text-gray-500 text-center">
                모든 충돌이 해결되었습니다
              </div>
            )}
          </div>
        </div>

        {/* Main Content */}
        <div className="flex-1 flex flex-col min-w-0">
          {/* Header */}
          <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-700">
            <div className="flex items-center gap-2">
              <GitMerge className="w-5 h-5 text-primary-600" />
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
                충돌 해결
              </h2>
            </div>
            <div className="flex items-center gap-2">
              <span className="font-mono text-sm bg-gray-100 dark:bg-gray-700 px-2 py-1 rounded">
                {sourceBranch}
              </span>
              <span className="text-gray-400">→</span>
              <span className="font-mono text-sm bg-gray-100 dark:bg-gray-700 px-2 py-1 rounded">
                {targetBranch}
              </span>
            </div>
            <button
              onClick={onClose}
              className="p-1.5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Diff View */}
          {selectedFile ? (
            <div className="flex-1 flex flex-col overflow-hidden">
              {/* File Header */}
              <div className="flex items-center justify-between px-4 py-2 bg-gray-50 dark:bg-gray-900 border-b border-gray-200 dark:border-gray-700">
                <div className="flex items-center gap-2">
                  <FileCode className="w-4 h-4 text-gray-400" />
                  <span className="font-mono text-sm text-gray-700 dark:text-gray-300">
                    {selectedFile.path}
                  </span>
                </div>
                {/* Strategy Selection */}
                <div className="flex items-center gap-4">
                  <label className="flex items-center gap-1.5 text-sm cursor-pointer">
                    <input
                      type="radio"
                      name="strategy"
                      checked={strategy === 'ours'}
                      onChange={() => setStrategy('ours')}
                      className="text-primary-600"
                    />
                    <span className="text-gray-700 dark:text-gray-300">
                      Ours (Target)
                    </span>
                  </label>
                  <label className="flex items-center gap-1.5 text-sm cursor-pointer">
                    <input
                      type="radio"
                      name="strategy"
                      checked={strategy === 'theirs'}
                      onChange={() => setStrategy('theirs')}
                      className="text-primary-600"
                    />
                    <span className="text-gray-700 dark:text-gray-300">
                      Theirs (Source)
                    </span>
                  </label>
                  <label className="flex items-center gap-1.5 text-sm cursor-pointer">
                    <input
                      type="radio"
                      name="strategy"
                      checked={strategy === 'custom'}
                      onChange={() => setStrategy('custom')}
                      className="text-primary-600"
                    />
                    <span className="text-gray-700 dark:text-gray-300">
                      Custom
                    </span>
                  </label>
                </div>
              </div>

              {/* 3-Way Diff Display */}
              <div className="flex-1 flex overflow-hidden">
                {/* Base (Common Ancestor) */}
                <div className="flex-1 flex flex-col border-r border-gray-200 dark:border-gray-700 overflow-hidden">
                  <div className="px-3 py-2 text-xs font-medium text-gray-500 dark:text-gray-400 bg-gray-100 dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
                    Base (공통 조상)
                  </div>
                  <pre className="flex-1 overflow-auto p-3 text-xs font-mono text-gray-600 dark:text-gray-400 bg-gray-50 dark:bg-gray-900">
                    {selectedFile.base_content || '(파일 없음)'}
                  </pre>
                </div>

                {/* Ours (Target Branch) */}
                <div
                  className={cn(
                    'flex-1 flex flex-col border-r border-gray-200 dark:border-gray-700 overflow-hidden',
                    strategy === 'ours' && 'ring-2 ring-inset ring-green-500'
                  )}
                >
                  <div className="px-3 py-2 text-xs font-medium text-gray-500 dark:text-gray-400 bg-gray-100 dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between">
                    <span>Ours ({targetBranch})</span>
                    {strategy === 'ours' && (
                      <span className="text-green-600 dark:text-green-400">
                        선택됨
                      </span>
                    )}
                  </div>
                  <pre className="flex-1 overflow-auto p-3 text-xs font-mono text-gray-700 dark:text-gray-300 bg-green-50/30 dark:bg-green-900/10">
                    {selectedFile.our_content || '(파일 없음)'}
                  </pre>
                </div>

                {/* Theirs (Source Branch) */}
                <div
                  className={cn(
                    'flex-1 flex flex-col overflow-hidden',
                    strategy === 'theirs' && 'ring-2 ring-inset ring-blue-500'
                  )}
                >
                  <div className="px-3 py-2 text-xs font-medium text-gray-500 dark:text-gray-400 bg-gray-100 dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between">
                    <span>Theirs ({sourceBranch})</span>
                    {strategy === 'theirs' && (
                      <span className="text-blue-600 dark:text-blue-400">
                        선택됨
                      </span>
                    )}
                  </div>
                  <pre className="flex-1 overflow-auto p-3 text-xs font-mono text-gray-700 dark:text-gray-300 bg-blue-50/30 dark:bg-blue-900/10">
                    {selectedFile.their_content || '(파일 없음)'}
                  </pre>
                </div>
              </div>

              {/* Custom Editor (shown when strategy is 'custom') */}
              {strategy === 'custom' && (
                <div className="border-t border-gray-200 dark:border-gray-700">
                  <div className="px-3 py-2 text-xs font-medium text-gray-500 dark:text-gray-400 bg-gray-100 dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
                    해결된 내용 편집
                  </div>
                  <textarea
                    value={customContent}
                    onChange={(e) => setCustomContent(e.target.value)}
                    className="w-full h-48 p-3 text-xs font-mono text-gray-900 dark:text-white bg-white dark:bg-gray-800 border-0 resize-none focus:ring-0 focus:outline-none"
                    placeholder="해결된 코드를 여기에 입력하세요..."
                  />
                </div>
              )}

              {/* Actions */}
              <div className="flex items-center justify-between p-4 border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900">
                <button
                  onClick={handleResolve}
                  disabled={isResolving || resolvedFiles.has(selectedFile.path)}
                  className="flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-white bg-primary-600 hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg transition-colors"
                >
                  {isResolving ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <CheckCircle2 className="w-4 h-4" />
                  )}
                  {resolvedFiles.has(selectedFile.path)
                    ? '해결됨'
                    : '이 파일 해결'}
                </button>
              </div>
            </div>
          ) : (
            <div className="flex-1 flex items-center justify-center text-gray-500 dark:text-gray-400">
              {allResolved
                ? '모든 충돌이 해결되었습니다. 머지를 완료해주세요.'
                : '해결할 파일을 선택하세요.'}
            </div>
          )}

          {/* Footer */}
          <div className="flex items-center justify-between p-4 border-t border-gray-200 dark:border-gray-700">
            <button
              onClick={handleAbort}
              disabled={isAborting}
              className="flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors"
            >
              {isAborting ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <RotateCcw className="w-4 h-4" />
              )}
              머지 취소
            </button>

            <div className="flex items-center gap-3">
              {canComplete && (
                <input
                  type="text"
                  value={commitMessage}
                  onChange={(e) => setCommitMessage(e.target.value)}
                  placeholder={`Merge branch '${sourceBranch}' into ${targetBranch}`}
                  className="w-64 px-3 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                />
              )}
              <button
                onClick={handleComplete}
                disabled={!canComplete || isCompleting}
                className="flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-white bg-green-600 hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg transition-colors"
              >
                {isCompleting ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <GitMerge className="w-4 h-4" />
                )}
                머지 완료
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
