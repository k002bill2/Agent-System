import { memo, useMemo, useState } from 'react'
import {
  Activity,
  Calendar,
  Clock,
  Coins,
  Cpu,
  DollarSign,
  Shield,
  ShieldCheck,
  Eye,
  User,
  X,
} from 'lucide-react'
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { cn } from '../../lib/utils'
import type { MemberUsageDetail, MemberRole } from '../../stores/organizations'

// ─────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────

type DetailTab = 'overview' | 'trend' | 'models'

const ROLE_ICONS: Record<MemberRole, typeof Shield> = {
  owner: ShieldCheck,
  admin: Shield,
  member: User,
  viewer: Eye,
}

const ROLE_COLORS: Record<MemberRole, string> = {
  owner: 'text-amber-600 dark:text-amber-400 bg-amber-100 dark:bg-amber-900/30',
  admin: 'text-purple-600 dark:text-purple-400 bg-purple-100 dark:bg-purple-900/30',
  member: 'text-blue-600 dark:text-blue-400 bg-blue-100 dark:bg-blue-900/30',
  viewer: 'text-gray-600 dark:text-gray-400 bg-gray-100 dark:bg-gray-700',
}

const MODEL_COLORS = [
  'bg-primary-500',
  'bg-blue-500',
  'bg-emerald-500',
  'bg-amber-500',
  'bg-purple-500',
  'bg-rose-500',
  'bg-cyan-500',
  'bg-orange-500',
]

const TAB_ITEMS: { key: DetailTab; label: string }[] = [
  { key: 'overview', label: 'Overview' },
  { key: 'trend', label: 'Usage Trend' },
  { key: 'models', label: 'Model Breakdown' },
]

// ─────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────

function formatDate(dateStr: string | null): string {
  if (!dateStr) return '-'
  return new Date(dateStr).toLocaleDateString('ko-KR', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  })
}

function formatShortDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('ko-KR', {
    month: 'short',
    day: 'numeric',
  })
}

