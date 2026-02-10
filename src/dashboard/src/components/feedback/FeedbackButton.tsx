/**
 * FeedbackButton Component
 *
 * 태스크 결과에 대한 👍/👎 피드백 버튼입니다.
 */

import { useState } from 'react'
import { ThumbsUp, ThumbsDown, Loader2, AlertCircle } from 'lucide-react'
import { cn } from '../../lib/utils'
import { useFeedbackStore, FeedbackSubmit } from '../../stores/feedback'

interface FeedbackButtonProps {
  sessionId: string
  taskId: string
  messageId?: string
  output: string
  agentId?: string
  size?: 'sm' | 'md'
  className?: string
  onFeedbackSubmitted?: (isPositive: boolean) => void
}

export function FeedbackButton({
  sessionId,
  taskId,
  messageId,
  output,
  agentId,
  size = 'sm',
  className,
  onFeedbackSubmitted,
}: FeedbackButtonProps) {
  const { submitFeedback, isSubmitting, pendingFeedbacks, retryPendingSubmissions } = useFeedbackStore()
  const [submitted, setSubmitted] = useState<'positive' | 'negative' | null>(null)
  const [showNegativeModal, setShowNegativeModal] = useState(false)

  const iconSize = size === 'sm' ? 'w-4 h-4' : 'w-5 h-5'
  const buttonSize = size === 'sm' ? 'p-1.5' : 'p-2'

  // Check for pending items for this task
  const pendingItem = pendingFeedbacks.find(
    (p) => p.feedback.session_id === sessionId && p.feedback.task_id === taskId
  )

  const handlePositive = async () => {
    if (submitted || isSubmitting) return

    const feedback: FeedbackSubmit = {
      session_id: sessionId,
      task_id: taskId,
      message_id: messageId,
      feedback_type: 'explicit_positive',
      original_output: output,
    }

    const result = await submitFeedback(feedback, agentId)
    if (result) {
      setSubmitted('positive')
      onFeedbackSubmitted?.(true)
    }
  }

  const handleNegative = () => {
    if (submitted || isSubmitting) return
    setShowNegativeModal(true)
  }

  const handleNegativeSubmit = async (reason: string, reasonDetail?: string) => {
    const feedback: FeedbackSubmit = {
      session_id: sessionId,
      task_id: taskId,
      message_id: messageId,
      feedback_type: 'explicit_negative',
      reason: reason as FeedbackSubmit['reason'],
      reason_detail: reasonDetail,
      original_output: output,
    }

    const result = await submitFeedback(feedback, agentId)
    if (result) {
      setSubmitted('negative')
      setShowNegativeModal(false)
      onFeedbackSubmitted?.(false)
    }
  }

  // Pending/Failed state display
  if (pendingItem) {
    if (pendingItem.status === 'retrying') {
      return (
        <div className={cn('flex items-center gap-1 text-xs text-yellow-600 dark:text-yellow-400', className)}>
          <Loader2 className={cn(iconSize, 'animate-spin')} />
          <span>Retrying...</span>
        </div>
      )
    }
    if (pendingItem.status === 'failed') {
      return (
        <button
          onClick={() => retryPendingSubmissions()}
          className={cn(
            'flex items-center gap-1 text-xs text-red-600 dark:text-red-400',
            'hover:text-red-700 dark:hover:text-red-300 transition-colors',
            className
          )}
        >
          <AlertCircle className={iconSize} />
          <span>Failed - Tap to retry</span>
        </button>
      )
    }
    // queued
    return (
      <div className={cn('flex items-center gap-1 text-xs text-yellow-600 dark:text-yellow-400', className)}>
        <AlertCircle className={iconSize} />
        <span>Queued</span>
      </div>
    )
  }

  if (submitted) {
    return (
      <div
        className={cn(
          'flex items-center gap-1 text-xs',
          submitted === 'positive' ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400',
          className
        )}
      >
        {submitted === 'positive' ? (
          <ThumbsUp className={iconSize} />
        ) : (
          <ThumbsDown className={iconSize} />
        )}
        <span>Thank you!</span>
      </div>
    )
  }

  return (
    <>
      <div className={cn('flex items-center gap-1', className)}>
        <button
          onClick={handlePositive}
          disabled={isSubmitting}
          className={cn(
            buttonSize,
            'rounded-md border border-gray-200 dark:border-gray-700',
            'hover:bg-green-50 hover:border-green-300 dark:hover:bg-green-900/20 dark:hover:border-green-700',
            'text-gray-500 hover:text-green-600 dark:text-gray-400 dark:hover:text-green-400',
            'transition-colors disabled:opacity-50 disabled:cursor-not-allowed'
          )}
          title="Good response"
        >
          {isSubmitting ? (
            <Loader2 className={cn(iconSize, 'animate-spin')} />
          ) : (
            <ThumbsUp className={iconSize} />
          )}
        </button>
        <button
          onClick={handleNegative}
          disabled={isSubmitting}
          className={cn(
            buttonSize,
            'rounded-md border border-gray-200 dark:border-gray-700',
            'hover:bg-red-50 hover:border-red-300 dark:hover:bg-red-900/20 dark:hover:border-red-700',
            'text-gray-500 hover:text-red-600 dark:text-gray-400 dark:hover:text-red-400',
            'transition-colors disabled:opacity-50 disabled:cursor-not-allowed'
          )}
          title="Bad response"
        >
          <ThumbsDown className={iconSize} />
        </button>
      </div>

      {/* Negative Feedback Modal */}
      {showNegativeModal && (
        <NegativeFeedbackModal
          onSubmit={handleNegativeSubmit}
          onClose={() => setShowNegativeModal(false)}
          isSubmitting={isSubmitting}
        />
      )}
    </>
  )
}

