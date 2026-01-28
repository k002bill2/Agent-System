import { useState } from 'react'
import {
  GitPullRequest,
  GitMerge,
  ExternalLink,
  Clock,
  MessageSquare,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Plus,
  Minus,
  FileText,
  Eye,
} from 'lucide-react'
import { cn } from '../../lib/utils'
import type { GitHubPullRequest, GitHubPRReview } from '../../stores/git'

interface PullRequestCardProps {
  pr: GitHubPullRequest
  onViewDetails: (prNumber: number) => void
  onMerge: (prNumber: number) => void
}

function PullRequestCard({ pr, onViewDetails, onMerge }: PullRequestCardProps) {
  const getStateIcon = () => {
    if (pr.merged_at) {
      return <GitMerge className="w-5 h-5 text-purple-500" />
    }
    if (pr.state === 'closed') {
      return <XCircle className="w-5 h-5 text-red-500" />
    }
    if (pr.draft) {
      return <GitPullRequest className="w-5 h-5 text-gray-400" />
    }
    return <GitPullRequest className="w-5 h-5 text-green-500" />
  }

  const getMergeableStatus = () => {
    if (pr.mergeable === null) return null

    if (pr.mergeable === false) {
      return (
        <span className="flex items-center gap-1 px-2 py-0.5 text-xs font-medium rounded bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400">
          <AlertTriangle className="w-3 h-3" />
          Can't merge
        </span>
      )
    }

    if (pr.mergeable_state === 'clean') {
      return (
        <span className="flex items-center gap-1 px-2 py-0.5 text-xs font-medium rounded bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400">
          <CheckCircle2 className="w-3 h-3" />
          Ready
        </span>
      )
    }

    return (
      <span className="px-2 py-0.5 text-xs font-medium rounded bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400">
        {pr.mergeable_state}
      </span>
    )
  }

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr)
    const now = new Date()
    const diff = now.getTime() - date.getTime()
    const days = Math.floor(diff / (1000 * 60 * 60 * 24))

    if (days === 0) {
      const hours = Math.floor(diff / (1000 * 60 * 60))
      if (hours === 0) return 'just now'
      return `${hours}h ago`
    }
    if (days < 7) return `${days}d ago`
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  }

  return (
    <div className="border rounded-lg p-4 bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 hover:border-primary-300 dark:hover:border-primary-700 transition-colors">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-start gap-3 min-w-0">
          {getStateIcon()}

          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <a
                href={pr.html_url}
                target="_blank"
                rel="noopener noreferrer"
                className="font-medium text-gray-900 dark:text-white hover:text-primary-600 dark:hover:text-primary-400 truncate"
              >
                {pr.title}
              </a>
              <span className="text-sm text-gray-500">#{pr.number}</span>
            </div>

            <div className="flex items-center gap-2 mt-1 text-sm text-gray-500 dark:text-gray-400">
              <span className="font-mono text-xs bg-gray-100 dark:bg-gray-700 px-1.5 py-0.5 rounded">
                {pr.head_ref}
              </span>
              <span>→</span>
              <span className="font-mono text-xs bg-gray-100 dark:bg-gray-700 px-1.5 py-0.5 rounded">
                {pr.base_ref}
              </span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2 flex-shrink-0">
          {pr.draft && (
            <span className="px-2 py-0.5 text-xs font-medium rounded bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-400">
              Draft
            </span>
          )}
          {getMergeableStatus()}
        </div>
      </div>

      {/* Labels */}
      {pr.labels.length > 0 && (
        <div className="flex flex-wrap gap-1 mt-2">
          {pr.labels.slice(0, 5).map((label) => (
            <span
              key={label}
              className="px-2 py-0.5 text-xs font-medium rounded-full bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400"
            >
              {label}
            </span>
          ))}
          {pr.labels.length > 5 && (
            <span className="text-xs text-gray-500">+{pr.labels.length - 5}</span>
          )}
        </div>
      )}

      {/* Stats */}
      <div className="flex items-center justify-between mt-3 pt-3 border-t border-gray-100 dark:border-gray-700">
        <div className="flex items-center gap-4 text-sm text-gray-500 dark:text-gray-400">
          <span className="flex items-center gap-1">
            {pr.user_avatar_url && (
              <img
                src={pr.user_avatar_url}
                alt={pr.user_login}
                className="w-4 h-4 rounded-full"
              />
            )}
            {pr.user_login}
          </span>

          <span className="flex items-center gap-1">
            <Clock className="w-4 h-4" />
            {formatDate(pr.created_at)}
          </span>

          <span className="flex items-center gap-1">
            <FileText className="w-4 h-4" />
            {pr.changed_files} files
          </span>

          <span className="flex items-center gap-1 text-green-600">
            <Plus className="w-3 h-3" />
            {pr.additions}
          </span>

          <span className="flex items-center gap-1 text-red-600">
            <Minus className="w-3 h-3" />
            {pr.deletions}
          </span>

          {pr.review_comments > 0 && (
            <span className="flex items-center gap-1">
              <MessageSquare className="w-4 h-4" />
              {pr.review_comments}
            </span>
          )}
        </div>

        {/* Actions */}
        <div className="flex items-center gap-2">
          <button
            onClick={() => onViewDetails(pr.number)}
            className="flex items-center gap-1 px-2 py-1 text-sm text-gray-600 dark:text-gray-400 hover:text-primary-600 dark:hover:text-primary-400 hover:bg-gray-100 dark:hover:bg-gray-700 rounded transition-colors"
          >
            <Eye className="w-4 h-4" />
            View
          </button>

          {pr.state === 'open' && pr.mergeable !== false && !pr.draft && (
            <button
              onClick={() => onMerge(pr.number)}
              className="flex items-center gap-1 px-2 py-1 text-sm font-medium text-primary-600 hover:text-primary-700 hover:bg-primary-50 dark:hover:bg-primary-900/20 rounded transition-colors"
            >
              <GitMerge className="w-4 h-4" />
              Merge
            </button>
          )}

          <a
            href={pr.html_url}
            target="_blank"
            rel="noopener noreferrer"
            className="p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded transition-colors"
            title="Open in GitHub"
          >
            <ExternalLink className="w-4 h-4" />
          </a>
        </div>
      </div>
    </div>
  )
}

