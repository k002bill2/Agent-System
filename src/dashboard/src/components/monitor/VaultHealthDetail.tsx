import { memo } from 'react'
import {
  CheckCircle2,
  AlertTriangle,
  XCircle,
  FileText,
  Link2,
  ImageOff,
  Ghost,
  FileWarning,
} from 'lucide-react'
import { cn } from '../../lib/utils'
import { useMonitoringStore } from '../../stores/monitoring'
import type { VaultHealthResult, VaultHealthCheck } from '../../types/monitoring'

interface VaultHealthDetailProps {
  projectId: string
}

const STATUS_CONFIG = {
  healthy: {
    icon: CheckCircle2,
    color: 'text-green-500',
    bg: 'bg-green-50 dark:bg-green-900/20',
    border: 'border-green-200 dark:border-green-800',
    label: 'Healthy',
  },
  degraded: {
    icon: AlertTriangle,
    color: 'text-amber-500',
    bg: 'bg-amber-50 dark:bg-amber-900/20',
    border: 'border-amber-200 dark:border-amber-800',
    label: 'Degraded',
  },
  unhealthy: {
    icon: XCircle,
    color: 'text-red-500',
    bg: 'bg-red-50 dark:bg-red-900/20',
    border: 'border-red-200 dark:border-red-800',
    label: 'Unhealthy',
  },
} as const

const CHECK_ICONS: Record<string, React.FC<{ className?: string }>> = {
  links: Link2,
  frontmatter: FileWarning,
  orphans: Ghost,
  images: ImageOff,
}

function CheckStatusIcon({ status }: { status: VaultHealthCheck['status'] }) {
  switch (status) {
    case 'pass':
      return <CheckCircle2 className="w-3.5 h-3.5 text-green-500 flex-shrink-0" />
    case 'warn':
      return <AlertTriangle className="w-3.5 h-3.5 text-amber-500 flex-shrink-0" />
    case 'fail':
      return <XCircle className="w-3.5 h-3.5 text-red-500 flex-shrink-0" />
  }
}

function MetricCard({ label, value, warn }: { label: string; value: number; warn?: boolean }) {
  return (
    <div className={cn(
      'rounded-md border px-3 py-2',
      warn
        ? 'border-amber-200 dark:border-amber-800 bg-amber-50/50 dark:bg-amber-900/10'
        : 'border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50',
    )}>
      <div className={cn(
        'text-lg font-semibold',
        warn ? 'text-amber-600 dark:text-amber-400' : 'text-gray-900 dark:text-white',
      )}>
        {value.toLocaleString()}
      </div>
      <div className="text-xs text-gray-500 dark:text-gray-400">{label}</div>
    </div>
  )
}

function CheckSection({ check }: { check: VaultHealthCheck }) {
  const Icon = CHECK_ICONS[check.name] ?? FileText
  const hasDetails = check.details.length > 0

  return (
    <div className="border border-gray-200 dark:border-gray-700 rounded-md">
      <div className="flex items-center gap-2 px-3 py-2">
        <Icon className="w-4 h-4 text-gray-500 flex-shrink-0" />
        <CheckStatusIcon status={check.status} />
        <span className="text-sm font-medium text-gray-900 dark:text-white capitalize">
          {check.name}
        </span>
        <span className="text-xs text-gray-400">
          {check.count === 0 ? 'All clear' : `${check.count} issue${check.count > 1 ? 's' : ''}`}
        </span>
      </div>

      {hasDetails && (
        <div className="border-t border-gray-100 dark:border-gray-700 px-3 py-1.5 max-h-32 overflow-y-auto">
          {check.details.map((detail, i) => (
            <div
              key={i}
              className="text-xs text-gray-600 dark:text-gray-400 py-0.5 font-mono truncate"
            >
              {detail}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center h-full py-12 text-center">
      <FileText className="w-10 h-10 text-gray-300 dark:text-gray-600 mb-3" />
      <p className="text-sm text-gray-500 dark:text-gray-400">
        No vault health data yet.
      </p>
      <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">
        Run the Vault Health check to see results.
      </p>
    </div>
  )
}

export const VaultHealthDetail = memo(function VaultHealthDetail({
  projectId,
}: VaultHealthDetailProps) {
  const vaultHealth = useMonitoringStore((s) => s.getVaultHealth(projectId))

  if (!vaultHealth) {
    return <EmptyState />
  }

  return <VaultHealthContent data={vaultHealth} />
})

VaultHealthDetail.displayName = 'VaultHealthDetail'

function VaultHealthContent({ data }: { data: VaultHealthResult }) {
  const cfg = STATUS_CONFIG[data.status]
  const StatusIcon = cfg.icon

  return (
    <div className="h-full flex flex-col overflow-y-auto">
      {/* Overall status */}
      <div className={cn('flex items-center gap-2 px-4 py-3 rounded-t-lg border', cfg.bg, cfg.border)}>
        <StatusIcon className={cn('w-5 h-5', cfg.color)} />
        <span className={cn('text-sm font-semibold', cfg.color)}>{cfg.label}</span>
        <span className="text-xs text-gray-500 dark:text-gray-400 ml-auto">
          {new Date(data.timestamp).toLocaleString()}
        </span>
      </div>

      {/* Metrics grid */}
      <div className="grid grid-cols-3 gap-2 px-4 py-3">
        <MetricCard label="Total Notes" value={data.metrics.total_notes} />
        <MetricCard label="Total Links" value={data.metrics.total_links} />
        <MetricCard label="Broken Links" value={data.metrics.broken_links} warn={data.metrics.broken_links > 0} />
        <MetricCard label="Orphan Notes" value={data.metrics.orphan_notes} warn={data.metrics.orphan_notes > 0} />
        <MetricCard label="Missing Frontmatter" value={data.metrics.missing_frontmatter} warn={data.metrics.missing_frontmatter > 0} />
        <MetricCard label="Broken Images" value={data.metrics.broken_images} warn={data.metrics.broken_images > 0} />
      </div>

      {/* Check details */}
      <div className="px-4 pb-4 space-y-2">
        <h3 className="text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wide">
          Check Results
        </h3>
        {data.checks.map((check) => (
          <CheckSection key={check.name} check={check} />
        ))}
      </div>
    </div>
  )
}
