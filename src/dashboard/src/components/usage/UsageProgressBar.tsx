import { cn } from '../../lib/utils'

interface UsageProgressBarProps {
  /** Label for the usage category */
  label: string
  /** Optional description or subtitle */
  description?: string
  /** Percentage used (0-100) */
  percentUsed: number
  /** Time until reset in hours */
  resetInHours: number
  /** Time until reset in minutes */
  resetInMinutes: number
  /** Optional tooltip content */
  tooltip?: string
  /** Show info icon with tooltip */
  showInfo?: boolean
}

export function UsageProgressBar({
  label,
  description,
  percentUsed,
  resetInHours,
  resetInMinutes,
  tooltip,
  showInfo = false,
}: UsageProgressBarProps) {
  // Format reset time
  const formatResetTime = () => {
    const hours = Math.floor(resetInHours)
    const mins = Math.floor(resetInMinutes)

    if (hours >= 24) {
      const days = Math.floor(hours / 24)
      const remainingHours = hours % 24
      return `${days}d ${remainingHours}h`
    }

    if (hours > 0) {
      return `${hours}h ${mins}m`
    }

    return `${mins}m`
  }

  // Determine color based on usage
  const getBarColor = () => {
    if (percentUsed >= 90) return 'bg-red-500'
    if (percentUsed >= 70) return 'bg-yellow-500'
    return 'bg-primary-500'
  }

  return (
    <div className="space-y-1.5">
      {/* Label row */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
            {label}
          </span>
          {showInfo && tooltip && (
            <div className="group relative">
              <svg
                className="w-3.5 h-3.5 text-gray-400 cursor-help"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                />
              </svg>
              <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-2 py-1 text-xs text-white bg-gray-800 rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap z-10">
                {tooltip}
              </div>
            </div>
          )}
        </div>
        {description && (
          <span className="text-xs text-gray-500 dark:text-gray-400">
            {description}
          </span>
        )}
      </div>

      {/* Progress bar row */}
      <div className="flex items-center gap-3">
        <span className="text-xs text-gray-500 dark:text-gray-400 whitespace-nowrap min-w-[80px]">
          {formatResetTime()} reset
        </span>

        {/* Progress bar */}
        <div className="flex-1 h-2 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
          <div
            className={cn('h-full rounded-full transition-all duration-300', getBarColor())}
            style={{ width: `${Math.min(100, percentUsed)}%` }}
          />
        </div>

        {/* Percentage */}
        <span className={cn(
          'text-sm font-medium min-w-[40px] text-right',
          percentUsed >= 90
            ? 'text-red-600 dark:text-red-400'
            : percentUsed >= 70
              ? 'text-yellow-600 dark:text-yellow-400'
              : 'text-gray-700 dark:text-gray-300'
        )}>
          {Math.round(percentUsed)}%
        </span>
      </div>
    </div>
  )
}