interface PullRequestListProps {
  pullRequests: GitHubPullRequest[]
  isLoading: boolean
  githubRepo: string | null
  onSetRepo: (repo: string) => void
  onRefresh: (state?: string) => void
  onViewDetails: (prNumber: number) => void
  onMerge: (prNumber: number) => void
}

export function PullRequestList({
  pullRequests,
  isLoading,
  githubRepo,
  onSetRepo,
  onRefresh,
  onViewDetails,
  onMerge,
}: PullRequestListProps) {
  const [filter, setFilter] = useState<'open' | 'closed' | 'all'>('open')
  const [showConfig, setShowConfig] = useState(!githubRepo)
  const [repoInput, setRepoInput] = useState(githubRepo || '')

  const handleSetRepo = () => {
    if (repoInput.trim()) {
      // Parse GitHub URL to owner/repo format
      let repo = repoInput.trim()

      // Handle SSH format: git@github.com:owner/repo.git
      const sshMatch = repo.match(/git@github\.com:([^/]+\/[^/]+?)(?:\.git)?$/)
      if (sshMatch) {
        repo = sshMatch[1]
      }

      // Handle HTTPS format: https://github.com/owner/repo
      const httpsMatch = repo.match(/https?:\/\/github\.com\/([^/]+\/[^/]+?)(?:\.git)?(?:\/)?$/)
      if (httpsMatch) {
        repo = httpsMatch[1]
      }

      // Remove .git suffix if present
      repo = repo.replace(/\.git$/, '')

      onSetRepo(repo)
      setShowConfig(false)
      onRefresh('open')
    }
  }

  const handleFilterChange = (newFilter: typeof filter) => {
    setFilter(newFilter)
    onRefresh(newFilter === 'all' ? undefined : newFilter)
  }

  if (!githubRepo || showConfig) {
    return (
      <div className="space-y-4">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
          GitHub Pull Requests
        </h3>

        <div className="p-6 bg-gray-50 dark:bg-gray-900 rounded-lg text-center">
          <GitPullRequest className="w-12 h-12 text-gray-400 mx-auto mb-4" />
          <h4 className="text-lg font-medium text-gray-900 dark:text-white mb-2">
            Connect GitHub Repository
          </h4>
          <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
            Enter your GitHub repository to view and manage pull requests
          </p>

          <div className="flex items-center gap-2 max-w-md mx-auto">
            <input
              type="text"
              value={repoInput}
              onChange={(e) => setRepoInput(e.target.value)}
              placeholder="owner/repository"
              className="flex-1 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-primary-500 focus:border-transparent"
            />
            <button
              onClick={handleSetRepo}
              disabled={!repoInput.trim()}
              className="px-4 py-2 text-sm font-medium text-white bg-primary-600 hover:bg-primary-700 disabled:opacity-50 rounded-lg transition-colors"
            >
              Connect
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
            Pull Requests
          </h3>
          <span className="text-sm text-gray-500">({pullRequests.length})</span>
          <button
            onClick={() => setShowConfig(true)}
            className="text-xs text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
          >
            {githubRepo}
          </button>
        </div>

        <div className="flex items-center gap-2">
          <div className="flex rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden">
            {(['open', 'closed', 'all'] as const).map((f) => (
              <button
                key={f}
                onClick={() => handleFilterChange(f)}
                className={cn(
                  'px-3 py-1.5 text-xs font-medium transition-colors',
                  filter === f
                    ? 'bg-primary-50 text-primary-700 dark:bg-primary-900/20 dark:text-primary-400'
                    : 'text-gray-600 hover:bg-gray-50 dark:text-gray-400 dark:hover:bg-gray-800'
                )}
              >
                {f.charAt(0).toUpperCase() + f.slice(1)}
              </button>
            ))}
          </div>

          <button
            onClick={() => onRefresh(filter === 'all' ? undefined : filter)}
            disabled={isLoading}
            className="px-3 py-1.5 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors disabled:opacity-50"
          >
            {isLoading ? 'Loading...' : 'Refresh'}
          </button>
        </div>
      </div>

      {/* List */}
      <div className="space-y-3">
        {pullRequests.map((pr) => (
          <PullRequestCard
            key={pr.number}
            pr={pr}
            onViewDetails={onViewDetails}
            onMerge={onMerge}
          />
        ))}

        {pullRequests.length === 0 && !isLoading && (
          <div className="text-center py-8 text-gray-500 dark:text-gray-400">
            No pull requests found
          </div>
        )}

        {isLoading && pullRequests.length === 0 && (
          <div className="text-center py-8 text-gray-500 dark:text-gray-400">
            Loading pull requests...
          </div>
        )}
      </div>
    </div>
  )
}

interface PRReviewPanelProps {
  pr: GitHubPullRequest
  reviews: GitHubPRReview[]
  onClose: () => void
  onCreateReview: (body: string, event: string) => Promise<boolean>
  onMerge: (method: string) => Promise<boolean>
}

export function PRReviewPanel({
  pr,
  reviews,
  onClose,
  onCreateReview,
  onMerge,
}: PRReviewPanelProps) {
  const [reviewBody, setReviewBody] = useState('')
  const [reviewEvent, setReviewEvent] = useState('COMMENT')
  const [submitting, setSubmitting] = useState(false)
  const [mergeMethod, setMergeMethod] = useState('merge')
  const [merging, setMerging] = useState(false)

  const handleSubmitReview = async () => {
    setSubmitting(true)
    await onCreateReview(reviewBody, reviewEvent)
    setReviewBody('')
    setSubmitting(false)
  }

  const handleMerge = async () => {
    if (confirm(`Merge this PR using ${mergeMethod} method?`)) {
      setMerging(true)
      const success = await onMerge(mergeMethod)
      if (success) {
        onClose()
      }
      setMerging(false)
    }
  }

  const getReviewIcon = (state: string) => {
    switch (state) {
      case 'APPROVED':
        return <CheckCircle2 className="w-4 h-4 text-green-500" />
      case 'CHANGES_REQUESTED':
        return <XCircle className="w-4 h-4 text-red-500" />
      default:
        return <MessageSquare className="w-4 h-4 text-gray-400" />
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-xl w-full max-w-2xl max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-700">
          <div>
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
              PR #{pr.number}: {pr.title}
            </h3>
            <div className="flex items-center gap-2 mt-1 text-sm text-gray-500">
              <span className="font-mono">{pr.head_ref}</span>
              <span>→</span>
              <span className="font-mono">{pr.base_ref}</span>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
          >
            ×
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {/* Reviews */}
          <div>
            <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Reviews ({reviews.length})
            </h4>
            <div className="space-y-2">
              {reviews.map((review) => (
                <div
                  key={review.id}
                  className="flex items-start gap-3 p-3 bg-gray-50 dark:bg-gray-900 rounded-lg"
                >
                  {getReviewIcon(review.state)}
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-gray-900 dark:text-white">
                        {review.user_login}
                      </span>
                      <span className="text-xs text-gray-500">
                        {review.state}
                      </span>
                    </div>
                    {review.body && (
                      <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                        {review.body}
                      </p>
                    )}
                  </div>
                </div>
              ))}
              {reviews.length === 0 && (
                <p className="text-sm text-gray-500">No reviews yet</p>
              )}
            </div>
          </div>

          {/* Add Review */}
          <div>
            <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Add Review
            </h4>
            <textarea
              value={reviewBody}
              onChange={(e) => setReviewBody(e.target.value)}
              placeholder="Write your review..."
              rows={3}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-primary-500 focus:border-transparent resize-none"
            />
            <div className="flex items-center justify-between mt-2">
              <select
                value={reviewEvent}
                onChange={(e) => setReviewEvent(e.target.value)}
                className="px-3 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
              >
                <option value="COMMENT">Comment</option>
                <option value="APPROVE">Approve</option>
                <option value="REQUEST_CHANGES">Request Changes</option>
              </select>
              <button
                onClick={handleSubmitReview}
                disabled={submitting}
                className="px-3 py-1.5 text-sm font-medium text-white bg-primary-600 hover:bg-primary-700 disabled:opacity-50 rounded-lg transition-colors"
              >
                {submitting ? 'Submitting...' : 'Submit Review'}
              </button>
            </div>
          </div>
        </div>

        {/* Footer */}
        {pr.state === 'open' && pr.mergeable !== false && (
          <div className="flex items-center justify-between p-4 border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900">
            <div className="flex items-center gap-2">
              <span className="text-sm text-gray-600 dark:text-gray-400">Merge method:</span>
              <select
                value={mergeMethod}
                onChange={(e) => setMergeMethod(e.target.value)}
                className="px-3 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
              >
                <option value="merge">Create merge commit</option>
                <option value="squash">Squash and merge</option>
                <option value="rebase">Rebase and merge</option>
              </select>
            </div>

            <button
              onClick={handleMerge}
              disabled={merging}
              className="flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-white bg-green-600 hover:bg-green-700 disabled:opacity-50 rounded-lg transition-colors"
            >
              <GitMerge className="w-4 h-4" />
              {merging ? 'Merging...' : 'Merge PR'}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
