import { useState } from 'react'
import {
  FileEdit,
  FilePlus,
  FileX,
  FileQuestion,
  Check,
  Plus,
  RefreshCw,
  Send,
} from 'lucide-react'
import { cn } from '../../lib/utils'
import { GitWorkingStatus, GitStatusFile, FileStatusType } from '../../stores/git'

interface WorkingDirectoryProps {
  workingStatus: GitWorkingStatus | null
  isLoading: boolean
  onRefresh: () => void
  onStageFiles: (paths: string[]) => Promise<boolean>
  onStageAll: () => Promise<boolean>
  onCommit: (message: string) => Promise<boolean>
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

function FileItem({
  file,
  selected,
  onSelect,
  onStage,
}: {
  file: GitStatusFile
  selected: boolean
  onSelect: (path: string) => void
  onStage: (path: string) => void
}) {
  const Icon = statusIcons[file.status]

  return (
    <div
      className={cn(
        'flex items-center gap-2 px-3 py-2 hover:bg-gray-50 dark:hover:bg-gray-700/50 rounded-lg cursor-pointer group',
        selected && 'bg-primary-50 dark:bg-primary-900/20'
      )}
      onClick={() => onSelect(file.path)}
    >
      <input
        type="checkbox"
        checked={selected}
        onChange={() => onSelect(file.path)}
        className="w-4 h-4 rounded border-gray-300 dark:border-gray-600 text-primary-600 focus:ring-primary-500"
        onClick={(e) => e.stopPropagation()}
      />
      <Icon className={cn('w-4 h-4', statusColors[file.status])} />
      <span className="flex-1 text-sm font-mono truncate text-gray-700 dark:text-gray-300">
        {file.path}
      </span>
      <span
        className={cn(
          'text-xs font-bold px-1.5 py-0.5 rounded',
          statusColors[file.status]
        )}
      >
        {statusLabels[file.status]}
      </span>
      {!file.staged && (
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
    </div>
  )
}

export function WorkingDirectory({
  workingStatus,
  isLoading,
  onRefresh,
  onStageFiles,
  onStageAll,
  onCommit,
}: WorkingDirectoryProps) {
  const [selectedFiles, setSelectedFiles] = useState<Set<string>>(new Set())
  const [commitMessage, setCommitMessage] = useState('')
  const [isCommitting, setIsCommitting] = useState(false)

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

  const handleStageSelected = async () => {
    if (selectedFiles.size === 0) return
    const success = await onStageFiles(Array.from(selectedFiles))
    if (success) {
      setSelectedFiles(new Set())
    }
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

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
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
        <button
          onClick={onRefresh}
          disabled={isLoading}
          className="flex items-center gap-2 px-3 py-1.5 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors disabled:opacity-50"
        >
          <RefreshCw className={cn('w-4 h-4', isLoading && 'animate-spin')} />
          Refresh
        </button>
      </div>

      {is_clean ? (
        <div className="text-center py-12 border-2 border-dashed border-gray-200 dark:border-gray-700 rounded-xl">
          <Check className="w-12 h-12 mx-auto mb-4 text-green-500" />
          <p className="text-gray-500 dark:text-gray-400">
            Working directory is clean
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Staged Changes */}
          <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
            <div className="px-4 py-3 border-b border-gray-200 dark:border-gray-700 bg-green-50 dark:bg-green-900/20">
              <h4 className="font-medium text-green-700 dark:text-green-400 flex items-center gap-2">
                <Check className="w-4 h-4" />
                Staged Changes ({staged_files.length})
              </h4>
            </div>
            <div className="p-2 max-h-64 overflow-y-auto">
              {staged_files.length === 0 ? (
                <p className="text-sm text-gray-500 dark:text-gray-400 text-center py-4">
                  No staged changes
                </p>
              ) : (
                staged_files.map((file) => (
                  <div
                    key={file.path}
                    className="flex items-center gap-2 px-3 py-2 text-sm"
                  >
                    <Check className="w-4 h-4 text-green-500" />
                    <span className="font-mono truncate text-gray-700 dark:text-gray-300">
                      {file.path}
                    </span>
                  </div>
                ))
              )}
            </div>

            {/* Commit Form */}
            {staged_files.length > 0 && (
              <div className="p-4 border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/50">
                <textarea
                  value={commitMessage}
                  onChange={(e) => setCommitMessage(e.target.value)}
                  placeholder="Commit message..."
                  rows={2}
                  className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-primary-500 focus:border-transparent resize-none"
                />
                <button
                  onClick={handleCommit}
                  disabled={!commitMessage.trim() || isCommitting}
                  className="mt-2 w-full flex items-center justify-center gap-2 px-4 py-2 text-sm font-medium text-white bg-green-600 hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg transition-colors"
                >
                  <Send className="w-4 h-4" />
                  {isCommitting ? 'Committing...' : 'Commit'}
                </button>
              </div>
            )}
          </div>

          {/* Unstaged Changes */}
          <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
            <div className="px-4 py-3 border-b border-gray-200 dark:border-gray-700 bg-yellow-50 dark:bg-yellow-900/20 flex items-center justify-between">
              <h4 className="font-medium text-yellow-700 dark:text-yellow-400 flex items-center gap-2">
                <FileEdit className="w-4 h-4" />
                Unstaged Changes ({allUnstagedFiles.length})
              </h4>
              {allUnstagedFiles.length > 0 && (
                <button
                  onClick={onStageAll}
                  disabled={isLoading}
                  className="text-xs px-2 py-1 bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 rounded hover:bg-green-200 dark:hover:bg-green-900/50 transition-colors"
                >
                  Stage All
                </button>
              )}
            </div>
            <div className="p-2 max-h-80 overflow-y-auto">
              {allUnstagedFiles.length === 0 ? (
                <p className="text-sm text-gray-500 dark:text-gray-400 text-center py-4">
                  No unstaged changes
                </p>
              ) : (
                allUnstagedFiles.map((file) => (
                  <FileItem
                    key={file.path}
                    file={file}
                    selected={selectedFiles.has(file.path)}
                    onSelect={handleSelectFile}
                    onStage={(path) => onStageFiles([path])}
                  />
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
      )}
    </div>
  )
}
