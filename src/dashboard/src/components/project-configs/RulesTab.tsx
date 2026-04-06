import { memo, useState, useEffect } from 'react'
import { cn } from '@/lib/utils'
import { ScrollText, Globe, ChevronRight, Plus, Pencil, Trash2, Copy, FileText, Clock } from 'lucide-react'
import { useProjectConfigsStore, RuleConfig } from '@/stores/projectConfigs'
import { RuleEditModal } from './RuleEditModal'
import { ConfirmDeleteModal } from './ConfirmDeleteModal'
import { CopyToProjectModal, CopyItemType } from './CopyToProjectModal'

const MEMORY_TYPE_COLORS: Record<string, string> = {
  global: 'bg-teal-100 text-teal-700 dark:bg-teal-900/30 dark:text-teal-400',
}

export const RulesTab: React.FC = memo(() => {
  const {
    selectedProject,
    isLoadingProject,
    openRuleModal,
    deleteRule,
    deleteGlobalRule,
    deletingRules,
    copyRule,
    ruleContent,
    isLoadingContent,
    fetchRuleContent,
    fetchGlobalRuleContent,
    globalConfigs,
    fetchGlobalConfigs,
  } = useProjectConfigsStore()
  const [expandedRule, setExpandedRule] = useState<string | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<RuleConfig | null>(null)
  const [copyTarget, setCopyTarget] = useState<RuleConfig | null>(null)

  useEffect(() => {
    if (!globalConfigs) {
      fetchGlobalConfigs()
    }
  }, [globalConfigs, fetchGlobalConfigs])

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
        Select a project to view rules
      </div>
    )
  }

  const { rules } = selectedProject
  const projectRules = rules.filter((r) => !r.is_global)
  const globalRules = globalConfigs?.rules ?? []

  const handleExpand = async (rule: RuleConfig) => {
    const key = rule.is_global ? `global-${rule.rule_id}` : rule.rule_id
    if (expandedRule === key) {
      setExpandedRule(null)
    } else {
      setExpandedRule(key)
      if (rule.is_global) {
        await fetchGlobalRuleContent(rule.rule_id)
      } else {
        await fetchRuleContent(rule.project_id, rule.rule_id)
      }
    }
  }

  const handleDelete = async () => {
    if (!deleteTarget) return
    if (deleteTarget.is_global) {
      await deleteGlobalRule(deleteTarget.rule_id)
    } else if (selectedProject) {
      await deleteRule(selectedProject.project.project_id, deleteTarget.rule_id)
    }
    setDeleteTarget(null)
  }

  const handleCopy = async (targetProjectId: string) => {
    if (!copyTarget || !selectedProject) return false
    const success = await copyRule(selectedProject.project.project_id, copyTarget.rule_id, targetProjectId)
    if (success) {
      setCopyTarget(null)
    }
    return success
  }

  const totalCount = projectRules.length + globalRules.length

  return (
    <>
      <div className="p-6 h-full overflow-y-auto">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white flex items-center gap-2">
            <ScrollText className="w-5 h-5 text-amber-500" />
            Rules ({totalCount})
          </h3>
          <button
            onClick={() => openRuleModal('create')}
            aria-label="Create new rule"
            className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-white bg-amber-600 rounded-lg hover:bg-amber-700"
          >
            <Plus className="w-4 h-4" />
            Create Rule
          </button>
        </div>

        {totalCount === 0 ? (
          <div className="text-center py-12 text-gray-500 dark:text-gray-400">
            <ScrollText className="w-12 h-12 mx-auto mb-3 opacity-50" />
            <p>No rules found in this project</p>
            <p className="text-sm mt-1">Click &quot;Create Rule&quot; to add one</p>
          </div>
        ) : (
          <div className="space-y-6">
            {/* Project Rules */}
            {projectRules.length > 0 && (
              <div>
                <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">
                  Project Rules ({projectRules.length})
                </h4>
                <div className="space-y-3">
                  {projectRules.map((rule) => (
                    <RuleCard
                      key={rule.rule_id}
                      rule={rule}
                      isExpanded={expandedRule === rule.rule_id}
                      isLoadingContent={isLoadingContent && expandedRule === rule.rule_id}
                      isDeleting={deletingRules.has(`${rule.project_id}:${rule.rule_id}`)}
                      content={expandedRule === rule.rule_id ? ruleContent : null}
                      onToggle={() => handleExpand(rule)}
                      onEdit={() => openRuleModal('edit', rule)}
                      onDelete={() => setDeleteTarget(rule)}
                      onCopy={() => setCopyTarget(rule)}
                    />
                  ))}
                </div>
              </div>
            )}

            {/* Global Rules */}
            {globalRules.length > 0 && (
              <div>
                <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-3 flex items-center gap-2">
                  <Globe className="w-4 h-4 text-teal-500" />
                  Global Rules ({globalRules.length})
                </h4>
                <div className="space-y-3">
                  {globalRules.map((rule) => (
                    <GlobalRuleCard
                      key={`global-${rule.rule_id}`}
                      rule={rule}
                      isExpanded={expandedRule === `global-${rule.rule_id}`}
                      isLoadingContent={isLoadingContent && expandedRule === `global-${rule.rule_id}`}
                      isDeleting={deletingRules.has(`global:${rule.rule_id}`)}
                      content={expandedRule === `global-${rule.rule_id}` ? ruleContent : null}
                      onToggle={() => handleExpand(rule)}
                      onEdit={() => openRuleModal('edit', rule)}
                      onDelete={() => setDeleteTarget(rule)}
                    />
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Modals */}
      <RuleEditModal />
      <ConfirmDeleteModal
        isOpen={deleteTarget !== null}
        title="Delete Rule"
        message={`Are you sure you want to delete this ${deleteTarget?.is_global ? 'global ' : ''}rule? This action cannot be undone.`}
        itemName={deleteTarget?.rule_id || ''}
        isDeleting={deleteTarget ? deletingRules.has(
          deleteTarget.is_global
            ? `global:${deleteTarget.rule_id}`
            : `${selectedProject?.project.project_id}:${deleteTarget.rule_id}`
        ) : false}
        onConfirm={handleDelete}
        onCancel={() => setDeleteTarget(null)}
      />
      <CopyToProjectModal
        isOpen={copyTarget !== null}
        items={copyTarget ? [{
          type: 'rule' as CopyItemType,
          id: copyTarget.rule_id,
          name: copyTarget.name,
          sourceProjectId: copyTarget.project_id,
        }] : []}
        onClose={() => setCopyTarget(null)}
        onCopy={handleCopy}
      />
    </>
  )
})

RulesTab.displayName = 'RulesTab'

// ---------- Sub-components ----------

interface RuleCardProps {
  rule: RuleConfig
  isExpanded: boolean
  isLoadingContent: boolean
  isDeleting: boolean
  content: string | null
  onToggle: () => void
  onEdit: () => void
  onDelete: () => void
  onCopy: () => void
}

const RuleCard: React.FC<RuleCardProps> = memo(({
  rule, isExpanded, isLoadingContent, isDeleting, content, onToggle, onEdit, onDelete, onCopy,
}) => {
  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden">
      <div className="p-4 flex items-start gap-4">
        <button
          onClick={onToggle}
          aria-label={`Toggle rule ${rule.name}`}
          className="p-2 bg-amber-100 dark:bg-amber-900/30 rounded-lg hover:bg-amber-200 dark:hover:bg-amber-900/50 transition-colors"
        >
          <ScrollText className="w-5 h-5 text-amber-600 dark:text-amber-400" />
        </button>
        <div className="flex-1 min-w-0 cursor-pointer" onClick={onToggle}>
          <div className="flex items-center gap-2">
            <h4 className="font-medium text-gray-900 dark:text-white">{rule.name}</h4>
          </div>
          {rule.description && (
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1 line-clamp-2">
              {rule.description}
            </p>
          )}
          <div className="flex items-center gap-3 mt-2 text-xs text-gray-500 dark:text-gray-400">
            {rule.file_path && (
              <span className="flex items-center gap-1">
                <FileText className="w-3 h-3" />
                {rule.file_path.split('/').pop()}
              </span>
            )}
            {rule.modified_at && (
              <span className="flex items-center gap-1">
                <Clock className="w-3 h-3" />
                {new Date(rule.modified_at).toLocaleDateString()}
              </span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={onCopy}
            aria-label="Copy rule to another project"
            className="p-2 rounded-lg text-gray-400 hover:text-green-600 hover:bg-green-100 dark:hover:bg-green-900/30 transition-colors"
            title="Copy to another project"
          >
            <Copy className="w-4 h-4" />
          </button>
          <button
            onClick={onEdit}
            aria-label="Edit rule"
            className="p-2 rounded-lg text-gray-400 hover:text-amber-600 hover:bg-amber-100 dark:hover:bg-amber-900/30 transition-colors"
            title="Edit rule"
          >
            <Pencil className="w-4 h-4" />
          </button>
          <button
            onClick={onDelete}
            disabled={isDeleting}
            aria-label="Delete rule"
            className={cn(
              'p-2 rounded-lg text-gray-400 hover:text-red-600 hover:bg-red-100 dark:hover:bg-red-900/30 transition-colors',
              isDeleting && 'opacity-50 cursor-not-allowed'
            )}
            title="Delete rule"
          >
            {isDeleting ? (
              <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
            ) : (
              <Trash2 className="w-4 h-4" />
            )}
          </button>
          <button onClick={onToggle} aria-label="Expand rule details" className="p-2">
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
            <pre className="p-4 text-sm text-gray-700 dark:text-gray-300 overflow-x-auto whitespace-pre-wrap">
              {content}
            </pre>
          ) : (
            <div className="p-4 text-center text-gray-500">No content available</div>
          )}
        </div>
      )}
    </div>
  )
})

RuleCard.displayName = 'RuleCard'

interface GlobalRuleCardProps {
  rule: RuleConfig
  isExpanded: boolean
  isLoadingContent: boolean
  isDeleting: boolean
  content: string | null
  onToggle: () => void
  onEdit: () => void
  onDelete: () => void
}

const GlobalRuleCard: React.FC<GlobalRuleCardProps> = memo(({
  rule, isExpanded, isLoadingContent, isDeleting, content, onToggle, onEdit, onDelete,
}) => {
  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden opacity-80">
      <div className="p-4 flex items-start gap-4">
        <button
          onClick={onToggle}
          aria-label={`Toggle global rule ${rule.name}`}
          className="p-2 rounded-lg transition-colors bg-teal-100 dark:bg-teal-900/30 hover:bg-teal-200 dark:hover:bg-teal-900/50"
        >
          <ScrollText className="w-5 h-5 text-teal-600 dark:text-teal-400" />
        </button>
        <div className="flex-1 min-w-0 cursor-pointer" onClick={onToggle}>
          <div className="flex items-center gap-2 flex-wrap">
            <h4 className="font-medium text-gray-900 dark:text-white">{rule.name}</h4>
            <span className={cn('text-xs px-1.5 py-0.5 rounded', MEMORY_TYPE_COLORS.global)}>
              global
            </span>
          </div>
          {rule.description && (
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1 line-clamp-2">{rule.description}</p>
          )}
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={onEdit}
            aria-label="Edit global rule"
            className="p-2 rounded-lg text-gray-400 hover:text-amber-600 hover:bg-amber-100 dark:hover:bg-amber-900/30 transition-colors"
            title="Edit rule"
          >
            <Pencil className="w-4 h-4" />
          </button>
          <button
            onClick={onDelete}
            disabled={isDeleting}
            aria-label="Delete global rule"
            className={cn(
              'p-2 rounded-lg text-gray-400 hover:text-red-600 hover:bg-red-100 dark:hover:bg-red-900/30 transition-colors',
              isDeleting && 'opacity-50 cursor-not-allowed'
            )}
            title="Delete rule"
          >
            {isDeleting ? (
              <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
            ) : (
              <Trash2 className="w-4 h-4" />
            )}
          </button>
          <button onClick={onToggle} aria-label="Expand global rule details" className="p-2">
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
            <pre className="p-4 text-sm text-gray-700 dark:text-gray-300 overflow-x-auto whitespace-pre-wrap">
              {content}
            </pre>
          ) : (
            <div className="p-4 text-center text-gray-500">No content available</div>
          )}
        </div>
      )}
    </div>
  )
})

GlobalRuleCard.displayName = 'GlobalRuleCard'
