import { useState } from 'react'
import {
  GitMerge,
  GitPullRequest,
  Clock,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  User,
  MoreVertical,
  Zap,
} from 'lucide-react'
import { cn } from '../../lib/utils'
import type { MergeRequest, MergeRequestStatus, ConflictStatus } from '../../stores/git'

interface MergeRequestCardProps {
  mergeRequest: MergeRequest
  currentUserId: string
  userRole: string
  onApprove: (mrId: string) => Promise<boolean>
  onMerge: (mrId: string) => Promise<boolean>
  onClose: (mrId: string) => Promise<boolean>
}

export function MergeRequestCard({
  mergeRequest: mr,
  currentUserId,
  userRole,
  onApprove,
  onMerge,
  onClose,
}: MergeRequestCardProps) {
  const [loading, setLoading] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)

  const canMerge = userRole === 'owner' || userRole === 'admin'
  const hasApproved = mr.approved_by.includes(currentUserId)

  const handleApprove = async () => {
    setLoading(true)
    await onApprove(mr.id)
    setLoading(false)
  }

  const handleMerge = async () => {
    if (!canMerge) return
    setLoading(true)
    await onMerge(mr.id)
    setLoading(false)
  }

  const handleClose = async () => {
    if (confirm('이 머지 요청을 닫으시겠습니까?')) {
      setLoading(true)
      await onClose(mr.id)
      setLoading(false)
    }
    setMenuOpen(false)
  }

  const getStatusIcon = (status: MergeRequestStatus) => {
    switch (status) {
      case 'merged':
        return <GitMerge className="w-5 h-5 text-purple-500" />
      case 'closed':
        return <XCircle className="w-5 h-5 text-red-500" />
      case 'draft':
        return <GitPullRequest className="w-5 h-5 text-gray-400" />
      default:
        return <GitPullRequest className="w-5 h-5 text-green-500" />
    }
  }

  const getStatusBadge = (status: MergeRequestStatus) => {
    const styles: Record<MergeRequestStatus, string> = {
      open: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
      merged: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400',
      closed: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
      draft: 'bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-400',
    }

    return (
      <span className={cn('px-2 py-0.5 text-xs font-medium rounded', styles[status])}>
        {status.toUpperCase()}
      </span>
    )
  }

  const getConflictBadge = (status: ConflictStatus) => {
    if (status === 'has_conflicts') {
      return (
        <span className="flex items-center gap-1 px-2 py-0.5 text-xs font-medium rounded bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400">
          <AlertTriangle className="w-3 h-3" />
          충돌 있음
        </span>
      )
    }
    if (status === 'no_conflicts') {
      return (
        <span className="flex items-center gap-1 px-2 py-0.5 text-xs font-medium rounded bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400">
          <CheckCircle2 className="w-3 h-3" />
          머지 가능
        </span>
      )
    }
    return null
  }

  const formatDate = (dateStr: string) => {
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
    return date.toLocaleDateString('ko-KR')
  }

  return (
    <div
      className={cn(
        'border rounded-lg p-4 transition-colors',
        mr.status === 'open'
          ? 'bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700'
          : 'bg-gray-50 dark:bg-gray-900 border-gray-200 dark:border-gray-700 opacity-75'
      )}
    >
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-start gap-3 min-w-0">
          {getStatusIcon(mr.status)}

          <div className="min-w-0">
            <h4 className="font-medium text-gray-900 dark:text-white truncate">
              {mr.title}
            </h4>
            <div className="flex items-center gap-2 mt-1 text-sm text-gray-500 dark:text-gray-400">
              <span className="text-xs bg-gray-100 dark:bg-gray-700 px-1.5 py-0.5 rounded">
                {mr.source_branch}
              </span>
              <span>→</span>
              <span className="text-xs bg-gray-100 dark:bg-gray-700 px-1.5 py-0.5 rounded">
                {mr.target_branch}
              </span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {getStatusBadge(mr.status)}
          {getConflictBadge(mr.conflict_status)}
          {mr.auto_merge && mr.status === 'open' && (
            <span className="flex items-center gap-1 px-2 py-0.5 text-xs font-medium rounded bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400">
              <Zap className="w-3 h-3" />
              Auto-merge
            </span>
          )}

          {mr.status === 'open' && (
            <div className="relative">
              <button
                onClick={() => setMenuOpen(!menuOpen)}
                className="p-1.5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded transition-colors"
              >
                <MoreVertical className="w-4 h-4" />
              </button>

              {menuOpen && (
                <>
                  <div className="fixed inset-0 z-10" onClick={() => setMenuOpen(false)} />
                  <div className="absolute right-0 top-full mt-1 z-20 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg py-1 min-w-[120px]">
                    <button
                      onClick={handleClose}
                      className="w-full flex items-center gap-2 px-3 py-2 text-sm text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20"
                    >
                      <XCircle className="w-4 h-4" />
                      Close
                    </button>
                  </div>
                </>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Description */}
      {mr.description && (
        <p className="mt-3 text-sm text-gray-600 dark:text-gray-400 line-clamp-2">
          {mr.description}
        </p>
      )}

      {/* Meta Info */}
      <div className="flex items-center justify-between mt-4 pt-3 border-t border-gray-100 dark:border-gray-700">
        <div className="flex items-center gap-4 text-sm text-gray-500 dark:text-gray-400">
          <span className="flex items-center gap-1">
            <User className="w-4 h-4" />
            {mr.author_name}
          </span>
          <span className="flex items-center gap-1">
            <Clock className="w-4 h-4" />
            {formatDate(mr.created_at)}
          </span>
          {mr.approved_by.length > 0 && (
            <span className="flex items-center gap-1 text-green-600 dark:text-green-400">
              <CheckCircle2 className="w-4 h-4" />
              {mr.approved_by.length} approvals
            </span>
          )}
        </div>

        {/* Actions */}
        {mr.status === 'open' && (
          <div className="flex items-center gap-2">
            {!hasApproved && mr.author_id !== currentUserId && (
              <button
                onClick={handleApprove}
                disabled={loading}
                className="px-3 py-1.5 text-sm font-medium text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 rounded-lg transition-colors disabled:opacity-50"
              >
                Approve
              </button>
            )}

            {canMerge && mr.conflict_status !== 'has_conflicts' && (
              <button
                onClick={handleMerge}
                disabled={loading}
                className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-white bg-primary-600 hover:bg-primary-700 rounded-lg transition-colors disabled:opacity-50"
              >
                <GitMerge className="w-4 h-4" />
                Merge
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

interface MergeRequestListProps {
  mergeRequests: MergeRequest[]
  currentUserId: string
  userRole: string
  onApprove: (mrId: string) => Promise<boolean>
  onMerge: (mrId: string) => Promise<boolean>
  onClose: (mrId: string) => Promise<boolean>
  onCreateNew: () => void
}

export function MergeRequestList({
  mergeRequests,
  currentUserId,
  userRole,
  onApprove,
  onMerge,
  onClose,
  onCreateNew,
}: MergeRequestListProps) {
  const [filter, setFilter] = useState<MergeRequestStatus | 'all'>('open')

  const filtered = mergeRequests.filter((mr) =>
    filter === 'all' ? true : mr.status === filter
  )

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
            Merge Requests
          </h3>
          <span className="text-sm text-gray-500">({mergeRequests.length})</span>
        </div>

        <div className="flex items-center gap-2">
          <div className="flex rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden">
            {(['open', 'merged', 'closed', 'all'] as const).map((f) => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={cn(
                  'px-3 py-1.5 text-xs font-medium transition-colors',
                  filter === f
                    ? 'bg-primary-50 text-primary-700 dark:bg-primary-900/20 dark:text-primary-400'
                    : 'text-gray-600 hover:bg-gray-50 dark:text-gray-400 dark:hover:bg-gray-800'
                )}
              >
                {f === 'all' ? 'All' : f.charAt(0).toUpperCase() + f.slice(1)}
              </button>
            ))}
          </div>

          <button
            onClick={onCreateNew}
            className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-white bg-primary-600 hover:bg-primary-700 rounded-lg transition-colors"
          >
            <GitPullRequest className="w-4 h-4" />
            New MR
          </button>
        </div>
      </div>

      {/* List */}
      <div className="space-y-3">
        {filtered.map((mr) => (
          <MergeRequestCard
            key={mr.id}
            mergeRequest={mr}
            currentUserId={currentUserId}
            userRole={userRole}
            onApprove={onApprove}
            onMerge={onMerge}
            onClose={onClose}
          />
        ))}

        {filtered.length === 0 && (
          <div className="text-center py-8 text-gray-500 dark:text-gray-400">
            No merge requests found
          </div>
        )}
      </div>
    </div>
  )
}
