import { useState, useEffect } from 'react'
import { X, Loader2, Terminal, Eye, Code } from 'lucide-react'
import { cn } from '../../lib/utils'
import { useProjectConfigsStore } from '../../stores/projectConfigs'

const DEFAULT_COMMAND_TEMPLATE = `---
description: Description of what this command does
---

# Command Title

Instructions for the command go here.

## Usage

Explain how to use this command.
`

export function CommandEditModal() {
  const {
    commandModalMode,
    editingCommand,
    selectedProject,
    commandContent,
    isLoadingContent,
    savingCommand,
    error,
    closeCommandModal,
    createCommand,
    updateCommand,
    clearError,
  } = useProjectConfigsStore()

  // Form state
  const [commandId, setCommandId] = useState('')
  const [content, setContent] = useState('')
  const [showPreview, setShowPreview] = useState(false)

  // Reset form when modal opens/closes
  useEffect(() => {
    if (commandModalMode === 'edit' && editingCommand) {
      setCommandId(editingCommand.command_id)
    } else if (commandModalMode === 'create') {
      setCommandId('')
      setContent(DEFAULT_COMMAND_TEMPLATE)
    }
    setShowPreview(false)
    clearError()
  }, [commandModalMode, editingCommand, clearError])

  // Update content when commandContent is loaded
  useEffect(() => {
    if (commandModalMode === 'edit' && commandContent) {
      setContent(commandContent)
    }
  }, [commandModalMode, commandContent])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!selectedProject) return

    if (commandModalMode === 'create') {
      await createCommand(selectedProject.project.project_id, commandId.trim(), content)
    } else if (commandModalMode === 'edit' && editingCommand) {
      await updateCommand(selectedProject.project.project_id, editingCommand.command_id, content)
    }
  }

  if (!commandModalMode) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/50" onClick={closeCommandModal} />

      {/* Modal */}
      <div className="relative bg-white dark:bg-gray-800 rounded-lg shadow-xl w-full max-w-4xl mx-4 max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-gray-700">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-teal-100 dark:bg-teal-900/30 flex items-center justify-center">
              <Terminal className="w-4 h-4 text-teal-600 dark:text-teal-400" />
            </div>
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
              {commandModalMode === 'create' ? 'Create Command' : `Edit Command: /${editingCommand?.command_id}`}
            </h3>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setShowPreview(!showPreview)}
              className={cn(
                'flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-lg border transition-colors',
                showPreview
                  ? 'bg-teal-100 dark:bg-teal-900/30 border-teal-300 dark:border-teal-700 text-teal-700 dark:text-teal-300'
                  : 'border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700'
              )}
            >
              {showPreview ? <Code className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              {showPreview ? 'Edit' : 'Preview'}
            </button>
            <button
              onClick={closeCommandModal}
              className="p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-700"
            >
              <X className="w-5 h-5 text-gray-500" />
            </button>
          </div>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="flex flex-col flex-1 overflow-hidden">
          {/* Error */}
          {error && (
            <div className="mx-6 mt-4 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700 dark:bg-red-900/20 dark:border-red-800 dark:text-red-400">
              {error}
            </div>
          )}

          <div className="p-6 flex-1 overflow-y-auto space-y-4">
            {/* Command ID (create only) */}
            {commandModalMode === 'create' && (
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Command ID *
                </label>
                <div className="flex items-center gap-2">
                  <span className="text-gray-500 dark:text-gray-400">/</span>
                  <input
                    type="text"
                    value={commandId}
                    onChange={(e) => setCommandId(e.target.value.toLowerCase().replace(/[^a-z0-9-_]/g, ''))}
                    placeholder="my-command"
                    required
                    pattern="[a-z0-9-_]+"
                    className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-teal-500 dark:bg-gray-700 dark:border-gray-600 dark:text-white text-sm"
                  />
                </div>
                <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                  This will be the filename. Lowercase letters, numbers, hyphens, and underscores only.
                </p>
              </div>
            )}

            {/* Content */}
            {isLoadingContent ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="w-6 h-6 animate-spin text-teal-500" />
                <span className="ml-2 text-gray-500">Loading content...</span>
              </div>
            ) : showPreview ? (
              <div className="border border-gray-200 dark:border-gray-700 rounded-lg bg-gray-50 dark:bg-gray-900 p-4 min-h-[400px] overflow-auto">
                <pre className="font-mono text-sm text-gray-700 dark:text-gray-300 whitespace-pre-wrap">
                  {content}
                </pre>
              </div>
            ) : (
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Command Content *
                </label>
                <textarea
                  value={content}
                  onChange={(e) => setContent(e.target.value)}
                  required
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-teal-500 dark:bg-gray-700 dark:border-gray-600 dark:text-white font-mono text-sm min-h-[400px] resize-y"
                  placeholder="---\ndescription: ...\nallowed-tools: Bash(git:*)\n---\n\n# Instructions..."
                />
                <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                  Use YAML frontmatter for metadata (description, allowed-tools, argument-hint)
                </p>
              </div>
            )}
          </div>

          {/* Actions */}
          <div className="flex justify-end gap-3 px-6 py-4 border-t border-gray-200 dark:border-gray-700">
            <button
              type="button"
              onClick={closeCommandModal}
              className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 dark:bg-gray-700 dark:text-gray-200 dark:border-gray-600 dark:hover:bg-gray-600"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={savingCommand || isLoadingContent}
              className={cn(
                'flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-teal-600 rounded-lg hover:bg-teal-700 disabled:opacity-50 disabled:cursor-not-allowed'
              )}
            >
              {savingCommand && <Loader2 className="w-4 h-4 animate-spin" />}
              {commandModalMode === 'create' ? 'Create Command' : 'Save Changes'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
