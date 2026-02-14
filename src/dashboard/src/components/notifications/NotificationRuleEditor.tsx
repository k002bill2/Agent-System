/**
 * Notification Rule Editor Component
 * Manages notification rules with channel configuration
 */

import { useState, useEffect } from 'react'
import {
  Bell,
  Plus,
  Trash2,
  Save,
  TestTube,
  Check,
  X,
  Slack,
  MessageCircle,
  Mail,
  Webhook,
  ChevronDown,
  ChevronUp,
  AlertCircle,
  Settings,
  FolderKanban,
  Pencil,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { getApiUrl } from '@/config/api'
import { useOrchestrationStore } from '@/stores/orchestration'

// ─────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────

type NotificationChannel = 'slack' | 'discord' | 'email' | 'webhook'

type NotificationEventType =
  | 'task_completed'
  | 'task_failed'
  | 'approval_required'
  | 'session_started'
  | 'session_ended'
  | 'cost_threshold'
  | 'error_occurred'
  | 'agent_blocked'

type NotificationPriority = 'low' | 'medium' | 'high' | 'urgent'

interface NotificationCondition {
  field: string
  operator: string
  value: string | number
}

interface NotificationRule {
  id: string
  name: string
  description: string
  enabled: boolean
  event_type: NotificationEventType
  conditions: NotificationCondition[]
  channels: NotificationChannel[]
  project_ids: string[]
  priority: NotificationPriority
  message_template: string | null
  created_at: string
  updated_at: string
}

interface ChannelConfigSummary {
  webhook_url?: string
  email_address?: string
  smtp_host?: string
  smtp_port?: number
  smtp_username?: string
  smtp_use_tls?: boolean
  smtp_password_set?: boolean
}

interface ChannelStatus {
  channel: NotificationChannel
  enabled: boolean
  configured: boolean
  rate_limit_per_hour: number
  sent_this_hour: number
  config_summary?: ChannelConfigSummary
}

interface NotificationRuleEditorProps {
  className?: string
}

// ─────────────────────────────────────────────────────────────
// Channel Icons
// ─────────────────────────────────────────────────────────────

const CHANNEL_ICONS: Record<NotificationChannel, typeof Slack> = {
  slack: Slack,
  discord: MessageCircle,
  email: Mail,
  webhook: Webhook,
}

const CHANNEL_COLORS: Record<NotificationChannel, string> = {
  slack: 'text-purple-500',
  discord: 'text-indigo-500',
  email: 'text-blue-500',
  webhook: 'text-green-500',
}

const EVENT_LABELS: Record<NotificationEventType, string> = {
  task_completed: 'Task Completed',
  task_failed: 'Task Failed',
  approval_required: 'Approval Required',
  session_started: 'Session Started',
  session_ended: 'Session Ended',
  cost_threshold: 'Cost Threshold',
  error_occurred: 'Error Occurred',
  agent_blocked: 'Agent Blocked',
}

const PRIORITY_COLORS: Record<NotificationPriority, string> = {
  low: 'bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300',
  medium: 'bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300',
  high: 'bg-orange-100 text-orange-700 dark:bg-orange-900 dark:text-orange-300',
  urgent: 'bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300',
}

// ─────────────────────────────────────────────────────────────
// API Calls
// ─────────────────────────────────────────────────────────────

async function fetchRules(): Promise<NotificationRule[]> {
  const res = await fetch(getApiUrl('/api/notifications/rules'))
  if (!res.ok) throw new Error('Failed to fetch rules')
  return res.json()
}

async function fetchChannels(): Promise<ChannelStatus[]> {
  const res = await fetch(getApiUrl('/api/notifications/channels'))
  if (!res.ok) throw new Error('Failed to fetch channels')
  const data = await res.json()
  return data.channels
}

async function createRule(rule: Partial<NotificationRule>): Promise<NotificationRule> {
  const res = await fetch(getApiUrl('/api/notifications/rules'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(rule),
  })
  if (!res.ok) throw new Error('Failed to create rule')
  return res.json()
}

async function updateRule(ruleId: string, data: Partial<NotificationRule>): Promise<NotificationRule> {
  const res = await fetch(`${getApiUrl('/api/notifications/rules')}/${ruleId}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  })
  if (!res.ok) throw new Error('Failed to update rule')
  return res.json()
}

async function deleteRule(ruleId: string): Promise<void> {
  const res = await fetch(`${getApiUrl('/api/notifications/rules')}/${ruleId}`, {
    method: 'DELETE',
  })
  if (!res.ok) throw new Error('Failed to delete rule')
}

async function toggleRule(ruleId: string): Promise<{ enabled: boolean }> {
  const res = await fetch(`${getApiUrl('/api/notifications/rules')}/${ruleId}/toggle`, {
    method: 'POST',
  })
  if (!res.ok) throw new Error('Failed to toggle rule')
  return res.json()
}

async function updateChannel(
  channel: NotificationChannel,
  data: {
    enabled?: boolean
    webhook_url?: string
    email_address?: string
    smtp_host?: string
    smtp_port?: number
    smtp_username?: string
    smtp_password?: string
    smtp_use_tls?: boolean
  }
): Promise<void> {
  const res = await fetch(`${getApiUrl('/api/notifications/channels')}/${channel}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  })
  if (!res.ok) throw new Error('Failed to update channel')
}

