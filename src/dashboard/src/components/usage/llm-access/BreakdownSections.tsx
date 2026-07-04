import type {
  LLMUsageBreakdown,
  LLMUsageSummary,
} from '@/stores/llmUsage'

import { BreakdownRow } from './BreakdownRow'
import { getBreakdown, MODE_ORDER } from './utils'

export function ModeBreakdown({
  summary,
  cliRequests,
}: {
  summary: LLMUsageSummary | null
  cliRequests: number
}) {
  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <p className="text-xs font-medium uppercase text-gray-500 dark:text-gray-400">
          Mode
        </p>
        <p className="text-xs text-gray-500 dark:text-gray-400">
          {cliRequests.toLocaleString()} CLI req
        </p>
      </div>
      <div className="divide-y divide-gray-100 dark:divide-gray-700">
        {MODE_ORDER.map(mode => {
          const value = getBreakdown(summary, mode)
          return (
            <BreakdownRow
              key={mode}
              label={mode}
              value={value}
              active={mode === 'cli' && value.total_requests > 0}
            />
          )
        })}
      </div>
    </div>
  )
}

export function SourceBreakdown({
  entries,
}: {
  entries: Array<[string, LLMUsageBreakdown]>
}) {
  return (
    <div>
      <p className="text-xs font-medium uppercase text-gray-500 dark:text-gray-400 mb-1">
        Source
      </p>
      {entries.length > 0 ? (
        <div className="divide-y divide-gray-100 dark:divide-gray-700">
          {entries.map(([source, value]) => (
            <BreakdownRow
              key={source}
              label={source}
              value={value}
              active={value.total_requests > 0}
            />
          ))}
        </div>
      ) : (
        <p className="py-4 text-sm text-gray-500 dark:text-gray-400">
          No internal usage yet
        </p>
      )}
    </div>
  )
}
