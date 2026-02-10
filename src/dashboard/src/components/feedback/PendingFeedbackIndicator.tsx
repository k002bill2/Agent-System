/**
 * PendingFeedbackIndicator Component
 *
 * 대시보드 헤더에 배치할 글로벌 pending 피드백 표시기입니다.
 */

import { useState } from 'react'
import { AlertCircle, X, RefreshCw, Trash2, Loader2 } from 'lucide-react'
import { cn } from '../../lib/utils'
import { useFeedbackStore, usePendingFeedbackCount } from '../../stores/feedback'

export function PendingFeedbackIndicator() {
  const pendingCount = usePendingFeedbackCount()
  const {
    pendingFeedbacks,
    pendingEvaluations,
    retryPendingSubmissions,
    clearPending,
    clearAllPending,
  } = useFeedbackStore()
  const [showModal, setShowModal] = useState(false)
  const [isRetrying, setIsRetrying] = useState(false)

  if (pendingCount === 0) return null

  const handleRetryAll = async () => {
    setIsRetrying(true)
    await retryPendingSubmissions()
    setIsRetrying(false)
  }

  return (
    <>
      {/* Badge */}
      <button
        onClick={() => setShowModal(true)}
        className={cn(
          'relative flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium',
          'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400',
          'hover:bg-yellow-200 dark:hover:bg-yellow-900/50 transition-colors'
        )}
      >
        <AlertCircle className="w-3.5 h-3.5" />
        <span>{pendingCount} pending</span>
      </button>

      {/* Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl w-full max-w-lg mx-4 max-h-[80vh] flex flex-col">
            {/* Header */}
            <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-700">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                Pending Submissions ({pendingCount})
              </h3>
              <div className="flex items-center gap-2">
                <button
                  onClick={handleRetryAll}
                  disabled={isRetrying}
                  className={cn(
                    'px-3 py-1.5 rounded-md text-xs font-medium',
                    'bg-primary-500 text-white hover:bg-primary-600',
                    'disabled:opacity-50 disabled:cursor-not-allowed'
                  )}
                >
                  {isRetrying ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <span className="flex items-center gap-1">
                      <RefreshCw className="w-3.5 h-3.5" />
                      Retry All
                    </span>
                  )}
                </button>
                <button
                  onClick={clearAllPending}
                  className="px-3 py-1.5 rounded-md text-xs font-medium text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-900/20"
                >
                  Clear All
                </button>
                <button
                  onClick={() => setShowModal(false)}
                  className="p-1 rounded-md text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* List */}
            <div className="overflow-y-auto p-4 space-y-3">
              {pendingFeedbacks.map((item) => (
                <div
                  key={item.id}
                  className="flex items-start justify-between p-3 rounded-lg border border-gray-200 dark:border-gray-700"
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-xs font-medium text-gray-900 dark:text-white">
                        Feedback
                      </span>
                      <StatusBadge status={item.status} />
                    </div>
                    <p className="text-xs text-gray-500 dark:text-gray-400 truncate">
                      {item.feedback.feedback_type} - {item.feedback.session_id.slice(0, 8)}...
                    </p>
                    {item.lastError && (
                      <p className="text-xs text-red-500 mt-1">{item.lastError}</p>
                    )}
                    <p className="text-xs text-gray-400 mt-1">
                      Retries: {item.retryCount}/{item.maxRetries}
                    </p>
                  </div>
                  <button
                    onClick={() => clearPending(item.id)}
                    className="p-1 text-gray-400 hover:text-red-500"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              ))}

              {pendingEvaluations.map((item) => (
                <div
                  key={item.id}
                  className="flex items-start justify-between p-3 rounded-lg border border-gray-200 dark:border-gray-700"
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-xs font-medium text-gray-900 dark:text-white">
                        Evaluation
                      </span>
                      <StatusBadge status={item.status} />
                    </div>
                    <p className="text-xs text-gray-500 dark:text-gray-400 truncate">
                      Rating: {item.evaluation.rating}/5 - {item.evaluation.session_id.slice(0, 8)}...
                    </p>
                    {item.lastError && (
                      <p className="text-xs text-red-500 mt-1">{item.lastError}</p>
                    )}
                    <p className="text-xs text-gray-400 mt-1">
                      Retries: {item.retryCount}/{item.maxRetries}
                    </p>
                  </div>
                  <button
                    onClick={() => clearPending(item.id)}
                    className="p-1 text-gray-400 hover:text-red-500"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </>
  )
}

function StatusBadge({ status }: { status: string }) {
  const config: Record<string, { label: string; className: string }> = {
    queued: { label: 'Queued', className: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400' },
    retrying: { label: 'Retrying', className: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400' },
    failed: { label: 'Failed', className: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400' },
  }

  const c = config[status] ?? config.queued

  return (
    <span className={cn('px-1.5 py-0.5 rounded text-[10px] font-medium', c.className)}>
      {c.label}
    </span>
  )
}

export default PendingFeedbackIndicator
