import { useState, useEffect } from 'react'
import { X, Loader2, Bot, Eye, Code } from 'lucide-react'
import { cn } from '../../lib/utils'
import { useProjectConfigsStore } from '../../stores/projectConfigs'

const DEFAULT_AGENT_TEMPLATE = `---
name: My Agent
description: Description of what this agent does
model: sonnet
tools:
  - Read
  - Grep
  - Glob
---

# My Agent

You are a specialized agent for...

## Capabilities

- Capability 1
- Capability 2

## Instructions

Follow these guidelines when executing tasks...
`

export function AgentEditModal() {
  const {
    agentModalMode,
    editingAgent,
    selectedProject,
    agentContent,
    isLoadingContent,
    savingAgent,
    error,
    closeAgentModal,
    createAgent,
    updateAgent,
    clearError,
  } = useProjectConfigsStore()

  // Form state
  const [agentId, setAgentId] = useState('')
  const [content, setContent] = useState('')
  const [isShared, setIsShared] = useState(false)
  const [showPreview, setShowPreview] = useState(false)

  // Reset form when modal opens/closes
  useEffect(() => {
    if (agentModalMode === 'edit' && editingAgent) {
      setAgentId(editingAgent.agent_id)
      setIsShared(editingAgent.is_shared)
      // Content will be loaded via fetchAgentContent
    } else if (agentModalMode === 'create') {
      setAgentId('')
      setContent(DEFAULT_AGENT_TEMPLATE)
      setIsShared(false)
    }
    setShowPreview(false)
    clearError()
  }, [agentModalMode, editingAgent, clearError])

  // Update content when agentContent is loaded
  useEffect(() => {
    if (agentModalMode === 'edit' && agentContent) {
      setContent(agentContent)
    }
  }, [agentModalMode, agentContent])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!selectedProject) return

    if (agentModalMode === 'create') {
      await createAgent(selectedProject.project.project_id, agentId.trim(), content, isShared)
    } else if (agentModalMode === 'edit' && editingAgent) {
      await updateAgent(selectedProject.project.project_id, editingAgent.agent_id, content)
    }
  }

  if (!agentModalMode) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/50" onClick={closeAgentModal} />

      {/* Modal */}
      <div className="relative bg-white dark:bg-gray-800 rounded-lg shadow-xl w-full max-w-4xl mx-4 max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-gray-700">
          <div className="flex items-center gap-3">
            <div className={cn(
              'w-8 h-8 rounded-lg flex items-center justify-center',
              editingAgent?.is_shared
                ? 'bg-yellow-100 dark:bg-yellow-900/30'
                : 'bg-blue-100 dark:bg-blue-900/30'
            )}>
              <Bot className={cn(
                'w-4 h-4',
                editingAgent?.is_shared
                  ? 'text-yellow-600 dark:text-yellow-400'
                  : 'text-blue-600 dark:text-blue-400'
              )} />
            </div>
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
              {agentModalMode === 'create' ? 'Create Agent' : `Edit Agent: ${editingAgent?.name}`}
            </h3>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setShowPreview(!showPreview)}
              className={cn(
                'flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-lg border transition-colors',
                showPreview
                  ? 'bg-blue-100 dark:bg-blue-900/30 border-blue-300 dark:border-blue-700 text-blue-700 dark:text-blue-300'
                  : 'border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700'
              )}
            >
              {showPreview ? <Code className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              {showPreview ? 'Edit' : 'Preview'}
            </button>
            <button
              onClick={closeAgentModal}
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
            {/* Agent ID (create only) */}
            {agentModalMode === 'create' && (
              <>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Agent ID *
                  </label>
                  <input
                    type="text"
                    value={agentId}
                    onChange={(e) => setAgentId(e.target.value.toLowerCase().replace(/[^a-z0-9-_]/g, ''))}
                    placeholder="my-agent"
                    required
                    pattern="[a-z0-9-_]+"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 dark:bg-gray-700 dark:border-gray-600 dark:text-white text-sm"
                  />
                  <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                    This will be the filename (without .md). Lowercase letters, numbers, hyphens, and underscores only.
                  </p>
                </div>

                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    id="isShared"
                    checked={isShared}
                    onChange={(e) => setIsShared(e.target.checked)}
                    className="w-4 h-4 text-yellow-600 border-gray-300 rounded focus:ring-yellow-500"
                  />
                  <label htmlFor="isShared" className="text-sm text-gray-700 dark:text-gray-300">
                    Create as shared agent (in agents/shared/ directory)
                  </label>
                </div>
              </>
            )}

            {/* Content */}
            {isLoadingContent ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="w-6 h-6 animate-spin text-blue-500" />
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
                  Agent Content *
                </label>
                <textarea
                  value={content}
                  onChange={(e) => setContent(e.target.value)}
                  required
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 dark:bg-gray-700 dark:border-gray-600 dark:text-white text-sm min-h-[400px] resize-y"
                  placeholder="---\nname: My Agent\ndescription: ...\nmodel: sonnet\n---\n\n# Instructions..."
                />
                <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                  Use YAML frontmatter for metadata (name, description, model, tools, role)
                </p>
              </div>
            )}
          </div>

          {/* Actions */}
          <div className="flex justify-end gap-3 px-6 py-4 border-t border-gray-200 dark:border-gray-700">
            <button
              type="button"
              onClick={closeAgentModal}
              className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 dark:bg-gray-700 dark:text-gray-200 dark:border-gray-600 dark:hover:bg-gray-600"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={savingAgent || isLoadingContent}
              className={cn(
                'flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed'
              )}
            >
              {savingAgent && <Loader2 className="w-4 h-4 animate-spin" />}
              {agentModalMode === 'create' ? 'Create Agent' : 'Save Changes'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
