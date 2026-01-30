import { cn } from '../../lib/utils'
import { Sparkles, FileText, Code, FolderOpen, ChevronRight, Plus, Pencil, Trash2, Copy } from 'lucide-react'
import { useState } from 'react'
import { useProjectConfigsStore, SkillConfig } from '../../stores/projectConfigs'
import { SkillEditModal } from './SkillEditModal'
import { ConfirmDeleteModal } from './ConfirmDeleteModal'
import { CopyToProjectModal, CopyItemType } from './CopyToProjectModal'

export function SkillsTab() {
  const {
    selectedProject,
    isLoadingProject,
    fetchSkillContent,
    skillContent,
    isLoadingContent,
    openSkillModal,
    deleteSkill,
    deletingSkills,
    copySkill,
  } = useProjectConfigsStore()
  const [expandedSkill, setExpandedSkill] = useState<string | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<SkillConfig | null>(null)
  const [copyTarget, setCopyTarget] = useState<SkillConfig | null>(null)

  if (isLoadingProject) {
    return (
      <div className="p-6 space-y-4">
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-24 bg-gray-100 dark:bg-gray-800 rounded-lg animate-pulse" />
        ))}
      </div>
    )
  }

  if (!selectedProject) {
    return (
      <div className="flex items-center justify-center h-full text-gray-500 dark:text-gray-400">
        Select a project to view skills
      </div>
    )
  }

  const { skills } = selectedProject

  const handleExpand = async (skill: SkillConfig) => {
    if (expandedSkill === skill.skill_id) {
      setExpandedSkill(null)
    } else {
      setExpandedSkill(skill.skill_id)
      await fetchSkillContent(skill.project_id, skill.skill_id)
    }
  }

  const handleDelete = async () => {
    if (!deleteTarget || !selectedProject) return
    await deleteSkill(selectedProject.project.project_id, deleteTarget.skill_id)
    setDeleteTarget(null)
  }

  const handleCopy = async (targetProjectId: string) => {
    if (!copyTarget || !selectedProject) return false
    const success = await copySkill(selectedProject.project.project_id, copyTarget.skill_id, targetProjectId)
    if (success) {
      setCopyTarget(null)
    }
    return success
  }

  return (
    <>
      <div className="p-6 h-full overflow-y-auto">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-purple-500" />
            Skills ({skills.length})
          </h3>
          <button
            onClick={() => openSkillModal('create')}
            className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-white bg-purple-600 rounded-lg hover:bg-purple-700"
          >
            <Plus className="w-4 h-4" />
            Create Skill
          </button>
        </div>

        {skills.length === 0 ? (
          <div className="text-center py-12 text-gray-500 dark:text-gray-400">
            <Sparkles className="w-12 h-12 mx-auto mb-3 opacity-50" />
            <p>No skills found in this project</p>
            <p className="text-sm mt-1">Click "Create Skill" to add one</p>
          </div>
        ) : (
          <div className="space-y-3">
            {skills.map((skill) => (
              <SkillCard
                key={skill.skill_id}
                skill={skill}
                isExpanded={expandedSkill === skill.skill_id}
                isLoadingContent={isLoadingContent && expandedSkill === skill.skill_id}
                isDeleting={deletingSkills.has(`${skill.project_id}:${skill.skill_id}`)}
                content={expandedSkill === skill.skill_id ? skillContent : null}
                onToggle={() => handleExpand(skill)}
                onEdit={() => openSkillModal('edit', skill)}
                onDelete={() => setDeleteTarget(skill)}
                onCopy={() => setCopyTarget(skill)}
              />
            ))}
          </div>
        )}
      </div>

      {/* Modals */}
      <SkillEditModal />
      <ConfirmDeleteModal
        isOpen={deleteTarget !== null}
        title="Delete Skill"
        message="Are you sure you want to delete this skill? This will remove the entire skill directory and cannot be undone."
        itemName={deleteTarget?.skill_id || ''}
        isDeleting={deleteTarget ? deletingSkills.has(`${selectedProject?.project.project_id}:${deleteTarget.skill_id}`) : false}
        onConfirm={handleDelete}
        onCancel={() => setDeleteTarget(null)}
      />
      <CopyToProjectModal
        isOpen={copyTarget !== null}
        items={copyTarget ? [{
          type: 'skill' as CopyItemType,
          id: copyTarget.skill_id,
          name: copyTarget.name,
          sourceProjectId: copyTarget.project_id,
        }] : []}
        onClose={() => setCopyTarget(null)}
        onCopy={handleCopy}
      />
    </>
  )
}

