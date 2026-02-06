import { useEffect } from 'react'
import { Users, FolderKanban, Activity, Coins, AlertTriangle, CheckCircle, XCircle } from 'lucide-react'
import { useOrganizationsStore } from '../../stores/organizations'
import type { QuotaCheckResult } from '../../stores/organizations'

interface QuotaStatusPanelProps {
  organizationId: string
}

function QuotaBar({ label, icon: Icon, color, quota }: {
  label: string
  icon: React.ComponentType<{ className?: string }>
  color: string
  quota: QuotaCheckResult
}) {
  const isUnlimited = quota.limit < 0
  const percentage = isUnlimited ? 0 : Math.min((quota.current / quota.limit) * 100, 100)
  const isWarning = !isUnlimited && percentage > 70
  const isCritical = !isUnlimited && percentage > 90

  return (
    <div className="p-4 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <div className={`p-1.5 rounded ${color}`}>
            <Icon className="w-4 h-4" />
          </div>
          <span className="text-sm font-medium text-gray-700 dark:text-gray-300">{label}</span>
        </div>
        <div className="flex items-center gap-1">
          {quota.allowed ? (
            <CheckCircle className="w-4 h-4 text-green-500" />
          ) : (
            <XCircle className="w-4 h-4 text-red-500" />
          )}
        </div>
      </div>

      <div className="flex items-baseline gap-1 mb-2">
        <span className="text-2xl font-bold text-gray-900 dark:text-white">
          {quota.current.toLocaleString()}
        </span>
        <span className="text-sm text-gray-500 dark:text-gray-400">
          / {isUnlimited ? '∞' : quota.limit.toLocaleString()}
        </span>
      </div>

      {!isUnlimited && (
        <div className="h-2 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
          <div
            className={`h-full rounded-full transition-all duration-300 ${
              isCritical
                ? 'bg-red-500'
                : isWarning
                ? 'bg-amber-500'
                : 'bg-primary-500'
            }`}
            style={{ width: `${percentage}%` }}
          />
        </div>
      )}

      {isUnlimited && (
        <div className="text-xs text-gray-500 dark:text-gray-400">Unlimited (Enterprise)</div>
      )}

      {!quota.allowed && quota.message && (
        <div className="mt-2 flex items-center gap-1 text-xs text-red-600 dark:text-red-400">
          <AlertTriangle className="w-3 h-3" />
          <span>{quota.message}</span>
        </div>
      )}
    </div>
  )
}

export function QuotaStatusPanel({ organizationId }: QuotaStatusPanelProps) {
  const { quotaStatus, fetchQuotaStatus } = useOrganizationsStore()

  useEffect(() => {
    fetchQuotaStatus(organizationId)
  }, [organizationId, fetchQuotaStatus])

  if (!quotaStatus) {
    return (
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[1, 2, 3, 4].map((i) => (
          <div
            key={i}
            className="p-4 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg animate-pulse"
          >
            <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-20 mb-2" />
            <div className="h-8 bg-gray-200 dark:bg-gray-700 rounded w-16 mb-2" />
            <div className="h-2 bg-gray-200 dark:bg-gray-700 rounded" />
          </div>
        ))}
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-gray-900 dark:text-white uppercase tracking-wider">
          Quota Usage
        </h3>
        <span className="text-xs px-2 py-1 rounded-full bg-primary-100 dark:bg-primary-900/30 text-primary-700 dark:text-primary-300 font-medium">
          {quotaStatus.plan.charAt(0).toUpperCase() + quotaStatus.plan.slice(1)} Plan
        </span>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <QuotaBar
          label="Members"
          icon={Users}
          color="text-blue-600 dark:text-blue-400 bg-blue-100 dark:bg-blue-900/30"
          quota={quotaStatus.members}
        />
        <QuotaBar
          label="Projects"
          icon={FolderKanban}
          color="text-purple-600 dark:text-purple-400 bg-purple-100 dark:bg-purple-900/30"
          quota={quotaStatus.projects}
        />
        <QuotaBar
          label="Sessions / Day"
          icon={Activity}
          color="text-green-600 dark:text-green-400 bg-green-100 dark:bg-green-900/30"
          quota={quotaStatus.sessions}
        />
        <QuotaBar
          label="Tokens / Month"
          icon={Coins}
          color="text-amber-600 dark:text-amber-400 bg-amber-100 dark:bg-amber-900/30"
          quota={quotaStatus.tokens}
        />
      </div>
    </div>
  )
}
