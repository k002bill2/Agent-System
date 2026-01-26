import { useState } from 'react'
import { useSettingsStore, getModelsForProvider, Theme, LLMProvider } from '../stores/settings'
import { useOrchestrationStore } from '../stores/orchestration'
import { notificationService } from '../services/notificationService'
import { cn } from '../lib/utils'
import {
  Settings,
  Server,
  Palette,
  Key,
  Cpu,
  CheckCircle,
  XCircle,
  RefreshCw,
  Bell,
  Volume2,
} from 'lucide-react'
import { LLMRouterSettings } from '../components/llm-router'

export function SettingsPage() {
  const {
    llmProvider,
    model,
    apiKey,
    backendUrl,
    theme,
    notifications,
    setLLMProvider,
    setModel,
    setApiKey,
    setBackendUrl,
    setTheme,
    setNotificationSetting,
  } = useSettingsStore()

  const { connected, connect, disconnect } = useOrchestrationStore()

  const [notificationPermission, setNotificationPermission] = useState(
    typeof Notification !== 'undefined' ? Notification.permission : 'default'
  )

  const handleRequestPermission = async () => {
    const granted = await notificationService.requestPermission()
    setNotificationPermission(granted ? 'granted' : 'denied')
  }

  const handleTestSound = () => {
    notificationService.playSound('approval')
  }

  const models = getModelsForProvider(llmProvider)

  const handleReconnect = () => {
    disconnect()
    setTimeout(() => connect(), 500)
  }

  return (
    <div className="flex-1 p-6 overflow-y-auto">
      <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-6 flex items-center gap-2">
        <Settings className="w-6 h-6" />
        Settings
      </h2>

      <div className="max-w-2xl space-y-6">
        {/* Connection Status */}
        <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4">
          <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-4 flex items-center gap-2">
            <Server className="w-5 h-5" />
            Connection
          </h3>
          <div className="space-y-4">
            {/* Status */}
            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-600 dark:text-gray-400">Status</span>
              <div className="flex items-center gap-2">
                {connected ? (
                  <>
                    <CheckCircle className="w-4 h-4 text-green-500" />
                    <span className="text-sm text-green-600 dark:text-green-400">Connected</span>
                  </>
                ) : (
                  <>
                    <XCircle className="w-4 h-4 text-red-500" />
                    <span className="text-sm text-red-600 dark:text-red-400">Disconnected</span>
                  </>
                )}
                <button
                  onClick={handleReconnect}
                  className="ml-2 p-1 hover:bg-gray-100 dark:hover:bg-gray-700 rounded transition-colors"
                  title="Reconnect"
                >
                  <RefreshCw className="w-4 h-4 text-gray-500" />
                </button>
              </div>
            </div>

            {/* Backend URL */}
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Backend URL
              </label>
              <input
                type="text"
                value={backendUrl}
                onChange={(e) => setBackendUrl(e.target.value)}
                className="w-full px-3 py-2 border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-900 text-gray-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
                placeholder="http://localhost:8000"
              />
            </div>
          </div>
        </div>

        {/* LLM Settings */}
        <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4">
          <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-4 flex items-center gap-2">
            <Cpu className="w-5 h-5" />
            LLM Configuration
          </h3>
          <div className="space-y-4">
            {/* Provider */}
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Provider
              </label>
              <div className="flex gap-2">
                {(['anthropic', 'openai', 'local'] as LLMProvider[]).map((provider) => (
                  <button
                    key={provider}
                    onClick={() => setLLMProvider(provider)}
                    className={cn(
                      'px-4 py-2 rounded-lg text-sm font-medium transition-colors',
                      llmProvider === provider
                        ? 'bg-primary-100 text-primary-700 dark:bg-primary-900/30 dark:text-primary-400'
                        : 'bg-gray-100 text-gray-600 hover:bg-gray-200 dark:bg-gray-700 dark:text-gray-400 dark:hover:bg-gray-600'
                    )}
                  >
                    {provider.charAt(0).toUpperCase() + provider.slice(1)}
                  </button>
                ))}
              </div>
            </div>

            {/* Model */}
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Model
              </label>
              <select
                value={model}
                onChange={(e) => setModel(e.target.value)}
                className="w-full px-3 py-2 border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-900 text-gray-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
              >
                {models.map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </select>
            </div>

            {/* API Key */}
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1 flex items-center gap-2">
                <Key className="w-4 h-4" />
                API Key
              </label>
              <input
                type="password"
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                className="w-full px-3 py-2 border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-900 text-gray-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
                placeholder="sk-..."
              />
              <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                API key is stored in memory only and not persisted
              </p>
            </div>
          </div>
        </div>

        {/* Theme */}
        <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4">
          <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-4 flex items-center gap-2">
            <Palette className="w-5 h-5" />
            Appearance
          </h3>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Theme
            </label>
            <div className="flex gap-2">
              {(['light', 'dark', 'system'] as Theme[]).map((t) => (
                <button
                  key={t}
                  onClick={() => setTheme(t)}
                  className={cn(
                    'px-4 py-2 rounded-lg text-sm font-medium transition-colors',
                    theme === t
                      ? 'bg-primary-100 text-primary-700 dark:bg-primary-900/30 dark:text-primary-400'
                      : 'bg-gray-100 text-gray-600 hover:bg-gray-200 dark:bg-gray-700 dark:text-gray-400 dark:hover:bg-gray-600'
                  )}
                >
                  {t.charAt(0).toUpperCase() + t.slice(1)}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* LLM Auto-Switch */}
        <LLMRouterSettings />

        {/* Notifications */}
        <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4">
          <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-4 flex items-center gap-2">
            <Bell className="w-5 h-5" />
            Notifications
          </h3>
          <div className="space-y-4">
            {/* Browser Notifications */}
            <div className="flex items-center justify-between">
              <div>
                <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
                  Browser Notifications
                </label>
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  Show desktop notifications for important events
                </p>
              </div>
              <div className="flex items-center gap-2">
                {notificationPermission !== 'granted' && notifications.browserNotifications && (
                  <button
                    onClick={handleRequestPermission}
                    className="px-2 py-1 text-xs bg-primary-100 text-primary-700 dark:bg-primary-900/30 dark:text-primary-400 rounded hover:bg-primary-200 dark:hover:bg-primary-900/50 transition-colors"
                  >
                    Enable
                  </button>
                )}
                <button
                  onClick={() => setNotificationSetting('browserNotifications', !notifications.browserNotifications)}
                  className={cn(
                    'relative inline-flex h-6 w-11 items-center rounded-full transition-colors',
                    notifications.browserNotifications ? 'bg-primary-600' : 'bg-gray-300 dark:bg-gray-600'
                  )}
                >
                  <span
                    className={cn(
                      'inline-block h-4 w-4 transform rounded-full bg-white transition-transform',
                      notifications.browserNotifications ? 'translate-x-6' : 'translate-x-1'
                    )}
                  />
                </button>
              </div>
            </div>

            {/* Sound Notifications */}
            <div className="flex items-center justify-between">
              <div>
                <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
                  Sound Notifications
                </label>
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  Play sounds for notification events
                </p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={handleTestSound}
                  className="px-2 py-1 text-xs bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-400 rounded hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
                >
                  Test
                </button>
                <button
                  onClick={() => setNotificationSetting('soundNotifications', !notifications.soundNotifications)}
                  className={cn(
                    'relative inline-flex h-6 w-11 items-center rounded-full transition-colors',
                    notifications.soundNotifications ? 'bg-primary-600' : 'bg-gray-300 dark:bg-gray-600'
                  )}
                >
                  <span
                    className={cn(
                      'inline-block h-4 w-4 transform rounded-full bg-white transition-transform',
                      notifications.soundNotifications ? 'translate-x-6' : 'translate-x-1'
                    )}
                  />
                </button>
              </div>
            </div>

            {/* Sound Volume */}
            {notifications.soundNotifications && (
              <div className="flex items-center gap-3">
                <Volume2 className="w-4 h-4 text-gray-500" />
                <input
                  type="range"
                  min="0"
                  max="100"
                  value={notifications.soundVolume}
                  onChange={(e) => setNotificationSetting('soundVolume', Number(e.target.value))}
                  className="flex-1 h-2 bg-gray-200 dark:bg-gray-700 rounded-lg appearance-none cursor-pointer accent-primary-600"
                />
                <span className="text-sm text-gray-500 w-8">{notifications.soundVolume}%</span>
              </div>
            )}

            {/* Divider */}
            <div className="border-t border-gray-200 dark:border-gray-700 pt-4">
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">
                Notify me about
              </label>
              <div className="space-y-3">
                {/* Approval Required */}
                <label className="flex items-center gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={notifications.notifyApprovalRequired}
                    onChange={(e) => setNotificationSetting('notifyApprovalRequired', e.target.checked)}
                    className="w-4 h-4 text-primary-600 bg-gray-100 border-gray-300 rounded focus:ring-primary-500 dark:bg-gray-700 dark:border-gray-600"
                  />
                  <div>
                    <span className="text-sm text-gray-700 dark:text-gray-300">Approval Required (HITL)</span>
                    <span className="ml-2 px-1.5 py-0.5 text-xs bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400 rounded">
                      Critical
                    </span>
                  </div>
                </label>

                {/* Task Failed */}
                <label className="flex items-center gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={notifications.notifyTaskFailed}
                    onChange={(e) => setNotificationSetting('notifyTaskFailed', e.target.checked)}
                    className="w-4 h-4 text-primary-600 bg-gray-100 border-gray-300 rounded focus:ring-primary-500 dark:bg-gray-700 dark:border-gray-600"
                  />
                  <span className="text-sm text-gray-700 dark:text-gray-300">Task Failed</span>
                </label>

                {/* Task Completed */}
                <label className="flex items-center gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={notifications.notifyTaskCompleted}
                    onChange={(e) => setNotificationSetting('notifyTaskCompleted', e.target.checked)}
                    className="w-4 h-4 text-primary-600 bg-gray-100 border-gray-300 rounded focus:ring-primary-500 dark:bg-gray-700 dark:border-gray-600"
                  />
                  <span className="text-sm text-gray-700 dark:text-gray-300">Task Completed</span>
                </label>

                {/* Connection Lost */}
                <label className="flex items-center gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={notifications.notifyConnectionLost}
                    onChange={(e) => setNotificationSetting('notifyConnectionLost', e.target.checked)}
                    className="w-4 h-4 text-primary-600 bg-gray-100 border-gray-300 rounded focus:ring-primary-500 dark:bg-gray-700 dark:border-gray-600"
                  />
                  <span className="text-sm text-gray-700 dark:text-gray-300">Connection Lost</span>
                </label>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
