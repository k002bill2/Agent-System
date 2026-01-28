import { Users, FolderKanban, Activity, Coins, Zap, Calendar } from 'lucide-react'
import type { Organization, OrganizationStats as OrgStats } from '../../stores/organizations'

interface OrganizationStatsProps {
  organization: Organization
  stats: OrgStats | null
  isLoading: boolean
}

export function OrganizationStats({ organization, stats, isLoading }: OrganizationStatsProps) {
  const statItems = [
    {
      label: 'Members',
      value: stats?.total_members ?? organization.current_members,
      max: organization.max_members,
      icon: Users,
      color: 'text-blue-600 dark:text-blue-400 bg-blue-100 dark:bg-blue-900/30',
    },
    {
      label: 'Projects',
      value: stats?.total_projects ?? organization.current_projects,
      max: organization.max_projects,
      icon: FolderKanban,
      color: 'text-purple-600 dark:text-purple-400 bg-purple-100 dark:bg-purple-900/30',
    },
    {
      label: 'Sessions Today',
      value: stats?.sessions_today ?? 0,
      max: organization.max_sessions_per_day,
      icon: Activity,
      color: 'text-green-600 dark:text-green-400 bg-green-100 dark:bg-green-900/30',
    },
    {
      label: 'Tokens This Month',
      value: stats?.tokens_used_this_month ?? organization.tokens_used_this_month,
      max: organization.max_tokens_per_month,
      icon: Coins,
      color: 'text-amber-600 dark:text-amber-400 bg-amber-100 dark:bg-amber-900/30',
      format: 'number',
    },
  ]

  if (isLoading) {
    return (
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[1, 2, 3, 4].map((i) => (
          <div
            key={i}
            className="p-4 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg animate-pulse"
          >
            <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-20 mb-2" />
            <div className="h-8 bg-gray-200 dark:bg-gray-700 rounded w-16" />
          </div>
        ))}
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Usage Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {statItems.map((item) => {
          const Icon = item.icon
          const percentage =
            item.max === -1 ? 0 : Math.min((item.value / item.max) * 100, 100)
          const isUnlimited = item.max === -1

          return (
            <div
              key={item.label}
              className="p-4 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg"
            >
              <div className="flex items-center gap-2 mb-2">
                <div className={`p-1.5 rounded ${item.color}`}>
                  <Icon className="w-4 h-4" />
                </div>
                <span className="text-sm text-gray-600 dark:text-gray-400">{item.label}</span>
              </div>
              <div className="flex items-baseline gap-1">
                <span className="text-2xl font-bold text-gray-900 dark:text-white">
                  {item.format === 'number'
                    ? item.value.toLocaleString()
                    : item.value}
                </span>
                <span className="text-sm text-gray-500 dark:text-gray-400">
                  / {isUnlimited ? '∞' : item.max.toLocaleString()}
                </span>
              </div>
              {!isUnlimited && (
                <div className="mt-2 h-1.5 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all ${
                      percentage > 90
                        ? 'bg-red-500'
                        : percentage > 70
                        ? 'bg-amber-500'
                        : 'bg-primary-500'
                    }`}
                    style={{ width: `${percentage}%` }}
                  />
                </div>
              )}
            </div>
          )
        })}
      </div>

      {/* Additional Stats */}
      {stats && (
        <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
          <div className="p-4 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg">
            <div className="flex items-center gap-2 mb-2">
              <div className="p-1.5 rounded text-cyan-600 dark:text-cyan-400 bg-cyan-100 dark:bg-cyan-900/30">
                <Zap className="w-4 h-4" />
              </div>
              <span className="text-sm text-gray-600 dark:text-gray-400">API Calls Today</span>
            </div>
            <span className="text-2xl font-bold text-gray-900 dark:text-white">
              {stats.api_calls_today.toLocaleString()}
            </span>
          </div>

          <div className="p-4 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg">
            <div className="flex items-center gap-2 mb-2">
              <div className="p-1.5 rounded text-pink-600 dark:text-pink-400 bg-pink-100 dark:bg-pink-900/30">
                <Calendar className="w-4 h-4" />
              </div>
              <span className="text-sm text-gray-600 dark:text-gray-400">Sessions This Week</span>
            </div>
            <span className="text-2xl font-bold text-gray-900 dark:text-white">
              {stats.sessions_this_week.toLocaleString()}
            </span>
          </div>

          <div className="p-4 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg">
            <div className="flex items-center gap-2 mb-2">
              <div className="p-1.5 rounded text-emerald-600 dark:text-emerald-400 bg-emerald-100 dark:bg-emerald-900/30">
                <Coins className="w-4 h-4" />
              </div>
              <span className="text-sm text-gray-600 dark:text-gray-400">Cost This Month</span>
            </div>
            <span className="text-2xl font-bold text-gray-900 dark:text-white">
              ${stats.total_cost_this_month.toFixed(2)}
            </span>
          </div>
        </div>
      )}

      {/* Plan Info */}
      <div className="p-4 bg-gradient-to-r from-primary-50 to-accent/10 dark:from-primary-900/20 dark:to-accent/10 border border-primary-200 dark:border-primary-800 rounded-lg">
        <div className="flex items-center justify-between">
          <div>
            <h4 className="font-medium text-gray-900 dark:text-white">
              {organization.plan.charAt(0).toUpperCase() + organization.plan.slice(1)} Plan
            </h4>
            <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
              {organization.plan === 'free'
                ? 'Upgrade to unlock more features and higher limits'
                : organization.plan === 'enterprise'
                ? 'Unlimited access with priority support'
                : 'Your plan includes additional features and higher limits'}
            </p>
          </div>
          {organization.plan !== 'enterprise' && (
            <button className="px-4 py-2 text-sm font-medium text-primary-700 dark:text-primary-300 bg-white dark:bg-gray-800 border border-primary-300 dark:border-primary-700 rounded-lg hover:bg-primary-50 dark:hover:bg-primary-900/20 transition-colors">
              Upgrade Plan
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
