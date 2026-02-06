import { useEffect, useState } from 'react'
import { BarChart3, Coins, Activity, Clock, TrendingUp } from 'lucide-react'
import { useOrganizationsStore } from '../../stores/organizations'
import type { MemberUsageSummary } from '../../stores/organizations'
import { cn } from '../../lib/utils'

interface MemberUsagePanelProps {
  organizationId: string
}

const periodLabels: Record<string, string> = {
  day: 'Today',
  week: 'This Week',
  month: 'This Month',
}

function UsageBar({ member, maxTokens }: { member: MemberUsageSummary; maxTokens: number }) {
  const barWidth = maxTokens > 0
    ? Math.max((member.tokens_used_this_month / maxTokens) * 100, 2)
    : 0

  return (
    <div className="flex items-center gap-4 p-3 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg hover:border-primary-300 dark:hover:border-primary-600 transition-colors">
      {/* Avatar */}
      <div className="w-9 h-9 rounded-full bg-gray-200 dark:bg-gray-700 flex items-center justify-center flex-shrink-0">
        <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
          {(member.name || member.email).charAt(0).toUpperCase()}
        </span>
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between mb-1">
          <div className="flex items-center gap-2 min-w-0">
            <span className="text-sm font-medium text-gray-900 dark:text-white truncate">
              {member.name || member.email}
            </span>
            <span className="text-xs text-gray-400 dark:text-gray-500 capitalize flex-shrink-0">
              {member.role}
            </span>
          </div>
          <div className="flex items-center gap-3 flex-shrink-0 ml-2">
            <div className="flex items-center gap-1 text-xs text-gray-500 dark:text-gray-400" title="Sessions this month">
              <Activity className="w-3 h-3" />
              <span>{member.sessions_this_month}</span>
            </div>
            <span className="text-sm font-semibold text-gray-900 dark:text-white">
              {member.tokens_used_this_month.toLocaleString()}
              <span className="text-xs font-normal text-gray-400 ml-1">tokens</span>
            </span>
          </div>
        </div>

        {/* Progress bar */}
        <div className="flex items-center gap-2">
          <div className="flex-1 h-1.5 bg-gray-100 dark:bg-gray-700 rounded-full overflow-hidden">
            <div
              className={cn(
                'h-full rounded-full transition-all duration-500',
                member.percentage_of_org > 50
                  ? 'bg-primary-500'
                  : member.percentage_of_org > 25
                  ? 'bg-blue-500'
                  : 'bg-emerald-500'
              )}
              style={{ width: `${barWidth}%` }}
            />
          </div>
          <span className="text-xs text-gray-400 dark:text-gray-500 w-10 text-right">
            {member.percentage_of_org}%
          </span>
        </div>
      </div>
    </div>
  )
}

export function MemberUsagePanel({ organizationId }: MemberUsagePanelProps) {
  const { memberUsage, fetchMemberUsage } = useOrganizationsStore()
  const [period, setPeriod] = useState<string>('month')

  useEffect(() => {
    fetchMemberUsage(organizationId, period)
  }, [organizationId, period, fetchMemberUsage])

  if (!memberUsage) {
    return (
      <div className="space-y-3">
        <div className="h-6 bg-gray-200 dark:bg-gray-700 rounded w-40 animate-pulse" />
        {[1, 2, 3].map((i) => (
          <div
            key={i}
            className="h-16 bg-gray-100 dark:bg-gray-700/50 rounded-lg animate-pulse"
          />
        ))}
      </div>
    )
  }

  const maxTokens = Math.max(
    ...memberUsage.members.map((m) => m.tokens_used_this_month),
    1
  )

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <BarChart3 className="w-4 h-4 text-gray-500 dark:text-gray-400" />
          <h3 className="text-sm font-semibold text-gray-900 dark:text-white uppercase tracking-wider">
            Member Usage
          </h3>
        </div>

        {/* Period selector */}
        <div className="flex items-center gap-1 bg-gray-100 dark:bg-gray-700 rounded-lg p-0.5">
          {['day', 'week', 'month'].map((p) => (
            <button
              key={p}
              onClick={() => setPeriod(p)}
              className={cn(
                'px-2.5 py-1 text-xs font-medium rounded-md transition-colors',
                period === p
                  ? 'bg-white dark:bg-gray-600 text-gray-900 dark:text-white shadow-sm'
                  : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
              )}
            >
              {periodLabels[p]}
            </button>
          ))}
        </div>
      </div>

      {/* Summary stats */}
      <div className="grid grid-cols-3 gap-3">
        <div className="flex items-center gap-2 p-3 bg-gray-50 dark:bg-gray-800/50 rounded-lg">
          <Coins className="w-4 h-4 text-amber-500" />
          <div>
            <p className="text-xs text-gray-500 dark:text-gray-400">Total Tokens</p>
            <p className="text-sm font-semibold text-gray-900 dark:text-white">
              {memberUsage.total_tokens.toLocaleString()}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 p-3 bg-gray-50 dark:bg-gray-800/50 rounded-lg">
          <TrendingUp className="w-4 h-4 text-blue-500" />
          <div>
            <p className="text-xs text-gray-500 dark:text-gray-400">Active Members</p>
            <p className="text-sm font-semibold text-gray-900 dark:text-white">
              {memberUsage.members.filter((m) => m.tokens_used_this_month > 0).length}
              <span className="text-xs font-normal text-gray-400 ml-0.5">
                / {memberUsage.members.length}
              </span>
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 p-3 bg-gray-50 dark:bg-gray-800/50 rounded-lg">
          <Clock className="w-4 h-4 text-green-500" />
          <div>
            <p className="text-xs text-gray-500 dark:text-gray-400">Tokens Today</p>
            <p className="text-sm font-semibold text-gray-900 dark:text-white">
              {memberUsage.members
                .reduce((sum, m) => sum + m.tokens_used_today, 0)
                .toLocaleString()}
            </p>
          </div>
        </div>
      </div>

      {/* Member usage list */}
      {memberUsage.members.length === 0 ? (
        <div className="text-center py-6 text-gray-500 dark:text-gray-400">
          <BarChart3 className="w-10 h-10 mx-auto mb-2 opacity-50" />
          <p className="text-sm">No usage data yet</p>
        </div>
      ) : (
        <div className="space-y-2">
          {memberUsage.members.map((member) => (
            <UsageBar key={member.user_id} member={member} maxTokens={maxTokens} />
          ))}
        </div>
      )}
    </div>
  )
}
