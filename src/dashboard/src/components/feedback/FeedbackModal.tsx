/**
 * FeedbackModal Component
 *
 * 부정 피드백 사유 선택 모달입니다.
 * 재사용 가능한 독립 컴포넌트입니다.
 */

import { useState } from 'react'
import { X, Loader2, ThumbsDown, AlertCircle } from 'lucide-react'
import { cn } from '../../lib/utils'
import { FeedbackReason } from '../../stores/feedback'

interface FeedbackModalProps {
  isOpen: boolean
  onClose: () => void
  onSubmit: (reason: FeedbackReason, reasonDetail?: string) => Promise<void>
  isSubmitting?: boolean
  title?: string
}

const reasons: { value: FeedbackReason; label: string; description: string }[] = [
  { value: 'incorrect', label: '결과가 틀림', description: '사실적으로 잘못되었거나 오류가 있음' },
  { value: 'incomplete', label: '불완전한 결과', description: '필요한 내용이 누락됨' },
  { value: 'off_topic', label: '주제에서 벗어남', description: '요청한 내용과 관련 없는 응답' },
  { value: 'style', label: '스타일/형식 문제', description: '형식, 톤, 구조가 적절하지 않음' },
  { value: 'performance', label: '성능 문제', description: '응답 시간이 너무 오래 걸림' },
  { value: 'other', label: '기타', description: '다른 이유' },
]

export function FeedbackModal({
  isOpen,
  onClose,
  onSubmit,
  isSubmitting = false,
  title = '피드백 사유 선택',
}: FeedbackModalProps) {
  const [selectedReason, setSelectedReason] = useState<FeedbackReason | null>(null)
  const [reasonDetail, setReasonDetail] = useState('')
  const [error, setError] = useState<string | null>(null)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)

    if (!selectedReason) {
      setError('사유를 선택해주세요')
      return
    }

    try {
      await onSubmit(selectedReason, reasonDetail || undefined)
      // 성공 시 상태 초기화
      setSelectedReason(null)
      setReasonDetail('')
    } catch (err) {
      setError(err instanceof Error ? err.message : '제출에 실패했습니다')
    }
  }

  const handleClose = () => {
    setSelectedReason(null)
    setReasonDetail('')
    setError(null)
    onClose()
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={handleClose}
      />

      {/* Modal */}
      <div className="relative bg-white dark:bg-gray-800 rounded-xl shadow-2xl w-full max-w-lg mx-4 overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-gray-700">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-red-100 dark:bg-red-900/30 rounded-lg">
              <ThumbsDown className="w-5 h-5 text-red-600 dark:text-red-400" />
            </div>
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white">{title}</h2>
          </div>
          <button
            onClick={handleClose}
            className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
          >
            <X className="w-5 h-5 text-gray-500 dark:text-gray-400" />
          </button>
        </div>

        {/* Body */}
        <form onSubmit={handleSubmit}>
          <div className="p-6 space-y-4 max-h-[60vh] overflow-y-auto">
            {/* Error Message */}
            {error && (
              <div className="flex items-center gap-2 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
                <AlertCircle className="w-4 h-4 text-red-600 dark:text-red-400" />
                <span className="text-sm text-red-600 dark:text-red-400">{error}</span>
              </div>
            )}

            {/* Reason Options */}
            <div className="space-y-2">
              {reasons.map((r) => (
                <label
                  key={r.value}
                  className={cn(
                    'flex items-start gap-3 p-4 rounded-lg border-2 cursor-pointer transition-all',
                    selectedReason === r.value
                      ? 'border-red-500 bg-red-50 dark:bg-red-900/20'
                      : 'border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-700/50'
                  )}
                >
                  <input
                    type="radio"
                    name="reason"
                    value={r.value}
                    checked={selectedReason === r.value}
                    onChange={() => setSelectedReason(r.value)}
                    className="mt-0.5 w-4 h-4 text-red-600 focus:ring-red-500"
                  />
                  <div>
                    <span className="block text-sm font-medium text-gray-900 dark:text-white">
                      {r.label}
                    </span>
                    <span className="block text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                      {r.description}
                    </span>
                  </div>
                </label>
              ))}
            </div>

            {/* Detail Input (for 'other' reason) */}
            {selectedReason === 'other' && (
              <div className="space-y-2">
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                  상세 사유 (선택)
                </label>
                <textarea
                  value={reasonDetail}
                  onChange={(e) => setReasonDetail(e.target.value)}
                  placeholder="구체적인 피드백을 입력해주세요..."
                  className={cn(
                    'w-full px-4 py-3 rounded-lg border border-gray-200 dark:border-gray-700',
                    'bg-white dark:bg-gray-900 text-gray-900 dark:text-white',
                    'placeholder:text-gray-400 dark:placeholder:text-gray-500',
                    'focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-transparent',
                    'resize-none'
                  )}
                  rows={3}
                />
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="flex justify-end gap-3 px-6 py-4 border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/50">
            <button
              type="button"
              onClick={handleClose}
              disabled={isSubmitting}
              className={cn(
                'px-4 py-2 rounded-lg text-sm font-medium',
                'text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-800',
                'border border-gray-200 dark:border-gray-700',
                'hover:bg-gray-50 dark:hover:bg-gray-700',
                'disabled:opacity-50 disabled:cursor-not-allowed'
              )}
            >
              취소
            </button>
            <button
              type="submit"
              disabled={!selectedReason || isSubmitting}
              className={cn(
                'px-4 py-2 rounded-lg text-sm font-medium',
                'bg-red-500 text-white hover:bg-red-600',
                'disabled:opacity-50 disabled:cursor-not-allowed',
                'flex items-center gap-2'
              )}
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  제출 중...
                </>
              ) : (
                '피드백 제출'
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

export default FeedbackModal
