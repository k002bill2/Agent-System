import { useState, useMemo } from 'react'
import {
  FileEdit,
  FilePlus,
  FileX,
  FileQuestion,
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
  Eye,
  ChevronDown,
  ChevronRight,
  ShieldAlert,
  Shield,
  AlertTriangle,
} from 'lucide-react'
import { cn } from '../../lib/utils'
import { GitWorkingStatus, GitStatusFile, FileStatusType, DraftCommit, DiffHunk } from '../../stores/git'
import { groupFilesByPattern, draftCommitsToFileGroups, FileGroup } from '../../utils/gitGrouping'
import { FileGroupCard } from './FileGroup'
import { checkSensitiveFile, filterSensitiveFiles, type SensitivityLevel } from '../../utils/gitSafetyPatterns'
import { calcDiffStats } from '../../utils/diffParser'

type ViewMode = 'list' | 'grouped'

interface WorkingDirectoryProps {
  workingStatus: GitWorkingStatus | null
  isLoading: boolean
  onRefresh: () => void
  onStageFiles: (paths: string[]) => Promise<boolean>
  onStageAll: () => Promise<boolean>
  onUnstageFiles: (paths: string[]) => Promise<boolean>
  onUnstageAll: () => Promise<boolean>
  onCommit: (message: string) => Promise<boolean>
  onCommitAndPush?: (message: string) => Promise<boolean>
  // Diff
  onFetchFileDiff: (filePath: string, staged: boolean) => Promise<string>
  fileDiffs: Record<string, string>
  isLoadingDiff: boolean
  // Staged diff review
  onFetchStagedDiff: () => Promise<string | null>
  stagedDiff: string | null
  // Hunk staging
  onFetchFileHunks: (filePath: string, staged: boolean) => Promise<DiffHunk[]>
  onStageHunks: (filePath: string, hunkIndices: number[]) => Promise<boolean>
  fileHunks: Record<string, DiffHunk[]>
  // LLM Draft Commits
  draftCommits: DraftCommit[]
  isGeneratingDrafts: boolean
  onGenerateDrafts: () => Promise<DraftCommit[]>
  onClearDrafts: () => void
}

const statusIcons: Record<FileStatusType, typeof FileEdit> = {
  modified: FileEdit,
  added: FilePlus,
  deleted: FileX,
  renamed: FileEdit,
  untracked: FileQuestion,
  staged: Check,
}

const statusColors: Record<FileStatusType, string> = {
  modified: 'text-yellow-500',
  added: 'text-green-500',
  deleted: 'text-red-500',
  renamed: 'text-blue-500',
  untracked: 'text-gray-400',
  staged: 'text-green-500',
}

const statusLabels: Record<FileStatusType, string> = {
  modified: 'M',
  added: 'A',
  deleted: 'D',
  renamed: 'R',
  untracked: 'U',
  staged: 'S',
}

const sensitivityIcons: Record<SensitivityLevel, typeof Shield | null> = {
  danger: ShieldAlert,
  warning: AlertTriangle,
  safe: null,
}

const sensitivityColors: Record<SensitivityLevel, string> = {
  danger: 'text-red-500',
  warning: 'text-yellow-500',
  safe: '',
}

// =============================================================================
// FileItem with diff preview, unstage, and safety badge
// =============================================================================

