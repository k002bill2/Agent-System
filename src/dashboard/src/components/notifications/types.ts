/**
 * Notification Rule Editor — 도메인 타입.
 */

export type NotificationChannel = 'slack' | 'discord' | 'email' | 'webhook'

export type NotificationEventType =
  | 'task_completed'
  | 'task_failed'
  | 'approval_required'
  | 'session_started'
  | 'session_ended'
  | 'cost_threshold'
  | 'error_occurred'
  | 'agent_blocked'

export type NotificationPriority = 'low' | 'medium' | 'high' | 'urgent'

export interface NotificationCondition {
  field: string
  operator: string
  value: string | number
}

export interface NotificationRule {
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

export interface ChannelConfigSummary {
  webhook_url?: string
  email_address?: string
  smtp_host?: string
  smtp_port?: number
  smtp_username?: string
  smtp_use_tls?: boolean
  smtp_password_set?: boolean
}

export interface ChannelStatus {
  channel: NotificationChannel
  enabled: boolean
  configured: boolean
  rate_limit_per_hour: number
  sent_this_hour: number
  config_summary?: ChannelConfigSummary
}

export interface NotificationRuleEditorProps {
  className?: string
}
