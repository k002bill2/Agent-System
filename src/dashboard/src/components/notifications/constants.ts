/**
 * Notification Rule Editor — 채널 아이콘·색상·라벨 상수.
 */

import { MessageSquare, MessageCircle, Mail, Webhook } from 'lucide-react'

import type { NotificationChannel, NotificationEventType, NotificationPriority } from './types'

export const CHANNEL_ICONS: Record<NotificationChannel, typeof MessageSquare> = {
  slack: MessageSquare,
  discord: MessageCircle,
  email: Mail,
  webhook: Webhook,
}

export const CHANNEL_COLORS: Record<NotificationChannel, string> = {
  slack: 'text-purple-500',
  discord: 'text-indigo-500',
  email: 'text-blue-500',
  webhook: 'text-green-500',
}

export const EVENT_LABELS: Record<NotificationEventType, string> = {
  task_completed: 'Task Completed',
  task_failed: 'Task Failed',
  approval_required: 'Approval Required',
  session_started: 'Session Started',
  session_ended: 'Session Ended',
  cost_threshold: 'Cost Threshold',
  error_occurred: 'Error Occurred',
  agent_blocked: 'Agent Blocked',
}

export const PRIORITY_COLORS: Record<NotificationPriority, string> = {
  low: 'bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300',
  medium: 'bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300',
  high: 'bg-orange-100 text-orange-700 dark:bg-orange-900 dark:text-orange-300',
  urgent: 'bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300',
}

