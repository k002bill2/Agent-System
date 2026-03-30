import { useState, useEffect } from 'react'
import { X, Loader2, Sparkles, Eye, Code } from 'lucide-react'
import { cn } from '../../lib/utils'
import { useProjectConfigsStore } from '../../stores/projectConfigs'

const DEFAULT_SKILL_TEMPLATE = `---
name: My Skill
description: Description of what this skill does
tools:
  - Read
  - Write
  - Bash
---

# My Skill

Instructions for the skill go here.

## Usage

Explain how to use this skill.
`

export function SkillEditModal() {
  const {
    skillModalMode,
    editingSkill,
    selectedProject,
    skillContent,
    isLoadingContent,
    savingSkill,
    error,
    closeSkillModal,
    createSkill,
    updateSkill,
    clearError,
  } = useProjectConfigsStore()

  // Form state
  const [skillId, setSkillId] = useState('')
  const [content, setContent] = useState('')
  const [showPreview, setShowPreview] = useState(false)

  // Reset form when modal opens/closes
  useEffect(() => {
    if (skillModalMode === 'edit' && editingSkill) {
      setSkillId(editingSkill.skill_id)
      // Content will be loaded via fetchSkillContent
    } else if (skillModalMode === 'create') {
      setSkillId('')
      setContent(DEFAULT_SKILL_TEMPLATE)
    }
    setShowPreview(false)
    clearError()
  }, [skillModalMode, editingSkill, clearError])

  // Update content when skillContent is loaded
  useEffect(() => {
    if (skillModalMode === 'edit' && skillContent) {
      setContent(skillContent)
    }
  }, [skillModalMode, skillContent])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!selectedProject) return

    if (skillModalMode === 'create') {
      await createSkill(selectedProject.project.project_id, skillId.trim(), content)
    } else if (skillModalMode === 'edit' && editingSkill) {
      await updateSkill(selectedProject.project.project_id, editingSkill.skill_id, content)
    }
  }

  if (!skillModalMode) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/50" onClick={closeSkillModal} />

      {/* Modal */}
      <div className="relative bg-white dark:bg-gray-800 rounded-lg shadow-xl w-full max-w-4xl mx-4 max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-gray-700">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-purple-100 dark:bg-purple-900/30 flex items-center justify-center">
              <Sparkles className="w-4 h-4 text-purple-600 dark:text-purple-400" />
            </div>
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
              {skillModalMode === 'create' ? 'Create Skill' : `Edit Skill: ${editingSkill?.name}`}
            </h3>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setShowPreview(!showPreview)}
              className={cn(
                'flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-lg border transition-colors',
                showPreview
                  ? 'bg-purple-100 dark:bg-purple-900/30 border-purple-300 dark:border-purple-700 text-purple-700 dark:text-purple-300'
                  : 'border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700'
              )}
            >
              {showPreview ? <Code className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              {showPreview ? 'Edit' : 'Preview'}
            </button>
            <button
              onClick={closeSkillModal}
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
            {/* Skill ID (create only) */}
            {skillModalMode === 'create' && (
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Skill ID *
                </label>
                <input
                  type="text"
                  value={skillId}
                  onChange={(e) => setSkillId(e.target.value.toLowerCase().replace(/[^a-z0-9-_]/g, ''))}
                  placeholder="my-skill"
                  required
                  pattern="[a-z0-9-_]+"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500 dark:bg-gray-700 dark:border-gray-600 dark:text-white text-sm"
                />
                <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                  This will be the directory name. Lowercase letters, numbers, hyphens, and underscores only.
                </p>
              </div>
            )}

            {/* Content */}
            {isLoadingContent ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="w-6 h-6 animate-spin text-purple-500" />
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
                  SKILL.md Content *
                </label>
                <textarea
                  value={content}
                  onChange={(e) => setContent(e.target.value)}
                  required
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500 dark:bg-gray-700 dark:border-gray-600 dark:text-white text-sm min-h-[400px] resize-y"
                  placeholder="---\nname: My Skill\ndescription: ...\n---\n\n# Instructions..."
                />
                <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                  Use YAML frontmatter for metadata (name, description, tools, model)
                </p>
              </div>
            )}
          </div>

          {/* Actions */}
          <div className="flex justify-end gap-3 px-6 py-4 border-t border-gray-200 dark:border-gray-700">
            <button
              type="button"
              onClick={closeSkillModal}
              className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 dark:bg-gray-700 dark:text-gray-200 dark:border-gray-600 dark:hover:bg-gray-600"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={savingSkill || isLoadingContent}
              className={cn(
                'flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-purple-600 rounded-lg hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed'
              )}
            >
              {savingSkill && <Loader2 className="w-4 h-4 animate-spin" />}
              {skillModalMode === 'create' ? 'Create Skill' : 'Save Changes'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
