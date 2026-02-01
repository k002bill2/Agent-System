import { useState } from 'react'
import {
  FileEdit,
  FilePlus,
  FileX,
  FileQuestion,
  ChevronDown,
  ChevronRight,
  MessageSquare,
  Plus,
  Send,
  Copy,
  Check,
} from 'lucide-react'
import { cn } from '../../lib/utils'
import { GitStatusFile, FileStatusType } from '../../stores/git'
import { FileGroup as FileGroupType, getGroupStats } from '../../utils/gitGrouping'

// =============================================================================
// Constants
// =============================================================================

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

// =============================================================================
// FileItem Component
// =============================================================================

interface FileItemProps {
  file: GitStatusFile
  selected: boolean
  onSelect: (path: string) => void
  onStage: (path: string) => void
}

function FileItem({ file, selected, onSelect, onStage }: FileItemProps) {
  const Icon = statusIcons[file.status]

  return (
    <div
      className={cn(
        'flex items-center gap-2 px-3 py-1.5 hover:bg-gray-50 dark:hover:bg-gray-700/50 rounded cursor-pointer group',
        selected && 'bg-primary-50 dark:bg-primary-900/20'
      )}
      onClick={() => onSelect(file.path)}
    >
      <input
        type="checkbox"
        checked={selected}
        onChange={() => onSelect(file.path)}
        className="w-3.5 h-3.5 rounded border-gray-300 dark:border-gray-600 text-primary-600 focus:ring-primary-500"
        onClick={(e) => e.stopPropagation()}
      />
      <Icon className={cn('w-3.5 h-3.5 flex-shrink-0', statusColors[file.status])} />
      <span className="flex-1 text-xs font-mono truncate text-gray-700 dark:text-gray-300">
        {file.path}
      </span>
      <span
        className={cn(
          'text-[10px] font-bold px-1 py-0.5 rounded',
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
          className="opacity-0 group-hover:opacity-100 p-0.5 hover:bg-gray-200 dark:hover:bg-gray-600 rounded transition-opacity"
          title="Stage this file"
        >
          <Plus className="w-3.5 h-3.5 text-green-500" />
        </button>
      )}
    </div>
  )
}

// =============================================================================
// FileGroupCard Component
// =============================================================================

interface FileGroupCardProps {
  group: FileGroupType
  selectedFiles: Set<string>
  onSelectFile: (path: string) => void
  onStageFiles: (paths: string[]) => Promise<boolean>
  onCommitGroup: (message: string, paths: string[]) => Promise<boolean>
  isLoading: boolean
}

