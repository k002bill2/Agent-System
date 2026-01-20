/**
 * FeedbackHistoryPanel Component
 *
 * 피드백 히스토리 목록과 필터를 표시합니다.
 */

import { useEffect } from 'react'
import {
  ThumbsUp,
  ThumbsDown,
  Edit,
  Clock,
  CheckCircle,
  XCircle,
  AlertCircle,
  Filter,
  RefreshCw,
  Play,
  Bot,
} from 'lucide-react'
import { cn } from '../../lib/utils'
import {
  useFeedbackStore,
  FeedbackEntry,
  FeedbackType,
  FeedbackStatus,
  feedbackTypeLabel,
  feedbackReasonLabel,
  feedbackStatusLabel,
  feedbackTypeColors,
  feedbackStatusColors,
} from '../../stores/feedback'

interface FeedbackHistoryPanelProps {
  className?: string
}

export function FeedbackHistoryPanel({ className }: FeedbackHistoryPanelProps) {
  const {
    feedbacks,
    stats,
    isLoading,
    error,
    filterType,
    filterStatus,
    fetchFeedbacks,
    fetchStats,
    processFeedback,
    processPendingFeedbacks,
    setFilterType,
    setFilterStatus,
    clearError,
  } = useFeedbackStore()

  useEffect(() => {
    fetchFeedbacks()
    fetchStats()
  }, [fetchFeedbacks, fetchStats])

  const handleRefresh = () => {
    fetchFeedbacks()
    fetchStats()
  }

  const handleProcessPending = async () => {
    await processPendingFeedbacks()
  }

  return (
    <div className={cn('space-y-6', className)}>
      {/* Stats Summary */}
      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <StatCard
            label="Total Feedbacks"
            value={stats.total_count}
            icon={<Clock className="w-5 h-5" />}
          />
          <StatCard
            label="Positive Rate"
            value={`${(stats.positive_rate * 100).toFixed(1)}%`}
            icon={<ThumbsUp className="w-5 h-5 text-green-500" />}
            color="green"
          />
          <StatCard
            label="Implicit Rate"
            value={`${(stats.implicit_rate * 100).toFixed(1)}%`}
            icon={<Edit className="w-5 h-5 text-yellow-500" />}
            color="yellow"
          />
          <StatCard
            label="Pending"
            value={stats.by_status?.pending || 0}
            icon={<AlertCircle className="w-5 h-5 text-gray-500" />}
          />
        </div>
      )}

      {/* Filters & Actions */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          {/* Type Filter */}
          <div className="flex items-center gap-2">
            <Filter className="w-4 h-4 text-gray-500 dark:text-gray-400" />
            <select
              value={filterType || ''}
              onChange={(e) => setFilterType((e.target.value || null) as FeedbackType | null)}
              className={cn(
                'px-3 py-1.5 rounded-lg text-sm',
                'border border-gray-200 dark:border-gray-700',
                'bg-white dark:bg-gray-800 text-gray-900 dark:text-white',
                'focus:outline-none focus:ring-2 focus:ring-primary-500'
              )}
            >
              <option value="">All Types</option>
              <option value="implicit">Implicit</option>
              <option value="explicit_positive">Positive</option>
              <option value="explicit_negative">Negative</option>
            </select>
          </div>

          {/* Status Filter */}
          <select
            value={filterStatus || ''}
            onChange={(e) => setFilterStatus((e.target.value || null) as FeedbackStatus | null)}
            className={cn(
              'px-3 py-1.5 rounded-lg text-sm',
              'border border-gray-200 dark:border-gray-700',
              'bg-white dark:bg-gray-800 text-gray-900 dark:text-white',
              'focus:outline-none focus:ring-2 focus:ring-primary-500'
            )}
          >
            <option value="">All Status</option>
            <option value="pending">Pending</option>
            <option value="processed">Processed</option>
            <option value="skipped">Skipped</option>
            <option value="error">Error</option>
          </select>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={handleProcessPending}
            disabled={isLoading || !stats?.by_status?.pending}
            className={cn(
              'flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium',
              'bg-primary-500 text-white hover:bg-primary-600',
              'disabled:opacity-50 disabled:cursor-not-allowed'
            )}
          >
            <Play className="w-4 h-4" />
            Process Pending ({stats?.by_status?.pending || 0})
          </button>
          <button
            onClick={handleRefresh}
            disabled={isLoading}
            className={cn(
              'p-2 rounded-lg border border-gray-200 dark:border-gray-700',
              'hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors',
              'disabled:opacity-50'
            )}
          >
            <RefreshCw className={cn('w-4 h-4 text-gray-600 dark:text-gray-400', isLoading && 'animate-spin')} />
          </button>
        </div>
      </div>

      {/* Error Banner */}
      {error && (
        <div className="p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
          <div className="flex items-center gap-2 text-red-600 dark:text-red-400">
            <AlertCircle className="w-4 h-4" />
            <span className="text-sm">{error}</span>
            <button onClick={clearError} className="ml-auto text-red-500 hover:text-red-600 text-sm">
              Dismiss
            </button>
          </div>
        </div>
      )}

      {/* Feedback List */}
      {isLoading && feedbacks.length === 0 ? (
        <div className="space-y-3">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4 animate-pulse">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 bg-gray-200 dark:bg-gray-700 rounded-lg" />
                <div className="flex-1">
                  <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-48 mb-2" />
                  <div className="h-3 bg-gray-200 dark:bg-gray-700 rounded w-32" />
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : feedbacks.length === 0 ? (
        <div className="text-center py-12 text-gray-500 dark:text-gray-400">
          <ThumbsUp className="w-12 h-12 mx-auto mb-4 opacity-50" />
          <p>No feedbacks yet</p>
          <p className="text-sm mt-1">Feedbacks will appear here when users provide them</p>
        </div>
      ) : (
        <div className="space-y-3">
          {feedbacks.map((feedback) => (
            <FeedbackCard
              key={feedback.id}
              feedback={feedback}
              onProcess={() => processFeedback(feedback.id)}
              isLoading={isLoading}
            />
          ))}
        </div>
      )}
    </div>
  )
}

