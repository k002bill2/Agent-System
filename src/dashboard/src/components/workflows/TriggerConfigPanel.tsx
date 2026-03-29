import { useState } from 'react'
import { Calendar, Globe, GitBranch, GitPullRequest, Play, Copy, Check } from 'lucide-react'
import { CronBuilder } from './CronBuilder'

type TriggerTab = 'manual' | 'schedule' | 'webhook' | 'push' | 'pull_request'

interface TriggerConfigPanelProps {
  workflowId: string
  currentConfig?: Record<string, unknown>
  onSave?: (config: Record<string, unknown>) => void
}

export function TriggerConfigPanel({ workflowId: _workflowId, currentConfig: _currentConfig, onSave }: TriggerConfigPanelProps) {
  const [activeTab, setActiveTab] = useState<TriggerTab>('manual')
  const [cronExpression, setCronExpression] = useState('0 * * * *')
  const [timezone, setTimezone] = useState('UTC')
  const [branches, setBranches] = useState<string[]>(['main'])
  const [paths, setPaths] = useState<string[]>([])
  const [webhookUrl] = useState('')
  const [copied, setCopied] = useState(false)

  const tabs: { key: TriggerTab; label: string; icon: typeof Play }[] = [
    { key: 'manual', label: 'Manual', icon: Play },
    { key: 'schedule', label: 'Schedule', icon: Calendar },
    { key: 'webhook', label: 'Webhook', icon: Globe },
    { key: 'push', label: 'Push', icon: GitBranch },
    { key: 'pull_request', label: 'PR', icon: GitPullRequest },
  ]

  const handleCopyWebhook = async () => {
    if (webhookUrl) {
      await navigator.clipboard.writeText(webhookUrl)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }
  }

  const handleSave = () => {
    const config: Record<string, unknown> = {}
    if (activeTab === 'schedule') {
      config.schedule = [{ cron: cronExpression }]
    } else if (activeTab === 'push') {
      config.push = { branches, ...(paths.length > 0 ? { paths } : {}) }
    } else if (activeTab === 'pull_request') {
      config.pull_request = { branches, ...(paths.length > 0 ? { paths } : {}) }
    } else if (activeTab === 'webhook') {
      config.webhook = {}
    } else {
      config.manual = {}
    }
    onSave?.(config)
  }

  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700">
      {/* Tab header */}
      <div className="flex border-b border-gray-200 dark:border-gray-700 overflow-x-auto">
        {tabs.map(tab => {
          const Icon = tab.icon
          return (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`flex items-center gap-1.5 px-3 py-2 text-xs font-medium whitespace-nowrap border-b-2 transition-colors ${
                activeTab === tab.key
                  ? 'border-primary-500 text-primary-600 dark:text-primary-400'
                  : 'border-transparent text-gray-500 hover:text-gray-700 dark:hover:text-gray-300'
              }`}
            >
              <Icon className="w-3.5 h-3.5" />
              {tab.label}
            </button>
          )
        })}
      </div>

      {/* Tab content */}
      <div className="p-4">
        {activeTab === 'manual' && (
          <div className="text-sm text-gray-600 dark:text-gray-400">
            <p>이 워크플로우는 수동으로만 트리거됩니다.</p>
            <p className="mt-1 text-xs text-gray-400">워크플로우 상세 페이지에서 "Run" 버튼을 클릭하세요.</p>
          </div>
        )}

        {activeTab === 'schedule' && (
          <div className="space-y-4">
            <CronBuilder value={cronExpression} onChange={setCronExpression} />
            <div>
              <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Timezone</label>
              <select
                value={timezone}
                onChange={e => setTimezone(e.target.value)}
                className="w-full px-2 py-1.5 text-sm border border-gray-200 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-200"
              >
                <option value="UTC">UTC</option>
                <option value="Asia/Seoul">Asia/Seoul (KST)</option>
                <option value="America/New_York">America/New_York (EST)</option>
                <option value="Europe/London">Europe/London (GMT)</option>
              </select>
            </div>
          </div>
        )}

        {activeTab === 'webhook' && (
          <div className="space-y-3">
            <div>
              <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Webhook URL</label>
              <div className="flex items-center gap-2">
                <input
                  value={webhookUrl || `${window.location.origin}/api/webhooks/{webhook_id}`}
                  readOnly
                  className="flex-1 px-2 py-1.5 text-xs border border-gray-200 dark:border-gray-600 rounded bg-gray-50 dark:bg-gray-700 text-gray-600 dark:text-gray-300"
                />
                <button
                  onClick={handleCopyWebhook}
                  className="p-1.5 hover:bg-gray-100 dark:hover:bg-gray-600 rounded"
                >
                  {copied ? <Check className="w-4 h-4 text-green-500" /> : <Copy className="w-4 h-4 text-gray-400" />}
                </button>
              </div>
            </div>
            <p className="text-xs text-gray-400">
              GitHub 리포지토리 Settings &gt; Webhooks에서 이 URL을 등록하세요.
            </p>
          </div>
        )}

        {(activeTab === 'push' || activeTab === 'pull_request') && (
          <div className="space-y-3">
            <div>
              <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
                Branches (glob 패턴)
              </label>
              <input
                value={branches.join(', ')}
                onChange={e => setBranches(e.target.value.split(',').map(s => s.trim()).filter(Boolean))}
                placeholder="main, release/*"
                className="w-full px-2 py-1.5 text-sm border border-gray-200 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-200"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
                Paths (선택, glob 패턴)
              </label>
              <input
                value={paths.join(', ')}
                onChange={e => setPaths(e.target.value.split(',').map(s => s.trim()).filter(Boolean))}
                placeholder="src/**, docs/**"
                className="w-full px-2 py-1.5 text-sm border border-gray-200 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-200"
              />
            </div>
          </div>
        )}

        {/* Save button */}
        <div className="mt-4 flex justify-end">
          <button
            onClick={handleSave}
            className="px-3 py-1.5 text-sm bg-primary-600 text-white rounded hover:bg-primary-700 transition-colors"
          >
            설정 저장
          </button>
        </div>
      </div>
    </div>
  )
}