function FileItem({
  file,
  selected,
  onSelect,
  onStage,
  onUnstage,
  onToggleDiff,
  showDiff,
  diffContent,
  isLoadingDiff,
}: {
  file: GitStatusFile
  selected: boolean
  onSelect: (path: string) => void
  onStage?: (path: string) => void
  onUnstage?: (path: string) => void
  onToggleDiff: (path: string) => void
  showDiff: boolean
  diffContent?: string
  isLoadingDiff: boolean
}) {
  const Icon = statusIcons[file.status]
  const sensitivity = checkSensitiveFile(file.path)
  const SafetyIcon = sensitivityIcons[sensitivity.level]

  return (
    <div>
      <div
        className={cn(
          'flex items-center gap-2 px-3 py-2 hover:bg-gray-50 dark:hover:bg-gray-700/50 rounded-lg cursor-pointer group',
          selected && 'bg-primary-50 dark:bg-primary-900/20'
        )}
        onClick={() => onToggleDiff(file.path)}
      >
        <input
          type="checkbox"
          checked={selected}
          onChange={() => onSelect(file.path)}
          className="w-4 h-4 rounded border-gray-300 dark:border-gray-600 text-primary-600 focus:ring-primary-500"
          onClick={(e) => e.stopPropagation()}
        />
        <Icon className={cn('w-4 h-4', statusColors[file.status])} />
        <span className="flex-1 text-sm truncate text-gray-700 dark:text-gray-300">
          {file.path}
        </span>
        {SafetyIcon && (
          <span title={sensitivity.reason}>
            <SafetyIcon className={cn('w-4 h-4', sensitivityColors[sensitivity.level])} />
          </span>
        )}
        <span
          className={cn(
            'text-xs font-bold px-1.5 py-0.5 rounded',
            statusColors[file.status]
          )}
        >
          {statusLabels[file.status]}
        </span>
        {/* Stage button for unstaged files */}
        {onStage && !file.staged && (
          <button
            onClick={(e) => {
              e.stopPropagation()
              onStage(file.path)
            }}
            className="opacity-0 group-hover:opacity-100 p-1 hover:bg-gray-200 dark:hover:bg-gray-600 rounded transition-opacity"
            title="Stage this file"
          >
            <Plus className="w-4 h-4 text-green-500" />
          </button>
        )}
        {/* Unstage button for staged files */}
        {onUnstage && file.staged && (
          <button
            onClick={(e) => {
              e.stopPropagation()
              onUnstage(file.path)
            }}
            className="opacity-0 group-hover:opacity-100 p-1 hover:bg-gray-200 dark:hover:bg-gray-600 rounded transition-opacity"
            title="Unstage this file"
          >
            <Minus className="w-4 h-4 text-red-500" />
          </button>
        )}
      </div>
      {/* Inline diff preview */}
      {showDiff && (
        <div className="ml-6 mr-3 mb-2 bg-gray-900 rounded-lg overflow-hidden text-xs max-h-60 overflow-y-auto">
          {isLoadingDiff ? (
            <div className="flex items-center gap-2 p-3 text-gray-400">
              <Loader2 className="w-3 h-3 animate-spin" />
              Loading diff...
            </div>
          ) : diffContent ? (
            <div>
              {diffContent.split('\n').map((line, i) => (
                <div
                  key={i}
                  className={cn(
                    'px-3 py-0.5',
                    line.startsWith('+') && !line.startsWith('+++') && 'bg-green-900/30 text-green-400',
                    line.startsWith('-') && !line.startsWith('---') && 'bg-red-900/30 text-red-400',
                    line.startsWith('@@') && 'bg-blue-900/30 text-blue-400',
                    !line.startsWith('+') && !line.startsWith('-') && !line.startsWith('@@') && 'text-gray-500'
                  )}
                >
                  {line || ' '}
                </div>
              ))}
            </div>
          ) : (
            <div className="p-3 text-gray-500">No diff available</div>
          )}
        </div>
      )}
    </div>
  )
}

// =============================================================================
// Staged Diff Review Panel
// =============================================================================

function StagedDiffReviewPanel({
  stagedDiff,
  isLoading,
  onFetch,
}: {
  stagedDiff: string | null
  isLoading: boolean
  onFetch: () => void
}) {
  const [isExpanded, setIsExpanded] = useState(false)
  const stats = useMemo(() => stagedDiff ? calcDiffStats(stagedDiff) : null, [stagedDiff])

  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl border border-blue-200 dark:border-blue-800 overflow-hidden">
      <button
        onClick={() => {
          if (!isExpanded && !stagedDiff) onFetch()
          setIsExpanded(!isExpanded)
        }}
        className="w-full px-4 py-3 flex items-center justify-between bg-blue-50 dark:bg-blue-900/20 hover:bg-blue-100 dark:hover:bg-blue-900/30 transition-colors"
      >
        <div className="flex items-center gap-2">
          <Eye className="w-4 h-4 text-blue-600 dark:text-blue-400" />
          <span className="font-medium text-blue-700 dark:text-blue-400 text-sm">
            Review Staged Changes
          </span>
          {stats && (
            <span className="text-xs text-gray-500 dark:text-gray-400">
              ({stats.files} file{stats.files !== 1 ? 's' : ''}, +{stats.additions} -{stats.deletions})
            </span>
          )}
        </div>
        {isExpanded ? (
          <ChevronDown className="w-4 h-4 text-blue-600 dark:text-blue-400" />
        ) : (
          <ChevronRight className="w-4 h-4 text-blue-600 dark:text-blue-400" />
        )}
      </button>
      {isExpanded && (
        <div className="max-h-96 overflow-y-auto bg-gray-900 text-xs">
          {isLoading ? (
            <div className="flex items-center gap-2 p-4 text-gray-400">
              <Loader2 className="w-4 h-4 animate-spin" />
              Loading staged diff...
            </div>
          ) : stagedDiff ? (
            stagedDiff.split('\n').map((line, i) => (
              <div
                key={i}
                className={cn(
                  'px-4 py-0.5',
                  line.startsWith('+') && !line.startsWith('+++') && 'bg-green-900/30 text-green-400',
                  line.startsWith('-') && !line.startsWith('---') && 'bg-red-900/30 text-red-400',
                  line.startsWith('@@') && 'bg-blue-900/30 text-blue-400',
                  line.startsWith('diff --git') && 'bg-gray-800 text-gray-300 font-bold mt-2',
                  !line.startsWith('+') && !line.startsWith('-') && !line.startsWith('@@') && !line.startsWith('diff') && 'text-gray-500'
                )}
              >
                {line || ' '}
              </div>
            ))
          ) : (
            <div className="p-4 text-gray-500">No staged changes</div>
          )}
        </div>
      )}
    </div>
  )
}

