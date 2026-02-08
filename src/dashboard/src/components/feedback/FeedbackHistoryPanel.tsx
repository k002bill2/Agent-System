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
  AlertCircle,
  Filter,
  RefreshCw,
  Play,
  Bot,
  MessageSquare,
  FolderOpen,
} from 'lucide-react'
import { cn } from '../../lib/utils'
import {
  useFeedbackStore,
  FeedbackEntry,
  FeedbackType,
  FeedbackStatus,
  feedbackTypeColors,
} from '../../stores/feedback'
import { AgentEvalPanel } from './AgentEvalPanel'

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

      {/* Agent Evaluation Stats */}
      <AgentEvalPanel />

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
        <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden">
          {/* Table Header */}
          <div className="grid grid-cols-[minmax(250px,1fr)_120px_100px_auto_200px_auto] gap-3 px-4 py-2.5 bg-gray-50 dark:bg-gray-900 border-b border-gray-200 dark:border-gray-700 text-xs font-medium text-gray-500 dark:text-gray-400">
            <span>Context Summary</span>
            <span>프로젝트</span>
            <span>Effort</span>
            <span>결과</span>
            <span>Comment</span>
            <span className="w-16" />
          </div>
          {/* Table Body */}
          <div className="divide-y divide-gray-100 dark:divide-gray-700">
            {feedbacks.map((feedback) => (
              <FeedbackRow
                key={feedback.id}
                feedback={feedback}
                onProcess={() => processFeedback(feedback.id)}
                isLoading={isLoading}
              />
            ))}
          </div>
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

interface FeedbackRowProps {
  feedback: FeedbackEntry
  onProcess: () => void
  isLoading: boolean
}

function FeedbackRow({ feedback, onProcess, isLoading }: FeedbackRowProps) {
  const typeIcon = {
    implicit: <Edit className="w-3.5 h-3.5" />,
    explicit_positive: <ThumbsUp className="w-3.5 h-3.5" />,
    explicit_negative: <ThumbsDown className="w-3.5 h-3.5" />,
  }

  // Context summary - extract meaningful preview
  const contextSummary = feedback.original_output.replace(/\n/g, ' ').slice(0, 60)
  const hasMore = feedback.original_output.length > 60

  // Effort level color mapping
  const effortColors: Record<string, string> = {
    quick: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
    moderate: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
    thorough: 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400',
    comprehensive: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
  }

  // Comment
  const comment = feedback.reason_detail || feedback.corrected_output || ''

  return (
    <div className="grid grid-cols-[minmax(250px,1fr)_120px_100px_auto_200px_auto] gap-3 px-4 py-2.5 items-center hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors group">
      {/* Context Summary - text only */}
      <div className="min-w-0">
        <span className="text-sm text-gray-700 dark:text-gray-300 truncate block" title={feedback.original_output}>
          {contextSummary}{hasMore && '...'}
        </span>
        {feedback.agent_id && (
          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-400 mt-0.5">
            <Bot className="w-2.5 h-2.5" />
            {feedback.agent_id}
          </span>
        )}
      </div>

      {/* 프로젝트 */}
      <div className="min-w-0 flex items-center gap-1.5">
        {feedback.project_name ? (
          <>
            <FolderOpen className="w-3.5 h-3.5 text-blue-500 dark:text-blue-400 flex-shrink-0" />
            <span className="text-xs text-blue-600 dark:text-blue-400 font-medium truncate" title={feedback.project_name}>
              {feedback.project_name}
            </span>
          </>
        ) : (
          <span className="text-xs text-gray-400 dark:text-gray-600">-</span>
        )}
      </div>

      {/* Effort Level */}
      <div className="flex justify-center">
        {feedback.effort_level ? (
          <span className={cn(
            'px-2 py-0.5 rounded-full text-[10px] font-medium whitespace-nowrap',
            effortColors[feedback.effort_level] || 'bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300'
          )}>
            {feedback.effort_level}
          </span>
        ) : (
          <span className="text-xs text-gray-400 dark:text-gray-600">-</span>
        )}
      </div>

      {/* 결과 - icon only */}
      <div className="flex justify-center">
        <div className={cn('p-1.5 rounded', feedbackTypeColors[feedback.feedback_type])}>
          {typeIcon[feedback.feedback_type]}
        </div>
      </div>

      {/* Comment */}
      <div className="min-w-0 flex items-center gap-1">
        {comment ? (
          <span className="text-xs text-gray-500 dark:text-gray-400 truncate" title={comment}>
            <MessageSquare className="w-3 h-3 inline mr-1 opacity-50" />
            {comment}
          </span>
        ) : (
          <span className="text-xs text-gray-400 dark:text-gray-600">-</span>
        )}
      </div>

      {/* Action */}
      <div className="w-16 text-right">
        {feedback.status === 'pending' ? (
          <button
            onClick={onProcess}
            disabled={isLoading}
            className={cn(
              'px-2 py-1 rounded text-[10px] font-medium',
              'bg-primary-100 dark:bg-primary-900/30 text-primary-700 dark:text-primary-400',
              'hover:bg-primary-200 dark:hover:bg-primary-900/50',
              'disabled:opacity-50 disabled:cursor-not-allowed',
              'opacity-0 group-hover:opacity-100 transition-opacity'
            )}
          >
            Process
          </button>
        ) : null}
      </div>
    </div>
  )
}

export default FeedbackHistoryPanel
