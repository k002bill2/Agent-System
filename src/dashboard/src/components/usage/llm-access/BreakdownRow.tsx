import { cn } from '@/lib/utils'
import type { LLMUsageBreakdown } from '@/stores/llmUsage'

import { formatCompactNumber } from './utils'

export function BreakdownRow({
  label,
  value,
  active,
}: {
  label: string
  value: LLMUsageBreakdown
  active?: boolean
}) {
  return (
    <div className="flex items-center justify-between gap-3 py-2">
      <div className="flex items-center gap-2 min-w-0">
        <span
          className={cn(
            'h-2 w-2 rounded-full flex-shrink-0',
            active ? 'bg-emerald-500' : 'bg-gray-300 dark:bg-gray-600',
          )}
        />
        <span className="text-sm font-medium text-gray-700 dark:text-gray-300 truncate">
          {label}
        </span>
      </div>
      <div className="text-right flex-shrink-0">
        <p className="text-sm font-semibold text-gray-900 dark:text-white">
          {formatCompactNumber(value.total_tokens)}
        </p>
        <p className="text-xs text-gray-500 dark:text-gray-400">
          {value.total_requests.toLocaleString()} req
        </p>
      </div>
    </div>
  )
}