// =============================================================================
// Sensitive Files Confirmation Dialog
// =============================================================================

function SensitiveFilesDialog({
  dangers,
  warnings,
  onConfirm,
  onCancel,
}: {
  dangers: { path: string; reason: string }[]
  warnings: { path: string; reason: string }[]
  onConfirm: () => void
  onCancel: () => void
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-xl w-full max-w-md p-6">
        <div className="flex items-center gap-2 mb-4">
          <ShieldAlert className="w-6 h-6 text-red-500" />
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
            Sensitive Files Detected
          </h3>
        </div>

        {dangers.length > 0 && (
          <div className="mb-3">
            <p className="text-sm font-medium text-red-600 dark:text-red-400 mb-1">Dangerous files:</p>
            {dangers.map(({ path, reason }) => (
              <div key={path} className="flex items-center gap-2 text-xs text-red-500 ml-2 py-0.5">
                <ShieldAlert className="w-3 h-3" />
                <span className="">{path}</span>
                <span className="text-gray-400">- {reason}</span>
              </div>
            ))}
          </div>
        )}

        {warnings.length > 0 && (
          <div className="mb-3">
            <p className="text-sm font-medium text-yellow-600 dark:text-yellow-400 mb-1">Warning files:</p>
            {warnings.map(({ path, reason }) => (
              <div key={path} className="flex items-center gap-2 text-xs text-yellow-500 ml-2 py-0.5">
                <AlertTriangle className="w-3 h-3" />
                <span className="">{path}</span>
                <span className="text-gray-400">- {reason}</span>
              </div>
            ))}
          </div>
        )}

        <p className="text-sm text-gray-500 dark:text-gray-400 mt-4 mb-4">
          Are you sure you want to stage these files?
        </p>

        <div className="flex justify-end gap-3">
          <button
            onClick={onCancel}
            className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            className="px-4 py-2 text-sm font-medium text-white bg-red-600 hover:bg-red-700 rounded-lg transition-colors"
          >
            Stage Anyway
          </button>
        </div>
      </div>
    </div>
  )
}

// =============================================================================
// Hunk Staging UI
// =============================================================================

function HunkStagingPanel({
  hunks,
  onStageHunks,
  isLoading,
}: {
  hunks: DiffHunk[]
  onStageHunks: (indices: number[]) => Promise<boolean>
  isLoading: boolean
}) {
  const [selectedHunks, setSelectedHunks] = useState<Set<number>>(new Set())

  const toggleHunk = (idx: number) => {
    setSelectedHunks((prev) => {
      const next = new Set(prev)
      if (next.has(idx)) next.delete(idx)
      else next.add(idx)
      return next
    })
  }

  const handleStage = async () => {
    if (selectedHunks.size === 0) return
    const success = await onStageHunks(Array.from(selectedHunks))
    if (success) setSelectedHunks(new Set())
  }

  return (
    <div className="ml-6 mr-3 mb-2 space-y-2">
      {hunks.map((hunk) => (
        <div key={hunk.index} className="bg-gray-900 rounded-lg overflow-hidden">
          <div className="flex items-center gap-2 px-3 py-1.5 bg-gray-800">
            <input
              type="checkbox"
              checked={selectedHunks.has(hunk.index)}
              onChange={() => toggleHunk(hunk.index)}
              className="w-3.5 h-3.5 rounded border-gray-600 text-blue-500 focus:ring-blue-500"
            />
            <span className="text-xs text-blue-400">{hunk.header}</span>
          </div>
          <div className="text-xs max-h-32 overflow-y-auto">
            {hunk.content.split('\n').map((line, i) => (
              <div
                key={i}
                className={cn(
                  'px-3 py-0.5',
                  line.startsWith('+') && 'bg-green-900/30 text-green-400',
                  line.startsWith('-') && 'bg-red-900/30 text-red-400',
                  line.startsWith(' ') && 'text-gray-500'
                )}
              >
                {line || ' '}
              </div>
            ))}
          </div>
        </div>
      ))}
      {selectedHunks.size > 0 && (
        <button
          onClick={handleStage}
          disabled={isLoading}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors disabled:opacity-50"
        >
          <Plus className="w-3.5 h-3.5" />
          Stage {selectedHunks.size} Hunk{selectedHunks.size !== 1 ? 's' : ''}
        </button>
      )}
    </div>
  )
}

// =============================================================================
// Main WorkingDirectory Component
// =============================================================================

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
                      selected={false}
                      onSelect={() => {}}
                      onUnstage={(path) => onUnstageFiles([path])}
                      onToggleDiff={(path) => handleToggleDiff(path, true)}
                      showDiff={expandedDiffs.has(`${file.path}:true`)}
                      diffContent={fileDiffs[`${file.path}:true`]}
                      isLoadingDiff={isLoadingDiff}
                    />
                  ))
                )}
              </div>

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
