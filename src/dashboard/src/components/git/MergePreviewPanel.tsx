import { useState } from 'react'
import {
  GitMerge,
  AlertTriangle,
  CheckCircle2,
  FileText,
  Plus,
  Minus,
  X,
  GitCommit,
  Wrench,
} from 'lucide-react'
import { cn } from '../../lib/utils'
import type {
  MergePreview,
  ConflictFile,
  MergeStatus,
  ResolutionStrategy,
} from '../../stores/git'
import { ConflictResolverPanel } from './ConflictResolverPanel'

interface MergePreviewPanelProps {
  preview: MergePreview | null
  isLoading: boolean
  onMerge: (message?: string) => Promise<boolean>
  onClose: () => void
  onCreateMR?: (title: string, description: string) => Promise<boolean>
  canMerge: boolean
  // Conflict resolution props
  conflictFiles?: ConflictFile[]
  mergeStatus?: MergeStatus | null
  isResolvingConflict?: boolean
  onFetchConflicts?: () => Promise<void>
  onResolveConflict?: (
    filePath: string,
    strategy: ResolutionStrategy,
    customContent?: string
  ) => Promise<boolean>
  onAbortMerge?: () => Promise<boolean>
  onCompleteMerge?: (message?: string) => Promise<boolean>
}

export function MergePreviewPanel({
  preview,
  isLoading,
  onMerge,
  onClose,
  onCreateMR,
  canMerge,
  // Conflict resolution props
  conflictFiles = [],
  mergeStatus = null,
  isResolvingConflict = false,
  onFetchConflicts,
  onResolveConflict,
  onAbortMerge,
  onCompleteMerge,
}: MergePreviewPanelProps) {
  const [mergeMessage, setMergeMessage] = useState('')
  const [merging, setMerging] = useState(false)
  const [showCreateMR, setShowCreateMR] = useState(false)
  const [mrTitle, setMrTitle] = useState('')
  const [mrDescription, setMrDescription] = useState('')
  const [creatingMR, setCreatingMR] = useState(false)
  const [showConflictResolver, setShowConflictResolver] = useState(false)

  if (!preview) return null

  const handleMerge = async () => {
    setMerging(true)
    const success = await onMerge(mergeMessage || undefined)
    if (success) {
      onClose()
    }
    setMerging(false)
  }

  const handleCreateMR = async () => {
    if (!onCreateMR || !mrTitle.trim()) return
    setCreatingMR(true)
    const success = await onCreateMR(mrTitle.trim(), mrDescription.trim())
    if (success) {
      onClose()
    }
    setCreatingMR(false)
  }

  const hasConflicts = preview.conflict_status === 'has_conflicts'
  const canResolveConflicts =
    hasConflicts && onFetchConflicts && onResolveConflict && onAbortMerge && onCompleteMerge

  const handleOpenConflictResolver = async () => {
    if (onFetchConflicts) {
      await onFetchConflicts()
    }
    setShowConflictResolver(true)
  }

  // Show conflict resolver panel if open
  if (showConflictResolver && canResolveConflicts) {
    return (
      <ConflictResolverPanel
        conflictFiles={conflictFiles}
        mergeStatus={mergeStatus}
        sourceBranch={preview.source_branch}
        targetBranch={preview.target_branch}
        isResolving={isResolvingConflict}
        onResolve={onResolveConflict}
        onAbort={onAbortMerge}
        onComplete={onCompleteMerge}
        onClose={() => setShowConflictResolver(false)}
      />
    )
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-700">
          <div className="flex items-center gap-2">
            <GitMerge className="w-5 h-5 text-primary-600" />
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
              Merge Preview
            </h3>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {/* Branch Info */}
          <div className="flex items-center justify-center gap-3 py-3 bg-gray-50 dark:bg-gray-900 rounded-lg">
            <span className="text-sm bg-white dark:bg-gray-800 px-2 py-1 rounded border border-gray-200 dark:border-gray-700">
              {preview.source_branch}
            </span>
            <span className="text-gray-400">→</span>
            <span className="text-sm bg-white dark:bg-gray-800 px-2 py-1 rounded border border-gray-200 dark:border-gray-700">
              {preview.target_branch}
            </span>
          </div>

          {/* Status */}
          <div
            className={cn(
              'flex items-center gap-2 p-3 rounded-lg',
              hasConflicts
                ? 'bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400'
                : 'bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-400'
            )}
          >
            {hasConflicts ? (
              <>
                <AlertTriangle className="w-5 h-5" />
                <span className="font-medium">충돌이 발견되었습니다</span>
              </>
            ) : (
              <>
                <CheckCircle2 className="w-5 h-5" />
                <span className="font-medium">머지 가능합니다</span>
              </>
            )}
          </div>

          {/* Stats */}
          <div className="grid grid-cols-4 gap-3">
            <div className="text-center p-3 bg-gray-50 dark:bg-gray-900 rounded-lg">
              <div className="flex items-center justify-center gap-1 text-lg font-semibold text-gray-900 dark:text-white">
                <GitCommit className="w-4 h-4 text-gray-400" />
                {preview.commits_to_merge}
              </div>
              <div className="text-xs text-gray-500 mt-1">Commits</div>
            </div>
            <div className="text-center p-3 bg-gray-50 dark:bg-gray-900 rounded-lg">
              <div className="flex items-center justify-center gap-1 text-lg font-semibold text-gray-900 dark:text-white">
                <FileText className="w-4 h-4 text-gray-400" />
                {preview.files_changed}
              </div>
              <div className="text-xs text-gray-500 mt-1">Files</div>
            </div>
            <div className="text-center p-3 bg-gray-50 dark:bg-gray-900 rounded-lg">
              <div className="flex items-center justify-center gap-1 text-lg font-semibold text-green-600">
                <Plus className="w-4 h-4" />
                {preview.insertions}
              </div>
              <div className="text-xs text-gray-500 mt-1">Additions</div>
            </div>
            <div className="text-center p-3 bg-gray-50 dark:bg-gray-900 rounded-lg">
              <div className="flex items-center justify-center gap-1 text-lg font-semibold text-red-600">
                <Minus className="w-4 h-4" />
                {preview.deletions}
              </div>
              <div className="text-xs text-gray-500 mt-1">Deletions</div>
            </div>
          </div>

          {/* Conflict Files */}
          {hasConflicts && preview.conflicting_files.length > 0 && (
            <div>
              <div className="flex items-center justify-between mb-2">
                <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300">
                  Conflicting Files ({preview.conflicting_files.length})
                </h4>
                {canResolveConflicts && (
                  <button
                    onClick={handleOpenConflictResolver}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-white bg-orange-500 hover:bg-orange-600 rounded-lg transition-colors"
                  >
                    <Wrench className="w-4 h-4" />
                    충돌 해결
                  </button>
                )}
              </div>
              <div className="space-y-1 max-h-40 overflow-y-auto">
                {preview.conflicting_files.map((file) => (
                  <div
                    key={file}
                    className="flex items-center gap-2 p-2 bg-red-50 dark:bg-red-900/10 rounded text-sm"
                  >
                    <AlertTriangle className="w-4 h-4 text-red-500" />
                    <span className="text-red-700 dark:text-red-400 truncate">
                      {file}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Merge Message (for direct merge) */}
          {!hasConflicts && canMerge && !showCreateMR && (
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Merge Message (optional)
              </label>
              <textarea
                value={mergeMessage}
                onChange={(e) => setMergeMessage(e.target.value)}
                placeholder={`Merge branch '${preview.source_branch}' into ${preview.target_branch}`}
                rows={3}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-primary-500 focus:border-transparent resize-none"
              />
            </div>
          )}

          {/* Create MR Form */}
          {showCreateMR && onCreateMR && (
            <div className="space-y-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  MR Title *
                </label>
                <input
                  type="text"
                  value={mrTitle}
                  onChange={(e) => setMrTitle(e.target.value)}
                  placeholder="Merge feature into main"
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Description
                </label>
                <textarea
                  value={mrDescription}
                  onChange={(e) => setMrDescription(e.target.value)}
                  placeholder="Optional description..."
                  rows={3}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-primary-500 focus:border-transparent resize-none"
                />
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between p-4 border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900">
          <div>
            {onCreateMR && !hasConflicts && (
              <button
                onClick={() => setShowCreateMR(!showCreateMR)}
                className="text-sm text-primary-600 hover:text-primary-700 dark:text-primary-400"
              >
                {showCreateMR ? 'Direct merge' : 'Create Merge Request instead'}
              </button>
            )}
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={onClose}
              className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
            >
              Cancel
            </button>

            {showCreateMR && onCreateMR ? (
              <button
                onClick={handleCreateMR}
                disabled={creatingMR || !mrTitle.trim()}
                className="flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-white bg-primary-600 hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg transition-colors"
              >
                {creatingMR ? 'Creating...' : 'Create MR'}
              </button>
            ) : (
              <button
                onClick={handleMerge}
                disabled={merging || hasConflicts || !canMerge || isLoading}
                className="flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-white bg-primary-600 hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg transition-colors"
              >
                <GitMerge className="w-4 h-4" />
                {merging ? 'Merging...' : 'Merge'}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
