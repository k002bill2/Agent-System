import { useState } from 'react'
import {
  FileEdit,
  Check,
  Plus,
  Minus,
  RefreshCw,
  Send,
  List,
  FolderTree,
  Sparkles,
  Loader2,
  ArrowUp,
  ChevronDown,
  ChevronRight,
} from 'lucide-react'
import { cn } from '../../lib/utils'
import { groupFilesByPattern, draftCommitsToFileGroups, FileGroup } from '../../utils/gitGrouping'
import { FileGroupCard } from './FileGroup'
import { filterSensitiveFiles } from '../../utils/gitSafetyPatterns'
import type { WorkingDirectoryProps, ViewMode } from './working-directory/types'
import { FileItem } from './working-directory/FileItem'
import { StagedDiffReviewPanel } from './working-directory/StagedDiffReviewPanel'
import { SensitiveFilesDialog } from './working-directory/SensitiveFilesDialog'
import { HunkStagingPanel } from './working-directory/HunkStagingPanel'

export function WorkingDirectory({
  workingStatus,
  isLoading,
  onRefresh,
  onStageFiles,
  onStageAll,
  onUnstageFiles,
  onUnstageAll,
  onCommit,
  onCommitAndPush,
  onFetchFileDiff,
  fileDiffs,
  isLoadingDiff,
  onFetchStagedDiff,
  stagedDiff,
  onFetchFileHunks,
  onStageHunks,
  fileHunks,
  draftCommits,
  isGeneratingDrafts,
  onGenerateDrafts,
  onClearDrafts,
}: WorkingDirectoryProps) {
  const [selectedFiles, setSelectedFiles] = useState<Set<string>>(new Set())
  const [selectedStagedFiles, setSelectedStagedFiles] = useState<Set<string>>(new Set())
  const [commitMessage, setCommitMessage] = useState('')
  const [isCommitting, setIsCommitting] = useState(false)
  const [isCommittingAndPushing, setIsCommittingAndPushing] = useState(false)
  const [viewMode, setViewMode] = useState<ViewMode>('list')
  const [expandedDiffs, setExpandedDiffs] = useState<Set<string>>(new Set())
  const [expandedHunks, setExpandedHunks] = useState<Set<string>>(new Set())
  const [sensitiveDialog, setSensitiveDialog] = useState<{
    paths: string[]
    callback: () => void
  } | null>(null)

  const handleSelectFile = (path: string) => {
    setSelectedFiles((prev) => {
      const next = new Set(prev)
      if (next.has(path)) {
        next.delete(path)
      } else {
        next.add(path)
      }
      return next
    })
  }

  const handleSelectStagedFile = (path: string) => {
    setSelectedStagedFiles((prev) => {
      const next = new Set(prev)
      if (next.has(path)) {
        next.delete(path)
      } else {
        next.add(path)
      }
      return next
    })
  }

  const handleUnstageSelected = async () => {
    if (selectedStagedFiles.size === 0) return
    const paths = Array.from(selectedStagedFiles)
    const success = await onUnstageFiles(paths)
    if (success) setSelectedStagedFiles(new Set())
  }

  const handleToggleDiff = async (path: string, staged: boolean) => {
    const key = `${path}:${staged}`
    setExpandedDiffs((prev) => {
      const next = new Set(prev)
      if (next.has(key)) {
        next.delete(key)
      } else {
        next.add(key)
        // Fetch diff if not already cached
        if (!fileDiffs[key]) {
          onFetchFileDiff(path, staged)
        }
      }
      return next
    })
  }

  const handleToggleHunks = async (path: string) => {
    const key = path
    setExpandedHunks((prev) => {
      const next = new Set(prev)
      if (next.has(key)) {
        next.delete(key)
      } else {
        next.add(key)
        if (!fileHunks[key]) {
          onFetchFileHunks(path, false)
        }
      }
      return next
    })
  }

  // Wrap stage functions with sensitive file check
  const checkAndStage = (paths: string[], action: () => Promise<boolean>) => {
    const { warnings, dangers } = filterSensitiveFiles(paths)
    if (dangers.length > 0 || warnings.length > 0) {
      setSensitiveDialog({ paths, callback: () => { action(); setSensitiveDialog(null) } })
    } else {
      action()
    }
  }

  const handleStageSelected = async () => {
    if (selectedFiles.size === 0) return
    const paths = Array.from(selectedFiles)
    checkAndStage(paths, async () => {
      const success = await onStageFiles(paths)
      if (success) setSelectedFiles(new Set())
      return success
    })
  }

  const handleStageAll = () => {
    if (!workingStatus) return
    const paths = [...workingStatus.unstaged_files, ...workingStatus.untracked_files].map(f => f.path)
    checkAndStage(paths, onStageAll)
  }

  const handleCommit = async () => {
    if (!commitMessage.trim()) return
    setIsCommitting(true)
    const success = await onCommit(commitMessage.trim())
    if (success) {
      setCommitMessage('')
    }
    setIsCommitting(false)
  }

  const handleCommitAndPush = async () => {
    if (!commitMessage.trim() || !onCommitAndPush) return
    setIsCommittingAndPushing(true)
    const success = await onCommitAndPush(commitMessage.trim())
    if (success) {
      setCommitMessage('')
    }
    setIsCommittingAndPushing(false)
  }

  if (!workingStatus) {
    return (
      <div className="text-center py-12 text-gray-500 dark:text-gray-400">
        <RefreshCw className="w-8 h-8 mx-auto mb-3 animate-spin" />
        <p>Loading working directory status...</p>
      </div>
    )
  }

  const { staged_files, unstaged_files, untracked_files, is_clean } = workingStatus
  const allUnstagedFiles = [...unstaged_files, ...untracked_files]
  const allFiles = [...staged_files, ...unstaged_files, ...untracked_files]

  // Use LLM-generated groups if available, otherwise fall back to pattern-based grouping
  const fileGroups: FileGroup[] = draftCommits.length > 0
    ? draftCommitsToFileGroups(draftCommits, allFiles)
    : groupFilesByPattern(allFiles)

  // Handler for committing a specific group
  const handleCommitGroup = async (message: string, _paths: string[]): Promise<boolean> => {
    return onCommit(message)
  }

  // Handler for committing and pushing a specific group
  const handleCommitAndPushGroup = async (message: string, _paths: string[]): Promise<boolean> => {
    if (!onCommitAndPush) return false
    return onCommitAndPush(message)
  }

  return (
    <div className="h-full flex flex-col gap-6">
      {/* Sensitive Files Dialog */}
      {sensitiveDialog && (
        <SensitiveFilesDialog
          dangers={filterSensitiveFiles(sensitiveDialog.paths).dangers}
          warnings={filterSensitiveFiles(sensitiveDialog.paths).warnings}
          onConfirm={sensitiveDialog.callback}
          onCancel={() => setSensitiveDialog(null)}
        />
      )}

      {/* Header */}
      <div className="flex items-center justify-between shrink-0">
        <div>
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
            Working Directory
          </h3>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            {is_clean
              ? 'No changes to commit'
              : `${workingStatus.total_changes} file(s) changed`}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {/* View Mode Toggle */}
          {!is_clean && (
            <div className="flex items-center bg-gray-100 dark:bg-gray-700 rounded-lg p-0.5">
              <button
                onClick={() => setViewMode('list')}
                className={cn(
                  'flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md transition-colors',
                  viewMode === 'list'
                    ? 'bg-white dark:bg-gray-600 text-gray-900 dark:text-white shadow-sm'
                    : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white'
                )}
                title="List view"
              >
                <List className="w-3.5 h-3.5" />
                List
              </button>
              <button
                onClick={() => setViewMode('grouped')}
                className={cn(
                  'flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md transition-colors',
                  viewMode === 'grouped'
                    ? 'bg-white dark:bg-gray-600 text-gray-900 dark:text-white shadow-sm'
                    : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white'
                )}
                title="Grouped view with suggested commits"
              >
                <FolderTree className="w-3.5 h-3.5" />
                Grouped
              </button>
            </div>
          )}
          <button
            onClick={onRefresh}
            disabled={isLoading}
            className="flex items-center gap-2 px-3 py-1.5 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors disabled:opacity-50"
          >
            <RefreshCw className={cn('w-4 h-4', isLoading && 'animate-spin')} />
            Refresh
          </button>
        </div>
      </div>

      {is_clean ? (
        <div className="text-center py-12 border-2 border-dashed border-gray-200 dark:border-gray-700 rounded-xl">
          <Check className="w-12 h-12 mx-auto mb-4 text-green-500" />
          <p className="text-gray-500 dark:text-gray-400">
            Working directory is clean
          </p>
        </div>
      ) : viewMode === 'grouped' ? (
        /* Grouped View */
        <div className="space-y-4">
          {/* AI Generate Button */}
          <div className="flex items-center justify-between px-4 py-3 bg-gradient-to-r from-purple-50 to-blue-50 dark:from-purple-900/20 dark:to-blue-900/20 border border-purple-200 dark:border-purple-800 rounded-xl">
            <div className="flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-purple-600 dark:text-purple-400" />
              <div>
                <h4 className="text-sm font-medium text-gray-900 dark:text-white">
                  {draftCommits.length > 0 ? 'AI-Generated Commits' : 'Smart Commit Suggestions'}
                </h4>
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  {draftCommits.length > 0
                    ? `${draftCommits.length} commit group${draftCommits.length !== 1 ? 's' : ''} suggested`
                    : 'Let AI analyze your changes and suggest logical commit groupings'}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {draftCommits.length > 0 && (
                <button
                  onClick={onClearDrafts}
                  className="px-3 py-1.5 text-xs font-medium text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white transition-colors"
                >
                  Reset to Pattern
                </button>
              )}
              <button
                onClick={onGenerateDrafts}
                disabled={isGeneratingDrafts || allFiles.length === 0}
                className={cn(
                  'flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg transition-all',
                  isGeneratingDrafts
                    ? 'bg-purple-100 dark:bg-purple-900/30 text-purple-600 dark:text-purple-400 cursor-wait'
                    : 'bg-purple-600 hover:bg-purple-700 text-white shadow-sm hover:shadow-md',
                  'disabled:opacity-50 disabled:cursor-not-allowed'
                )}
              >
                {isGeneratingDrafts ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Analyzing...
                  </>
                ) : (
                  <>
                    <Sparkles className="w-4 h-4" />
                    {draftCommits.length > 0 ? 'Regenerate' : 'Generate with AI'}
                  </>
                )}
              </button>
            </div>
          </div>

          {/* File Groups */}
          {fileGroups.map((group) => (
            <FileGroupCard
              key={group.name}
              group={group}
              selectedFiles={selectedFiles}
              onSelectFile={handleSelectFile}
              onStageFiles={onStageFiles}
              onCommitGroup={handleCommitGroup}
              onCommitAndPush={onCommitAndPush ? handleCommitAndPushGroup : undefined}
              isLoading={isLoading}
            />
          ))}
        </div>
      ) : (
        /* List View */
        <div className="flex-1 min-h-0 flex flex-col gap-6">
          <div className="flex-1 min-h-0 grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Staged Changes */}
            <div className="flex flex-col bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden min-h-0">
              <div className="px-4 py-3 border-b border-gray-200 dark:border-gray-700 bg-green-50 dark:bg-green-900/20 flex items-center justify-between shrink-0">
                <h4 className="font-medium text-green-700 dark:text-green-400 flex items-center gap-2">
                  <Check className="w-4 h-4" />
                  Staged Changes ({staged_files.length})
                </h4>
                {staged_files.length > 0 && (
                  <button
                    onClick={onUnstageAll}
                    disabled={isLoading}
                    className="text-xs px-2 py-1 bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400 rounded hover:bg-red-200 dark:hover:bg-red-900/50 transition-colors"
                  >
                    Unstage All
                  </button>
                )}
              </div>
              <div className="flex-1 min-h-0 p-2 overflow-y-auto">
                {staged_files.length === 0 ? (
                  <p className="text-sm text-gray-500 dark:text-gray-400 text-center py-4">
                    No staged changes
                  </p>
                ) : (
                  staged_files.map((file) => (
                    <FileItem
                      key={file.path}
                      file={{ ...file, staged: true }}
                      selected={selectedStagedFiles.has(file.path)}
                      onSelect={handleSelectStagedFile}
                      onUnstage={(path) => onUnstageFiles([path])}
                      onToggleDiff={(path) => handleToggleDiff(path, true)}
                      showDiff={expandedDiffs.has(`${file.path}:true`)}
                      diffContent={fileDiffs[`${file.path}:true`]}
                      isLoadingDiff={isLoadingDiff}
                    />
                  ))
                )}
              </div>

              {/* Unstage Selected Button */}
              {selectedStagedFiles.size > 0 && (
                <div className="p-3 border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/50 shrink-0">
                  <button
                    onClick={handleUnstageSelected}
                    disabled={isLoading}
                    className="w-full flex items-center justify-center gap-2 px-4 py-2 text-sm font-medium text-white bg-red-600 hover:bg-red-700 disabled:opacity-50 rounded-lg transition-colors"
                  >
                    <Minus className="w-4 h-4" />
                    Unstage Selected ({selectedStagedFiles.size})
                  </button>
                </div>
              )}

              {/* Review Staged Changes Panel */}
              {staged_files.length > 0 && (
                <div className="border-t border-gray-200 dark:border-gray-700 shrink-0">
                  <StagedDiffReviewPanel
                    stagedDiff={stagedDiff}
                    isLoading={isLoadingDiff}
                    onFetch={onFetchStagedDiff}
                  />
                </div>
              )}

              {/* Commit Form */}
              {staged_files.length > 0 && (
                <div className="p-4 border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/50 shrink-0">
                  <textarea
                    value={commitMessage}
                    onChange={(e) => setCommitMessage(e.target.value)}
                    placeholder="Commit message..."
                    rows={2}
                    className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-primary-500 focus:border-transparent resize-none"
                  />
                  <div className="mt-2 flex gap-2">
                    <button
                      onClick={handleCommit}
                      disabled={!commitMessage.trim() || isCommitting || isCommittingAndPushing}
                      className="flex-1 flex items-center justify-center gap-2 px-4 py-2 text-sm font-medium text-white bg-green-600 hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg transition-colors"
                    >
                      <Send className="w-4 h-4" />
                      {isCommitting ? 'Committing...' : 'Commit'}
                    </button>
                    {onCommitAndPush && (
                      <button
                        onClick={handleCommitAndPush}
                        disabled={!commitMessage.trim() || isCommitting || isCommittingAndPushing}
                        className="flex-1 flex items-center justify-center gap-2 px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg transition-colors"
                      >
                        <Send className="w-4 h-4" />
                        <ArrowUp className="w-4 h-4" />
                        {isCommittingAndPushing ? 'Committing & Pushing...' : 'Commit & Push'}
                      </button>
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* Unstaged Changes */}
            <div className="flex flex-col bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden min-h-0">
              <div className="px-4 py-3 border-b border-gray-200 dark:border-gray-700 bg-yellow-50 dark:bg-yellow-900/20 flex items-center justify-between shrink-0">
                <h4 className="font-medium text-yellow-700 dark:text-yellow-400 flex items-center gap-2">
                  <FileEdit className="w-4 h-4" />
                  Unstaged Changes ({allUnstagedFiles.length})
                </h4>
                {allUnstagedFiles.length > 0 && (
                  <button
                    onClick={handleStageAll}
                    disabled={isLoading}
                    className="text-xs px-2 py-1 bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 rounded hover:bg-green-200 dark:hover:bg-green-900/50 transition-colors"
                  >
                    Stage All
                  </button>
                )}
              </div>
              <div className="flex-1 min-h-0 p-2 overflow-y-auto">
                {allUnstagedFiles.length === 0 ? (
                  <p className="text-sm text-gray-500 dark:text-gray-400 text-center py-4">
                    No unstaged changes
                  </p>
                ) : (
                  allUnstagedFiles.map((file) => (
                    <div key={file.path}>
                      <FileItem
                        file={file}
                        selected={selectedFiles.has(file.path)}
                        onSelect={handleSelectFile}
                        onStage={(path) => {
                          checkAndStage([path], () => onStageFiles([path]))
                        }}
                        onToggleDiff={(path) => handleToggleDiff(path, false)}
                        showDiff={expandedDiffs.has(`${file.path}:false`)}
                        diffContent={fileDiffs[`${file.path}:false`]}
                        isLoadingDiff={isLoadingDiff}
                      />
                      {/* Hunk staging for modified files */}
                      {file.status === 'modified' && expandedDiffs.has(`${file.path}:false`) && (
                        <div className="ml-6 mr-3 mb-1">
                          <button
                            onClick={() => handleToggleHunks(file.path)}
                            className="text-xs text-blue-500 hover:text-blue-400 flex items-center gap-1 px-2 py-1"
                          >
                            {expandedHunks.has(file.path) ? (
                              <ChevronDown className="w-3 h-3" />
                            ) : (
                              <ChevronRight className="w-3 h-3" />
                            )}
                            Stage individual hunks
                          </button>
                          {expandedHunks.has(file.path) && fileHunks[file.path] && (
                            <HunkStagingPanel
                              hunks={fileHunks[file.path]}
                              onStageHunks={(indices) => onStageHunks(file.path, indices)}
                              isLoading={isLoading}
                            />
                          )}
                        </div>
                      )}
                    </div>
                  ))
                )}
              </div>

              {/* Stage Selected Button */}
              {selectedFiles.size > 0 && (
                <div className="p-3 border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/50">
                  <button
                    onClick={handleStageSelected}
                    disabled={isLoading}
                    className="w-full flex items-center justify-center gap-2 px-4 py-2 text-sm font-medium text-white bg-primary-600 hover:bg-primary-700 disabled:opacity-50 rounded-lg transition-colors"
                  >
                    <Plus className="w-4 h-4" />
                    Stage Selected ({selectedFiles.size})
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