async function testChannel(channel: NotificationChannel): Promise<{ success: boolean; error?: string }> {
  const res = await fetch(`${getApiUrl('/api/notifications/channels')}/${channel}/test`, {
    method: 'POST',
  })
  return res.json()
}

// ─────────────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────────────

export function NotificationRuleEditor({ className }: NotificationRuleEditorProps) {
  const [rules, setRules] = useState<NotificationRule[]>([])
  const [channels, setChannels] = useState<ChannelStatus[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [showNewRule, setShowNewRule] = useState(false)
  const [expandedChannel, setExpandedChannel] = useState<NotificationChannel | null>(null)
  const [testResults, setTestResults] = useState<Record<NotificationChannel, string>>({} as Record<NotificationChannel, string>)

  // New rule form state
  const [newRule, setNewRule] = useState({
    name: '',
    description: '',
    event_type: 'task_completed' as NotificationEventType,
    channels: [] as NotificationChannel[],
    project_ids: [] as string[],
    priority: 'medium' as NotificationPriority,
  })

  // Edit rule state
  const [editingRuleId, setEditingRuleId] = useState<string | null>(null)
  const [editRule, setEditRule] = useState({
    name: '',
    description: '',
    event_type: 'task_completed' as NotificationEventType,
    channels: [] as NotificationChannel[],
    project_ids: [] as string[],
    priority: 'medium' as NotificationPriority,
  })

  const { projects, fetchProjects } = useOrchestrationStore()

  useEffect(() => {
    loadData()
    fetchProjects()
  }, [fetchProjects])

  const loadData = async () => {
    try {
      setLoading(true)
      const [rulesData, channelsData] = await Promise.all([
        fetchRules(),
        fetchChannels(),
      ])
      setRules(rulesData)
      setChannels(channelsData)
      setError(null)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setLoading(false)
    }
  }

  const handleCreateRule = async () => {
    if (!newRule.name || newRule.channels.length === 0) return

    try {
      const created = await createRule(newRule)
      setRules((prev) => [...prev, created])
      setShowNewRule(false)
      setNewRule({
        name: '',
        description: '',
        event_type: 'task_completed',
        channels: [],
        project_ids: [],
        priority: 'medium',
      })
    } catch (e) {
      setError((e as Error).message)
    }
  }

  const handleDeleteRule = async (ruleId: string) => {
    try {
      await deleteRule(ruleId)
      setRules((prev) => prev.filter((r) => r.id !== ruleId))
    } catch (e) {
      setError((e as Error).message)
    }
  }

  const handleToggleRule = async (ruleId: string) => {
    try {
      const result = await toggleRule(ruleId)
      setRules((prev) =>
        prev.map((r) => (r.id === ruleId ? { ...r, enabled: result.enabled } : r))
      )
    } catch (e) {
      setError((e as Error).message)
    }
  }

  const handleStartEdit = (rule: NotificationRule) => {
    setEditingRuleId(rule.id)
    setEditRule({
      name: rule.name,
      description: rule.description,
      event_type: rule.event_type,
      channels: [...rule.channels],
      project_ids: [...(rule.project_ids || [])],
      priority: rule.priority,
    })
    setShowNewRule(false)
  }

  const handleCancelEdit = () => {
    setEditingRuleId(null)
  }

  const handleSaveEdit = async () => {
    if (!editingRuleId || !editRule.name || editRule.channels.length === 0) return

    try {
      const updated = await updateRule(editingRuleId, editRule)
      setRules((prev) => prev.map((r) => (r.id === editingRuleId ? updated : r)))
      setEditingRuleId(null)
    } catch (e) {
      setError((e as Error).message)
    }
  }

  const handleTestChannel = async (channel: NotificationChannel) => {
    setTestResults((prev) => ({ ...prev, [channel]: 'testing...' }))
    try {
      const result = await testChannel(channel)
      setTestResults((prev) => ({
        ...prev,
        [channel]: result.success ? 'success' : `failed: ${result.error}`,
      }))
    } catch (e) {
      setTestResults((prev) => ({ ...prev, [channel]: `error: ${(e as Error).message}` }))
    }
  }

  if (loading) {
    return (
      <div className={cn('p-6', className)}>
        <div className="animate-pulse space-y-4">
          <div className="h-8 bg-gray-200 dark:bg-gray-700 rounded w-1/3" />
          <div className="h-32 bg-gray-200 dark:bg-gray-700 rounded" />
          <div className="h-32 bg-gray-200 dark:bg-gray-700 rounded" />
        </div>
      </div>
    )
  }

  return (
    <div className={cn('space-y-6', className)}>
      {/* Error Alert */}
      {error && (
        <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4 flex items-center gap-3">
          <AlertCircle className="w-5 h-5 text-red-500" />
          <span className="text-red-700 dark:text-red-300">{error}</span>
          <button onClick={() => setError(null)} className="ml-auto">
            <X className="w-4 h-4 text-red-500" />
          </button>
        </div>
      )}

      {/* Channel Configuration */}
      <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700">
        <div className="p-4 border-b border-gray-200 dark:border-gray-700">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white flex items-center gap-2">
            <Settings className="w-5 h-5" />
            Notification Channels
          </h2>
        </div>
        <div className="divide-y divide-gray-200 dark:divide-gray-700">
          {channels.map((ch) => {
            const Icon = CHANNEL_ICONS[ch.channel]
            const isExpanded = expandedChannel === ch.channel
            const testResult = testResults[ch.channel]

            return (
              <div key={ch.channel}>
                <div
                  className="p-4 flex items-center justify-between cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700/50"
                  onClick={() => setExpandedChannel(isExpanded ? null : ch.channel)}
                >
                  <div className="flex items-center gap-3 flex-1 min-w-0">
                    <Icon className={cn('w-5 h-5 flex-shrink-0', CHANNEL_COLORS[ch.channel])} />
                    <span className="font-medium text-gray-900 dark:text-white capitalize">
                      {ch.channel}
                    </span>
                    {ch.configured ? (
                      <span className="px-2 py-0.5 text-xs bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300 rounded flex-shrink-0">
                        Configured
                      </span>
                    ) : (
                      <span className="px-2 py-0.5 text-xs bg-yellow-100 text-yellow-700 dark:bg-yellow-900 dark:text-yellow-300 rounded flex-shrink-0">
                        Not Configured
                      </span>
                    )}
                    {/* Config Summary - 접힌 상태에서 표시 */}
                    {!isExpanded && ch.configured && ch.config_summary && (
                      <span className="text-xs text-gray-500 dark:text-gray-400 truncate ml-2">
                        {ch.channel === 'email' && ch.config_summary.email_address && (
                          <span>→ {ch.config_summary.email_address}</span>
                        )}
                        {ch.channel !== 'email' && ch.config_summary.webhook_url && (
                          <span>→ {ch.config_summary.webhook_url}</span>
                        )}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-4">
                    <span className="text-sm text-gray-500">
                      {ch.sent_this_hour}/{ch.rate_limit_per_hour} this hour
                    </span>
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        updateChannel(ch.channel, { enabled: !ch.enabled })
                        setChannels((prev) =>
                          prev.map((c) =>
                            c.channel === ch.channel ? { ...c, enabled: !c.enabled } : c
                          )
                        )
                      }}
                      className={cn(
                        'relative inline-flex h-6 w-11 items-center rounded-full transition-colors',
                        ch.enabled ? 'bg-blue-600' : 'bg-gray-300 dark:bg-gray-600'
                      )}
                    >
                      <span
                        className={cn(
                          'inline-block h-4 w-4 transform rounded-full bg-white transition-transform',
                          ch.enabled ? 'translate-x-6' : 'translate-x-1'
                        )}
                      />
                    </button>
                    {isExpanded ? (
                      <ChevronUp className="w-5 h-5 text-gray-400" />
                    ) : (
                      <ChevronDown className="w-5 h-5 text-gray-400" />
                    )}
                  </div>
                </div>
                {isExpanded && (
                  <div className="px-4 pb-4 bg-gray-50 dark:bg-gray-700/30">
                    <ChannelConfigForm
                      channel={ch.channel}
                      configSummary={ch.config_summary}
                      onTest={() => handleTestChannel(ch.channel)}
                      onSaveSuccess={async () => {
                        // 저장 성공 시 채널 목록 다시 로드하여 상태 반영
                        const channelsData = await fetchChannels()
                        setChannels(channelsData)
                      }}
                      testResult={testResult}
                    />
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </div>

      {/* Notification Rules */}
      <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700">
        <div className="p-4 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white flex items-center gap-2">
            <Bell className="w-5 h-5" />
            Notification Rules
          </h2>
          <button
            onClick={() => setShowNewRule(true)}
            className="flex items-center gap-2 px-3 py-1.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm"
          >
            <Plus className="w-4 h-4" />
            Add Rule
          </button>
        </div>

        {/* New Rule Form */}
        {showNewRule && (
          <div className="p-4 border-b border-gray-200 dark:border-gray-700 bg-blue-50 dark:bg-blue-900/20">
            <h3 className="font-medium text-gray-900 dark:text-white mb-4">New Rule</h3>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm text-gray-600 dark:text-gray-400 mb-1">
                  Rule Name
                </label>
                <input
                  type="text"
                  value={newRule.name}
                  onChange={(e) => setNewRule({ ...newRule, name: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                  placeholder="e.g., Alert on task failure"
                />
              </div>
              <div>
                <label className="block text-sm text-gray-600 dark:text-gray-400 mb-1">
                  Event Type
                </label>
                <select
                  value={newRule.event_type}
                  onChange={(e) =>
                    setNewRule({ ...newRule, event_type: e.target.value as NotificationEventType })
                  }
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                >
                  {Object.entries(EVENT_LABELS).map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm text-gray-600 dark:text-gray-400 mb-1">
                  Priority
                </label>
                <select
                  value={newRule.priority}
                  onChange={(e) =>
                    setNewRule({ ...newRule, priority: e.target.value as NotificationPriority })
                  }
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                >
                  <option value="low">Low</option>
                  <option value="medium">Medium</option>
                  <option value="high">High</option>
                  <option value="urgent">Urgent</option>
                </select>
              </div>
              <div>
                <label className="block text-sm text-gray-600 dark:text-gray-400 mb-1">
                  Channels
                </label>
                <div className="flex gap-2">
                  {(['slack', 'discord', 'email', 'webhook'] as NotificationChannel[]).map((ch) => {
                    const Icon = CHANNEL_ICONS[ch]
                    const isSelected = newRule.channels.includes(ch)
                    return (
                      <button
                        key={ch}
                        onClick={() =>
                          setNewRule({
                            ...newRule,
                            channels: isSelected
                              ? newRule.channels.filter((c) => c !== ch)
                              : [...newRule.channels, ch],
                          })
                        }
                        className={cn(
                          'p-2 rounded-lg border transition-colors',
                          isSelected
                            ? 'border-blue-500 bg-blue-100 dark:bg-blue-900'
                            : 'border-gray-300 dark:border-gray-600 hover:border-gray-400'
                        )}
                      >
                        <Icon className={cn('w-5 h-5', CHANNEL_COLORS[ch])} />
                      </button>
                    )
                  })}
                </div>
              </div>
            </div>
            <div className="mt-4">
              <label className="block text-sm text-gray-600 dark:text-gray-400 mb-1">
                Description
              </label>
              <input
                type="text"
                value={newRule.description}
                onChange={(e) => setNewRule({ ...newRule, description: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                placeholder="Optional description"
              />
            </div>

            {/* Target Projects */}
            <div className="mt-4">
              <label className="block text-sm text-gray-600 dark:text-gray-400 mb-2 flex items-center gap-1.5">
                <FolderKanban className="w-4 h-4" />
                Target Projects
              </label>
              <div className="space-y-2">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={newRule.project_ids.length === 0}
                    onChange={() => setNewRule({ ...newRule, project_ids: [] })}
                    className="rounded border-gray-300 dark:border-gray-600 text-blue-600"
                  />
                  <span className="text-sm text-gray-700 dark:text-gray-300">
                    All Projects (default)
                  </span>
                </label>
                {projects.length > 0 && (
                  <div className="ml-2 border-l-2 border-gray-200 dark:border-gray-600 pl-3 space-y-1.5">
                    {projects.map((project) => {
                      const isSelected = newRule.project_ids.includes(project.id)
                      return (
                        <label key={project.id} className="flex items-center gap-2 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => {
                              const updated = isSelected
                                ? newRule.project_ids.filter((id) => id !== project.id)
                                : [...newRule.project_ids, project.id]
                              setNewRule({ ...newRule, project_ids: updated })
                            }}
                            className="rounded border-gray-300 dark:border-gray-600 text-blue-600"
                          />
                          <span className="text-sm text-gray-700 dark:text-gray-300">
                            {project.name || project.id}
                          </span>
                        </label>
                      )
                    })}
                  </div>
                )}
                {projects.length === 0 && (
                  <p className="text-xs text-gray-500 dark:text-gray-400 ml-6">
                    No projects available. Rules will apply to all projects.
                  </p>
                )}
              </div>
            </div>

            <div className="mt-4 flex justify-end gap-2">
              <button
                onClick={() => setShowNewRule(false)}
                className="px-4 py-2 text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg"
              >
                Cancel
              </button>
              <button
                onClick={handleCreateRule}
                disabled={!newRule.name || newRule.channels.length === 0}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
              >
                <Save className="w-4 h-4" />
                Create Rule
              </button>
            </div>
          </div>
        )}

        {/* Rules List */}
        <div className="divide-y divide-gray-200 dark:divide-gray-700">
          {rules.length === 0 ? (
            <div className="p-8 text-center text-gray-500 dark:text-gray-400">
              <Bell className="w-12 h-12 mx-auto mb-4 opacity-50" />
              <p>No notification rules configured</p>
              <p className="text-sm">Create a rule to receive alerts for specific events</p>
            </div>
          ) : (
            rules.map((rule) =>
              editingRuleId === rule.id ? (
                /* Inline Edit Form */
                <div key={rule.id} className="p-4 border-b border-gray-200 dark:border-gray-700 bg-amber-50 dark:bg-amber-900/10">
                  <h3 className="font-medium text-gray-900 dark:text-white mb-4">Edit Rule</h3>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm text-gray-600 dark:text-gray-400 mb-1">Rule Name</label>
                      <input
                        type="text"
                        value={editRule.name}
                        onChange={(e) => setEditRule({ ...editRule, name: e.target.value })}
                        className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                      />
                    </div>
                    <div>
                      <label className="block text-sm text-gray-600 dark:text-gray-400 mb-1">Event Type</label>
                      <select
                        value={editRule.event_type}
                        onChange={(e) => setEditRule({ ...editRule, event_type: e.target.value as NotificationEventType })}
                        className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                      >
                        {Object.entries(EVENT_LABELS).map(([value, label]) => (
                          <option key={value} value={value}>{label}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="block text-sm text-gray-600 dark:text-gray-400 mb-1">Priority</label>
                      <select
                        value={editRule.priority}
                        onChange={(e) => setEditRule({ ...editRule, priority: e.target.value as NotificationPriority })}
                        className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                      >
                        <option value="low">Low</option>
                        <option value="medium">Medium</option>
                        <option value="high">High</option>
                        <option value="urgent">Urgent</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-sm text-gray-600 dark:text-gray-400 mb-1">Channels</label>
                      <div className="flex gap-2">
                        {(['slack', 'discord', 'email', 'webhook'] as NotificationChannel[]).map((ch) => {
                          const Icon = CHANNEL_ICONS[ch]
                          const isSelected = editRule.channels.includes(ch)
                          return (
                            <button
                              key={ch}
                              onClick={() =>
                                setEditRule({
                                  ...editRule,
                                  channels: isSelected
                                    ? editRule.channels.filter((c) => c !== ch)
                                    : [...editRule.channels, ch],
                                })
                              }
                              className={cn(
                                'p-2 rounded-lg border transition-colors',
                                isSelected
                                  ? 'border-blue-500 bg-blue-100 dark:bg-blue-900'
                                  : 'border-gray-300 dark:border-gray-600 hover:border-gray-400'
                              )}
                            >
                              <Icon className={cn('w-5 h-5', CHANNEL_COLORS[ch])} />
                            </button>
                          )
                        })}
                      </div>
                    </div>
                  </div>
                  <div className="mt-4">
                    <label className="block text-sm text-gray-600 dark:text-gray-400 mb-1">Description</label>
                    <input
                      type="text"
                      value={editRule.description}
                      onChange={(e) => setEditRule({ ...editRule, description: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                      placeholder="Optional description"
                    />
                  </div>

                  {/* Target Projects */}
                  <div className="mt-4">
                    <label className="block text-sm text-gray-600 dark:text-gray-400 mb-2 flex items-center gap-1.5">
                      <FolderKanban className="w-4 h-4" />
                      Target Projects
                    </label>
                    <div className="space-y-2">
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={editRule.project_ids.length === 0}
                          onChange={() => setEditRule({ ...editRule, project_ids: [] })}
                          className="rounded border-gray-300 dark:border-gray-600 text-blue-600"
                        />
                        <span className="text-sm text-gray-700 dark:text-gray-300">All Projects (default)</span>
                      </label>
                      {projects.length > 0 && (
                        <div className="ml-2 border-l-2 border-gray-200 dark:border-gray-600 pl-3 space-y-1.5">
                          {projects.map((project) => {
                            const isSelected = editRule.project_ids.includes(project.id)
                            return (
                              <label key={project.id} className="flex items-center gap-2 cursor-pointer">
                                <input
                                  type="checkbox"
                                  checked={isSelected}
                                  onChange={() => {
                                    const updated = isSelected
                                      ? editRule.project_ids.filter((id) => id !== project.id)
                                      : [...editRule.project_ids, project.id]
                                    setEditRule({ ...editRule, project_ids: updated })
                                  }}
                                  className="rounded border-gray-300 dark:border-gray-600 text-blue-600"
                                />
                                <span className="text-sm text-gray-700 dark:text-gray-300">
                                  {project.name || project.id}
                                </span>
                              </label>
                            )
                          })}
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="mt-4 flex justify-end gap-2">
                    <button
                      onClick={handleCancelEdit}
                      className="px-4 py-2 text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={handleSaveEdit}
                      disabled={!editRule.name || editRule.channels.length === 0}
                      className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                    >
                      <Save className="w-4 h-4" />
                      Save Changes
                    </button>
                  </div>
                </div>
              ) : (
                /* Normal Rule Display */
                <div
                  key={rule.id}
                  className={cn(
                    'p-4 flex items-center justify-between',
                    !rule.enabled && 'opacity-60'
                  )}
                >
                  <div className="flex-1">
                    <div className="flex items-center gap-3">
                      <span className="font-medium text-gray-900 dark:text-white">
                        {rule.name}
                      </span>
                      <span className={cn('px-2 py-0.5 text-xs rounded', PRIORITY_COLORS[rule.priority])}>
                        {rule.priority}
                      </span>
                      <span className="px-2 py-0.5 text-xs bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 rounded">
                        {EVENT_LABELS[rule.event_type]}
                      </span>
                    </div>
                    {rule.description && (
                      <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                        {rule.description}
                      </p>
                    )}
                    <div className="flex items-center gap-2 mt-2 flex-wrap">
                      {rule.channels.map((ch) => {
                        const Icon = CHANNEL_ICONS[ch]
                        return <Icon key={ch} className={cn('w-4 h-4', CHANNEL_COLORS[ch])} />
                      })}
                      <span className="text-gray-300 dark:text-gray-600">|</span>
                      {(!rule.project_ids || rule.project_ids.length === 0) ? (
                        <span className="px-1.5 py-0.5 text-xs bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400 rounded">
                          All Projects
                        </span>
                      ) : (
                        rule.project_ids.map((pid) => {
                          const project = projects.find((p) => p.id === pid)
                          return (
                            <span
                              key={pid}
                              className="px-1.5 py-0.5 text-xs bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 rounded"
                            >
                              {project?.name || pid}
                            </span>
                          )
                        })
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => handleToggleRule(rule.id)}
                      className={cn(
                        'relative inline-flex h-6 w-11 items-center rounded-full transition-colors',
                        rule.enabled ? 'bg-blue-600' : 'bg-gray-300 dark:bg-gray-600'
                      )}
                    >
                      <span
                        className={cn(
                          'inline-block h-4 w-4 transform rounded-full bg-white transition-transform',
                          rule.enabled ? 'translate-x-6' : 'translate-x-1'
                        )}
                      />
                    </button>
                    <button
                      onClick={() => handleStartEdit(rule)}
                      className="p-2 text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg"
                      title="Edit rule"
                    >
                      <Pencil className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => handleDeleteRule(rule.id)}
                      className="p-2 text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              )
            )
          )}
        </div>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────
// Channel Config Form
// ─────────────────────────────────────────────────────────────

interface ChannelConfigFormProps {
  channel: NotificationChannel
  configSummary?: ChannelConfigSummary
  onTest: () => void
  onSaveSuccess: () => void
  testResult?: string
}

function ChannelConfigForm({ channel, configSummary, onTest, onSaveSuccess, testResult }: ChannelConfigFormProps) {
  const [webhookUrl, setWebhookUrl] = useState('')
  const [emailAddress, setEmailAddress] = useState('')
  // SMTP settings
  const [smtpHost, setSmtpHost] = useState('smtp.gmail.com')
  const [smtpPort, setSmtpPort] = useState(587)
  const [smtpUsername, setSmtpUsername] = useState('')
  const [smtpPassword, setSmtpPassword] = useState('')
  const [smtpUseTls, setSmtpUseTls] = useState(true)
  const [saving, setSaving] = useState(false)

  // 저장된 설정값 로드
  useEffect(() => {
    if (configSummary) {
      if (configSummary.email_address) setEmailAddress(configSummary.email_address)
      if (configSummary.smtp_host) setSmtpHost(configSummary.smtp_host)
      if (configSummary.smtp_port) setSmtpPort(configSummary.smtp_port)
      if (configSummary.smtp_username) setSmtpUsername(configSummary.smtp_username)
      if (configSummary.smtp_use_tls !== undefined) setSmtpUseTls(configSummary.smtp_use_tls)
      // webhook_url은 마스킹되어 있으므로 placeholder로 표시 (실제 값은 수정 시 새로 입력)
    }
  }, [configSummary])

  const handleSave = async () => {
    setSaving(true)
    try {
      if (channel === 'email') {
        await updateChannel(channel, {
          email_address: emailAddress,
          smtp_host: smtpHost,
          smtp_port: smtpPort,
          smtp_username: smtpUsername,
          smtp_password: smtpPassword,
          smtp_use_tls: smtpUseTls,
        })
      } else {
        await updateChannel(channel, { webhook_url: webhookUrl })
      }
      // 저장 성공 시 부모 컴포넌트에 알림 → 채널 상태 다시 로드
      onSaveSuccess()
    } catch (e) {
      console.error(e)
    } finally {
      setSaving(false)
    }
  }

  const renderConfig = () => {
    switch (channel) {
      case 'slack':
        return (
          <div>
            <label className="block text-sm text-gray-600 dark:text-gray-400 mb-1">
              Slack Webhook URL
            </label>
            <input
              type="text"
              value={webhookUrl}
              onChange={(e) => setWebhookUrl(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
              placeholder={configSummary?.webhook_url || "https://hooks.slack.com/services/..."}
            />
            {configSummary?.webhook_url && !webhookUrl && (
              <p className="text-xs text-green-600 dark:text-green-400 mt-1">
                ✓ 저장됨: {configSummary.webhook_url} (수정하려면 새 URL 입력)
              </p>
            )}
            <p className="text-xs text-gray-500 mt-1">
              Create an incoming webhook in Slack workspace settings
            </p>
          </div>
        )
      case 'discord':
        return (
          <div>
            <label className="block text-sm text-gray-600 dark:text-gray-400 mb-1">
              Discord Webhook URL
            </label>
            <input
              type="text"
              value={webhookUrl}
              onChange={(e) => setWebhookUrl(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
              placeholder={configSummary?.webhook_url || "https://discord.com/api/webhooks/..."}
            />
            {configSummary?.webhook_url && !webhookUrl && (
              <p className="text-xs text-green-600 dark:text-green-400 mt-1">
                ✓ 저장됨: {configSummary.webhook_url} (수정하려면 새 URL 입력)
              </p>
            )}
            <p className="text-xs text-gray-500 mt-1">
              Create a webhook in Discord channel settings
            </p>
          </div>
        )
      case 'email':
        return (
          <div className="space-y-4">
            {/* Recipient Email */}
            <div>
              <label className="block text-sm text-gray-600 dark:text-gray-400 mb-1">
                Recipient Email Address
              </label>
              <input
                type="email"
                value={emailAddress}
                onChange={(e) => setEmailAddress(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
                placeholder="alerts@example.com"
              />
            </div>

            {/* SMTP Settings */}
            <div className="border-t border-gray-200 dark:border-gray-600 pt-4">
              <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">
                SMTP Settings (Gmail)
              </h4>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">
                    SMTP Host
                  </label>
                  <input
                    type="text"
                    value={smtpHost}
                    onChange={(e) => setSmtpHost(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-sm"
                    placeholder="smtp.gmail.com"
                  />
                </div>
                <div>
                  <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">
                    Port
                  </label>
                  <input
                    type="number"
                    value={smtpPort}
                    onChange={(e) => setSmtpPort(parseInt(e.target.value) || 587)}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-sm"
                    placeholder="587"
                  />
                </div>
                <div>
                  <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">
                    Username (Gmail address)
                  </label>
                  <input
                    type="email"
                    value={smtpUsername}
                    onChange={(e) => setSmtpUsername(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-sm"
                    placeholder="your-email@gmail.com"
                  />
                </div>
                <div>
                  <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">
                    App Password
                  </label>
                  <input
                    type="password"
                    value={smtpPassword}
                    onChange={(e) => setSmtpPassword(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-sm"
                    placeholder={configSummary?.smtp_password_set ? "••••••••(저장됨)" : "••••••••••••••••"}
                  />
                  {configSummary?.smtp_password_set && !smtpPassword && (
                    <p className="text-xs text-green-600 dark:text-green-400 mt-1">
                      ✓ 비밀번호 저장됨 (변경하려면 새 비밀번호 입력)
                    </p>
                  )}
                </div>
              </div>
              <div className="mt-3 flex items-center gap-2">
                <input
                  type="checkbox"
                  id="smtp-tls"
                  checked={smtpUseTls}
                  onChange={(e) => setSmtpUseTls(e.target.checked)}
                  className="rounded border-gray-300 dark:border-gray-600"
                />
                <label htmlFor="smtp-tls" className="text-sm text-gray-600 dark:text-gray-400">
                  Use TLS (recommended)
                </label>
              </div>
              <p className="text-xs text-gray-500 mt-3">
                💡 Gmail requires an <strong>App Password</strong>. Go to Google Account → Security → 2-Step Verification → App passwords
              </p>
            </div>
          </div>
        )
      case 'webhook':
        return (
          <div>
            <label className="block text-sm text-gray-600 dark:text-gray-400 mb-1">
              Webhook URL
            </label>
            <input
              type="text"
              value={webhookUrl}
              onChange={(e) => setWebhookUrl(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
              placeholder={configSummary?.webhook_url || "https://your-server.com/webhook"}
            />
            {configSummary?.webhook_url && !webhookUrl && (
              <p className="text-xs text-green-600 dark:text-green-400 mt-1">
                ✓ 저장됨: {configSummary.webhook_url} (수정하려면 새 URL 입력)
              </p>
            )}
            <p className="text-xs text-gray-500 mt-1">
              Your endpoint will receive JSON payloads via POST
            </p>
          </div>
        )
    }
  }

  return (
    <div className="pt-4 space-y-4">
      {renderConfig()}
      <div className="flex items-center gap-2">
        <button
          onClick={handleSave}
          disabled={saving}
          className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 flex items-center gap-2 text-sm"
        >
          <Save className="w-4 h-4" />
          {saving ? 'Saving...' : '1. Save'}
        </button>
        <button
          onClick={onTest}
          className="px-4 py-2 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center gap-2 text-sm"
        >
          <TestTube className="w-4 h-4" />
          2. Test
        </button>
        <span className="text-xs text-gray-500 dark:text-gray-400 ml-2">
          💡 Save 먼저, 그 다음 Test
        </span>
        {testResult && (
          <span
            className={cn(
              'text-sm',
              testResult === 'success'
                ? 'text-green-600'
                : testResult === 'testing...'
                ? 'text-blue-600'
                : 'text-red-600'
            )}
          >
            {testResult === 'success' && <Check className="w-4 h-4 inline mr-1" />}
            {testResult}
          </span>
        )}
      </div>
    </div>
  )
}

export default NotificationRuleEditor