// ============================================================================
// Sub Components
// ============================================================================

interface StatCardProps {
  label: string
  value: string | number
  icon: React.ReactNode
  color?: 'green' | 'yellow' | 'red' | 'blue'
}

function StatCard({ label, value, icon, color }: StatCardProps) {
  const colorClasses = {
    green: 'bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800',
    yellow: 'bg-yellow-50 dark:bg-yellow-900/20 border-yellow-200 dark:border-yellow-800',
    red: 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800',
    blue: 'bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800',
  }

  return (
    <div
      className={cn(
        'p-4 rounded-lg border',
        color ? colorClasses[color] : 'bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700'
      )}
    >
      <div className="flex items-center gap-3">
        {icon}
        <div>
          <p className="text-2xl font-bold text-gray-900 dark:text-white">{value}</p>
          <p className="text-xs text-gray-500 dark:text-gray-400">{label}</p>
        </div>
      </div>
    </div>
  )
}

interface FeedbackCardProps {
  feedback: FeedbackEntry
  onProcess: () => void
  isLoading: boolean
}

function FeedbackCard({ feedback, onProcess, isLoading }: FeedbackCardProps) {
  const typeIcon = {
    implicit: <Edit className="w-4 h-4" />,
    explicit_positive: <ThumbsUp className="w-4 h-4" />,
    explicit_negative: <ThumbsDown className="w-4 h-4" />,
  }

  const statusIcon = {
    pending: <Clock className="w-3 h-3" />,
    processed: <CheckCircle className="w-3 h-3" />,
    skipped: <XCircle className="w-3 h-3" />,
    error: <AlertCircle className="w-3 h-3" />,
  }

  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4">
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-start gap-3 flex-1 min-w-0">
          {/* Type Icon */}
          <div
            className={cn(
              'p-2 rounded-lg',
              feedbackTypeColors[feedback.feedback_type]
            )}
          >
            {typeIcon[feedback.feedback_type]}
          </div>

          {/* Content */}
          <div className="flex-1 min-w-0">
            {/* Header */}
            <div className="flex items-center gap-2 flex-wrap">
              <span className={cn('px-2 py-0.5 rounded text-xs font-medium', feedbackTypeColors[feedback.feedback_type])}>
                {feedbackTypeLabel[feedback.feedback_type]}
              </span>
              <span className={cn('px-2 py-0.5 rounded text-xs font-medium flex items-center gap-1', feedbackStatusColors[feedback.status])}>
                {statusIcon[feedback.status]}
                {feedbackStatusLabel[feedback.status]}
              </span>
              {feedback.agent_id && (
                <span className="px-2 py-0.5 rounded text-xs font-medium bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400 flex items-center gap-1">
                  <Bot className="w-3 h-3" />
                  {feedback.agent_id}
                </span>
              )}
            </div>

            {/* Reason */}
            {feedback.reason && (
              <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">
                <span className="font-medium">Reason:</span> {feedbackReasonLabel[feedback.reason]}
                {feedback.reason_detail && ` - ${feedback.reason_detail}`}
              </p>
            )}

            {/* Output Preview */}
            <div className="mt-2 p-2 bg-gray-50 dark:bg-gray-900 rounded text-xs font-mono text-gray-600 dark:text-gray-400 truncate">
              {feedback.original_output.slice(0, 200)}
              {feedback.original_output.length > 200 && '...'}
            </div>

            {/* Corrected Output (for implicit feedback) */}
            {feedback.corrected_output && (
              <div className="mt-2 p-2 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded text-xs font-mono text-green-700 dark:text-green-400 truncate">
                <span className="font-medium">Corrected:</span> {feedback.corrected_output.slice(0, 150)}
                {feedback.corrected_output.length > 150 && '...'}
              </div>
            )}

            {/* Metadata */}
            <div className="mt-2 flex items-center gap-3 text-xs text-gray-500 dark:text-gray-400">
              <span>Task: {feedback.task_id.slice(0, 8)}...</span>
              <span>Session: {feedback.session_id.slice(0, 8)}...</span>
              <span>{new Date(feedback.created_at).toLocaleString()}</span>
            </div>
          </div>
        </div>

        {/* Actions */}
        {feedback.status === 'pending' && (
          <button
            onClick={onProcess}
            disabled={isLoading}
            className={cn(
              'px-3 py-1.5 rounded-lg text-xs font-medium',
              'bg-primary-100 dark:bg-primary-900/30 text-primary-700 dark:text-primary-400',
              'hover:bg-primary-200 dark:hover:bg-primary-900/50',
              'disabled:opacity-50 disabled:cursor-not-allowed'
            )}
          >
            Process
          </button>
        )}
      </div>
    </div>
  )
}

export default FeedbackHistoryPanel
