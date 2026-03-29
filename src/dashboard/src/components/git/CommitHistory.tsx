import { useState, useEffect, useCallback } from 'react'
import {
  GitCommit as GitCommitIcon,
  User,
  Clock,
  ChevronDown,
  ChevronRight,
  Copy,
  Check,
  FileText,
  FilePlus,
  FileX,
  FileEdit,
  ArrowRight,
  Loader2,
} from 'lucide-react'
import { cn } from '../../lib/utils'
import type { GitCommit, CommitFile } from '../../stores/git'

interface CommitHistoryProps {
  commits: GitCommit[]
  branch: string
  isLoading: boolean
  onLoadMore?: () => void
  hasMore?: boolean
  // Commit detail callbacks
  onFetchFiles?: (sha: string) => Promise<CommitFile[]>
  onFetchDiff?: (sha: string, filePath?: string) => Promise<string>
  // Cached data from store
  commitFiles?: Record<string, CommitFile[]>
  commitDiff?: Record<string, string>
}

const STATUS_CONFIG: Record<string, { icon: typeof FileText; color: string; label: string }> = {
  added: { icon: FilePlus, color: 'text-green-600 dark:text-green-400', label: 'A' },
  modified: { icon: FileEdit, color: 'text-yellow-600 dark:text-yellow-400', label: 'M' },
  deleted: { icon: FileX, color: 'text-red-600 dark:text-red-400', label: 'D' },
  renamed: { icon: ArrowRight, color: 'text-blue-600 dark:text-blue-400', label: 'R' },
}

function DiffView({ diff }: { diff: string }) {
  if (!diff) return null

  const lines = diff.split('\n')

  return (
    <div className="mt-2 rounded-lg overflow-hidden border border-gray-200 dark:border-gray-700">
      <pre className="text-xs overflow-x-auto max-h-[400px] overflow-y-auto">
        {lines.map((line, i) => {
          let bgClass = 'bg-white dark:bg-gray-900'
          let textClass = 'text-gray-700 dark:text-gray-300'

          if (line.startsWith('+') && !line.startsWith('+++')) {
            bgClass = 'bg-green-50 dark:bg-green-900/20'
            textClass = 'text-green-800 dark:text-green-300'
          } else if (line.startsWith('-') && !line.startsWith('---')) {
            bgClass = 'bg-red-50 dark:bg-red-900/20'
            textClass = 'text-red-800 dark:text-red-300'
          } else if (line.startsWith('@@')) {
            bgClass = 'bg-blue-50 dark:bg-blue-900/20'
            textClass = 'text-blue-700 dark:text-blue-300'
          } else if (line.startsWith('diff ') || line.startsWith('---') || line.startsWith('+++')) {
            bgClass = 'bg-gray-100 dark:bg-gray-800'
            textClass = 'text-gray-600 dark:text-gray-400 font-semibold'
          }

          return (
            <div key={i} className={cn('px-3 py-0 leading-5', bgClass, textClass)}>
              {line || ' '}
            </div>
          )
        })}
      </pre>
    </div>
  )
}