// ============================================================================
// Negative Feedback Modal (Inline)
// ============================================================================

interface NegativeFeedbackModalProps {
  onSubmit: (reason: string, reasonDetail?: string) => void
  onClose: () => void
  isSubmitting: boolean
}

function NegativeFeedbackModal({ onSubmit, onClose, isSubmitting }: NegativeFeedbackModalProps) {
  const [reason, setReason] = useState<string>('')
  const [reasonDetail, setReasonDetail] = useState('')

  const reasons = [
    { value: 'incorrect', label: '결과가 틀림' },
    { value: 'incomplete', label: '불완전한 결과' },
    { value: 'off_topic', label: '주제에서 벗어남' },
    { value: 'style', label: '스타일/형식 문제' },
    { value: 'performance', label: '성능 문제' },
    { value: 'other', label: '기타' },
  ]

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (reason) {
      onSubmit(reason, reasonDetail || undefined)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl w-full max-w-md mx-4 p-6">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
          피드백 사유 선택
        </h3>

        <form onSubmit={handleSubmit}>
          <div className="space-y-3 mb-4">
            {reasons.map((r) => (
              <label
                key={r.value}
                className={cn(
                  'flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-colors',
                  reason === r.value
                    ? 'border-primary-500 bg-primary-50 dark:bg-primary-900/20'
                    : 'border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700/50'
                )}
              >
                <input
                  type="radio"
                  name="reason"
                  value={r.value}
                  checked={reason === r.value}
                  onChange={(e) => setReason(e.target.value)}
                  className="w-4 h-4 text-primary-600"
                />
                <span className="text-sm text-gray-900 dark:text-white">{r.label}</span>
              </label>
            ))}
          </div>

          {reason === 'other' && (
            <div className="mb-4">
              <textarea
                value={reasonDetail}
                onChange={(e) => setReasonDetail(e.target.value)}
                placeholder="상세 사유를 입력하세요..."
                className={cn(
                  'w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700',
                  'bg-white dark:bg-gray-900 text-gray-900 dark:text-white',
                  'placeholder:text-gray-400 dark:placeholder:text-gray-500',
                  'focus:outline-none focus:ring-2 focus:ring-primary-500'
                )}
                rows={3}
              />
            </div>
          )}

          <div className="flex justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              className={cn(
                'px-4 py-2 rounded-lg text-sm font-medium',
                'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700'
              )}
            >
              취소
            </button>
            <button
              type="submit"
              disabled={!reason || isSubmitting}
              className={cn(
                'px-4 py-2 rounded-lg text-sm font-medium',
                'bg-red-500 text-white hover:bg-red-600',
                'disabled:opacity-50 disabled:cursor-not-allowed'
              )}
            >
              {isSubmitting ? (
                <span className="flex items-center gap-2">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  제출 중...
                </span>
              ) : (
                '제출'
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

export default FeedbackButton