interface SkillCardProps {
  skill: SkillConfig
  isExpanded: boolean
  isLoadingContent: boolean
  isDeleting: boolean
  content: string | null
  onToggle: () => void
  onEdit: () => void
  onDelete: () => void
  onCopy: () => void
}

function SkillCard({ skill, isExpanded, isLoadingContent, isDeleting, content, onToggle, onEdit, onDelete, onCopy }: SkillCardProps) {
  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden">
      <div className="p-4 flex items-start gap-4">
        <button
          onClick={onToggle}
          className="p-2 bg-purple-100 dark:bg-purple-900/30 rounded-lg hover:bg-purple-200 dark:hover:bg-purple-900/50 transition-colors"
        >
          <Sparkles className="w-5 h-5 text-purple-600 dark:text-purple-400" />
        </button>
        <div className="flex-1 min-w-0 cursor-pointer" onClick={onToggle}>
          <div className="flex items-center gap-2">
            <h4 className="font-medium text-gray-900 dark:text-white">{skill.name}</h4>
            {skill.model && (
              <span className="text-xs px-1.5 py-0.5 bg-gray-100 dark:bg-gray-700 rounded text-gray-600 dark:text-gray-400">
                {skill.model}
              </span>
            )}
          </div>
          {skill.description && (
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1 line-clamp-2">
              {skill.description}
            </p>
          )}
          <div className="flex items-center gap-3 mt-2 text-xs text-gray-500 dark:text-gray-400">
            {skill.tools.length > 0 && (
              <span className="flex items-center gap-1">
                <Code className="w-3 h-3" />
                {skill.tools.length} tools
              </span>
            )}
            {skill.has_references && (
              <span className="flex items-center gap-1">
                <FileText className="w-3 h-3" />
                references
              </span>
            )}
            {skill.has_scripts && (
              <span className="flex items-center gap-1">
                <FolderOpen className="w-3 h-3" />
                scripts
              </span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={onCopy}
            className="p-2 rounded-lg text-gray-400 hover:text-green-600 hover:bg-green-100 dark:hover:bg-green-900/30 transition-colors"
            title="Copy to another project"
          >
            <Copy className="w-4 h-4" />
          </button>
          <button
            onClick={onEdit}
            className="p-2 rounded-lg text-gray-400 hover:text-purple-600 hover:bg-purple-100 dark:hover:bg-purple-900/30 transition-colors"
            title="Edit skill"
          >
            <Pencil className="w-4 h-4" />
          </button>
          <button
            onClick={onDelete}
            disabled={isDeleting}
            className={cn(
              'p-2 rounded-lg text-gray-400 hover:text-red-600 hover:bg-red-100 dark:hover:bg-red-900/30 transition-colors',
              isDeleting && 'opacity-50 cursor-not-allowed'
            )}
            title="Delete skill"
          >
            {isDeleting ? (
              <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
            ) : (
              <Trash2 className="w-4 h-4" />
            )}
          </button>
          <button onClick={onToggle} className="p-2">
            <ChevronRight
              className={cn(
                'w-5 h-5 text-gray-400 transition-transform',
                isExpanded && 'rotate-90'
              )}
            />
          </button>
        </div>
      </div>

      {isExpanded && (
        <div className="border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900">
          {isLoadingContent ? (
            <div className="p-4 text-center text-gray-500">Loading content...</div>
          ) : content ? (
            <pre className="p-4 text-sm text-gray-700 dark:text-gray-300 overflow-x-auto whitespace-pre-wrap font-mono">
              {content}
            </pre>
          ) : (
            <div className="p-4 text-center text-gray-500">No content available</div>
          )}
        </div>
      )}
    </div>
  )
}