function CommitFileList({
  files,
  sha,
  onFetchDiff,
  commitDiff,
}: {
  files: CommitFile[]
  sha: string
  onFetchDiff?: (sha: string, filePath?: string) => Promise<string>
  commitDiff?: Record<string, string>
}) {
  const [expandedFile, setExpandedFile] = useState<string | null>(null)
  const [loadingDiff, setLoadingDiff] = useState<string | null>(null)

  const handleToggleFile = useCallback(async (filePath: string) => {
    if (expandedFile === filePath) {
      setExpandedFile(null)
      return
    }

    setExpandedFile(filePath)
    const diffKey = `${sha}:${filePath}`
    if (!commitDiff?.[diffKey] && onFetchDiff) {
      setLoadingDiff(filePath)
      await onFetchDiff(sha, filePath)
      setLoadingDiff(null)
    }
  }, [expandedFile, sha, commitDiff, onFetchDiff])

  const totalAdditions = files.reduce((sum, f) => sum + f.additions, 0)
  const totalDeletions = files.reduce((sum, f) => sum + f.deletions, 0)

  return (
    <div className="mt-3">
      <h5 className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-2 flex items-center gap-2">
        <FileText className="w-3.5 h-3.5" />
        Changed Files ({files.length})
        <span className="text-green-600 dark:text-green-400">+{totalAdditions}</span>
        <span className="text-red-600 dark:text-red-400">-{totalDeletions}</span>
      </h5>
      <div className="border border-gray-200 dark:border-gray-700 rounded-lg divide-y divide-gray-200 dark:divide-gray-700 overflow-hidden">
        {files.map((file) => {
          const config = STATUS_CONFIG[file.status] || STATUS_CONFIG.modified
          const StatusIcon = config.icon
          const diffKey = `${sha}:${file.path}`
          const fileDiff = commitDiff?.[diffKey]
          const isExpanded = expandedFile === file.path
          const isLoadingDiff = loadingDiff === file.path

          return (
            <div key={file.path}>
              <div
                className={cn(
                  'flex items-center gap-2 px-3 py-2 text-sm hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors',
                  onFetchDiff && 'cursor-pointer',
                  isExpanded && 'bg-gray-50 dark:bg-gray-700/50'
                )}
                onClick={() => onFetchDiff && handleToggleFile(file.path)}
              >
                {onFetchDiff && (
                  <div className="flex-shrink-0 w-4">
                    {isLoadingDiff ? (
                      <Loader2 className="w-3.5 h-3.5 text-gray-400 animate-spin" />
                    ) : isExpanded ? (
                      <ChevronDown className="w-3.5 h-3.5 text-gray-400" />
                    ) : (
                      <ChevronRight className="w-3.5 h-3.5 text-gray-400" />
                    )}
                  </div>
                )}
                <StatusIcon className={cn('w-4 h-4 flex-shrink-0', config.color)} />
                <span className="text-gray-900 dark:text-white truncate flex-1">
                  {file.old_path ? (
                    <>
                      <span className="text-gray-400">{file.old_path}</span>
                      <ArrowRight className="w-3 h-3 inline mx-1 text-gray-400" />
                      {file.path}
                    </>
                  ) : (
                    file.path
                  )}
                </span>
                <div className="flex items-center gap-2 flex-shrink-0 text-xs">
                  {file.additions > 0 && (
                    <span className="text-green-600 dark:text-green-400">
                      +{file.additions}
                    </span>
                  )}
                  {file.deletions > 0 && (
                    <span className="text-red-600 dark:text-red-400">
                      -{file.deletions}
                    </span>
                  )}
                  {/* Change bar */}
                  <div className="flex h-2 w-16 overflow-hidden rounded-full bg-gray-100 dark:bg-gray-700">
                    {file.additions > 0 && (
                      <div
                        className="bg-green-500"
                        style={{
                          width: `${(file.additions / (file.additions + file.deletions)) * 100}%`,
                        }}
                      />
                    )}
                    {file.deletions > 0 && (
                      <div
                        className="bg-red-500"
                        style={{
                          width: `${(file.deletions / (file.additions + file.deletions)) * 100}%`,
                        }}
                      />
                    )}
                  </div>
                </div>
              </div>
              {isExpanded && fileDiff && (
                <div className="px-3 pb-2">
                  <DiffView diff={fileDiff} />
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

export function CommitHistory({
  commits,
  branch,
  isLoading,
  onLoadMore,
  hasMore,
  onFetchFiles,
  onFetchDiff,
  commitFiles = {},
  commitDiff = {},
}: CommitHistoryProps) {
  const [expandedCommit, setExpandedCommit] = useState<string | null>(null)
  const [copiedSha, setCopiedSha] = useState<string | null>(null)
  const [loadingFiles, setLoadingFiles] = useState<string | null>(null)

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr)
    return date.toLocaleDateString('ko-KR', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
  }

  const formatRelativeDate = (dateStr: string) => {
    const date = new Date(dateStr)
    const now = new Date()
    const diff = now.getTime() - date.getTime()
    const days = Math.floor(diff / (1000 * 60 * 60 * 24))

    if (days === 0) {
      const hours = Math.floor(diff / (1000 * 60 * 60))
      if (hours === 0) {
        const minutes = Math.floor(diff / (1000 * 60))
        return `${minutes}분 전`
      }
      return `${hours}시간 전`
    }
    if (days < 7) return `${days}일 전`
    if (days < 30) return `${Math.floor(days / 7)}주 전`
    return date.toLocaleDateString('ko-KR', { month: 'short', day: 'numeric' })
  }

  const copyToClipboard = async (sha: string) => {
    await navigator.clipboard.writeText(sha)
    setCopiedSha(sha)
    setTimeout(() => setCopiedSha(null), 2000)
  }

  // Auto-fetch files when a commit is expanded
  useEffect(() => {
    if (expandedCommit && onFetchFiles && !commitFiles[expandedCommit]) {
      setLoadingFiles(expandedCommit)
      onFetchFiles(expandedCommit).finally(() => setLoadingFiles(null))
    }
  }, [expandedCommit, onFetchFiles, commitFiles])

  // Group commits by date
  const groupedCommits: { [date: string]: GitCommit[] } = {}
  commits.forEach((commit) => {
    const date = new Date(commit.committed_date).toLocaleDateString('ko-KR', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    })
    if (!groupedCommits[date]) {
      groupedCommits[date] = []
    }
    groupedCommits[date].push(commit)
  })

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
            Commit History
          </h3>
          <span className="text-sm text-gray-500">
            on <span className="">{branch}</span>
          </span>
        </div>
        <span className="text-sm text-gray-500">({commits.length} commits)</span>
      </div>

      {/* Timeline */}
      <div className="space-y-6">
        {Object.entries(groupedCommits).map(([date, dateCommits]) => (
          <div key={date}>
            {/* Date Header */}
            <div className="flex items-center gap-2 mb-3">
              <div className="w-2 h-2 rounded-full bg-gray-400 dark:bg-gray-600" />
              <span className="text-sm font-medium text-gray-600 dark:text-gray-400">
                {date}
              </span>
            </div>

            {/* Commits */}
            <div className="space-y-2 ml-4 border-l-2 border-gray-200 dark:border-gray-700 pl-4">
              {dateCommits.map((commit) => {
                const files = commitFiles[commit.sha]
                const isExpanded = expandedCommit === commit.sha
                const isLoadingThisFiles = loadingFiles === commit.sha

                return (
                  <div
                    key={commit.sha}
                    className={cn(
                      'relative bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg transition-colors',
                      isExpanded
                        ? 'ring-2 ring-primary-500'
                        : 'hover:border-gray-300 dark:hover:border-gray-600'
                    )}
                  >
                    {/* Timeline dot */}
                    <div className="absolute -left-[22px] top-4 w-3 h-3 rounded-full bg-primary-500 border-2 border-white dark:border-gray-800" />

                    {/* Main content */}
                    <div
                      className="p-3 cursor-pointer"
                      onClick={() =>
                        setExpandedCommit(isExpanded ? null : commit.sha)
                      }
                    >
                      <div className="flex items-start gap-3">
                        <div className="flex-shrink-0 mt-0.5">
                          {isExpanded ? (
                            <ChevronDown className="w-4 h-4 text-gray-400" />
                          ) : (
                            <ChevronRight className="w-4 h-4 text-gray-400" />
                          )}
                        </div>

                        <div className="min-w-0 flex-1">
                          {/* Message */}
                          <p className="font-medium text-gray-900 dark:text-white truncate">
                            {commit.message.split('\n')[0]}
                          </p>

                          {/* Meta */}
                          <div className="flex items-center gap-4 mt-1 text-sm text-gray-500 dark:text-gray-400">
                            <span className="flex items-center gap-1">
                              <User className="w-3 h-3" />
                              {commit.author_name}
                            </span>
                            <span className="flex items-center gap-1">
                              <Clock className="w-3 h-3" />
                              {formatRelativeDate(commit.committed_date)}
                            </span>
                            <span
                              className="flex items-center gap-1 text-xs bg-gray-100 dark:bg-gray-700 px-1.5 py-0.5 rounded cursor-pointer hover:bg-gray-200 dark:hover:bg-gray-600"
                              onClick={(e) => {
                                e.stopPropagation()
                                copyToClipboard(commit.sha)
                              }}
                            >
                              {commit.short_sha}
                              {copiedSha === commit.sha ? (
                                <Check className="w-3 h-3 text-green-500" />
                              ) : (
                                <Copy className="w-3 h-3" />
                              )}
                            </span>
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Expanded content */}
                    {isExpanded && (
                      <div className="px-3 pb-3 pt-0 border-t border-gray-100 dark:border-gray-700 mt-2">
                        {/* Full message */}
                        {commit.message.includes('\n') && (
                          <div className="mb-3">
                            <h5 className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">
                              Full Message
                            </h5>
                            <pre className="text-sm text-gray-700 dark:text-gray-300 whitespace-pre-wrap font-sans bg-gray-50 dark:bg-gray-900 p-2 rounded">
                              {commit.message}
                            </pre>
                          </div>
                        )}

                        {/* Changed Files */}
                        {isLoadingThisFiles ? (
                          <div className="mt-3 flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400">
                            <Loader2 className="w-4 h-4 animate-spin" />
                            파일 목록을 불러오는 중...
                          </div>
                        ) : files && files.length > 0 ? (
                          <CommitFileList
                            files={files}
                            sha={commit.sha}
                            onFetchDiff={onFetchDiff}
                            commitDiff={commitDiff}
                          />
                        ) : files && files.length === 0 ? (
                          <div className="mt-3 text-sm text-gray-500 dark:text-gray-400">
                            변경된 파일이 없습니다
                          </div>
                        ) : null}

                        {/* Details */}
                        <div className="grid grid-cols-2 gap-4 text-sm mt-3">
                          <div>
                            <h5 className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">
                              Author
                            </h5>
                            <p className="text-gray-700 dark:text-gray-300">
                              {commit.author_name}
                              <br />
                              <span className="text-gray-500">{commit.author_email}</span>
                            </p>
                          </div>
                          <div>
                            <h5 className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">
                              Committer
                            </h5>
                            <p className="text-gray-700 dark:text-gray-300">
                              {commit.committer_name}
                              <br />
                              <span className="text-gray-500">{commit.committer_email}</span>
                            </p>
                          </div>
                          <div>
                            <h5 className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">
                              Authored
                            </h5>
                            <p className="text-gray-700 dark:text-gray-300">
                              {formatDate(commit.authored_date)}
                            </p>
                          </div>
                          <div>
                            <h5 className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">
                              Committed
                            </h5>
                            <p className="text-gray-700 dark:text-gray-300">
                              {formatDate(commit.committed_date)}
                            </p>
                          </div>
                        </div>

                        {/* SHA */}
                        <div className="mt-3">
                          <h5 className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">
                            SHA
                          </h5>
                          <code className="text-xs bg-gray-100 dark:bg-gray-900 px-2 py-1 rounded block overflow-x-auto">
                            {commit.sha}
                          </code>
                        </div>

                        {/* Parents */}
                        {commit.parent_shas.length > 0 && (
                          <div className="mt-3">
                            <h5 className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">
                              Parents ({commit.parent_shas.length})
                            </h5>
                            <div className="space-y-1">
                              {commit.parent_shas.map((parentSha) => (
                                <code
                                  key={parentSha}
                                  className="text-xs bg-gray-100 dark:bg-gray-900 px-2 py-1 rounded block"
                                >
                                  {parentSha.slice(0, 7)}
                                </code>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        ))}
      </div>

      {/* Load More */}
      {hasMore && (
        <div className="text-center pt-4">
          <button
            onClick={onLoadMore}
            disabled={isLoading}
            className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-50 transition-colors"
          >
            {isLoading ? 'Loading...' : 'Load More'}
          </button>
        </div>
      )}

      {/* Empty State */}
      {commits.length === 0 && !isLoading && (
        <div className="text-center py-8 text-gray-500 dark:text-gray-400">
          <GitCommitIcon className="w-12 h-12 mx-auto mb-4 opacity-50" />
          <p>No commits found</p>
        </div>
      )}

      {/* Loading State */}
      {isLoading && commits.length === 0 && (
        <div className="text-center py-8 text-gray-500 dark:text-gray-400">
          Loading commits...
        </div>
      )}
    </div>
  )
}
