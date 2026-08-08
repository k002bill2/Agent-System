/**
 * 민감 파일 스테이징 확인 다이얼로그 — WorkingDirectory 내부 전용.
 */

import { ShieldAlert, AlertTriangle } from 'lucide-react'

export function SensitiveFilesDialog({
  dangers,
  warnings,
  onConfirm,
  onCancel,
}: {
  dangers: { path: string; reason: string }[]
  warnings: { path: string; reason: string }[]
  onConfirm: () => void
  onCancel: () => void
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-xl w-full max-w-md p-6">
        <div className="flex items-center gap-2 mb-4">
          <ShieldAlert className="w-6 h-6 text-red-500" />
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
            Sensitive Files Detected
          </h3>
        </div>

        {dangers.length > 0 && (
          <div className="mb-3">
            <p className="text-sm font-medium text-red-600 dark:text-red-400 mb-1">Dangerous files:</p>
            {dangers.map(({ path, reason }) => (
              <div key={path} className="flex items-center gap-2 text-xs text-red-500 ml-2 py-0.5">
                <ShieldAlert className="w-3 h-3" />
                <span className="">{path}</span>
                <span className="text-gray-400">- {reason}</span>
              </div>
            ))}
          </div>
        )}

        {warnings.length > 0 && (
          <div className="mb-3">
            <p className="text-sm font-medium text-yellow-600 dark:text-yellow-400 mb-1">Warning files:</p>
            {warnings.map(({ path, reason }) => (
              <div key={path} className="flex items-center gap-2 text-xs text-yellow-500 ml-2 py-0.5">
                <AlertTriangle className="w-3 h-3" />
                <span className="">{path}</span>
                <span className="text-gray-400">- {reason}</span>
              </div>
            ))}
          </div>
        )}

        <p className="text-sm text-gray-500 dark:text-gray-400 mt-4 mb-4">
          Are you sure you want to stage these files?
        </p>

        <div className="flex justify-end gap-3">
          <button
            onClick={onCancel}
            className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            className="px-4 py-2 text-sm font-medium text-white bg-red-600 hover:bg-red-700 rounded-lg transition-colors"
          >
            Stage Anyway
          </button>
        </div>
      </div>
    </div>
  )
}