export function FileGroupCard({
  group,
  selectedFiles,
  onSelectFile,
  onStageFiles,
  onCommitGroup,
  isLoading,
}: FileGroupCardProps) {
  const [isExpanded, setIsExpanded] = useState(true)
  const [editableMessage, setEditableMessage] = useState(group.suggestedCommit)
  const [isEditing, setIsEditing] = useState(false)
  const [copied, setCopied] = useState(false)
  const [isCommitting, setIsCommitting] = useState(false)

  const stats = getGroupStats(group.files)
  const stagedCount = group.files.filter(f => f.staged).length
  const allStaged = stagedCount === group.files.length
  const groupSelectedFiles = group.files.filter(f => selectedFiles.has(f.path))

  const handleCopyMessage = async () => {
    await navigator.clipboard.writeText(editableMessage)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const handleStageGroup = async () => {
    const unstagedPaths = group.files.filter(f => !f.staged).map(f => f.path)
    if (unstagedPaths.length > 0) {
      await onStageFiles(unstagedPaths)
    }
  }

  const handleCommitGroup = async () => {
    if (!editableMessage.trim()) return
    setIsCommitting(true)

    // First stage all unstaged files in this group
    const unstagedPaths = group.files.filter(f => !f.staged).map(f => f.path)
    if (unstagedPaths.length > 0) {
      const stageSuccess = await onStageFiles(unstagedPaths)
      if (!stageSuccess) {
        setIsCommitting(false)
        return
      }
    }

    // Then commit
    const paths = group.files.map(f => f.path)
    await onCommitGroup(editableMessage.trim(), paths)
    setIsCommitting(false)
  }

  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden">
      {/* Header */}
      <div
        className="px-4 py-3 bg-gray-50 dark:bg-gray-900/50 cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-900/70 transition-colors"
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <div className="flex items-center gap-2">
          {isExpanded ? (
            <ChevronDown className="w-4 h-4 text-gray-500" />
          ) : (
            <ChevronRight className="w-4 h-4 text-gray-500" />
          )}
          <h4 className="font-medium text-gray-900 dark:text-white">
            {group.name}
          </h4>
          <span className="text-xs text-gray-500 dark:text-gray-400">
            ({group.files.length} file{group.files.length !== 1 ? 's' : ''})
          </span>
          {/* Status badges */}
          <div className="flex-1 flex items-center gap-1 justify-end">
            {stats.modified > 0 && (
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-400">
                {stats.modified}M
              </span>
            )}
            {stats.added > 0 && (
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400">
                {stats.added}A
              </span>
            )}
            {stats.deleted > 0 && (
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400">
                {stats.deleted}D
              </span>
            )}
            {stats.untracked > 0 && (
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-gray-100 dark:bg-gray-900/30 text-gray-600 dark:text-gray-400">
                {stats.untracked}U
              </span>
            )}
            {stagedCount > 0 && (
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400">
                {stagedCount} staged
              </span>
            )}
          </div>
        </div>
      </div>

      {isExpanded && (
        <>
          {/* Suggested Commit Message */}
          <div className="px-4 py-3 border-b border-gray-200 dark:border-gray-700 bg-blue-50 dark:bg-blue-900/10">
            <div className="flex items-start gap-2">
              <MessageSquare className="w-4 h-4 text-blue-500 mt-0.5 flex-shrink-0" />
              <div className="flex-1">
                {isEditing ? (
                  <input
                    type="text"
                    value={editableMessage}
                    onChange={(e) => setEditableMessage(e.target.value)}
                    onBlur={() => setIsEditing(false)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        setIsEditing(false)
                      }
                    }}
                    autoFocus
                    className="w-full px-2 py-1 text-sm font-mono border border-blue-300 dark:border-blue-700 rounded bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                ) : (
                  <div
                    className="text-sm font-mono text-blue-700 dark:text-blue-300 cursor-pointer hover:underline"
                    onClick={(e) => {
                      e.stopPropagation()
                      setIsEditing(true)
                    }}
                    title="Click to edit"
                  >
                    {editableMessage}
                  </div>
                )}
              </div>
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  handleCopyMessage()
                }}
                className="p-1 hover:bg-blue-100 dark:hover:bg-blue-900/30 rounded transition-colors"
                title="Copy commit message"
              >
                {copied ? (
                  <Check className="w-4 h-4 text-green-500" />
                ) : (
                  <Copy className="w-4 h-4 text-blue-500" />
                )}
              </button>
            </div>
          </div>

          {/* File List */}
          <div className="p-2 max-h-48 overflow-y-auto">
            {group.files.map((file) => (
              <FileItem
                key={file.path}
                file={file}
                selected={selectedFiles.has(file.path)}
                onSelect={onSelectFile}
                onStage={(path) => onStageFiles([path])}
              />
            ))}
          </div>

          {/* Actions */}
          <div className="px-4 py-3 border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/50 flex items-center gap-2 justify-end">
            {groupSelectedFiles.length > 0 && (
              <span className="text-xs text-gray-500 dark:text-gray-400 mr-auto">
                {groupSelectedFiles.length} selected
              </span>
            )}
            {!allStaged && (
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  handleStageGroup()
                }}
                disabled={isLoading}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded hover:bg-gray-50 dark:hover:bg-gray-600 transition-colors disabled:opacity-50"
              >
                <Plus className="w-3.5 h-3.5" />
                Stage Group
              </button>
            )}
            <button
              onClick={(e) => {
                e.stopPropagation()
                handleCommitGroup()
              }}
              disabled={isLoading || isCommitting || !editableMessage.trim()}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white bg-green-600 hover:bg-green-700 rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Send className="w-3.5 h-3.5" />
              {isCommitting ? 'Committing...' : 'Commit Group'}
            </button>
          </div>
        </>
      )}
    </div>
  )
}
