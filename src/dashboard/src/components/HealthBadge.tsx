import { memo } from 'react'

import { cn } from '@/lib/utils'
import { formatUptime } from '@/lib/formatUptime'
import { useBackendHealth } from '@/hooks/useBackendHealth'
import type { HealthUiState } from '@/services/health'

interface StateStyle {
  /** Human-readable status label. */
  label: string
  /** Leading status dot color. */
  dot: string
  /** Pill container colors (light + dark). */
  pill: string
}

const STATE_STYLES: Record<HealthUiState, StateStyle> = {
  healthy: {
    label: 'Healthy',
    dot: 'bg-green-500',
    pill: 'bg-green-100 text-green-700 border-green-200 dark:bg-green-900/30 dark:text-green-400 dark:border-green-800',
  },
  degraded: {
    label: 'Degraded',
    dot: 'bg-amber-500',
    pill: 'bg-amber-100 text-amber-700 border-amber-200 dark:bg-amber-900/30 dark:text-amber-400 dark:border-amber-800',
  },
  unhealthy: {
    label: 'Unhealthy',
    dot: 'bg-red-500',
    pill: 'bg-red-100 text-red-700 border-red-200 dark:bg-red-900/30 dark:text-red-400 dark:border-red-800',
  },
  offline: {
    label: 'Offline',
    dot: 'bg-gray-400',
    pill: 'bg-gray-100 text-gray-500 border-gray-200 dark:bg-gray-700 dark:text-gray-400 dark:border-gray-600',
  },
  checking: {
    label: 'Checking…',
    dot: 'bg-gray-300 dark:bg-gray-500',
    pill: 'bg-gray-100 text-gray-400 border-gray-200 animate-pulse dark:bg-gray-700 dark:text-gray-500 dark:border-gray-600',
  },
}

/**
 * Compact backend-health pill for the dashboard header. Polls `GET /api/health`
 * every 30s and renders a color-coded status with version suffix and a native
 * tooltip carrying status / version / uptime / last-checked details.
 */
export const HealthBadge = memo(function HealthBadge() {
  const { state, version, uptimeSeconds, checkedAt } = useBackendHealth()
  const style = STATE_STYLES[state]
  const uptime = formatUptime(uptimeSeconds)
  const lastChecked = checkedAt > 0 ? new Date(checkedAt).toLocaleTimeString() : '—'

  const tooltip = [
    `Status: ${style.label}`,
    `Version: ${version ?? '—'}`,
    `Uptime: ${uptime}`,
    `Last checked: ${lastChecked}`,
  ].join('\n')

  return (
    <div
      role="status"
      aria-live="polite"
      aria-label={`Backend health: ${style.label}`}
      title={tooltip}
      className={cn(
        'flex items-center gap-1.5 px-2 py-1 rounded-md border text-xs font-medium',
        style.pill,
      )}
    >
      <span className={cn('w-2 h-2 rounded-full', style.dot)} aria-hidden="true" />
      <span>{style.label}</span>
      {version && <span className="text-gray-400 dark:text-gray-500">v{version}</span>}
    </div>
  )
})

HealthBadge.displayName = 'HealthBadge'
