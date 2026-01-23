import { cn } from '../../lib/utils'
import { Sparkles, FileText, Code, FolderOpen, ChevronRight } from 'lucide-react'
import { useState } from 'react'
import { useProjectConfigsStore, SkillConfig } from '../../stores/projectConfigs'

export function SkillsTab() {
  const { selectedProject, isLoadingProject, fetchSkillContent, skillContent, isLoadingContent } =
    useProjectConfigsStore()
  const [expandedSkill, setExpandedSkill] = useState<string | null>(null)

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

  return (
    <div className="p-6 overflow-y-auto">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white flex items-center gap-2">
          <Sparkles className="w-5 h-5 text-purple-500" />
          Skills ({skills.length})
        </h3>
      </div>

      {skills.length === 0 ? (
        <div className="text-center py-12 text-gray-500 dark:text-gray-400">
          <Sparkles className="w-12 h-12 mx-auto mb-3 opacity-50" />
          <p>No skills found in this project</p>
          <p className="text-sm mt-1">
            Create a skill in .claude/skills/your-skill/SKILL.md
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {skills.map((skill) => (
            <SkillCard
              key={skill.skill_id}
              skill={skill}
              isExpanded={expandedSkill === skill.skill_id}
              isLoadingContent={isLoadingContent && expandedSkill === skill.skill_id}
              content={expandedSkill === skill.skill_id ? skillContent : null}
              onToggle={() => handleExpand(skill)}
            />
          ))}
        </div>
      )}
    </div>
  )
}

interface SkillCardProps {
  skill: SkillConfig
  isExpanded: boolean
  isLoadingContent: boolean
  content: string | null
  onToggle: () => void
}

function SkillCard({ skill, isExpanded, isLoadingContent, content, onToggle }: SkillCardProps) {
  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden">
      <button
        onClick={onToggle}
        className="w-full p-4 text-left flex items-start gap-4 hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors"
      >
        <div className="p-2 bg-purple-100 dark:bg-purple-900/30 rounded-lg">
          <Sparkles className="w-5 h-5 text-purple-600 dark:text-purple-400" />
        </div>
        <div className="flex-1 min-w-0">
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
        <ChevronRight
          className={cn(
            'w-5 h-5 text-gray-400 transition-transform',
            isExpanded && 'rotate-90'
          )}
        />
      </button>

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
