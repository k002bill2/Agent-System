import { Task } from '../stores/orchestration'
import { AlertTriangle, Trash2, Loader2, XCircle } from 'lucide-react'

interface DeleteTaskDialogProps {
  isOpen: boolean
  onClose: () => void
  onConfirm: () => void
  task: Task | null
  deletionInfo: {
    childrenCount?: number
    inProgressCount?: number
    inProgressIds?: string[]
    canDelete?: boolean
  } | null
  isDeleting: boolean
  error: string | null
}

export function DeleteTaskDialog({
  isOpen,
  onClose,
  onConfirm,
  task,
  deletionInfo,
  isDeleting,
  error,
}: DeleteTaskDialogProps) {
  if (!isOpen || !task) return null

  const hasInProgressChildren = (deletionInfo?.inProgressCount ?? 0) > 0
  const childrenCount = deletionInfo?.childrenCount ?? 0
  const canDelete = deletionInfo?.canDelete ?? true

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="w-full max-w-md bg-white dark:bg-gray-800 rounded-lg shadow-xl overflow-hidden">
        {/* Header */}
        <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700 bg-red-50 dark:bg-red-900/20">
          <div className="flex items-center gap-3">
            <div className="flex-shrink-0 p-2 bg-red-100 dark:bg-red-900/30 rounded-full">
              <Trash2 className="w-5 h-5 text-red-600 dark:text-red-400" />
            </div>
            <div>
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                Delete Task
              </h3>
              <p className="text-sm text-gray-600 dark:text-gray-400">
                This action cannot be undone
              </p>
            </div>
          </div>
        </div>

        {/* Content */}
        <div className="px-6 py-4 space-y-4">
          {/* Task Info */}
          <div>
            <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Task to delete
            </h4>
            <div className="bg-gray-100 dark:bg-gray-700 rounded-md p-3">
              <p className="text-sm font-medium text-gray-900 dark:text-white">
                {task.title}
              </p>
              {task.description && (
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1 line-clamp-2">
                  {task.description}
                </p>
              )}
            </div>
          </div>

          {/* Children Warning */}
          {childrenCount > 0 && (
            <div className="flex items-start gap-2 p-3 bg-yellow-50 dark:bg-yellow-900/20 rounded-md">
              <AlertTriangle className="w-5 h-5 text-yellow-600 dark:text-yellow-400 flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-medium text-yellow-800 dark:text-yellow-200">
                  This task has {childrenCount} child task{childrenCount > 1 ? 's' : ''}
                </p>
                <p className="text-xs text-yellow-700 dark:text-yellow-300 mt-0.5">
                  All child tasks will also be deleted
                </p>
              </div>
            </div>
          )}

          {/* In-Progress Blocking */}
          {hasInProgressChildren && (
            <div className="flex items-start gap-2 p-3 bg-red-50 dark:bg-red-900/20 rounded-md border border-red-200 dark:border-red-800">
              <XCircle className="w-5 h-5 text-red-600 dark:text-red-400 flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-medium text-red-800 dark:text-red-200">
                  Cannot delete: {deletionInfo?.inProgressCount} task{(deletionInfo?.inProgressCount ?? 0) > 1 ? 's are' : ' is'} in progress
                </p>
                <p className="text-xs text-red-700 dark:text-red-300 mt-0.5">
                  Cancel the in-progress task{(deletionInfo?.inProgressCount ?? 0) > 1 ? 's' : ''} first before deleting
                </p>
              </div>
            </div>
          )}

          {/* Error Message */}
          {error && (
            <div className="p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-md">
              <p className="text-sm text-red-700 dark:text-red-300">{error}</p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-gray-200 dark:border-gray-700 flex justify-end gap-3">
          <button
            onClick={onClose}
            disabled={isDeleting}
            className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-md hover:bg-gray-50 dark:hover:bg-gray-600 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-gray-500 disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            disabled={isDeleting || !canDelete}
            className="px-4 py-2 text-sm font-medium text-white bg-red-600 border border-transparent rounded-md hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
          >
            {isDeleting ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Deleting...
              </>
            ) : (
              <>
                <Trash2 className="w-4 h-4" />
                Delete{childrenCount > 0 ? ` (${childrenCount + 1} tasks)` : ''}
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  )
}
