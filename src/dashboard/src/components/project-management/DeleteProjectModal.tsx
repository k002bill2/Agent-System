import { useEffect, useState } from 'react'
import { AlertTriangle, Check, FolderOpen, ShieldCheck, Users, X } from 'lucide-react'
import { cn } from '../../lib/utils'
import type { DBProject } from '../../stores/projectConfigs'

interface DeleteProjectModalProps {
  isOpen: boolean
  project: DBProject | null
  isDeleting: boolean
  onCancel: () => void
  onConfirm: () => Promise<void> | void
}

export function DeleteProjectModal({
  isOpen,
  project,
  isDeleting,
  onCancel,
  onConfirm,
}: DeleteProjectModalProps) {
  const [typed, setTyped] = useState('')

  useEffect(() => {
    if (isOpen) setTyped('')
  }, [isOpen, project?.id])

  if (!isOpen || !project) return null

  const matches = typed.trim() === project.name
  const canConfirm = matches && !isDeleting

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div
        className="absolute inset-0 bg-black/60"
        onClick={isDeleting ? undefined : onCancel}
        aria-hidden="true"
      />

      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="delete-project-title"
        className="relative bg-white dark:bg-gray-800 rounded-xl shadow-2xl w-full max-w-md mx-4 overflow-hidden"
      >
        <div className="flex items-start justify-between px-6 pt-5 pb-4">
          <div className="flex items-center gap-3">
            <div className="flex items-center justify-center w-10 h-10 rounded-full bg-red-100 dark:bg-red-900/30 shrink-0">
              <AlertTriangle className="w-5 h-5 text-red-600 dark:text-red-400" />
            </div>
            <div>
              <h2
                id="delete-project-title"
                className="text-lg font-semibold text-gray-900 dark:text-white"
              >
                Delete Project
              </h2>
              <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5 truncate max-w-[260px]">
                {project.name}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onCancel}
            disabled={isDeleting}
            aria-label="Close"
            className="p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 rounded disabled:opacity-50"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="px-6 pb-5 space-y-4">
          <div>
            <p className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              The following will be deleted:
            </p>
            <div className="space-y-2">
              <DeletedRow
                icon={<FolderOpen className="w-4 h-4 text-red-500" />}
                title="Project Registration"
                subtitle="Database row + settings"
              />
              <DeletedRow
                icon={<Users className="w-4 h-4 text-red-500" />}
                title="Member Access"
                subtitle="All project access grants"
              />
              <DeletedRow
                icon={<ShieldCheck className="w-4 h-4 text-red-500" />}
                title="Pending Invitations"
                subtitle="Unaccepted member invites"
              />
            </div>
          </div>

          <div className="flex items-start gap-2 px-3 py-2.5 rounded-lg bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800">
            <Check className="w-4 h-4 text-emerald-600 dark:text-emerald-400 mt-0.5 shrink-0" />
            <div className="text-sm">
              <p className="font-medium text-emerald-800 dark:text-emerald-300">
                Source files will NOT be deleted
              </p>
              {project.path && (
                <p className="text-emerald-700 dark:text-emerald-400 text-xs mt-0.5 break-all">
                  Your code at {project.path} will remain intact.
                </p>
              )}
            </div>
          </div>

          <div>
            <label
              htmlFor="delete-confirm-input"
              className="block text-sm text-gray-700 dark:text-gray-300 mb-1.5"
            >
              Type{' '}
              <span className="font-semibold text-red-600 dark:text-red-400">
                {project.name}
              </span>{' '}
              to confirm
            </label>
            <input
              id="delete-confirm-input"
              type="text"
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              placeholder="Enter project name"
              autoFocus
              disabled={isDeleting}
              className={cn(
                'w-full px-3 py-2 rounded-lg border bg-white dark:bg-gray-900 text-sm text-gray-900 dark:text-white',
                'focus:outline-none focus:ring-2 focus:ring-red-500/60',
                matches
                  ? 'border-red-500 dark:border-red-500'
                  : 'border-gray-300 dark:border-gray-600',
                'disabled:opacity-60',
              )}
            />
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 px-6 py-3 bg-gray-50 dark:bg-gray-900/50 border-t border-gray-200 dark:border-gray-700">
          <button
            type="button"
            onClick={onCancel}
            disabled={isDeleting}
            className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-200 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => canConfirm && onConfirm()}
            disabled={!canConfirm}
            className={cn(
              'px-4 py-2 text-sm font-medium text-white rounded-lg transition-colors',
              canConfirm
                ? 'bg-red-600 hover:bg-red-700'
                : 'bg-red-300 dark:bg-red-800/60 cursor-not-allowed',
            )}
          >
            {isDeleting ? 'Deleting...' : 'Delete Project'}
          </button>
        </div>
      </div>
    </div>
  )
}

interface DeletedRowProps {
  icon: React.ReactNode
  title: string
  subtitle: string
}

function DeletedRow({ icon, title, subtitle }: DeletedRowProps) {
  return (
    <div className="flex items-center gap-3 px-3 py-2 bg-gray-50 dark:bg-gray-700/40 rounded-lg">
      <div className="flex items-center justify-center w-8 h-8 rounded-md bg-white dark:bg-gray-800 shrink-0">
        {icon}
      </div>
      <div className="min-w-0">
        <p className="text-sm font-medium text-gray-900 dark:text-white truncate">
          {title}
        </p>
        <p className="text-xs text-gray-500 dark:text-gray-400 truncate">{subtitle}</p>
      </div>
    </div>
  )
}
