import { useState } from 'react'
import {
  Shield,
  Plus,
  Trash2,
  Edit2,
  Check,
  Rocket,
} from 'lucide-react'
import { cn } from '../../lib/utils'
import type { BranchProtectionRule } from '../../stores/git'

interface BranchProtectionSettingsProps {
  rules: BranchProtectionRule[]
  isLoading: boolean
  onCreateRule: (rule: Omit<BranchProtectionRule, 'id' | 'project_id' | 'created_at' | 'updated_at'>) => Promise<boolean>
  onUpdateRule: (ruleId: string, updates: Partial<BranchProtectionRule>) => Promise<boolean>
  onDeleteRule: (ruleId: string) => Promise<boolean>
  onRefresh: () => void
}

interface RuleFormData {
  branch_pattern: string
  require_approvals: number
  require_no_conflicts: boolean
  allowed_merge_roles: string[]
  allow_force_push: boolean
  allow_deletion: boolean
  auto_deploy: boolean
  deploy_workflow: string
  enabled: boolean
}

const defaultFormData: RuleFormData = {
  branch_pattern: '',
  require_approvals: 0,
  require_no_conflicts: true,
  allowed_merge_roles: ['owner', 'admin'],
  allow_force_push: false,
  allow_deletion: false,
  auto_deploy: false,
  deploy_workflow: '',
  enabled: true,
}

