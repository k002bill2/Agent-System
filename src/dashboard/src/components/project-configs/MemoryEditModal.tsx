import { memo, useState, useEffect } from 'react'
import { X, Loader2, Brain, Eye, Code } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useProjectConfigsStore } from '@/stores/projectConfigs'

const DEFAULT_MEMORY_TEMPLATE = `---
name: Memory Name
description: One-line description
type: user
---

Memory content here.
`

export const MemoryEditModal: React.FC = memo(() => {
  const {
    memoryModalMode,
    editingMemory,
    selectedProject,
    memoryContent,
    isLoadingContent,
    savingMemory,
    error,
    closeMemoryModal,
    createMemory,
    updateMemory,
    clearError,
  } = useProjectConfigsStore()

  const [memoryId, setMemoryId] = useState('')
  const [content, setContent] = useState('')
  const [showPreview, setShowPreview] = useState(false)

  useEffect(() => {
    if (memoryModalMode === 'edit' && editingMemory) {
      setMemoryId(editingMemory.memory_id)
    } else if (memoryModalMode === 'create') {
      setMemoryId('')
      setContent(DEFAULT_MEMORY_TEMPLATE)
    }
    setShowPreview(false)
    clearError()
  }, [memoryModalMode, editingMemory, clearError])

  useEffect(() => {
    if (memoryModalMode === 'edit' && memoryContent) {
      setContent(memoryContent)
    }
  }, [memoryModalMode, memoryContent])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!selectedProject) return

    if (memoryModalMode === 'create') {
      await createMemory(selectedProject.project.project_id, memoryId.trim(), content)
    } else if (memoryModalMode === 'edit' && editingMemory) {
      await updateMemory(selectedProject.project.project_id, editingMemory.memory_id, content)
    }
  }

  if (!memoryModalMode) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div
        className="absolute inset-0 bg-black/50"
        onClick={closeMemoryModal}
        role="presentation"
      />

      <div className="relative bg-white dark:bg-gray-800 rounded-lg shadow-xl w-full max-w-4xl mx-4 max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-gray-700">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-rose-100 dark:bg-rose-900/30 flex items-center justify-center">
              <Brain className="w-4 h-4 text-rose-600 dark:text-rose-400" />
            </div>
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
              {memoryModalMode === 'create' ? 'Create Memory' : `Edit Memory: ${editingMemory?.name}`}
            </h3>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setShowPreview(!showPreview)}
              aria-label={showPreview ? 'Switch to edit mode' : 'Switch to preview mode'}
              className={cn(
                'flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-lg border transition-colors',
                showPreview
                  ? 'bg-rose-100 dark:bg-rose-900/30 border-rose-300 dark:border-rose-700 text-rose-700 dark:text-rose-300'
                  : 'border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700'
              )}
            >
              {showPreview ? <Code className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              {showPreview ? 'Edit' : 'Preview'}
            </button>
            <button
              onClick={closeMemoryModal}
              aria-label="Close modal"
              className="p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-700"
            >
              <X className="w-5 h-5 text-gray-500" />
            </button>
          </div>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="flex flex-col flex-1 overflow-hidden">
          {error && (
            <div className="mx-6 mt-4 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700 dark:bg-red-900/20 dark:border-red-800 dark:text-red-400">
              {error}
            </div>
          )}

          <div className="p-6 flex-1 overflow-y-auto space-y-4">
            {memoryModalMode === 'create' && (
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Memory ID *
                </label>
                <input
                  type="text"
                  value={memoryId}
                  onChange={(e) => setMemoryId(e.target.value.toLowerCase().replace(/[^a-z0-9-_]/g, ''))}
                  placeholder="my-memory"
                  required
                  pattern="[a-z0-9-_]+"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-rose-500 focus:border-rose-500 dark:bg-gray-700 dark:border-gray-600 dark:text-white text-sm"
                />
                <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                  This will be the filename (without .md). Lowercase letters, numbers, hyphens, and underscores only.
                </p>
              </div>
            )}

            {isLoadingContent ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="w-6 h-6 animate-spin text-rose-500" />
                <span className="ml-2 text-gray-500">Loading content...</span>
              </div>
            ) : showPreview ? (
              <div className="border border-gray-200 dark:border-gray-700 rounded-lg bg-gray-50 dark:bg-gray-900 p-4 min-h-[400px] overflow-auto">
                <pre className="text-sm text-gray-700 dark:text-gray-300 whitespace-pre-wrap">
                  {content}
                </pre>
              </div>
            ) : (
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Memory Content *
                </label>
                <textarea
                  value={content}
                  onChange={(e) => setContent(e.target.value)}
                  required
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-rose-500 focus:border-rose-500 dark:bg-gray-700 dark:border-gray-600 dark:text-white text-sm min-h-[400px] resize-y"
                  placeholder="---&#10;name: Memory Name&#10;description: One-line description&#10;type: user&#10;---&#10;&#10;Memory content here."
                />
                <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                  Use YAML frontmatter for metadata (name, description, type: user|feedback|project|reference)
                </p>
              </div>
            )}
          </div>

          {/* Actions */}
          <div className="flex justify-end gap-3 px-6 py-4 border-t border-gray-200 dark:border-gray-700">
            <button
              type="button"
              onClick={closeMemoryModal}
              className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 dark:bg-gray-700 dark:text-gray-200 dark:border-gray-600 dark:hover:bg-gray-600"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={savingMemory || isLoadingContent}
              className={cn(
                'flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-rose-600 rounded-lg hover:bg-rose-700 disabled:opacity-50 disabled:cursor-not-allowed'
              )}
            >
              {savingMemory && <Loader2 className="w-4 h-4 animate-spin" />}
              {memoryModalMode === 'create' ? 'Create Memory' : 'Save Changes'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
})

MemoryEditModal.displayName = 'MemoryEditModal'
