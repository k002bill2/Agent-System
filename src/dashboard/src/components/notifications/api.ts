/**
 * Notification Rule Editor — API 호출 레이어.
 *
 * 메인 컴포넌트와 ChannelConfigForm 이 함께 쓴다.
 */

import { apiClient } from '@/services/apiClient'
import { ApiError } from '@/services/errors'

import type { ChannelStatus, NotificationChannel, NotificationRule } from './types'

export async function fetchRules(): Promise<NotificationRule[]> {
  return apiClient.get<NotificationRule[]>('/api/notifications/rules')
}

export async function fetchChannels(): Promise<ChannelStatus[]> {
  const data = await apiClient.get<{ channels: ChannelStatus[] }>('/api/notifications/channels')
  return data.channels
}

export async function createRule(rule: Partial<NotificationRule>): Promise<NotificationRule> {
  return apiClient.post<NotificationRule>('/api/notifications/rules', rule, { skipRetry: true })
}

export async function updateRule(ruleId: string, data: Partial<NotificationRule>): Promise<NotificationRule> {
  return apiClient.put<NotificationRule>(`/api/notifications/rules/${ruleId}`, data)
}

export async function deleteRule(ruleId: string): Promise<void> {
  await apiClient.delete(`/api/notifications/rules/${ruleId}`)
}

export async function toggleRule(ruleId: string): Promise<{ enabled: boolean }> {
  return apiClient.post<{ enabled: boolean }>(
    `/api/notifications/rules/${ruleId}/toggle`,
    undefined,
    { skipRetry: true }
  )
}

export async function updateChannel(
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
  await apiClient.put(`/api/notifications/channels/${channel}`, data)
}

export async function testChannel(channel: NotificationChannel): Promise<{ success: boolean; error?: string }> {
  try {
    return await apiClient.post<{ success: boolean; error?: string }>(
      `/api/notifications/channels/${channel}/test`,
      undefined,
      { skipRetry: true }
    )
  } catch (e) {
    // An HTTP error response still reports a failed test rather than throwing;
    // network/timeout errors (status 0) keep propagating to the caller.
    if (e instanceof ApiError && e.status !== 0) {
      return { success: false, error: e.message }
    }
    throw e
  }
}
