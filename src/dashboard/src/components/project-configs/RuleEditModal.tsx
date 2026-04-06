import { memo, useState, useEffect } from 'react'
import { X, Loader2, ScrollText, Eye, Code } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useProjectConfigsStore } from '@/stores/projectConfigs'

const DEFAULT_RULE_TEMPLATE = `# Rule Name

Description of what this rule enforces.

## Guidelines

- Guideline 1
- Guideline 2

## Examples

Good:
\`\`\`
example
\`\`\`

Bad:
\`\`\`
counter-example
\`\`\`
`

export const RuleEditModal: React.FC = memo(() => {
  const {
    ruleModalMode,
    editingRule,
    selectedProject,
    ruleContent,
    isLoadingContent,
    savingRule,
    error,
    closeRuleModal,
    createRule,
    updateRule,
    createGlobalRule,
    updateGlobalRule,
    clearError,
  } = useProjectConfigsStore()

  const [ruleId, setRuleId] = useState('')
  const [content, setContent] = useState('')
  const [isGlobal, setIsGlobal] = useState(false)
  const [showPreview, setShowPreview] = useState(false)

  useEffect(() => {
    if (ruleModalMode === 'edit' && editingRule) {
      setRuleId(editingRule.rule_id)
      setIsGlobal(editingRule.is_global)
    } else if (ruleModalMode === 'create') {
      setRuleId('')
      setContent(DEFAULT_RULE_TEMPLATE)
      setIsGlobal(false)
    }
    setShowPreview(false)
    clearError()
  }, [ruleModalMode, editingRule, clearError])

  useEffect(() => {
    if (ruleModalMode === 'edit' && ruleContent) {
      setContent(ruleContent)
    }
  }, [ruleModalMode, ruleContent])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (ruleModalMode === 'create') {
      if (isGlobal) {
        await createGlobalRule(ruleId.trim(), content)
      } else if (selectedProject) {
        await createRule(selectedProject.project.project_id, ruleId.trim(), content)
      }
    } else if (ruleModalMode === 'edit' && editingRule) {
      if (editingRule.is_global) {
        await updateGlobalRule(editingRule.rule_id, content)
      } else if (selectedProject) {
        await updateRule(selectedProject.project.project_id, editingRule.rule_id, content)
      }
    }
  }

  if (!ruleModalMode) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div
        className="absolute inset-0 bg-black/50"
        onClick={closeRuleModal}
        role="presentation"
      />

      <div className="relative bg-white dark:bg-gray-800 rounded-lg shadow-xl w-full max-w-4xl mx-4 max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-gray-700">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center">
              <ScrollText className="w-4 h-4 text-amber-600 dark:text-amber-400" />
            </div>
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
              {ruleModalMode === 'create' ? 'Create Rule' : `Edit Rule: ${editingRule?.name}`}
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
                  ? 'bg-amber-100 dark:bg-amber-900/30 border-amber-300 dark:border-amber-700 text-amber-700 dark:text-amber-300'
                  : 'border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700'
              )}
            >
              {showPreview ? <Code className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              {showPreview ? 'Edit' : 'Preview'}
            </button>
            <button
              onClick={closeRuleModal}
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
            {ruleModalMode === 'create' && (
              <>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Rule ID *
                  </label>
                  <input
                    type="text"
                    value={ruleId}
                    onChange={(e) => setRuleId(e.target.value.toLowerCase().replace(/[^a-z0-9-_]/g, ''))}
                    placeholder="my-rule"
                    required
                    pattern="[a-z0-9-_]+"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-amber-500 dark:bg-gray-700 dark:border-gray-600 dark:text-white text-sm"
                  />
                  <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                    This will be the filename (without .md). Lowercase letters, numbers, hyphens, and underscores only.
                  </p>
                </div>

                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    id="isGlobal"
                    checked={isGlobal}
                    onChange={(e) => setIsGlobal(e.target.checked)}
                    className="w-4 h-4 text-amber-600 border-gray-300 rounded focus:ring-amber-500"
                  />
                  <label htmlFor="isGlobal" className="text-sm text-gray-700 dark:text-gray-300">
                    Create as global rule (in ~/.claude/rules/ directory)
                  </label>
                </div>
              </>
            )}

            {isLoadingContent ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="w-6 h-6 animate-spin text-amber-500" />
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
                  Rule Content *
                </label>
                <textarea
                  value={content}
                  onChange={(e) => setContent(e.target.value)}
                  required
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-amber-500 dark:bg-gray-700 dark:border-gray-600 dark:text-white text-sm min-h-[400px] resize-y"
                  placeholder="# Rule Name&#10;&#10;Description of what this rule enforces."
                />
                <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                  Write your rule in markdown format
                </p>
              </div>
            )}
          </div>

          {/* Actions */}
          <div className="flex justify-end gap-3 px-6 py-4 border-t border-gray-200 dark:border-gray-700">
            <button
              type="button"
              onClick={closeRuleModal}
              className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 dark:bg-gray-700 dark:text-gray-200 dark:border-gray-600 dark:hover:bg-gray-600"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={savingRule || isLoadingContent}
              className={cn(
                'flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-amber-600 rounded-lg hover:bg-amber-700 disabled:opacity-50 disabled:cursor-not-allowed'
              )}
            >
              {savingRule && <Loader2 className="w-4 h-4 animate-spin" />}
              {ruleModalMode === 'create' ? 'Create Rule' : 'Save Changes'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
})

RuleEditModal.displayName = 'RuleEditModal'
