import { useState } from 'react'
import { useOrchestrationStore, ApprovalRequest } from '../stores/orchestration'

interface ApprovalModalProps {
  approval: ApprovalRequest
  onClose: () => void
}

const riskColors: Record<string, string> = {
  low: 'bg-green-100 text-green-800',
  medium: 'bg-yellow-100 text-yellow-800',
  high: 'bg-orange-100 text-orange-800',
  critical: 'bg-red-100 text-red-800',
}

export function ApprovalModal({ approval, onClose }: ApprovalModalProps) {
  const approveOperation = useOrchestrationStore(s => s.approveOperation)
  const denyOperation = useOrchestrationStore(s => s.denyOperation)
  const [note, setNote] = useState('')
  const [isProcessing, setIsProcessing] = useState(false)

  const handleApprove = async () => {
    setIsProcessing(true)
    try {
      await approveOperation(approval.approval_id, note || undefined)
      onClose()
    } finally {
      setIsProcessing(false)
    }
  }

  const handleDeny = async () => {
    setIsProcessing(true)
    try {
      await denyOperation(approval.approval_id, note || 'Denied by user')
      onClose()
    } finally {
      setIsProcessing(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="w-full max-w-lg bg-white dark:bg-gray-800 rounded-lg shadow-xl overflow-hidden">
        {/* Header */}
        <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700 bg-orange-50 dark:bg-orange-900/20">
          <div className="flex items-center gap-3">
            <div className="flex-shrink-0">
              <svg
                className="w-6 h-6 text-orange-600"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
                />
              </svg>
            </div>
            <div>
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                Approval Required
              </h3>
              <p className="text-sm text-gray-600 dark:text-gray-400">
                A potentially dangerous operation needs your approval
              </p>
            </div>
          </div>
        </div>

        {/* Content */}
        <div className="px-6 py-4 space-y-4">
          {/* Risk Level */}
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-gray-500 dark:text-gray-400">
              Risk Level:
            </span>
            <span
              className={`px-2.5 py-0.5 rounded-full text-xs font-medium ${
                riskColors[approval.risk_level] || riskColors.medium
              }`}
            >
              {approval.risk_level.toUpperCase()}
            </span>
          </div>

          {/* Tool Info */}
          <div>
            <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Operation
            </h4>
            <div className="bg-gray-100 dark:bg-gray-700 rounded-md p-3">
              <code className="text-sm text-gray-800 dark:text-gray-200">
                {approval.tool_name}
              </code>
            </div>
          </div>

          {/* Arguments */}
          <div>
            <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Arguments
            </h4>
            <pre className="bg-gray-100 dark:bg-gray-700 rounded-md p-3 overflow-x-auto text-xs">
              <code className="text-gray-800 dark:text-gray-200">
                {JSON.stringify(approval.tool_args, null, 2)}
              </code>
            </pre>
          </div>

          {/* Risk Description */}
          <div>
            <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Risk Description
            </h4>
            <p className="text-sm text-gray-600 dark:text-gray-400">
              {approval.risk_description}
            </p>
          </div>

          {/* Note Input */}
          <div>
            <label
              htmlFor="note"
              className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1"
            >
              Note (optional)
            </label>
            <textarea
              id="note"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 dark:bg-gray-700 dark:text-white text-sm"
              placeholder="Add a note about your decision..."
              rows={2}
            />
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-gray-200 dark:border-gray-700 flex justify-end gap-3">
          <button
            onClick={handleDeny}
            disabled={isProcessing}
            className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-md hover:bg-gray-50 dark:hover:bg-gray-600 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500 disabled:opacity-50"
          >
            Deny
          </button>
          <button
            onClick={handleApprove}
            disabled={isProcessing}
            className="px-4 py-2 text-sm font-medium text-white bg-green-600 border border-transparent rounded-md hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500 disabled:opacity-50"
          >
            {isProcessing ? 'Processing...' : 'Approve'}
          </button>
        </div>
      </div>
    </div>
  )
}

export function ApprovalBanner() {
  const pendingApprovals = useOrchestrationStore(s => s.pendingApprovals)
  const [selectedApproval, setSelectedApproval] = useState<ApprovalRequest | null>(null)

  const pendingList = Object.values(pendingApprovals).filter(
    (a) => a.status === 'pending'
  )

  if (pendingList.length === 0) return null

  return (
    <>
      {/* Banner */}
      <div className="bg-orange-50 dark:bg-orange-900/20 border-b border-orange-200 dark:border-orange-800 px-4 py-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <svg
              className="w-5 h-5 text-orange-600"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
              />
            </svg>
            <span className="text-sm font-medium text-orange-800 dark:text-orange-200">
              {pendingList.length} approval{pendingList.length > 1 ? 's' : ''} required
            </span>
          </div>
          <button
            onClick={() => setSelectedApproval(pendingList[0])}
            className="text-sm font-medium text-orange-700 dark:text-orange-300 hover:text-orange-900 dark:hover:text-orange-100 underline"
          >
            Review
          </button>
        </div>
      </div>

      {/* Modal */}
      {selectedApproval && (
        <ApprovalModal
          approval={selectedApproval}
          onClose={() => setSelectedApproval(null)}
        />
      )}
    </>
  )
}
