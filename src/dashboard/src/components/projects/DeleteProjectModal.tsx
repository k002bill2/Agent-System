import { useState, useEffect } from 'react'
import { X, AlertTriangle, Loader2, Database, FolderOpen, FileText, CheckCircle } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Project } from '@/stores/projects'

interface DeletionPreview {
  project_id: string
  project_name: string
  project_path: string
  sessions_count: number
  tasks_count: number
  messages_count: number
  approvals_count: number
  feedbacks_count: number
  dataset_entries_count: number
  has_rag_index: boolean
  rag_chunks_count: number
  has_symlink: boolean
  source_files_preserved: boolean
}

interface DeleteProjectModalProps {
  project: Project
  onClose: () => void
  onConfirm: () => Promise<void>
  fetchPreview: (projectId: string) => Promise<DeletionPreview | null>
}

export function DeleteProjectModal({
  project,
  onClose,
  onConfirm,
  fetchPreview,
}: DeleteProjectModalProps) {
  const [preview, setPreview] = useState<DeletionPreview | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isDeleting, setIsDeleting] = useState(false)
  const [confirmName, setConfirmName] = useState('')
  const [error, setError] = useState<string | null>(null)

  const isConfirmValid = confirmName === project.name

  useEffect(() => {
    const loadPreview = async () => {
      setIsLoading(true)
      setError(null)
      try {
        const data = await fetchPreview(project.id)
        setPreview(data)
      } catch (err) {
        setError((err as Error).message)
      } finally {
        setIsLoading(false)
      }
    }
    loadPreview()
  }, [project.id, fetchPreview])

  const handleDelete = async () => {
    if (!isConfirmValid) return

    setIsDeleting(true)
    setError(null)
    try {
      await onConfirm()
      onClose()
    } catch (err) {
      setError((err as Error).message)
      setIsDeleting(false)
    }
  }

  const totalDbRecords =
    (preview?.sessions_count || 0) +
    (preview?.tasks_count || 0) +
    (preview?.messages_count || 0) +
    (preview?.approvals_count || 0) +
    (preview?.feedbacks_count || 0) +
    (preview?.dataset_entries_count || 0)

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/50"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="relative bg-white dark:bg-gray-800 rounded-lg shadow-xl w-full max-w-md mx-4 overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-gray-700">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-red-100 dark:bg-red-900/30 flex items-center justify-center">
              <AlertTriangle className="w-5 h-5 text-red-600 dark:text-red-400" />
            </div>
            <div>
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                Delete Project
              </h3>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                {project.name}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-700"
          >
            <X className="w-5 h-5 text-gray-500" />
          </button>
        </div>

        {/* Content */}
        <div className="px-6 py-4 space-y-4">
          {/* Loading */}
          {isLoading && (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
              <span className="ml-2 text-gray-500">Loading preview...</span>
            </div>
          )}

          {/* Error */}
          {error && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 dark:bg-red-900/20 dark:border-red-800 dark:text-red-400 text-sm">
              {error}
            </div>
          )}

          {/* Preview */}
          {!isLoading && preview && (
            <>
              {/* What will be deleted */}
              <div className="space-y-3">
                <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300">
                  The following will be deleted:
                </h4>

                <div className="space-y-2">
                  {/* DB Records */}
                  {totalDbRecords > 0 && (
                    <div className="flex items-center gap-3 p-3 bg-gray-50 dark:bg-gray-700/50 rounded-lg">
                      <Database className="w-5 h-5 text-blue-500" />
                      <div className="flex-1">
                        <p className="text-sm font-medium text-gray-900 dark:text-white">
                          Database Records
                        </p>
                        <p className="text-xs text-gray-500 dark:text-gray-400">
                          {preview.sessions_count} sessions, {preview.tasks_count} tasks, {preview.messages_count} messages
                        </p>
                      </div>
                      <span className="text-sm font-medium text-gray-600 dark:text-gray-300">
                        {totalDbRecords}
                      </span>
                    </div>
                  )}

                  {/* RAG Index */}
                  {preview.has_rag_index && (
                    <div className="flex items-center gap-3 p-3 bg-gray-50 dark:bg-gray-700/50 rounded-lg">
                      <FileText className="w-5 h-5 text-purple-500" />
                      <div className="flex-1">
                        <p className="text-sm font-medium text-gray-900 dark:text-white">
                          RAG Vector Index
                        </p>
                        <p className="text-xs text-gray-500 dark:text-gray-400">
                          Semantic search data
                        </p>
                      </div>
                      <span className="text-sm font-medium text-gray-600 dark:text-gray-300">
                        {preview.rag_chunks_count} chunks
                      </span>
                    </div>
                  )}

                  {/* Symlink */}
                  {preview.has_symlink && (
                    <div className="flex items-center gap-3 p-3 bg-gray-50 dark:bg-gray-700/50 rounded-lg">
                      <FolderOpen className="w-5 h-5 text-orange-500" />
                      <div className="flex-1">
                        <p className="text-sm font-medium text-gray-900 dark:text-white">
                          Project Link
                        </p>
                        <p className="text-xs text-gray-500 dark:text-gray-400">
                          Symlink in projects directory
                        </p>
                      </div>
                    </div>
                  )}

                  {/* Empty state */}
                  {totalDbRecords === 0 && !preview.has_rag_index && !preview.has_symlink && (
                    <div className="flex items-center gap-3 p-3 bg-gray-50 dark:bg-gray-700/50 rounded-lg">
                      <CheckCircle className="w-5 h-5 text-green-500" />
                      <p className="text-sm text-gray-600 dark:text-gray-300">
                        No associated data to delete
                      </p>
                    </div>
                  )}
                </div>
              </div>

              {/* Source files note */}
              <div className="flex items-start gap-2 p-3 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg">
                <CheckCircle className="w-5 h-5 text-green-600 dark:text-green-400 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm font-medium text-green-800 dark:text-green-300">
                    Source files will NOT be deleted
                  </p>
                  <p className="text-xs text-green-700 dark:text-green-400 mt-0.5">
                    Your code at <span className="font-mono">{preview.project_path}</span> will remain intact.
                  </p>
                </div>
              </div>

              {/* Confirm input */}
              <div className="space-y-2">
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                  Type <span className="font-mono text-red-600 dark:text-red-400">{project.name}</span> to confirm
                </label>
                <input
                  type="text"
                  value={confirmName}
                  onChange={(e) => setConfirmName(e.target.value)}
                  placeholder="Enter project name"
                  className={cn(
                    'w-full px-3 py-2 border rounded-lg text-sm',
                    'focus:ring-2 focus:ring-red-500 focus:border-red-500',
                    'dark:bg-gray-700 dark:border-gray-600 dark:text-white',
                    isConfirmValid && 'border-green-500 dark:border-green-500'
                  )}
                  autoFocus
                />
              </div>
            </>
          )}
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-3 px-6 py-4 border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50">
          <button
            onClick={onClose}
            disabled={isDeleting}
            className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 dark:bg-gray-700 dark:text-gray-200 dark:border-gray-600 dark:hover:bg-gray-600 disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={handleDelete}
            disabled={!isConfirmValid || isDeleting || isLoading}
            className={cn(
              'px-4 py-2 text-sm font-medium text-white rounded-lg',
              'bg-red-600 hover:bg-red-700',
              'disabled:opacity-50 disabled:cursor-not-allowed',
              'flex items-center gap-2'
            )}
          >
            {isDeleting && <Loader2 className="w-4 h-4 animate-spin" />}
            Delete Project
          </button>
        </div>
      </div>
    </div>
  )
}
