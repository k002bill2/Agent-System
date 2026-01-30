import { useState, useEffect } from 'react'
import { X, FolderOpen, Copy, Check, AlertCircle } from 'lucide-react'
import { cn } from '../../lib/utils'
import { useProjectConfigsStore } from '../../stores/projectConfigs'

export type CopyItemType = 'skill' | 'agent' | 'mcp' | 'hook'

interface CopyItem {
  type: CopyItemType
  id: string
  name: string
  sourceProjectId: string
}

interface CopyToProjectModalProps {
  isOpen: boolean
  items: CopyItem[]
  onClose: () => void
  onCopy: (targetProjectId: string) => Promise<boolean>
}

export function CopyToProjectModal({
  isOpen,
  items,
  onClose,
  onCopy,
}: CopyToProjectModalProps) {
  const { projects } = useProjectConfigsStore()
  const [selectedTargetId, setSelectedTargetId] = useState<string | null>(null)
  const [isCopying, setIsCopying] = useState(false)
  const [copyResult, setCopyResult] = useState<'success' | 'error' | null>(null)

  // Filter out the source project from targets
  const sourceProjectId = items[0]?.sourceProjectId
  const availableTargets = projects.filter((p) => p.project_id !== sourceProjectId)

  useEffect(() => {
    if (isOpen) {
      setSelectedTargetId(null)
      setCopyResult(null)
    }
  }, [isOpen])

  if (!isOpen) return null

  const handleCopy = async () => {
    if (!selectedTargetId) return

    setIsCopying(true)
    setCopyResult(null)

    try {
      const success = await onCopy(selectedTargetId)
      setCopyResult(success ? 'success' : 'error')
      if (success) {
        setTimeout(() => {
          onClose()
        }, 1000)
      }
    } catch {
      setCopyResult('error')
    } finally {
      setIsCopying(false)
    }
  }

  const typeLabels: Record<CopyItemType, string> = {
    skill: 'Skill',
    agent: 'Agent',
    mcp: 'MCP Server',
    hook: 'Hook',
  }

  const typeColors: Record<CopyItemType, string> = {
    skill: 'text-purple-600 dark:text-purple-400',
    agent: 'text-blue-600 dark:text-blue-400',
    mcp: 'text-green-600 dark:text-green-400',
    hook: 'text-orange-600 dark:text-orange-400',
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />

      {/* Modal */}
      <div className="relative bg-white dark:bg-gray-800 rounded-xl shadow-xl w-full max-w-md mx-4 overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-gray-700">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white flex items-center gap-2">
            <Copy className="w-5 h-5" />
            Copy to Project
          </h2>
          <button
            onClick={onClose}
            className="p-1 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 rounded"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-4">
          {/* Items to copy */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Items to copy ({items.length})
            </label>
            <div className="space-y-2 max-h-32 overflow-y-auto">
              {items.map((item, index) => (
                <div
                  key={`${item.type}-${item.id}-${index}`}
                  className="flex items-center gap-2 text-sm px-3 py-2 bg-gray-50 dark:bg-gray-700/50 rounded-lg"
                >
                  <span className={cn('font-medium', typeColors[item.type])}>
                    {typeLabels[item.type]}:
                  </span>
                  <span className="text-gray-900 dark:text-white truncate">
                    {item.name}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Target project selection */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Select target project
            </label>
            {availableTargets.length === 0 ? (
              <div className="text-center py-6 text-gray-500 dark:text-gray-400">
                <FolderOpen className="w-8 h-8 mx-auto mb-2 opacity-50" />
                <p className="text-sm">No other projects available</p>
              </div>
            ) : (
              <div className="space-y-2 max-h-48 overflow-y-auto">
                {availableTargets.map((project) => (
                  <button
                    key={project.project_id}
                    onClick={() => setSelectedTargetId(project.project_id)}
                    className={cn(
                      'w-full flex items-center gap-3 px-3 py-2 rounded-lg border transition-colors text-left',
                      selectedTargetId === project.project_id
                        ? 'border-primary-500 bg-primary-50 dark:bg-primary-900/20'
                        : 'border-gray-200 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-700/50'
                    )}
                  >
                    <FolderOpen className="w-5 h-5 text-gray-400 flex-shrink-0" />
                    <div className="flex-1 min-w-0">
                      <div className="font-medium text-gray-900 dark:text-white truncate">
                        {project.project_name}
                      </div>
                      <div className="text-xs text-gray-500 dark:text-gray-400 flex gap-2">
                        <span>{project.skill_count} skills</span>
                        <span>{project.agent_count} agents</span>
                        <span>{project.mcp_server_count} MCP</span>
                      </div>
                    </div>
                    {selectedTargetId === project.project_id && (
                      <Check className="w-5 h-5 text-primary-500 flex-shrink-0" />
                    )}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Result message */}
          {copyResult && (
            <div
              className={cn(
                'flex items-center gap-2 px-3 py-2 rounded-lg text-sm',
                copyResult === 'success'
                  ? 'bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-400'
                  : 'bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400'
              )}
            >
              {copyResult === 'success' ? (
                <>
                  <Check className="w-4 h-4" />
                  Copied successfully!
                </>
              ) : (
                <>
                  <AlertCircle className="w-4 h-4" />
                  Failed to copy. Please try again.
                </>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleCopy}
            disabled={!selectedTargetId || isCopying || availableTargets.length === 0}
            className={cn(
              'flex items-center gap-2 px-4 py-2 text-sm font-medium text-white rounded-lg transition-colors',
              'bg-primary-600 hover:bg-primary-700',
              (!selectedTargetId || isCopying || availableTargets.length === 0) &&
                'opacity-50 cursor-not-allowed'
            )}
          >
            {isCopying ? (
              <>
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                Copying...
              </>
            ) : (
              <>
                <Copy className="w-4 h-4" />
                Copy
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  )
}
