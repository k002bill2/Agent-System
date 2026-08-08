/**
 * 채널별 설정 폼 — NotificationRuleEditor 내부 전용.
 *
 * index.ts 는 이 컴포넌트를 재노출하지 않는다
 * (claude-sessions/TranscriptViewer 선례).
 */

import { useState, useEffect } from 'react'
import { Save, TestTube, Check } from 'lucide-react'

import { cn } from '@/lib/utils'

import { updateChannel } from './api'
import type { ChannelConfigSummary, NotificationChannel } from './types'

// ─────────────────────────────────────────────────────────────
// Channel Config Form
// ─────────────────────────────────────────────────────────────

export interface ChannelConfigFormProps {
  channel: NotificationChannel
  configSummary?: ChannelConfigSummary
  onTest: () => void
  onSaveSuccess: () => void
  testResult?: string
}

export function ChannelConfigForm({ channel, configSummary, onTest, onSaveSuccess, testResult }: ChannelConfigFormProps) {
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