export function BranchProtectionSettings({
  rules,
  isLoading,
  onCreateRule,
  onUpdateRule,
  onDeleteRule,
  onRefresh,
}: BranchProtectionSettingsProps) {
  const [showCreate, setShowCreate] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [formData, setFormData] = useState<RuleFormData>(defaultFormData)

  const handleCreate = async () => {
    if (!formData.branch_pattern.trim()) return
    const success = await onCreateRule({
      ...formData,
      deploy_workflow: formData.deploy_workflow || null,
    })
    if (success) {
      setShowCreate(false)
      setFormData(defaultFormData)
    }
  }

  const handleEdit = (rule: BranchProtectionRule) => {
    setEditingId(rule.id)
    setFormData({
      branch_pattern: rule.branch_pattern,
      require_approvals: rule.require_approvals,
      require_no_conflicts: rule.require_no_conflicts,
      allowed_merge_roles: rule.allowed_merge_roles,
      allow_force_push: rule.allow_force_push,
      allow_deletion: rule.allow_deletion,
      auto_deploy: rule.auto_deploy,
      deploy_workflow: rule.deploy_workflow || '',
      enabled: rule.enabled,
    })
  }

  const handleSaveEdit = async () => {
    if (!editingId) return
    const success = await onUpdateRule(editingId, {
      ...formData,
      deploy_workflow: formData.deploy_workflow || null,
    })
    if (success) {
      setEditingId(null)
      setFormData(defaultFormData)
    }
  }

  const handleDelete = async (ruleId: string) => {
    if (confirm('이 보호 규칙을 삭제하시겠습니까?')) {
      await onDeleteRule(ruleId)
    }
  }

  const toggleRole = (role: string) => {
    setFormData(prev => ({
      ...prev,
      allowed_merge_roles: prev.allowed_merge_roles.includes(role)
        ? prev.allowed_merge_roles.filter(r => r !== role)
        : [...prev.allowed_merge_roles, role],
    }))
  }

  const RuleForm = ({ isEdit = false }: { isEdit?: boolean }) => (
    <div className="space-y-4 p-4 bg-gray-50 dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-700">
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            Branch Pattern *
          </label>
          <input
            type="text"
            value={formData.branch_pattern}
            onChange={e => setFormData(prev => ({ ...prev, branch_pattern: e.target.value }))}
            placeholder="main, release/*, feature/*"
            className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            Required Approvals
          </label>
          <input
            type="number"
            min={0}
            max={10}
            value={formData.require_approvals}
            onChange={e => setFormData(prev => ({ ...prev, require_approvals: parseInt(e.target.value) || 0 }))}
            className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
          />
        </div>
      </div>

      <div className="flex flex-wrap gap-3">
        <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
          <input
            type="checkbox"
            checked={formData.require_no_conflicts}
            onChange={e => setFormData(prev => ({ ...prev, require_no_conflicts: e.target.checked }))}
            className="rounded"
          />
          Require no conflicts
        </label>
        <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
          <input
            type="checkbox"
            checked={formData.allow_force_push}
            onChange={e => setFormData(prev => ({ ...prev, allow_force_push: e.target.checked }))}
            className="rounded"
          />
          Allow force push
        </label>
        <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
          <input
            type="checkbox"
            checked={formData.allow_deletion}
            onChange={e => setFormData(prev => ({ ...prev, allow_deletion: e.target.checked }))}
            className="rounded"
          />
          Allow deletion
        </label>
        <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
          <input
            type="checkbox"
            checked={formData.enabled}
            onChange={e => setFormData(prev => ({ ...prev, enabled: e.target.checked }))}
            className="rounded"
          />
          Enabled
        </label>
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
          Allowed Merge Roles
        </label>
        <div className="flex gap-2">
          {['owner', 'admin', 'manager', 'member', 'viewer'].map(role => (
            <button
              key={role}
              onClick={() => toggleRole(role)}
              className={cn(
                'px-3 py-1 text-xs font-medium rounded-full border transition-colors',
                formData.allowed_merge_roles.includes(role)
                  ? 'bg-primary-100 text-primary-700 border-primary-300 dark:bg-primary-900/30 dark:text-primary-400 dark:border-primary-700'
                  : 'bg-gray-100 text-gray-500 border-gray-300 dark:bg-gray-700 dark:text-gray-400 dark:border-gray-600'
              )}
            >
              {role}
            </button>
          ))}
        </div>
      </div>

      {/* Auto-Deploy Section */}
      <div className="border-t border-gray-200 dark:border-gray-700 pt-4">
        <div className="flex items-center gap-2 mb-3">
          <Rocket className="w-4 h-4 text-orange-500" />
          <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Auto-Deploy</span>
        </div>
        <div className="flex items-center gap-4">
          <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
            <input
              type="checkbox"
              checked={formData.auto_deploy}
              onChange={e => setFormData(prev => ({ ...prev, auto_deploy: e.target.checked }))}
              className="rounded"
            />
            Enable auto-deploy on merge
          </label>
          {formData.auto_deploy && (
            <input
              type="text"
              value={formData.deploy_workflow}
              onChange={e => setFormData(prev => ({ ...prev, deploy_workflow: e.target.value }))}
              placeholder="deploy-staging.yml"
              className="flex-1 px-3 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
            />
          )}
        </div>
      </div>

      <div className="flex justify-end gap-2 pt-2">
        <button
          onClick={() => {
            if (isEdit) {
              setEditingId(null)
            } else {
              setShowCreate(false)
            }
            setFormData(defaultFormData)
          }}
          className="px-3 py-1.5 text-sm text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg"
        >
          Cancel
        </button>
        <button
          onClick={isEdit ? handleSaveEdit : handleCreate}
          disabled={!formData.branch_pattern.trim() || isLoading}
          className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-white bg-primary-600 hover:bg-primary-700 disabled:opacity-50 rounded-lg"
        >
          <Check className="w-4 h-4" />
          {isEdit ? 'Save' : 'Create'}
        </button>
      </div>
    </div>
  )

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Shield className="w-5 h-5 text-yellow-500" />
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
            Branch Protection Rules
          </h3>
          <span className="text-sm text-gray-500">({rules.length})</span>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={onRefresh}
            disabled={isLoading}
            className="px-3 py-1.5 text-sm text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg"
          >
            Refresh
          </button>
          {!showCreate && (
            <button
              onClick={() => {
                setShowCreate(true)
                setEditingId(null)
                setFormData(defaultFormData)
              }}
              className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-white bg-primary-600 hover:bg-primary-700 rounded-lg"
            >
              <Plus className="w-4 h-4" />
              Add Rule
            </button>
          )}
        </div>
      </div>

      {/* Create Form */}
      {showCreate && <RuleForm />}

      {/* Rules List */}
      <div className="space-y-3">
        {rules.map(rule => (
          <div key={rule.id}>
            {editingId === rule.id ? (
              <RuleForm isEdit />
            ) : (
              <div
                className={cn(
                  'border rounded-lg p-4 transition-colors',
                  rule.enabled
                    ? 'bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700'
                    : 'bg-gray-50 dark:bg-gray-900 border-gray-200 dark:border-gray-700 opacity-60'
                )}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <Shield className={cn('w-5 h-5', rule.enabled ? 'text-yellow-500' : 'text-gray-400')} />
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-sm font-medium text-gray-900 dark:text-white">
                          {rule.branch_pattern}
                        </span>
                        {!rule.enabled && (
                          <span className="px-1.5 py-0.5 text-xs bg-gray-200 dark:bg-gray-700 text-gray-500 rounded">
                            Disabled
                          </span>
                        )}
                        {rule.auto_deploy && (
                          <span className="flex items-center gap-1 px-1.5 py-0.5 text-xs bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400 rounded">
                            <Rocket className="w-3 h-3" />
                            Auto-deploy
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-3 mt-1 text-xs text-gray-500 dark:text-gray-400">
                        {rule.require_approvals > 0 && (
                          <span>{rule.require_approvals} approval{rule.require_approvals > 1 ? 's' : ''} required</span>
                        )}
                        {rule.require_no_conflicts && <span>No conflicts required</span>}
                        <span>Roles: {rule.allowed_merge_roles.join(', ')}</span>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => handleEdit(rule)}
                      className="p-1.5 text-gray-400 hover:text-blue-500 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded transition-colors"
                      title="Edit"
                    >
                      <Edit2 className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => handleDelete(rule.id)}
                      className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded transition-colors"
                      title="Delete"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        ))}

        {rules.length === 0 && !showCreate && (
          <div className="text-center py-8 text-gray-500 dark:text-gray-400">
            <Shield className="w-10 h-10 mx-auto mb-3 opacity-30" />
            <p>No branch protection rules configured</p>
            <p className="text-sm mt-1">Default protection applies to main and master branches</p>
          </div>
        )}
      </div>
    </div>
  )
}