function formatTokens(value: number): string {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`
  if (value >= 1_000) return `${(value / 1_000).toFixed(1)}K`
  return value.toLocaleString()
}

// ─────────────────────────────────────────────────────────────
// Sub-components
// ─────────────────────────────────────────────────────────────

function StatCard({
  icon: Icon,
  label,
  value,
  color,
}: {
  icon: typeof Coins
  label: string
  value: string
  color: string
}) {
  return (
    <div className="flex items-center gap-2 p-3 bg-gray-50 dark:bg-gray-800/50 rounded-lg">
      <Icon className={cn('w-4 h-4', color)} />
      <div>
        <p className="text-xs text-gray-500 dark:text-gray-400">{label}</p>
        <p className="text-sm font-semibold text-gray-900 dark:text-white">{value}</p>
      </div>
    </div>
  )
}

function OverviewTab({ detail }: { detail: MemberUsageDetail }) {
  const RoleIcon = ROLE_ICONS[detail.role]

  return (
    <div className="space-y-4">
      {/* Stats grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard
          icon={Coins}
          label="Tokens Today"
          value={formatTokens(detail.tokens_used_today)}
          color="text-amber-500"
        />
        <StatCard
          icon={Activity}
          label="Tokens This Month"
          value={formatTokens(detail.tokens_used_this_month)}
          color="text-blue-500"
        />
        <StatCard
          icon={Clock}
          label="Sessions This Month"
          value={detail.sessions_this_month.toLocaleString()}
          color="text-green-500"
        />
        <StatCard
          icon={DollarSign}
          label="Est. Cost"
          value={`$${detail.total_cost_usd.toFixed(4)}`}
          color="text-rose-500"
        />
      </div>

      {/* Metadata grid */}
      <div className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm">
        <div className="flex items-center justify-between py-1.5 border-b border-gray-100 dark:border-gray-700">
          <span className="text-gray-500 dark:text-gray-400">Role</span>
          <span
            className={cn(
              'flex items-center gap-1 px-2 py-0.5 text-xs font-medium rounded-full',
              ROLE_COLORS[detail.role]
            )}
          >
            <RoleIcon className="w-3 h-3" />
            {detail.role.charAt(0).toUpperCase() + detail.role.slice(1)}
          </span>
        </div>
        <div className="flex items-center justify-between py-1.5 border-b border-gray-100 dark:border-gray-700">
          <span className="text-gray-500 dark:text-gray-400">Org Share</span>
          <span className="text-gray-900 dark:text-white font-medium">
            {detail.percentage_of_org}%
          </span>
        </div>
        <div className="flex items-center justify-between py-1.5 border-b border-gray-100 dark:border-gray-700">
          <span className="text-gray-500 dark:text-gray-400">Joined</span>
          <span className="text-gray-900 dark:text-white">{formatDate(detail.joined_at)}</span>
        </div>
        <div className="flex items-center justify-between py-1.5 border-b border-gray-100 dark:border-gray-700">
          <span className="text-gray-500 dark:text-gray-400">Last Active</span>
          <span className="text-gray-900 dark:text-white">
            {formatDate(detail.last_active_at)}
          </span>
        </div>
        {detail.invited_by && (
          <div className="flex items-center justify-between py-1.5 border-b border-gray-100 dark:border-gray-700">
            <span className="text-gray-500 dark:text-gray-400">Invited By</span>
            <span className="text-gray-900 dark:text-white">{detail.invited_by}</span>
          </div>
        )}
        {detail.permissions.length > 0 && (
          <div className="flex items-center justify-between py-1.5 border-b border-gray-100 dark:border-gray-700">
            <span className="text-gray-500 dark:text-gray-400">Permissions</span>
            <span className="text-gray-900 dark:text-white">
              {detail.permissions.length} custom
            </span>
          </div>
        )}
      </div>
    </div>
  )
}

function UsageTrendTab({ detail }: { detail: MemberUsageDetail }) {
  const chartData = useMemo(
    () => detail.daily_usage.map((d) => ({ ...d, dateLabel: formatShortDate(d.date) })),
    [detail.daily_usage]
  )

  if (chartData.length === 0) {
    return (
      <div className="h-48 flex items-center justify-center text-gray-400 dark:text-gray-500 text-sm">
        <Calendar className="w-5 h-5 mr-2 opacity-50" />
        No usage data for this period
      </div>
    )
  }

  return (
    <ResponsiveContainer width="100%" height={200}>
      <AreaChart data={chartData} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
        <defs>
          <linearGradient id="grad-tokens" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="#6366f1" stopOpacity={0.25} />
            <stop offset="95%" stopColor="#6366f1" stopOpacity={0.02} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
        <XAxis
          dataKey="dateLabel"
          tick={{ fontSize: 10, fill: '#9ca3af' }}
          axisLine={false}
          tickLine={false}
        />
        <YAxis
          tick={{ fontSize: 10, fill: '#9ca3af' }}
          axisLine={false}
          tickLine={false}
          tickFormatter={formatTokens}
          width={50}
        />
        <Tooltip
          formatter={(value: number | undefined) => [formatTokens(value ?? 0), 'Tokens']}
          labelFormatter={(label) => String(label)}
          contentStyle={{
            fontSize: 12,
            borderRadius: 8,
            border: '1px solid #e5e7eb',
          }}
        />
        <Area
          type="monotone"
          dataKey="tokens"
          stroke="#6366f1"
          fill="url(#grad-tokens)"
          strokeWidth={2}
          dot={false}
          activeDot={{ r: 4 }}
        />
      </AreaChart>
    </ResponsiveContainer>
  )
}

function ModelBreakdownTab({ detail }: { detail: MemberUsageDetail }) {
  if (detail.model_usage.length === 0) {
    return (
      <div className="h-32 flex items-center justify-center text-gray-400 dark:text-gray-500 text-sm">
        <Cpu className="w-5 h-5 mr-2 opacity-50" />
        No model usage data
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {detail.model_usage.map((model, idx) => (
        <div key={model.model} className="space-y-1">
          <div className="flex items-center justify-between text-sm">
            <span className="text-gray-700 dark:text-gray-300 font-medium truncate">
              {model.model}
            </span>
            <div className="flex items-center gap-3 flex-shrink-0 ml-2">
              <span className="text-xs text-gray-500 dark:text-gray-400">
                {model.sessions} sessions
              </span>
              <span className="text-sm font-semibold text-gray-900 dark:text-white">
                {formatTokens(model.tokens)}
              </span>
            </div>
          </div>
          <div className="h-2 bg-gray-100 dark:bg-gray-700 rounded-full overflow-hidden">
            <div
              className={cn(
                'h-full rounded-full transition-all duration-500',
                MODEL_COLORS[idx % MODEL_COLORS.length]
              )}
              style={{ width: `${model.percentage}%` }}
            />
          </div>
          <p className="text-xs text-gray-400 dark:text-gray-500 text-right">
            {model.percentage}%
          </p>
        </div>
      ))}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────
// Loading Skeleton
// ─────────────────────────────────────────────────────────────

function DetailSkeleton() {
  return (
    <div className="space-y-4 p-4 animate-pulse">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-full bg-gray-200 dark:bg-gray-700" />
        <div className="space-y-2">
          <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-32" />
          <div className="h-3 bg-gray-200 dark:bg-gray-700 rounded w-48" />
        </div>
      </div>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="h-14 bg-gray-100 dark:bg-gray-700/50 rounded-lg" />
        ))}
      </div>
      <div className="h-32 bg-gray-100 dark:bg-gray-700/50 rounded-lg" />
    </div>
  )
}

// ─────────────────────────────────────────────────────────────
// Main Component
// ─────────────────────────────────────────────────────────────

interface MemberDetailPanelProps {
  detail: MemberUsageDetail | null
  isLoading: boolean
  onClose: () => void
}

const MemberDetailPanel = memo(function MemberDetailPanel({
  detail,
  isLoading,
  onClose,
}: MemberDetailPanelProps) {
  const [activeTab, setActiveTab] = useState<DetailTab>('overview')

  if (isLoading || !detail) {
    return (
      <div className="mt-2 border border-primary-200 dark:border-primary-800 rounded-lg bg-white dark:bg-gray-800 overflow-hidden">
        <DetailSkeleton />
      </div>
    )
  }

  return (
    <div
      className="mt-2 border border-primary-200 dark:border-primary-800 rounded-lg bg-white dark:bg-gray-800 overflow-hidden"
      role="region"
      aria-label={`${detail.name || detail.email} detail panel`}
    >
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-gray-100 dark:border-gray-700">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-primary-100 dark:bg-primary-900/30 flex items-center justify-center">
            <span className="text-sm font-semibold text-primary-700 dark:text-primary-300">
              {(detail.name || detail.email).charAt(0).toUpperCase()}
            </span>
          </div>
          <div>
            <h4 className="font-medium text-gray-900 dark:text-white">
              {detail.name || detail.email}
            </h4>
            <p className="text-xs text-gray-500 dark:text-gray-400">{detail.email}</p>
          </div>
        </div>
        <button
          onClick={onClose}
          className="p-1.5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 rounded hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
          aria-label="Close detail panel"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Tab selector */}
      <div className="flex border-b border-gray-100 dark:border-gray-700 px-4" role="tablist">
        {TAB_ITEMS.map((tab) => (
          <button
            key={tab.key}
            role="tab"
            aria-selected={activeTab === tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={cn(
              'px-3 py-2 text-xs font-medium border-b-2 transition-colors -mb-px',
              activeTab === tab.key
                ? 'border-primary-500 text-primary-600 dark:text-primary-400'
                : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
            )}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div className="p-4">
        {activeTab === 'overview' && <OverviewTab detail={detail} />}
        {activeTab === 'trend' && <UsageTrendTab detail={detail} />}
        {activeTab === 'models' && <ModelBreakdownTab detail={detail} />}
      </div>
    </div>
  )
})

MemberDetailPanel.displayName = 'MemberDetailPanel'

export { MemberDetailPanel }
